import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileArchive, FileSpreadsheet, FileText, Loader2, Upload, X } from 'lucide-react';
import { EppProcessingResult, processEppFiles } from '../lib/epp-processor';

type FileDropProps = {
  title: string;
  description: string;
  accept: string;
  multiple?: boolean;
  files: File[];
  icon: typeof FileText;
  onChange: (files: File[]) => void;
};

function FileDrop({ title, description, accept, multiple = false, files, icon: Icon, onChange }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`rounded-xl border-2 border-dashed p-5 transition-colors ${files.length ? 'border-emerald-300 bg-emerald-50/60' : 'border-gray-300 bg-white hover:border-blue-400'}`}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => onChange(Array.from(event.target.files ?? []))}
      />
      <button type="button" className="w-full text-left" onClick={() => inputRef.current?.click()}>
        <div className="flex items-start gap-4">
          <div className={`rounded-lg p-2.5 ${files.length ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-blue-600'}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-gray-900">{title}</h3>
              {files.length > 0 && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
            </div>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
            {!files.length && (
              <span className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-blue-600">
                <Upload className="h-4 w-4" /> Wybierz {multiple ? 'pliki' : 'plik'}
              </span>
            )}
          </div>
        </div>
      </button>
      {files.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-emerald-200 pt-3">
          {files.map((file) => (
            <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium text-gray-700">{file.name}</span>
              <button
                type="button"
                title="Usuń plik"
                className="rounded p-1 text-gray-400 hover:bg-white hover:text-red-600"
                onClick={() => onChange(files.filter((item) => item !== file))}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ProcessEpp() {
  const [subiektFiles, setSubiektFiles] = useState<File[]>([]);
  const [eppFiles, setEppFiles] = useState<File[]>([]);
  const [settlementFiles, setSettlementFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<EppProcessingResult | null>(null);
  const [error, setError] = useState('');
  const ready = subiektFiles.length === 1 && eppFiles.length === 1 && settlementFiles.length > 0;

  const process = async () => {
    if (!ready) return;
    setProcessing(true);
    setResult(null);
    setError('');
    try {
      setResult(await processEppFiles(subiektFiles[0], eppFiles[0], settlementFiles));
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : 'Nie udało się przetworzyć plików.');
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setSubiektFiles([]);
    setEppFiles([]);
    setSettlementFiles([]);
    setResult(null);
    setError('');
  };

  return (
    <div className="max-w-6xl">
      <div className="mb-7">
        <h1 className="text-3xl font-bold text-gray-900">Przetwarzanie EPP</h1>
        <p className="mt-2 text-gray-600">
          Uzupełnij trzy źródła. Program dopasuje kwoty z Subiekta, daty z plików rozliczeniowych i utworzy bezpieczną kopię EPP.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <FileDrop
          title="1. XLSX z Subiekta"
          description="Arkusz z kolumnami Tytułem, Wpłata/Wypłata w walucie, Waluta i Data."
          accept=".xlsx,.xls"
          files={subiektFiles}
          icon={FileSpreadsheet}
          onChange={(files) => {
            setSubiektFiles(files.slice(0, 1));
            setResult(null);
          }}
        />
        <FileDrop
          title="2. Plik EPP"
          description="Oryginalny eksport Subiekta. Plik źródłowy nie zostanie nadpisany."
          accept=".epp"
          files={eppFiles}
          icon={FileArchive}
          onChange={(files) => {
            setEppFiles(files.slice(0, 1));
            setResult(null);
          }}
        />
        <FileDrop
          title="3. Pozostałe pliki XLSX"
          description="Jeden lub kilka plików rozliczeniowych Kaufland GOTOWE/GOTOWY."
          accept=".xlsx,.xls"
          multiple
          files={settlementFiles}
          icon={FileSpreadsheet}
          onChange={(files) => {
            setSettlementFiles(files);
            setResult(null);
          }}
        />
      </div>

      <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        Zmieniane są wyłącznie pola daty i kwoty w rekordach BP. Rekordy BW oraz pozostałe sekcje EPP pozostają bez zmian, co jest sprawdzane przed udostępnieniem pliku.
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Nie udało się przetworzyć plików</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {!result ? (
        <div className="mt-7 flex justify-end">
          <button
            type="button"
            disabled={!ready || processing}
            onClick={process}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
            {processing ? 'Przetwarzanie…' : 'Przetwórz pliki'}
          </button>
        </div>
      ) : (
        <div className="mt-7 rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" />
                <h2 className="text-xl font-semibold">Plik EPP jest gotowy</h2>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Dopasowano {result.report.amountRecordsMatched} z {result.report.bpRecords} rekordów BP. Zaktualizowano datę w {result.report.dateUpdates} i kwotę w {result.report.amountUpdates} rekordach.
              </p>
            </div>
            <button type="button" onClick={reset} className="text-sm font-medium text-gray-500 hover:text-gray-800">
              Przetwórz kolejny zestaw
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Waluta', result.report.currency],
              ['Daty z rozliczeń', result.report.dateFromSettlement],
              ['Daty zapasowe z Subiekta', result.report.dateFromSubiektFallback],
              ['Niewykorzystane wiersze', result.report.amountRowsUnused],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
                <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
              </div>
            ))}
          </div>

          {result.report.amountRowsUnused > 0 && (
            <details className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <summary className="cursor-pointer font-medium">Niewykorzystane pozycje z Subiekta ({result.report.amountRowsUnused})</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.report.unusedAmountTitles.map((title, index) => <li key={`${title}-${index}`}>{title}</li>)}
              </ul>
            </details>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => downloadBlob(
                new Blob(
                  [result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength) as ArrayBuffer],
                  { type: 'application/octet-stream' },
                ),
                result.outputName,
              )}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-700"
            >
              <Download className="h-5 w-5" /> Pobierz {result.outputName}
            </button>
            <button
              type="button"
              onClick={() => downloadBlob(
                new Blob([JSON.stringify(result.report, null, 2)], { type: 'application/json' }),
                result.outputName.replace(/\.epp$/i, '_report.json'),
              )}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-5 w-5" /> Pobierz raport
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
