"use client";

export type OcrProgress = {
  stage: "loading" | "recognizing" | "rendering" | "done" | "error";
  percent?: number;
  message?: string;
};

type TesseractWorkerV2 = {
  load: () => Promise<void>;
  loadLanguage: (lang: string) => Promise<void>;
  initialize: (lang: string) => Promise<void>;
  recognize: (image: Blob) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<void>;
};

type PdfViewport = { width: number; height: number };
type PdfPage = {
  getViewport: (opts: { scale: number }) => PdfViewport;
  render: (params: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => { promise: Promise<void> };
};
type PdfDocument = { numPages: number; getPage: (pageNum: number) => Promise<PdfPage> };
type PdfjsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (params: { data: ArrayBuffer }) => { promise: Promise<PdfDocument> };
};

async function ensurePdfJs(onProgress?: (p: OcrProgress) => void): Promise<PdfjsLib | null> {
  if (typeof window === "undefined") return null;
  if ((window as unknown as { pdfjsLib?: PdfjsLib }).pdfjsLib) return (window as unknown as { pdfjsLib: PdfjsLib }).pdfjsLib;
  onProgress?.({ stage: "loading", percent: 0, message: "Loading PDF engine" });
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load PDF.js"));
    document.head.appendChild(script);
  });
  const pdfjsLib = (window as unknown as { pdfjsLib: PdfjsLib }).pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return pdfjsLib;
}

async function extractTextFromImageBlob(imageBlob: Blob, onProgress?: (p: OcrProgress) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  onProgress?.({ stage: "loading", percent: 0, message: "Loading OCR engine" });
  const worker = await createWorker({
    // Tesseract v2.x requires explicit paths when bundling in SPA
    workerPath: "https://unpkg.com/tesseract.js@2.1.5/dist/worker.min.js",
    corePath: "https://unpkg.com/tesseract.js-core@2.2.0/tesseract-core.wasm.js",
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        onProgress?.({ stage: "recognizing", percent: Math.round(m.progress * 100) });
      }
    },
  } as unknown as {
    workerPath: string;
    corePath: string;
    langPath: string;
    logger: (m: { status?: string; progress?: number }) => void;
  });
  try {
    // v2 requires an explicit load before language init
    const w = worker as unknown as TesseractWorkerV2;
    await w.load();
    await w.loadLanguage("eng");
    await w.initialize("eng");
    onProgress?.({ stage: "recognizing", percent: 0, message: "Recognizing image" });
    const { data } = await w.recognize(imageBlob);
    return data.text || "";
  } finally {
    const w = worker as unknown as TesseractWorkerV2;
    await w.terminate();
    onProgress?.({ stage: "done", percent: 100 });
  }
}

async function renderPdfToImages(file: File, onProgress?: (p: OcrProgress) => void): Promise<Blob[]> {
  onProgress?.({ stage: "loading", percent: 0, message: "Loading PDF" });
  const pdfjsLib = (await ensurePdfJs(onProgress)) as PdfjsLib;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pageImages: Blob[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    onProgress?.({ stage: "rendering", percent: Math.round((pageNum - 1) / pdf.numPages * 100), message: `Rendering page ${pageNum}/${pdf.numPages}` });
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) continue;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b as Blob), "image/png"));
    pageImages.push(blob);
  }
  onProgress?.({ stage: "rendering", percent: 100 });
  return pageImages;
}

export async function extractTextFromFile(file: File, onProgress?: (p: OcrProgress) => void): Promise<string> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return extractTextFromImageBlob(file, onProgress);
  }
  const images = await renderPdfToImages(file, onProgress);
  let combined = "";
  for (let i = 0; i < images.length; i += 1) {
    const pageText = await extractTextFromImageBlob(images[i], onProgress);
    combined += `\n\n[[PAGE ${i + 1}]]\n` + pageText;
  }
  return combined.trim();
}


