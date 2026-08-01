import { QuotationLineInput } from './dto';

export interface QuotationLineComputed extends QuotationLineInput {
  lineTotal: number;
}

export interface QuotationTotals {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  discountPct: number;
  lines: QuotationLineComputed[];
}

// SM-3.3 / SM-3.4 — line + quote level discount and tax, computed server-side
// so the client never has to be trusted for money math.
export function computeTotals(lines: QuotationLineInput[]): QuotationTotals {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;

  const computedLines = lines.map((line) => {
    const gross = line.qty * line.unitPrice;
    const net = gross - line.discount;
    const tax = net * (line.taxRatePct / 100);
    const lineTotal = net + tax;

    subtotal += gross;
    discountTotal += line.discount;
    taxTotal += tax;

    return { ...line, lineTotal };
  });

  const grandTotal = subtotal - discountTotal + taxTotal;
  const discountPct = subtotal > 0 ? (discountTotal / subtotal) * 100 : 0;

  return { subtotal, discountTotal, taxTotal, grandTotal, discountPct, lines: computedLines };
}
