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
   Types & storage（日時関連の要素は撤去）
========================================================= */

type Account = {
  id: string
  host: string
  title?: string
  username: string
  password: string
  note?: string
}

const STORAGE_KEY = "pw.accounts.v2"
const chromeApi = (globalThis as any)?.chrome

const storage = {
  async getAll(): Promise<Account[]> {
    try {
      if (chromeApi?.storage?.local) {
        const obj = await chromeApi.storage.local.get(STORAGE_KEY)
        const arr = (obj?.[STORAGE_KEY] as any[] | undefined) ?? []
        return sanitize(arr)
      }
    } catch { }
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? sanitize(JSON.parse(raw)) : []
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

function sanitize(arr: any[]): Account[] {
  return (arr ?? [])
    .map((x: any) => ({
      id: String(x.id ?? crypto.randomUUID()),
      host: String(x.host ?? ""),
      title: x.title ? String(x.title) : undefined,
      username: String(x.username ?? ""),
      password: String(x.password ?? ""),
      note: x.note ? String(x.note) : undefined,
    }))
    .filter((x) => x.host && x.username && x.password)
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
type StatusState = {
  text: string
  tone: Tone
  actionLabel?: string
  onAction?: () => void
} | null

export default function AccountManager() {
  const [items, setItems] = useState<Account[]>([])
  const [host, setHost] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const searchQ = useDeferredValue(search)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copyTimerRef = useRef<number | null>(null)

  const [status, setStatus] = useState<StatusState>(null)
  const statusTimerRef = useRef<number | null>(null)

  // 自動入力の待機/連打対策
  const [fillingId, setFillingId] = useState<string | null>(null)

  // Undo 用
  const lastDeletedRef = useRef<Account | null>(null)

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
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const va = (a.title || a.username).toLowerCase()
        const vb = (b.title || b.username).toLowerCase()
        return va.localeCompare(vb)
      })
    }
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

  const showStatus = (payload: Exclude<StatusState, null>) => {
    setStatus(payload)
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
    const ms = payload.onAction ? 5000 : 1600
    statusTimerRef.current = window.setTimeout(() => setStatus(null), ms)
  }

  const persist = async (next: Account[], msg?: string, tone: Tone = "success") => {
    setItems(next)
    await storage.setAll(next)
    if (msg) showStatus({ text: msg, tone })
  }

  const addAccount = async (payload: Omit<Account, "id">) => {
    const acc: Account = { id: crypto.randomUUID(), ...payload }
    await persist([acc, ...items], "保存しました")
    setAddOpen(false)
  }

  const updateAccount = async (patch: Account) => {
    const next = items.map((it) => (it.id === patch.id ? { ...patch } : it))
    await persist(next, "更新しました")
    setEditing(null)
  }

  const deleteAccount = async (id: string) => {
    const target = items.find((x) => x.id === id) ?? null
    lastDeletedRef.current = target
    const next = items.filter((it) => it.id !== id)
    await persist(next)
    showStatus({
      text: "削除しました。",
      tone: "info",
      actionLabel: "元に戻す",
      onAction: async () => {
        if (!lastDeletedRef.current) return
        const restored = [lastDeletedRef.current, ...items.filter((i) => i.id !== lastDeletedRef.current!.id)]
        lastDeletedRef.current = null
        await persist(restored, "復元しました", "success")
      },
    })
  }

  const copyWithKey = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 1200)
      showStatus({ text: "コピーしました", tone: "success" })
    } catch {
      showStatus({ text: "コピーに失敗", tone: "error" })
    }
  }

  // 1レコード全文コピー
  const copyAccountBlock = (it: Account) => {
    const title = it.title?.trim() || "(no title)"
    const block = `${title}\nusername: ${it.username}\npassword :${it.password}`
    return copyWithKey(`${it.id}:block`, block)
  }

  // ====== 自動入力（wait を設ける） ======
  const handleFill = async (id: string, username: string, password: string, doSubmit: boolean) => {
    setFillingId(id)
    try {
      await fillAccountOnPage(username, password, doSubmit)
    } finally {
      setTimeout(() => setFillingId(null), 200)
    }
  }

  const fillAccountOnPage = async (username: string, password: string, doSubmit: boolean) => {
    try {
      if (!chromeApi?.tabs?.query || !chromeApi?.scripting?.executeScript) {
        showStatus({ text: "自動入力に未対応", tone: "error" })
        return
      }
      const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) {
        showStatus({ text: "タブが見つかりません", tone: "error" })
        return
      }

      const waitMs = 250
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

          await sleep(wait)

          let submitted = false
          if (submit) {
            const targetForm = passInput?.form || userInput?.form || document.querySelector("form")
            if (targetForm) {
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
        showStatus({ text: result.submitted ? "入力して送信しました" : "入力しました", tone: "success" })
      } else {
        showStatus({ text: "入力対象が見つかりません", tone: "error" })
      }
    } catch {
      showStatus({ text: "自動入力に失敗", tone: "error" })
    }
  }

  /* ================= 出力系（JSON / Markdown） ================= */

  const buildMdForHost = (h: string, list: Account[]) => {
    const header = `## ${h}\n\n`
    const body = list
      .map((it) => {
        const title = it.title?.trim() || "(no title)"
        return [
          `- ${title}`,
          `- username: ${it.username}`,
          `- password: ${it.password}`,
          "", // 空行で区切る
        ].join("\n")
      })
      .join("\n")
    return header + body
  }

  const buildMdAll = () => {
    return byHost.map(([h, list]) => buildMdForHost(h, list)).join("\n")
  }

  const downloadText = (filename: string, text: string, mime = "text/plain") => {
    const blob = new Blob([text], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportJsonAll = () => {
    downloadText("accounts.json", JSON.stringify(items, null, 2), "application/json")
  }

  const exportMdAll = () => {
    downloadText("accounts.md", buildMdAll(), "text/markdown")
  }

  const copyMdAll = async () => {
    try {
      await navigator.clipboard.writeText(buildMdAll())
      showStatus({ text: "Markdownをコピーしました", tone: "success" })
    } catch {
      showStatus({ text: "コピーに失敗", tone: "error" })
    }
  }

  const exportJsonHost = (h: string, list: Account[]) => {
    downloadText(`accounts-${h}.json`, JSON.stringify(list, null, 2), "application/json")
  }

  const exportMdHost = (h: string, list: Account[]) => {
    downloadText(`accounts-${h}.md`, buildMdForHost(h, list), "text/markdown")
  }

  const copyMdHost = async (h: string, list: Account[]) => {
    try {
      await navigator.clipboard.writeText(buildMdForHost(h, list))
      showStatus({ text: `${h} をMarkdownコピーしました`, tone: "success" })
    } catch {
      showStatus({ text: "コピーに失敗", tone: "error" })
    }
  }

  /* ================= Import ================= */

  const importJson = async (file: File) => {
    const text = await file.text()
    try {
      const parsed = JSON.parse(text) as any[]
      const cleaned = sanitize(parsed)
      await persist(cleaned, "インポート完了", "success")
    } catch {
      showStatus({ text: "インポート失敗", tone: "error" })
    }
  }

  const fileRef = useRef<HTMLInputElement | null>(null)

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">アカウントマネージャ</CardTitle>
      </CardHeader>

      <CardContent className="relative grid gap-4 pb-12 overflow-x-hidden">
        {/* Host 行 */}
        <div className="rounded-xl border p-3 bg-muted/30">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-sm min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <Globe className="h-4 w-4" />
              <span className="text-muted-foreground">Host:</span>
            </div>
            <span className="truncate" title={host ?? ""}>{host ?? "現在のサイトを取得できませんでした"}</span>
            {host && <Badge variant="secondary" className="justify-self-end shrink-0">このサイト</Badge>}
          </div>
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

          <div className="grid grid-cols-[auto_auto_1fr_auto] gap-2 items-center">
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

            {/* 全体 出力メニュー */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0" title="エクスポート/インポート">
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>エクスポート</DropdownMenuLabel>
                <DropdownMenuItem onClick={exportJsonAll}>
                  <Download className="h-4 w-4 mr-2" />
                  JSON（全体）
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportMdAll}>
                  <Download className="h-4 w-4 mr-2" />
                  Markdown（全体）
                </DropdownMenuItem>
                <DropdownMenuItem onClick={copyMdAll}>
                  <Copy className="h-4 w-4 mr-2" />
                  Markdownをコピー（全体）
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>インポート</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  JSONインポート
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
                  {/* ドメイン単位の出力メニュー（コピーは独立ボタンのまま） */}
                  <div className="mb-2 flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" title="このドメインをエクスポート">
                          <Download className="h-4 w-4 mr-1" /> 出力
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" side="bottom" sideOffset={6} className="w-48">
                        <DropdownMenuItem onClick={() => exportMdHost(h, accs)}>
                          <Download className="h-4 w-4 mr-2" /> Markdown（このドメイン）
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportJsonHost(h, accs)}>
                          <Download className="h-4 w-4 mr-2" /> JSON（このドメイン）
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="ghost" size="sm" onClick={() => copyMdHost(h, accs)} title="このドメインをMarkdownでコピー">
                      <Copy className="h-4 w-4 mr-1" /> コピー
                    </Button>
                  </div>

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
                          {/* ヘッダ：タイトル/ユーザ名（可変）＋操作 */}
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 min-w-0">
                            <span className="font-medium truncate" title={it.title || it.username}>
                              {it.title || it.username}
                            </span>
                            <div className="flex items-center gap-1 justify-self-end shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => copyAccountBlock(it)}
                                title="このアカウントをまとめてコピー"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
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
                                title="削除（元に戻す可）"
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

                          {/* 自動入力 */}
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

        {/* Status（縦配置で「元に戻す」ボタンを下に） */}
        <StatusOverlay status={status} onClose={() => setStatus(null)} />

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
   Status Floating（ボタンを文の下に配置）
========================================================= */
function StatusOverlay({
  status,
  onClose,
}: {
  status: {
    text: string
    tone: Tone
    actionLabel?: string
    onAction?: () => void
  } | null
  onClose?: () => void
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
    <div className="absolute left-1/2 bottom-2 z-50 -translate-x-1/2" aria-live="polite" role="status">
      <div className={`px-3 py-2 rounded-md border text-sm shadow-sm backdrop-blur ${toneStyles[status.tone]}`}>
        <div className="flex flex-col gap-2 items-stretch text-center">
          <div className="flex items-center gap-2 justify-center">
            <span className={`h-2 w-2 rounded-full ${dotStyles[status.tone]}`} />
            <span className="whitespace-pre-wrap">{status.text}</span>
          </div>
          {status.actionLabel && status.onAction && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                status.onAction?.()
                onClose?.()
              }}
            >
              {status.actionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

