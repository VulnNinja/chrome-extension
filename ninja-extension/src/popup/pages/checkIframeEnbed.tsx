import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import {
  AlertCircle,
  RefreshCw,
  Shield,
  EyeOff,
  Eye,
  Copy,
  Server,
  Layers,
} from "lucide-react"
import {
  SiNginx,
  SiApache,
  SiCaddy,
  SiWordpress,
  SiNextdotjs,
  SiReact,
  SiJquery,
  SiVuedotjs,
  SiLaravel,
  SiDjango,
  SiExpress,
  SiNodedotjs,
  SiPhp,
  SiRuby,
  SiPython,
  SiDotnet,
  SiMysql,
  SiPostgresql,
  SiMongodb,
} from "react-icons/si"
import { FaLinux, FaWindows } from "react-icons/fa"

type HeaderMap = Record<string, string>

type Verdict = "blocked" | "sameorigin" | "allowed"
type Tone = "success" | "error" | "info"
type SecStatus = "good" | "warn" | "info"

type SecItem = {
  key: string
  label: string
  value: string
  status: SecStatus
  message: string
}

type TechCategory =
  | "os"
  | "webserver"
  | "runtime"
  | "framework"
  | "library"
  | "cms"
  | "database"
  | "other"

type TechItem = {
  id: string
  category: TechCategory
  name: string
  version?: string
  icon?: ReactNode
  source: string
}

type PageInfoPayload = {
  htmlSnippet: string
  scriptSrcs: string[]
  generator: string
  ua: string
  locationHref: string
}

const chromeApi = (globalThis as any)?.chrome

function normalizeUrl(u: string): string | null {
  try {
    const url = new URL(u.trim())
    if (!/^https?:$/.test(url.protocol)) return null
    return url.toString()
  } catch {
    return null
  }
}

/* ================== iframe 埋め込み解析 ================== */
function parseAnalysis(h: HeaderMap) {
  const lower = Object.fromEntries(
    Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]),
  )
  const xfoRaw = lower["x-frame-options"]
  const cspRaw = lower["content-security-policy"]
  const xfo = xfoRaw?.toLowerCase()
  const csp = cspRaw?.toLowerCase() ?? ""

  let fa = ""
  if (csp.includes("frame-ancestors")) {
    const after = csp.split("frame-ancestors")[1] ?? ""
    fa = after.split(";")[0]?.trim() ?? ""
  }

  const hasXfo = !!xfoRaw
  const hasFa = !!fa

  let verdict: Verdict = "allowed"
  const reasons: string[] = []

  if (xfo) {
    if (xfo.includes("deny")) {
      verdict = "blocked"
      reasons.push("X-Frame-Options: DENY")
    } else if (xfo.includes("sameorigin")) {
      verdict = "sameorigin"
      reasons.push("X-Frame-Options: SAMEORIGIN（拡張機からは不可）")
    } else if (xfo.includes("allow-from")) {
      verdict = "sameorigin"
      reasons.push("X-Frame-Options: ALLOW-FROM（互換性低）")
    } else {
      reasons.push(`X-Frame-Options: ${xfoRaw}`)
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
        if (verdict !== "blocked") verdict = "sameorigin"
        reasons.push("CSP: frame-ancestors 'self'（拡張機からは不可）")
      } else {
        reasons.push(`CSP: frame-ancestors ${fa}`)
      }
    }
  }

  if (!hasXfo && !hasFa) {
    reasons.push("クリックジャッキング対策なし（埋め込み可能な可能性が高い）")
  }

  return {
    xfo: xfoRaw,
    csp: cspRaw,
    fa,
    verdict,
    reasons,
    hasXfo,
    hasFa,
  }
}

/* ================== セキュリティヘッダ評価 ================== */
function evaluateSecurityHeaders(headers: HeaderMap, testUrl: string | null): SecItem[] {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  )

  const items: SecItem[] = []

  const { xfo, csp, hasFa, hasXfo } = parseAnalysis(headers)
  const cacheControl = lower["cache-control"]
  const hsts = lower["strict-transport-security"]
  const xcto = lower["x-content-type-options"]
  const isHttps = !!testUrl && testUrl.startsWith("https://")

  const xfoLower = (xfo ?? "").toLowerCase()
  const hasStrongXfo =
    xfoLower.includes("deny") || xfoLower.includes("sameorigin")

  // Cache-Control
  if (!cacheControl) {
    items.push({
      key: "cache",
      label: "Cache-Control",
      value: "",
      status: "warn",
      message: "Cache-Control ヘッダがありません。（no-store 推奨）",
    })
  } else if (!/no-store/i.test(cacheControl)) {
    items.push({
      key: "cache",
      label: "Cache-Control",
      value: cacheControl,
      status: "warn",
      message: "no-store 指定がありません（機微情報の保存に注意）。",
    })
  } else {
    items.push({
      key: "cache",
      label: "Cache-Control",
      value: cacheControl,
      status: "good",
      message: "no-store が設定されています。",
    })
  }

  // X-Content-Type-Options
  if (!xcto) {
    items.push({
      key: "xcto",
      label: "X-Content-Type-Options",
      value: "",
      status: "warn",
      message: "X-Content-Type-Options ヘッダがありません。（nosniff 推奨）",
    })
  } else if (xcto.toLowerCase() !== "nosniff") {
    items.push({
      key: "xcto",
      label: "X-Content-Type-Options",
      value: xcto,
      status: "warn",
      message: "値が nosniff ではありません。",
    })
  } else {
    items.push({
      key: "xcto",
      label: "X-Content-Type-Options",
      value: xcto,
      status: "good",
      message: "nosniff が設定されています。",
    })
  }

  // CSP
  if (!csp) {
    if (!hasXfo) {
      items.push({
        key: "csp",
        label: "Content-Security-Policy",
        value: "",
        status: "warn",
        message: "CSP ヘッダがありません。",
      })
    } else {
      items.push({
        key: "csp",
        label: "Content-Security-Policy",
        value: "",
        status: "info",
        message: "CSP はありませんが、X-Frame-Options は設定されています。",
      })
    }
  } else {
    if (hasFa) {
      items.push({
        key: "csp",
        label: "Content-Security-Policy",
        value: csp,
        status: "good",
        message: "CSP に frame-ancestors が定義されています。",
      })
    } else if (!hasXfo) {
      items.push({
        key: "csp",
        label: "Content-Security-Policy",
        value: csp,
        status: "warn",
        message:
          "frame-ancestors ディレクティブがありません。（クリックジャッキング対策が不足している可能性）",
      })
    } else {
      items.push({
        key: "csp",
        label: "Content-Security-Policy",
        value: csp,
        status: "info",
        message:
          "CSP はありますが frame-ancestors は未定義。X-Frame-Options があるためクリックジャッキング対策はされています。",
      })
    }
  }

  // X-Frame-Options / frame-ancestors
  if (!hasXfo && !hasFa) {
    items.push({
      key: "xfo",
      label: "X-Frame-Options / frame-ancestors",
      value: "",
      status: "warn",
      message:
        "X-Frame-Options / CSP frame-ancestors がどちらも未設定です。（クリックジャッキング対策が不足）",
    })
  } else if (hasXfo) {
    if (hasStrongXfo) {
      items.push({
        key: "xfo",
        label: "X-Frame-Options",
        value: xfo ?? "",
        status: "good",
        message:
          "X-Frame-Options に DENY / SAMEORIGIN が設定されており、クリックジャッキング対策が有効です。",
      })
    } else {
      items.push({
        key: "xfo",
        label: "X-Frame-Options",
        value: xfo ?? "",
        status: "info",
        message:
          "X-Frame-Options が設定されています。（CSP frame-ancestors と併用されている場合は CSP を優先的に確認してください）",
      })
    }
  } else {
    items.push({
      key: "xfo",
      label: "X-Frame-Options",
      value: "",
      status: "info",
      message: "CSP frame-ancestors があるため、X-Frame-Options は必須ではありません。",
    })
  }

  // HSTS
  if (!isHttps) {
    items.push({
      key: "hsts",
      label: "Strict-Transport-Security",
      value: "",
      status: "info",
      message: "HTTP アクセスのため HSTS は適用対象外です。",
    })
  } else if (!hsts) {
    items.push({
      key: "hsts",
      label: "Strict-Transport-Security",
      value: "",
      status: "warn",
      message: "HTTPS ですが HSTS ヘッダがありません。",
    })
  } else {
    items.push({
      key: "hsts",
      label: "Strict-Transport-Security",
      value: hsts,
      status: "good",
      message: "HSTS が設定されています。",
    })
  }

  return items
}

/* ================== ビジュアル・ユーティリティ ================== */
function statusColor(status: SecStatus) {
  if (status === "good") {
    return "border-emerald-500/40 bg-emerald-500/5 text-emerald-900 dark:text-emerald-100"
  }
  if (status === "warn") {
    return "border-red-500/40 bg-red-500/5 text-red-900 dark:text-red-100"
  }
  return "border-border bg-muted/40 text-foreground"
}

function statusDot(status: SecStatus) {
  if (status === "good") return "bg-emerald-500"
  if (status === "warn") return "bg-red-500"
  return "bg-muted-foreground/70"
}

function extractVersion(str: string): string | undefined {
  const m = str.match(/(\d+\.\d+(?:\.\d+)*)/)
  return m?.[1]
}

function extractVersionNear(str: string, keyword: string): string | undefined {
  const i = str.toLowerCase().indexOf(keyword.toLowerCase())
  if (i === -1) return undefined
  const tail = str.slice(i + keyword.length, i + keyword.length + 24)
  const m = tail.match(/(\d+\.\d+(?:\.\d+)*)/)
  return m?.[1]
}

/* ================== テクノロジースタック解析 ================== */
function analyzeTechStack(headers: HeaderMap, page: PageInfoPayload | null): TechItem[] {
  const techs: TechItem[] = []
  const lowerHeaders = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  )

  const push = (item: Omit<TechItem, "id">) => {
    const exists = techs.some(
      (t) =>
        t.category === item.category &&
        t.name === item.name &&
        t.version === item.version,
    )
    if (!exists) {
      techs.push({
        ...item,
        id: `${item.category}:${item.name}:${item.version ?? ""}`,
      })
    }
  }

  const serverVal = lowerHeaders["server"]
  const poweredVal = lowerHeaders["x-powered-by"] ?? ""
  const aspNetVer = lowerHeaders["x-aspnet-version"]
  const aspNetMvcVer = lowerHeaders["x-aspnetmvc-version"]

  if (serverVal) {
    const sLower = serverVal.toLowerCase()

    if (sLower.includes("nginx")) {
      push({
        category: "webserver",
        name: "nginx",
        version: extractVersionNear(serverVal, "nginx"),
        icon: <SiNginx className="h-3.5 w-3.5 text-emerald-500" />,
        source: "Server ヘッダ",
      })
    }
    if (sLower.includes("apache")) {
      push({
        category: "webserver",
        name: "Apache HTTP Server",
        version: extractVersionNear(serverVal, "apache"),
        icon: <SiApache className="h-3.5 w-3.5 text-pink-500" />,
        source: "Server ヘッダ",
      })
    }
    if (sLower.includes("microsoft-iis")) {
      push({
        category: "webserver",
        name: "Microsoft IIS",
        version: extractVersionNear(serverVal, "microsoft-iis"),
        icon: <FaWindows className="h-3.5 w-3.5 text-sky-500" />,
        source: "Server ヘッダ",
      })
    }
    if (sLower.includes("caddy")) {
      push({
        category: "webserver",
        name: "Caddy",
        version: extractVersionNear(serverVal, "caddy"),
        icon: <SiCaddy className="h-3.5 w-3.5 text-emerald-500" />,
        source: "Server ヘッダ",
      })
    }

    if (/ubuntu|debian|centos|red hat|rocky|alma/i.test(serverVal)) {
      push({
        category: "os",
        name: "Linux系 OS",
        icon: <FaLinux className="h-3.5 w-3.5 text-emerald-500" />,
        source: "Server ヘッダ",
      })
    }
    if (/windows/i.test(serverVal)) {
      push({
        category: "os",
        name: "Windows Server 系",
        icon: <FaWindows className="h-3.5 w-3.5 text-sky-500" />,
        source: "Server ヘッダ",
      })
    }
  }

  if (poweredVal) {
    const pLower = poweredVal.toLowerCase()
    if (pLower.includes("express")) {
      push({
        category: "framework",
        name: "Express",
        version: extractVersionNear(poweredVal, "express"),
        icon: <SiExpress className="h-3.5 w-3.5" />,
        source: "X-Powered-By",
      })
    }
    if (pLower.includes("php")) {
      push({
        category: "runtime",
        name: "PHP",
        version: extractVersionNear(poweredVal, "php"),
        icon: <SiPhp className="h-3.5 w-3.5 text-sky-500" />,
        source: "X-Powered-By",
      })
    }
    if (pLower.includes("asp.net")) {
      push({
        category: "framework",
        name: "ASP.NET",
        version: extractVersionNear(poweredVal, "asp.net"),
        icon: <SiDotnet className="h-3.5 w-3.5 text-indigo-500" />,
        source: "X-Powered-By",
      })
    }
    if (
      pLower.includes("node.js") ||
      pLower.includes("nodejs") ||
      pLower.includes("node")
    ) {
      push({
        category: "runtime",
        name: "Node.js",
        version: extractVersionNear(poweredVal, "node"),
        icon: <SiNodedotjs className="h-3.5 w-3.5 text-emerald-500" />,
        source: "X-Powered-By",
      })
    }
  }

  if (aspNetVer) {
    push({
      category: "framework",
      name: "ASP.NET",
      version: extractVersion(aspNetVer),
      icon: <SiDotnet className="h-3.5 w-3.5 text-indigo-500" />,
      source: "X-AspNet-Version",
    })
  }

  if (aspNetMvcVer) {
    push({
      category: "framework",
      name: "ASP.NET MVC",
      version: extractVersion(aspNetMvcVer),
      icon: <SiDotnet className="h-3.5 w-3.5 text-indigo-500" />,
      source: "X-AspNetMvc-Version",
    })
  }

  if (page) {
    const { htmlSnippet, scriptSrcs, generator, ua } = page
    const htmlLower = htmlSnippet.toLowerCase()
    const genLower = generator.toLowerCase()

    if (genLower.includes("wordpress") || htmlLower.includes("wp-content/")) {
      push({
        category: "cms",
        name: "WordPress",
        version: extractVersion(generator),
        icon: <SiWordpress className="h-3.5 w-3.5 text-sky-500" />,
        source: "meta generator / HTML",
      })
    }

    if (
      htmlLower.includes("__next") ||
      htmlLower.includes("next-head-count") ||
      scriptSrcs.some((s) => s.toLowerCase().includes("_next/static"))
    ) {
      push({
        category: "framework",
        name: "Next.js",
        icon: <SiNextdotjs className="h-3.5 w-3.5" />,
        source: "HTML / script",
      })
    }

    if (
      htmlLower.includes("data-reactroot") ||
      htmlLower.includes("data-reactid") ||
      scriptSrcs.some((s) => s.toLowerCase().includes("react"))
    ) {
      push({
        category: "framework",
        name: "React",
        icon: <SiReact className="h-3.5 w-3.5 text-sky-500" />,
        source: "HTML / script",
      })
    }

    if (
      htmlLower.includes('id="app"') &&
      (scriptSrcs.some((s) => s.toLowerCase().includes("vue")) ||
        htmlLower.includes("vue.runtime.") ||
        htmlLower.includes("vue.js"))
    ) {
      push({
        category: "framework",
        name: "Vue.js",
        icon: <SiVuedotjs className="h-3.5 w-3.5 text-emerald-500" />,
        source: "HTML / script",
      })
    }

    const jqRegex = /jquery(?:\.min)?[-.]?(\d+\.\d+(?:\.\d+)*)/i
    let jqueryVersion: string | undefined
    for (const src of scriptSrcs) {
      const m = src.match(jqRegex)
      if (m) {
        jqueryVersion = m[1]
        break
      }
    }
    if (
      jqueryVersion ||
      scriptSrcs.some((s) => /jquery/i.test(s)) ||
      htmlLower.includes("jquery(")
    ) {
      push({
        category: "library",
        name: "jQuery",
        version: jqueryVersion,
        icon: <SiJquery className="h-3.5 w-3.5 text-sky-500" />,
        source: "script",
      })
    }

    if (
      scriptSrcs.some((s) => /laravel/i.test(s)) ||
      htmlLower.includes("laravel") ||
      genLower.includes("laravel")
    ) {
      push({
        category: "framework",
        name: "Laravel",
        icon: <SiLaravel className="h-3.5 w-3.5 text-red-500" />,
        source: "HTML / script",
      })
    }

    if (htmlLower.includes("django") || genLower.includes("django")) {
      push({
        category: "framework",
        name: "Django",
        icon: <SiDjango className="h-3.5 w-3.5 text-emerald-500" />,
        source: "HTML / meta",
      })
    }

    if (/mysql/i.test(htmlSnippet)) {
      push({
        category: "database",
        name: "MySQL / MariaDB",
        icon: <SiMysql className="h-3.5 w-3.5 text-sky-500" />,
        source: "HTML",
      })
    }
    if (/postgresql/i.test(htmlSnippet)) {
      push({
        category: "database",
        name: "PostgreSQL",
        icon: <SiPostgresql className="h-3.5 w-3.5 text-sky-500" />,
        source: "HTML",
      })
    }
    if (/mongodb/i.test(htmlSnippet)) {
      push({
        category: "database",
        name: "MongoDB",
        icon: <SiMongodb className="h-3.5 w-3.5 text-emerald-500" />,
        source: "HTML",
      })
    }

    if (/php/i.test(htmlSnippet) || /php/i.test(generator)) {
      push({
        category: "runtime",
        name: "PHP",
        icon: <SiPhp className="h-3.5 w-3.5 text-sky-500" />,
        source: "HTML / meta",
      })
    }

    if (/ruby on rails/i.test(htmlSnippet)) {
      push({
        category: "framework",
        name: "Ruby on Rails",
        icon: <SiRuby className="h-3.5 w-3.5 text-red-500" />,
        source: "HTML",
      })
    }

    if (/python/i.test(htmlSnippet)) {
      push({
        category: "runtime",
        name: "Python",
        icon: <SiPython className="h-3.5 w-3.5 text-emerald-500" />,
        source: "HTML",
      })
    }

    if (/linux/i.test(ua) && !techs.some((t) => t.category === "os")) {
      push({
        category: "os",
        name: "Linux系 OS（クライアント）",
        icon: <FaLinux className="h-3.5 w-3.5 text-emerald-500" />,
        source: "User-Agent",
      })
    }
    if (/windows/i.test(ua) && !techs.some((t) => t.category === "os")) {
      push({
        category: "os",
        name: "Windows（クライアント）",
        icon: <FaWindows className="h-3.5 w-3.5 text-sky-500" />,
        source: "User-Agent",
      })
    }
  }

  const order: TechCategory[] = [
    "os",
    "webserver",
    "runtime",
    "framework",
    "library",
    "cms",
    "database",
    "other",
  ]
  techs.sort((a, b) => {
    const ao = order.indexOf(a.category)
    const bo = order.indexOf(b.category)
    if (ao !== bo) return ao - bo
    return a.name.localeCompare(b.name)
  })

  return techs
}

/* ================== トースト ================== */
function StatusToast({ status }: { status: { text: string; tone: Tone } | null }) {
  if (!status) return null
  const toneStyles: Record<Tone, string> = {
    success:
      "border-emerald-500/30 text-emerald-900 dark:text-emerald-100 bg-emerald-500/10",
    error: "border-red-500/30 text-red-900 dark:text-red-100 bg-red-500/10",
    info: "border-muted-foreground/30 text-foreground bg-muted/70",
  }
  const dotStyles: Record<Tone, string> = {
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
        className={`w-full max-w-[360px] mx-2 px-3 py-2 rounded-md border text-xs shadow-sm backdrop-blur ${toneStyles[status.tone]}`}
      >
        <div className="flex items-center gap-2 justify-center">
          <span className={`h-2 w-2 rounded-full ${dotStyles[status.tone]}`} />
          <span className="whitespace-pre-wrap text-center">{status.text}</span>
        </div>
      </div>
    </div>
  )
}

/* ================== メインコンポーネント ================== */
export default function SimpleSecurityCheck() {
  const [url, setUrl] = useState("")
  const [testUrl, setTestUrl] = useState<string | null>(null)
  const [headers, setHeaders] = useState<HeaderMap>({})
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const [status, setStatus] = useState<{ text: string; tone: Tone } | null>(null)
  const [statusTimer, setStatusTimer] = useState<number | null>(null)

  const [useSandbox, setUseSandbox] = useState(false)
  const [sbScripts, setSbScripts] = useState(false)
  const [sbForms, setSbForms] = useState(false)
  const [sbPopups, setSbPopups] = useState(false)
  const [frameAllow, setFrameAllow] = useState("")
  const [frameKey, setFrameKey] = useState(0)
  const [copyingAllow, setCopyingAllow] = useState(false)

  const [techs, setTechs] = useState<TechItem[]>([])
  const [techLoading, setTechLoading] = useState(false)
  const [techError, setTechError] = useState<string | null>(null)

  useEffect(() => {
    try {
      chromeApi?.tabs?.query({ active: true, currentWindow: true }, (tabs: any[]) => {
        if (tabs?.[0]?.url) setUrl(tabs[0].url)
      })
    } catch {
      // ignore
    }
    return () => {
      if (statusTimer) window.clearTimeout(statusTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showStatus = (text: string, tone: Tone = "info") => {
    setStatus({ text, tone })
    if (statusTimer) window.clearTimeout(statusTimer)
    const id = window.setTimeout(() => setStatus(null), 1600)
    setStatusTimer(id)
  }

  const analysis = useMemo(() => parseAnalysis(headers), [headers])
  const secItems = useMemo(
    () => evaluateSecurityHeaders(headers, testUrl),
    [headers, testUrl],
  )

  const sandboxValue = useMemo(() => {
    if (!useSandbox) return undefined
    const tokens: string[] = []
    if (sbScripts) tokens.push("allow-scripts")
    if (sbForms) tokens.push("allow-forms")
    if (sbPopups) tokens.push("allow-popups")
    return tokens.join(" ") || ""
  }, [useSandbox, sbScripts, sbForms, sbPopups])

  const headerList = (
    <div className="grid gap-3 w-full min-w-0">
      {Object.keys(headers).length === 0 && (
        <div className="text-xs text-muted-foreground">ヘッダ情報がありません。</div>
      )}
      {Object.entries(headers).map(([k, v]) => (
        <div key={k} className="grid gap-1">
          <Label className="text-[11px]">{k}</Label>
          <Textarea
            readOnly
            value={v}
            className="h-20 font-mono text-[11px] overflow-x-hidden"
          />
        </div>
      ))}
    </div>
  )

  const groupedTech = useMemo(() => {
    const map = new Map<TechCategory, TechItem[]>()
    for (const t of techs) {
      if (!map.has(t.category)) map.set(t.category, [])
      map.get(t.category)!.push(t)
    }
    return map
  }, [techs])

  const categoryLabel: Record<TechCategory, string> = {
    os: "OS / プラットフォーム",
    webserver: "Webサーバー",
    runtime: "ランタイム",
    framework: "フレームワーク",
    library: "ライブラリ",
    cms: "CMS",
    database: "データベース",
    other: "その他",
  }

  const startCheck = async () => {
    setErrMsg(null)
    const nu = normalizeUrl(url)
    if (!nu) {
      setErrMsg("http/https の URL を入力してください。")
      setTestUrl(null)
      return
    }

    setHeaders({})
    setTechs([])
    setTechError(null)
    setTechLoading(true)

    let localHeaders: HeaderMap = {}
    try {
      const resp = await fetch(nu, { method: "HEAD", redirect: "follow" })
      const h: HeaderMap = {}
      resp.headers.forEach((v, k) => (h[k] = v))
      localHeaders = h
      setHeaders(h)
    } catch {
      setHeaders({})
      setErrMsg("ヘッダ取得に失敗しました。（権限 or CORS）")
    }

    setTestUrl(nu)
    setFrameKey((k) => k + 1)

    try {
      if (!chromeApi?.tabs?.query || !chromeApi?.scripting?.executeScript) {
        setTechError("Chrome API が利用できません。")
        return
      }
      const [tab] = await chromeApi.tabs.query({
        active: true,
        currentWindow: true,
      })
      if (!tab?.id) {
        setTechError("タブ情報が取得できません。")
        return
      }
      const [{ result }] = await chromeApi.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          try {
            const doc = document
            const scripts = Array.from(
              doc.querySelectorAll("script[src]"),
            ) as HTMLScriptElement[]
            const html = doc.documentElement?.outerHTML || ""
            const generatorMeta = doc.querySelector(
              "meta[name='generator']",
            ) as HTMLMetaElement | null
            const generator = generatorMeta?.getAttribute("content") || ""
            return {
              htmlSnippet: html.slice(0, 200000),
              scriptSrcs: scripts.map((s) => s.src),
              generator,
              ua: navigator.userAgent,
              locationHref: window.location.href,
            } as PageInfoPayload
          } catch {
            return {
              htmlSnippet: "",
              scriptSrcs: [] as string[],
              generator: "",
              ua: navigator.userAgent,
              locationHref: window.location.href,
            } as PageInfoPayload
          }
        },
      })
      const payload = result as PageInfoPayload
      const techDetected = analyzeTechStack(localHeaders, payload)
      setTechs(techDetected)
    } catch {
      setTechError("テクノロジー検出に失敗しました。（権限/CSPの可能性）")
    } finally {
      setTechLoading(false)
    }
  }

  const Chip = ({
    active,
    onClick,
    children,
    disabled,
    title,
  }: {
    active: boolean
    onClick: () => void
    children: ReactNode
    disabled?: boolean
    title?: string
  }) => (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      className="h-7 px-2 text-[11px]"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </Button>
  )

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span>簡易診断チェック</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="grid gap-4 overflow-x-hidden text-sm w-full min-w-0">
        {/* URL 入力 */}
        <div className="grid gap-2 w-full min-w-0">
          <Label htmlFor="url" className="text-xs">
            テスト対象 URL
          </Label>
          <div className="flex items-center gap-2 min-w-0">
            <Input
              id="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 min-w-0 text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              title="現在のタブ URL"
              onClick={() => {
                try {
                  chromeApi?.tabs?.query(
                    { active: true, currentWindow: true },
                    (tabs: any[]) => {
                      if (tabs?.[0]?.url) setUrl(tabs[0].url!)
                    },
                  )
                } catch {
                  // ignore
                }
              }}
              className="h-8 w-8 shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              className="h-8 px-3 text-xs shrink-0"
              onClick={startCheck}
            >
              チェック
            </Button>
          </div>
          {errMsg && (
            <div className="flex items-start gap-1.5 text-destructive text-[11px]">
              <AlertCircle className="h-3.5 w-3.5 mt-[2px]" />
              <span className="break-words">{errMsg}</span>
            </div>
          )}
        </div>

        {/* 解析結果サマリ（クリックジャッキング） */}
        {testUrl && (
          <div className="rounded-lg border p-3 bg-muted/40 space-y-2 w-full min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 w-full min-w-0">
              <div className="flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">クリックジャッキング</span>
              </div>

              <div className="ml-auto flex items-center gap-1.5">
                <Badge
                  variant={
                    analysis.verdict === "blocked"
                      ? "destructive"
                      : analysis.verdict === "sameorigin"
                        ? "secondary"
                        : "default"
                  }
                  className="text-[11px]"
                >
                  {analysis.verdict === "blocked"
                    ? "ブロック"
                    : analysis.verdict === "sameorigin"
                      ? "同一オリジンのみ"
                      : "許可の可能性"}
                </Badge>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      title="クリックジャッキング関連ヘッダの詳細"
                      className="h-7 px-2 text-[11px]"
                    >
                      詳細
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[calc(100vh-24px)] max-w-[360px] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-sm">
                        レスポンスヘッダ（全体）
                      </DialogTitle>
                    </DialogHeader>
                    {headerList}
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="space-y-0.5 text-[11px] text-muted-foreground">
              {analysis.reasons.map((r, i) => (
                <div key={i}>・{r}</div>
              ))}
            </div>

            <Accordion type="single" collapsible className="mt-2 w-full min-w-0">
              <AccordionItem value="keyhdrs">
                <AccordionTrigger className="py-1 text-xs">
                  主要ヘッダ（サマリ）
                </AccordionTrigger>
                <AccordionContent className="pt-2 space-y-1.5">
                  <div className="flex items-center gap-1 text-[11px] w-full min-w-0">
                    <span className="text-muted-foreground w-24 shrink-0">
                      X-Frame-Options
                    </span>
                    <span className="truncate" title={analysis.xfo ?? ""}>
                      {analysis.xfo ?? "-"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] w-full min-w-0">
                    <span className="text-muted-foreground w-24 shrink-0">
                      CSP / frame-ancestors
                    </span>
                    <span
                      className="truncate"
                      title={analysis.fa || analysis.csp || ""}
                    >
                      {(analysis.fa || analysis.csp || "-").slice(0, 80)}
                    </span>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}

        {/* セキュリティヘッダ一覧（値は非表示） */}
        {testUrl && (
          <div className="space-y-2 w-full min-w-0">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">
                主要セキュリティヘッダ チェック
              </span>
            </div>
            <div className="grid gap-1.5">
              {secItems.map((item) => (
                <div
                  key={item.key}
                  className={`rounded-md border px-2.5 py-1.5 text-[11px] ${statusColor(
                    item.status,
                  )}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${statusDot(
                        item.status,
                      )}`}
                    />
                    <span className="font-medium">{item.label}</span>
                  </div>
                  {/* 値は UI 崩れ防止のため非表示 */}
                  <div className="mt-0.5 text-[10px] opacity-85 break-words">
                    {item.message}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* iframe オプション */}
        {testUrl && (
          <div className="space-y-2 w-full min-w-0">
            <Label className="text-xs">iframe オプション</Label>

            <div className="flex flex-wrap items-center gap-2">
              <Chip
                active={useSandbox}
                onClick={() => setUseSandbox((v) => !v)}
                title="sandbox の有効/無効"
              >
                {useSandbox ? (
                  <EyeOff className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <Eye className="h-3.5 w-3.5 mr-1" />
                )}
                sandbox
              </Chip>
              <span className="text-[10px] text-muted-foreground">
                有効時は制限をかけたうえで許可を追加
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
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

            <div className="flex items-center gap-2 min-w-0">
              <Input
                placeholder='allow 属性（例: "clipboard-read *; fullscreen *"）'
                value={frameAllow}
                onChange={(e) => setFrameAllow(e.target.value)}
                className="flex-1 min-w-0 text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                title="allow 値をコピー"
                className="h-8 w-8 shrink-0"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(frameAllow)
                    setCopyingAllow(true)
                    window.setTimeout(() => setCopyingAllow(false), 800)
                    showStatus("allow をコピーしました", "success")
                  } catch {
                    showStatus("コピーに失敗しました", "error")
                  }
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            {copyingAllow && (
              <span className="text-[10px] text-muted-foreground">
                コピーしました。
              </span>
            )}
          </div>
        )}

        {/* iframe 表示領域 */}
        <div className="relative rounded-md border bg-background w-full min-w-0">
          <div className="relative w-full h-[240px] overflow-hidden">
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
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground px-4 text-center">
                上の URL を入力して「チェック」を押すと、この領域に iframe とヘッダ解析結果が表示されます。
              </div>
            )}
          </div>
        </div>

        {/* ヘッダクイックビュー */}
        {testUrl && (
          <div className="grid gap-1 text-[11px] w-full min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground w-16 shrink-0">XFO</span>
              <span className="truncate" title={analysis.xfo || ""}>
                {analysis.xfo || "-"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground w-16 shrink-0">CSP</span>
              <span
                className="truncate"
                title={analysis.fa || analysis.csp || ""}
              >
                {(analysis.fa || analysis.csp || "-").slice(0, 80)}
              </span>
            </div>
          </div>
        )}

        {/* テクノロジースタック検出 */}
        {testUrl && (
          <div className="space-y-2 w-full min-w-0">
            <div className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">
                テクノロジースタック（簡易検出）
              </span>
              {techLoading && (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  解析中…
                </span>
              )}
              {!techLoading && techs.length > 0 && (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {techs.length}件検出
                </span>
              )}
            </div>

            {techError && (
              <div className="flex items-start gap-1.5 text-[11px] text-destructive">
                <AlertCircle className="h-3.5 w-3.5 mt-[2px]" />
                <span className="break-words">{techError}</span>
              </div>
            )}

            {!techLoading && !techError && techs.length === 0 && (
              <div className="rounded-md border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                代表的なスタックは検出できませんでした。（SPA や難読化により判別できない場合があります）
              </div>
            )}

            {techs.length > 0 && (
              <div className="grid gap-1.5">
                {Array.from(groupedTech.entries()).map(([cat, list]) => (
                  <div
                    key={cat}
                    className="rounded-md border bg-muted/30 px-2.5 py-1.5 w-full min-w-0"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[11px] font-semibold">
                        {categoryLabel[cat]}
                      </span>
                      <Badge
                        variant="outline"
                        className="ml-auto text-[10px] px-1.5 py-0 h-4"
                      >
                        {list.length}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      {list.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-1.5 text-[11px] w-full min-w-0"
                        >
                          {t.icon && (
                            <span className="shrink-0 inline-flex items-center justify-center">
                              {t.icon}
                            </span>
                          )}
                          <span
                            className="truncate"
                            title={t.name + (t.version ? ` ${t.version}` : "")}
                          >
                            {t.name}
                            {t.version ? ` ${t.version}` : ""}
                          </span>
                          <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                            {t.source}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <StatusToast status={status} />
      </CardContent>
    </Card>
  )
}
