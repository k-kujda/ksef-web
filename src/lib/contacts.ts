import { Podmiot1, Podmiot2, RachunekBankowy } from './ksef/types';
import { getItem, setItem } from './storage';

export interface SellerData {
  nip: string;
  nazwa: string;
  adresL1: string;
  adresL2?: string;
  kodKraju: string;
  email?: string;
  telefon?: string;
  bank?: {
    nrRachunku: string;
    swift?: string;
    nazwaBanku?: string;
  };
}

export interface BuyerData {
  nip?: string;
  nazwa?: string;
  adresL1?: string;
  adresL2?: string;
  kodKraju: string;
  email?: string;
  telefon?: string;
}

export interface ContactsData {
  seller: SellerData;
  buyers: Record<string, BuyerData>;
}

const CONTACTS_KEY = 'ksef_contacts';

const defaultContacts: ContactsData = {
  seller: {
    nip: '',
    nazwa: '',
    adresL1: '',
    kodKraju: 'PL',
  },
  buyers: {},
};

export function loadContacts(): ContactsData {
  return getItem(CONTACTS_KEY, defaultContacts);
}

export function saveContacts(contacts: ContactsData): void {
  setItem(CONTACTS_KEY, contacts);
}

export function loadSeller(): { podmiot: Podmiot1; bank?: RachunekBankowy } {
  const contacts = loadContacts();
  const seller = contacts.seller;
  
  const podmiot: Podmiot1 = {
    daneIdentyfikacyjne: {
      nip: seller.nip,
      nazwa: seller.nazwa,
    },
    adres: {
      kodKraju: seller.kodKraju,
      adresL1: seller.adresL1,
      adresL2: seller.adresL2,
    },
    email: seller.email,
    telefon: seller.telefon,
  };
  
  let bank: RachunekBankowy | undefined;
  if (seller.bank?.nrRachunku) {
    bank = {
      nrRb: seller.bank.nrRachunku,
      swift: seller.bank.swift,
      nazwaBanku: seller.bank.nazwaBanku,
    };
  }
  
  return { podmiot, bank };
}

export function saveSeller(seller: SellerData): void {
  const contacts = loadContacts();
  contacts.seller = seller;
  saveContacts(contacts);
}

export function loadBuyer(buyerKey: string): Podmiot2 | null {
  const contacts = loadContacts();
  const buyer = contacts.buyers[buyerKey];
  
  if (!buyer) return null;
  
  return {
    daneIdentyfikacyjne: {
      nip: buyer.nip,
      nazwa: buyer.nazwa,
    },
    adres: buyer.adresL1 ? {
      kodKraju: buyer.kodKraju,
      adresL1: buyer.adresL1,
      adresL2: buyer.adresL2,
    } : undefined,
    jst: 2,
    gv: 2,
    email: buyer.email,
    telefon: buyer.telefon,
  };
}

export function listBuyers(): string[] {
  const contacts = loadContacts();
  return Object.keys(contacts.buyers);
}

export function addBuyer(key: string, buyer: BuyerData): void {
  const contacts = loadContacts();
  contacts.buyers[key] = buyer;
  saveContacts(contacts);
}

export function removeBuyer(key: string): void {
  const contacts = loadContacts();
  delete contacts.buyers[key];
  saveContacts(contacts);
}

export function exportContacts(): string {
  const contacts = loadContacts();
  return JSON.stringify(contacts, null, 2);
}

export function importContacts(json: string): void {
  try {
    const contacts = JSON.parse(json) as ContactsData;
    saveContacts(contacts);
  } catch (error) {
    throw new Error('Invalid contacts JSON format');
  }
}
