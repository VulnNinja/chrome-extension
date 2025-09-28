import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Copy, Check, ClipboardPaste } from "lucide-react"

/* ====== 定数 ====== */
const LOWER = "abcdefghijklmnopqrstuvwxyz"
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const DIGITS = "0123456789"
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?/"

/* ====== ユーティリティ ====== */
function rng(max: number) {
  const buf = new Uint32Array(1)
  const limit = Math.floor(0xffffffff / max) * max
  let r = 0
  do {
    crypto.getRandomValues(buf)
    r = buf[0]
  } while (r >= limit)
  return r % max
}
function pick(pool: string) { return pool[rng(pool.length)] }
function shuffle(arr: string[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng(i + 1)
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
function entropyBits(charsetSize: number, length: number) {
  if (charsetSize <= 1 || length <= 0) return 0
  return length * Math.log2(charsetSize)
}
function entropyClass(bits: number) {
  if (bits < 28) return { label: "とても弱い", color: "bg-red-500" }
  if (bits < 36) return { label: "弱い", color: "bg-orange-500" }
  if (bits < 60) return { label: "普通", color: "bg-amber-500" }
  if (bits < 128) return { label: "強い", color: "bg-emerald-500" }
  return { label: "最強", color: "bg-teal-500" }
}

/* ====== メイン ====== */
export default function GeneratePassword() {
  // 基本（popup: w-400/h-500 前提）
  const [length, setLength] = useState(24)
  const [count, setCount] = useState(3)

  // 文字種（トグル）
  const [useLower, setUseLower] = useState(true)
  const [useUpper, setUseUpper] = useState(true)
  const [useDigits, setUseDigits] = useState(true)
  const [useSymbols, setUseSymbols] = useState(true)

  // 除外
  const [exclude, setExclude] = useState("")

  // 出力
  const [passwords, setPasswords] = useState<string[]>([])
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const copyTimerRef = useRef<number | null>(null)

  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current) }, [])

  const pool = useMemo(() => {
    let p = ""
    if (useLower) p += LOWER
    if (useUpper) p += UPPER
    if (useDigits) p += DIGITS
    if (useSymbols) p += SYMBOLS
    if (exclude) {
      const ex = new Set(exclude.split(""))
      p = p.split("").filter((c) => !ex.has(c)).join("")
    }
    if (!p) p = LOWER + DIGITS // フォールバック
    return Array.from(new Set(p.split(""))).join("") // 重複除去
  }, [useLower, useUpper, useDigits, useSymbols, exclude])

  const bits = entropyBits(pool.length, length)
  const cls = entropyClass(bits)
  const bitsPct = Math.min(100, Math.round((bits / 128) * 100))

  function generateOne(): string {
    const buckets = [
      useLower ? [...LOWER].filter((c) => pool.includes(c)).join("") : "",
      useUpper ? [...UPPER].filter((c) => pool.includes(c)).join("") : "",
      useDigits ? [...DIGITS].filter((c) => pool.includes(c)).join("") : "",
      useSymbols ? [...SYMBOLS].filter((c) => pool.includes(c)).join("") : "",
    ].filter(Boolean) as string[]

    const res: string[] = []
    // 選択カテゴリは最低1文字
    for (const b of buckets) if (b.length) res.push(pick(b))
    while (res.length < Math.max(6, length)) res.push(pick(pool))
    return shuffle(res).slice(0, length).join("")
  }

  function handleGenerate() {
    const n = Math.min(10, Math.max(1, count))
    const out: string[] = []
    for (let i = 0; i < n; i++) out.push(generateOne())
    setPasswords(out)
  }

  async function copyPwd(pwd: string, idx: number) {
    try {
      await navigator.clipboard.writeText(pwd)
      setCopiedIndex(idx)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopiedIndex(null), 900)
    } catch { }
  }

  async function pasteExclude() {
    try {
      const text = await navigator.clipboard.readText()
      setExclude(text)
    } catch { }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">パスワード生成ツール</CardTitle>
      </CardHeader>

      <CardContent className="grid gap-4 overflow-x-hidden">
        {/* エントロピー（バー表示） */}
        <div className="rounded-xl border p-3 bg-muted/30">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">推定エントロピー</span>
            <Badge className="ml-auto">{Math.round(bits)} bit</Badge>
            <Badge variant="secondary">{cls.label}</Badge>
          </div>
          <div className="mt-2">
            <div className="relative h-3 w-full rounded bg-muted overflow-hidden">
              <div className={`absolute left-0 top-0 h-full ${cls.color}`} style={{ width: `${bitsPct}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>0</span><span>64</span><span>80</span><span>100</span><span>128+</span>
            </div>
          </div>
        </div>

        {/* 文字種（チェック群） */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={useLower} onChange={(e) => setUseLower(e.target.checked)} />
            小文字
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={useUpper} onChange={(e) => setUseUpper(e.target.checked)} />
            大文字
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={useDigits} onChange={(e) => setUseDigits(e.target.checked)} />
            数字
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={useSymbols} onChange={(e) => setUseSymbols(e.target.checked)} />
            記号
          </label>
        </div>

        {/* 長さ（スライダー+数値） */}
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Label className="w-10 text-xs text-muted-foreground">長さ</Label>
            <input
              type="range"
              min={6}
              max={128}
              value={length}
              onChange={(e) => setLength(parseInt(e.target.value, 10))}
              className="flex-1"
            />
            <Input
              type="number"
              min={6}
              max={128}
              value={length}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                if (!Number.isNaN(n)) setLength(Math.min(128, Math.max(6, n)))
              }}
              className="w-18"
            />
          </div>
        </div>

        {/* 除外（ペーストアイコン） */}
        <div className="flex items-center gap-2">
          <Input
            value={exclude}
            onChange={(e) => setExclude(e.target.value)}
            placeholder="除外する文字（ここに入力）"
            className="flex-1"
          />
          <Button variant="outline" size="icon" title="クリップボードから貼り付け" onClick={pasteExclude}>
            <ClipboardPaste className="h-4 w-4" />
          </Button>
        </div>

        <Separator />

        {/* ★ 生成行：左寄せ [生成] × [個数] */}
        <div className="flex items-center gap-2">
          <Button onClick={handleGenerate}>生成</Button>
          <span className="text-sm text-muted-foreground">×</span>
          <Input
            aria-label="生成個数"
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              if (!Number.isNaN(n)) setCount(Math.min(10, Math.max(1, n)))
            }}
            className="w-16"
          />
        </div>

        {/* 出力（横崩れ防止） */}
        <div className="grid gap-2">
          {passwords.length === 0 && (
            <div className="text-sm text-muted-foreground">条件を設定して「生成」を押してください。</div>
          )}
          {passwords.map((pwd, idx) => {
            const copied = copiedIndex === idx
            return (
              <div key={idx} className="flex items-center gap-2 min-w-0">
                <Input
                  readOnly
                  value={pwd}
                  className="h-8 font-mono text-xs flex-1 min-w-0"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  variant="outline"
                  size="icon"
                  title="コピー"
                  onClick={() => copyPwd(pwd, idx)}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
