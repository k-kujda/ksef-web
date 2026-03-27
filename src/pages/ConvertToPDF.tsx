import { useState } from 'react';
import { FileUp, X } from 'lucide-react';
import JSZip from 'jszip';

export default function ConvertToPDF() {
  const [files, setFiles] = useState<File[]>([]);
  const [ksefNumber, setKsefNumber] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      setFiles(Array.from(selectedFiles));
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleConvert = async () => {
    if (files.length === 0) return;

    setConverting(true);
    setProgress({ current: 0, total: files.length });

    try {
      const { generateInvoice } = await import('../lib/pdf-generator');
      const zip = new JSZip();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress({ current: i + 1, total: files.length });

        try {
          const additionalData = {
            nrKSeF: ksefNumber || '',
            qrCode: qrCode || undefined,
          };

          const pdfBlob = await generateInvoice(file, additionalData, 'blob');
          const baseName = file.name.replace('.xml', '');
          
          zip.file(`${baseName}.pdf`, pdfBlob);
          
          const xmlContent = await file.text();
          zip.file(`${baseName}.xml`, xmlContent);
        } catch (error) {
          console.error(`Błąd konwersji ${file.name}:`, error);
          zip.file(`${file.name.replace('.xml', '')}_ERROR.txt`, 
            `Błąd konwersji: ${(error as Error).message}`);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `faktury_${new Date().toISOString().split('T')[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      
      alert(`Konwersja zakończona! Wygenerowano ${files.length} plików.`);
    } catch (error) {
      console.error('Błąd konwersji:', error);
      alert('Błąd podczas konwersji do PDF: ' + (error as Error).message);
    } finally {
      setConverting(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Konwertuj XML do PDF</h1>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Pliki XML faktur
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".xml"
              multiple
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
                {files.length > 0 
                  ? `Wybrano ${files.length} plik(ów)` 
                  : 'Kliknij aby wybrać pliki XML (możesz wybrać wiele)'}
              </span>
            </label>
          </div>
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Wybrane pliki:
            </label>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded"
                >
                  <span className="text-sm text-gray-700 truncate">{file.name}</span>
                  <button
                    onClick={() => removeFile(index)}
                    className="text-red-600 hover:text-red-700 ml-2"
                    disabled={converting}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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

        {converting && progress.total > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Konwertowanie...</span>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        <button
          onClick={handleConvert}
          disabled={files.length === 0 || converting}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {converting 
            ? `Konwertowanie ${progress.current}/${progress.total}...` 
            : files.length > 1 
              ? `Konwertuj ${files.length} plików do PDF` 
              : 'Konwertuj do PDF'}
        </button>

        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <p className="text-sm text-blue-800">
            <strong>Informacja:</strong> Konwersja odbywa się całkowicie w przeglądarce.
            Pliki XML nie są wysyłane na żaden serwer. Wynikowy plik ZIP zawiera
            zarówno PDFy jak i oryginalne pliki XML.
          </p>
        </div>
      </div>
    </div>
  );
}
