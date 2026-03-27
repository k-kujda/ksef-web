import { useState } from 'react';
import { loadContacts, saveContacts, ContactsData, BuyerData } from '../lib/contacts';
import { Plus, Trash2, Download, Upload } from 'lucide-react';

export default function Contacts() {
  const [contacts, setContacts] = useState<ContactsData>(loadContacts());
  const [newBuyerKey, setNewBuyerKey] = useState('');
  const [showAddBuyer, setShowAddBuyer] = useState(false);

  const handleSave = () => {
    saveContacts(contacts);
    alert('Kontakty zapisane');
  };

  const handleAddBuyer = () => {
    if (!newBuyerKey.trim()) return;
    
    const newBuyer: BuyerData = {
      nazwa: '',
      kodKraju: 'PL',
    };
    
    setContacts({
      ...contacts,
      buyers: { ...contacts.buyers, [newBuyerKey]: newBuyer },
    });
    setNewBuyerKey('');
    setShowAddBuyer(false);
  };

  const handleRemoveBuyer = (key: string) => {
    const { [key]: removed, ...rest } = contacts.buyers;
    setContacts({ ...contacts, buyers: rest });
  };

  const handleExport = () => {
    const json = JSON.stringify(contacts, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kontakty.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        setContacts(imported);
        alert('Kontakty zaimportowane');
      } catch {
        alert('Błąd importu - nieprawidłowy format pliku');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Kontakty</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            <Download className="w-4 h-4" />
            Eksportuj
          </button>
          <label className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 cursor-pointer">
            <Upload className="w-4 h-4" />
            Importuj
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
          <p className="text-sm text-blue-800">
            <strong>Format pliku importu:</strong> Plik JSON z strukturą zawierającą obiekt <code className="bg-blue-100 px-1 rounded">seller</code> (sprzedawca) 
            oraz obiekt <code className="bg-blue-100 px-1 rounded">buyers</code> (nabywcy). 
            Użyj przycisku "Eksportuj" aby pobrać przykładowy plik z aktualnymi danymi.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Sprzedawca</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">NIP</label>
              <input
                type="text"
                value={contacts.seller.nip}
                onChange={(e) => setContacts({ ...contacts, seller: { ...contacts.seller, nip: e.target.value } })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa</label>
              <input
                type="text"
                value={contacts.seller.nazwa}
                onChange={(e) => setContacts({ ...contacts, seller: { ...contacts.seller, nazwa: e.target.value } })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Adres (linia 1)</label>
              <input
                type="text"
                value={contacts.seller.adresL1}
                onChange={(e) => setContacts({ ...contacts, seller: { ...contacts.seller, adresL1: e.target.value } })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kod kraju</label>
              <input
                type="text"
                value={contacts.seller.kodKraju}
                onChange={(e) => setContacts({ ...contacts, seller: { ...contacts.seller, kodKraju: e.target.value } })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nr rachunku</label>
              <input
                type="text"
                value={contacts.seller.bank?.nrRachunku || ''}
                onChange={(e) => setContacts({ 
                  ...contacts, 
                  seller: { 
                    ...contacts.seller, 
                    bank: { ...contacts.seller.bank, nrRachunku: e.target.value } 
                  } 
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Nabywcy</h2>
            <button
              onClick={() => setShowAddBuyer(true)}
              className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Dodaj
            </button>
          </div>

          {showAddBuyer && (
            <div className="mb-4 p-4 bg-gray-50 rounded-md">
              <input
                type="text"
                value={newBuyerKey}
                onChange={(e) => setNewBuyerKey(e.target.value)}
                placeholder="Klucz (np. firma_xyz)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddBuyer}
                  className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Dodaj
                </button>
                <button
                  onClick={() => setShowAddBuyer(false)}
                  className="px-3 py-1 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Anuluj
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {Object.entries(contacts.buyers).map(([key, buyer]) => (
              <div key={key} className="border border-gray-200 rounded-md p-4">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-medium text-gray-900">{key}</h3>
                  <button
                    onClick={() => handleRemoveBuyer(key)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">NIP</label>
                    <input
                      type="text"
                      value={buyer.nip || ''}
                      onChange={(e) => setContacts({
                        ...contacts,
                        buyers: { ...contacts.buyers, [key]: { ...buyer, nip: e.target.value } }
                      })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nazwa</label>
                    <input
                      type="text"
                      value={buyer.nazwa || ''}
                      onChange={(e) => setContacts({
                        ...contacts,
                        buyers: { ...contacts.buyers, [key]: { ...buyer, nazwa: e.target.value } }
                      })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Zapisz wszystkie zmiany
        </button>
      </div>
    </div>
  );
}
