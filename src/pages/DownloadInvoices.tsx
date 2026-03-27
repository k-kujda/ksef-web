import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { KSeFClient, InvoiceMetadata } from '../lib/ksef/client';
import { loadSettings } from '../lib/settings';

export default function DownloadInvoices() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [subjectType, setSubjectType] = useState('Subject1');
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceMetadata[]>([]);
  const [client, setClient] = useState<KSeFClient | null>(null);

  const handleAuth = async () => {
    setLoading(true);
    try {
      const settings = loadSettings();
      
      if (!settings.nip || !settings.ksefToken) {
        alert('Uzupełnij NIP i token KSeF w ustawieniach');
        return;
      }

      const ksefClient = new KSeFClient(
        settings.environment,
        settings.nip,
        settings.ksefToken,
        30000,
        settings.corsProxyUrl
      );

      await ksefClient.authenticate();
      setClient(ksefClient);
      setAuthenticated(true);
      alert('Uwierzytelniono pomyślnie');
    } catch (error) {
      console.error('Błąd uwierzytelniania:', error);
      alert('Błąd uwierzytelniania: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!client || !authenticated) {
      alert('Najpierw uwierzytelnij się');
      return;
    }

    if (!dateFrom || !dateTo) {
      alert('Podaj zakres dat');
      return;
    }

    setLoading(true);
    try {
      const result = await client.listInvoices(dateFrom, dateTo, subjectType, 'Issue', 100, 0);
      setInvoices(result.items);
      alert(`Znaleziono ${result.items.length} faktur (z ${result.total} łącznie)`);
    } catch (error) {
      console.error('Błąd wyszukiwania:', error);
      alert('Błąd wyszukiwania: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadSingle = async (ksefNumber: string, invoiceNumber: string) => {
    if (!client) return;

    setLoading(true);
    try {
      const xml = await client.getInvoice(ksefNumber);
      
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoiceNumber.replace(/\//g, '_')}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Błąd pobierania:', error);
      alert('Błąd pobierania: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!client || !authenticated) {
      alert('Najpierw uwierzytelnij się');
      return;
    }

    if (!dateFrom || !dateTo) {
      alert('Podaj zakres dat');
      return;
    }

    setLoading(true);
    try {
      const { referenceNumber, encryptionData } = await client.exportInvoices(
        dateFrom,
        dateTo,
        subjectType,
        'PermanentStorage'
      );

      alert(`Eksport zainicjowany. Numer referencyjny: ${referenceNumber}\nOczekiwanie na przygotowanie...`);

      const { invoices: exportedInvoices } = await client.downloadExport(referenceNumber, encryptionData);

      for (const [filename, content] of Object.entries(exportedInvoices)) {
        const blob = new Blob([content], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      alert(`Pobrano ${Object.keys(exportedInvoices).length} faktur`);
    } catch (error) {
      console.error('Błąd eksportu:', error);
      alert('Błąd eksportu: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Pobierz faktury z KSeF</h1>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={handleAuth}
            disabled={loading || authenticated}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {authenticated ? '✓ Uwierzytelniono' : 'Uwierzytelnij'}
          </button>
          {authenticated && (
            <span className="text-sm text-green-600 font-medium">
              Połączono z KSeF
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Data od</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Data do</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Typ podmiotu</label>
            <select
              value={subjectType}
              onChange={(e) => setSubjectType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="Subject1">Sprzedawca</option>
              <option value="Subject2">Nabywca</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSearch}
            disabled={loading || !authenticated}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Wyszukaj
          </button>
          <button
            onClick={handleExport}
            disabled={loading || !authenticated}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Eksportuj wszystkie
          </button>
        </div>

        {invoices.length > 0 && (
          <div className="border border-gray-200 rounded-md overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Numer faktury</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Numer KSeF</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sprzedawca</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nabywca</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kwota</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Akcje</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoices.map((inv) => (
                  <tr key={inv.ksefNumber} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono text-xs">{inv.ksefNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{inv.dateIssue}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{inv.sellerName}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{inv.buyerName}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{inv.grossAmount} {inv.currency}</td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => handleDownloadSingle(inv.ksefNumber, inv.invoiceNumber)}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {invoices.length === 0 && authenticated && (
          <div className="text-center py-8 text-gray-500">
            Brak wyników. Użyj wyszukiwania aby znaleźć faktury.
          </div>
        )}
      </div>

      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <p className="text-sm text-yellow-800">
          <strong>Uwaga:</strong> Komunikacja z API KSeF może wymagać CORS proxy.
          Skonfiguruj URL proxy w ustawieniach jeśli wystąpią błędy połączenia.
        </p>
      </div>
    </div>
  );
}
