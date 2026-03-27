import { useState } from 'react';
import { Plus, Trash2, Download } from 'lucide-react';
import { toXmlString } from '../lib/ksef/xml-generator';
import { Faktura, WierszFaktury, StawkaPodatku, FormaPlatnosci, RodzajFaktury } from '../lib/ksef/types';
import { loadSeller, listBuyers, loadBuyer } from '../lib/contacts';

interface LineItem {
  nazwa: string;
  ilosc: number;
  cenaJednostkowaNetto: number;
  stawka: StawkaPodatku;
}

export default function GenerateInvoice() {
  const [buyerKey, setBuyerKey] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentDays, setPaymentDays] = useState(14);
  const [paymentForm, setPaymentForm] = useState<FormaPlatnosci>(FormaPlatnosci.PRZELEW);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { nazwa: '', ilosc: 1, cenaJednostkowaNetto: 0, stawka: StawkaPodatku.S23 }
  ]);

  const buyers = listBuyers();

  const addLineItem = () => {
    setLineItems([...lineItems, { nazwa: '', ilosc: 1, cenaJednostkowaNetto: 0, stawka: StawkaPodatku.S23 }]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const calculateVAT = (net: number, rate: StawkaPodatku): number => {
    const rateNum = parseFloat(rate);
    if (isNaN(rateNum)) return 0;
    return (net * rateNum) / 100;
  };

  const buildVATSummary = () => {
    const summary: any = {};
    let totalNet = 0;
    let totalVAT = 0;

    lineItems.forEach(item => {
      const net = item.ilosc * item.cenaJednostkowaNetto;
      const vat = calculateVAT(net, item.stawka);
      totalNet += net;
      totalVAT += vat;

      if (item.stawka === StawkaPodatku.S23) {
        summary.p_13_1 = (summary.p_13_1 || 0) + net;
        summary.p_14_1 = (summary.p_14_1 || 0) + vat;
      } else if (item.stawka === StawkaPodatku.S8) {
        summary.p_13_2 = (summary.p_13_2 || 0) + net;
        summary.p_14_2 = (summary.p_14_2 || 0) + vat;
      } else if (item.stawka === StawkaPodatku.S5) {
        summary.p_13_3 = (summary.p_13_3 || 0) + net;
        summary.p_14_3 = (summary.p_14_3 || 0) + vat;
      } else if (item.stawka === StawkaPodatku.ZW || item.stawka === StawkaPodatku.OO) {
        summary.p_13_6_1 = (summary.p_13_6_1 || 0) + net;
      }
    });

    return { summary, total: totalNet + totalVAT };
  };

  const handleGenerate = () => {
    try {
      const { podmiot: seller, bank } = loadSeller();
      const buyer = loadBuyer(buyerKey);

      if (!buyer) {
        alert('Wybierz nabywcę');
        return;
      }

      if (!invoiceNumber.trim()) {
        alert('Podaj numer faktury');
        return;
      }

      const wiersze: WierszFaktury[] = lineItems.map((item, index) => ({
        nrWiersza: index + 1,
        nazwa: item.nazwa,
        ilosc: item.ilosc,
        cenaJednostkowaNetto: item.cenaJednostkowaNetto,
        wartoscNetto: item.ilosc * item.cenaJednostkowaNetto,
        stawka: item.stawka,
      }));

      const { summary, total } = buildVATSummary();

      const paymentDate = new Date(issueDate);
      paymentDate.setDate(paymentDate.getDate() + paymentDays);

      const faktura: Faktura = {
        dataWytworzenia: new Date(),
        systemInfo: 'KSeF Web App',
        podmiot1: seller,
        podmiot2: buyer,
        kodWaluty: 'PLN',
        dataWystawienia: issueDate,
        nrFaktury: invoiceNumber,
        dataSprzedazy: saleDate !== issueDate ? saleDate : undefined,
        rodzajFaktury: RodzajFaktury.VAT,
        kwotaNaleznosci: total,
        podsumowanieVat: summary,
        wiersze,
        platnosc: {
          forma: paymentForm,
          termin: paymentDate.toISOString().split('T')[0],
          rachunek: bank,
        },
      };

      const xml = toXmlString(faktura);

      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoiceNumber.replace(/\//g, '_')}.xml`;
      a.click();
      URL.revokeObjectURL(url);

      alert('Faktura wygenerowana!');
    } catch (error) {
      console.error('Błąd generowania:', error);
      alert('Błąd: ' + (error as Error).message);
    }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Generuj fakturę</h1>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nabywca</label>
            <select
              value={buyerKey}
              onChange={(e) => setBuyerKey(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Wybierz nabywcę</option>
              {buyers.map(key => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Numer faktury</label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="FV/2026/03/001"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Data wystawienia</label>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Data sprzedaży</label>
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Termin płatności (dni)</label>
            <input
              type="number"
              value={paymentDays}
              onChange={(e) => setPaymentDays(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Forma płatności</label>
            <select
              value={paymentForm}
              onChange={(e) => setPaymentForm(e.target.value as FormaPlatnosci)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value={FormaPlatnosci.PRZELEW}>Przelew</option>
              <option value={FormaPlatnosci.GOTOWKA}>Gotówka</option>
              <option value={FormaPlatnosci.KARTA}>Karta</option>
            </select>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Pozycje faktury</h2>
            <button
              onClick={addLineItem}
              className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Dodaj pozycję
            </button>
          </div>

          <div className="space-y-3">
            {lineItems.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-md p-4">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-sm font-medium text-gray-700">Pozycja {index + 1}</span>
                  {lineItems.length > 1 && (
                    <button
                      onClick={() => removeLineItem(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nazwa</label>
                    <input
                      type="text"
                      value={item.nazwa}
                      onChange={(e) => updateLineItem(index, 'nazwa', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Ilość</label>
                    <input
                      type="number"
                      value={item.ilosc}
                      onChange={(e) => updateLineItem(index, 'ilosc', parseFloat(e.target.value))}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Cena netto</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.cenaJednostkowaNetto}
                      onChange={(e) => updateLineItem(index, 'cenaJednostkowaNetto', parseFloat(e.target.value))}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Stawka VAT</label>
                    <select
                      value={item.stawka}
                      onChange={(e) => updateLineItem(index, 'stawka', e.target.value as StawkaPodatku)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    >
                      <option value={StawkaPodatku.S23}>23%</option>
                      <option value={StawkaPodatku.S8}>8%</option>
                      <option value={StawkaPodatku.S5}>5%</option>
                      <option value={StawkaPodatku.ZW}>zw</option>
                      <option value={StawkaPodatku.OO}>oo</option>
                    </select>
                  </div>
                  <div className="col-span-4 text-right text-sm text-gray-600">
                    Wartość netto: {(item.ilosc * item.cenaJednostkowaNetto).toFixed(2)} PLN
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-50 rounded-md p-4">
          <div className="text-right">
            <div className="text-sm text-gray-600 mb-1">
              Suma netto: {lineItems.reduce((sum, item) => sum + (item.ilosc * item.cenaJednostkowaNetto), 0).toFixed(2)} PLN
            </div>
            <div className="text-lg font-bold text-gray-900">
              Do zapłaty: {buildVATSummary().total.toFixed(2)} PLN
            </div>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
        >
          <Download className="w-5 h-5" />
          Generuj i pobierz XML
        </button>
      </div>
    </div>
  );
}
