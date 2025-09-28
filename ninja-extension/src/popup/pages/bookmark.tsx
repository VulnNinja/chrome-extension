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
  BookmarkPlus,
  Copy,
  CheckCheck,
  ExternalLink,
  Globe,
  Link as LinkIcon,
  Pencil,
  Pin,
  PinOff,
  Search,
  Trash2,
  Upload,
  Download,
} from "lucide-react"

/* ========= Types & storage ========= */
type BookmarkItem = {
  id: string
  url: string
  host: string
  title?: string
  displayName?: string
  note?: string
  favicon?: string
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = "bm.items.v1"
const chromeApi = (globalThis as any)?.chrome

const storage = {
  async getAll(): Promise<BookmarkItem[]> {
    try {
      if (chromeApi?.storage?.local) {
        const obj = await chromeApi.storage.local.get(STORAGE_KEY)
        return (obj?.[STORAGE_KEY] as BookmarkItem[] | undefined) ?? []
      }
    } catch { }
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as BookmarkItem[]) : []
  },
  async setAll(items: BookmarkItem[]) {
    try {
      if (chromeApi?.storage?.local) {
        await chromeApi.storage.local.set({ [STORAGE_KEY]: items })
        return
      }
    } catch { }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  },
}

async function getActiveTabMeta() {
  try {
    if (!chromeApi?.tabs?.query) return null
    const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) return null
    const u = new URL(tab.url)
    return {
      url: tab.url,
      host: u.host,
      title: tab.title ?? "",
      favicon: (tab as any).favIconUrl as string | undefined,
    }
  } catch {
    return null
  }
}

function groupAndSort(items: BookmarkItem[], currentHost: string | null) {
  const byHost = new Map<string, BookmarkItem[]>()
  for (const it of items) {
    if (!byHost.has(it.host)) byHost.set(it.host, [])
    byHost.get(it.host)!.push(it)
  }
  for (const list of byHost.values()) {
    list.sort((a, b) => {
      if ((a.pinned ? 1 : 0) !== (b.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
      return b.updatedAt - a.updatedAt
    })
  }
  const entries = Array.from(byHost.entries())
  entries.sort((a, b) => {
    if (currentHost && a[0] === currentHost) return -1
    if (currentHost && b[0] === currentHost) return 1
    return a[0].localeCompare(b[0])
  })
  return entries
}

/* ========= Add/Edit Form ========= */
function BookmarkForm({
  initial,
  onSubmit,
}: {
  initial: { url: string; host: string; title: string; displayName: string; note: string; favicon?: string }
  onSubmit: (vals: { url: string; host: string; title: string; displayName: string; note: string; favicon?: string }) => Promise<void> | void
}) {
  const [vals, setVals] = useState(initial)

  // URL入力時に host を自動補完
  const onUrlBlur = () => {
    try {
      if (!vals.host && vals.url) {
        const u = new URL(vals.url)
        setVals((v) => ({ ...v, host: u.host }))
      }
    } catch { }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!vals.url.trim()) return
        try {
          new URL(vals.url.trim())
        } catch {
          return
        }
        await onSubmit(vals)
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="url">URL</Label>
        <Input
          id="url"
          value={vals.url}
          onChange={(e) => setVals((v) => ({ ...v, url: e.target.value }))}
          onBlur={onUrlBlur}
          placeholder="https://example.com/page"
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="host">ホスト</Label>
        <Input
          id="host"
          value={vals.host}
          onChange={(e) => setVals((v) => ({ ...v, host: e.target.value }))}
          placeholder="example.com（未入力ならURLから自動）"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="title">ページタイトル（任意）</Label>
        <Input
          id="title"
          value={vals.title}
          onChange={(e) => setVals((v) => ({ ...v, title: e.target.value }))}
          placeholder="自動取得したタイトルや任意の文字列"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="displayName">表示名（任意）</Label>
        <Input
          id="displayName"
          value={vals.displayName}
          onChange={(e) => setVals((v) => ({ ...v, displayName: e.target.value }))}
          placeholder="サイドバーに出す名前など"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="note">メモ（任意）</Label>
        <Textarea
          id="note"
          value={vals.note}
          onChange={(e) => setVals((v) => ({ ...v, note: e.target.value }))}
          placeholder="補足・TODO・参照情報など"
          rows={3}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="favicon">ファビコンURL（任意）</Label>
        <Input
          id="favicon"
          value={vals.favicon ?? ""}
          onChange={(e) => setVals((v) => ({ ...v, favicon: e.target.value }))}
          placeholder="https://example.com/favicon.ico"
        />
      </div>

      <DialogFooter className="mt-2">
        <Button type="submit">保存</Button>
      </DialogFooter>
    </form>
  )
}

/* ========= Main Component ========= */
export default function BookmarkManager() {
  const [items, setItems] = useState<BookmarkItem[]>([])
  const [host, setHost] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const statusTimerRef = useRef<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<BookmarkItem | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null) // `${id}:url`
  const copyTimerRef = useRef<number | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    ; (async () => {
      setItems(await storage.getAll())
      const meta = await getActiveTabMeta()
      setHost(meta?.host ?? null)
    })()
    return () => {
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) =>
      [it.host, it.url, it.title ?? "", it.displayName ?? "", it.note ?? ""].some((v) =>
        v.toLowerCase().includes(q)
      )
    )
  }, [items, search])

  const grouped = useMemo(() => groupAndSort(filtered, host), [filtered, host])

  const persist = async (next: BookmarkItem[], msg?: string) => {
    setItems(next)
    await storage.setAll(next)
    if (msg) {
      setStatus(msg)
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
      statusTimerRef.current = window.setTimeout(() => setStatus(null), 1500)
    }
  }

  const quickAddFromTab = async () => {
    const meta = await getActiveTabMeta()
    if (!meta) {
      setStatus("現在のタブ情報を取得できませんでした")
      return
    }
    const now = Date.now()
    const prev = items.find((x) => x.url === meta.url)
    if (prev) {
      const updated: BookmarkItem = {
        ...prev,
        title: meta.title || prev.title,
        favicon: meta.favicon ?? prev.favicon,
        updatedAt: now,
      }
      await persist(items.map((x) => (x.id === prev.id ? updated : x)), "更新しました")
    } else {
      const bm: BookmarkItem = {
        id: crypto.randomUUID(),
        url: meta.url,
        host: meta.host,
        title: meta.title || "",
        displayName: meta.title || meta.host,
        note: "",
        favicon: meta.favicon,
        pinned: false,
        createdAt: now,
        updatedAt: now,
      }
      await persist([bm, ...items], "保存しました")
    }
  }

  const addBookmark = async (b: Omit<BookmarkItem, "id" | "createdAt" | "updatedAt" | "pinned">) => {
    const now = Date.now()
    const bm: BookmarkItem = { id: crypto.randomUUID(), pinned: false, createdAt: now, updatedAt: now, ...b }
    await persist([bm, ...items], "保存しました")
    setAddOpen(false)
  }

  const updateBookmark = async (patch: BookmarkItem) => {
    const next = items.map((it) => (it.id === patch.id ? { ...patch, updatedAt: Date.now() } : it))
    await persist(next, "更新しました")
    setEditing(null)
  }

  const deleteBookmark = async (id: string) => {
    await persist(items.filter((x) => x.id !== id), "削除しました")
  }

  const togglePin = async (id: string) => {
    await persist(
      items.map((x) => (x.id === id ? { ...x, pinned: !x.pinned, updatedAt: Date.now() } : x)),
      undefined
    )
  }

  const copyUrl = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedKey(`${id}:url`)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 1200)
    } catch {
      setStatus("コピーに失敗")
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
      statusTimerRef.current = window.setTimeout(() => setStatus(null), 1500)
    }
  }

  const openUrl = async (url: string) => {
    try {
      if (chromeApi?.tabs?.create) await chromeApi.tabs.create({ url })
      else window.open(url, "_blank")
    } catch { }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `bookmarks-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (file: File) => {
    const text = await file.text()
    try {
      const parsed = JSON.parse(text) as BookmarkItem[]
      const cleaned = parsed
        .filter((x) => x.url && x.host)
        .map((x) => ({
          ...x,
          id: x.id ?? crypto.randomUUID(),
          pinned: !!x.pinned,
          createdAt: Number(x.createdAt ?? Date.now()),
          updatedAt: Number(x.updatedAt ?? Date.now()),
        }))
      await persist(cleaned, "インポート完了")
    } catch {
      setStatus("インポート失敗")
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
      statusTimerRef.current = window.setTimeout(() => setStatus(null), 1500)
    }
  }

  /* ===== Render ===== */
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">ブックマーク</CardTitle>
      </CardHeader>

      {/* 横はみ出し防止：min-w-0 と overflow-x-hidden を徹底 */}
      <CardContent className="grid gap-4 overflow-x-hidden">
        <div className="w-full min-w-0 space-y-4">
          {/* ヘッダー情報 */}
          <div className="rounded-xl border p-3 bg-muted/30">
            <div className="flex items-center gap-2 text-sm min-w-0">
              <Globe className="h-4 w-4 shrink-0" />
              <span className="truncate">{host ?? "現在のサイトを取得できませんでした"}</span>
              {host && <Badge variant="secondary" className="shrink-0">このサイト</Badge>}
              {status && <Badge className="ml-auto shrink-0">{status}</Badge>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              現在のタブを保存。表示名・メモ・ピン留めで整理できます。
            </p>
          </div>

          {/* ツールバー */}
          <div className="flex flex-col gap-3 w-full min-w-0">
            <div className="relative w-full min-w-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="検索（URL / タイトル / 表示名 / メモ / ホスト）"
                className="pl-8 w-full"
              />
            </div>

            <div className="flex items-center gap-2 w-full min-w-0">
              <Button size="sm" onClick={quickAddFromTab} className="shrink-0">
                <BookmarkPlus className="h-4 w-4 mr-1" />
                現在のタブを保存
              </Button>

              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="shrink-0">手動で追加</Button>
                </DialogTrigger>
                {/* ダイアログは高さ・幅をビューポートに収める */}
                <DialogContent className="w-[360px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>ブックマークを追加</DialogTitle>
                  </DialogHeader>
                  <BookmarkForm
                    initial={{ url: "", host: "", title: "", displayName: "", note: "", favicon: "" }}
                    onSubmit={async (vals) =>
                      addBookmark({
                        url: vals.url.trim(),
                        host: vals.host.trim() || new URL(vals.url).host,
                        title: vals.title?.trim() || undefined,
                        displayName: vals.displayName?.trim() || undefined,
                        note: vals.note?.trim() || undefined,
                        favicon: vals.favicon?.trim() || undefined,
                      })
                    }
                  />
                </DialogContent>
              </Dialog>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="ml-auto shrink-0">
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
                  <DropdownMenuItem onClick={() => persist([], "全削除")}>
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

          {/* 一覧（横はみ出し防止：各行/ラベル/入力に min-w-0） */}
          {grouped.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              まだ登録がありません。「現在のタブを保存」または「手動で追加」を押してください。
            </div>
          ) : (
            <Accordion type="multiple" defaultValue={host ? [host] : undefined} className="w-full min-w-0">
              {grouped.map(([h, list]) => (
                <AccordionItem key={h} value={h}>
                  <AccordionTrigger className="text-left">
                    <div className="flex items-center gap-2 min-w-0 w-full">
                      <Globe className="h-4 w-4 shrink-0" />
                      <span className="font-medium truncate">{h}</span>
                      <Badge variant="secondary" className="shrink-0">{list.length}</Badge>
                      {host === h && <Badge className="bg-primary/15 text-primary border-0 shrink-0">現在のサイト</Badge>}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-2">
                      {list.map((it) => {
                        const urlKey = `${it.id}:url`
                        const urlCopied = copiedKey === urlKey
                        return (
                          <div key={it.id} className="rounded-lg border p-3 space-y-2">
                            {/* 上段 */}
                            <div className="flex items-center gap-2 min-w-0">
                              {it.favicon ? (
                                <img src={it.favicon} alt="" className="h-4 w-4 rounded-sm shrink-0 object-contain" />
                              ) : (
                                <LinkIcon className="h-4 w-4 opacity-70 shrink-0" />
                              )}
                              <span className="font-medium truncate">
                                {it.displayName || it.title || it.url}
                              </span>
                              <div className="ml-auto flex items-center gap-1 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => togglePin(it.id)}
                                  title={it.pinned ? "ピンを外す" : "ピン留め"}
                                >
                                  {it.pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
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
                                  onClick={() => deleteBookmark(it.id)}
                                  title="削除"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            {/* URL 行：Input を使い、横スクロール/崩れを防止 */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="shrink-0 text-muted-foreground w-14 text-xs">URL</span>
                              <Input
                                readOnly
                                value={it.url}
                                className="h-8 font-mono flex-1 min-w-0"
                                onFocus={(e) => e.currentTarget.select()}
                              />
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => copyUrl(it.id, it.url)}
                                title="URLをコピー"
                              >
                                {urlCopied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => openUrl(it.url)}
                                title="開く"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </div>

                            {(it.displayName || it.note) && (
                              <div className="grid gap-1 text-xs text-muted-foreground">
                                {it.displayName && <div className="break-words">表示名: {it.displayName}</div>}
                                {it.note && (
                                  <div className="whitespace-pre-wrap break-words">
                                    メモ: {it.note}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}

          {/* 編集ダイアログ（幅・高さとも安全） */}
          <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
            <DialogContent className="w-[360px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>ブックマークを編集</DialogTitle>
              </DialogHeader>
              {editing && (
                <BookmarkForm
                  initial={{
                    url: editing.url,
                    host: editing.host,
                    title: editing.title ?? "",
                    displayName: editing.displayName ?? "",
                    note: editing.note ?? "",
                    favicon: editing.favicon ?? "",
                  }}
                  onSubmit={async (vals) =>
                    updateBookmark({
                      ...editing,
                      url: vals.url.trim(),
                      host: vals.host.trim() || new URL(vals.url).host,
                      title: vals.title?.trim() || undefined,
                      displayName: vals.displayName?.trim() || undefined,
                      note: vals.note?.trim() || undefined,
                      favicon: vals.favicon?.trim() || undefined,
                    })
                  }
                />
              )}
            </DialogContent>
          </Dialog>

          {/* ファイル入力（隠し） */}
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
      </CardContent>
    </Card>
  )
}
