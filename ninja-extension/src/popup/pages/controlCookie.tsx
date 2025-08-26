import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog"

import {
  Info, Pencil, Trash2, Send, PencilOff, CirclePlus, RotateCw
} from "lucide-react";
import { useState, useEffect } from "react";

type CookieItem = {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "no_restriction" | "lax" | "strict";
  session: boolean;
  expirationDate?: number;
};

export default function ControlCookie() {
  const [host, setHost] = useState<string | null>(null);
  const [cookies, setCookies] = useState<CookieItem[]>([]);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [newCookie, setNewCookie] = useState<{ name: string; value: string }>({ name: "", value: "" });

  const fetchCookies = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;

    try {
      const url = new URL(tab.url);
      setHost(url.hostname);

      chrome.cookies.getAll({ url: tab.url }, (cookies) => {
        const parsed = cookies.map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite:
            cookie.sameSite === "no_restriction" ||
              cookie.sameSite === "lax" ||
              cookie.sameSite === "strict"
              ? cookie.sameSite
              : "lax",
          session: cookie.session,
          expirationDate: cookie.expirationDate,
        }));
        setCookies(parsed);
      });
    } catch (err) {
      console.error("Error fetching cookies:", err);
    }
  };

  useEffect(() => {
    fetchCookies();
  }, []);

  const handleDelete = (name: string) => {
    if (!host) return;
    setCookies((prev) => prev.filter((cookie) => cookie.name !== name));
    chrome.cookies.remove({ url: `https://${host}`, name });
  };

  const handleEdit = (index: number) => {
    setEditIndex(index);
    setEditValue(cookies[index].value);
  };

  const handleConfirm = () => {
    if (editIndex === null || !host) return;
    const updated = [...cookies];
    updated[editIndex].value = editValue;
    setCookies(updated);
    chrome.cookies.set({
      url: `https://${host}`,
      name: updated[editIndex].name,
      value: editValue,
    });
    setEditIndex(null);
    setEditValue("");
  };

  const handleAdd = () => {
    if (!newCookie.name || !host) return;
    const exists = cookies.some((c) => c.name === newCookie.name);
    if (exists) {
      alert("Cookie名が重複しています");
      return;
    }

    const newItem: CookieItem = {
      name: newCookie.name,
      value: newCookie.value,
      domain: host,
      path: "/",
      secure: false,
      httpOnly: false,
      sameSite: "lax",
      session: true,
    };

    setCookies((prev) => [...prev, newItem]);
    chrome.cookies.set({
      url: `https://${host}`,
      name: newCookie.name,
      value: newCookie.value,
    });
    setNewCookie({ name: "", value: "" });
  };

  return (
    <Card>
      <CardHeader className="space-y-2">

        <CardTitle className="text-lg">Cookie操作ツール</CardTitle>
        <div className="text-sm text-muted-foreground">Host: {host ?? "取得中..."}</div>

        <div className="flex gap-2 items-center">
          <Button variant="ghost" size="icon" onClick={() => {
            setEditIndex(null); // 編集状態をリセット
            setEditValue("");
            fetchCookies();     // Cookie再取得
          }}>
            <RotateCw className="w-4 h-4" />
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon">
                <CirclePlus className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="space-y-2">
              <Input
                placeholder="Cookie名"
                value={newCookie.name}
                onChange={(e) => setNewCookie({ ...newCookie, name: e.target.value })}
              />
              <Input
                placeholder="Cookie値"
                value={newCookie.value}
                onChange={(e) => setNewCookie({ ...newCookie, value: e.target.value })}
              />
              <Button size="sm" onClick={handleAdd}>
                <CirclePlus className="mr-1 h-4 w-4" />追加
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>


      <CardContent className="space-y-4">
        {cookies.length === 0 ? (
          <div className="text-center text-gray-500">Cookieがありません</div>
        ) : (
          cookies.map((cookie, index) => (

            <div key={cookie.name} className="border rounded-md p-3 space-y-2 shadow-sm">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold max-w-[160px] truncate">
                  {cookie.name}
                </span>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Info className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="text-sm space-y-1 max-h-[80vh] overflow-auto">
                    <div className="break-words"><strong>Name:</strong> {cookie.name}</div>
                    <div className="break-words"><strong>Value:</strong> {cookie.value}</div>
                    <div><strong>Domain:</strong> {cookie.domain}</div>
                    <div><strong>Path:</strong> {cookie.path}</div>
                    <div><strong>Secure:</strong> {cookie.secure ? "✓" : "×"}</div>
                    <div><strong>HttpOnly:</strong> {cookie.httpOnly ? "✓" : "×"}</div>
                    <div><strong>SameSite:</strong> {cookie.sameSite}</div>
                    <div><strong>Session:</strong> {cookie.session ? "✓" : "×"}</div>
                    {cookie.expirationDate && (
                      <div><strong>Expiration:</strong> {new Date(cookie.expirationDate * 1000).toLocaleString()}</div>
                    )}
                  </DialogContent>
                </Dialog>

              </div>

              <div className="flex items-center gap-2">
                {editIndex === index ? (
                  <>
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="flex-1"
                    />
                    <Button size="sm" onClick={handleConfirm}>
                      <Send className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditIndex(null)}>
                      <PencilOff className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Input value={cookie.value} disabled className="flex-1" />
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(index)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(cookie.name)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
