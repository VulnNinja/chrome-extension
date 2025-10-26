import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { Copy, Download, Loader2, MousePointerClick } from "lucide-react"
import { SiVisa, SiMastercard, SiJcb, SiDinersclub } from "react-icons/si"
import { FaCcAmex } from "react-icons/fa6"

/** =========================
 *  Personal Data & Test Cards Assistant (Popup 400px-safe)
 *  - No `.at()` usage (ES2020+ OK)
 *  - UnionPay removed
 *  - AMEX uses FaCcAmex
 *  - Personal section first, Cards second
 *  - Strict width constraints & truncation to avoid overflow
 *  ========================= */

const chromeApi = (globalThis as any)?.chrome

/* ---------- Storage ---------- */
type PersonalProfile = {
  holderName: string
  postal: string
  postalWithHyphen: boolean
  prefecture: string
  city: string
  addressLine1: string
  building: string
  mobile: string
  phone: string
}
const DEFAULT_PROFILE: PersonalProfile = {
  holderName: "TARO YAMADA",
  postal: "1234567",
  postalWithHyphen: true,
  prefecture: "",
  city: "",
  addressLine1: "",
  building: "",
  mobile: "",
  phone: "",
}
const STORAGE_KEY = "personal.profile.v1"
const storage = {
  async load(): Promise<PersonalProfile> {
    try {
      if (chromeApi?.storage?.local) {
        const obj = await chromeApi.storage.local.get(STORAGE_KEY)
        return { ...DEFAULT_PROFILE, ...(obj?.[STORAGE_KEY] ?? {}) }
      }
    } catch { }
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as PersonalProfile) } : DEFAULT_PROFILE
    } catch {
      return DEFAULT_PROFILE
    }
  },
  async save(p: PersonalProfile) {
    try {
      if (chromeApi?.storage?.local) {
        await chromeApi.storage.local.set({ [STORAGE_KEY]: p })
        return
      }
    } catch { }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  },
}

/* ---------- Helpers ---------- */
const onlyDigits = (s: string) => s.replace(/\D+/g, "")
const formatZip = (raw: string, hyphen: boolean) => {
  const d = onlyDigits(raw).slice(0, 7)
  if (!hyphen) return d
  if (d.length <= 3) return d
  return `${d.slice(0, 3)}-${d.slice(3)}`
}

/* ---------- Status Overlay ---------- */
type Tone = "success" | "error" | "info"
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
    <div className="pointer-events-none fixed left-1/2 bottom-2 z-50 -translate-x-1/2" aria-live="polite" role="status">
      <div className={`px-3 py-2 rounded-md border text-sm shadow-sm backdrop-blur ${toneStyles[status.tone]}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dotStyles[status.tone]}`} />
          <span className="whitespace-pre-wrap">{status.text}</span>
        </div>
      </div>
    </div>
  )
}

/* ---------- Test card data (UnionPay removed) ---------- */
type Brand = "VISA" | "MASTER" | "JCB" | "DINERS" | "AMEX"
type TestCard = {
  brand: Brand
  number: string
  cvc: string
  exp: string // MM/YY
}
const TEST_CARDS: TestCard[] = [
  { brand: "VISA", number: "4111111111111111", cvc: "123", exp: "12/34" },
  { brand: "MASTER", number: "5555555555554444", cvc: "123", exp: "12/34" },
  { brand: "JCB", number: "3569990010000000", cvc: "123", exp: "12/34" },
  { brand: "DINERS", number: "30569309025904", cvc: "123", exp: "12/34" },
  { brand: "AMEX", number: "378282246310005", cvc: "1234", exp: "12/34" },
]

/* ---------- Brand Icon (react-icons) ---------- */
function BrandLogo({ brand }: { brand: Brand }) {
  const cls = "shrink-0 h-5 w-auto"
  switch (brand) {
    case "VISA":
      return <SiVisa className={cls} title="VISA" />
    case "MASTER":
      return <SiMastercard className={cls} title="Mastercard" />
    case "JCB":
      return <SiJcb className={cls} title="JCB" />
    case "DINERS":
      return <SiDinersclub className={cls} title="Diners Club" />
    case "AMEX":
      return <FaCcAmex className={cls} title="American Express" />
  }
}

/* ---------- Exec in active tab ---------- */
async function execInActiveTab<T>(args: any[], func: (...a: any[]) => T | Promise<T>): Promise<T | null> {
  try {
    if (!chromeApi?.tabs?.query || !chromeApi?.scripting?.executeScript) return null
    const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return null
    const [ret] = await chromeApi.scripting.executeScript({ target: { tabId: tab.id }, args, func })
    return (ret?.result as T) ?? null
  } catch {
    return null
  }
}

/* ---------- Autofill: cards (no submit) ---------- */
async function fillCardOnPage(card: TestCard, holder: string, waitMs = 250) {
  return execInActiveTab(
    [card, holder, waitMs],
    async (cardArg: TestCard, holderName: string, wait: number) => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const isVisible = (el: HTMLElement) => {
        const st = getComputedStyle(el)
        const rc = el.getBoundingClientRect()
        return st.visibility !== "hidden" && st.display !== "none" && !el.hasAttribute("disabled") && rc.width > 0 && rc.height > 0
      }
      const all = <T extends HTMLElement>(sel: string) => Array.from(document.querySelectorAll<T>(sel)).filter(isVisible)

      const setVal = (el: HTMLInputElement | HTMLSelectElement, val: string) => {
        const proto = (el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement).prototype
        const desc = Object.getOwnPropertyDescriptor(proto, "value")
        // @ts-ignore
        desc?.set?.call(el, val)
        el.dispatchEvent(new Event("input", { bubbles: true }))
        el.dispatchEvent(new Event("change", { bubbles: true }))
        el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }))
      }

      const numberCand = all<HTMLInputElement | HTMLIFrameElement>(
        'input[name*="card" i],input[name*="cc" i],input[name*="pan" i],input[id*="card" i],input[id*="cc" i],input[id*="pan" i],iframe'
      )
      const number = numberCand.length ? numberCand[0] : null

      const cvcCand = all<HTMLInputElement>('input[name*="cvc" i],input[name*="cvv" i],input[name*="security" i],input[id*="cvc" i],input[id*="cvv" i]')
      const cvc = cvcCand.length ? cvcCand[0] : null

      const monthCand = all<HTMLInputElement | HTMLSelectElement>(
        'select[name*="exp" i],select[name*="month" i],select[id*="exp" i],select[id*="month" i],input[name*="mm" i],input[name*="month" i]'
      )
      const month: any = monthCand.length ? monthCand[0] : null

      const yearCand = all<HTMLInputElement | HTMLSelectElement>(
        'select[name*="year" i],select[name*="yy" i],select[id*="year" i],select[id*="yy" i],input[name*="yy" i],input[name*="year" i]'
      )
      const year: any = yearCand.length ? yearCand[0] : null

      const nameCand = all<HTMLInputElement>('input[name*="name" i],input[id*="name" i],input[autocomplete="cc-name"]')
      const name = nameCand.length ? nameCand[0] : null

      const parts = cardArg.exp.split("/")
      const mm = parts.length > 0 ? parts[0] : ""
      const yy = parts.length > 1 ? parts[1] : ""

      if (name) setVal(name, holderName)
      if (month) setVal(month, mm)
      if (year) setVal(year, yy)
      if (cvc) setVal(cvc, cardArg.cvc)

      if (number && number.tagName === "IFRAME") {
        try {
          const iframe = number as HTMLIFrameElement
          const doc = iframe.contentWindow?.document ?? null
          const nid = doc ? (doc.querySelector("input") as HTMLInputElement | null) : null
          if (nid) setVal(nid, cardArg.number)
        } catch { }
      } else if (number) {
        setVal(number as HTMLInputElement, cardArg.number)
      }

      await sleep(wait)
      return true
    }
  )
}

/* ---------- Autofill: personal info ---------- */
async function fillPersonalOnPage(p: PersonalProfile, waitMs = 150) {
  const postal = formatZip(p.postal, p.postalWithHyphen)
  return execInActiveTab(
    [p, postal, waitMs],
    async (prof: PersonalProfile, postalFmt: string, wait: number) => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const isVisible = (el: HTMLElement) => {
        const st = getComputedStyle(el)
        const rc = el.getBoundingClientRect()
        return st.visibility !== "hidden" && st.display !== "none" && !el.hasAttribute("disabled") && rc.width > 0 && rc.height > 0
      }
      const all = <T extends HTMLElement>(sel: string) => Array.from(document.querySelectorAll<T>(sel)).filter(isVisible)
      const setVal = (el: HTMLInputElement | HTMLSelectElement, val: string) => {
        const proto = (el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement).prototype
        const desc = Object.getOwnPropertyDescriptor(proto, "value")
        // @ts-ignore
        desc?.set?.call(el, val)
        el.dispatchEvent(new Event("input", { bubbles: true }))
        el.dispatchEvent(new Event("change", { bubbles: true }))
        el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }))
      }
      const tryFillSelectByText = (sel: HTMLSelectElement | null, text: string) => {
        if (!sel) return false
        const t = text.trim().toLowerCase()
        const opts = Array.from(sel.options)
        for (let i = 0; i < opts.length; i++) {
          const opt = opts[i]
          if (opt.text.trim().toLowerCase() === t) {
            sel.value = opt.value
            sel.dispatchEvent(new Event("change", { bubbles: true }))
            return true
          }
        }
        return false
      }

      const postalInputCand = all<HTMLInputElement>('input[name*="postal" i],input[name*="zip" i],input[id*="postal" i],input[id*="zip" i]')
      const postalInput = postalInputCand.length ? postalInputCand[0] : null
      if (postalInput) setVal(postalInput as HTMLInputElement, postalFmt)

      const prefInputCand = all<HTMLInputElement>('input[name*="pref" i],input[name*="todofuken" i],input[name*="県" i],input[id*="pref" i]')
      const prefInput = prefInputCand.length ? prefInputCand[0] : null
      const prefSelectCand = all<HTMLSelectElement>('select[name*="pref" i],select[name*="todofuken" i],select[id*="pref" i]')
      const prefSelect = prefSelectCand.length ? (prefSelectCand[0] as HTMLSelectElement) : null
      if (prefSelect && tryFillSelectByText(prefSelect, prof.prefecture)) {
        // ok
      } else if (prefInput) {
        setVal(prefInput as HTMLInputElement, prof.prefecture)
      }

      const cityInputCand = all<HTMLInputElement>('input[name*="city" i],input[name*="市" i],input[name*="区" i],input[name*="町村" i],input[id*="city" i]')
      const cityInput = cityInputCand.length ? cityInputCand[0] : null
      if (cityInput) setVal(cityInput as HTMLInputElement, prof.city)

      const streetInputCand = all<HTMLInputElement>('input[name*="address1" i],input[name*="line1" i],input[name*="street" i],input[name*="番地" i],input[id*="address1" i]')
      const streetInput = streetInputCand.length ? streetInputCand[0] : null
      if (streetInput) setVal(streetInput as HTMLInputElement, prof.addressLine1)

      const bldInputCand = all<HTMLInputElement>('input[name*="address2" i],input[name*="line2" i],input[name*="building" i],input[name*="建物" i],input[id*="address2" i]')
      const bldInput = bldInputCand.length ? bldInputCand[0] : null
      if (bldInput) setVal(bldInput as HTMLInputElement, prof.building)

      const mobileInputCand = all<HTMLInputElement>('input[name*="mobile" i],input[name*="cell" i],input[name*="携帯" i],input[id*="mobile" i]')
      const mobileInput = mobileInputCand.length ? mobileInputCand[0] : null
      if (mobileInput) setVal(mobileInput as HTMLInputElement, prof.mobile)

      const phoneInputCand = all<HTMLInputElement>('input[name*="phone" i],input[name*="tel" i],input[name*="固定" i],input[id*="phone" i],input[id*="tel" i]')
      const phoneInput = phoneInputCand.length ? phoneInputCand[0] : null
      if (phoneInput) setVal(phoneInput as HTMLInputElement, prof.phone)

      await sleep(wait)
      return true
    }
  )
}

/* ========================= Component ========================= */

export default function PersonalDataAssistant() {
  const [profile, setProfile] = useState<PersonalProfile>(DEFAULT_PROFILE)
  const [busy, setBusy] = useState<string | null>(null) // action id
  const [status, setStatus] = useState<{ text: string; tone: Tone } | null>(null)
  const statusTimerRef = useRef<number | null>(null)

  useEffect(() => {
    ; (async () => setProfile(await storage.load()))()
    return () => {
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
    }
  }, [])

  const save = async (patch: Partial<PersonalProfile>) => {
    const next = { ...profile, ...patch }
    setProfile(next)
    await storage.save(next)
  }

  const show = (text: string, tone: Tone = "info") => {
    setStatus({ text, tone })
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
    statusTimerRef.current = window.setTimeout(() => setStatus(null), 1400)
  }

  const zipDisplay = formatZip(profile.postal, profile.postalWithHyphen)

  const copyText = async (txt: string, msg = "コピーしました") => {
    try {
      await navigator.clipboard.writeText(txt)
      show(msg, "success")
    } catch {
      show("コピーに失敗しました", "error")
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          テスト入力アシスタント
        </CardTitle>
      </CardHeader>

      {/* 親のポップアップは 400px 想定。内側も固定最大幅で崩れ防止 */}
      <CardContent className="grid gap-6 max-w-[400px] w-full">

        {/* ===== 個人情報（保存・コピー・自動入力） — 上段 ===== */}
        <section className="grid gap-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">個人情報（保存・コピー・自動入力）</div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" title="エクスポート">
                  <Download className="h-4 w-4 mr-1" /> 出力
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>プロフィール</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    const md = [
                      "## personal-info",
                      "",
                      `- name: ${profile.holderName}`,
                      `- postal: ${zipDisplay}`,
                      `- prefecture: ${profile.prefecture}`,
                      `- city: ${profile.city}`,
                      `- address: ${profile.addressLine1}`,
                      `- building: ${profile.building}`,
                      `- mobile: ${profile.mobile}`,
                      `- phone: ${profile.phone}`,
                      "",
                    ].join("\n")
                    const blob = new Blob([md], { type: "text/markdown" })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement("a")
                    a.href = url
                    a.download = "personal-info.md"
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  <Download className="h-4 w-4 mr-2" /> Markdown
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement("a")
                    a.href = url
                    a.download = "personal-info.json"
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  <Download className="h-4 w-4 mr-2" /> JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>氏名（カード名義など）</Label>
              <div className="flex gap-2 min-w-0">
                <Input
                  value={profile.holderName}
                  onChange={(e) => save({ holderName: e.target.value })}
                  placeholder="TARO YAMADA"
                  className="min-w-0"
                />
                <Button variant="outline" size="icon" title="コピー" onClick={() => copyText(profile.holderName)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-1">
              <Label>郵便番号</Label>
              <div className="flex items-center gap-2 min-w-0">
                <Input
                  value={profile.postal}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d-]/g, "")
                    save({ postal: v })
                  }}
                  placeholder="123-4567 / 1234567"
                  className="min-w-0"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <Checkbox
                    checked={profile.postalWithHyphen}
                    onCheckedChange={(v) => save({ postalWithHyphen: v === true })}
                    id="zip-hyphen"
                  />
                  <label htmlFor="zip-hyphen" className="text-xs text-muted-foreground">ハイフン</label>
                </div>
                <Button variant="outline" size="icon" title="フォーマット済をコピー" onClick={() => copyText(formatZip(profile.postal, profile.postalWithHyphen))}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-[11px] text-muted-foreground">使用時は「{formatZip(profile.postal, profile.postalWithHyphen)}」として挿入</div>
            </div>

            <div className="grid gap-1">
              <Label>都道府県</Label>
              <div className="flex gap-2 min-w-0">
                <Input value={profile.prefecture} onChange={(e) => save({ prefecture: e.target.value })} placeholder="東京都" className="min-w-0" />
                <Button variant="outline" size="icon" title="コピー" onClick={() => copyText(profile.prefecture)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-1">
              <Label>市区町村</Label>
              <div className="flex gap-2 min-w-0">
                <Input value={profile.city} onChange={(e) => save({ city: e.target.value })} placeholder="千代田区" className="min-w-0" />
                <Button variant="outline" size="icon" title="コピー" onClick={() => copyText(profile.city)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-1">
              <Label>町域・番地</Label>
              <div className="flex gap-2 min-w-0">
                <Input value={profile.addressLine1} onChange={(e) => save({ addressLine1: e.target.value })} placeholder="丸の内1-1-1" className="min-w-0" />
                <Button variant="outline" size="icon" title="コピー" onClick={() => copyText(profile.addressLine1)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-1">
              <Label>建物名など</Label>
              <div className="flex gap-2 min-w-0">
                <Input value={profile.building} onChange={(e) => save({ building: e.target.value })} placeholder="テストビル 10F" className="min-w-0" />
                <Button variant="outline" size="icon" title="コピー" onClick={() => copyText(profile.building)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-1">
              <Label>個人電話番号（携帯）</Label>
              <div className="flex gap-2 min-w-0">
                <Input value={profile.mobile} onChange={(e) => save({ mobile: e.target.value })} placeholder="09012345678" className="min-w-0" />
                <Button variant="outline" size="icon" title="コピー" onClick={() => copyText(profile.mobile)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-1">
              <Label>固定電話番号</Label>
              <div className="flex gap-2 min-w-0">
                <Input value={profile.phone} onChange={(e) => save({ phone: e.target.value })} placeholder="0312345678" className="min-w-0" />
                <Button variant="outline" size="icon" title="コピー" onClick={() => copyText(profile.phone)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* 一括コピー / 自動入力 */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                title="Markdownでまとめてコピー"
                onClick={() => {
                  const md = [
                    "(personal)",
                    `name: ${profile.holderName}`,
                    `postal: ${formatZip(profile.postal, profile.postalWithHyphen)}`,
                    `prefecture: ${profile.prefecture}`,
                    `city: ${profile.city}`,
                    `address: ${profile.addressLine1}`,
                    `building: ${profile.building}`,
                    `mobile: ${profile.mobile}`,
                    `phone: ${profile.phone}`,
                  ].join("\n")
                  copyText(md)
                }}
              >
                <Copy className="h-4 w-4 mr-1" /> 一括コピー（MD）
              </Button>
              <Button
                size="sm"
                title="フォームへ自動入力（送信しません）"
                disabled={busy === "personal-fill"}
                onClick={async () => {
                  setBusy("personal-fill")
                  try {
                    await fillPersonalOnPage(profile, 200)
                    show("自動入力しました", "success")
                  } finally {
                    window.setTimeout(() => setBusy(null), 200)
                  }
                }}
              >
                {busy === "personal-fill" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MousePointerClick className="h-4 w-4 mr-1" />}
                一括入力
              </Button>
            </div>
          </div>
        </section>

        {/* ===== クレジットカード（テスト） — 下段 ===== */}
        <section>
          <div className="font-medium">クレジットカード（テスト）</div>
          <p className="text-xs text-muted-foreground mt-1">
            番号/有効期限/CVCのコピーと自動入力に対応
          </p>

          <div className="mt-3 grid gap-2">
            {TEST_CARDS.map((c) => {
              const id = `card-${c.brand}`
              const isBusy = busy === id
              const spacedNumber = c.number.replace(/(\d{4})(?=\d)/g, "$1 ")
              return (
                <div key={c.brand} className="rounded-lg border p-2 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <BrandLogo brand={c.brand} />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs max-w-[170px] truncate" title={c.number}>
                        {spacedNumber}
                      </div>
                      <div className="text-[10px] text-muted-foreground">exp {c.exp} / cvc {c.cvc}</div>
                    </div>

                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      <Button
                        variant="outline"
                        size="icon"
                        title="番号をコピー"
                        onClick={() => copyText(c.number)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        title="expをコピー"
                        onClick={() => copyText(c.exp)}
                      >
                        <span className="text-[10px] leading-none">MM/YY</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        title="CVCをコピー"
                        onClick={() => copyText(c.cvc)}
                      >
                        <span className="text-[10px] leading-none">CVC</span>
                      </Button>
                      <Button
                        size="icon"
                        title="このカードで自動入力"
                        disabled={isBusy}
                        onClick={async () => {
                          setBusy(id)
                          try {
                            await fillCardOnPage(c, profile.holderName || "TEST USER", 250)
                            show("自動入力しました", "success")
                          } finally {
                            window.setTimeout(() => setBusy(null), 200)
                          }
                        }}
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MousePointerClick className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </CardContent>

      <StatusOverlay status={status} />
    </Card>
  )
}
