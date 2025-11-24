import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Copy, ClipboardPaste, Wand2, ArrowDownWideNarrow, ArrowLeftRight, Eraser, ChevronDown } from "lucide-react"

/* ================= 共通：トースト（画面最前・下寄せ、400px内でも見える） ================= */
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
    <div
      className="fixed left-0 right-0 bottom-2 z-[9999] pointer-events-none flex justify-center"
      aria-live="polite"
      role="status"
    >
      <div
        className={`w-full max-w-[400px] mx-2 px-3 py-2 rounded-md border text-sm shadow-sm backdrop-blur ${toneStyles[status.tone]}`}
      >
        <div className="flex items-center gap-2 justify-center">
          <span className={`h-2 w-2 rounded-full ${dot[status.tone]}`} />
          <span className="whitespace-pre-wrap text-center">{status.text}</span>
        </div>
      </div>
    </div>
  )
}


/* ================= ユーティリティ（DOMのみ／Node不要） ================= */
const enc = new TextEncoder()
const dec = new TextDecoder()

const u8ToArrayBuffer = (u8: Uint8Array): ArrayBuffer => {
  const ab = new ArrayBuffer(u8.byteLength)
  new Uint8Array(ab).set(u8)
  return ab
}

const toBase64 = (u8: Uint8Array): string => {
  // btoa はバイナリ文字列前提。安全に変換
  let s = ""
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s)
}
const fromBase64 = (b64: string): Uint8Array => {
  const bin = atob(b64.replace(/\s+/g, ""))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
const toBase64Url = (b64: string) => b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const fromBase64Url = (b64url: string) => {
  let s = b64url.replace(/-/g, "+").replace(/_/g, "/")
  while (s.length % 4) s += "="
  return fromBase64(s)
}

const htmlEncode = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;")
const htmlDecode = (s: string) => {
  const t = document.createElement("textarea")
  t.innerHTML = s
  return t.value
}

const urlEncode = (s: string) => encodeURIComponent(s)
const urlDecode = (s: string) => decodeURIComponent(s)

const urlUEncode = (s: string) =>
  Array.from(s).map(ch => {
    const c = ch.codePointAt(0)!
    if (c < 0x80) return "%" + c.toString(16).padStart(2, "0")
    return "%u" + c.toString(16).padStart(4, "0")
  }).join("")
const urlUDecode = (s: string) =>
  s.replace(/%u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/%([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))

const formUrlEncode = (s: string) => urlEncode(s).replace(/%20/g, "+")
const formUrlDecode = (s: string) => urlDecode(s.replace(/\+/g, " "))

const hexEncode = (s: string) => Array.from(enc.encode(s)).map(b => b.toString(16).padStart(2, "0")).join("")
const hexDecodeToU8 = (hex: string) => {
  const clean = hex.replace(/\s+/g, "")
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2) throw new Error("invalid hex")
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

const asciiHexEncode = (s: string) => Array.from(s).map(ch => ch.charCodeAt(0).toString(16).padStart(2, "0")).join(" ")
const asciiHexDecode = (hex: string) =>
  hex.trim().split(/\s+/).map(h => String.fromCharCode(parseInt(h, 16))).join("")

const binaryEncode = (s: string) => Array.from(enc.encode(s)).map(b => b.toString(2).padStart(8, "0")).join(" ")
const binaryDecodeU8 = (bin: string) => {
  const parts = bin.trim().split(/\s+/)
  const out = new Uint8Array(parts.length)
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (!/^[01]{8}$/.test(p)) throw new Error("invalid binary")
    out[i] = parseInt(p, 2)
  }
  return out
}

const octalEncode = (s: string) => Array.from(enc.encode(s)).map(b => b.toString(8).padStart(3, "0")).join(" ")
const octalDecodeU8 = (oct: string) => {
  const parts = oct.trim().split(/\s+/)
  const out = new Uint8Array(parts.length)
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (!/^[0-7]{1,3}$/.test(p)) throw new Error("invalid octal")
    out[i] = parseInt(p, 8)
  }
  return out
}

const rot13 = (s: string) =>
  s.replace(/[A-Za-z]/g, c => {
    const base = c <= "Z" ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
  })

// JS escape / unescape（%uXXXX も扱う）
const jsEscape = (s: string) => urlUEncode(s)
const jsUnescape = (s: string) => urlUDecode(s)

// gzip（テキスト→gzip(base64) / gzip(base64)→テキスト）
async function gzipCompressToBase64(text: string): Promise<string> {
  const stream = new CompressionStream("gzip")
  const writer = stream.writable.getWriter()
  await writer.write(enc.encode(text))
  await writer.close()
  const buf = await new Response(stream.readable).arrayBuffer()
  return toBase64(new Uint8Array(buf))
}
async function gzipDecompressFromBase64(b64: string): Promise<string> {
  const u8 = fromBase64(b64)
  const stream = new Blob([u8ToArrayBuffer(u8)]).stream().pipeThrough(new DecompressionStream("gzip"))
  const buf = await new Response(stream).arrayBuffer()
  return dec.decode(new Uint8Array(buf))
}

// JWT（ヘッダ・ペイロードを base64url デコード）
const tryDecodeJwt = (s: string): string | null => {
  const m = s.match(/^([A-Za-z0-9\-_]+)\.([A-Za-z0-9\-_]+)\.([A-Za-z0-9\-_]+)?$/)
  if (!m) return null
  try {
    const header = JSON.parse(dec.decode(fromBase64Url(m[1])))
    const payload = JSON.parse(dec.decode(fromBase64Url(m[2])))
    return JSON.stringify({ header, payload }, null, 2)
  } catch {
    return null
  }
}

/* ================= メイン：UI ================= */
type Method =
  | "url" | "url_u" | "formurl"
  | "base64" | "base64url"
  | "html"
  | "ascii_hex" | "hex" | "octal" | "binary"
  | "gzip"
  | "js_escape" | "jwt" | "rot13"

const METHOD_LABEL: Record<Method, string> = {
  url: "URL (%hh)",
  url_u: "URL (%uXXXX)",
  formurl: "Form URL (+)",
  base64: "Base64",
  base64url: "Base64URL",
  html: "HTML (<>&\"')",
  ascii_hex: "ASCII Hex",
  hex: "Hex",
  octal: "Octal",
  binary: "Binary",
  gzip: "Gzip",
  js_escape: "JS escape",
  jwt: "JWT",
  rot13: "ROT13",
}

export default function EncodeDecodeAssistant() {
  const [input, setInput] = useState("")
  const [output, setOutput] = useState("")
  const [method, setMethod] = useState<Method>("url")
  const [status, setStatus] = useState<{ text: string; tone: Tone } | null>(null)
  const statusTimerRef = useRef<number | null>(null)

  useEffect(() => () => { if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current) }, [])

  const show = (text: string, tone: Tone = "info") => {
    setStatus({ text, tone })
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
    statusTimerRef.current = window.setTimeout(() => setStatus(null), 1400)
  }

  const copy = async (txt: string) => {
    try { await navigator.clipboard.writeText(txt); show("コピーしました", "success") }
    catch { show("コピーに失敗しました", "error") }
  }

  const encode = async () => {
    try {
      switch (method) {
        case "url": setOutput(urlEncode(input)); break
        case "url_u": setOutput(urlUEncode(input)); break
        case "formurl": setOutput(formUrlEncode(input)); break
        case "base64": setOutput(toBase64(enc.encode(input))); break
        case "base64url": setOutput(toBase64Url(toBase64(enc.encode(input)))); break
        case "html": setOutput(htmlEncode(input)); break
        case "ascii_hex": setOutput(asciiHexEncode(input)); break
        case "hex": setOutput(hexEncode(input)); break
        case "octal": setOutput(octalEncode(input)); break
        case "binary": setOutput(binaryEncode(input)); break
        case "gzip": setOutput(await gzipCompressToBase64(input)); break
        case "js_escape": setOutput(jsEscape(input)); break
        case "jwt": setOutput("JWT はエンコード対象外（署名生成が必要）"); break
        case "rot13": setOutput(rot13(input)); break
      }
    } catch (e) {
      setOutput(String(e))
      show("エンコードに失敗しました", "error")
    }
  }

  const decode = async () => {
    try {
      switch (method) {
        case "url": setOutput(urlDecode(input)); break
        case "url_u": setOutput(urlUDecode(input)); break
        case "formurl": setOutput(formUrlDecode(input)); break
        case "base64": setOutput(dec.decode(fromBase64(input))); break
        case "base64url": setOutput(dec.decode(fromBase64Url(input))); break
        case "html": setOutput(htmlDecode(input)); break
        case "ascii_hex": setOutput(asciiHexDecode(input)); break
        case "hex": setOutput(dec.decode(hexDecodeToU8(input))); break
        case "octal": setOutput(dec.decode(octalDecodeU8(input))); break
        case "binary": setOutput(dec.decode(binaryDecodeU8(input))); break
        case "gzip": setOutput(await gzipDecompressFromBase64(input)); break
        case "js_escape": setOutput(jsUnescape(input)); break
        case "jwt": {
          const j = tryDecodeJwt(input)
          setOutput(j ?? "JWT として解釈できません")
          break
        }
        case "rot13": setOutput(rot13(input)); break
      }
    } catch (e) {
      setOutput(String(e))
      show("デコードに失敗しました", "error")
    }
  }

  const smart = async () => {
    const s = input.trim()
    // 優先度高いものから順にトライ
    // 1) JWT
    const j = tryDecodeJwt(s)
    if (j) { setMethod("jwt"); setOutput(j); show("JWT をデコードしました", "success"); return }

    // 2) Gzip Base64 マジック
    try {
      const u8 = fromBase64(s)
      if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
        const txt = await gzipDecompressFromBase64(s)
        setMethod("gzip"); setOutput(txt); show("Gzip(Base64) を解凍しました", "success"); return
      }
    } catch { /* ignore */ }

    // 3) Base64 / Base64URL
    try { setMethod("base64"); setOutput(dec.decode(fromBase64(s))); show("Base64 をデコードしました", "success"); return } catch { }
    try { setMethod("base64url"); setOutput(dec.decode(fromBase64Url(s))); show("Base64URL をデコードしました", "success"); return } catch { }

    // 4) URL (%uXXXX 含む)
    if (/%u[0-9a-fA-F]{4}/.test(s)) { try { setMethod("url_u"); setOutput(urlUDecode(s)); show("URL(%uXXXX) をデコードしました", "success"); return } catch { } }
    if (/%[0-9a-fA-F]{2}/.test(s) || /%[0-9a-fA-F]{2}/.test(encodeURIComponent(s))) {
      try { setMethod("url"); setOutput(urlDecode(s)); show("URL をデコードしました", "success"); return } catch { }
    }
    if (/\+/.test(s) && /%[0-9A-Fa-f]{2}/.test(s)) {
      try { setMethod("formurl"); setOutput(formUrlDecode(s)); show("Form URL をデコードしました", "success"); return } catch { }
    }

    // 5) HTML エンティティ
    if (/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i.test(s)) {
      try { setMethod("html"); setOutput(htmlDecode(s)); show("HTML をデコードしました", "success"); return } catch { }
    }

    // 6) Hex / ASCII Hex / Binary / Octal
    try { setMethod("hex"); setOutput(dec.decode(hexDecodeToU8(s))); show("Hex をデコードしました", "success"); return } catch { }
    try { setMethod("ascii_hex"); setOutput(asciiHexDecode(s)); show("ASCII Hex をデコードしました", "success"); return } catch { }
    try { setMethod("binary"); setOutput(dec.decode(binaryDecodeU8(s))); show("Binary をデコードしました", "success"); return } catch { }
    try { setMethod("octal"); setOutput(dec.decode(octalDecodeU8(s))); show("Octal をデコードしました", "success"); return } catch { }

    // 7) ROT13（可読文字比率が高い時に成功とみなす）
    const r = rot13(s)
    if (/[A-Za-z]/.test(s) && /[A-Za-z]/.test(r)) {
      setMethod("rot13"); setOutput(r); show("ROT13 を適用しました", "success"); return
    }

    // 8) 何も判定できない
    setOutput("Smart Decode: 形式を判定できませんでした")
    show("判定できませんでした", "info")
  }

  const inCount = useMemo(() => new Blob([input]).size, [input])
  const outCount = useMemo(() => new Blob([output]).size, [output])

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">エンコード / デコード</CardTitle>
      </CardHeader>

      {/* 400px 内で崩れないよう最大幅を固定 */}
      <CardContent className="grid gap-3 max-w-[400px] w-full">

        {/* === メイン操作（上段：Smart / エンコード方式） === */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={smart} className="h-9">
            <Wand2 className="h-4 w-4 mr-1" />
            Smart Decode
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9">
                <ChevronDown className="h-4 w-4 mr-1" />
                {METHOD_LABEL[method]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[60vh] overflow-y-auto w-[260px]">
              <DropdownMenuLabel>方式を選択</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(Object.keys(METHOD_LABEL) as Method[]).map(m => (
                <DropdownMenuItem key={m} onClick={() => setMethod(m)}>
                  {METHOD_LABEL[m]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="icon" title="貼り付け" onClick={async () => {
              try { const t = await navigator.clipboard.readText(); setInput(t); show("貼り付けました", "success") }
              catch { show("貼り付けに失敗", "error") }
            }}>
              <ClipboardPaste className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" title="入出力を入れ替え" onClick={() => { setInput(output); setOutput(input) }}>
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" title="入力クリア" onClick={() => setInput("")}>
              <Eraser className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* === 入力 === */}
        <div className="grid gap-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Input</span>
            <span>{inCount} bytes</span>
          </div>
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            rows={6}
            className="resize-none font-mono text-sm"
            placeholder="ここに文字列を貼り付け / 入力"
          />
        </div>

        {/* === アクション（Encode/Decode を左右に） === */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={encode}>
            <ArrowDownWideNarrow className="h-4 w-4 mr-1" />
            Encode
          </Button>
          <Button onClick={decode}>
            <ArrowDownWideNarrow className="h-4 w-4 mr-1 rotate-180" />
            Decode
          </Button>
        </div>

        {/* === 出力 === */}
        <div className="grid gap-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Output</span>
            <div className="flex items-center gap-1">
              <span>{outCount} bytes</span>
              <Button
                variant="outline" size="icon" className="ml-1"
                title="出力をコピー" onClick={() => copy(output)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Textarea
            value={output}
            onChange={e => setOutput(e.target.value)}
            rows={6}
            className="resize-none font-mono text-sm"
            placeholder="結果がここに表示されます"
          />
        </div>
      </CardContent>

      <StatusOverlay status={status} />
    </Card>
  )
}
