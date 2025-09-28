import { useEffect, useMemo, useRef, useState } from "react"
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
   - ステータスは「浮遊フローティング」表示でレイアウト崩れ回避
========================================================= */

type Tone = "success" | "error" | "info"

export default function AccountManager() {
  const [items, setItems] = useState<Account[]>([])
  const [host, setHost] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null) // `${id}:user` or `${id}:pass`
  const copyTimerRef = useRef<number | null>(null)

  // ここを string -> {text,tone} に変更
  const [status, setStatus] = useState<{ text: string; tone: Tone } | null>(null)
  const statusTimerRef = useRef<number | null>(null)

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
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) =>
      [it.host, it.username, it.title ?? "", it.note ?? ""].some((v) => v.toLowerCase().includes(q))
    )
  }, [items, search])

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
      if (host && a[0] === host) return -1
      if (host && b[0] === host) return 1
      return a[0].localeCompare(b[0])
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

  /* ---------------- 自動入力（content へのスクリプト注入） ---------------- */
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

      const [{ result }] = await chromeApi.scripting.executeScript({
        target: { tabId: tab.id },
        args: [username, password, doSubmit],
        func: (u: string, p: string, submit: boolean) => {
          const isVisible = (el: HTMLElement) => {
            const style = window.getComputedStyle(el)
            const rect = el.getBoundingClientRect()
            return (
              style.visibility !== "hidden" &&
              style.display !== "none" &&
              !el.hasAttribute("disabled") &&
              rect.width > 0 &&
              rect.height > 0
            )
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
            pick('input[autocomplete="username"],input[type="email"],input[type="text"],input[name*="user" i],input[id*="user" i],input[name*="login" i],input[id*="login" i],input[name*="email" i],input[id*="email" i]') ||
            null
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

          let submitted = false
          if (submit) {
            const targetForm = passInput?.form || userInput?.form || document.querySelector("form")
            if (targetForm) {
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

      {/* レイアウト崩れ防止のため relative + 余白を確保 */}
      <CardContent className="relative grid gap-4 pb-12">
        {/* ヘッダー：ステータス Badge は置かず、下部浮遊で表示 */}
        <div className="rounded-xl border p-3 bg-muted/30">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <Globe className="h-4 w-4 shrink-0" />
            <span className="truncate">{host ?? "現在のサイトを取得できませんでした"}</span>
            {host && <Badge variant="secondary" className="shrink-0">このサイト</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            ホスト単位でアカウントを管理。値は入力欄で水平スクロール、レイアウト崩れを防ぎます。
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="検索（ホスト / ユーザ名 / メモ）"
              className="pl-8"
            />
          </div>

          <div className="flex items-center gap-2">
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  新規追加
                </Button>
              </DialogTrigger>
              {/* 高さ内に収める（内部スクロール） */}
              <DialogContent className="w-[360px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>アカウントを追加</DialogTitle>
                </DialogHeader>
                <AddOrEditForm
                  initial={{
                    host: host ?? "",
                    title: "",
                    username: "",
                    password: genPassword(),
                    note: "",
                  }}
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
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 " />
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
          </div>
        </div>

        <Separator />

        {/* List（親がスクロールを持つのでここでは overflow を作らない） */}
        {byHost.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            まだ登録がありません。「新規追加」から作成してください。
          </div>
        ) : (
          <Accordion type="multiple" defaultValue={host ? [host] : undefined} className="w-full">
            {byHost.map(([h, accs]) => (
              <AccordionItem key={h} value={h}>
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2 min-w-0 w-full">
                    <Globe className="h-4 w-4 shrink-0" />
                    <span className="font-medium truncate">{h}</span>
                    <Badge variant="secondary" className="shrink-0">{accs.length}</Badge>
                    {host === h && <Badge className="bg-primary/15 text-primary border-0 shrink-0">現在のサイト</Badge>}
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

                      return (
                        <div key={it.id} className="rounded-lg border p-3 space-y-2">
                          {/* ヘッダ行 */}
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium truncate">{it.title || it.username}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              （{new Date(it.updatedAt).toLocaleString()}）
                            </span>
                            <div className="ml-auto flex items-center gap-1 shrink-0">
                              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setEditing(it)} title="編集">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => deleteAccount(it.id)} title="削除">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {/* ユーザ名 */}
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 text-muted-foreground w-16">ﾕｰｻﾞ名</span>
                            <Input
                              readOnly
                              value={it.username}
                              className="h-8 font-mono flex-1 min-w-0"
                              onFocus={(e) => e.currentTarget.select()}
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => copyWithKey(userKey, it.username)}
                              title="ユーザ名をコピー"
                            >
                              {userCopied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </Button>
                          </div>

                          {/* パスワード */}
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 text-muted-foreground w-16">ﾊﾟｽﾜｰﾄﾞ</span>
                            <Input
                              readOnly
                              type={revealed ? "text" : "password"}
                              value={it.password}
                              className="h-8 font-mono flex-1 min-w-0"
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
                              className="h-8 w-8 shrink-0"
                              onClick={() => setRevealedIds((s) => ({ ...s, [it.id]: !revealed }))}
                              title={revealed ? "隠す" : "表示"}
                            >
                              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>

                          {/* メモ */}
                          {it.note && (
                            <div className="flex items-start gap-2">
                              <span className="shrink-0 text-muted-foreground w-16 pt-0.5">メモ</span>
                              <span className="whitespace-pre-wrap break-words">{it.note}</span>
                            </div>
                          )}

                          {/* 利用ボタン（自動入力） */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button
                              size="sm"
                              onClick={() => fillAccountOnPage(it.username, it.password, false)}
                              title="アクティブなページの入力欄へ自動入力"
                              className="h-8"
                            >
                              <MousePointerClick className="h-4 w-4 mr-1" />
                              入力
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => fillAccountOnPage(it.username, it.password, true)}
                              title="自動入力して送信"
                              className="h-8"
                            >
                              <LogIn className="h-4 w-4 mr-1" />
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

        {/* 編集ダイアログ：高さ安全化（内部スクロール） */}
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

        {/* ===== ステータス・フローティング（絶対配置） ===== */}
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
        <div className="flex gap-2">
          <Input
            id="password"
            type="text"
            value={vals.password}
            onChange={(e) => setVals((v) => ({ ...v, password: e.target.value }))}
            className="flex-1"
            required
          />
          <Button type="button" variant="outline" onClick={quickGen}>
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
        />
      </div>

      <DialogFooter className="mt-2">
        <Button type="submit">保存</Button>
      </DialogFooter>
    </form>
  )
}

/* =========================================================
   ステータス・フローティング（レイアウト非干渉）
   - 位置: CardContent の下部中央
   - 非モーダル・フォーカスを奪わない・自動消滅
========================================================= */
function StatusOverlay({
  status,
}: {
  status: { text: string; tone: Tone } | null
}) {
  if (!status) return null
  const toneStyles: Record<Tone, string> = {
    success:
      "border-emerald-500/30 text-emerald-900 dark:text-emerald-100 bg-emerald-500/10",
    error:
      "border-red-500/30 text-red-900 dark:text-red-100 bg-red-500/10",
    info:
      "border-muted-foreground/30 text-foreground bg-muted/70",
  }
  const dotStyles: Record<Tone, string> = {
    success: "bg-emerald-500",
    error: "bg-red-500",
    info: "bg-foreground/60",
  }
  return (
    <div
      className="pointer-events-none absolute left-1/2 bottom-2 z-50 -translate-x-1/2"
      aria-live="polite"
      role="status"
    >
      <div
        className={`px-3 py-2 rounded-md border text-sm shadow-sm backdrop-blur supports-[backdrop-filter]:backdrop-blur ${toneStyles[status.tone]}`}
      >
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dotStyles[status.tone]}`} />
          <span className="whitespace-pre-wrap">{status.text}</span>
        </div>
      </div>
    </div>
  )
}
