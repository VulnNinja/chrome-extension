import { useEffect, useMemo, useRef, useState } from "react"
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import {
  Globe, Link as LinkIcon, Filter, Clipboard as ClipboardIcon, Download,
  Info, MoreVertical, Pencil, Trash2, Check, X, Send, FileText, Braces, GripVertical,
} from "lucide-react"

/* ================= Types & Storage ================= */
type MemoItem = {
  id: string
  host: string
  url: string
  content: string
  checked: boolean
  createdAt: number
  /** 本文を編集した時だけ更新（チェック変更では更新しない） */
  contentUpdatedAt?: number
  /** 並び順（ホストごと） */
  order?: number
}

const STORAGE_KEY = "origin.memos.v5"
const chromeApi = (globalThis as any)?.chrome

const storage = {
  async getAll(): Promise<MemoItem[]> {
    try {
      if (chromeApi?.storage?.local) {
        const obj = await chromeApi.storage.local.get(STORAGE_KEY)
        return (obj?.[STORAGE_KEY] as MemoItem[] | undefined) ?? []
      }
    } catch { }
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as MemoItem[]) : []
  },
  async setAll(items: MemoItem[]) {
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
    return { url: tab.url, host: u.host, title: tab.title ?? "" }
  } catch {
    return null
  }
}

/* ================= Component ================= */
export default function OriginMemo() {
  const [items, setItems] = useState<MemoItem[]>([])
  const [currentHost, setCurrentHost] = useState<string | null>(null)
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)

  // 表示スコープ: "all" | 特定ホスト
  const [hostScope, setHostScope] = useState<string>("current") // "current" | "all" | "<host>"

  // 入力欄（下固定）
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // 編集
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState("")
  const suppressAutoSaveRef = useRef(false) // キャンセル等で blur 保存を抑制

  // フィルタ＆検索
  const [onlyUnchecked, setOnlyUnchecked] = useState(false)
  const [q, setQ] = useState("")

  // 自動スクロール
  const listEndRef = useRef<HTMLDivElement | null>(null)

  // 並び替え（DnD）
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  useEffect(() => {
    ; (async () => {
      const loaded = await storage.getAll()
      const normalized = loaded.map(m => ({
        ...m,
        contentUpdatedAt: m.contentUpdatedAt ?? m.createdAt,
        order: typeof m.order === "number" ? m.order : m.createdAt,
      }))
      setItems(normalized)
      const meta = await getActiveTabMeta()
      setCurrentHost(meta?.host ?? null)
      setCurrentUrl(meta?.url ?? null)
    })()
  }, [])

  // ホスト一覧（件数付き）
  const hostCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of items) map.set(m.host, (map.get(m.host) ?? 0) + 1)
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  const effectiveHost = useMemo(() => {
    if (hostScope === "current") return currentHost ?? null
    if (hostScope === "all") return null
    return hostScope
  }, [hostScope, currentHost])

  const scopeItems = useMemo(() => {
    const base = effectiveHost ? items.filter(i => i.host === effectiveHost) : items
    const filtered = base
      .filter(i => (onlyUnchecked ? !i.checked : true))
      .filter(i => (q.trim() ? i.content.toLowerCase().includes(q.trim().toLowerCase()) : true))
      .slice()
    // 並び順: ホストごと order 昇順 / 未定義は createdAt
    filtered.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt))
    return filtered
  }, [items, effectiveHost, onlyUnchecked, q])

  const uncheckedCount = useMemo(
    () => (effectiveHost ? items.filter(i => i.host === effectiveHost) : items).filter(i => !i.checked).length,
    [items, effectiveHost]
  )

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" })
  }, [scopeItems.length, editingId, onlyUnchecked, q, hostScope])

  async function persist(next: MemoItem[]) {
    setItems(next)
    await storage.setAll(next)
  }

  // ===== CRUD =====
  async function addMemo() {
    const text = input.trim()
    if (!text) return
    const now = Date.now()
    const host = effectiveHost ?? currentHost ?? "(unknown)"
    const url = effectiveHost ? currentUrl ?? "" : "" // Allビューでも現在URLを入れておく
    const maxOrder =
      items
        .filter(i => i.host === host)
        .reduce((mx, it) => Math.max(mx, typeof it.order === "number" ? it.order : it.createdAt), 0) || 0
    const mi: MemoItem = {
      id: crypto.randomUUID(),
      host,
      url,
      content: text,
      checked: false,
      createdAt: now,
      contentUpdatedAt: now,
      order: maxOrder + 10, // 少し余白を持たせる
    }
    await persist([...items, mi])
    setInput("")
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function delMemo(id: string) {
    await persist(items.filter(x => x.id !== id))
  }

  async function toggleCheck(id: string, v: boolean | "indeterminate") {
    const checked = v === true
    await persist(items.map(x => (x.id === id ? { ...x, checked } : x))) // 本文編集ではないので updated は変更しない
  }

  function startEdit(m: MemoItem) {
    setEditingId(m.id)
    setEditingText(m.content)
  }
  function cancelEdit() {
    setEditingId(null)
    setEditingText("")
  }
  async function saveEdit(id: string) {
    const t = editingText.trim()
    const target = items.find(x => x.id === id)
    if (!target) return cancelEdit()
    if (!t || t === target.content) {
      return cancelEdit()
    }
    const now = Date.now()
    await persist(items.map(x => (x.id === id ? { ...x, content: t, contentUpdatedAt: now } : x)))
    setEditingId(null)
    setEditingText("")
  }

  // Alt+クリックで編集（UI部品上では発火させない）
  function onAltEdit(e: React.MouseEvent, m: MemoItem) {
    const tag = (e.target as HTMLElement).closest("button,textarea,input,svg,[data-ctrl]") as HTMLElement | null
    if (tag) return
    if (e.altKey) {
      e.preventDefault()
      startEdit(m)
    }
  }

  // ===== Export =====
  function toMarkdown(scope: MemoItem[]) {
    const head =
      effectiveHost === null
        ? "# All Hosts"
        : `# ${effectiveHost}`
    const body = scope
      .slice()
      .sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt))
      .map(m => `- [${m.checked ? "x" : " "}] ${m.content.replace(/\r?\n/g, " ")}`)
      .join("\n")
    return `${head}\n\n${body}\n`
  }

  function exportMarkdown() {
    const scope = scopeItems
    const md = toMarkdown(scope)
    const blob = new Blob([md], { type: "text/markdown" })
    const u = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = u
    a.download = `memos-${effectiveHost ?? "all"}-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(u)
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(toMarkdown(scopeItems))
    } catch { }
  }

  function exportJson() {
    const scope = scopeItems
    const blob = new Blob([JSON.stringify(scope, null, 2)], { type: "application/json" })
    const u = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = u
    a.download = `memos-${effectiveHost ?? "all"}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(u)
  }

  // ===== DnD（ホストビュー時のみ有効） =====
  const isReorderEnabled = !!effectiveHost // 全体ビューでは無効
  function onDragStart(e: React.DragEvent, id: string) {
    if (!isReorderEnabled) return e.preventDefault()
    setDraggingId(id)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", id)
  }
  function onDragOver(e: React.DragEvent, overIdx: number, el: HTMLElement) {
    if (!isReorderEnabled || !draggingId) return
    e.preventDefault()
    const rect = el.getBoundingClientRect()
    const offsetY = e.clientY - rect.top
    const before = offsetY < rect.height / 2
    setDropIndex(before ? overIdx : overIdx + 1)
  }
  async function onDrop() {
    if (!isReorderEnabled || draggingId == null || dropIndex == null) {
      setDraggingId(null)
      setDropIndex(null)
      return
    }
    const list = scopeItems.slice()
    const from = list.findIndex(m => m.id === draggingId)
    const to = dropIndex > list.length ? list.length : dropIndex
    if (from < 0 || from === to || from + 1 === to) {
      setDraggingId(null)
      setDropIndex(null)
      return
    }
    const moved = list.splice(from, 1)[0]
    list.splice(to > from ? to - 1 : to, 0, moved)

    // order を再割当（10刻み）
    const nextList = list.map((m, i) => ({ ...m, order: (i + 1) * 10 }))
    const nextAll = items.map(m => (m.host === (effectiveHost ?? m.host) ? (nextList.find(x => x.id === m.id) ?? m) : m))
    await persist(nextAll)
    setDraggingId(null)
    setDropIndex(null)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">メモ</CardTitle>
      </CardHeader>

      <CardContent className="relative p-0 overflow-x-hidden">
        {/* ============ ツールバー（2段） ============ */}
        <div className="px-3 pt-3">
          <div className="rounded-xl border p-3 bg-muted/30">
            {/* 上段：オリジン選択 + 未処理 + フィルタ状態 */}
            <div className="flex items-center gap-2 min-w-0 text-sm">
              <Globe className="h-4 w-4 shrink-0" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-[170px] overflow-hidden justify-start"
                    title={effectiveHost ?? "All Hosts"}
                  >
                    <span className="truncate">{effectiveHost ?? "All Hosts"}</span>
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="start"
                  side="bottom"
                  sideOffset={6}
                  className="w-[280px] max-h-[60vh] overflow-y-auto"
                >
                  <DropdownMenuLabel>表示スコープ</DropdownMenuLabel>

                  <DropdownMenuItem
                    onClick={() => setHostScope("current")}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                  >
                    <span className="truncate" title="現在のサイト">現在のサイト</span>
                    {currentHost && (
                      <Badge variant="secondary">
                        {items.filter(i => i.host === currentHost).length}
                      </Badge>
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => setHostScope("all")}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                  >
                    <span className="truncate" title="すべて">すべて</span>
                    <Badge variant="secondary">{items.length}</Badge>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuLabel>ホストを選択</DropdownMenuLabel>
                  {hostCounts.map(([h, cnt]) => (
                    <DropdownMenuItem
                      key={h}
                      onClick={() => setHostScope(h)}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                      title={h}
                    >
                      <span className="truncate">{h}</span>
                      <Badge variant="secondary">{cnt}</Badge>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>


              <Badge variant="secondary" className="shrink-0">{uncheckedCount} 未処理</Badge>

              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant={onlyUnchecked ? "default" : "outline"}
                  size="icon"
                  aria-pressed={onlyUnchecked}
                  title="未チェックのみ"
                  onClick={() => setOnlyUnchecked(v => !v)}
                  className="relative"
                >
                  <Filter className="h-4 w-4" />
                  {onlyUnchecked && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500" />}
                </Button>
              </div>
            </div>

            {effectiveHost && currentUrl && effectiveHost === currentHost && (
              <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1 min-w-0">
                <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{currentUrl}</span>
              </div>
            )}

            {/* 下段：検索 + 出力（プルダウン） */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="検索（本文）"
                className="h-8 text-xs flex-1 min-w-[160px]"
              />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" title="出力">
                    <Download className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom" sideOffset={6} className="w-44">
                  <DropdownMenuItem onClick={copyMarkdown}>
                    <ClipboardIcon className="h-4 w-4 mr-2" /> Markdownをコピー
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportMarkdown}>
                    <FileText className="h-4 w-4 mr-2" /> Markdown保存
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportJson}>
                    <Braces className="h-4 w-4 mr-2" /> JSON保存
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* 使い方（i） */}
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" title="使い方">
                    <Info className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[360px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>使い方</DialogTitle>
                  </DialogHeader>
                  <div className="text-sm space-y-2">
                    <p>・Enterで送信 / Shift+Enterで改行</p>
                    <p>・Alt+クリックで編集モードに切替</p>
                    <p>・(i)で詳細、…メニューから編集・削除</p>
                    <p>・ドラッグ＆ドロップで並び替え（ホスト表示時のみ）</p>
                    <p>・未チェックのみフィルタ、検索、Markdown/JSON出力に対応</p>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* ============ リスト ============ */}
        <div className="px-3 pt-3 pb-[116px]">
          {scopeItems.length === 0 ? (
            <div className="text-sm text-muted-foreground px-1">メモがありません。</div>
          ) : (
            <div className="flex flex-col gap-3 w-full">
              {scopeItems.map((m, idx) => {
                const isEditing = editingId === m.id
                const edited = (m.contentUpdatedAt ?? m.createdAt) !== m.createdAt
                const displayTs = new Date(m.contentUpdatedAt ?? m.createdAt).toLocaleString()
                const isDragging = draggingId === m.id
                const showDropLine = dropIndex === idx
                return (
                  <div key={m.id} className="w-full">
                    {/* ドロップインジケータ（上側） */}
                    {isReorderEnabled && showDropLine && (
                      <div className="h-2 -mb-2 relative">
                        <div className="absolute left-1 right-1 top-1 h-[3px] rounded bg-primary/60" />
                      </div>
                    )}

                    <div
                      className={`relative w-full min-h-[108px] rounded-lg border p-3 bg-background shadow-sm transition-all duration-200
                                 hover:bg-muted/40 ${isDragging ? "ring-2 ring-primary/60" : ""}`}
                      draggable={isReorderEnabled}
                      onDragStart={(e) => onDragStart(e, m.id)}
                      onDragOver={(e) => onDragOver(e, idx, e.currentTarget)}
                      onDragEnd={() => { setDraggingId(null); setDropIndex(null) }}
                      onDrop={onDrop}
                      onMouseDown={(e) => onAltEdit(e, m)}
                    >
                      {/* 左上: チェックボックス + グリップ */}
                      <div className="absolute left-2 top-2 flex items-center gap-2" data-ctrl>
                        <GripVertical className={`h-4 w-4 ${isReorderEnabled ? "opacity-80" : "opacity-30"}`} />
                        <Checkbox
                          checked={m.checked}
                          onCheckedChange={(v) => toggleCheck(m.id, v)}
                          aria-label="チェック"
                        />
                      </div>

                      {/* 右上: (i) と … を縦に整列 */}
                      <div className="absolute right-2 top-2 flex flex-col items-end gap-2" data-ctrl>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" title="詳細">
                              <Info className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="z-[60] max-w-[380px] max-h-[calc(100vh-24px)] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>メモ詳細</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-2 text-sm">
                              <div className="grid gap-1">
                                <Label className="text-xs">ホスト</Label>
                                <Input readOnly value={m.host} className="h-8 text-xs" />
                              </div>
                              <div className="grid gap-1">
                                <Label className="text-xs">エンドポイントURL</Label>
                                <Textarea readOnly value={m.url} className="h-20 font-mono text-xs overflow-x-hidden" />
                              </div>
                              <div className="grid gap-1">
                                <Label className="text-xs">投稿日（編集で上書き）</Label>
                                <Input readOnly value={displayTs} className="h-8 text-xs" />
                              </div>
                              <div className="grid gap-1">
                                <Label className="text-xs">状態</Label>
                                <Input readOnly value={edited ? "編集済み" : "作成時のまま"} className="h-8 text-xs" />
                              </div>
                              <div className="grid gap-1">
                                <Label className="text-xs">内容</Label>
                                <Textarea readOnly value={m.content} className="h-28 text-xs overflow-x-hidden" />
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" title="メニュー">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" side="bottom" sideOffset={6} className="z-[60] w-36">
                            {isEditing ? (
                              <>
                                <DropdownMenuItem
                                  onMouseDown={() => (suppressAutoSaveRef.current = true)}
                                  onClick={() => saveEdit(m.id)}
                                >
                                  <Check className="h-4 w-4 mr-2" /> 保存
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onMouseDown={() => (suppressAutoSaveRef.current = true)}
                                  onClick={cancelEdit}
                                >
                                  <X className="h-4 w-4 mr-2" /> キャンセル
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem onClick={() => startEdit(m)}>
                                  <Pencil className="h-4 w-4 mr-2" /> 編集
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => delMemo(m.id)}>
                                  <Trash2 className="h-4 w-4 mr-2" /> 削除
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* 本文 */}
                      <div className="pt-6 pr-12 pb-8 pl-10">
                        {isEditing ? (
                          <Textarea
                            autoFocus
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault()
                                saveEdit(m.id)
                              }
                            }}
                            onBlur={() => {
                              // テキストボックス外クリックで自動保存（キャンセル等は抑制）
                              setTimeout(() => {
                                if (suppressAutoSaveRef.current) {
                                  suppressAutoSaveRef.current = false
                                  return
                                }
                                if (editingId === m.id) saveEdit(m.id)
                              }, 0)
                            }}
                            className="min-h-[56px] text-sm whitespace-pre-wrap break-words"
                            placeholder="メモを編集"
                          />
                        ) : (
                          <div className={`text-sm whitespace-pre-wrap break-words ${m.checked ? "opacity-70 line-through" : ""}`}>
                            {m.content}
                          </div>
                        )}
                      </div>

                      {/* 左下: 投稿日（編集で上書き） + 編集済みバッジ */}
                      <div className="absolute left-2 bottom-2 flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">{displayTs}</span>
                        {(m.contentUpdatedAt ?? m.createdAt) !== m.createdAt && (
                          <Badge variant="outline" className="text-[10px]">編集済み</Badge>
                        )}
                      </div>
                    </div>

                    {/* ドロップインジケータ（最後尾） */}
                    {isReorderEnabled && dropIndex === scopeItems.length && idx === scopeItems.length - 1 && (
                      <div className="h-2 mt-1 relative">
                        <div className="absolute left-1 right-1 top-0 h-[3px] rounded bg-primary/60" />
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={listEndRef} />
            </div>
          )}
        </div>

        {/* ===== 入力バー（画面下に固定 / デフォルト高さ半分：rows=1） ===== */}
        <div className="fixed bottom-2 left-0 right-0 z-50 pointer-events-none">
          <div className="mx-auto w-[calc(100%-16px)] max-w-[400px] pointer-events-auto">
            <div className="rounded-xl border bg-background shadow-sm p-2">
              <div className="flex items-end gap-2">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="メモを入力"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      addMemo()
                    }
                  }}
                  className="flex-1 text-sm resize-none min-h-[36px]"
                />
                <Button size="icon" className="h-9 w-9" title="送信" onClick={addMemo}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
