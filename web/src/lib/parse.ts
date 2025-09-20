export type ParsedLineItem = {
  description: string;
  amount: number;
  selected?: boolean;
};

export type ParsedReceipt = {
  vendor?: string;
  date?: string;
  subtotal?: number;
  tax?: number;
  total?: number;
  currency?: string; // "USD" if $ detected
  lineItems: ParsedLineItem[];
  rawText: string;
};

const moneyRegex = /(?:\$\s*)?(\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?/g;
const dateRegex = /(?:\b|^)((?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(?:\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})|(?:[A-Za-z]{3,9}\s+\d{1,2},\s*\d{2,4}))(?:\b|$)/;

function normalizeMoney(s: string): number | null {
  const cleaned = s.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}

export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const result: ParsedReceipt = {
    vendor: lines[0] || undefined,
    date: undefined,
    subtotal: undefined,
    tax: undefined,
    total: undefined,
    currency: text.includes("$") ? "USD" : undefined,
    lineItems: [],
    rawText: text,
  };

  for (const line of lines) {
    if (!result.date) {
      const m = line.match(dateRegex);
      if (m) {
        result.date = m[1];
      }
    }
  }

  const lowered = (s: string) => s.toLowerCase();
  let seenItemsSection = false;
  for (const line of lines) {
    const lower = lowered(line);
    const isTotalLike = /\btotal\b/.test(lower);
    const isSubTotalLike = /\bsub\s*-?\s*total\b/.test(lower) || /\bsubtotal\b/.test(lower);
    const isTaxLike = /\b(tax|vat|sales tax)\b/.test(lower);

    const amounts = [...line.matchAll(moneyRegex)].map((m) => m[0]);
    const lastAmount = amounts.length ? normalizeMoney(amounts[amounts.length - 1]) : null;

    if (isSubTotalLike && lastAmount != null) {
      result.subtotal = lastAmount;
      continue;
    }
    if (isTaxLike && lastAmount != null) {
      result.tax = lastAmount;
      continue;
    }
    if (isTotalLike && lastAmount != null) {
      result.total = lastAmount;
      continue;
    }

    // Heuristic: lines with text and a trailing amount are likely items
    if (/\d/.test(line) && lastAmount != null && !/\bchange\b/.test(lower) && !/\bcash\b/.test(lower)) {
      // description is line without the last amount token
      let description = line;
      if (amounts.length) {
        const amtToken = amounts[amounts.length - 1];
        const idx = line.lastIndexOf(amtToken);
        if (idx > 0) description = line.slice(0, idx).trim().replace(/[\-\s]+$/, "");
      }
      if (description.length > 0) {
        result.lineItems.push({ description, amount: lastAmount, selected: false });
        seenItemsSection = true;
      }
    } else if (seenItemsSection && line.length > 0 && amounts.length === 0 && /[a-z]/i.test(line)) {
      // If items are multi-line descriptions, append to last
      const last = result.lineItems[result.lineItems.length - 1];
      if (last) last.description += ` ${line}`;
    }
  }

  // Fallback total from sum of items if not found
  if (result.total == null && result.lineItems.length > 0) {
    result.total = Number(result.lineItems.reduce((acc, it) => acc + (it.amount || 0), 0).toFixed(2));
  }

  return result;
}


