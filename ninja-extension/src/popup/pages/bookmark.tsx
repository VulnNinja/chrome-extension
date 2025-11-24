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
  Link as LinkIcon,
  Pencil,
  Pin,
  PinOff,
  Search,
  Trash2,
  Upload,
  Download,
  Plus,
  Folder,
  FolderPlus,
  ArrowLeftRight,
  FolderEdit,
  FolderMinus,
} from "lucide-react"

/* ========= Types & storage ========= */
type BookmarkItem = {
  id: string
  url: string
  host: string
  displayName?: string
  note?: string
  favicon?: string
  pinned?: boolean
  tags?: string[]
  order?: number
  directory?: string
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = "bm.items.v2"
const DIRS_KEY = "bm.dirs.v1"
const chromeApi = (globalThis as any)?.chrome

const storage = {
  async getAll(): Promise<BookmarkItem[]> {
    try {
      if (chromeApi?.storage?.local) {
        const obj = await chromeApi.storage.local.get(STORAGE_KEY)
        return (obj?.[STORAGE_KEY] as BookmarkItem[] | undefined) ?? []
      }
    } catch { /* ignore */ }
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as BookmarkItem[]) : []
  },
  async setAll(items: BookmarkItem[]) {
    try {
      if (chromeApi?.storage?.local) {
        await chromeApi.storage.local.set({ [STORAGE_KEY]: items })
        return
      }
    } catch { /* ignore */ }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  },
  async getDirs(): Promise<string[]> {
    try {
      if (chromeApi?.storage?.local) {
        const obj = await chromeApi.storage.local.get(DIRS_KEY)
        const arr = (obj?.[DIRS_KEY] as string[] | undefined) ?? [""]
        return Array.from(new Set(arr.map((d) => (d ?? "").trim())))
      }
    } catch { /* ignore */ }
    const raw = localStorage.getItem(DIRS_KEY)
    return raw ? Array.from(new Set((JSON.parse(raw) as string[]).map((d) => (d ?? "").trim()))) : [""]
  },
  async setDirs(dirs: string[]) {
    const unique = Array.from(new Set(dirs.map((d) => (d ?? "").trim())))
    try {
      if (chromeApi?.storage?.local) {
        await chromeApi.storage.local.set({ [DIRS_KEY]: unique })
        return
      }
    } catch { /* ignore */ }
    localStorage.setItem(DIRS_KEY, JSON.stringify(unique))
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

function orderByEntryRules(list: BookmarkItem[]) {
  list.sort((a, b) => {
    const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
    if (pinDiff !== 0) return pinDiff
    const ao = a.order ?? Number.MAX_SAFE_INTEGER
    const bo = b.order ?? Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return b.updatedAt - a.updatedAt
  })
}

/** group by directories using provided directory order, including empty dirs */
function groupByDirectory(items: BookmarkItem[], dirs: string[]) {
  const map = new Map<string, BookmarkItem[]>()
  for (const it of items) {
    const key = (it.directory ?? "").trim()
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(it)
  }
  for (const arr of map.values()) orderByEntryRules(arr)

  const known = new Set(dirs)
  const pairs: Array<[string, BookmarkItem[]]> = []
  for (const d of dirs) {
    const arr = map.get(d) ?? []
    pairs.push([d, arr]) // include even if empty
  }
  for (const [k, v] of map.entries()) {
    if (!known.has(k)) pairs.push([k, v])
  }
  return pairs
}

function collectAllTags(items: BookmarkItem[]) {
  const m = new Map<string, number>()
  for (const it of items) for (const t of it.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1)
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
}

function collectAllDirs(items: BookmarkItem[], dirs: string[]) {
  const fromItems = new Set<string>()
  for (const it of items) fromItems.add((it.directory ?? "").trim())
  const merged = Array.from(new Set([...dirs, ...Array.from(fromItems)]))
  return merged
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

/* ========= Add/Edit Form ========= */
type FormVals = {
  url: string
  host: string
  displayName: string
  note: string
  favicon?: string
  tags: string[]
  directory: string
}

function DirectoryInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <div className="grid gap-1">
      <Input
        list="bm-dir-list"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(text.trim())}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            onChange(text.trim())
          }
        }}
        placeholder={placeholder}
      />
      <datalist id="bm-dir-list">
        {options.map((d) => (
          <option key={d || "(未分類)"} value={d} />
        ))}
      </datalist>
      <span className="text-[11px] text-muted-foreground">
        例) <span className="font-mono">work/sec</span> ・ <span className="font-mono">personal</span> ・（空なら未分類）
      </span>
    </div>
  )
}

function BookmarkForm({
  initial,
  onSubmit,
  value,
  onChange,
  dirOptions,
}: {
  initial: FormVals
  onSubmit: (vals: FormVals) => Promise<void> | void
  value?: FormVals
  onChange?: (vals: FormVals) => void
  dirOptions: string[]
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
    } catch { /* ignore */ }
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
        <Label htmlFor="displayName">表示名（任意）</Label>
        <Input
          id="displayName"
          value={vals.displayName}
          onChange={(e) => setVals({ displayName: e.target.value })}
          placeholder="一覧での表示名（未入力ならURLを表示）"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="host">ホスト（自動推定）</Label>
        <Input
          id="host"
          value={vals.host}
          onChange={(e) => setVals({ host: e.target.value })}
          placeholder="example.com（未入力ならURLから自動）"
        />
      </div>

      <div className="grid gap-2">
        <Label>ディレクトリ</Label>
        <DirectoryInput
          value={vals.directory}
          onChange={(v) => setVals({ directory: v })}
          options={dirOptions}
          placeholder="work/sec など。空なら未分類"
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

/* ========= Inline Editable ========= */
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

/* ========= Toast ========= */
type Tone = "success" | "error" | "info"
function StatusOverlay({ status }: { status: { text: string; tone: Tone } | null }) {
  if (!status) return null
  const toneStyles: Record<Tone, string> = {
    success: "border-emerald-500/30 text-emerald-900 dark:text-emerald-100 bg-emerald-500/10",
    error: "border-red-500/30 text-red-900 dark:text-red-100 bg-red-500/10",
    info: "border-muted-foreground/30 text-foreground bg-muted/70",
  }
  const dot: Record<Tone, string> = {
    success: "bg-emerald-500",
    error: "bg-red-500",
    info: "bg-foreground/60",
  }
  return (
    <div className="fixed inset-x-0 bottom-2 z-[9999] px-2 pointer-events-none" aria-live="polite" role="status">
      <div className={`mx-auto w-full max-w-[420px] px-3 py-2 rounded-md border text-sm shadow-sm backdrop-blur ${toneStyles[status.tone]}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dot[status.tone]}`} />
          <span className="whitespace-pre-wrap">{status.text}</span>
        </div>
      </div>
    </div>
  )
}

/* ========= Move Dialog (no prompt) ========= */
function MoveDialog({
  open,
  onOpenChange,
  dirOptions,
  initialDir,
  onMove,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  dirOptions: string[]
  initialDir: string
  onMove: (dir: string) => void
}) {
  const [dir, setDir] = useState(initialDir)
  const [newDir, setNewDir] = useState("")
  useEffect(() => {
    setDir(initialDir)
    setNewDir("")
  }, [initialDir, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[360px]">
        <DialogHeader>
          <DialogTitle>ディレクトリへ移動</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label>既存のディレクトリ</Label>
            <Input
              list="bm-dir-list-move"
              value={dir}
              onChange={(e) => setDir(e.target.value)}
              placeholder="選択または入力"
            />
            <datalist id="bm-dir-list-move">
              {dirOptions.map((d) => (
                <option key={d || "(未分類)"} value={d} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-2">
            <Label>新しいディレクトリ（任意）</Label>
            <Input
              value={newDir}
              onChange={(e) => setNewDir(e.target.value)}
              placeholder="ここに入力すると新規作成して移動"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button
            onClick={() => {
              const target = (newDir.trim() || dir).trim()
              onMove(target)
              onOpenChange(false)
            }}
          >
            移動
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ========= Main Component ========= */
export default function BookmarkManager() {
  const [items, setItems] = useState<BookmarkItem[]>([])
  const [dirs, setDirs] = useState<string[]>([""])
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<{ text: string; tone: Tone } | null>(null)
  const statusTimerRef = useRef<number | null>(null)

  // Quick Add
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickVals, setQuickVals] = useState<FormVals>({
    url: "",
    host: "",
    displayName: "",
    note: "",
    favicon: "",
    tags: [],
    directory: "",
  })

  // Add/Edit dialog
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<BookmarkItem | null>(null)

  // Delete confirms (items)
  const [confirmAllOpen, setConfirmAllOpen] = useState(false)
  // Directory remove/rename
  const [confirmDirRemove, setConfirmDirRemove] = useState<{ dir: string; count: number } | null>(null)
  const [renameDir, setRenameDir] = useState<{ dir: string } | null>(null)
  const [renameDirName, setRenameDirName] = useState("")

  // New dir dialog
  const [newDirOpen, setNewDirOpen] = useState(false)
  const [newDirName, setNewDirName] = useState("")

  // Move dialog
  const [moveOpen, setMoveOpen] = useState(false)
  const moveTargetRef = useRef<BookmarkItem | null>(null)

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copyTimerRef = useRef<number | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [activeTags, setActiveTags] = useState<string[]>([])

  // DnD (bookmarks)
  const dragItemRef = useRef<{ id: string; directory: string } | null>(null)
  // DnD (directories)
  const dragDirRef = useRef<string | null>(null)

  useEffect(() => {
    ; (async () => {
      const all = await storage.getAll()
      const loadedDirs = await storage.getDirs()
      const mergedDirs = collectAllDirs(all, loadedDirs)
      setItems(all.map((x) => ({ ...x, directory: (x.directory ?? "").trim() })))
      setDirs(mergedDirs)
    })()
    return () => {
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    }
  }, [])

  const allTags = useMemo(() => collectAllTags(items), [items])
  const dirOptions = useMemo(() => collectAllDirs(items, dirs), [items, dirs])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      const textHit =
        !q ||
        [it.directory ?? "", it.host, it.url, it.displayName ?? "", it.note ?? "", ...(it.tags ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(q)
      const tagHit = activeTags.length === 0 || activeTags.every((t) => (it.tags ?? []).includes(t))
      return textHit && tagHit
    })
  }, [items, search, activeTags])

  const grouped = useMemo(() => groupByDirectory(filtered, dirOptions), [filtered, dirOptions])

  const showStatus = (text: string, tone: Tone = "info") => {
    setStatus({ text, tone })
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
    statusTimerRef.current = window.setTimeout(() => setStatus(null), 1400)
  }

  const persist = async (next: BookmarkItem[], msg?: string, tone: Tone = "success") => {
    setItems(next)
    await storage.setAll(next)
    if (msg) showStatus(msg, tone)
  }

  const persistDirs = async (next: string[], msg?: string, tone: Tone = "info") => {
    const unique = Array.from(new Set(next.map((d) => (d ?? "").trim())))
    setDirs(unique)
    await storage.setDirs(unique)
    if (msg) showStatus(msg, tone)
  }

  const ensureDirExists = async (dirName: string) => {
    const d = (dirName ?? "").trim()
    if (!dirOptions.includes(d)) {
      await persistDirs([...dirOptions, d])
    }
  }

  const calcNextOrderInDir = (dirKey: string) => {
    const list = items.filter((x) => (x.directory ?? "") === dirKey)
    if (list.length === 0) return 0
    const max = Math.max(...list.map((x) => x.order ?? 0))
    return max + 1
  }

  const openQuickAdd = async () => {
    const meta = await getActiveTabMeta()
    const base: FormVals = {
      url: meta?.url ?? "",
      host: meta?.host ?? (meta?.url ? new URL(meta.url).host : ""),
      displayName: meta?.title || meta?.host || "",
      note: "",
      favicon: meta?.favicon ?? "",
      tags: [],
      directory: "",
    }
    setQuickVals(base)
    setQuickOpen(true)
  }

  const quickSaveIfValid = async () => {
    const d = quickVals
    try {
      const u = new URL(d.url)
      const now = Date.now()
      const dirKey = (d.directory ?? "").trim()
      const order = calcNextOrderInDir(dirKey)
      const bm: BookmarkItem = {
        id: crypto.randomUUID(),
        url: u.toString(),
        host: (d.host || u.host).trim(),
        displayName: d.displayName?.trim() || undefined,
        note: d.note?.trim() || undefined,
        favicon: d.favicon?.trim() || undefined,
        tags: d.tags.map((t) => t.trim()).filter(Boolean),
        directory: dirKey,
        pinned: false,
        order,
        createdAt: now,
        updatedAt: now,
      }
      await ensureDirExists(dirKey)
      await persist([bm, ...items], "保存しました", "success")
    } catch { /* invalid URL = ignore */ }
  }

  const addBookmark = async (b: Omit<BookmarkItem, "id" | "createdAt" | "updatedAt" | "pinned" | "order">) => {
    const now = Date.now()
    const dirKey = (b.directory ?? "").trim()
    const order = calcNextOrderInDir(dirKey)
    const bm: BookmarkItem = { id: crypto.randomUUID(), pinned: false, order, createdAt: now, updatedAt: now, ...b, directory: dirKey }
    await ensureDirExists(dirKey)
    await persist([bm, ...items], "保存しました", "success")
    setAddOpen(false)
  }

  const updateBookmark = async (patch: BookmarkItem) => {
    const dirKey = (patch.directory ?? "").trim()
    await ensureDirExists(dirKey)
    const next = items.map((it) => (it.id === patch.id ? { ...patch, updatedAt: Date.now(), directory: dirKey } : it))
    await persist(next, "更新しました", "success")
    setEditing(null)
  }

  const inlineUpdate = async (id: string, patch: Partial<BookmarkItem>) => {
    const tidx = items.findIndex((x) => x.id === id)
    if (tidx < 0) return
    const next = [...items]
    const merged = { ...next[tidx], ...patch, updatedAt: Date.now() } as BookmarkItem
    next[tidx] = merged
    if (patch.directory !== undefined) {
      const dirKey = (patch.directory ?? "").trim()
      await ensureDirExists(dirKey)
    }
    await persist(next)
  }

  const deleteBookmark = async (id: string) => {
    await persist(items.filter((x) => x.id !== id), "削除しました", "info")
  }

  const copyUrl = async (_id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedKey(`${_id}:url`)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 900)
      showStatus("コピーしました", "success")
    } catch {
      showStatus("コピー失敗", "error")
    }
  }

  const openUrl = async (url: string) => {
    try {
      if (chromeApi?.tabs?.create) await chromeApi.tabs.create({ url })
      else window.open(url, "_blank")
    } catch { /* ignore */ }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `bookmarks-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showStatus("エクスポートしました", "success")
  }

  const importJson = async (file: File) => {
    const text = await file.text()
    try {
      const parsed = JSON.parse(text) as BookmarkItem[]
      const cleaned = parsed
        .filter((x) => x.url && (x.host || (() => { try { return !!new URL(x.url).host } catch { return false } })()))
        .map((x) => {
          let host = x.host
          if (!host) {
            try { host = new URL(x.url).host } catch { host = "" }
          }
          return {
            ...x,
            id: x.id ?? crypto.randomUUID(),
            host,
            pinned: !!x.pinned,
            order: typeof x.order === "number" ? x.order : 0,
            tags: Array.isArray(x.tags) ? x.tags.filter(Boolean) : [],
            directory: (x.directory ?? "").trim(),
            createdAt: Number(x.createdAt ?? Date.now()),
            updatedAt: Number(x.updatedAt ?? Date.now()),
          } as BookmarkItem
        })
      const dirsInFile = collectAllDirs(cleaned, dirs)
      await persist(cleaned, "インポート完了", "success")
      await persistDirs(dirsInFile)
    } catch {
      showStatus("インポート失敗", "error")
    }
  }

  /* ===== Directory ops ===== */
  async function renameDirectory(oldName: string, newName: string) {
    const from = (oldName ?? "").trim()
    const to = (newName ?? "").trim()
    if (from === to) { setRenameDir(null); return }
    if (to === "") {
      // rename to root: move all items to "", remove dir from list
      const moved = items.map((x) =>
        (x.directory ?? "").trim() === from ? { ...x, directory: "", updatedAt: Date.now() } : x
      )
      const nextDirs = Array.from(new Set(dirs.map((d) => (d === from ? "" : d))))
      await persist(moved, "ディレクトリ名を変更しました", "success")
      await persistDirs(nextDirs)
      setRenameDir(null)
      return
    }
    if (dirs.includes(to)) {
      showStatus("同名ディレクトリが存在します", "error")
      return
    }
    const nextItems = items.map((x) =>
      (x.directory ?? "").trim() === from ? { ...x, directory: to, updatedAt: Date.now() } : x
    )
    const nextDirs = dirs.map((d) => (d === from ? to : d))
    await persist(nextItems, "ディレクトリ名を変更しました", "success")
    await persistDirs(nextDirs)
    setRenameDir(null)
  }

  async function removeDirectory(dir: string, mode: "move" | "delete") {
    const key = (dir ?? "").trim()
    const remainDirs = dirs.filter((d) => d !== key)
    if (mode === "move") {
      const moved = items.map((x) =>
        (x.directory ?? "").trim() === key ? { ...x, directory: "", updatedAt: Date.now() } : x
      )
      await persist(moved, "未分類へ移動しました", "success")
      await persistDirs(remainDirs, "ディレクトリを削除しました", "info")
    } else {
      const kept = items.filter((x) => (x.directory ?? "").trim() !== key)
      await persist(kept, "中身ごと削除しました", "info")
      await persistDirs(remainDirs, "ディレクトリを削除しました", "info")
    }
    setConfirmDirRemove(null)
  }

  /* ===== DnD: bookmarks (same dir re-order + move onto header) ===== */
  const onDragStart = (e: React.DragEvent, it: BookmarkItem) => {
    dragItemRef.current = { id: it.id, directory: (it.directory ?? "").trim() }
    e.dataTransfer.effectAllowed = "move"
    e.currentTarget.classList.add("opacity-60")
  }
  const onDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("opacity-60")
    dragItemRef.current = null
  }
  const onDragOver = (e: React.DragEvent, it: BookmarkItem) => {
    if (!dragItemRef.current) return
    if (dragItemRef.current.directory !== (it.directory ?? "").trim()) return
    e.preventDefault()
  }
  const onDrop = (e: React.DragEvent, it: BookmarkItem) => {
    e.preventDefault()
    const drag = dragItemRef.current
    const dirKey = (it.directory ?? "").trim()
    if (!drag || drag.directory !== dirKey || drag.id === it.id) return
    const list = items.filter((x) => (x.directory ?? "").trim() === dirKey).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const others = items.filter((x) => (x.directory ?? "").trim() !== dirKey)
    const dragIdx = list.findIndex((x) => x.id === drag.id)
    const overIdx = list.findIndex((x) => x.id === it.id)
    if (dragIdx < 0 || overIdx < 0) return
    const moved = list.splice(dragIdx, 1)[0]
    list.splice(overIdx, 0, moved)
    const reindexed = list.map((x, i) => ({ ...x, order: i, updatedAt: Date.now() }))
    const next = [...others, ...reindexed]
    persist(next, "並び替え", "info")
  }

  // Allow dropping a bookmark onto directory header to MOVE into that directory
  const onHeaderDragOver = (e: React.DragEvent, dirKey: string) => {
    if (!dragItemRef.current) return
    const drag = dragItemRef.current
    if (drag.directory === dirKey) return
    e.preventDefault()
  }
  const onHeaderDrop = (e: React.DragEvent, dirKey: string) => {
    e.preventDefault()
    const drag = dragItemRef.current
    if (!drag) return
    const next = items.map((x) => {
      if (x.id !== drag.id) return x
      return {
        ...x,
        directory: dirKey,
        order: calcNextOrderInDir(dirKey),
        updatedAt: Date.now(),
      }
    })
    persist(next, "ディレクトリへ移動", "info")
  }

  /* ===== DnD: directories reorder ===== */
  const onDirDragStart = (e: React.DragEvent, dirKey: string) => {
    dragDirRef.current = dirKey
    e.dataTransfer.effectAllowed = "move"
    e.currentTarget.classList.add("opacity-60")
  }
  const onDirDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("opacity-60")
    dragDirRef.current = null
  }
  const onDirDragOver = (e: React.DragEvent, dirKey: string) => {
    if (!dragDirRef.current) return
    if (dragDirRef.current === dirKey) return
    e.preventDefault()
  }
  const onDirDrop = (e: React.DragEvent, dirKey: string) => {
    e.preventDefault()
    const drag = dragDirRef.current
    if (!drag || drag === dirKey) return
    const list = [...dirOptions]
    const from = list.indexOf(drag)
    const to = list.indexOf(dirKey)
    if (from < 0 || to < 0) return
    list.splice(to, 0, list.splice(from, 1)[0])
    persistDirs(list, "ディレクトリ並び替え", "info")
  }

  /* ===== Render ===== */
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">ブックマーク</CardTitle>
      </CardHeader>

      <CardContent className="grid gap-4 overflow-x-hidden relative">
        <div className="w-full min-w-0 space-y-4">
          {/* ツールバー */}
          <div className="flex flex-col gap-3 w-full min-w-0">
            <div className="relative w-full min-w-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="検索（ディレクトリ / URL / 表示名 / メモ / ホスト / タグ）"
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
                title="タグフィルター解除"
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
              {/* 現在タブから追加 */}
              <Button size="sm" className="shrink-0" title="現在のタブを追加" onClick={openQuickAdd}>
                <BookmarkPlus className="h-4 w-4" />
              </Button>

              {/* 手動追加 */}
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
                    initial={{ url: "", host: "", displayName: "", note: "", favicon: "", tags: [], directory: "" }}
                    dirOptions={dirOptions}
                    onSubmit={async (vals) =>
                      addBookmark({
                        url: vals.url.trim(),
                        host: vals.host.trim() || new URL(vals.url).host,
                        displayName: vals.displayName?.trim() || undefined,
                        note: vals.note?.trim() || undefined,
                        favicon: vals.favicon?.trim() || undefined,
                        tags: vals.tags.map((t) => t.trim()).filter(Boolean),
                        directory: (vals.directory ?? "").trim(),
                      })
                    }
                  />
                </DialogContent>
              </Dialog>

              {/* ディレクトリ作成 */}
              <Dialog open={newDirOpen} onOpenChange={setNewDirOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="shrink-0" title="新規ディレクトリ">
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[360px]">
                  <DialogHeader>
                    <DialogTitle>新しいディレクトリ</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-2">
                    <Label>名前</Label>
                    <Input
                      value={newDirName}
                      onChange={(e) => setNewDirName(e.target.value)}
                      placeholder="work/sec など。空欄は未分類にはなりません"
                    />
                    <div className="text-xs text-muted-foreground">既存と重複しない名称にしてください。</div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setNewDirOpen(false)}>キャンセル</Button>
                    <Button
                      onClick={async () => {
                        const name = newDirName.trim()
                        if (!name) { showStatus("名前を入力してください", "error"); return }
                        if (dirOptions.includes(name)) { showStatus("既に存在します", "error"); return }
                        await persistDirs([...dirOptions, name], "ディレクトリを作成", "success")
                        setNewDirName("")
                        setNewDirOpen(false)
                      }}
                    >
                      作成
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* インポート / エクスポート / 全削除 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="ml-auto shrink-0" title="インポート/エクスポート/全削除">
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
                  <DropdownMenuItem onClick={() => setConfirmAllOpen(true)}>
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
        </div>

        <Separator />

        {/* ディレクトリ一覧（空でも表示 / 並び替え / ヘッダへドロップ移動） */}
        {grouped.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            まだ登録がありません。「ブックマーク追加」ボタンから作成してください。
          </div>
        ) : (
          <Accordion type="multiple" className="w-full min-w-0">
            {grouped.map(([dirKey, list]) => (
              <AccordionItem key={dirKey || "(root)"} value={dirKey || "(root)"}>
                <AccordionTrigger
                  className="text-left"
                  draggable
                  onDragStart={(e) => onDirDragStart(e, dirKey)}
                  onDragEnd={onDirDragEnd}
                  onDragOver={(e) => onDirDragOver(e, dirKey)}
                  onDrop={(e) => onDirDrop(e, dirKey)}
                >
                  <div
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2 w-full min-w-0"
                    onDragOver={(e) => onHeaderDragOver(e, dirKey)}
                    onDrop={(e) => onHeaderDrop(e, dirKey)}
                    title="ディレクトリをドラッグで並び替え / ブックマークをドロップで移動"
                  >
                    <Folder className="h-4 w-4 shrink-0" />
                    <span className="font-medium truncate" title={dirKey || "未分類"}>{dirKey || "未分類"}</span>
                    <Badge variant="secondary" className="justify-self-end shrink-0">{list.length}</Badge>

                    {/* rename (icon only) */}
                    {dirKey !== "" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="justify-self-end h-8 w-8"
                        onClick={() => {
                          setRenameDir({ dir: dirKey })
                          setRenameDirName(dirKey)
                        }}
                        title="リネーム"
                      >
                        <FolderEdit className="h-4 w-4" />
                      </Button>
                    )}

                    {/* delete dir (icon only) */}
                    {dirKey !== "" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="justify-self-end h-8 w-8"
                        onClick={() => setConfirmDirRemove({ dir: dirKey, count: list.length })}
                        title="ディレクトリ削除"
                      >
                        <FolderMinus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </AccordionTrigger>

                <AccordionContent>
                  {list.length === 0 ? (
                    <div className="text-xs text-muted-foreground p-3 border rounded-md">（空）</div>
                  ) : (
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
                            {/* 上段：表示名 + 操作 */}
                            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 min-w-0">
                              <InlineEditable
                                value={it.displayName || it.url}
                                placeholder="(表示名)"
                                onSave={(v) => inlineUpdate(it.id, { displayName: v })}
                                title="Alt+クリックで編集 / Enter・フォーカス外しで保存"
                              />

                              {/* Move button -> open MoveDialog */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2"
                                onClick={() => { moveTargetRef.current = it; setMoveOpen(true) }}
                                title="ディレクトリへ移動"
                              >
                                <ArrowLeftRight className="h-4 w-4 mr-1" />
                                移動
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 justify-self-end"
                                onClick={() => inlineUpdate(it.id, { pinned: !it.pinned })}
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

                            {/* URL 行 */}
                            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 min-w-0">
                              <span className="shrink-0 text-muted-foreground w-14 text-xs">URL</span>
                              <InlineEditable
                                value={it.url}
                                onSave={(v) => {
                                  try {
                                    const u = new URL(v.trim())
                                    inlineUpdate(it.id, { url: u.toString(), host: u.host })
                                  } catch { /* ignore */ }
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
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

        {/* Quick Add ダイアログ（閉じる＝自動保存） */}
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
              dirOptions={dirOptions}
              onChange={setQuickVals}
              onSubmit={async (vals) => {
                try {
                  const u = new URL(vals.url.trim())
                  await addBookmark({
                    url: u.toString(),
                    host: (vals.host || u.host).trim(),
                    displayName: vals.displayName?.trim() || undefined,
                    note: vals.note?.trim() || undefined,
                    favicon: vals.favicon?.trim() || undefined,
                    tags: vals.tags.map((t) => t.trim()).filter(Boolean),
                    directory: (vals.directory ?? "").trim(),
                  })
                  setQuickOpen(false)
                } catch { /* ignore invalid URL */ }
              }}
            />
          </DialogContent>
        </Dialog>

        {/* 編集ダイアログ（ブックマーク） */}
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
                  displayName: editing.displayName ?? "",
                  note: editing.note ?? "",
                  favicon: editing.favicon ?? "",
                  tags: editing.tags ?? [],
                  directory: editing.directory ?? "",
                }}
                dirOptions={dirOptions}
                onSubmit={async (vals) =>
                  updateBookmark({
                    ...editing,
                    url: vals.url.trim(),
                    host: vals.host.trim() || new URL(vals.url).host,
                    displayName: vals.displayName?.trim() || undefined,
                    note: vals.note?.trim() || undefined,
                    favicon: vals.favicon?.trim() || undefined,
                    tags: vals.tags.map((t) => t.trim()).filter(Boolean),
                    directory: (vals.directory ?? "").trim(),
                  })
                }
              />
            )}
          </DialogContent>
        </Dialog>

        {/* 全削除 確認ダイアログ（全体） */}
        <Dialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
          <DialogContent className="w-[320px]">
            <DialogHeader>
              <DialogTitle>すべて削除しますか？</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              登録されたすべてのブックマークを削除します。この操作は元に戻せません。
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmAllOpen(false)}>キャンセル</Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  await persist([], "全削除しました", "info")
                  setConfirmAllOpen(false)
                }}
              >
                全削除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ディレクトリ削除（選択式） */}
        <Dialog open={!!confirmDirRemove} onOpenChange={(v) => !v && setConfirmDirRemove(null)}>
          <DialogContent className="w-[360px]">
            <DialogHeader>
              <DialogTitle>ディレクトリを削除</DialogTitle>
            </DialogHeader>
            {confirmDirRemove && (
              <div className="space-y-3">
                <div className="text-sm">
                  対象: <span className="font-mono">{confirmDirRemove.dir || "未分類"}</span>
                </div>
                {confirmDirRemove.count === 0 ? (
                  <div className="text-sm text-muted-foreground">このディレクトリは空です。</div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    中身のブックマーク数: {confirmDirRemove.count} 件
                  </div>
                )}
              </div>
            )}
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmDirRemove(null)}>キャンセル</Button>
              {confirmDirRemove?.count! > 0 && (
                <Button onClick={() => removeDirectory(confirmDirRemove!.dir, "move")}>
                  未分類へ移動して削除
                </Button>
              )}
              <Button
                variant="destructive"
                onClick={() => removeDirectory(confirmDirRemove!.dir, "delete")}
              >
                中身ごと削除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ディレクトリリネーム */}
        <Dialog open={!!renameDir} onOpenChange={(v) => !v && setRenameDir(null)}>
          <DialogContent className="w-[360px]">
            <DialogHeader>
              <DialogTitle>ディレクトリ名を変更</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2">
              <Label>新しい名前</Label>
              <Input
                value={renameDirName}
                onChange={(e) => setRenameDirName(e.target.value)}
                placeholder="新しいディレクトリ名（空 = 未分類）"
                onKeyDown={(e) => {
                  if (e.key === "Enter") renameDirectory(renameDir!.dir, renameDirName)
                }}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameDir(null)}>キャンセル</Button>
              <Button onClick={() => renameDirectory(renameDir!.dir, renameDirName)}>変更</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Move Dialog */}
        <MoveDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          dirOptions={dirOptions}
          initialDir={(moveTargetRef.current?.directory ?? "")}
          onMove={async (targetDir) => {
            const item = moveTargetRef.current
            if (!item) return
            const dirKey = (targetDir ?? "").trim()
            await ensureDirExists(dirKey)
            await inlineUpdate(item.id, { directory: dirKey, order: calcNextOrderInDir(dirKey) })
            showStatus("移動しました", "success")
          }}
        />

        {/* Toast */}
        <StatusOverlay status={status} />
      </CardContent>
    </Card>
  )
}
