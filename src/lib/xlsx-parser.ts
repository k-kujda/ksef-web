import * as XLSX from 'xlsx';
import { Faktura, Podmiot1, Podmiot2, WierszFaktury, Platnosc, FormaPlatnosci, RodzajFaktury, PodsumowanieVAT, StawkaPodatku, DaneIdentyfikacyjneNabywcy } from './ksef/types';

export interface XlsxRow {
  numer: string | number;
  rodzaj: string;
  data_wyst: string | number;
  data_dost?: string | number;
  data_wplywu?: string | number;
  termin_plat?: string | number;
  forma_plat?: string;
  nr_dok_korygowanego?: string;
  skrot_nazwy: string;
  nazwa: string;
  kod_poczt: string | number;
  miejscowosc: string;
  adres: string;
  nip: string | number;
  kraj: string;
  kurs?: string | number;
  waluta?: string;
  netto_razem?: string | number;
  vat_razem?: string | number;
  stawka_vat: string | number;
  nazwa_pozycji: string;
  kategoria?: string;
  jm: string;
  ilosc: string | number;
  cena: string | number;
  wartosc: string | number;
}

export interface SellerInfo {
  nip: string;
  nazwa: string;
  kodPocztowy: string;
  miejscowosc: string;
  adres: string;
  kraj: string;
  numerRachunku?: string;
  swift?: string;
  nazwaBanku?: string;
  opisRachunku?: string;
  dodatkowyOpis?: Array<[string, string]>;
  p18ReverseCharge?: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export class ParsedInvoiceRow {
  numer: string;
  dataWystawienia: string;
  dataSprzedazy: string;
  terminPlatnosci: string;
  formaPlatnosci: FormaPlatnosci;
  
  nabywcaNazwa: string;
  nabywcaNip: string;
  nabywcaKodPocztowy: string;
  nabywcaMiejscowosc: string;
  nabywcaAdres: string;
  nabywcaKraj: string;
  
  pozycjaNazwa: string;
  pozycjaJm: string;
  pozycjaIlosc: number;
  pozycjaCena: number;
  pozycjaWartosc: number;
  
  stawka: StawkaPodatku;
  waluta: string;
  
  kwotaVat: number;
  kwotaBrutto: number;
  
  errors: ValidationError[] = [];

  constructor(row: XlsxRow) {
    this.numer = String(row.numer || '');
    this.dataWystawienia = this.parseDate(row.data_wyst);
    this.dataSprzedazy = this.parseDate(row.data_dost || row.data_wyst);
    this.terminPlatnosci = this.parseDate(row.termin_plat);
    this.formaPlatnosci = this.parseFormaPlatnosci(row.forma_plat);
    
    this.nabywcaNazwa = String(row.nazwa || '');
    this.nabywcaNip = this.parseNipOrTaxId(String(row.nip || ''));
    this.nabywcaKodPocztowy = String(row.kod_poczt || '');
    this.nabywcaMiejscowosc = String(row.miejscowosc || '');
    this.nabywcaAdres = String(row.adres || '');
    this.nabywcaKraj = String(row.kraj || 'PL');
    
    this.pozycjaNazwa = String(row.nazwa_pozycji || '');
    this.pozycjaJm = String(row.jm || 'szt');
    this.pozycjaIlosc = this.parseDecimalNumber(row.ilosc);
    this.pozycjaCena = this.parseDecimalNumber(row.cena);
    this.pozycjaWartosc = this.parseDecimalNumber(row.wartosc);
    
    this.stawka = this.parseStawka(row.stawka_vat);
    this.waluta = String(row.waluta || 'PLN');
    
    this.kwotaVat = Math.round(this.calculateVat() * 100) / 100;
    this.kwotaBrutto = Math.round((this.pozycjaWartosc + this.kwotaVat) * 100) / 100;
    
    this.validate();
  }

  private parseNipOrTaxId(value: string): string {
    if (!value) return '';
    
    const trimmed = value.trim().toUpperCase();
    
    // EU country codes (2 letters)
    const euCountries = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];
    
    // Check for EU VAT format: COUNTRY_CODEXXXXXXXX (e.g., DE123456789)
    const euMatch = trimmed.match(/^([A-Z]{2})(.+)$/);
    if (euMatch && euCountries.includes(euMatch[1])) {
      // Return as-is, will be parsed in rowsToFaktura
      return trimmed;
    }
    
    // Check for non-EU format: UEXXXXXXXX (e.g., UE123456789)
    if (trimmed.startsWith('UE')) {
      // Return as-is, will be parsed in rowsToFaktura
      return trimmed;
    }
    
    // Regular Polish NIP or other format
    return trimmed;
  }

  private parseDate(dateStr: string | number | undefined): string {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    
    if (typeof dateStr === 'number') {
      if (dateStr > 25569) {
        const date = XLSX.SSF.parse_date_code(dateStr);
        return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
      }
      return new Date().toISOString().split('T')[0];
    }
    
    const str = String(dateStr).trim();
    
    if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return str;
    }
    
    if (str.match(/^\d{2}[.\/]\d{2}[.\/]\d{4}$/)) {
      const parts = str.split(/[.\/]/);
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    
    if (str.match(/^\d{4}[.\/]\d{2}[.\/]\d{2}$/)) {
      return str.replace(/[.\/]/g, '-');
    }
    
    const excelDate = parseFloat(str);
    if (!isNaN(excelDate) && excelDate > 25569) {
      const date = XLSX.SSF.parse_date_code(excelDate);
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
    
    return new Date().toISOString().split('T')[0];
  }

  private parseDecimalNumber(value: string | number | undefined): number {
    if (value === undefined || value === null) return 0;
    if (typeof value === 'number') return Math.round(value * 100) / 100;
    const cleaned = String(value).replace(',', '.').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num * 100) / 100;
  }

  private parseFormaPlatnosci(forma?: string): FormaPlatnosci {
    if (!forma) return FormaPlatnosci.PRZELEW;
    
    const formaLower = forma.toLowerCase();
    if (formaLower.includes('gotów') || formaLower.includes('gotow')) return FormaPlatnosci.GOTOWKA;
    if (formaLower.includes('kart')) return FormaPlatnosci.KARTA;
    if (formaLower.includes('bon')) return FormaPlatnosci.BON;
    if (formaLower.includes('czek')) return FormaPlatnosci.CZEK;
    if (formaLower.includes('kredyt')) return FormaPlatnosci.KREDYT;
    if (formaLower.includes('przelew')) return FormaPlatnosci.PRZELEW;
    if (formaLower.includes('mobil')) return FormaPlatnosci.MOBILNA;
    
    return FormaPlatnosci.PRZELEW;
  }

  private parseStawka(stawka: string | number): StawkaPodatku {
    if (typeof stawka === 'string') {
      const stawkaTrimmed = stawka.trim();
      const stawkaLower = stawkaTrimmed.toLowerCase();
      if (stawkaLower === 'np' || stawkaLower === 'np i') return StawkaPodatku.NP_I;
      if (stawkaLower === 'np ii') return StawkaPodatku.NP_II;
      if (stawkaLower === 'zw') return StawkaPodatku.ZW;
      if (stawkaLower === 'oo') return StawkaPodatku.OO;
      if (stawkaLower === '0 kr') return StawkaPodatku.S0_KR;
      if (stawkaLower === '0 wdt') return StawkaPodatku.S0_WDT;
      if (stawkaLower === '0 ex') return StawkaPodatku.S0_EX;
    }
    
    const str = String(stawka).replace(',', '.').replace('%', '').trim();
    const rate = parseFloat(str);
    if (isNaN(rate)) return StawkaPodatku.S23;
    
    // Handle decimal fractions (e.g. 0.23 from XLSX percentage format)
    const pct = rate > 0 && rate < 1 ? Math.round(rate * 100) : rate;
    
    if (pct === 23) return StawkaPodatku.S23;
    if (pct === 22) return StawkaPodatku.S22;
    if (pct === 8) return StawkaPodatku.S8;
    if (pct === 7) return StawkaPodatku.S7;
    if (pct === 5) return StawkaPodatku.S5;
    if (pct === 4) return StawkaPodatku.S4;
    if (pct === 3) return StawkaPodatku.S3;
    if (pct === 0) return StawkaPodatku.S0_KR;
    
    return StawkaPodatku.S23;
  }

  getVatRate(): number {
    switch (this.stawka) {
      case StawkaPodatku.S23: return 23;
      case StawkaPodatku.S22: return 22;
      case StawkaPodatku.S8: return 8;
      case StawkaPodatku.S7: return 7;
      case StawkaPodatku.S5: return 5;
      case StawkaPodatku.S4: return 4;
      case StawkaPodatku.S3: return 3;
      case StawkaPodatku.S0_KR:
      case StawkaPodatku.S0_WDT:
      case StawkaPodatku.S0_EX:
      case StawkaPodatku.ZW:
      case StawkaPodatku.NP_I:
      case StawkaPodatku.NP_II:
      case StawkaPodatku.OO:
        return 0;
      default:
        return 0;
    }
  }

  getVatSummaryField(): keyof PodsumowanieVAT | null {
    switch (this.stawka) {
      case StawkaPodatku.S23:
      case StawkaPodatku.S22:
        return 'p_13_1';
      case StawkaPodatku.S8:
      case StawkaPodatku.S7:
        return 'p_13_2';
      case StawkaPodatku.S5:
      case StawkaPodatku.S4:
      case StawkaPodatku.S3:
        return 'p_13_3';
      case StawkaPodatku.S0_KR:
        return 'p_13_6_1';
      case StawkaPodatku.S0_WDT:
        return 'p_13_6_2';
      case StawkaPodatku.S0_EX:
        return 'p_13_6_3';
      case StawkaPodatku.ZW:
        return 'p_13_7';
      case StawkaPodatku.NP_I:
        return 'p_13_8';
      case StawkaPodatku.NP_II:
        return 'p_13_9';
      case StawkaPodatku.OO:
        return 'p_13_10';
      default:
        return null;
    }
  }

  private calculateVat(): number {
    const rate = this.getVatRate();
    return this.pozycjaWartosc * (rate / 100);
  }

  private validate(): void {
    this.errors = [];

    if (!this.numer) {
      this.errors.push({ field: 'numer', message: 'Brak numeru faktury', severity: 'error' });
    }

    if (!this.nabywcaNazwa) {
      this.errors.push({ field: 'nazwa', message: 'Brak nazwy nabywcy', severity: 'error' });
    }

    if (!this.nabywcaNip) {
      this.errors.push({ field: 'nip', message: 'Brak NIP nabywcy', severity: 'error' });
    }

    if (!this.pozycjaNazwa) {
      this.errors.push({ field: 'nazwa_pozycji', message: 'Brak nazwy pozycji', severity: 'error' });
    }

    const expectedWartosc = this.pozycjaIlosc * this.pozycjaCena;
    const tolerance = 0.02;
    if (Math.abs(this.pozycjaWartosc - expectedWartosc) > tolerance) {
      this.errors.push({
        field: 'wartosc',
        message: `Wartość (${this.pozycjaWartosc.toFixed(2)}) nie zgadza się z ilosc × cena (${expectedWartosc.toFixed(2)})`,
        severity: 'warning'
      });
    }

    if (this.pozycjaWartosc <= 0) {
      this.errors.push({ field: 'wartosc', message: 'Wartość musi być większa od 0', severity: 'error' });
    }
  }

  hasErrors(): boolean {
    return this.errors.some(e => e.severity === 'error');
  }

  toEditableObject() {
    return {
      numer: this.numer,
      dataWystawienia: this.dataWystawienia,
      dataSprzedazy: this.dataSprzedazy,
      terminPlatnosci: this.terminPlatnosci,
      nabywcaNazwa: this.nabywcaNazwa,
      nabywcaNip: this.nabywcaNip,
      nabywcaKodPocztowy: this.nabywcaKodPocztowy,
      nabywcaMiejscowosc: this.nabywcaMiejscowosc,
      nabywcaAdres: this.nabywcaAdres,
      nabywcaKraj: this.nabywcaKraj,
      pozycjaNazwa: this.pozycjaNazwa,
      pozycjaJm: this.pozycjaJm,
      pozycjaIlosc: this.pozycjaIlosc,
      pozycjaCena: this.pozycjaCena,
      pozycjaWartosc: this.pozycjaWartosc,
      stawka: this.stawka,
      waluta: this.waluta,
      kwotaVat: this.kwotaVat,
      kwotaBrutto: this.kwotaBrutto,
    };
  }
}

export async function parseXlsxFile(file: File): Promise<ParsedInvoiceRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<XlsxRow>(firstSheet);
        
        const parsedRows = rows.map(row => new ParsedInvoiceRow(row));
        resolve(parsedRows);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Błąd odczytu pliku'));
    reader.readAsBinaryString(file);
  });
}

export function buildVatSummary(rows: ParsedInvoiceRow[]): PodsumowanieVAT {
  const summary: PodsumowanieVAT = {};
  const vatGroups = new Map<keyof PodsumowanieVAT, { netto: number, vat: number }>();

  for (const row of rows) {
    const field = row.getVatSummaryField();
    if (!field) continue;

    if (!vatGroups.has(field)) {
      vatGroups.set(field, { netto: 0, vat: 0 });
    }

    const group = vatGroups.get(field)!;
    group.netto += row.pozycjaWartosc;
    group.vat += row.kwotaVat;
  }

  for (const [field, amounts] of vatGroups) {
    summary[field] = Math.round(amounts.netto * 100) / 100;
    
    const vatField = field.replace('p_13_', 'p_14_') as keyof PodsumowanieVAT;
    if (amounts.vat > 0 && (field === 'p_13_1' || field === 'p_13_2' || field === 'p_13_3')) {
      summary[vatField] = Math.round(amounts.vat * 100) / 100;
    }
  }

  return summary;
}

function parseBuyerTaxId(nip: string, kraj: string): Partial<DaneIdentyfikacyjneNabywcy> {
  if (!nip) return {};
  
  const trimmed = nip.trim().toUpperCase();
  
  // EU country codes (2 letters)
  const euCountries = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];
  
  // Check for format: COUNTRY_CODEXXXXXXXX (e.g., DE123456789, UA428569613042)
  const countryMatch = trimmed.match(/^([A-Z]{2})(.+)$/);
  if (countryMatch && countryMatch[2].length > 0) {
    const [, countryCode, taxNumber] = countryMatch;
    
    // If it's an EU country, use KodUE + NrVatUE
    if (euCountries.includes(countryCode)) {
      return { kodUE: countryCode, nrVatUE: taxNumber };
    }
    
    // Otherwise it's a non-EU country, use KodKraju + NrID
    return { kodKraju: countryCode, nrID: taxNumber };
  }
  
  // Check for non-EU format: UEXXXXXXXX (e.g., UE123456789)
  if (trimmed.startsWith('UE') && trimmed.length > 2) {
    const nrID = trimmed.substring(2);
    // Use country code from kraj field if available and not PL
    const kodKraju = (kraj && kraj !== 'PL') ? kraj : undefined;
    return { kodKraju, nrID };
  }
  
  // Regular Polish NIP or other format
  return { nip: trimmed };
}

export function rowsToFaktura(rows: ParsedInvoiceRow[], seller: SellerInfo): Faktura {
  if (rows.length === 0) {
    throw new Error('Brak wierszy do przetworzenia');
  }

  const firstRow = rows[0];

  const podmiot1: Podmiot1 = {
    daneIdentyfikacyjne: {
      nip: seller.nip,
      nazwa: seller.nazwa,
    },
    adres: {
      kodKraju: seller.kraj,
      adresL1: `${seller.kodPocztowy} ${seller.miejscowosc}`,
      adresL2: seller.adres,
    },
  };

  // Parse buyer tax identification
  const buyerTaxId = parseBuyerTaxId(firstRow.nabywcaNip, firstRow.nabywcaKraj);

  const podmiot2: Podmiot2 = {
    daneIdentyfikacyjne: {
      ...buyerTaxId,
      nazwa: firstRow.nabywcaNazwa,
    },
    adres: {
      kodKraju: firstRow.nabywcaKraj,
      adresL1: `${firstRow.nabywcaKodPocztowy} ${firstRow.nabywcaMiejscowosc}`,
      adresL2: firstRow.nabywcaAdres,
    },
    jst: 2,
    gv: 2,
  };

  const wiersze: WierszFaktury[] = rows.map((row, index) => ({
    nrWiersza: index + 1,
    nazwa: row.pozycjaNazwa,
    miara: row.pozycjaJm,
    ilosc: row.pozycjaIlosc,
    cenaJednostkowaNetto: row.pozycjaCena,
    wartoscNetto: row.pozycjaWartosc,
    stawka: row.stawka,
  }));

  const podsumowanieVat = buildVatSummary(rows);

  const totalBrutto = rows.reduce((sum, row) => sum + row.kwotaBrutto, 0);

  const platnosc: Platnosc = {
    termin: firstRow.terminPlatnosci,
    forma: firstRow.formaPlatnosci,
    ...(seller.numerRachunku && {
      rachunek: {
        nrRb: seller.numerRachunku,
        ...(seller.swift && { swift: seller.swift }),
        ...(seller.nazwaBanku && { nazwaBanku: seller.nazwaBanku }),
        ...(seller.opisRachunku && { opisRachunku: seller.opisRachunku }),
      }
    }),
  };

  const faktura: Faktura = {
    dataWytworzenia: new Date(),
    nrFaktury: firstRow.numer,
    dataWystawienia: firstRow.dataWystawienia,
    dataSprzedazy: firstRow.dataSprzedazy,
    rodzajFaktury: RodzajFaktury.VAT,
    podmiot1,
    podmiot2,
    wiersze,
    podsumowanieVat,
    kwotaNaleznosci: totalBrutto,
    platnosc,
    kodWaluty: firstRow.waluta,
    ...(seller.dodatkowyOpis && seller.dodatkowyOpis.length > 0 && {
      dodatkowyOpis: seller.dodatkowyOpis,
    }),
    p18ReverseCharge: seller.p18ReverseCharge,
  };

  return faktura;
}
