import { useEffect, useMemo, useRef, useState } from "react"
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion"
import {
  Cookie as CookieIcon,
  Search, RotateCw, CirclePlus, Info, Pencil, Trash2,
  Copy, Check, X, Download, Upload, MoreHorizontal, ShieldAlert, ShieldCheck,
} from "lucide-react"

/* ======================== 型・ユーティリティ ======================== */
type SameSite = "no_restriction" | "lax" | "strict"
type CookieItem = {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite: SameSite
  session: boolean
  expirationDate?: number // seconds since epoch
}
type Tone = "success" | "error" | "info"

const chromeApi = (globalThis as any)?.chrome
const fmtDateTime = (sec?: number) => (sec ? new Date(sec * 1000).toLocaleString() : "Session")

const toSetCookie = (c: CookieItem) => {
  const parts = [`${c.name}=${c.value}`]
  if (c.domain) parts.push(`Domain=${c.domain}`)
  if (c.path) parts.push(`Path=${c.path}`)
  if (!c.session && c.expirationDate) parts.push(`Expires=${new Date(c.expirationDate * 1000).toUTCString()}`)
  if (c.secure) parts.push("Secure")
  if (c.httpOnly) parts.push("HttpOnly")
  if (c.sameSite) {
    const ss = c.sameSite === "no_restriction" ? "None" : (c.sameSite[0].toUpperCase() + c.sameSite.slice(1))
    parts.push(`SameSite=${ss}`)
  }
  return `Set-Cookie: ${parts.join("; ")}`
}

const b64urlDecode = (s: string) => {
  try {
    const padLen = (4 - (s.length % 4)) % 4
    const pad = "=".repeat(padLen)
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad
    return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))
  } catch { return null }
}

function decodeValue(value: string) {
  let decoded = value
  try { decoded = decodeURIComponent(decoded) } catch { }
  const b64 = b64urlDecode(decoded)
  if (b64) {
    try { return { label: "Base64(JSON)", text: JSON.stringify(JSON.parse(b64), null, 2) } }
    catch { return { label: "Base64", text: b64 } }
  }
  const parts = value.split(".")
  if (parts.length === 3) {
    const h = b64urlDecode(parts[0]); const p = b64urlDecode(parts[1])
    if (h && p) {
      try {
        return {
          label: "JWT",
          text: `Header:\n${JSON.stringify(JSON.parse(h), null, 2)}\n\nPayload:\n${JSON.stringify(JSON.parse(p), null, 2)}`
        }
      } catch { }
    }
  }
  return { label: "URLデコード", text: decoded }
}

/* ======================== 本体 ======================== */
export default function ControlCookie() {
  const [activeUrl, setActiveUrl] = useState<string | null>(null)
  const [host, setHost] = useState<string | null>(null)
  const [scope, setScope] = useState<"url" | "domain">("url")
  const [cookies, setCookies] = useState<CookieItem[]>([])
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<{ text: string; tone: Tone } | null>(null)
  const statusTimerRef = useRef<number | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copyTimerRef = useRef<number | null>(null)

  // 行内編集
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState<string>("")

  // 追加 & 詳細
  const [addingOpen, setAddingOpen] = useState(false)
  const [detailCookie, setDetailCookie] = useState<CookieItem | null>(null)

  // import/export
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    load()
    return () => {
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  const showStatus = (text: string, tone: Tone = "info") => {
    setStatus({ text, tone })
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
    statusTimerRef.current = window.setTimeout(() => setStatus(null), 1400)
  }

  async function load() {
    try {
      if (!chromeApi?.tabs?.query || !chromeApi?.cookies?.getAll) {
        showStatus("Chrome API 不可", "error"); return
      }
      const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true })
      if (!tab?.url) { showStatus("URL取得失敗", "error"); return }
      setActiveUrl(tab.url)
      const u = new URL(tab.url)
      setHost(u.hostname)

      const details = scope === "url" ? { url: tab.url } : { domain: u.hostname }
      chromeApi.cookies.getAll(details as chrome.cookies.GetAllDetails, (raw: chrome.cookies.Cookie[]) => {
        const arr: CookieItem[] = raw.map(c => ({
          name: c.name, value: c.value, domain: c.domain, path: c.path,
          secure: c.secure, httpOnly: c.httpOnly,
          sameSite: (["no_restriction", "lax", "strict"].includes(c.sameSite as any) ? c.sameSite : "lax") as SameSite,
          session: c.session, expirationDate: c.expirationDate,
        }))
        setCookies(arr)
        setEditingKey(null)
        showStatus(`取得 ${arr.length}件`, "success")
      })
    } catch { showStatus("取得に失敗", "error") }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cookies
    return cookies.filter(c =>
      [c.name, c.value, c.domain, c.path, c.secure ? "secure" : "", c.httpOnly ? "httponly" : "", c.sameSite]
        .join(" ").toLowerCase().includes(q)
    )
  }, [cookies, query])

  const grouped = useMemo(() => {
    const map = new Map<string, CookieItem[]>()
    for (const c of filtered) {
      const key = c.domain
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    const pairs = Array.from(map.entries())
    pairs.sort((a, b) => {
      if (host && a[0] === host) return -1
      if (host && b[0] === host) return 1
      return a[0].localeCompare(b[0])
    })
    return pairs
  }, [filtered, host])

  const keyOf = (c: CookieItem) => `${c.domain}:${c.path}:${c.name}`

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 900)
      showStatus("コピーしました", "success")
    } catch { showStatus("コピー失敗", "error") }
  }

  const setCookie = async (c: CookieItem) => {
    try {
      const baseHost = c.domain?.replace(/^\./, "") || host!
      const httpsPrefer = c.secure || (activeUrl?.startsWith("https://") ?? true)
      const url = `${httpsPrefer ? "https" : "http"}://${baseHost}${c.path || "/"}`
      await chromeApi.cookies.set({
        url, name: c.name, value: c.value,
        domain: c.domain || undefined, path: c.path || undefined,
        secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
        expirationDate: !c.session ? c.expirationDate : undefined,
      } as chrome.cookies.SetDetails)
      showStatus("保存しました", "success")
      load()
    } catch { showStatus("保存失敗", "error") }
  }

  const removeCookie = async (c: CookieItem) => {
    try {
      const baseHost = c.domain?.replace(/^\./, "") || host!
      const httpsPrefer = c.secure || (activeUrl?.startsWith("https://") ?? true)
      const url = `${httpsPrefer ? "https" : "http"}://${baseHost}${c.path || "/"}`
      await chromeApi.cookies.remove({ url, name: c.name })
      showStatus("削除しました", "info")
      setCookies(prev => prev.filter(x => !(x.name === c.name && x.domain === c.domain && x.path === c.path)))
    } catch { showStatus("削除失敗", "error") }
  }

  const onImport = async (file: File) => {
    try {
      const arr = JSON.parse(await file.text()) as CookieItem[]
      for (const c of arr) await setCookie(c)
      showStatus("インポート完了", "success")
    } catch { showStatus("インポート失敗", "error") }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(cookies, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `cookies-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ======================== 画面 ======================== */
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">Cookie操作ツール</CardTitle>
      </CardHeader>

      {/* 親が w-[400px] h-[500px]。横崩れ防止のため overflow-x-hidden / min-w-0 */}
      <CardContent className="relative grid gap-4 overflow-x-hidden pb-12">
        {/* 情報バー */}
        <div className="rounded-xl border p-3 bg-muted/30">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <CookieIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">Host: {host ?? "取得中..."}</span>
            <Badge variant="secondary" className="ml-auto shrink-0">{scope === "url" ? "URL" : "Domain"}</Badge>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60" />
              <Input
                className="pl-8"
                placeholder="検索（name / value / domain / path / 属性）"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <Button variant="outline" size="icon" title="再取得" onClick={load}>
              <RotateCw className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" title="その他">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setScope("url")}>現在URL</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setScope("domain")}>ドメイン全体</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={exportJson}>
                  <Download className="h-4 w-4 mr-2" />JSON書き出し
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />JSON読み込み
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 追加（アイコンのみ） */}
            <Dialog open={addingOpen} onOpenChange={setAddingOpen}>
              <DialogTrigger asChild>
                <Button size="icon" title="追加">
                  <CirclePlus className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[360px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto">
                <DialogHeader><DialogTitle>Cookieを追加</DialogTitle></DialogHeader>
                <CookieForm
                  initial={{
                    name: "", value: "", domain: host ?? "", path: "/",
                    secure: activeUrl?.startsWith("https://") ?? true,
                    httpOnly: false, sameSite: "lax", session: true, expirationDate: undefined,
                  }}
                  onSubmit={async (c) => { await setCookie(c); setAddingOpen(false) }}
                />
              </DialogContent>
            </Dialog>

            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onImport(f)
                e.currentTarget.value = ""
              }}
            />
          </div>
        </div>

        <Separator />

        {/* 一覧（ドメインごと） */}
        {grouped.length === 0 ? (
          <div className="text-sm text-muted-foreground">Cookie がありません</div>
        ) : (
          <Accordion type="multiple" className="w-full min-w-0">
            {grouped.map(([domain, list]) => (
              <AccordionItem key={domain} value={domain}>
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2 min-w-0 w-full">
                    <span className="font-medium truncate">{domain}</span>
                    <Badge variant="secondary" className="shrink-0">{list.length}</Badge>
                    {host === domain && <Badge className="bg-primary/15 text-primary border-0 shrink-0">現在ホスト</Badge>}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-2">
                    {list.map((c) => {
                      const rowKey = keyOf(c)
                      const copied = copiedKey === rowKey
                      const risky = (!c.secure && (activeUrl?.startsWith("https://") ?? true)) || !c.httpOnly

                      const isEditing = editingKey === rowKey
                      return (
                        <div key={rowKey} className="rounded-lg border p-3 space-y-2">
                          {/* 1行目：cookie名 と 詳細ボタン（アイコンのみ） */}
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium truncate">{c.name}</span>
                            <div className="ml-auto flex items-center gap-1 shrink-0">
                              {risky ? (
                                <Badge variant="destructive" className="shrink-0">
                                  <ShieldAlert className="h-3 w-3 mr-1" />注意
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 shrink-0">
                                  <ShieldCheck className="h-3 w-3 mr-1" />良好
                                </Badge>
                              )}
                              <Button
                                variant="ghost" size="icon" title="詳細"
                                onClick={() => setDetailCookie(c)}
                                className="h-8 w-8"
                              >
                                <Info className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {/* 2行目：value(input) と アイコンボタン（編集 / 削除 / コピー） */}
                          <div className="flex items-center gap-2 min-w-0">
                            <Input
                              readOnly={!isEditing}
                              value={isEditing ? editingValue : c.value}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onFocus={(e) => !isEditing && e.currentTarget.select()}
                              className="h-8 font-mono flex-1 min-w-0"
                            />
                            {isEditing ? (
                              <>
                                <Button
                                  variant="outline" size="icon" title="保存"
                                  onClick={() => {
                                    setCookie({ ...c, value: editingValue })
                                    setEditingKey(null)
                                  }}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon" title="キャンセル"
                                  onClick={() => { setEditingKey(null); setEditingValue("") }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="outline" size="icon" title="コピー"
                                  onClick={() => copyText(rowKey, c.value)}
                                >
                                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                </Button>
                                <Button
                                  variant="outline" size="icon" title="編集"
                                  onClick={() => { setEditingKey(rowKey); setEditingValue(c.value) }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline" size="icon" title="削除"
                                  onClick={() => removeCookie(c)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
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

        {/* 詳細ポップアップ（Dialog） */}
        <Dialog open={!!detailCookie} onOpenChange={(v) => !v && setDetailCookie(null)}>
          <DialogContent className="w-[360px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto">
            <DialogHeader><DialogTitle>Cookie詳細</DialogTitle></DialogHeader>
            {detailCookie && (
              <div className="grid gap-3 text-sm">
                <KV label="Name" value={detailCookie.name} />
                <div className="grid gap-1">
                  <Label>Value</Label>
                  <Textarea
                    readOnly
                    value={detailCookie.value}
                    className="h-24 font-mono overflow-x-hidden"
                  />
                </div>
                <KV label="Domain" value={detailCookie.domain} />
                <KV label="Path" value={detailCookie.path} />
                <KV label="Expires" value={fmtDateTime(detailCookie.expirationDate)} />
                <KV label="Secure" value={detailCookie.secure ? "✓" : "×"} />
                <KV label="HttpOnly" value={detailCookie.httpOnly ? "✓" : "×"} />
                <KV label="SameSite" value={detailCookie.sameSite} />
                <KV label="Session" value={detailCookie.session ? "✓" : "×"} />
                <Separator />
                <Label>Set-Cookie 形式</Label>
                <Textarea readOnly className="h-20 font-mono" value={toSetCookie(detailCookie)} />
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline" size="icon" title="Set-Cookieをコピー"
                    onClick={() => copyText(`sc:${keyOf(detailCookie)}`, toSetCookie(detailCookie))}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Separator />
                <Decoder value={detailCookie.value} />
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ステータス（オーバーレイ表示でレイアウト非干渉） */}
        <StatusOverlay status={status} />
      </CardContent>
    </Card>
  )
}

/* ======================== サブコンポーネント ======================== */
function KV({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="w-24 text-muted-foreground shrink-0">{label}</span>
      <span className={`break-words ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  )
}

function Decoder({ value }: { value: string }) {
  const res = decodeValue(value)
  return (
    <div className="grid gap-2">
      <Label>{res.label}</Label>
      <Textarea readOnly className="h-32 font-mono" value={res.text} />
      <div className="text-xs text-muted-foreground">
        URL/Base64URL/JWT を自動推測して表示します（推測結果の正確性は保証しません）。
      </div>
    </div>
  )
}

function StatusOverlay({ status }: { status: { text: string; tone: Tone } | null }) {
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

function CookieForm({
  initial, onSubmit,
}: {
  initial: CookieItem
  onSubmit: (c: CookieItem) => Promise<void> | void
}) {
  const [c, setC] = useState<CookieItem>(initial)
  const [expiresISO, setExpiresISO] = useState<string>(() =>
    initial.expirationDate ? new Date(initial.expirationDate * 1000).toISOString().slice(0, 16) : ""
  )

  useEffect(() => {
    setC(initial)
    setExpiresISO(initial.expirationDate ? new Date(initial.expirationDate * 1000).toISOString().slice(0, 16) : "")
  }, [initial])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const expirationDate = c.session ? undefined : (expiresISO ? Math.floor(new Date(expiresISO).getTime() / 1000) : undefined)
    await onSubmit({ ...c, expirationDate })
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <Label>名前</Label>
        <Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} required />
      </div>
      <div className="grid gap-2">
        <Label>値</Label>
        <Textarea value={c.value} onChange={(e) => setC({ ...c, value: e.target.value })} rows={3} className="font-mono" />
      </div>
      <div className="grid gap-2">
        <Label>ドメイン</Label>
        <Input value={c.domain} onChange={(e) => setC({ ...c, domain: e.target.value })} placeholder=".example.com または example.com" />
      </div>
      <div className="grid gap-2">
        <Label>パス</Label>
        <Input value={c.path} onChange={(e) => setC({ ...c, path: e.target.value })} placeholder="/" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <input id="secure" type="checkbox" checked={c.secure} onChange={(e) => setC({ ...c, secure: e.target.checked })} />
          <Label htmlFor="secure">Secure</Label>
        </div>
        <div className="flex items-center gap-2">
          <input id="httponly" type="checkbox" checked={c.httpOnly} onChange={(e) => setC({ ...c, httpOnly: e.target.checked })} />
          <Label htmlFor="httponly">HttpOnly</Label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label>SameSite</Label>
          <select
            className="h-9 rounded-md border bg-background px-2"
            value={c.sameSite}
            onChange={(e) => setC({ ...c, sameSite: e.target.value as SameSite })}
          >
            <option value="lax">lax</option>
            <option value="strict">strict</option>
            <option value="no_restriction">no_restriction（None）</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label>Session</Label>
          <select
            className="h-9 rounded-md border bg-background px-2"
            value={c.session ? "yes" : "no"}
            onChange={(e) => setC({
              ...c,
              session: e.target.value === "yes",
              expirationDate: e.target.value === "yes" ? undefined : c.expirationDate,
            })}
          >
            <option value="yes">はい</option>
            <option value="no">いいえ</option>
          </select>
        </div>
      </div>

      {!c.session && (
        <div className="grid gap-2">
          <Label>有効期限（ローカル時刻）</Label>
          <Input type="datetime-local" value={expiresISO} onChange={(e) => setExpiresISO(e.target.value)} />
        </div>
      )}

      <DialogFooter className="mt-2">
        <Button type="submit">保存</Button>
      </DialogFooter>
    </form>
  )
}
