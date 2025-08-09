import {
  Bookmark,
  CodeIcon,
  Cookie,
  NotebookPen,
  RectangleEllipsis,
  SquareMousePointer,
} from "lucide-react"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import GeneratePassword from "./pages/generatePassword"
import { ModeToggle } from "@/components/mode-toggle"
import ControlCookie from "./pages/controlCookie"

const tabItems = [
  {
    value: "generate-password",
    icon: <RectangleEllipsis />,
    content: <GeneratePassword />,
  },
  {
    value: "control-cookies",
    icon: <Cookie />,
    content: <ControlCookie />,
  },
  {
    value: "check-iframe-enbed",
    icon: <SquareMousePointer />,
    content: <>iframe埋め込みテスト</>,
  },
  {
    value: "bookmark",
    icon: <Bookmark />,
    content: <>ブックマーク機能</>,
  },
  {
    value: "memo",
    icon: <NotebookPen />,
    content: <>メモ機能（Originごと）</>,
  },
  {
    value: "test",
    icon: <CodeIcon />,
    content: <>Test</>,
  },
]

const Top = () => {
  return (
    <Tabs defaultValue="generate-password" className="relative w-[360px] h-[500px] bg-background overflow-hidden">
      {/* 固定ヘッダー */}
      <div className="sticky top-0 z-10 flex justify-between items-center px-2 py-2 shadow">
        <TabsList className="flex gap-1">
          {tabItems.map(({ value, icon }) => (
            <TabsTrigger key={value} value={value} className="p-2">
              {icon}
            </TabsTrigger>
          ))}
        </TabsList>
        <ModeToggle />
      </div>

      {/* コンテンツエリア */}
      <div className="px-4 py-2 overflow-y-auto h-[calc(100%-56px)]">
        {tabItems.map(({ value, content }) => (
          <TabsContent key={value} value={value} >
            {content}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )
}

export default Top
