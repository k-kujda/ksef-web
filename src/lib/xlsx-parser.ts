import * as XLSX from 'xlsx';
import { Faktura, Podmiot1, Podmiot2, WierszFaktury, Platnosc, FormaPlatnosci, RodzajFaktury, PodsumowanieVAT, StawkaPodatku } from './ksef/types';

export interface XlsxRow {
  numer: string;
  rodzaj: string;
  data_wyst: string;
  data_dost?: string;
  data_wplywu?: string;
  termin_plat?: string;
  forma_plat?: string;
  nr_dok_korygowanego?: string;
  skrot_nazwy: string;
  nazwa: string;
  kod_poczt: string;
  miejscowosc: string;
  adres: string;
  nip: string;
  kraj: string;
  kurs?: string;
  waluta?: string;
  netto_razem?: string;
  vat_razem?: string;
  stawka_vat: string;
  nazwa_pozycji: string;
  kategoria?: string;
  jm: string;
  ilosc: string;
  cena: string;
  wartosc: string;
}

export interface SellerInfo {
  nip: string;
  nazwa: string;
  kodPocztowy: string;
  miejscowosc: string;
  adres: string;
  kraj: string;
  numerRachunku?: string;
}

export async function parseXlsxFile(file: File): Promise<XlsxRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<XlsxRow>(firstSheet);
        resolve(rows);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Błąd odczytu pliku'));
    reader.readAsBinaryString(file);
  });
}

function parseDate(dateStr: string | undefined): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  
  if (dateStr.includes('-')) {
    return dateStr;
  }
  
  const excelDate = parseFloat(dateStr);
  if (!isNaN(excelDate)) {
    const date = XLSX.SSF.parse_date_code(excelDate);
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }
  
  return dateStr;
}

function parseVatRate(stawka: string): number {
  const cleaned = stawka.replace('%', '').replace(',', '.').trim();
  const rate = parseFloat(cleaned);
  return isNaN(rate) ? 23 : rate;
}

function parseDecimal(value: string | undefined): string {
  if (!value) return '0.00';
  const cleaned = value.replace(',', '.').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? '0.00' : num.toFixed(2);
}

function getFormaPlatnosci(forma?: string): FormaPlatnosci {
  if (!forma) return FormaPlatnosci.PRZELEW;
  
  const formaLower = forma.toLowerCase();
  if (formaLower.includes('gotów') || formaLower.includes('gotow')) {
    return FormaPlatnosci.GOTOWKA;
  }
  if (formaLower.includes('kart')) {
    return FormaPlatnosci.KARTA;
  }
  if (formaLower.includes('bon')) {
    return FormaPlatnosci.BON;
  }
  if (formaLower.includes('mobil')) {
    return FormaPlatnosci.MOBILNA;
  }
  
  return FormaPlatnosci.PRZELEW;
}

function getStawkaPodatku(rate: number): StawkaPodatku {
  if (rate === 23) return StawkaPodatku.S23;
  if (rate === 22) return StawkaPodatku.S22;
  if (rate === 8) return StawkaPodatku.S8;
  if (rate === 7) return StawkaPodatku.S7;
  if (rate === 5) return StawkaPodatku.S5;
  if (rate === 4) return StawkaPodatku.S4;
  if (rate === 3) return StawkaPodatku.S3;
  if (rate === 0) return StawkaPodatku.S0_KR;
  return StawkaPodatku.S23;
}

export function xlsxRowsToFaktury(rows: XlsxRow[], seller: SellerInfo): Faktura[] {
  const invoiceMap = new Map<string, { rows: XlsxRow[], buyer: XlsxRow }>();
  
  for (const row of rows) {
    if (!invoiceMap.has(row.numer)) {
      invoiceMap.set(row.numer, { rows: [], buyer: row });
    }
    invoiceMap.get(row.numer)!.rows.push(row);
  }
  
  const faktury: Faktura[] = [];
  
  for (const [numer, { rows: invoiceRows, buyer }] of invoiceMap) {
    const firstRow = invoiceRows[0];
    
    const wiersze: WierszFaktury[] = invoiceRows.map((row, index) => ({
      nrWiersza: index + 1,
      nazwa: row.nazwa_pozycji,
      miara: row.jm,
      ilosc: parseFloat(parseDecimal(row.ilosc)),
      cenaJednostkowaNetto: parseFloat(parseDecimal(row.cena)),
      wartoscNetto: parseFloat(parseDecimal(row.wartosc)),
      stawka: getStawkaPodatku(parseVatRate(row.stawka_vat)),
    }));
    
    let totalNetto = 0;
    let totalVat = 0;
    const podsumowanieVat: PodsumowanieVAT = {};
    
    const vatByRate = new Map<number, { netto: number, vat: number }>();
    for (const row of invoiceRows) {
      const rate = parseVatRate(row.stawka_vat);
      const netto = parseFloat(parseDecimal(row.wartosc));
      const vat = netto * (rate / 100);
      
      if (!vatByRate.has(rate)) {
        vatByRate.set(rate, { netto: 0, vat: 0 });
      }
      const current = vatByRate.get(rate)!;
      current.netto += netto;
      current.vat += vat;
      totalNetto += netto;
      totalVat += vat;
    }
    
    const rates = Array.from(vatByRate.keys()).sort((a, b) => b - a);
    if (rates[0] === 23) {
      const amounts = vatByRate.get(23)!;
      podsumowanieVat.p_13_1 = amounts.netto;
      podsumowanieVat.p_14_1 = amounts.vat;
    }
    if (rates.includes(8) || rates.includes(7)) {
      const rate = rates.includes(8) ? 8 : 7;
      const amounts = vatByRate.get(rate)!;
      podsumowanieVat.p_13_2 = amounts.netto;
      podsumowanieVat.p_14_2 = amounts.vat;
    }
    if (rates.includes(5) || rates.includes(4) || rates.includes(3)) {
      const rate = rates.find(r => r === 5 || r === 4 || r === 3)!;
      const amounts = vatByRate.get(rate)!;
      podsumowanieVat.p_13_3 = amounts.netto;
      podsumowanieVat.p_14_3 = amounts.vat;
    }
    
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
    
    const podmiot2: Podmiot2 = {
      daneIdentyfikacyjne: {
        nip: buyer.nip,
        nazwa: buyer.nazwa,
      },
      adres: {
        kodKraju: buyer.kraj,
        adresL1: `${buyer.kod_poczt} ${buyer.miejscowosc}`,
        adresL2: buyer.adres,
      },
      jst: 0,
      gv: 0,
    };
    
    const platnosc: Platnosc = {
      termin: parseDate(firstRow.termin_plat),
      forma: getFormaPlatnosci(firstRow.forma_plat),
      ...(seller.numerRachunku && { 
        rachunek: { nrRb: seller.numerRachunku } 
      }),
    };
    
    const faktura: Faktura = {
      dataWytworzenia: new Date(),
      nrFaktury: numer,
      dataWystawienia: parseDate(firstRow.data_wyst),
      dataSprzedazy: parseDate(firstRow.data_dost || firstRow.data_wyst),
      rodzajFaktury: RodzajFaktury.VAT,
      podmiot1,
      podmiot2,
      wiersze,
      podsumowanieVat,
      kwotaNaleznosci: totalNetto + totalVat,
      platnosc,
      kodWaluty: firstRow.waluta || 'PLN',
    };
    
    faktury.push(faktura);
  }
  
  return faktury;
}
