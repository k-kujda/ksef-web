import { useState } from 'react';
import { FileUp, Download, ChevronRight, ChevronLeft, AlertCircle, ShieldCheck, Loader2, XCircle, AlertTriangle, CheckCircle, ChevronDown } from 'lucide-react';
import { parseXlsxFile, ParsedInvoiceRow, SellerInfo, rowsToFaktura } from '../lib/xlsx-parser';
import { toXmlString } from '../lib/ksef/xml-generator';
import { generateInvoice } from '../lib/pdf-generator';
import { validate, disposeValidator } from '@ksefuj/validator';
import type { ValidationResult, ValidationIssue } from '@ksefuj/validator';
import JSZip from 'jszip';

type Step = 'upload' | 'preview' | 'validate' | 'generate';

export default function XlsxToXml() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedInvoiceRow[]>([]);
  const [editableRows, setEditableRows] = useState<any[]>([]);
  const [generatedXml, setGeneratedXml] = useState('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
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
    dodatkowyOpis: [],
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

  const handleValidate = async () => {
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
      setGeneratedXml(xml);
      setStep('validate');
      setValidating(true);
      setValidationResult(null);

      try {
        const result = await validate(xml);
        setValidationResult(result);
      } catch (err) {
        console.error('Validation error:', err);
      } finally {
        disposeValidator();
        setValidating(false);
      }
    } catch (error) {
      console.error('Błąd generowania:', error);
      alert('Błąd podczas generowania: ' + (error as Error).message);
    }
  };

  const handleDownload = async () => {
    try {
      const faktura = rowsToFaktura(parsedRows, seller);
      const baseFileName = faktura.nrFaktury.replace(/[\/\\:*?"<>|]/g, '_');
      
      const xmlBlob = new Blob([generatedXml], { type: 'application/xml' });
      const xmlFile = new File([xmlBlob], `${baseFileName}.xml`, { type: 'application/xml' });
      
      const pdfBlob = await generateInvoice(xmlFile, { nrKSeF: faktura.nrFaktury }, 'blob');
      
      const zip = new JSZip();
      zip.file(`${baseFileName}.xml`, generatedXml);
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
      setGeneratedXml('');
      setValidationResult(null);
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
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step === 'validate' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
            3
          </div>
          <span className="ml-2 text-sm font-medium">Walidacja</span>
          <ChevronRight className="mx-4 text-gray-400" />
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step === 'generate' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
            4
          </div>
          <span className="ml-2 text-sm font-medium">Pobierz</span>
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
                <div className="space-y-2">
                  {seller.dodatkowyOpis?.map((item, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={item[0]}
                        onChange={(e) => {
                          const newList: Array<[string, string]> = [...(seller.dodatkowyOpis || [])];
                          newList[idx] = [e.target.value, item[1]] as [string, string];
                          setSeller({ ...seller, dodatkowyOpis: newList });
                        }}
                        placeholder="Klucz"
                        className="w-1/3 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        value={item[1]}
                        onChange={(e) => {
                          const newList: Array<[string, string]> = [...(seller.dodatkowyOpis || [])];
                          newList[idx] = [item[0], e.target.value] as [string, string];
                          setSeller({ ...seller, dodatkowyOpis: newList });
                        }}
                        placeholder="Wartość"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newList = seller.dodatkowyOpis?.filter((_, i) => i !== idx) || [];
                          setSeller({ ...seller, dodatkowyOpis: newList });
                        }}
                        className="px-3 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const newList: Array<[string, string]> = [...(seller.dodatkowyOpis || []), ['', ''] as [string, string]];
                      setSeller({ ...seller, dodatkowyOpis: newList });
                    }}
                    className="w-full px-3 py-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 border border-blue-300 rounded-md"
                  >
                    + Dodaj pole
                  </button>
                </div>
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
                onClick={handleValidate}
                disabled={parsedRows.some(r => r.hasErrors())}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                Waliduj i generuj
              </button>
            </div>
          </div>
        </div>
      )}
      {step === 'validate' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            {validating ? (
              <div className="flex items-center justify-center gap-3 py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <span className="text-gray-600">Walidacja XML (XSD + reguły semantyczne)...</span>
              </div>
            ) : validationResult ? (
              <div className="space-y-4">
                <div className={`rounded-md p-4 ${validationResult.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center gap-3">
                    {validationResult.valid ? (
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-600" />
                    )}
                    <div>
                      <p className={`font-semibold ${validationResult.valid ? 'text-green-800' : 'text-red-800'}`}>
                        {validationResult.valid ? 'XML poprawny' : 'XML zawiera błędy'}
                      </p>
                      <p className="text-sm text-gray-600">
                        {validationResult.issues.filter(i => i.code.severity === 'error').length} błędów,{' '}
                        {validationResult.issues.filter(i => i.code.severity === 'warning').length} ostrzeżeń
                        {validationResult.metadata && ` — ${validationResult.metadata.validationTimeMs}ms`}
                      </p>
                    </div>
                  </div>
                </div>

                {validationResult.issues.length > 0 && (
                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-md">
                    {validationResult.issues.map((issue: ValidationIssue, idx: number) => {
                      const isError = issue.code.severity === 'error';
                      return (
                        <details key={idx} className={`group ${idx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                          <summary className="px-4 py-3 cursor-pointer list-none flex items-start gap-2 hover:bg-gray-50/80">
                            {isError ? (
                              <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${isError ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-600'}`}>
                                {issue.code.domain}/{issue.code.code}
                              </span>
                              <p className="mt-1 text-sm text-gray-800 line-clamp-2 group-open:line-clamp-none">{issue.message}</p>
                            </div>
                            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 mt-1 transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="px-4 pb-3 pl-10">
                            <p className="text-sm text-gray-800 mb-3">{issue.message}</p>
                            
                            <div className="space-y-2 text-xs">
                              <div className="grid grid-cols-2 gap-2">
                                <div><span className="font-medium text-gray-600">Kategoria:</span> <code className="bg-gray-100 px-1 rounded">{issue.code.category}</code></div>
                                <div><span className="font-medium text-gray-600">Domena:</span> <code className="bg-gray-100 px-1 rounded">{issue.code.domain}</code></div>
                              </div>

                              {issue.context?.location && (
                                <div className="space-y-1 pt-2 border-t border-gray-200">
                                  <p className="font-medium text-gray-600">Lokalizacja:</p>
                                  {issue.context.location.element && (
                                    <p className="ml-2">Element: <code className="bg-gray-100 px-1 rounded">{issue.context.location.element}</code></p>
                                  )}
                                  {issue.context.location.xpath && (
                                    <p className="ml-2 font-mono text-gray-500 break-all">XPath: {issue.context.location.xpath}</p>
                                  )}
                                  {issue.context.location.lineNumber !== undefined && (
                                    <p className="ml-2">Linia: {issue.context.location.lineNumber}{issue.context.location.columnNumber !== undefined && `, kolumna: ${issue.context.location.columnNumber}`}</p>
                                  )}
                                </div>
                              )}

                              {(issue.context?.actualValue !== undefined || issue.context?.expectedValues || issue.context?.relatedElements) && (
                                <div className="space-y-1 pt-2 border-t border-gray-200">
                                  <p className="font-medium text-gray-600">Kontekst:</p>
                                  {issue.context.actualValue !== undefined && (
                                    <p className="ml-2">Aktualna wartość: <code className="bg-gray-100 px-1 rounded">{String(issue.context.actualValue)}</code></p>
                                  )}
                                  {issue.context.expectedValues && issue.context.expectedValues.length > 0 && (
                                    <p className="ml-2">Oczekiwane wartości: <code className="bg-gray-100 px-1 rounded">{issue.context.expectedValues.join(', ')}</code></p>
                                  )}
                                  {issue.context.relatedElements && issue.context.relatedElements.length > 0 && (
                                    <p className="ml-2">Powiązane elementy: <code className="bg-gray-100 px-1 rounded">{issue.context.relatedElements.join(', ')}</code></p>
                                  )}
                                </div>
                              )}

                              {issue.fixSuggestions?.length > 0 && (
                                <div className="space-y-2 pt-2 border-t border-gray-200">
                                  <p className="font-medium text-gray-600">Sugestie naprawy:</p>
                                  {issue.fixSuggestions.map((fix, i) => (
                                    <div key={i} className="ml-2 p-2 bg-blue-50 rounded border border-blue-100">
                                      <p className="text-gray-800">💡 {fix.description}</p>
                                      <div className="mt-1 space-y-0.5 text-gray-600">
                                        <p>Typ: <code className="bg-white px-1 rounded">{fix.type}</code> | Pewność: {Math.round(fix.confidence * 100)}%</p>
                                        {fix.targetXPath && <p className="font-mono break-all">Cel: {fix.targetXPath}</p>}
                                        {fix.content && <p>Zawartość: <code className="bg-white px-1 rounded">{fix.content}</code></p>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-6 flex gap-4">
              <button
                onClick={() => setStep('preview')}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" /> Wstecz
              </button>
              <button
                onClick={handleDownload}
                disabled={validating}
                className={`flex-1 px-4 py-2 rounded-md flex items-center justify-center gap-2 ${
                  validationResult && !validationResult.valid
                    ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                } disabled:bg-gray-400 disabled:cursor-not-allowed`}
              >
                <Download className="w-4 h-4" />
                {validationResult && !validationResult.valid ? 'Pobierz mimo błędów' : 'Pobierz XML + PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
