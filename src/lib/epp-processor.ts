import * as XLSX from 'xlsx';

const TARGET_FIELDS = [4, 41, 42] as const;
const encoder = new TextEncoder();

export class EppProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EppProcessingError';
  }
}

interface RawRecord {
  start: number;
  end: number;
  fieldSpans: Array<[number, number]>;
}

interface AmountEntry {
  key: string;
  exactKey: string;
  title: string;
  amount: number;
  fallbackDate: Date;
  direction: 'BP' | 'BW';
  sourceRow: number;
}

interface DateEntry {
  reference: string;
  dates: Set<string>;
}

interface SettlementEvent {
  reference: string;
  transactionDate: Date;
  grossAmount: number;
  batchDate: Date | null;
  sourceWorkbook: string;
}

interface Replacement {
  start: number;
  end: number;
  value: Uint8Array;
}

export interface EppProcessingReport {
  currency: string;
  sourceEpp: string;
  subiektWorkbook: string;
  settlementWorkbooks: string[];
  outputEpp: string;
  bpRecords: number;
  amountRecordsMatched: number;
  amountRecordsUnmatched: number;
  amountRowsUnused: number;
  dateFromSettlement: number;
  dateFromReference: number;
  dateFromUniqueAmount: number;
  dateFromSubiektFallback: number;
  dateLeftUnchanged: number;
  dateUpdates: number;
  amountUpdates: number;
  replacements: number;
  unmatchedTitles: string[];
  unusedAmountTitles: string[];
  uniqueAmountTitles: string[];
  fallbackTitles: string[];
  selectedSheets: Record<string, string>;
}

export interface EppProcessingResult {
  bytes: Uint8Array;
  outputName: string;
  report: EppProcessingReport;
}

type SheetRow = Record<string, unknown>;

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).normalize('NFKC').replace(/\u00a0/g, ' ').trim().toUpperCase().replace(/\s+/g, ' ');
}

function normalizeHeader(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeTitleExact(value: unknown): string {
  return normalizeText(value).replace(/\((-?\d+(?:[.,]\d+)?)\)/g, (_, raw: string) => {
    const amount = Number(raw.replace(',', '.'));
    return Number.isFinite(amount) ? `(${String(amount)})` : `(${raw})`;
  });
}

function normalizeTitle(value: unknown): string {
  let text = normalizeTitleExact(value);
  if (/^K?FS\s+/.test(text)) {
    text = text.replace(/\((-?\d+(?:[.,]\d+)?)\)/g, '').replace(/\s+/g, ' ').trim();
  }
  return text;
}

function parseDecimal(value: unknown, label: string): number {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new EppProcessingError(`Brak wartości liczbowej: ${label}.`);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value).trim().replace(/\u00a0/g, '').replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(parsed)) throw new EppProcessingError(`Nieprawidłowa wartość liczbowa w ${label}.`);
  return parsed;
}

function optionalDecimal(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  try {
    return parseDecimal(value, 'arkuszu');
  } catch {
    return null;
  }
}

function excelSerialToDate(value: number): Date {
  const date = XLSX.SSF.parse_date_code(value);
  if (!date) throw new EppProcessingError(`Nieprawidłowa data Excela: ${value}.`);
  return new Date(Date.UTC(date.y, date.m - 1, date.d));
}

function parseDate(value: unknown, label: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  if (typeof value === 'number') return excelSerialToDate(value);
  const raw = String(value ?? '').trim();
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  match = raw.match(/^(\d{2})[./](\d{2})[./](\d{4})/);
  if (match) return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  throw new EppProcessingError(`Nieprawidłowa data w ${label}: ${raw || 'pusta wartość'}.`);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function batchDateFromFilename(name: string): Date | null {
  let match = name.match(/(?:^|\D)(\d{2})\.(\d{2})\.(\d{4})(?!\d)/);
  if (match) return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  match = name.match(/(?:^|\D)(\d{4})-(\d{2})-(\d{2})(?!\d)/);
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return null;
}

function splitCsvFieldSpans(record: Uint8Array): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let inQuotes = false;
  let fieldStart = 0;
  for (let index = 0; index < record.length; index += 1) {
    if (record[index] === 34) {
      if (inQuotes && record[index + 1] === 34) {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (record[index] === 44 && !inQuotes) {
      spans.push([fieldStart, index]);
      fieldStart = index + 1;
    }
  }
  if (inQuotes) throw new EppProcessingError('Niekompletne pole tekstowe w pliku EPP.');
  spans.push([fieldStart, record.length]);
  return spans;
}

function findRecordEnd(data: Uint8Array, start: number): number {
  let inQuotes = false;
  for (let index = start; index < data.length; index += 1) {
    if (data[index] === 34) {
      if (inQuotes && data[index + 1] === 34) index += 1;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && (data[index] === 10 || data[index] === 13)) {
      return index;
    }
  }
  return data.length;
}

function bytesEqualAt(data: Uint8Array, offset: number, expected: Uint8Array): boolean {
  if (offset + expected.length > data.length) return false;
  return expected.every((byte, index) => data[offset + index] === byte);
}

function sectionRecords(data: Uint8Array, section: string): RawRecord[] {
  const marker = encoder.encode(`[${section}]`);
  const records: RawRecord[] = [];
  for (let index = 0; index <= data.length - marker.length; index += 1) {
    const lineStart = index === 0 || data[index - 1] === 10 || data[index - 1] === 13;
    if (!lineStart || !bytesEqualAt(data, index, marker)) continue;
    let start = index + marker.length;
    if (data[start] === 13) start += 1;
    if (data[start] === 10) start += 1;
    while (data[start] === 13 || data[start] === 10) start += 1;
    const end = findRecordEnd(data, start);
    const record = data.slice(start, end);
    records.push({ start, end, fieldSpans: splitCsvFieldSpans(record) });
    index = end;
  }
  return records;
}

function rawField(data: Uint8Array, record: RawRecord, fieldNumber: number): Uint8Array {
  const span = record.fieldSpans[fieldNumber];
  if (!span) throw new EppProcessingError(`Rekord EPP nie ma pola ${fieldNumber}.`);
  return data.slice(record.start + span[0], record.start + span[1]);
}

function decodeCsvField(token: Uint8Array, decoder: TextDecoder): string {
  let value = token;
  if (value.length >= 2 && value[0] === 34 && value[value.length - 1] === 34) {
    const unescaped: number[] = [];
    for (let index = 1; index < value.length - 1; index += 1) {
      unescaped.push(value[index]);
      if (value[index] === 34 && value[index + 1] === 34) index += 1;
    }
    value = new Uint8Array(unescaped);
  }
  return decoder.decode(value);
}

function declaredDecoder(data: Uint8Array): TextDecoder {
  const records = sectionRecords(data, 'INFO');
  if (records.length !== 1 || records[0].fieldSpans.length < 3) {
    throw new EppProcessingError('Plik EPP musi zawierać jeden prawidłowy rekord INFO.');
  }
  const ascii = new TextDecoder('ascii');
  const codePage = decodeCsvField(rawField(data, records[0], 2), ascii).trim();
  try {
    return new TextDecoder(codePage === '1250' ? 'windows-1250' : `windows-${codePage}`, { fatal: true });
  } catch {
    throw new EppProcessingError(`Nieobsługiwana strona kodowa EPP: ${codePage}.`);
  }
}

function bankRecords(data: Uint8Array, decoder: TextDecoder): RawRecord[] {
  return sectionRecords(data, 'NAGLOWEK').filter((record) => {
    if (record.fieldSpans.length !== 56) return false;
    const type = decodeCsvField(rawField(data, record, 0), decoder);
    return type === 'BP' || type === 'BW';
  });
}

function workbookFromFile(buffer: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: 'array', cellDates: true });
}

function sheetRows(workbook: XLSX.WorkBook, sheetName: string): SheetRow[] {
  return XLSX.utils.sheet_to_json<SheetRow>(workbook.Sheets[sheetName], { defval: null, raw: true });
}

function headerMap(row: SheetRow | undefined): Record<string, string> {
  if (!row) return {};
  return Object.keys(row).reduce<Record<string, string>>((map, column) => {
    map[normalizeHeader(column)] = column;
    return map;
  }, {});
}

function chooseSheet(workbook: XLSX.WorkBook, required: string[], filename: string) {
  for (const sheetName of workbook.SheetNames) {
    const rows = sheetRows(workbook, sheetName);
    const headers = headerMap(rows[0]);
    if (required.every((column) => column in headers)) return { sheetName, rows, headers };
  }
  throw new EppProcessingError(`${filename}: żaden arkusz nie zawiera kolumn: ${required.join(', ')}.`);
}

function loadAmountEntries(workbook: XLSX.WorkBook, filename: string, currency: string) {
  const required = ['data', 'tytulem', 'wplatawwalucie', 'wyplatawwalucie', 'waluta'];
  const { sheetName, rows, headers } = chooseSheet(workbook, required, filename);
  const entries = new Map<string, AmountEntry[]>();
  rows.forEach((row, index) => {
    const incoming = row[headers.wplatawwalucie];
    const outgoing = row[headers.wyplatawwalucie];
    const hasIncoming = incoming !== null && incoming !== undefined && String(incoming).trim() !== '';
    const hasOutgoing = outgoing !== null && outgoing !== undefined && String(outgoing).trim() !== '';
    if (hasIncoming === hasOutgoing) {
      throw new EppProcessingError(`${filename}, wiersz ${index + 2}: wypełniona musi być dokładnie jedna kwota wpłaty lub wypłaty.`);
    }
    const rowCurrency = normalizeText(row[headers.waluta]);
    if (rowCurrency !== currency) {
      throw new EppProcessingError(`${filename}, wiersz ${index + 2}: waluta ${rowCurrency || '(brak)'} nie zgadza się z ${currency}.`);
    }
    const title = String(row[headers.tytulem] ?? '').trim();
    const entry: AmountEntry = {
      key: normalizeTitle(title),
      exactKey: normalizeTitleExact(title),
      title,
      amount: parseDecimal(hasIncoming ? incoming : outgoing, `${filename}, wiersz ${index + 2}`),
      fallbackDate: parseDate(row[headers.data], `${filename}, wiersz ${index + 2}`),
      direction: hasIncoming ? 'BP' : 'BW',
      sourceRow: index + 2,
    };
    entries.set(entry.key, [...(entries.get(entry.key) ?? []), entry]);
  });
  if (!entries.size) throw new EppProcessingError(`${filename}: brak danych do przetworzenia.`);
  return { entries, sheetName };
}

function isMatchableReference(reference: string): boolean {
  return reference.length >= 5 && !['NAN', 'NONE', '.'].includes(reference);
}

function loadDateEntries(files: Array<{ file: File; workbook: XLSX.WorkBook }>) {
  const entries = new Map<string, DateEntry>();
  const events: SettlementEvent[] = [];
  const selectedSheets: Record<string, string> = {};
  const ignored = new Set(['scalone', 'niescalone', 'sprawdzeniezsubiektem']);

  for (const { file, workbook } of files) {
    const usable: string[] = [];
    const eventKeys = new Set<string>();
    for (const sheetName of workbook.SheetNames) {
      if (ignored.has(normalizeHeader(sheetName))) continue;
      const rows = sheetRows(workbook, sheetName);
      const headers = headerMap(rows[0]);
      if (!('data' in headers) || !('dokumentpowiazany' in headers)) continue;
      usable.push(sheetName);
      const grouped = new Map<string, number>();
      const explicit = new Map<string, Set<number>>();

      rows.forEach((row, index) => {
        const rawDate = row[headers.data];
        if (rawDate === null || rawDate === undefined || String(rawDate).trim() === '') return;
        let date: Date;
        try {
          date = parseDate(rawDate, `${file.name}, ${sheetName}, wiersz ${index + 2}`);
        } catch {
          return;
        }
        const reference = normalizeText(row[headers.dokumentpowiazany]);
        if (isMatchableReference(reference)) {
          const entry = entries.get(reference) ?? { reference, dates: new Set<string>() };
          entry.dates.add(isoDate(date));
          entries.set(reference, entry);
        }
        const key = `${isoDate(date)}\0${reference}`;
        const gross = headers.wartosczamowienia ? optionalDecimal(row[headers.wartosczamowienia]) : null;
        if (gross !== null) grouped.set(key, (grouped.get(key) ?? 0) + gross);
        const sum = headers.sumajezeli ? optionalDecimal(row[headers.sumajezeli]) : null;
        if (sum !== null) {
          const values = explicit.get(key) ?? new Set<number>();
          values.add(money(sum));
          explicit.set(key, values);
        }
      });

      new Set([...grouped.keys(), ...explicit.keys()]).forEach((key) => {
        const [dateText, reference] = key.split('\0');
        const amounts = explicit.get(key) ?? new Set([money(grouped.get(key) ?? 0)]);
        amounts.forEach((grossAmount) => {
          const eventKey = `${file.name}\0${dateText}\0${reference}\0${grossAmount}`;
          if (eventKeys.has(eventKey)) return;
          eventKeys.add(eventKey);
          events.push({
            reference,
            transactionDate: parseDate(dateText, file.name),
            grossAmount,
            batchDate: batchDateFromFilename(file.name),
            sourceWorkbook: file.name,
          });
        });
      });
    }
    if (!usable.length) {
      throw new EppProcessingError(`${file.name}: brak arkusza z kolumnami Data i Dokument powiązany.`);
    }
    selectedSheets[file.name] = usable.join(', ');
  }
  return { entries, events, selectedSheets };
}

function parseEppDate(value: string): Date | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})\d{6}$/);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
}

function selectAmountEntry(candidates: AmountEntry[], currentDate: Date | null, used: Set<number>, title: string): AmountEntry {
  let matching = candidates.filter((entry) => entry.direction === 'BP');
  if (!matching.length) throw new EppProcessingError(`Pozycja „${title}” nie ma wpłaty BP w pliku Subiekt.`);
  if (currentDate) {
    const sameDate = matching.filter((entry) => isoDate(entry.fallbackDate) === isoDate(currentDate));
    if (sameDate.length) matching = sameDate;
  }
  return matching.find((entry) => entry.exactKey === normalizeTitleExact(title) && !used.has(entry.sourceRow))
    ?? matching.find((entry) => !used.has(entry.sourceRow))
    ?? matching[0];
}

function referenceInTitle(reference: string, title: string): boolean {
  if (!/\d/.test(reference)) return reference === title;
  let start = 0;
  while (start <= title.length) {
    const index = title.indexOf(reference, start);
    if (index < 0) return false;
    const before = index ? title[index - 1] : '';
    const after = title[index + reference.length] ?? '';
    if ((!before || !/[\p{L}\p{N}]/u.test(before)) && (!after || !/[\p{L}\p{N}]/u.test(after))) return true;
    start = index + 1;
  }
  return false;
}

function differsByAtMostOne(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let short = left;
  let long = right;
  if (short.length > long.length) [short, long] = [long, short];
  let i = 0;
  let j = 0;
  let differences = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i += 1;
      j += 1;
    } else {
      differences += 1;
      if (differences > 1) return false;
      if (short.length === long.length) i += 1;
      j += 1;
    }
  }
  return differences + (i < short.length || j < long.length ? 1 : 0) <= 1;
}

function selectUniqueAmountDate(events: SettlementEvent[], amount: number, batchDate: Date | null, title: string): Date | null {
  let pool = events;
  if (batchDate) {
    const sameBatch = pool.filter((event) => event.batchDate && isoDate(event.batchDate) === isoDate(batchDate));
    if (sameBatch.length) {
      pool = sameBatch;
    } else {
      const prior = pool.filter((event) => event.batchDate && batchDate.getTime() - event.batchDate.getTime() > 0
        && batchDate.getTime() - event.batchDate.getTime() <= 3 * 86400000);
      if (prior.length) {
        const latest = Math.max(...prior.map((event) => event.batchDate!.getTime()));
        pool = prior.filter((event) => event.batchDate!.getTime() === latest);
      } else if (pool.some((event) => event.batchDate)) {
        return null;
      }
    }
  }
  const identity = normalizeTitle(title);
  const invoiceLike = /^(?:K?FS|PA)\s+/.test(identity);
  const compatible = (event: SettlementEvent) => !invoiceLike || !event.reference || differsByAtMostOne(identity, event.reference);
  const signed = pool.filter((event) => money(event.grossAmount) === money(amount) && compatible(event));
  if (signed.length === 1) return signed[0].transactionDate;
  if (signed.length) return null;
  const absolute = pool.filter((event) => money(Math.abs(event.grossAmount)) === money(Math.abs(amount)) && compatible(event));
  return absolute.length === 1 ? absolute[0].transactionDate : null;
}

function applyReplacements(data: Uint8Array, replacements: Replacement[]): Uint8Array {
  const ordered = [...replacements].sort((a, b) => a.start - b.start);
  const length = data.length + ordered.reduce((sum, item) => sum + item.value.length - (item.end - item.start), 0);
  const result = new Uint8Array(length);
  let source = 0;
  let target = 0;
  ordered.forEach((item) => {
    if (item.start < source) throw new EppProcessingError('Wykryto nakładające się zmiany EPP.');
    result.set(data.slice(source, item.start), target);
    target += item.start - source;
    result.set(item.value, target);
    target += item.value.length;
    source = item.end;
  });
  result.set(data.slice(source), target);
  return result;
}

function maskTargetFields(data: Uint8Array): Uint8Array {
  const decoder = declaredDecoder(data);
  const replacements: Replacement[] = [];
  bankRecords(data, decoder).forEach((record) => {
    if (decodeCsvField(rawField(data, record, 0), decoder) !== 'BP') return;
    TARGET_FIELDS.forEach((field) => {
      const [start, end] = record.fieldSpans[field];
      replacements.push({ start: record.start + start, end: record.start + end, value: encoder.encode(`<TARGET-${field}>`) });
    });
  });
  return applyReplacements(data, replacements);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function validatePreservation(original: Uint8Array, updated: Uint8Array): void {
  const originalRecords = bankRecords(original, declaredDecoder(original));
  const updatedRecords = bankRecords(updated, declaredDecoder(updated));
  if (originalRecords.length !== updatedRecords.length || !equalBytes(maskTargetFields(original), maskTargetFields(updated))) {
    throw new EppProcessingError('Kontrola bezpieczeństwa nie powiodła się: zmieniły się dane poza dozwolonymi polami EPP.');
  }
}

function inferCurrency(files: File[]): 'EUR' | 'CZK' {
  const name = normalizeText(files.map((file) => file.name).join(' '));
  const eur = /\bEUR\b/.test(name);
  const czk = /\bCZK\b/.test(name);
  if (eur === czk) throw new EppProcessingError('Nie można jednoznacznie ustalić waluty EUR lub CZK z nazw plików.');
  return eur ? 'EUR' : 'CZK';
}

function dateBytes(date: Date): Uint8Array {
  return encoder.encode(isoDate(date).replace(/-/g, '') + '000000');
}

function amountBytes(amount: number): Uint8Array {
  return encoder.encode(amount.toFixed(4));
}

export async function processEppFiles(subiektFile: File, eppFile: File, settlementFiles: File[]): Promise<EppProcessingResult> {
  if (!settlementFiles.length) throw new EppProcessingError('Dodaj co najmniej jeden pozostały plik XLSX.');
  const currency = inferCurrency([subiektFile, eppFile, ...settlementFiles]);
  const [eppBuffer, subiektBuffer, ...settlementBuffers] = await Promise.all([
    eppFile.arrayBuffer(),
    subiektFile.arrayBuffer(),
    ...settlementFiles.map((file) => file.arrayBuffer()),
  ]);
  const original = new Uint8Array(eppBuffer);
  const decoder = declaredDecoder(original);
  const { entries: amountEntries, sheetName: amountSheet } = loadAmountEntries(
    workbookFromFile(subiektBuffer), subiektFile.name, currency,
  );
  const settlementInputs = settlementFiles.map((file, index) => ({
    file,
    workbook: workbookFromFile(settlementBuffers[index]),
  }));
  const { entries: dateEntries, events, selectedSheets } = loadDateEntries(settlementInputs);
  const sortedDates = [...dateEntries.values()].sort((a, b) => b.reference.length - a.reference.length);
  const replacements: Replacement[] = [];
  const usedRows = new Set<number>();
  const unmatchedTitles: string[] = [];
  const uniqueAmountTitles: string[] = [];
  const fallbackTitles: string[] = [];
  let matched = 0;
  let fromReference = 0;
  let fromUniqueAmount = 0;
  let fromFallback = 0;
  let leftUnchanged = 0;
  let dateUpdates = 0;
  let amountUpdates = 0;
  let bpRecords = 0;

  bankRecords(original, decoder).forEach((record) => {
    if (decodeCsvField(rawField(original, record, 0), decoder) !== 'BP') return;
    bpRecords += 1;
    const title = decodeCsvField(rawField(original, record, 36), decoder);
    const candidates = amountEntries.get(normalizeTitle(title));
    if (!candidates) {
      unmatchedTitles.push(title);
      return;
    }
    const currentDate = parseEppDate(decodeCsvField(rawField(original, record, 4), decoder));
    const amountEntry = selectAmountEntry(candidates, currentDate, usedRows, title);
    usedRows.add(amountEntry.sourceRow);
    matched += 1;

    const normalizedTitle = normalizeText(title);
    const matchingDates = sortedDates.filter((entry) => referenceInTitle(entry.reference, normalizedTitle));
    const dates = matchingDates.flatMap((entry) => [...entry.dates]).sort();
    let targetDate: Date | null = dates.length ? parseDate(dates[0], title) : null;
    if (targetDate) {
      fromReference += 1;
    } else {
      targetDate = selectUniqueAmountDate(events, amountEntry.amount, amountEntry.fallbackDate, title);
      if (targetDate) {
        fromUniqueAmount += 1;
        uniqueAmountTitles.push(title);
      } else if (amountEntry.fallbackDate) {
        targetDate = amountEntry.fallbackDate;
        fromFallback += 1;
        fallbackTitles.push(title);
      } else {
        leftUnchanged += 1;
      }
    }

    if (targetDate) {
      const value = dateBytes(targetDate);
      if (!equalBytes(rawField(original, record, 4), value)) {
        const [start, end] = record.fieldSpans[4];
        replacements.push({ start: record.start + start, end: record.start + end, value });
        dateUpdates += 1;
      }
    }
    const value = amountBytes(amountEntry.amount);
    let changed = false;
    [41, 42].forEach((field) => {
      if (equalBytes(rawField(original, record, field), value)) return;
      const [start, end] = record.fieldSpans[field];
      replacements.push({ start: record.start + start, end: record.start + end, value });
      changed = true;
    });
    if (changed) amountUpdates += 1;
  });

  if (unmatchedTitles.length) {
    throw new EppProcessingError(
      `${unmatchedTitles.length} rekordów BP nie ma pasującego wiersza w pliku Subiekt. Przykłady: ${unmatchedTitles.slice(0, 5).join(', ')}.`,
    );
  }
  const unusedEntries = [...amountEntries.values()].flat()
    .filter((entry) => entry.direction === 'BP' && !usedRows.has(entry.sourceRow))
    .sort((a, b) => a.sourceRow - b.sourceRow);
  const updated = applyReplacements(original, replacements);
  validatePreservation(original, updated);
  const outputName = eppFile.name.replace(/(\.epp)$/i, '_processed$1');
  return {
    bytes: updated,
    outputName,
    report: {
      currency,
      sourceEpp: eppFile.name,
      subiektWorkbook: subiektFile.name,
      settlementWorkbooks: settlementFiles.map((file) => file.name),
      outputEpp: outputName,
      bpRecords,
      amountRecordsMatched: matched,
      amountRecordsUnmatched: 0,
      amountRowsUnused: unusedEntries.length,
      dateFromSettlement: fromReference + fromUniqueAmount,
      dateFromReference: fromReference,
      dateFromUniqueAmount: fromUniqueAmount,
      dateFromSubiektFallback: fromFallback,
      dateLeftUnchanged: leftUnchanged,
      dateUpdates,
      amountUpdates,
      replacements: replacements.length,
      unmatchedTitles,
      unusedAmountTitles: unusedEntries.map((entry) => entry.title),
      uniqueAmountTitles,
      fallbackTitles,
      selectedSheets: { [subiektFile.name]: amountSheet, ...selectedSheets },
    },
  };
}
