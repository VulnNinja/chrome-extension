import React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Copy, RefreshCcw } from "lucide-react";

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SPECIALS = "!@#$%^&*";

export default function GeneratePassword() {
  // 基本設定
  const [length, setLength] = React.useState<number>(30);
  const [count, setCount] = React.useState<number>(1);
  const [exclude, setExclude] = React.useState<string>(""); // カンマ区切り

  // 文字種 ON/OFF
  const [lower, setLower] = React.useState<boolean>(true);
  const [upper, setUpper] = React.useState<boolean>(true);
  const [digits, setDigits] = React.useState<boolean>(true);
  const [specials, setSpecials] = React.useState<boolean>(true);

  const [passwords, setPasswords] = React.useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

  // 除外文字を反映したプールを作成
  const buildPool = (): string => {
    let pool = "";
    if (lower) pool += LOWER;
    if (upper) pool += UPPER;
    if (digits) pool += DIGITS;
    if (specials) pool += SPECIALS;

    // 除外文字を「カンマ区切りの1文字」だけ受け付け、完全に除外
    if (exclude.trim()) {
      const toRemove = exclude
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length === 1);

      const excludeSet = new Set<string>(toRemove);
      pool = pool
        .split("")
        .filter((ch) => !excludeSet.has(ch))
        .join("");
    }

    // プールが空ならデフォルトに戻す
    if (pool.length === 0) pool = LOWER + DIGITS + SPECIALS;
    return pool;
  };

  // 1パスワードを生成（除外後のプールに含まれる文字種のみ必須文字として追加）
  const generateOne = (pool: string): string => {
    // pool から各カテゴリの利用可能文字を分離
    const poolLower = pool.split("").filter((c) => LOWER.includes(c)).join("");
    const poolUpper = pool.split("").filter((c) => UPPER.includes(c)).join("");
    const poolDigits = pool.split("").filter((c) => DIGITS.includes(c)).join("");
    const poolSymbols = pool.split("").filter((c) => SPECIALS.includes(c)).join("");

    const mandatory: string[] = [];
    // 除外後プールに存在する場合のみ必須文字を追加
    if (lower && poolLower.length > 0)
      mandatory.push(poolLower[Math.floor(Math.random() * poolLower.length)]);
    if (upper && poolUpper.length > 0)
      mandatory.push(poolUpper[Math.floor(Math.random() * poolUpper.length)]);
    if (digits && poolDigits.length > 0)
      mandatory.push(poolDigits[Math.floor(Math.random() * poolDigits.length)]);
    if (specials && poolSymbols.length > 0)
      mandatory.push(poolSymbols[Math.floor(Math.random() * poolSymbols.length)]);

    const needed = Math.max(6, length);
    let pwd = mandatory.join("");

    // 除外後のプールから残りを埋める
    for (let i = pwd.length; i < needed; i++) {
      pwd += pool[Math.floor(Math.random() * pool.length)];
    }

    // シャッフル
    return pwd.split("").sort(() => Math.random() - 0.5).join("");
  };

  const handleGenerate = () => {
    const pool = buildPool();
    if (pool.length === 0) return;

    const generated: string[] = [];
    for (let i = 0; i < Math.max(1, count); i++) {
      generated.push(generateOne(pool));
    }
    setPasswords(generated);
  };

  const pasteExclude = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setExclude(text);
    } catch {
      // 失敗時は無視
    }
  };

  const copyPassword = async (pwd: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(pwd);
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 1000);
    } catch {
      // 失敗時は無視
    }
  };

  const setLengthSafe = (v: string) => {
    const n = parseInt(v, 10);
    if (!Number.isNaN(n)) setLength(n);
  };

  const setCountSafe = (v: string) => {
    const n = parseInt(v, 10);
    if (!Number.isNaN(n)) setCount(n);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">パスワード生成ツール</CardTitle>
      </CardHeader>

      <CardContent className="grid gap-6">
        {/* 文字数 */}
        <div className="flex items-center gap-2 w-full">
          <Label htmlFor="length" className="min-w-[60px]">文字数</Label>
          <Input
            id="length"
            type="number"
            min={6}
            max={128}
            value={length}
            onChange={(e) => setLengthSafe(e.target.value)}
            className="flex-1"
          />
          <span className="ml-2 text-sm text-gray-500 hidden sm:inline">デフォルト 30</span>
        </div>

        {/* 種別 Switch */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
          <div className="flex items-center justify-between gap-2">
            <span>小文字</span>
            <Switch checked={lower} onCheckedChange={setLower} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>大文字</span>
            <Switch checked={upper} onCheckedChange={setUpper} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>数字</span>
            <Switch checked={digits} onCheckedChange={setDigits} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>特殊文字</span>
            <Switch checked={specials} onCheckedChange={setSpecials} />
          </div>
        </div>

        {/* 除外文字 + ペースト（新しいレイアウト） */}
        <div className="flex flex-col w-full">
          <div className="flex items-center justify-between w-full">
            <Label htmlFor="exclude" className="min-w-[140px]">除外文字</Label>
            <Button variant="outline" size="sm" onClick={pasteExclude}>
              ペースト
            </Button>
          </div>
          <Input
            id="exclude"
            value={exclude}
            onChange={(e) => setExclude(e.target.value)}
            placeholder="例: , . / !"
            className="mt-2 w-full"
          />
        </div>

        {/* 生成ボタンと個数 */}
        <div className="flex items-center gap-2 w-full">
          <Button size="lg" onClick={handleGenerate}>
            <RefreshCcw className="h-4 w-4 mr-2" />
            パスワードを生成
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <span>×</span>
            <Input
              type="number"
              min={1}
              max={9}
              value={count}
              onChange={(e) => setCountSafe(e.target.value)}
              className="w-20"
            />
          </div>
        </div>

        {/* 出力リスト（passwords） */}
        <div className="w-full overflow-auto">
          {passwords.length > 0 && (
            <div className="flex flex-col gap-2">
              {passwords.map((pwd, idx) => (
                <div key={idx} className="flex items-center gap-2 w-full">
                  <Input value={pwd} readOnly className="flex-1 text-xs" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyPassword(pwd, idx)}
                  >
                    {copiedIndex === idx ? "Copied!" : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
