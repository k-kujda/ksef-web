import { useState } from 'react';
import { FileUp, Download, ChevronRight, ChevronLeft, AlertCircle } from 'lucide-react';
import { parseXlsxFile, ParsedInvoiceRow, SellerInfo, rowsToFaktura } from '../lib/xlsx-parser';
import { toXmlString } from '../lib/ksef/xml-generator';
import { generateInvoice } from '../lib/pdf-generator';
import JSZip from 'jszip';

type Step = 'upload' | 'preview' | 'generate';

export default function XlsxToXml() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedInvoiceRow[]>([]);
  const [editableRows, setEditableRows] = useState<any[]>([]);
  const [seller, setSeller] = useState<SellerInfo>({
    nip: '',
    nazwa: '',
    kodPocztowy: '',
    miejscowosc: '',
    adres: '',
    kraj: 'PL',
    numerRachunku: '',
    swift: '',
    nazwaBanku: '',
    opisRachunku: '',
    dodatkowyOpis: '',
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleUploadNext = async () => {
    if (!file) return;

    if (!seller.nip || !seller.nazwa || !seller.kodPocztowy || !seller.miejscowosc || !seller.adres) {
      alert('Wypełnij wszystkie wymagane pola sprzedawcy');
      return;
    }

    try {
      const rows = await parseXlsxFile(file);
      
      if (rows.length === 0) {
        alert('Plik XLSX jest pusty lub ma nieprawidłowy format');
        return;
      }

      setParsedRows(rows);
      setEditableRows(rows.map(r => r.toEditableObject()));
      setStep('preview');
    } catch (error) {
      console.error('Błąd parsowania:', error);
      alert('Błąd podczas parsowania XLSX: ' + (error as Error).message);
    }
  };

  const handleGenerate = async () => {
    try {
      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        const editable = editableRows[i];
        Object.assign(row, editable);
        
        if (row.hasErrors()) {
          alert(`Pozycja ${i + 1} ma błędy walidacji. Popraw je przed generowaniem.`);
          return;
        }
      }
      
      const faktura = rowsToFaktura(parsedRows, seller);
      const xml = toXmlString(faktura);
      const baseFileName = faktura.nrFaktury.replace(/[\/\\:*?"<>|]/g, '_');
      
      const xmlBlob = new Blob([xml], { type: 'application/xml' });
      const xmlFile = new File([xmlBlob], `${baseFileName}.xml`, { type: 'application/xml' });
      
      const pdfBlob = await generateInvoice(xmlFile, { nrKSeF: faktura.nrFaktury }, 'blob');
      
      const zip = new JSZip();
      zip.file(`${baseFileName}.xml`, xml);
      zip.file(`${baseFileName}.pdf`, pdfBlob);
      
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseFileName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      
      alert(`Faktura wygenerowana pomyślnie! (${parsedRows.length} pozycji)\nPobrano: XML + PDF`);
      setStep('upload');
      setFile(null);
      setParsedRows([]);
      setEditableRows([]);
    } catch (error) {
      console.error('Błąd generowania:', error);
      alert('Błąd podczas generowania: ' + (error as Error).message);
    }
  };

  return (
    <div className="max-w-7xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Konwertuj XLSX do KSeF XML</h1>

      <div className="mb-6 flex items-center justify-center">
        <div className="flex items-center">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
            1
          </div>
          <span className="ml-2 text-sm font-medium">Upload</span>
          <ChevronRight className="mx-4 text-gray-400" />
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
            2
          </div>
          <span className="ml-2 text-sm font-medium">Podgląd</span>
          <ChevronRight className="mx-4 text-gray-400" />
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step === 'generate' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
            3
          </div>
          <span className="ml-2 text-sm font-medium">Generuj</span>
        </div>
      </div>

      {step === 'upload' && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-800 space-y-2">
            <p>
              <strong>Format pliku XLSX:</strong> Kolumny: numer, data_wyst, data_dost, 
              termin_plat, forma_plat, nazwa, kod_poczt, miejscowosc, adres, nip, kraj, 
              stawka_vat, nazwa_pozycji, jm, ilosc, cena, wartosc.
            </p>
            <details>
              <summary className="cursor-pointer font-medium">Dopuszczalne wartości kolumn</summary>
              <div className="mt-2 space-y-1">
                <p><strong>stawka_vat</strong> — stawka podatku VAT:</p>
                <ul className="list-disc list-inside ml-2">
                  <li><code>23</code>, <code>22</code>, <code>8</code>, <code>7</code>, <code>5</code>, <code>4</code>, <code>3</code> — stawki procentowe</li>
                  <li><code>0 KR</code> — 0% sprzedaż krajowa</li>
                  <li><code>0 WDT</code> — 0% WDT</li>
                  <li><code>0 EX</code> — 0% eksport</li>
                  <li><code>zw</code> — zwolnione</li>
                  <li><code>oo</code> — odwrotne obciążenie</li>
                  <li><code>np I</code> — niepodlegające (poza terytorium kraju)</li>
                  <li><code>np II</code> — niepodlegające (art. 100 ust. 1 pkt 4)</li>
                </ul>
                <p className="mt-1"><strong>forma_plat</strong> — forma płatności:</p>
                <ul className="list-disc list-inside ml-2">
                  <li><code>gotówka</code>, <code>karta</code>, <code>bon</code>, <code>czek</code>, <code>kredyt</code>, <code>przelew</code>, <code>mobilna</code></li>
                </ul>
              </div>
            </details>
          </div>

          <div className="bg-white rounded-lg shadow p-6 space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Dane sprzedawcy</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  NIP <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={seller.nip}
                  onChange={(e) => setSeller({ ...seller, nip: e.target.value })}
                  placeholder="1234567890"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nazwa <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={seller.nazwa}
                  onChange={(e) => setSeller({ ...seller, nazwa: e.target.value })}
                  placeholder="Nazwa firmy"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kod pocztowy <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={seller.kodPocztowy}
                  onChange={(e) => setSeller({ ...seller, kodPocztowy: e.target.value })}
                  placeholder="00-000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Miejscowość <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={seller.miejscowosc}
                  onChange={(e) => setSeller({ ...seller, miejscowosc: e.target.value })}
                  placeholder="Warszawa"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Adres <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={seller.adres}
                  onChange={(e) => setSeller({ ...seller, adres: e.target.value })}
                  placeholder="ul. Przykładowa 1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kraj <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={seller.kraj}
                  onChange={(e) => setSeller({ ...seller, kraj: e.target.value })}
                  placeholder="PL"
                  maxLength={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Numer rachunku bankowego (opcjonalnie)
                </label>
                <input
                  type="text"
                  value={seller.numerRachunku}
                  onChange={(e) => setSeller({ ...seller, numerRachunku: e.target.value })}
                  placeholder="PL00 0000 0000 0000 0000 0000 0000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SWIFT (opcjonalnie)
                </label>
                <input
                  type="text"
                  value={seller.swift}
                  onChange={(e) => setSeller({ ...seller, swift: e.target.value })}
                  placeholder="BREXPLPWXXX"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nazwa banku (opcjonalnie)
                </label>
                <input
                  type="text"
                  value={seller.nazwaBanku}
                  onChange={(e) => setSeller({ ...seller, nazwaBanku: e.target.value })}
                  placeholder="mBank S.A."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Opis rachunku (opcjonalnie)
                </label>
                <input
                  type="text"
                  value={seller.opisRachunku}
                  onChange={(e) => setSeller({ ...seller, opisRachunku: e.target.value })}
                  placeholder="np. IBAN EUR, dane banku pośredniczącego..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dodatkowy opis (opcjonalnie)
                </label>
                <textarea
                  value={seller.dodatkowyOpis}
                  onChange={(e) => setSeller({ ...seller, dodatkowyOpis: e.target.value })}
                  placeholder="Dodatkowe informacje na fakturze..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Plik XLSX</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Wybierz plik XLSX z fakturami
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                  id="xlsx-upload"
                />
                <label
                  htmlFor="xlsx-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <FileUp className="w-12 h-12 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-600">
                    {file ? file.name : 'Kliknij aby wybrać plik XLSX'}
                  </span>
                </label>
              </div>
            </div>

            <button
              onClick={handleUploadNext}
              disabled={!file}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              Dalej <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Podgląd pozycji faktury ({parsedRows.length})
            </h2>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Numer</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nabywca</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">NIP</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data wyst.</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pozycja</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Stawka</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Netto</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">VAT</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Brutto</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {parsedRows.map((row, index) => (
                    <tr key={index} className={row.hasErrors() ? 'bg-red-50' : ''}>
                      <td className="px-3 py-2 text-sm">{row.numer}</td>
                      <td className="px-3 py-2 text-sm">{row.nabywcaNazwa}</td>
                      <td className="px-3 py-2 text-sm">{row.nabywcaNip}</td>
                      <td className="px-3 py-2 text-sm">{row.dataWystawienia}</td>
                      <td className="px-3 py-2 text-sm">{row.pozycjaNazwa.substring(0, 30)}...</td>
                      <td className="px-3 py-2 text-sm">{row.stawka}</td>
                      <td className="px-3 py-2 text-sm text-right">{row.pozycjaWartosc.toFixed(2)}</td>
                      <td className="px-3 py-2 text-sm text-right">{row.kwotaVat.toFixed(2)}</td>
                      <td className="px-3 py-2 text-sm text-right font-semibold">{row.kwotaBrutto.toFixed(2)}</td>
                      <td className="px-3 py-2 text-center">
                        {row.hasErrors() ? (
                          <div className="flex items-center justify-center">
                            <AlertCircle className="w-5 h-5 text-red-500" />
                          </div>
                        ) : (
                          <span className="text-green-600">✓</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                    <td colSpan={6} className="px-3 py-2 text-right text-sm">RAZEM:</td>
                    <td className="px-3 py-2 text-sm text-right">
                      {parsedRows.reduce((sum, r) => sum + r.pozycjaWartosc, 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-sm text-right">
                      {parsedRows.reduce((sum, r) => sum + r.kwotaVat, 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-sm text-right">
                      {parsedRows.reduce((sum, r) => sum + r.kwotaBrutto, 0).toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {parsedRows.some(r => r.hasErrors()) && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-sm text-red-800">
                  <strong>Uwaga:</strong> Niektóre faktury mają błędy walidacji. Sprawdź dane przed generowaniem.
                </p>
                <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                  {parsedRows.filter(r => r.hasErrors()).map((row, i) => (
                    <li key={i}>
                      {row.numer}: {row.errors.map(e => e.message).join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 flex gap-4">
              <button
                onClick={() => setStep('upload')}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" /> Wstecz
              </button>
              <button
                onClick={handleGenerate}
                disabled={parsedRows.some(r => r.hasErrors())}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Generuj XML + PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
