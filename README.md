# Receipts Reader

Single-page receipt reader built with Next.js (App Router), Tailwind CSS v4, shadcn/ui, and TypeScript. Upload a receipt image or PDF to extract line items, subtotal, date, and total. Select any subset of line items to see a running USD total.

## Tech
- Next.js 15, React 19, TypeScript
- Tailwind CSS v4
- shadcn/ui components
- Tesseract.js for OCR, pdf.js for PDF rendering client-side

## Getting started

1. Install dependencies:

```bash
cd web
npm install
```

2. Run dev server:

```bash
npm run dev
```

Then open `http://localhost:3000`.

3. Production build:

```bash
npm run build && npm start
```

## Usage
- Click Browse to choose a PNG, JPG, or PDF receipt
- Click Process to run OCR; parsed data appears below
- Toggle line items to compute a Selected total

## Notes
- OCR runs fully in the browser. Large PDFs may take time; progress is shown.
- PDF worker uses a CDN from `cdnjs` compatible with the installed `pdfjs-dist` version.

A POC to read receipts line items and label them
