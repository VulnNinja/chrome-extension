import {
  Bookmark,
  Cookie,
  KeyRound,
  NotebookPen,
  RectangleEllipsis,
  UserRoundPen,
  Code2,
  SearchCheck
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
import SecurityHeadersLab from "./pages/checkIframeEnbed"
import AccountManager from "./pages/manageAccount"
import BookmarkManager from "./pages/bookmark"
import OriginMemo from "./pages/memo"
import PersonalDataAssistant from "./pages/PersonalDataAssistant"
import EncodeDecodeAssistant from "./pages/encoderDecoderPanel"

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
    value: "security-header-lab",
    icon: <SearchCheck />,
    content: <SecurityHeadersLab />,
  },
  {
    value: "password-manager",
    icon: <KeyRound />,
    content: <AccountManager />,
  },
  {
    value: "personal-data-assistant",
    icon: <UserRoundPen />,
    content: <PersonalDataAssistant />
  },
  {
    value: "bookmark",
    icon: <Bookmark />,
    content: <BookmarkManager />,
  },
  {
    value: "memo",
    icon: <NotebookPen />,
    content: <OriginMemo />
  },
  {
    value: "decoder",
    icon: <Code2 />,
    content: <EncodeDecodeAssistant />
  }
]

const Top = () => {
  return (
    <Tabs defaultValue="generate-password" className="relative w-[400px] h-[556px] bg-background overflow-hidden">
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
