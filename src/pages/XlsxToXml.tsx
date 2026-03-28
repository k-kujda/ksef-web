import { useState } from 'react';
import { FileUp, Download } from 'lucide-react';
import { parseXlsxFile, xlsxRowsToFaktury, SellerInfo } from '../lib/xlsx-parser';
import { toXmlString } from '../lib/ksef/xml-generator';
import JSZip from 'jszip';

export default function XlsxToXml() {
  const [file, setFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [seller, setSeller] = useState<SellerInfo>({
    nip: '',
    nazwa: '',
    kodPocztowy: '',
    miejscowosc: '',
    adres: '',
    kraj: 'PL',
    numerRachunku: '',
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleConvert = async () => {
    if (!file) return;

    if (!seller.nip || !seller.nazwa || !seller.kodPocztowy || !seller.miejscowosc || !seller.adres) {
      alert('Wypełnij wszystkie wymagane pola sprzedawcy');
      return;
    }

    setConverting(true);
    try {
      const rows = await parseXlsxFile(file);
      
      if (rows.length === 0) {
        alert('Plik XLSX jest pusty lub ma nieprawidłowy format');
        return;
      }

      const faktury = xlsxRowsToFaktury(rows, seller);
      
      if (faktury.length === 0) {
        alert('Nie znaleziono faktur do konwersji');
        return;
      }

      if (faktury.length === 1) {
        const xml = toXmlString(faktury[0]);
        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${faktury[0].nrFaktury.replace(/\//g, '_')}.xml`;
        a.click();
        URL.revokeObjectURL(url);
        alert('Faktura wygenerowana pomyślnie!');
      } else {
        const zip = new JSZip();
        
        for (const faktura of faktury) {
          const xml = toXmlString(faktura);
          const fileName = `${faktura.nrFaktury.replace(/\//g, '_')}.xml`;
          zip.file(fileName, xml);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `faktury_${new Date().toISOString().split('T')[0]}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        
        alert(`Wygenerowano ${faktury.length} faktur!`);
      }
    } catch (error) {
      console.error('Błąd konwersji:', error);
      alert('Błąd podczas konwersji XLSX do XML: ' + (error as Error).message);
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Konwertuj XLSX do KSeF XML</h1>

      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <p className="text-sm text-blue-800">
            <strong>Format pliku XLSX:</strong> Plik musi zawierać kolumny: numer, rodzaj, data_wyst, data_dost, 
            termin_plat, forma_plat, skrot_nazwy, nazwa, kod_poczt, miejscowosc, adres, nip, kraj, 
            stawka_vat, nazwa_pozycji, jm, ilosc, cena, wartosc.
          </p>
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
            onClick={handleConvert}
            disabled={!file || converting}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            {converting ? 'Konwertowanie...' : 'Konwertuj do XML'}
          </button>
        </div>
      </div>
    </div>
  );
}
