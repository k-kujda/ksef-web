export enum RodzajFaktury {
  VAT = 'VAT',
  KOR = 'KOR',
  ZAL = 'ZAL',
  ROZ = 'ROZ',
  UPR = 'UPR',
  KOR_ZAL = 'KOR_ZAL',
  KOR_ROZ = 'KOR_ROZ',
}

export enum StawkaPodatku {
  S23 = '23',
  S22 = '22',
  S8 = '8',
  S7 = '7',
  S5 = '5',
  S4 = '4',
  S3 = '3',
  S0_KR = '0 KR',
  S0_WDT = '0 WDT',
  S0_EX = '0 EX',
  ZW = 'zw',
  OO = 'oo',
  NP_I = 'np I',
  NP_II = 'np II',
}

export enum FormaPlatnosci {
  GOTOWKA = '1',
  KARTA = '2',
  BON = '3',
  CZEK = '4',
  KREDYT = '5',
  PRZELEW = '6',
  MOBILNA = '7',
}

export interface Adres {
  kodKraju: string;
  adresL1: string;
  adresL2?: string;
}

export interface DaneIdentyfikacyjnePodatnika {
  nip: string;
  nazwa: string;
}

export interface DaneIdentyfikacyjneNabywcy {
  nip?: string;
  nazwa?: string;
  kodUE?: string;
  nrVatUE?: string;
  kodKraju?: string;
  nrID?: string;
  brakId?: boolean;
}

export interface Podmiot1 {
  daneIdentyfikacyjne: DaneIdentyfikacyjnePodatnika;
  adres: Adres;
  prefiksPodatnika?: string;
  email?: string;
  telefon?: string;
}

export interface Podmiot2 {
  daneIdentyfikacyjne: DaneIdentyfikacyjneNabywcy;
  adres?: Adres;
  jst: number;
  gv: number;
  email?: string;
  telefon?: string;
}

export interface WierszFaktury {
  nrWiersza: number;
  nazwa: string;
  miara?: string;
  ilosc?: number;
  cenaJednostkowaNetto?: number;
  wartoscNetto?: number;
  stawka?: StawkaPodatku;
  gtu?: string;
  pkwiu?: string;
}

export interface RachunekBankowy {
  nrRb: string;
  swift?: string;
  nazwaBanku?: string;
  opisRachunku?: string;
}

export interface Platnosc {
  forma?: FormaPlatnosci;
  termin?: string;
  rachunek?: RachunekBankowy;
}

export interface PodsumowanieVAT {
  p_13_1?: number;
  p_14_1?: number;
  p_13_2?: number;
  p_14_2?: number;
  p_13_3?: number;
  p_14_3?: number;
  p_13_6_1?: number;
  p_13_6_2?: number;
  p_13_6_3?: number;
  p_13_7?: number;
  p_13_8?: number;
  p_13_9?: number;
  p_13_10?: number;
  p_13_11?: number;
}

export interface Faktura {
  dataWytworzenia: Date;
  systemInfo?: string;
  podmiot1: Podmiot1;
  podmiot2: Podmiot2;
  kodWaluty: string;
  dataWystawienia: string;
  nrFaktury: string;
  dataSprzedazy?: string;
  rodzajFaktury: RodzajFaktury;
  kwotaNaleznosci: number;
  podsumowanieVat: PodsumowanieVAT;
  wiersze: WierszFaktury[];
  platnosc?: Platnosc;
  dodatkowyOpis?: Array<[string, string]>;
}
