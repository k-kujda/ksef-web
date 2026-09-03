import type { InvoiceMetadata } from './ksef/client';

interface SequentialNumber {
  prefix: string;
  suffix: string;
  sequence: number;
  width: number;
}

function parseSequentialNumber(invoiceNumber: string): SequentialNumber | null {
  const match = invoiceNumber.trim().match(/^(.*\D)(\d+)(\D*)$/);
  if (!match) return null;

  return {
    prefix: match[1],
    sequence: Number(match[2]),
    width: match[2].length,
    suffix: match[3],
  };
}

function replaceStandaloneNumber(value: string, previous: string, next: string): string {
  const escaped = previous.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(
    new RegExp(`(^|\\D)${escaped}(?=\\D|$)`),
    (_, separator: string) => `${separator}${next}`
  );
}

function adaptPrefixToDate(prefix: string, previousDate: string, targetDate: string): string {
  const [previousYear, previousMonth] = previousDate.slice(0, 10).split('-');
  const [targetYear, targetMonth] = targetDate.split('-');
  const withYear = replaceStandaloneNumber(prefix, previousYear, targetYear);
  return replaceStandaloneNumber(withYear, previousMonth, targetMonth);
}

function formatNumber(number: SequentialNumber, sequence: number, prefix = number.prefix): string {
  return `${prefix}${String(sequence).padStart(number.width, '0')}${number.suffix}`;
}

export function suggestInvoiceNumber(
  monthlyInvoices: InvoiceMetadata[],
  recentInvoices: InvoiceMetadata[],
  saleDate: string
): string {
  const formats = new Map<string, { template: SequentialNumber; count: number; max: number }>();

  monthlyInvoices.forEach((invoice) => {
    const parsed = parseSequentialNumber(invoice.invoiceNumber);
    if (!parsed) return;

    const key = `${parsed.prefix}\u0000${parsed.suffix}`;
    const current = formats.get(key);
    formats.set(key, {
      template: parsed,
      count: (current?.count || 0) + 1,
      max: Math.max(current?.max || 0, parsed.sequence),
    });
  });

  const dominantFormat = [...formats.values()].sort(
    (left, right) => right.count - left.count || right.max - left.max
  )[0];
  if (dominantFormat) {
    return formatNumber(dominantFormat.template, dominantFormat.max + 1);
  }

  const latestTemplate = [...recentInvoices]
    .sort((left, right) => (right.dateIssue || '').localeCompare(left.dateIssue || ''))
    .map((invoice) => ({ invoice, parsed: parseSequentialNumber(invoice.invoiceNumber) }))
    .find(({ invoice, parsed }) => invoice.dateIssue && parsed);

  if (latestTemplate?.parsed && latestTemplate.invoice.dateIssue) {
    const prefix = adaptPrefixToDate(
      latestTemplate.parsed.prefix,
      latestTemplate.invoice.dateIssue,
      saleDate
    );
    return formatNumber(latestTemplate.parsed, 1, prefix);
  }

  const [year, month] = saleDate.split('-');
  return `FV/${year}/${month}/001`;
}

export function getMonthRange(date: string): { from: string; to: string } {
  const [year, month] = date.split('-').map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return {
    from: `${year}-${String(month).padStart(2, '0')}-01`,
    to: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
  };
}

export function getRecentRange(date: string): { from: string; to: string } {
  const target = new Date(`${date}T00:00:00Z`);
  const from = new Date(target);
  from.setUTCDate(from.getUTCDate() - 89);

  return {
    from: from.toISOString().slice(0, 10),
    to: date,
  };
}
