import { useEffect, useMemo, useRef, useState, useDeferredValue } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Copy,
  Eye,
  EyeOff,
  Globe,
  Plus,
  Trash2,
  Pencil,
  Upload,
  Download,
  Search,
  CheckCheck,
  LogIn,
  MousePointerClick,
  Loader2,
} from "lucide-react"

/* =========================================================
   Types & storage
========================================================= */

type Account = {
  id: string
  host: string
  title?: string
  username: string
  password: string
  note?: string
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = "pw.accounts.v1"
const chromeApi = (globalThis as any)?.chrome

const storage = {
  async getAll(): Promise<Account[]> {
    try {
      if (chromeApi?.storage?.local) {
        const obj = await chromeApi.storage.local.get(STORAGE_KEY)
        return (obj?.[STORAGE_KEY] as Account[] | undefined) ?? []
      }
    } catch { }
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Account[]) : []
  },
  async setAll(items: Account[]) {
    try {
      if (chromeApi?.storage?.local) {
        await chromeApi.storage.local.set({ [STORAGE_KEY]: items })
        return
      }
    } catch { }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  },
}

async function getActiveHost(): Promise<string | null> {
  try {
    if (!chromeApi?.tabs?.query) return null
    const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true })
    const url = tab?.url
    if (!url) return null
    return new URL(url).host
  } catch {
    return null
  }
}

function genPassword(opts?: { length?: number; upper?: boolean; lower?: boolean; digits?: boolean; symbols?: boolean }) {
  const { length = 16, upper = true, lower = true, digits = true, symbols = true } = opts ?? {}
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const L = "abcdefghijkmnopqrstuvwxyz"
  const D = "23456789"
  const S = "!@#$%^&*()-_=+[]{};:,.?"
  let alphabet = ""
  if (upper) alphabet += U
  if (lower) alphabet += L
  if (digits) alphabet += D
  if (symbols) alphabet += S
  const arr = new Uint32Array(length)
  crypto.getRandomValues(arr)
  return Array.from(arr, (n) => alphabet[n % alphabet.length]).join("")
}

function scorePassword(pw: string) {
  let score = 0
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (pw.length >= 20) score++
  return score // 0..5
}

function StrengthBadge({ pw }: { pw: string }) {
  const s = scorePassword(pw)
  const labels = ["とても弱い", "弱い", "普通", "強い", "とても強い", "最強"]
  const intents: Record<number, string> = {
    0: "bg-destructive/15 text-destructive",
    1: "bg-destructive/15 text-destructive",
    2: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
    3: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    4: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    5: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  }
  return <Badge className={`${intents[s]} border-0`}>{labels[s]}</Badge>
}

/* =========================================================
   AccountManager
========================================================= */

type Tone = "success" | "error" | "info"

export default function AccountManager() {
  const [items, setItems] = useState<Account[]>([])
  const [host, setHost] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const searchQ = useDeferredValue(search) // 入力中の無駄な再計算を軽減
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copyTimerRef = useRef<number | null>(null)

  const [status, setStatus] = useState<{ text: string; tone: Tone } | null>(null)
  const statusTimerRef = useRef<number | null>(null)

  // フィル中インジケータ（ボタン連打防止 & UX向上）
  const [fillingId, setFillingId] = useState<string | null>(null)

  useEffect(() => {
    ; (async () => {
      setHost(await getActiveHost())
      setItems(await storage.getAll())
    })()
    return () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
    }
  }, [])

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) =>
      [it.host, it.username, it.title ?? "", it.note ?? ""].some((v) => v.toLowerCase().includes(q))
    )
  }, [items, searchQ])

  const byHost = useMemo(() => {
    const map = new Map<string, Account[]>()
    for (const it of filtered) {
      const key = it.host
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    for (const arr of map.values()) arr.sort((a, b) => b.updatedAt - a.updatedAt)
    const entries = Array.from(map.entries())
    entries.sort((a, b) => {
      const h = host ?? ""
      const aKey = a[0].replace(/^\./, "")
      const bKey = b[0].replace(/^\./, "")
      if (h && aKey === h) return -1
      if (h && bKey === h) return 1
      return aKey.localeCompare(bKey)
    })
    return entries
  }, [filtered, host])

  const showStatus = (text: string, tone: Tone = "info") => {
    setStatus({ text, tone })
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
    statusTimerRef.current = window.setTimeout(() => setStatus(null), 1600)
  }

  const persist = async (next: Account[], msg?: string, tone: Tone = "success") => {
    setItems(next)
    await storage.setAll(next)
    if (msg) showStatus(msg, tone)
  }

  const addAccount = async (payload: Omit<Account, "id" | "createdAt" | "updatedAt">) => {
    const now = Date.now()
    const acc: Account = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...payload }
    await persist([acc, ...items], "保存しました")
    setAddOpen(false)
  }

  const updateAccount = async (patch: Account) => {
    const next = items.map((it) => (it.id === patch.id ? { ...patch, updatedAt: Date.now() } : it))
    await persist(next, "更新しました")
    setEditing(null)
  }

  const deleteAccount = async (id: string) => {
    const next = items.filter((it) => it.id !== id)
    await persist(next, "削除しました", "info")
  }

  const copyWithKey = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 1200)
      showStatus("コピーしました", "success")
    } catch {
      showStatus("コピーに失敗", "error")
    }
  }

  // ====== フィル & 送信（wait を設ける） ======
  const handleFill = async (id: string, username: string, password: string, doSubmit: boolean) => {
    setFillingId(id)
    try {
      await fillAccountOnPage(username, password, doSubmit)
    } finally {
      // 軽く待ってから解除（連打誤作動防止）
      setTimeout(() => setFillingId(null), 200)
    }
  }

  const fillAccountOnPage = async (username: string, password: string, doSubmit: boolean) => {
    try {
      if (!chromeApi?.tabs?.query || !chromeApi?.scripting?.executeScript) {
        showStatus("自動入力に未対応", "error")
        return
      }
      const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) {
        showStatus("タブが見つかりません", "error")
        return
      }

      const waitMs = 250 // 入力反映→送信の間に待機
      const [{ result }] = await chromeApi.scripting.executeScript({
        target: { tabId: tab.id },
        args: [username, password, doSubmit, waitMs],
        func: async (u: string, p: string, submit: boolean, wait: number) => {
          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

          const isVisible = (el: HTMLElement) => {
            const style = window.getComputedStyle(el)
            const rect = el.getBoundingClientRect()
            return style.visibility !== "hidden" && style.display !== "none" && !el.hasAttribute("disabled") && rect.width > 0 && rect.height > 0
          }
          const pick = (sel: string): HTMLInputElement | null => {
            const nodes = Array.from(document.querySelectorAll<HTMLInputElement>(sel)).filter(isVisible)
            const weight = (n: HTMLInputElement) => {
              const s = `${n.name} ${n.id} ${n.autocomplete}`.toLowerCase()
              let w = 0
              if (s.includes("user")) w += 2
              if (s.includes("email")) w += 2
              if (s.includes("login")) w += 1
              if (s.includes("name")) w += 1
              if (n.type === "email" || n.type === "text") w += 1
              return w
            }
            nodes.sort((a, b) => weight(b) - weight(a))
            return nodes[0] ?? null
          }
          const userInput =
            pick('input[autocomplete="username"],input[type="email"],input[type="text"],input[name*="user" i],input[id*="user" i],input[name*="login" i],input[id*="login" i],input[name*="email" i],input[id*="email" i]') || null
          const passInput =
            (document.querySelector('input[type="password"]') as HTMLInputElement | null) ||
            (document.querySelector('input[name*="pass" i]') as HTMLInputElement | null) ||
            null

          let filledUser = false
          let filledPass = false
          const setVal = (el: HTMLInputElement, val: string) => {
            const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")
            desc?.set?.call(el, val)
            el.dispatchEvent(new Event("input", { bubbles: true }))
            el.dispatchEvent(new Event("change", { bubbles: true }))
            el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }))
          }
          if (userInput) {
            setVal(userInput, u)
            userInput.focus()
            filledUser = true
          }
          if (passInput) {
            setVal(passInput, p)
            filledPass = true
          }

          // 入力反映待ち
          await sleep(wait)

          let submitted = false
          if (submit) {
            const targetForm = passInput?.form || userInput?.form || document.querySelector("form")
            if (targetForm) {
              // 追加の待ちを入れて UI/validator を待機
              await sleep(wait)
              // @ts-ignore
              if (typeof targetForm.requestSubmit === "function") {
                // @ts-ignore
                targetForm.requestSubmit()
                submitted = true
              } else {
                targetForm.submit()
                submitted = true
              }
            } else {
              const btn =
                (document.querySelector('button[type="submit"]') as HTMLButtonElement | null) ||
                (document.querySelector('input[type="submit"]') as HTMLInputElement | null)
              if (btn) {
                await sleep(wait)
                  ; (btn as HTMLElement).click()
                submitted = true
              }
            }
          }
          return { filledUser, filledPass, submitted }
        },
      })

      if (result?.filledUser || result?.filledPass) {
        showStatus(result.submitted ? "入力して送信しました" : "入力しました", "success")
      } else {
        showStatus("入力対象が見つかりません", "error")
      }
    } catch {
      showStatus("自動入力に失敗", "error")
    }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `password-accounts-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (file: File) => {
    const text = await file.text()
    try {
      const parsed = JSON.parse(text) as Account[]
      const cleaned = parsed
        .filter((x) => x.host && x.username && x.password)
        .map((x) => ({
          ...x,
          id: x.id ?? crypto.randomUUID(),
          createdAt: Number(x.createdAt ?? Date.now()),
          updatedAt: Number(x.updatedAt ?? Date.now()),
        }))
      await persist(cleaned, "インポート完了", "success")
    } catch {
      showStatus("インポート失敗", "error")
    }
  }

  const fileRef = useRef<HTMLInputElement | null>(null)

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">アカウントマネージャ</CardTitle>
      </CardHeader>

      <CardContent className="relative grid gap-4 pb-12 overflow-x-hidden">
        {/* Host 行（ラベル固定＋値可変） */}
        <div className="rounded-xl border p-3 bg-muted/30">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-sm min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <Globe className="h-4 w-4" />
              <span className="text-muted-foreground">Host:</span>
            </div>
            <span className="truncate" title={host ?? ""}>{host ?? "現在のサイトを取得できませんでした"}</span>
            {host && <Badge variant="secondary" className="justify-self-end shrink-0">このサイト</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            ホスト単位で管理。長い値は入力欄で水平スクロールできます。
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-3">
          <div className="relative min-w-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="検索（ホスト / ユーザ名 / メモ）"
              className="pl-8"
            />
          </div>

          <div className="grid grid-cols-[auto_auto_1fr] gap-2 items-center">
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="shrink-0">
                  <Plus className="h-4 w-4 mr-1" />
                  新規追加
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[360px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>アカウントを追加</DialogTitle>
                </DialogHeader>
                <AddOrEditForm
                  initial={{ host: host ?? "", title: "", username: "", password: genPassword(), note: "" }}
                  onSubmit={async (vals) =>
                    addAccount({
                      host: vals.host.trim(),
                      title: vals.title?.trim() || undefined,
                      username: vals.username.trim(),
                      password: vals.password,
                      note: vals.note?.trim() || undefined,
                    })
                  }
                />
              </DialogContent>
            </Dialog>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0" title="エクスポート/インポート">
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>ユーティリティ</DropdownMenuLabel>
                <DropdownMenuItem onClick={exportJson}>
                  <Download className="h-4 w-4 mr-2" />
                  エクスポート（JSON）
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  インポート（JSON）
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => persist([], "全削除", "info")}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  全削除（不可逆）
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="justify-self-end" />
          </div>
        </div>

        <Separator />

        {/* List */}
        {byHost.length === 0 ? (
          <div className="text-sm text-muted-foreground">まだ登録がありません。「新規追加」から作成してください。</div>
        ) : (
          <Accordion type="multiple" defaultValue={host ? [host] : undefined} className="w-full min-w-0">
            {byHost.map(([h, accs]) => (
              <AccordionItem key={h} value={h}>
                <AccordionTrigger className="text-left">
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 w-full min-w-0">
                    <Globe className="h-4 w-4 shrink-0" />
                    <span className="font-medium truncate" title={h}>{h}</span>
                    <Badge variant="secondary" className="justify-self-end shrink-0">{accs.length}</Badge>
                    {host && h.replace(/^\./, "") === host.replace(/^\./, "") && (
                      <Badge className="bg-primary/15 text-primary border-0 justify-self-end shrink-0">現在のサイト</Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-2">
                    {accs.map((it) => {
                      const revealed = !!revealedIds[it.id]
                      const userKey = `${it.id}:user`
                      const passKey = `${it.id}:pass`
                      const userCopied = copiedKey === userKey
                      const passCopied = copiedKey === passKey
                      const busy = fillingId === it.id

                      return (
                        <div key={it.id} className="rounded-lg border p-3 space-y-2 hover:bg-muted/30 transition-colors">
                          {/* ヘッダ：タイトル/ユーザ名（可変）＋操作（固定） ※日時表示は削除 */}
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 min-w-0">
                            <span className="font-medium truncate" title={it.title || it.username}>
                              {it.title || it.username}
                            </span>
                            <div className="flex items-center gap-1 justify-self-end shrink-0">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setEditing(it)}
                                title="編集"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => deleteAccount(it.id)}
                                title="削除"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {/* ユーザ名 */}
                          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 min-w-0">
                            <span className="shrink-0 text-muted-foreground w-16">ﾕｰｻﾞ名</span>
                            <Input
                              readOnly
                              value={it.username}
                              className="h-8 font-mono min-w-0"
                              title={it.username}
                              onFocus={(e) => e.currentTarget.select()}
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 shrink-0 justify-self-end"
                              onClick={() => copyWithKey(userKey, it.username)}
                              title="ユーザ名をコピー"
                            >
                              {userCopied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </Button>
                          </div>

                          {/* パスワード */}
                          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 min-w-0">
                            <span className="shrink-0 text-muted-foreground w-16">ﾊﾟｽﾜｰﾄﾞ</span>
                            <Input
                              readOnly
                              type={revealed ? "text" : "password"}
                              value={it.password}
                              className="h-8 font-mono min-w-0"
                              title={revealed ? it.password : ""}
                              onFocus={(e) => e.currentTarget.select()}
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => copyWithKey(passKey, it.password)}
                              title="パスワードをコピー"
                            >
                              {passCopied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 justify-self-end"
                              onClick={() => setRevealedIds((s) => ({ ...s, [it.id]: !revealed }))}
                              title={revealed ? "隠す" : "表示"}
                            >
                              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>

                          {/* メモ */}
                          {it.note && (
                            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 min-w-0">
                              <span className="shrink-0 text-muted-foreground w-16 pt-0.5">メモ</span>
                              <span className="whitespace-pre-wrap break-words" title={it.note}>{it.note}</span>
                            </div>
                          )}

                          {/* 利用ボタン（待機・連打防止） */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => handleFill(it.id, it.username, it.password, false)}
                              title="アクティブなページの入力欄へ自動入力"
                              className="h-8"
                            >
                              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MousePointerClick className="h-4 w-4 mr-1" />}
                              入力
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => handleFill(it.id, it.username, it.password, true)}
                              title="自動入力して送信（値反映後に短い待機を挟みます）"
                              className="h-8"
                            >
                              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <LogIn className="h-4 w-4 mr-1" />}
                              入力+送信
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

        {/* 編集ダイアログ */}
        <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
          <DialogContent className="w-[360px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>アカウントを編集</DialogTitle>
            </DialogHeader>
            {editing && (
              <AddOrEditForm
                initial={{
                  host: editing.host,
                  title: editing.title ?? "",
                  username: editing.username,
                  password: editing.password,
                  note: editing.note ?? "",
                }}
                onSubmit={async (vals) =>
                  updateAccount({
                    ...editing,
                    host: vals.host.trim(),
                    title: vals.title?.trim() || undefined,
                    username: vals.username.trim(),
                    password: vals.password,
                    note: vals.note?.trim() || undefined,
                  })
                }
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Status */}
        <StatusOverlay status={status} />

        {/* hidden file chooser */}
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importJson(f)
            e.currentTarget.value = ""
          }}
        />
      </CardContent>
    </Card>
  )
}

/* =========================================================
   Add / Edit Form
========================================================= */
function AddOrEditForm({
  initial,
  onSubmit,
}: {
  initial: { host: string; title: string; username: string; password: string; note: string }
  onSubmit: (vals: { host: string; title: string; username: string; password: string; note: string }) => Promise<void> | void
}) {
  const [vals, setVals] = useState(initial)

  const quickGen = () => {
    const pw = genPassword({ length: 18 })
    setVals((v) => ({ ...v, password: pw }))
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!vals.host.trim() || !vals.username.trim() || !vals.password) return
        await onSubmit(vals)
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="host">ホスト名（例: example.com）</Label>
        <Input
          id="host"
          value={vals.host}
          onChange={(e) => setVals((v) => ({ ...v, host: e.target.value }))}
          placeholder="example.com"
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="title">表示名（任意）</Label>
        <Input
          id="title"
          value={vals.title}
          onChange={(e) => setVals((v) => ({ ...v, title: e.target.value }))}
          placeholder="Google メイン"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="username">ユーザ名</Label>
        <Input
          id="username"
          value={vals.username}
          onChange={(e) => setVals((v) => ({ ...v, username: e.target.value }))}
          placeholder="user@example.com"
          required
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">パスワード</Label>
          <StrengthBadge pw={vals.password} />
        </div>
        <div className="flex gap-2 min-w-0">
          <Input
            id="password"
            type="text"
            value={vals.password}
            onChange={(e) => setVals((v) => ({ ...v, password: e.target.value }))}
            className="flex-1 min-w-0"
            required
          />
          <Button type="button" variant="outline" onClick={quickGen} className="shrink-0">
            生成
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="note">メモ（任意）</Label>
        <Textarea
          id="note"
          value={vals.note}
          onChange={(e) => setVals((v) => ({ ...v, note: e.target.value }))}
          placeholder="2FA バックアップコード保管場所など"
          rows={3}
          className="break-words"
        />
      </div>

      <DialogFooter className="mt-2">
        <Button type="submit">保存</Button>
      </DialogFooter>
    </form>
  )
}

/* =========================================================
   Status Floating
========================================================= */
function StatusOverlay({
  status,
}: {
  status: { text: string; tone: Tone } | null
}) {
  if (!status) return null
  const toneStyles: Record<Tone, string> = {
    success: "border-emerald-500/30 text-emerald-900 dark:text-emerald-100 bg-emerald-500/10",
    error: "border-red-500/30 text-red-900 dark:text-red-100 bg-red-500/10",
    info: "border-muted-foreground/30 text-foreground bg-muted/70",
  }
  const dotStyles: Record<Tone, string> = {
    success: "bg-emerald-500",
    error: "bg-red-500",
    info: "bg-foreground/60",
  }
  return (
    <div className="pointer-events-none absolute left-1/2 bottom-2 z-50 -translate-x-1/2" aria-live="polite" role="status">
      <div className={`px-3 py-2 rounded-md border text-sm shadow-sm backdrop-blur ${toneStyles[status.tone]}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dotStyles[status.tone]}`} />
          <span className="whitespace-pre-wrap">{status.text}</span>
        </div>
      </div>
    </div>
  )
}
