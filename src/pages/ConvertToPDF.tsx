import { useState } from 'react';
import { FileUp } from 'lucide-react';

export default function ConvertToPDF() {
  const [file, setFile] = useState<File | null>(null);
  const [ksefNumber, setKsefNumber] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [converting, setConverting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleConvert = async () => {
    if (!file) return;

    setConverting(true);
    try {
      const { generateInvoice } = await import('../lib/pdf-generator');
      
      const additionalData = {
        nrKSeF: ksefNumber || '',
        qrCode: qrCode || undefined,
      };

      const pdfBlob = await generateInvoice(file, additionalData, 'blob');
      
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.replace('.xml', '.pdf');
      a.click();
      URL.revokeObjectURL(url);
      
      alert('PDF wygenerowany pomyślnie!');
    } catch (error) {
      console.error('Błąd konwersji:', error);
      alert('Błąd podczas konwersji do PDF: ' + (error as Error).message);
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Konwertuj XML do PDF</h1>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Plik XML faktury
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".xml"
              onChange={handleFileChange}
              className="hidden"
              id="xml-upload"
            />
            <label
              htmlFor="xml-upload"
              className="cursor-pointer flex flex-col items-center"
            >
              <FileUp className="w-12 h-12 text-gray-400 mb-2" />
              <span className="text-sm text-gray-600">
                {file ? file.name : 'Kliknij aby wybrać plik XML'}
              </span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Numer KSeF (opcjonalnie)
          </label>
          <input
            type="text"
            value={ksefNumber}
            onChange={(e) => setKsefNumber(e.target.value)}
            placeholder="1234567890-20260101-XXXXXX-XX"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            URL kodu QR (opcjonalnie)
          </label>
          <input
            type="text"
            value={qrCode}
            onChange={(e) => setQrCode(e.target.value)}
            placeholder="https://ksef.mf.gov.pl/..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleConvert}
          disabled={!file || converting}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {converting ? 'Konwertowanie...' : 'Konwertuj do PDF'}
        </button>

        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <p className="text-sm text-yellow-800">
            <strong>Uwaga:</strong> Konwersja odbywa się całkowicie w przeglądarce.
            Plik XML nie jest wysyłany na żaden serwer.
          </p>
        </div>
      </div>
    </div>
  );
}
