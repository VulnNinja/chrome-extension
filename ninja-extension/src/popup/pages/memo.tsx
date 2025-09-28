import { useEffect, useMemo, useRef, useState } from "react"
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Globe, Link as LinkIcon, Filter, Clipboard as ClipboardIcon, Download,
  Info, MoreVertical, Pencil, Trash2, Check, X, Send, FileText, Braces,
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
}

const STORAGE_KEY = "origin.memos.v4"
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
  const [host, setHost] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)

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

  useEffect(() => {
    ; (async () => {
      const loaded = await storage.getAll()
      const normalized = loaded.map(m => ({ ...m, contentUpdatedAt: m.contentUpdatedAt ?? m.createdAt }))
      setItems(normalized)
      const meta = await getActiveTabMeta()
      setHost(meta?.host ?? null)
      setUrl(meta?.url ?? null)
    })()
  }, [])

  const list = useMemo(() => {
    const base = host ? items.filter(i => i.host === host) : items
    const filtered = base
      .filter(i => (onlyUnchecked ? !i.checked : true))
      .filter(i => (q.trim() ? i.content.toLowerCase().includes(q.trim().toLowerCase()) : true))
      .slice()
    filtered.sort((a, b) => a.createdAt - b.createdAt) // 上=古い / 下=新しい
    return filtered
  }, [items, host, onlyUnchecked, q])

  const uncheckedCount = useMemo(
    () => (host ? items.filter(i => i.host === host) : items).filter(i => !i.checked).length,
    [items, host]
  )

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" })
  }, [list.length, editingId, onlyUnchecked, q])

  async function persist(next: MemoItem[]) {
    setItems(next)
    await storage.setAll(next)
  }

  async function addMemo() {
    const text = input.trim()
    if (!text) return
    const now = Date.now()
    const mi: MemoItem = {
      id: crypto.randomUUID(),
      host: host ?? "(unknown)",
      url: url ?? "",
      content: text,
      checked: false,
      createdAt: now,
      contentUpdatedAt: now,
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
    if (!t) return cancelEdit()
    const now = Date.now()
    const target = items.find(x => x.id === id)
    if (!target) return cancelEdit()
    if (t === target.content) { // 変更なければ閉じるだけ
      return cancelEdit()
    }
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
    const header = `# ${host ?? "All Hosts"}`
    const body = scope
      .slice().sort((a, b) => a.createdAt - b.createdAt)
      .map(m => `- [${m.checked ? "x" : " "}] ${m.content.replace(/\r?\n/g, " ")}`)
      .join("\n")
    return `${header}\n\n${body}\n`
  }

  function exportMarkdown() {
    const scope = host ? items.filter(i => i.host === host) : items
    const md = toMarkdown(scope)
    const blob = new Blob([md], { type: "text/markdown" })
    const u = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = u
    a.download = `memos-${host ?? "all"}-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(u)
  }

  async function copyMarkdown() {
    try {
      const scope = host ? items.filter(i => i.host === host) : items
      await navigator.clipboard.writeText(toMarkdown(scope))
    } catch { }
  }

  function exportJson() {
    const scope = host ? items.filter(i => i.host === host) : items
    const blob = new Blob([JSON.stringify(scope, null, 2)], { type: "application/json" })
    const u = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = u
    a.download = `memos-${host ?? "all"}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(u)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">メモ</CardTitle>
        <CardDescription>オリジンごとに表示されます。</CardDescription>
      </CardHeader>

      <CardContent className="relative p-0 overflow-x-hidden">
        {/* ============ ツールバー（2段に分け、はみ出し防止） ============ */}
        <div className="px-3 pt-3">
          <div className="rounded-xl border p-3 bg-muted/30">
            {/* 上段：オリジン + 未処理 + フィルタ状態が分かるボタン */}
            <div className="flex items-center gap-2 min-w-0 text-sm">
              <Globe className="h-4 w-4 shrink-0" />
              <span className="truncate">{host ?? "オリジンを取得できませんでした"}</span>
              {host && <Badge variant="secondary" className="shrink-0">{uncheckedCount} 未処理</Badge>}
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

            {url && (
              <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1 min-w-0">
                <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{url}</span>
              </div>
            )}

            {/* 下段：検索 + 出力（プルダウン） — 折り返し許可 */}
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
            </div>
          </div>
        </div>

        {/* ============ リスト（幅固定=親幅 / 下の固定入力に被らない余白） ============ */}
        <div className="px-3 pt-3 pb-[116px]">
          {list.length === 0 ? (
            <div className="text-sm text-muted-foreground px-1">このオリジンにはまだメモがありません。</div>
          ) : (
            <div className="flex flex-col gap-3 w-full">
              {list.map(m => {
                const isEditing = editingId === m.id
                const edited = (m.contentUpdatedAt ?? m.createdAt) !== m.createdAt
                const displayTs = new Date(m.contentUpdatedAt ?? m.createdAt).toLocaleString()
                return (
                  <div
                    key={m.id}
                    className="w-full"
                    onMouseDown={(e) => onAltEdit(e, m)}
                  >
                    {/* アイテムカード（幅固定=親幅、最小高さはボタン2個分確保） */}
                    <div className="relative w-full min-h-[108px] rounded-lg border p-3 bg-background shadow-sm">
                      {/* 左上: チェックボックス */}
                      <div className="absolute left-2 top-2" data-ctrl>
                        <Checkbox
                          checked={m.checked}
                          onCheckedChange={(v) => toggleCheck(m.id, v)}
                          aria-label="チェック"
                        />
                      </div>

                      {/* 右上: (i) と … を縦に整列（完全に右上で揃える） */}
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

                      {/* 本文（固定幅 / 横スクロール禁止） */}
                      <div className="pt-6 pr-12 pb-8 pl-8">
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
                  </div>
                )
              })}
              <div ref={listEndRef} />
            </div>
          )}
        </div>

        {/* ===== 入力バー（画面下に固定 / スクロール非依存 / 幅400px想定） ===== */}
        <div className="fixed bottom-2 left-0 right-0 z-50 pointer-events-none">
          <div className="mx-auto w-[calc(100%-16px)] max-w-[400px] pointer-events-auto">
            <div className="rounded-xl border bg-background shadow-sm p-2">
              <div className="flex items-end gap-2">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="メモを入力（Enterで送信 / Shift+Enterで改行 / Alt+クリックで編集）"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      addMemo()
                    }
                  }}
                  className="flex-1 text-sm resize-none"
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
