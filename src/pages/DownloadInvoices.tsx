import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import JSZip from 'jszip';
import { KSeFClient, InvoiceMetadata } from '../lib/ksef/client';
import { MAX_DATE_RANGE_DAYS } from '../lib/ksef/constants';
import { loadSettings } from '../lib/settings';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function validateDateRange(dateFrom: string, dateTo: string): string | null {
  if (!dateFrom || !dateTo) return null;

  const from = new Date(`${dateFrom}T00:00:00Z`);
  const to = new Date(`${dateTo}T00:00:00Z`);
  const rangeDays = Math.round((to.getTime() - from.getTime()) / MILLISECONDS_PER_DAY);

  if (rangeDays < 0) {
    return 'Data do nie może być wcześniejsza niż Data od.';
  }

  if (rangeDays > MAX_DATE_RANGE_DAYS) {
    return `Zakres dat nie może przekraczać ${MAX_DATE_RANGE_DAYS} dni.`;
  }

  return null;
}

export default function DownloadInvoices() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [subjectType, setSubjectType] = useState('Subject1');
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceMetadata[]>([]);
  const [client, setClient] = useState<KSeFClient | null>(null);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const dateRangeError = validateDateRange(dateFrom, dateTo);
  const maximumDateTo = dateFrom ? addDays(dateFrom, MAX_DATE_RANGE_DAYS) : undefined;

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

    if (dateRangeError) {
      alert(dateRangeError);
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

    if (dateRangeError) {
      alert(dateRangeError);
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

      const {
        invoices: exportedInvoices,
        metadata,
      } = await client.downloadExport(referenceNumber, encryptionData);
      const invoiceEntries = Object.entries(exportedInvoices);
      const zip = new JSZip();
      const { generateInvoice } = await import('../lib/pdf-generator');
      let generatedPdfCount = 0;

      setExportProgress({ current: 0, total: invoiceEntries.length });

      for (let index = 0; index < invoiceEntries.length; index++) {
        const [filename, content] = invoiceEntries[index];
        const baseName = filename.replace(/\.xml$/i, '');
        const invoiceMetadata = metadata.find(
          (item) => item.ksefNumber === baseName || item.ksefNumber === filename
        );
        const ksefNumber = invoiceMetadata?.ksefNumber || baseName;

        zip.file(`XML/${filename}`, content);

        try {
          const xmlFile = new File([content], filename, { type: 'application/xml' });
          const pdfBlob = await generateInvoice(
            xmlFile,
            { nrKSeF: ksefNumber },
            'blob'
          );
          zip.file(`PDF/${baseName}.pdf`, pdfBlob);
          generatedPdfCount++;
        } catch (error) {
          console.error(`Błąd wizualizacji ${filename}:`, error);
          zip.file(
            `PDF/${baseName}_ERROR.txt`,
            `Nie udało się wygenerować wizualizacji PDF: ${(error as Error).message}`
          );
        }

        setExportProgress({ current: index + 1, total: invoiceEntries.length });
      }

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `faktury_ksef_${dateFrom}_${dateTo}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      alert(
        `Pobrano jeden plik ZIP: ${invoiceEntries.length} XML i ` +
        `${generatedPdfCount} wizualizacji PDF.`
      );
    } catch (error) {
      console.error('Błąd eksportu:', error);
      alert('Błąd eksportu: ' + (error as Error).message);
    } finally {
      setLoading(false);
      setExportProgress({ current: 0, total: 0 });
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
              max={dateTo || undefined}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Data do</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              max={maximumDateTo}
              aria-invalid={Boolean(dateRangeError)}
              className={`w-full px-3 py-2 border rounded-md ${
                dateRangeError ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            <p className={`mt-1 text-sm ${dateRangeError ? 'text-red-600' : 'text-gray-500'}`}>
              {dateRangeError || `Maksymalny zakres: ${MAX_DATE_RANGE_DAYS} dni.`}
            </p>
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
            disabled={loading || !authenticated || Boolean(dateRangeError)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Wyszukaj
          </button>
          <button
            onClick={handleExport}
            disabled={loading || !authenticated || Boolean(dateRangeError)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {exportProgress.total > 0
              ? `Tworzenie ZIP ${exportProgress.current}/${exportProgress.total}`
              : 'Eksportuj ZIP (XML + PDF)'}
          </button>
        </div>

        {exportProgress.total > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Generowanie wizualizacji PDF...</span>
              <span>{exportProgress.current} / {exportProgress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(exportProgress.current / exportProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

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
