import { useState, useCallback } from 'react';
import { FileUp, ShieldCheck, AlertTriangle, CheckCircle, XCircle, Loader2, Trash2, ChevronDown } from 'lucide-react';
import { validate, disposeValidator } from '@ksefuj/validator';
import type { ValidationResult, ValidationIssue } from '@ksefuj/validator';

type InputMode = 'file' | 'paste';

const severityConfig = {
  error: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Błąd' },
  warning: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', label: 'Ostrzeżenie' },
  info: { icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', label: 'Info' },
};

export default function ValidateXml() {
  const [inputMode, setInputMode] = useState<InputMode>('file');
  const [xmlContent, setXmlContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setXmlContent(ev.target?.result as string);
      setResult(null);
    };
    reader.readAsText(file);
  }, []);

  const handleValidate = useCallback(async () => {
    if (!xmlContent.trim()) return;
    setValidating(true);
    setResult(null);
    try {
      const res = await validate(xmlContent);
      setResult(res);
    } catch (err) {
      console.error('Validation error:', err);
    } finally {
      disposeValidator();
      setValidating(false);
    }
  }, [xmlContent]);

  const handleClear = useCallback(() => {
    setXmlContent('');
    setFileName('');
    setResult(null);
  }, []);

  const errors = result?.issues.filter(i => i.code.severity === 'error') ?? [];
  const warnings = result?.issues.filter(i => i.code.severity === 'warning') ?? [];
  const infos = result?.issues.filter(i => i.code.severity === 'info') ?? [];

  return (
    <div className="max-w-5xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Walidacja XML KSeF</h1>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="flex gap-2">
          <button
            onClick={() => setInputMode('file')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${inputMode === 'file' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            <FileUp className="w-4 h-4 inline mr-1" /> Plik XML
          </button>
          <button
            onClick={() => setInputMode('paste')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${inputMode === 'paste' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Wklej XML
          </button>
        </div>

        {inputMode === 'file' ? (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".xml"
              onChange={handleFileChange}
              className="hidden"
              id="xml-validate-upload"
            />
            <label htmlFor="xml-validate-upload" className="cursor-pointer flex flex-col items-center">
              <FileUp className="w-12 h-12 text-gray-400 mb-2" />
              <span className="text-sm text-gray-600">
                {fileName || 'Kliknij aby wybrać plik XML'}
              </span>
            </label>
          </div>
        ) : (
          <textarea
            value={xmlContent}
            onChange={(e) => { setXmlContent(e.target.value); setResult(null); }}
            placeholder="Wklej treść XML faktury..."
            rows={12}
            className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}

        <div className="flex gap-2">
          <button
            onClick={handleValidate}
            disabled={!xmlContent.trim() || validating}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {validating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Walidacja...</>
            ) : (
              <><ShieldCheck className="w-4 h-4" /> Waliduj</>
            )}
          </button>
          {xmlContent && (
            <button
              onClick={handleClear}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {result && (
        <div className="mt-6 space-y-4">
          <div className={`rounded-lg shadow p-6 ${result.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center gap-3">
              {result.valid ? (
                <CheckCircle className="w-8 h-8 text-green-600" />
              ) : (
                <XCircle className="w-8 h-8 text-red-600" />
              )}
              <div>
                <h2 className={`text-xl font-semibold ${result.valid ? 'text-green-800' : 'text-red-800'}`}>
                  {result.valid ? 'Faktura poprawna' : 'Faktura zawiera błędy'}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {errors.length} błędów, {warnings.length} ostrzeżeń, {infos.length} informacji
                  {result.metadata && ` — walidacja w ${result.metadata.validationTimeMs}ms`}
                </p>
              </div>
            </div>
          </div>

          {result.issues.length > 0 && (
            <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
              {result.issues.map((issue, idx) => (
                <IssueRow key={idx} issue={issue} index={idx} />
              ))}
            </div>
          )}

          {result.assertions && result.assertions.length > 0 && (
            <details className="bg-white rounded-lg shadow">
              <summary className="px-6 py-4 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50">
                Asercje ({result.assertions.length})
              </summary>
              <div className="px-6 pb-4 space-y-2">
                {result.assertions.map((a, idx) => (
                  <div key={idx} className="text-sm text-gray-600 flex gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span>{a.description}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue, index }: { issue: ValidationIssue; index: number }) {
  const config = severityConfig[issue.code.severity];
  const Icon = config.icon;

  return (
    <details className={`group ${index % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
      <summary className="px-6 py-4 cursor-pointer list-none flex items-start gap-3 hover:bg-gray-50/80">
        <Icon className={`w-5 h-5 ${config.color} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-mono px-2 py-0.5 rounded ${config.bg} ${config.color}`}>
              {issue.code.domain}/{issue.code.code}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${config.bg} ${config.color}`}>
              {config.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-800 line-clamp-2 group-open:line-clamp-none">{issue.message}</p>
        </div>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 mt-1 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-6 pb-4 pl-14">
        <p className="text-sm text-gray-800 mb-3">{issue.message}</p>
        
        <div className="space-y-3 text-xs">
          {/* Code details */}
          <div className="grid grid-cols-2 gap-2">
            <div><span className="font-medium text-gray-600">Kategoria:</span> <code className="bg-gray-100 px-1 rounded">{issue.code.category}</code></div>
            <div><span className="font-medium text-gray-600">Domena:</span> <code className="bg-gray-100 px-1 rounded">{issue.code.domain}</code></div>
          </div>

          {/* Location details */}
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

          {/* Context values */}
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
              {issue.context.metadata && Object.keys(issue.context.metadata).length > 0 && (
                <details className="ml-2">
                  <summary className="cursor-pointer text-gray-600 hover:text-gray-800">Metadane ({Object.keys(issue.context.metadata).length})</summary>
                  <pre className="mt-1 text-xs bg-gray-50 p-2 rounded overflow-x-auto">{JSON.stringify(issue.context.metadata, null, 2)}</pre>
                </details>
              )}
            </div>
          )}

          {/* Fix suggestions */}
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
                    {fix.dependencies && fix.dependencies.length > 0 && (
                      <p>Zależności: {fix.dependencies.join(', ')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
