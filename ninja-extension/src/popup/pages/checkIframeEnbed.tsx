import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertCircle, Info, RefreshCw, Shield, EyeOff, Eye, Copy,
} from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion"

/**
 * クリックジャッキング検証ツール（Popup 400x500 前提）
 * - URL入力 → iframe 埋め込みテスト
 * - HEAD で X-Frame-Options / CSP(frame-ancestors) を取得・解析
 * - sandbox/allow の切替（UI再配置）
 * - UI 崩れ防止: min-w-0 / 固定高 / 長文は Textarea で横スクロール排除
 */

type HeaderMap = Record<string, string>

function normalizeUrl(u: string): string | null {
  try {
    const url = new URL(u.trim())
    if (!/^https?:$/.test(url.protocol)) return null
    return url.toString()
  } catch {
    return null
  }
}

function parseAnalysis(h: HeaderMap) {
  const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]))
  const xfo = lower["x-frame-options"]?.toLowerCase()
  const csp = lower["content-security-policy"]?.toLowerCase() ?? ""
  // frame-ancestors 抜き出し（単純パース）
  let fa = ""
  if (csp.includes("frame-ancestors")) {
    const after = csp.split("frame-ancestors")[1] ?? ""
    fa = after.split(";")[0]?.trim() ?? ""
  }

  // 判定（拡張機 origin は self に含まれない）
  let verdict: "blocked" | "sameorigin" | "allowed" = "allowed"
  const reasons: string[] = []

  if (xfo) {
    if (xfo.includes("deny")) {
      verdict = "blocked"
      reasons.push("X-Frame-Options: DENY")
    } else if (xfo.includes("sameorigin")) {
      verdict = "sameorigin"
      reasons.push("X-Frame-Options: SAMEORIGIN（拡張機からは不可）")
    } else if (xfo.includes("allow-from")) {
      // 旧仕様だが参考に
      verdict = "sameorigin"
      reasons.push("X-Frame-Options: ALLOW-FROM（互換性低）")
    }
  }

  if (fa) {
    const none = /\b'none'\b/.test(fa)
    if (none) {
      verdict = "blocked"
      reasons.push("CSP: frame-ancestors 'none'")
    } else {
      const selfOnly = /^\s*'self'\s*$/i.test(fa)
      if (selfOnly) {
        verdict = verdict === "blocked" ? "blocked" : "sameorigin"
        reasons.push("CSP: frame-ancestors 'self'（拡張機からは不可）")
      } else {
        reasons.push(`CSP: frame-ancestors ${fa}`)
      }
    }
  }

  if (!xfo && !fa) reasons.push("保護ヘッダなし（埋め込み可能な可能性が高い）")
  return { xfo: lower["x-frame-options"], csp: lower["content-security-policy"], fa, verdict, reasons }
}

export default function CheckIframeEnbed() {
  const [url, setUrl] = useState("")
  const [testUrl, setTestUrl] = useState<string | null>(null)
  const [headers, setHeaders] = useState<HeaderMap>({})
  const [errMsg, setErrMsg] = useState<string | null>(null)

  // iframe オプション
  const [useSandbox, setUseSandbox] = useState(false)
  const [sbScripts, setSbScripts] = useState(false)
  const [sbForms, setSbForms] = useState(false)
  const [sbPopups, setSbPopups] = useState(false)
  const [frameAllow, setFrameAllow] = useState("") // 例: "clipboard-read *; fullscreen *"

  // iframe 再作成用 key
  const [frameKey, setFrameKey] = useState(0)

  useEffect(() => {
    // 現在のタブ URL を初期値に
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs?.[0]?.url) setUrl(tabs[0].url)
      })
    } catch { }
  }, [])

  const analysis = useMemo(() => parseAnalysis(headers), [headers])

  const sandboxValue = useMemo(() => {
    if (!useSandbox) return undefined
    const tokens: string[] = []
    if (sbScripts) tokens.push("allow-scripts")
    if (sbForms) tokens.push("allow-forms")
    if (sbPopups) tokens.push("allow-popups")
    // sandbox が有効なだけで強制制限。空文字は sandbox=""（最大制限）
    return tokens.join(" ") || ""
  }, [useSandbox, sbScripts, sbForms, sbPopups])

  const startTest = async () => {
    setErrMsg(null)
    const nu = normalizeUrl(url)
    if (!nu) {
      setErrMsg("http/https の URL を入力してください")
      setTestUrl(null)
      return
    }
    setHeaders({})
    try {
      // HEAD でヘッダ取得（host_permissions 必須）
      const resp = await fetch(nu, { method: "HEAD", redirect: "follow" })
      const h: HeaderMap = {}
      resp.headers.forEach((v, k) => (h[k] = v))
      setHeaders(h)
    } catch {
      setHeaders({})
      setErrMsg("ヘッダ取得に失敗しました（権限 or CORS）")
    }
    setTestUrl(nu)
    setFrameKey((k) => k + 1) // 再作成してクリーンに
  }

  const headerList = (
    <div className="grid gap-3">
      {Object.keys(headers).length === 0 && (
        <div className="text-sm text-muted-foreground">ヘッダ情報がありません。</div>
      )}
      {Object.entries(headers).map(([k, v]) => (
        <div key={k} className="grid gap-1">
          <Label className="text-xs">{k}</Label>
          {/* 長文は Textarea で横スクロール排除 */}
          <Textarea readOnly value={v} className="h-20 font-mono text-xs overflow-x-hidden" />
        </div>
      ))}
    </div>
  )

  // 小さなチップ風トグル
  const Chip = ({
    active, onClick, children, disabled, title,
  }: {
    active: boolean
    onClick: () => void
    children: React.ReactNode
    disabled?: boolean
    title?: string
  }) => (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      className="h-7"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </Button>
  )

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">iframe 埋め込みテスト</CardTitle>
      </CardHeader>

      <CardContent className="grid gap-4 overflow-x-hidden">
        {/* 入力行 */}
        <div className="grid gap-2">
          <Label htmlFor="url">テスト対象 URL</Label>
          <div className="flex items-center gap-2 min-w-0">
            <Input
              id="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 min-w-0"
            />
            <Button
              variant="outline"
              size="icon"
              title="現在のタブで再取得"
              onClick={() => {
                try {
                  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs?.[0]?.url) setUrl(tabs[0].url!)
                  })
                } catch { }
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={startTest}>テスト</Button>
          </div>
          {errMsg && (
            <div className="flex items-center gap-2 text-destructive text-xs">
              <AlertCircle className="h-4 w-4" />
              <span className="truncate">{errMsg}</span>
            </div>
          )}
        </div>

        {/* 解析サマリ */}
        {testUrl && (
          <div className="rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="text-sm font-medium truncate">解析結果</span>
              <Badge
                variant={
                  analysis.verdict === "blocked" ? "destructive" :
                    analysis.verdict === "sameorigin" ? "secondary" : "default"
                }
                className="ml-auto"
              >
                {analysis.verdict === "blocked"
                  ? "ブロック"
                  : analysis.verdict === "sameorigin"
                    ? "同一オリジンのみ"
                    : "許可の可能性"}
              </Badge>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" title="レスポンスヘッダを表示">
                    <Info className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[calc(100vh-24px)] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>レスポンスヘッダ</DialogTitle>
                  </DialogHeader>
                  {headerList}
                </DialogContent>
              </Dialog>
            </div>

            <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
              {analysis.reasons.map((r, i) => (
                <div key={i}>・{r}</div>
              ))}
            </div>

            {/* 主要ヘッダ（折りたたみ） */}
            <Accordion type="single" collapsible className="mt-2">
              <AccordionItem value="keyhdrs">
                <AccordionTrigger className="py-1 text-sm">主要ヘッダ</AccordionTrigger>
                <AccordionContent className="grid gap-2 pt-2">
                  <div className="grid gap-1">
                    <Label className="text-xs">X-Frame-Options</Label>
                    <Input readOnly value={analysis.xfo ?? ""} className="h-8 font-mono text-xs" />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">CSP（frame-ancestors）</Label>
                    <Textarea
                      readOnly
                      value={analysis.fa || analysis.csp || ""}
                      className="h-16 font-mono text-xs overflow-x-hidden"
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}

        {/* iframe オプション（配置見直し） */}
        <div className="grid gap-2">
          <Label className="text-sm">iframe オプション</Label>

          {/* 段① sandbox トグル（シンプルに） */}
          <div className="flex items-center gap-2">
            <Chip
              active={useSandbox}
              onClick={() => setUseSandbox((v) => !v)}
              title="sandbox の有効/無効"
            >
              {useSandbox ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
              sandbox
            </Chip>
            <span className="text-xs text-muted-foreground">
              有効時はデフォルトで強制制限（必要に応じて許可を加える）
            </span>
          </div>

          {/* 段② sandbox 許可フラグ（自動折返し） */}
          <div className="flex items-center gap-2 flex-wrap">
            <Chip
              active={sbScripts}
              onClick={() => setSbScripts((v) => !v)}
              disabled={!useSandbox}
              title="allow-scripts"
            >
              allow-scripts
            </Chip>
            <Chip
              active={sbForms}
              onClick={() => setSbForms((v) => !v)}
              disabled={!useSandbox}
              title="allow-forms"
            >
              allow-forms
            </Chip>
            <Chip
              active={sbPopups}
              onClick={() => setSbPopups((v) => !v)}
              disabled={!useSandbox}
              title="allow-popups"
            >
              allow-popups
            </Chip>
          </div>

          {/* 段③ allow 属性 */}
          <div className="flex items-center gap-2 min-w-0">
            <Input
              placeholder='allow 属性（例: "clipboard-read *; fullscreen *"）'
              value={frameAllow}
              onChange={(e) => setFrameAllow(e.target.value)}
              className="flex-1 min-w-0"
            />
            <Button
              variant="outline"
              size="icon"
              title="allow 値をコピー"
              onClick={async () => {
                try { await navigator.clipboard.writeText(frameAllow) } catch { }
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 表示領域（固定高） */}
        <div className="relative rounded-md border bg-background">
          <div className="relative w-full h-[300px] overflow-hidden">
            {testUrl ? (
              <iframe
                key={frameKey}
                src={testUrl}
                title="Test Iframe"
                className="absolute inset-0 w-full h-full"
                {...(sandboxValue !== undefined ? { sandbox: sandboxValue } : {})}
                {...(frameAllow.trim() ? { allow: frameAllow.trim() } : {})}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                上の「テスト」で埋め込みを開始
              </div>
            )}
          </div>
        </div>

        {/* ヘッダクイックビュー */}
        {testUrl && (
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">XFO:</span>
              <span className="truncate" title={analysis.xfo || ""}>{analysis.xfo || "-"}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">CSP:</span>
              <span className="truncate" title={analysis.fa || analysis.csp || ""}>
                {(analysis.fa || analysis.csp || "-").slice(0, 60)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
