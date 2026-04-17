import { TNS, XSI, NSMAP } from './constants';
import { Faktura, WierszFaktury } from './types';

function formatDecimal(value: number, decimals: number = 2): string {
  return value.toFixed(decimals);
}

function formatDecimal8(value: number): string {
  const str = value.toFixed(8);
  return str.replace(/\.?0+$/, '');
}

function formatDate(date: string): string {
  return date;
}

function formatDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function createElement(doc: Document, tagName: string, text?: string): Element {
  const el = doc.createElementNS(TNS, tagName);
  if (text !== undefined) {
    el.textContent = text;
  }
  return el;
}

export function generateXml(faktura: Faktura): Document {
  const doc = document.implementation.createDocument(TNS, 'Faktura', null);
  const root = doc.documentElement;

  root.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', TNS);
  root.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:etd', NSMAP.etd);
  root.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xsi', NSMAP.xsi);
  root.setAttributeNS(XSI, 'xsi:schemaLocation', `${TNS} ${TNS}schemat.xsd`);

  const naglowek = createElement(doc, 'Naglowek');
  const kf = createElement(doc, 'KodFormularza', 'FA');
  kf.setAttribute('kodSystemowy', 'FA (3)');
  kf.setAttribute('wersjaSchemy', '1-0E');
  naglowek.appendChild(kf);
  naglowek.appendChild(createElement(doc, 'WariantFormularza', '3'));
  naglowek.appendChild(createElement(doc, 'DataWytworzeniaFa', formatDateTime(faktura.dataWytworzenia)));
  if (faktura.systemInfo) {
    naglowek.appendChild(createElement(doc, 'SystemInfo', faktura.systemInfo));
  }
  root.appendChild(naglowek);

  const p1 = createElement(doc, 'Podmiot1');
  if (faktura.podmiot1.prefiksPodatnika) {
    p1.appendChild(createElement(doc, 'PrefiksPodatnika', faktura.podmiot1.prefiksPodatnika));
  }
  const di1 = createElement(doc, 'DaneIdentyfikacyjne');
  di1.appendChild(createElement(doc, 'NIP', faktura.podmiot1.daneIdentyfikacyjne.nip));
  di1.appendChild(createElement(doc, 'Nazwa', faktura.podmiot1.daneIdentyfikacyjne.nazwa));
  p1.appendChild(di1);
  const adr1 = createElement(doc, 'Adres');
  adr1.appendChild(createElement(doc, 'KodKraju', faktura.podmiot1.adres.kodKraju));
  adr1.appendChild(createElement(doc, 'AdresL1', faktura.podmiot1.adres.adresL1));
  if (faktura.podmiot1.adres.adresL2) {
    adr1.appendChild(createElement(doc, 'AdresL2', faktura.podmiot1.adres.adresL2));
  }
  p1.appendChild(adr1);
  if (faktura.podmiot1.email || faktura.podmiot1.telefon) {
    const dk1 = createElement(doc, 'DaneKontaktowe');
    if (faktura.podmiot1.email) {
      dk1.appendChild(createElement(doc, 'Email', faktura.podmiot1.email));
    }
    if (faktura.podmiot1.telefon) {
      dk1.appendChild(createElement(doc, 'Telefon', faktura.podmiot1.telefon));
    }
    p1.appendChild(dk1);
  }
  root.appendChild(p1);

  const p2 = createElement(doc, 'Podmiot2');
  const di2 = createElement(doc, 'DaneIdentyfikacyjne');
  const dn = faktura.podmiot2.daneIdentyfikacyjne;
  if (dn.nip) {
    di2.appendChild(createElement(doc, 'NIP', dn.nip));
  } else if (dn.kodUE && dn.nrVatUE) {
    di2.appendChild(createElement(doc, 'KodUE', dn.kodUE));
    di2.appendChild(createElement(doc, 'NrVatUE', dn.nrVatUE));
  } else if (dn.nrID) {
    if (dn.kodKraju) {
      di2.appendChild(createElement(doc, 'KodKraju', dn.kodKraju));
    }
    di2.appendChild(createElement(doc, 'NrID', dn.nrID));
  } else if (dn.brakId) {
    di2.appendChild(createElement(doc, 'BrakID', '1'));
  }
  if (dn.nazwa) {
    di2.appendChild(createElement(doc, 'Nazwa', dn.nazwa));
  }
  p2.appendChild(di2);
  if (faktura.podmiot2.adres) {
    const adr2 = createElement(doc, 'Adres');
    adr2.appendChild(createElement(doc, 'KodKraju', faktura.podmiot2.adres.kodKraju));
    adr2.appendChild(createElement(doc, 'AdresL1', faktura.podmiot2.adres.adresL1));
    if (faktura.podmiot2.adres.adresL2) {
      adr2.appendChild(createElement(doc, 'AdresL2', faktura.podmiot2.adres.adresL2));
    }
    p2.appendChild(adr2);
  }
  if (faktura.podmiot2.email || faktura.podmiot2.telefon) {
    const dk2 = createElement(doc, 'DaneKontaktowe');
    if (faktura.podmiot2.email) {
      dk2.appendChild(createElement(doc, 'Email', faktura.podmiot2.email));
    }
    if (faktura.podmiot2.telefon) {
      dk2.appendChild(createElement(doc, 'Telefon', faktura.podmiot2.telefon));
    }
    p2.appendChild(dk2);
  }
  p2.appendChild(createElement(doc, 'JST', faktura.podmiot2.jst.toString()));
  p2.appendChild(createElement(doc, 'GV', faktura.podmiot2.gv.toString()));
  root.appendChild(p2);

  const fa = createElement(doc, 'Fa');
  fa.appendChild(createElement(doc, 'KodWaluty', faktura.kodWaluty));
  fa.appendChild(createElement(doc, 'P_1', formatDate(faktura.dataWystawienia)));
  fa.appendChild(createElement(doc, 'P_2', faktura.nrFaktury));

  if (faktura.dataSprzedazy && faktura.dataSprzedazy !== faktura.dataWystawienia) {
    fa.appendChild(createElement(doc, 'P_6', formatDate(faktura.dataSprzedazy)));
  }

  const vat = faktura.podsumowanieVat;
  if (vat.p_13_1 !== undefined && vat.p_14_1 !== undefined) {
    fa.appendChild(createElement(doc, 'P_13_1', formatDecimal(vat.p_13_1)));
    fa.appendChild(createElement(doc, 'P_14_1', formatDecimal(vat.p_14_1)));
  }
  if (vat.p_13_2 !== undefined && vat.p_14_2 !== undefined) {
    fa.appendChild(createElement(doc, 'P_13_2', formatDecimal(vat.p_13_2)));
    fa.appendChild(createElement(doc, 'P_14_2', formatDecimal(vat.p_14_2)));
  }
  if (vat.p_13_3 !== undefined && vat.p_14_3 !== undefined) {
    fa.appendChild(createElement(doc, 'P_13_3', formatDecimal(vat.p_13_3)));
    fa.appendChild(createElement(doc, 'P_14_3', formatDecimal(vat.p_14_3)));
  }
  if (vat.p_13_6_1 !== undefined) {
    fa.appendChild(createElement(doc, 'P_13_6_1', formatDecimal(vat.p_13_6_1)));
  }
  if (vat.p_13_6_2 !== undefined) {
    fa.appendChild(createElement(doc, 'P_13_6_2', formatDecimal(vat.p_13_6_2)));
  }
  if (vat.p_13_6_3 !== undefined) {
    fa.appendChild(createElement(doc, 'P_13_6_3', formatDecimal(vat.p_13_6_3)));
  }
  if (vat.p_13_7 !== undefined) {
    fa.appendChild(createElement(doc, 'P_13_7', formatDecimal(vat.p_13_7)));
  }
  if (vat.p_13_8 !== undefined) {
    fa.appendChild(createElement(doc, 'P_13_8', formatDecimal(vat.p_13_8)));
  }
  if (vat.p_13_9 !== undefined) {
    fa.appendChild(createElement(doc, 'P_13_9', formatDecimal(vat.p_13_9)));
  }
  if (vat.p_13_10 !== undefined) {
    fa.appendChild(createElement(doc, 'P_13_10', formatDecimal(vat.p_13_10)));
  }
  if (vat.p_13_11 !== undefined) {
    fa.appendChild(createElement(doc, 'P_13_11', formatDecimal(vat.p_13_11)));
  }

  fa.appendChild(createElement(doc, 'P_15', formatDecimal(faktura.kwotaNaleznosci)));

  const adnotacje = createElement(doc, 'Adnotacje');
  adnotacje.appendChild(createElement(doc, 'P_16', '2'));
  adnotacje.appendChild(createElement(doc, 'P_17', '2'));
  // P_18: Set to '1' if reverse charge (P_13_8 or P_13_10) is present
  const hasReverseCharge = vat.p_13_8 !== undefined || vat.p_13_10 !== undefined;
  adnotacje.appendChild(createElement(doc, 'P_18', hasReverseCharge ? '1' : '2'));
  adnotacje.appendChild(createElement(doc, 'P_18A', '2'));
  const zwolnienie = createElement(doc, 'Zwolnienie');
  if (vat.p_13_7 !== undefined) {
    zwolnienie.appendChild(createElement(doc, 'P_19', '1'));
    zwolnienie.appendChild(createElement(doc, 'P_19A', 'art. 43'));
  } else {
    zwolnienie.appendChild(createElement(doc, 'P_19N', '1'));
  }
  adnotacje.appendChild(zwolnienie);
  const nst = createElement(doc, 'NoweSrodkiTransportu');
  nst.appendChild(createElement(doc, 'P_22N', '1'));
  adnotacje.appendChild(nst);
  adnotacje.appendChild(createElement(doc, 'P_23', '2'));
  const pmarzy = createElement(doc, 'PMarzy');
  pmarzy.appendChild(createElement(doc, 'P_PMarzyN', '1'));
  adnotacje.appendChild(pmarzy);
  fa.appendChild(adnotacje);

  fa.appendChild(createElement(doc, 'RodzajFaktury', faktura.rodzajFaktury));

  // FP and TP elements must come before DodatkowyOpis according to XSD
  // FP is optional - for invoices under art. 109 ust. 3d
  // TP is optional - for related party transactions
  // We don't add them by default for standard invoices

  if (faktura.dodatkowyOpis) {
    faktura.dodatkowyOpis.forEach(([klucz, wartosc]) => {
      const doEl = createElement(doc, 'DodatkowyOpis');
      doEl.appendChild(createElement(doc, 'Klucz', klucz));
      doEl.appendChild(createElement(doc, 'Wartosc', wartosc));
      fa.appendChild(doEl);
    });
  }

  faktura.wiersze.forEach((w: WierszFaktury) => {
    const fw = createElement(doc, 'FaWiersz');
    fw.appendChild(createElement(doc, 'NrWierszaFa', w.nrWiersza.toString()));
    if (w.nazwa) {
      fw.appendChild(createElement(doc, 'P_7', w.nazwa));
    }
    if (w.pkwiu) {
      fw.appendChild(createElement(doc, 'PKWiU', w.pkwiu));
    }
    if (w.miara) {
      fw.appendChild(createElement(doc, 'P_8A', w.miara));
    }
    if (w.ilosc !== undefined) {
      fw.appendChild(createElement(doc, 'P_8B', formatDecimal8(w.ilosc)));
    }
    if (w.cenaJednostkowaNetto !== undefined) {
      fw.appendChild(createElement(doc, 'P_9A', formatDecimal8(w.cenaJednostkowaNetto)));
    }
    if (w.wartoscNetto !== undefined) {
      fw.appendChild(createElement(doc, 'P_11', formatDecimal(w.wartoscNetto)));
    }
    if (w.stawka !== undefined) {
      fw.appendChild(createElement(doc, 'P_12', w.stawka));
    }
    if (w.gtu) {
      fw.appendChild(createElement(doc, 'GTU', w.gtu));
    }
    fa.appendChild(fw);
  });

  if (faktura.platnosc) {
    const plat = createElement(doc, 'Platnosc');
    if (faktura.platnosc.termin) {
      const tp = createElement(doc, 'TerminPlatnosci');
      tp.appendChild(createElement(doc, 'Termin', formatDate(faktura.platnosc.termin)));
      plat.appendChild(tp);
    }
    if (faktura.platnosc.forma) {
      plat.appendChild(createElement(doc, 'FormaPlatnosci', faktura.platnosc.forma));
    }
    if (faktura.platnosc.rachunek) {
      const rb = createElement(doc, 'RachunekBankowy');
      rb.appendChild(createElement(doc, 'NrRB', faktura.platnosc.rachunek.nrRb));
      if (faktura.platnosc.rachunek.swift) {
        rb.appendChild(createElement(doc, 'SWIFT', faktura.platnosc.rachunek.swift));
      }
      if (faktura.platnosc.rachunek.nazwaBanku) {
        rb.appendChild(createElement(doc, 'NazwaBanku', faktura.platnosc.rachunek.nazwaBanku));
      }
      if (faktura.platnosc.rachunek.opisRachunku) {
        rb.appendChild(createElement(doc, 'OpisRachunku', faktura.platnosc.rachunek.opisRachunku));
      }
      plat.appendChild(rb);
    }
    fa.appendChild(plat);
  }

  root.appendChild(fa);
  return doc;
}

export function toXmlString(faktura: Faktura): string {
  const doc = generateXml(faktura);
  const serializer = new XMLSerializer();
  const xmlStr = serializer.serializeToString(doc);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlStr;
}
