import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Info } from "lucide-react"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function CheckIframeEmbed() {
  const [url, setUrl] = useState("")
  const [testUrl, setTestUrl] = useState("")
  const [headers, setHeaders] = useState<Record<string, string>>({})

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        setUrl(tabs[0].url)
      }
    })
  }, [])

  const handleTest = async () => {
    setTestUrl(url)
    try {
      const response = await fetch(url, { method: "HEAD" })
      const headerObj: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headerObj[key] = value
      })
      setHeaders(headerObj)
    } catch (error) {
      console.error("ヘッダー取得失敗:", error)
      setHeaders({ error: "ヘッダー取得に失敗しました。" })
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto mt-4">
      <CardHeader>
        <CardTitle className="text-lg">iframe埋め込みテスト</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="url">テスト対象URL</Label>
          <Input
            id="url"
            type="text"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <Button onClick={handleTest}>テスト開始</Button>

        {testUrl && (
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between">
              <Label>埋め込み結果</Label>
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    className="text-blue-600 hover:text-blue-800"
                    title="レスポンスヘッダーを表示"
                  >
                    <Info size={18} />
                  </button>
                </DialogTrigger>
                <DialogContent className="max-h-[80vh] overflow-auto">
                  <DialogHeader>
                    <DialogTitle>レスポンスヘッダー</DialogTitle>
                  </DialogHeader>
                  <div className="text-sm space-y-1">
                    {Object.entries(headers).map(([key, value]) => (
                      <div key={key}>
                        <strong>{key}:</strong> {value}
                      </div>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="border rounded-md overflow-hidden">
              <iframe
                src={testUrl}
                width="100%"
                height="400px"
                title="Test Iframe"
                className="w-full"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
