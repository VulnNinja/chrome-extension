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
  Plus,
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
  tags?: string[]
  order?: number
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = "bm.items.v2"
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

/* ========= helpers ========= */
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
    const key = it.host
    if (!byHost.has(key)) byHost.set(key, [])
    byHost.get(key)!.push(it)
  }
  for (const list of byHost.values()) {
    list.sort((a, b) => {
      const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
      if (pinDiff !== 0) return pinDiff
      const ao = a.order ?? Number.MAX_SAFE_INTEGER
      const bo = b.order ?? Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
      return b.updatedAt - a.updatedAt
    })
  }
  const entries = Array.from(byHost.entries())
  entries.sort((a, b) => {
    const A = a[0].replace(/^\./, "")
    const B = b[0].replace(/^\./, "")
    const CH = (currentHost ?? "").replace(/^\./, "")
    if (CH && A === CH) return -1
    if (CH && B === CH) return 1
    return A.localeCompare(B)
  })
  return entries
}

function collectAllTags(items: BookmarkItem[]) {
  const m = new Map<string, number>()
  for (const it of items) for (const t of it.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1)
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
}

/* ========= Tag input ========= */
function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}) {
  const [text, setText] = useState("")
  const addFromText = () => {
    const t = text.trim()
    if (!t) return
    if (!value.includes(t)) onChange([...value, t])
    setText("")
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2">
      {value.map((t) => (
        <Badge key={t} variant="secondary" className="shrink-0">
          {t}
          <button
            className="ml-1 text-xs opacity-70 hover:opacity-100"
            onClick={(e) => {
              e.preventDefault()
              onChange(value.filter((x) => x !== t))
            }}
            aria-label={`${t} を削除`}
          >
            ×
          </button>
        </Badge>
      ))}
      <input
        className="min-w-[80px] flex-1 bg-transparent outline-none text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
            e.preventDefault()
            addFromText()
          } else if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={addFromText}
        placeholder={placeholder}
      />
    </div>
  )
}

/* ========= Add/Edit Form (controlled/unstyled save) ========= */
type FormVals = {
  url: string
  host: string
  title: string
  displayName: string
  note: string
  favicon?: string
  tags: string[]
}
function BookmarkForm({
  initial,
  onSubmit,
  value,
  onChange,
}: {
  initial: FormVals
  onSubmit: (vals: FormVals) => Promise<void> | void
  value?: FormVals
  onChange?: (vals: FormVals) => void
}) {
  const [inner, setInner] = useState<FormVals>(initial)
  const vals = value ?? inner
  useEffect(() => {
    if (!value) setInner(initial)
  }, [initial, value])

  const setVals = (patch: Partial<FormVals>) => {
    const next = { ...vals, ...patch }
    if (onChange) onChange(next)
    else setInner(next)
  }

  const onUrlBlur = () => {
    try {
      if (!vals.host && vals.url) {
        const u = new URL(vals.url)
        setVals({ host: u.host })
      }
    } catch { }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          const u = new URL(vals.url.trim())
          await onSubmit({
            ...vals,
            url: u.toString(),
            host: (vals.host || u.host).trim(),
          })
        } catch {
          /* ignore invalid URL */
        }
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="url">URL</Label>
        <Input
          id="url"
          value={vals.url}
          onChange={(e) => setVals({ url: e.target.value })}
          onBlur={onUrlBlur}
          placeholder="https://example.com/page"
          required
          className="font-mono"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="host">ホスト</Label>
        <Input
          id="host"
          value={vals.host}
          onChange={(e) => setVals({ host: e.target.value })}
          placeholder="example.com（未入力ならURLから自動）"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="title">ページタイトル（任意）</Label>
        <Input
          id="title"
          value={vals.title}
          onChange={(e) => setVals({ title: e.target.value })}
          placeholder="自動取得タイトルや任意の文字列"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="displayName">表示名（任意）</Label>
        <Input
          id="displayName"
          value={vals.displayName}
          onChange={(e) => setVals({ displayName: e.target.value })}
          placeholder="一覧での表示名"
        />
      </div>
      <div className="grid gap-2">
        <Label>カテゴリ / タグ</Label>
        <TagInput
          value={vals.tags}
          onChange={(tags) => setVals({ tags })}
          placeholder="Enter / , / Tab で追加"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="note">メモ（任意）</Label>
        <Textarea
          id="note"
          value={vals.note}
          onChange={(e) => setVals({ note: e.target.value })}
          placeholder="補足・TODO・参照情報など"
          rows={3}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="favicon">ファビコンURL（任意）</Label>
        <Input
          id="favicon"
          value={vals.favicon ?? ""}
          onChange={(e) => setVals({ favicon: e.target.value })}
          placeholder="https://example.com/favicon.ico"
        />
      </div>
      <DialogFooter className="mt-2">
        <Button type="submit">保存</Button>
      </DialogFooter>
    </form>
  )
}

/* ========= Inline Editable text ========= */
function InlineEditable({
  value,
  placeholder,
  onSave,
  monospace = false,
  title,
}: {
  value: string
  placeholder?: string
  onSave: (next: string) => void
  monospace?: boolean
  title?: string
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])

  const commit = () => {
    const v = text.trim()
    if (v !== value) onSave(v)
    setEditing(false)
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") setEditing(false)
        }}
        onBlur={commit}
        className={`h-8 ${monospace ? "font-mono" : ""}`}
        placeholder={placeholder}
        title={title}
      />
    )
  }
  return (
    <button
      type="button"
      className={`text-left truncate w-full ${monospace ? "font-mono" : ""}`}
      title="Alt+クリックで編集"
      onClick={(e) => {
        if (e.altKey) setEditing(true)
      }}
    >
      <span className="truncate" title={title ?? value}>
        {value || placeholder || "(未設定)"}
      </span>
    </button>
  )
}

/* ========= Main Component ========= */
export default function BookmarkManager() {
  const [items, setItems] = useState<BookmarkItem[]>([])
  const [host, setHost] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const statusTimerRef = useRef<number | null>(null)

  // Quick Add ダイアログ（現在タブを事前入力）
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickVals, setQuickVals] = useState<FormVals>({
    url: "",
    host: "",
    title: "",
    displayName: "",
    note: "",
    favicon: "",
    tags: [],
  })

  // 手動追加/編集
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<BookmarkItem | null>(null)

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copyTimerRef = useRef<number | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [activeTags, setActiveTags] = useState<string[]>([])

  // DnD
  const dragItemRef = useRef<{ id: string; host: string } | null>(null)

  useEffect(() => {
    ; (async () => {
      const all = await storage.getAll()
      setItems(all)
      const meta = await getActiveTabMeta()
      setHost(meta?.host ?? null)
    })()
    return () => {
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    }
  }, [])

  const allTags = useMemo(() => collectAllTags(items), [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      const textHit =
        !q ||
        [it.host, it.url, it.title ?? "", it.displayName ?? "", it.note ?? "", ...(it.tags ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(q)
      const tagHit = activeTags.length === 0 || activeTags.every((t) => (it.tags ?? []).includes(t))
      return textHit && tagHit
    })
  }, [items, search, activeTags])

  const grouped = useMemo(() => groupAndSort(filtered, host), [filtered, host])

  const showStatus = (msg: string) => {
    setStatus(msg)
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
    statusTimerRef.current = window.setTimeout(() => setStatus(null), 1400)
  }

  const persist = async (next: BookmarkItem[], msg?: string) => {
    setItems(next)
    await storage.setAll(next)
    if (msg) showStatus(msg)
  }

  const calcNextOrderInHost = (hostKey: string) => {
    const list = items.filter((x) => x.host === hostKey)
    if (list.length === 0) return 0
    const max = Math.max(...list.map((x) => x.order ?? 0))
    return max + 1
  }

  const openQuickAdd = async () => {
    const meta = await getActiveTabMeta()
    const base: FormVals = {
      url: meta?.url ?? "",
      host: meta?.host ?? (meta?.url ? new URL(meta.url).host : ""),
      title: meta?.title ?? "",
      displayName: meta?.title || meta?.host || "",
      note: "",
      favicon: meta?.favicon ?? "",
      tags: [],
    }
    setQuickVals(base)
    setQuickOpen(true)
  }

  const quickSaveIfValid = async () => {
    const d = quickVals
    try {
      const u = new URL(d.url)
      const now = Date.now()
      const hostKey = (d.host || u.host).trim()
      const order = calcNextOrderInHost(hostKey)
      const bm: BookmarkItem = {
        id: crypto.randomUUID(),
        url: u.toString(),
        host: hostKey,
        title: d.title?.trim() || undefined,
        displayName: d.displayName?.trim() || undefined,
        note: d.note?.trim() || undefined,
        favicon: d.favicon?.trim() || undefined,
        tags: d.tags.map((t) => t.trim()).filter(Boolean),
        pinned: false,
        order,
        createdAt: now,
        updatedAt: now,
      }
      await persist([bm, ...items], "保存しました")
    } catch {
      // 無効URLは保存しない
    }
  }

  const addBookmark = async (b: Omit<BookmarkItem, "id" | "createdAt" | "updatedAt" | "pinned" | "order">) => {
    const now = Date.now()
    const order = calcNextOrderInHost(b.host)
    const bm: BookmarkItem = { id: crypto.randomUUID(), pinned: false, order, createdAt: now, updatedAt: now, ...b }
    await persist([bm, ...items], "保存しました")
    setAddOpen(false)
  }

  const updateBookmark = async (patch: BookmarkItem) => {
    const next = items.map((it) => (it.id === patch.id ? { ...patch, updatedAt: Date.now() } : it))
    await persist(next, "更新しました")
    setEditing(null)
  }

  const inlineUpdate = async (id: string, patch: Partial<BookmarkItem>) => {
    const next = items.map((it) => (it.id === id ? { ...it, ...patch, updatedAt: Date.now() } : it))
    await persist(next)
  }

  const deleteBookmark = async (id: string) => {
    await persist(items.filter((x) => x.id !== id), "削除しました")
  }

  const togglePin = async (id: string) => {
    await inlineUpdate(id, { pinned: !items.find((x) => x.id === id)?.pinned })
  }

  const copyUrl = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedKey(`${id}:url`)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 900)
      showStatus("コピーしました")
    } catch {
      showStatus("コピー失敗")
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
          order: typeof x.order === "number" ? x.order : 0,
          tags: Array.isArray(x.tags) ? x.tags.filter(Boolean) : [],
          createdAt: Number(x.createdAt ?? Date.now()),
          updatedAt: Number(x.updatedAt ?? Date.now()),
        }))
      await persist(cleaned, "インポート完了")
    } catch {
      showStatus("インポート失敗")
    }
  }

  // DnD（同一ホスト内）
  const onDragStart = (e: React.DragEvent, it: BookmarkItem) => {
    dragItemRef.current = { id: it.id, host: it.host }
    e.dataTransfer.effectAllowed = "move"
    e.currentTarget.classList.add("opacity-60")
  }
  const onDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("opacity-60")
    dragItemRef.current = null
  }
  const onDragOver = (e: React.DragEvent, it: BookmarkItem) => {
    if (!dragItemRef.current) return
    if (dragItemRef.current.host !== it.host) return
    e.preventDefault()
  }
  const onDrop = (e: React.DragEvent, it: BookmarkItem) => {
    e.preventDefault()
    const drag = dragItemRef.current
    if (!drag || drag.host !== it.host || drag.id === it.id) return
    const list = items.filter((x) => x.host === it.host).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const others = items.filter((x) => x.host !== it.host)
    const dragIdx = list.findIndex((x) => x.id === drag.id)
    const overIdx = list.findIndex((x) => x.id === it.id)
    if (dragIdx < 0 || overIdx < 0) return
    const moved = list.splice(dragIdx, 1)[0]
    list.splice(overIdx, 0, moved)
    const reindexed = list.map((x, i) => ({ ...x, order: i, updatedAt: Date.now() }))
    const next = [...others, ...reindexed]
    persist(next, "並び替え")
  }

  /* ===== Render ===== */
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">ブックマーク</CardTitle>
      </CardHeader>

      <CardContent className="grid gap-4 overflow-x-hidden">
        <div className="w-full min-w-0 space-y-4">
          {/* ヘッダー（長いホスト対策） */}
          <div className="rounded-xl border p-3 bg-muted/30">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-sm min-w-0">
              <div className="flex items-center gap-2 shrink-0">
                <Globe className="h-4 w-4" />
                <span className="text-muted-foreground">Host:</span>
              </div>
              <span className="truncate" title={host ?? ""}>{host ?? "現在のサイトを取得できませんでした"}</span>
              {host && <Badge variant="secondary" className="justify-self-end shrink-0">このサイト</Badge>}
            </div>
            {status && <div className="mt-2 text-xs"><Badge>{status}</Badge></div>}
          </div>

          {/* ツールバー */}
          <div className="flex flex-col gap-3 w-full min-w-0">
            <div className="relative w-full min-w-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="検索（URL / タイトル / 表示名 / メモ / ホスト / タグ）"
                className="pl-8 w-full"
              />
            </div>

            {/* タグフィルター */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <Button
                variant={activeTags.length === 0 ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTags([])}
                className="shrink-0"
                title="全て表示"
              >
                すべて
              </Button>
              {allTags.map(([tag, count]) => {
                const active = activeTags.includes(tag)
                return (
                  <Button
                    key={tag}
                    variant={active ? "default" : "outline"}
                    size="sm"
                    className="shrink-0"
                    onClick={() =>
                      setActiveTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                      )
                    }
                    title={`タグ: ${tag}`}
                  >
                    <span className="truncate max-w-[120px]">{tag}</span>
                    <Badge variant="secondary" className="ml-2">{count}</Badge>
                  </Button>
                )
              })}
            </div>

            <div className="flex items-center gap-2 w-full min-w-0">
              {/* 追加（現在タブを編集して保存）— コンパクト: アイコンのみ */}
              <Button
                size="sm"
                className="shrink-0"
                title="現在のタブを追加"
                onClick={openQuickAdd}
              >
                <BookmarkPlus className="h-4 w-4" />
              </Button>

              {/* 手動追加（空のフォーム）— コンパクト: アイコンのみ */}
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="shrink-0" title="手動で追加">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[360px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>ブックマークを追加</DialogTitle>
                  </DialogHeader>
                  <BookmarkForm
                    initial={{ url: "", host: host ?? "", title: "", displayName: "", note: "", favicon: "", tags: [] }}
                    onSubmit={async (vals) =>
                      addBookmark({
                        url: vals.url.trim(),
                        host: vals.host.trim() || new URL(vals.url).host,
                        title: vals.title?.trim() || undefined,
                        displayName: vals.displayName?.trim() || undefined,
                        note: vals.note?.trim() || undefined,
                        favicon: vals.favicon?.trim() || undefined,
                        tags: vals.tags.map((t) => t.trim()).filter(Boolean),
                      })
                    }
                  />
                </DialogContent>
              </Dialog>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="ml-auto shrink-0" title="インポート/エクスポート">
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

          {/* 一覧 */}
          {grouped.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              まだ登録がありません。「ブックマーク追加」ボタンから作成してください。
            </div>
          ) : (
            <Accordion type="multiple" defaultValue={host ? [host] : undefined} className="w-full min-w-0">
              {grouped.map(([h, list]) => (
                <AccordionItem key={h} value={h}>
                  <AccordionTrigger className="text-left">
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 w-full min-w-0">
                      <Globe className="h-4 w-4 shrink-0" />
                      <span className="font-medium truncate" title={h}>{h}</span>
                      <Badge variant="secondary" className="justify-self-end shrink-0">{list.length}</Badge>
                      {host && h.replace(/^\./, "") === host.replace(/^\./, "") && (
                        <Badge className="bg-primary/15 text-primary border-0 justify-self-end shrink-0">現在のサイト</Badge>
                      )}
                    </div>
                  </AccordionTrigger>

                  <AccordionContent>
                    <div className="flex flex-col gap-2">
                      {list.map((it) => {
                        const urlKey = `${it.id}:url`
                        const urlCopied = copiedKey === urlKey
                        return (
                          <div
                            key={it.id}
                            className="rounded-lg border p-3 space-y-2 bg-background"
                            draggable
                            onDragStart={(e) => onDragStart(e, it)}
                            onDragEnd={(e) => onDragEnd(e)}
                            onDragOver={(e) => onDragOver(e, it)}
                            onDrop={(e) => onDrop(e, it)}
                          >
                            {/* 上段：表示名（Alt+クリック編集） + 操作 */}
                            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 min-w-0">
                              <InlineEditable
                                value={it.displayName || it.title || it.url}
                                placeholder="(表示名)"
                                onSave={(v) => inlineUpdate(it.id, { displayName: v })}
                                title="Alt+クリックで編集 / Enter・フォーカス外しで保存"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 justify-self-end"
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
                                title="詳細編集"
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

                            {/* URL 行（Alt+クリック編集可） */}
                            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 min-w-0">
                              <span className="shrink-0 text-muted-foreground w-14 text-xs">URL</span>
                              <InlineEditable
                                value={it.url}
                                onSave={(v) => {
                                  try {
                                    const u = new URL(v.trim())
                                    inlineUpdate(it.id, { url: u.toString(), host: u.host })
                                  } catch {
                                    /* ignore */
                                  }
                                }}
                                monospace
                                title={it.url}
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

                            {/* タグ */}
                            {(it.tags?.length ?? 0) > 0 && (
                              <div className="flex flex-wrap items-center gap-2">
                                {it.tags!.map((t) => {
                                  const active = activeTags.includes(t)
                                  return (
                                    <Badge
                                      key={t}
                                      variant={active ? "default" : "secondary"}
                                      className="cursor-pointer"
                                      onClick={() =>
                                        setActiveTags((prev) =>
                                          prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                                        )
                                      }
                                      title={active ? "フィルター解除" : "このタグでフィルター"}
                                    >
                                      {t}
                                    </Badge>
                                  )
                                })}
                              </div>
                            )}

                            {/* メモ */}
                            {it.note && (
                              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 min-w-0">
                                <span className="shrink-0 text-muted-foreground w-14 text-xs pt-0.5">メモ</span>
                                <span className="whitespace-pre-wrap break-words" title={it.note}>{it.note}</span>
                              </div>
                            )}

                            {/* ホスト/アイコン */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {it.favicon ? (
                                <img src={it.favicon} alt="" className="h-4 w-4 rounded-sm object-contain" />
                              ) : (
                                <LinkIcon className="h-4 w-4 opacity-70" />
                              )}
                              <span className="truncate" title={it.host}>{it.host}</span>
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
        </div>

        {/* Quick Add ダイアログ（モーダル／閉じる＝自動保存） */}
        <Dialog
          open={quickOpen}
          onOpenChange={async (open) => {
            if (!open) {
              await quickSaveIfValid()
            }
            setQuickOpen(open)
          }}
        >
          <DialogContent className="w-[360px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>ブックマークを追加</DialogTitle>
            </DialogHeader>
            <BookmarkForm
              initial={quickVals}
              value={quickVals}
              onChange={setQuickVals}
              onSubmit={async (vals) => {
                try {
                  const u = new URL(vals.url.trim())
                  const hostKey = (vals.host || u.host).trim()
                  const now = Date.now()
                  const order = calcNextOrderInHost(hostKey)
                  await addBookmark({
                    url: u.toString(),
                    host: hostKey,
                    title: vals.title?.trim() || undefined,
                    displayName: vals.displayName?.trim() || undefined,
                    note: vals.note?.trim() || undefined,
                    favicon: vals.favicon?.trim() || undefined,
                    tags: vals.tags.map((t) => t.trim()).filter(Boolean),
                  })
                  // 保存後閉じる
                  setQuickOpen(false)
                } catch {
                  /* ignore invalid URL */
                }
              }}
            />
          </DialogContent>
        </Dialog>

        {/* 編集ダイアログ */}
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
                  tags: editing.tags ?? [],
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
                    tags: vals.tags.map((t) => t.trim()).filter(Boolean),
                  })
                }
              />
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
