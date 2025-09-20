"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { extractTextFromFile, type OcrProgress } from "@/lib/ocr";
import { parseReceiptText, type ParsedReceipt } from "@/lib/parse";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [rawText, setRawText] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const [selectAll, setSelectAll] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setParsed(null);
    setRawText("");
    setSelectAll(false);
  }, []);

  const handleProcess = useCallback(async () => {
    if (!file) return;
    try {
      setOcrProgress({ stage: "loading", percent: 0 });
      const text = await extractTextFromFile(file, (p) => setOcrProgress(p));
      setRawText(text);
      const p = parseReceiptText(text);
      setParsed(p);
      setOcrProgress({ stage: "done", percent: 100 });
    } catch (err: unknown) {
      console.error(err);
      toast.error("Failed to process receipt");
      let message = "Unknown error";
      if (err && typeof err === "object" && "message" in err) {
        message = String((err as { message?: string }).message || "Unknown error");
      } else if (typeof err === "string") {
        message = err;
      }
      setOcrProgress({ stage: "error", message });
    }
  }, [file]);

  const toggleItem = useCallback((index: number, checked: boolean) => {
    setParsed((prev) => {
      if (!prev) return prev;
      const next = { ...prev, lineItems: prev.lineItems.map((it, i) => (i === index ? { ...it, selected: checked } : it)) };
      return next;
    });
  }, []);

  const onToggleAll = useCallback((checked: boolean) => {
    setSelectAll(checked);
    setParsed((prev) => {
      if (!prev) return prev;
      return { ...prev, lineItems: prev.lineItems.map((it) => ({ ...it, selected: checked })) };
    });
  }, []);

  const selectedTotal = useMemo(() => {
    if (!parsed) return 0;
    return Number(
      parsed.lineItems.filter((it) => it.selected).reduce((acc, it) => acc + (it.amount || 0), 0).toFixed(2)
    );
  }, [parsed]);

  return (
    <div className="min-h-screen w-full p-6 md:p-10">
      <Toaster position="top-right" richColors />
      <div className="max-w-5xl mx-auto grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Receipt Reader</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="file">Upload receipt (PNG, JPG, PDF)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="file"
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  onChange={handleFileChange}
                />
                <Button onClick={handleProcess} disabled={!file}>
                  Process
                </Button>
                <Button variant="secondary" onClick={() => inputRef.current?.click()}>Browse</Button>
              </div>
              {ocrProgress && (
                <div className="text-sm text-muted-foreground">
                  {ocrProgress.stage === "recognizing" && (
                    <span>Recognizing... {ocrProgress.percent ?? 0}%</span>
                  )}
                  {ocrProgress.stage === "rendering" && (
                    <span>Rendering PDF... {ocrProgress.percent ?? 0}%</span>
                  )}
                  {ocrProgress.stage === "loading" && <span>Loading...</span>}
                  {ocrProgress.stage === "error" && <span className="text-red-600">{ocrProgress.message}</span>}
                </div>
              )}
            </div>

            {parsed && (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Vendor</div>
                    <div className="font-medium">{parsed.vendor ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Date</div>
                    <div className="font-medium">{parsed.date ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Subtotal</div>
                    <div className="font-medium">{parsed.subtotal != null ? `$${parsed.subtotal.toFixed(2)}` : "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total</div>
                    <div className="font-medium">{parsed.total != null ? `$${parsed.total.toFixed(2)}` : "—"}</div>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Line items</div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="select-all" checked={selectAll} onCheckedChange={(v) => onToggleAll(Boolean(v))} />
                    <Label htmlFor="select-all" className="cursor-pointer">Select all</Label>
                  </div>
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">Sel</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.lineItems.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Checkbox
                              checked={!!item.selected}
                              onCheckedChange={(v) => toggleItem(idx, Boolean(v))}
                              aria-label={`Select ${item.description}`}
                            />
                          </TableCell>
                          <TableCell className="max-w-[520px]">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="truncate">{item.description}</div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[400px] break-words">
                                  {item.description}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell className="text-right">${""}{item.amount.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-end gap-4">
                  <div className="text-sm text-muted-foreground">Selected total</div>
                  <div className="text-lg font-semibold">${""}{selectedTotal.toFixed(2)}</div>
                </div>

                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-muted-foreground">Raw OCR text</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs bg-muted p-3 rounded-md max-h-64 overflow-auto">{rawText}</pre>
                </details>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
