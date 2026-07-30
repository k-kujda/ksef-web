import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { toXmlString } from '../lib/ksef/xml-generator';
import {
  Faktura,
  FormaPlatnosci,
  RodzajFaktury,
  StawkaPodatku,
  WierszFaktury,
} from '../lib/ksef/types';
import { listBuyers, loadBuyer, loadSeller } from '../lib/contacts';
import { loadSettings } from '../lib/settings';
import { KSeFClient } from '../lib/ksef/client';
import { KSeFEnvironment } from '../lib/ksef/constants';

interface LineItem {
  nazwa: string;
  ilosc: number;
  cenaJednostkowaNetto: number;
  stawka: StawkaPodatku;
}

interface PreparedInvoice {
  invoice: Faktura;
  xml: string;
  totalNet: number;
  totalVat: number;
}

interface SubmissionResult {
  invoiceReferenceNumber: string;
  sessionReferenceNumber: string;
  sessionClosed: boolean;
}

const money = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
});

const environmentLabel: Record<KSeFEnvironment, string> = {
  [KSeFEnvironment.TEST]: 'testowe',
  [KSeFEnvironment.DEMO]: 'demo',
  [KSeFEnvironment.PROD]: 'produkcyjne',
};

export default function GenerateInvoice() {
  const [buyerKey, setBuyerKey] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentDays, setPaymentDays] = useState(14);
  const [paymentForm, setPaymentForm] = useState<FormaPlatnosci>(FormaPlatnosci.PRZELEW);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { nazwa: '', ilosc: 1, cenaJednostkowaNetto: 0, stawka: StawkaPodatku.S23 },
  ]);
  const [prepared, setPrepared] = useState<PreparedInvoice | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [submission, setSubmission] = useState<SubmissionResult | null>(null);

  const buyers = listBuyers();

  const totals = useMemo(() => {
    let net = 0;
    let vat = 0;
    lineItems.forEach((item) => {
      const lineNet = item.ilosc * item.cenaJednostkowaNetto;
      net += lineNet;
      vat += calculateVAT(lineNet, item.stawka);
    });
    return { net, vat, gross: net + vat };
  }, [lineItems]);

  const markDraftChanged = () => {
    setPrepared(null);
    setSubmission(null);
    setSendError('');
  };

  const addLineItem = () => {
    setLineItems((items) => [
      ...items,
      { nazwa: '', ilosc: 1, cenaJednostkowaNetto: 0, stawka: StawkaPodatku.S23 },
    ]);
    markDraftChanged();
  };

  const removeLineItem = (index: number) => {
    setLineItems((items) => items.filter((_, itemIndex) => itemIndex !== index));
    markDraftChanged();
  };

  const updateLineItem = <K extends keyof LineItem>(
    index: number,
    field: K,
    value: LineItem[K]
  ) => {
    setLineItems((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
    markDraftChanged();
  };

  const prepareInvoice = () => {
    try {
      const { podmiot: seller, bank } = loadSeller();
      const buyer = loadBuyer(buyerKey);

      if (!buyer) throw new Error('Wybierz nabywcę.');
      if (!invoiceNumber.trim()) throw new Error('Podaj numer faktury.');
      if (!seller.daneIdentyfikacyjne.nip || !seller.daneIdentyfikacyjne.nazwa) {
        throw new Error('Uzupełnij dane sprzedawcy w Kontaktach.');
      }
      if (
        lineItems.some(
          (item) =>
            !item.nazwa.trim() ||
            !Number.isFinite(item.ilosc) ||
            item.ilosc <= 0 ||
            !Number.isFinite(item.cenaJednostkowaNetto) ||
            item.cenaJednostkowaNetto < 0
        )
      ) {
        throw new Error('Uzupełnij poprawnie wszystkie pozycje faktury.');
      }

      const wiersze: WierszFaktury[] = lineItems.map((item, index) => ({
        nrWiersza: index + 1,
        nazwa: item.nazwa.trim(),
        ilosc: item.ilosc,
        cenaJednostkowaNetto: item.cenaJednostkowaNetto,
        wartoscNetto: item.ilosc * item.cenaJednostkowaNetto,
        stawka: item.stawka,
      }));
      const vatSummary = buildVATSummary(lineItems);
      const paymentDate = new Date(`${issueDate}T12:00:00`);
      paymentDate.setDate(paymentDate.getDate() + paymentDays);

      const invoice: Faktura = {
        dataWytworzenia: new Date(),
        systemInfo: 'KSeF Web App',
        podmiot1: seller,
        podmiot2: buyer,
        kodWaluty: 'PLN',
        dataWystawienia: issueDate,
        nrFaktury: invoiceNumber.trim(),
        dataSprzedazy: saleDate !== issueDate ? saleDate : undefined,
        rodzajFaktury: RodzajFaktury.VAT,
        kwotaNaleznosci: vatSummary.totalNet + vatSummary.totalVat,
        podsumowanieVat: vatSummary.summary,
        wiersze,
        platnosc: {
          forma: paymentForm,
          termin: paymentDate.toISOString().split('T')[0],
          rachunek: bank,
        },
      };

      setPrepared({
        invoice,
        xml: toXmlString(invoice),
        totalNet: vatSummary.totalNet,
        totalVat: vatSummary.totalVat,
      });
      setSubmission(null);
      setSendError('');
      setTimeout(() => {
        document.getElementById('invoice-preview')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    } catch (error) {
      window.alert((error as Error).message);
    }
  };

  const downloadXml = () => {
    if (!prepared) return;
    const blob = new Blob([prepared.xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${prepared.invoice.nrFaktury.replace(/\//g, '_')}.xml`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const requestSubmission = () => {
    const settings = loadSettings();
    if (!settings.nip.trim() || !settings.ksefToken.trim()) {
      setSendError('Uzupełnij NIP i token KSeF w Ustawieniach.');
      return;
    }
    setSendError('');
    setShowConfirmation(true);
  };

  const submitToKsef = async () => {
    if (!prepared || isSending) return;
    const settings = loadSettings();
    setShowConfirmation(false);
    setIsSending(true);
    setSendError('');

    try {
      const client = new KSeFClient(
        settings.environment,
        settings.nip.trim(),
        settings.ksefToken,
        30000,
        settings.corsProxyUrl
      );
      await client.authenticate();
      const result = await client.submitInvoice(prepared.xml);
      setSubmission(result);
    } catch (error) {
      setSendError(humanizeKsefError(error));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Generuj fakturę</h1>
      <p className="mb-6 text-gray-600">
        Przygotuj dokument, sprawdź jego podgląd, a następnie świadomie wyślij go do KSeF.
      </p>

      <div className="space-y-6 rounded-lg bg-white p-6 shadow">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nabywca">
            <select
              value={buyerKey}
              onChange={(event) => {
                setBuyerKey(event.target.value);
                markDraftChanged();
              }}
              className="field"
            >
              <option value="">Wybierz nabywcę</option>
              {buyers.map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </Field>
          <Field label="Numer faktury">
            <input
              type="text"
              value={invoiceNumber}
              onChange={(event) => {
                setInvoiceNumber(event.target.value);
                markDraftChanged();
              }}
              placeholder="FV/2026/07/001"
              className="field"
            />
          </Field>
          <Field label="Data wystawienia">
            <input
              type="date"
              value={issueDate}
              onChange={(event) => {
                setIssueDate(event.target.value);
                markDraftChanged();
              }}
              className="field"
            />
          </Field>
          <Field label="Data sprzedaży">
            <input
              type="date"
              value={saleDate}
              onChange={(event) => {
                setSaleDate(event.target.value);
                markDraftChanged();
              }}
              className="field"
            />
          </Field>
          <Field label="Termin płatności (dni)">
            <input
              type="number"
              min="0"
              value={paymentDays}
              onChange={(event) => {
                setPaymentDays(Number(event.target.value));
                markDraftChanged();
              }}
              className="field"
            />
          </Field>
          <Field label="Forma płatności">
            <select
              value={paymentForm}
              onChange={(event) => {
                setPaymentForm(event.target.value as FormaPlatnosci);
                markDraftChanged();
              }}
              className="field"
            >
              <option value={FormaPlatnosci.PRZELEW}>Przelew</option>
              <option value={FormaPlatnosci.GOTOWKA}>Gotówka</option>
              <option value={FormaPlatnosci.KARTA}>Karta</option>
            </select>
          </Field>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Pozycje faktury</h2>
            <button
              type="button"
              onClick={addLineItem}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Dodaj pozycję
            </button>
          </div>
          <div className="space-y-3">
            {lineItems.map((item, index) => (
              <div key={index} className="rounded-md border border-gray-200 p-4">
                <div className="mb-3 flex items-start justify-between">
                  <span className="text-sm font-medium text-gray-700">Pozycja {index + 1}</span>
                  {lineItems.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Usuń pozycję ${index + 1}`}
                      onClick={() => removeLineItem(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <Field label="Nazwa" small>
                      <input
                        type="text"
                        value={item.nazwa}
                        onChange={(event) => updateLineItem(index, 'nazwa', event.target.value)}
                        className="field field-small"
                      />
                    </Field>
                  </div>
                  <Field label="Ilość" small>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.ilosc}
                      onChange={(event) => updateLineItem(index, 'ilosc', Number(event.target.value))}
                      className="field field-small"
                    />
                  </Field>
                  <Field label="Cena netto" small>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.cenaJednostkowaNetto}
                      onChange={(event) =>
                        updateLineItem(index, 'cenaJednostkowaNetto', Number(event.target.value))
                      }
                      className="field field-small"
                    />
                  </Field>
                  <Field label="Stawka VAT" small>
                    <select
                      value={item.stawka}
                      onChange={(event) =>
                        updateLineItem(index, 'stawka', event.target.value as StawkaPodatku)
                      }
                      className="field field-small"
                    >
                      <option value={StawkaPodatku.S23}>23%</option>
                      <option value={StawkaPodatku.S8}>8%</option>
                      <option value={StawkaPodatku.S5}>5%</option>
                      <option value={StawkaPodatku.ZW}>zw</option>
                      <option value={StawkaPodatku.OO}>oo</option>
                    </select>
                  </Field>
                  <div className="flex items-end text-sm text-gray-600 md:col-span-3 md:justify-end">
                    Wartość netto: {money.format(item.ilosc * item.cenaJednostkowaNetto)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md bg-gray-50 p-4 text-right">
          <div className="mb-1 text-sm text-gray-600">Suma netto: {money.format(totals.net)}</div>
          <div className="text-xl font-bold text-gray-900">Do zapłaty: {money.format(totals.gross)}</div>
        </div>

        <button
          type="button"
          onClick={prepareInvoice}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700"
        >
          <Eye className="h-5 w-5" />
          Generuj podgląd faktury
        </button>
      </div>

      {prepared && (
        <InvoicePreview
          prepared={prepared}
          isSending={isSending}
          error={sendError}
          submission={submission}
          onDownload={downloadXml}
          onSubmit={requestSubmission}
        />
      )}

      {showConfirmation && prepared && (
        <ConfirmationDialog
          invoice={prepared.invoice}
          environment={loadSettings().environment}
          onCancel={() => setShowConfirmation(false)}
          onConfirm={submitToKsef}
        />
      )}
    </div>
  );
}

function InvoicePreview({
  prepared,
  isSending,
  error,
  submission,
  onDownload,
  onSubmit,
}: {
  prepared: PreparedInvoice;
  isSending: boolean;
  error: string;
  submission: SubmissionResult | null;
  onDownload: () => void;
  onSubmit: () => void;
}) {
  const { invoice, totalNet, totalVat } = prepared;
  const buyer = invoice.podmiot2;

  return (
    <section
      id="invoice-preview"
      className="mt-6 scroll-mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-6 py-4 text-white">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
            Podgląd dokumentu
          </div>
          <h2 className="mt-1 text-xl font-semibold">Faktura VAT {invoice.nrFaktury}</h2>
        </div>
        <ShieldCheck className="h-8 w-8 text-blue-300" />
      </div>

      <div className="p-6">
        <div className="grid gap-6 border-b border-slate-200 pb-6 md:grid-cols-2">
          <Party label="Sprzedawca" party={invoice.podmiot1} />
          <Party label="Nabywca" party={buyer} />
        </div>

        <div className="grid gap-3 border-b border-slate-200 py-5 text-sm sm:grid-cols-3">
          <Summary label="Data wystawienia" value={invoice.dataWystawienia} />
          <Summary label="Data sprzedaży" value={invoice.dataSprzedazy || invoice.dataWystawienia} />
          <Summary label="Termin płatności" value={invoice.platnosc?.termin || '—'} />
        </div>

        <div className="overflow-x-auto py-6">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Lp.</th>
                <th className="px-3 py-3">Nazwa</th>
                <th className="px-3 py-3 text-right">Ilość</th>
                <th className="px-3 py-3 text-right">Cena netto</th>
                <th className="px-3 py-3 text-right">VAT</th>
                <th className="px-3 py-3 text-right">Netto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.wiersze.map((row) => (
                <tr key={row.nrWiersza}>
                  <td className="px-3 py-3 text-slate-500">{row.nrWiersza}</td>
                  <td className="px-3 py-3 font-medium text-slate-900">{row.nazwa}</td>
                  <td className="px-3 py-3 text-right">{row.ilosc}</td>
                  <td className="px-3 py-3 text-right">{money.format(row.cenaJednostkowaNetto || 0)}</td>
                  <td className="px-3 py-3 text-right">{row.stawka}%</td>
                  <td className="px-3 py-3 text-right">{money.format(row.wartoscNetto || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto grid max-w-sm gap-2 border-t border-slate-200 pt-4 text-sm">
          <Amount label="Razem netto" value={totalNet} />
          <Amount label="VAT" value={totalVat} />
          <Amount label="Do zapłaty" value={invoice.kwotaNaleznosci} strong />
        </div>

        {error && (
          <div className="mt-5 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {submission && (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-5 w-5" />
              Faktura została przyjęta do przetwarzania przez KSeF
            </div>
            <dl className="mt-3 grid gap-2 text-sm">
              <div>
                <dt className="text-emerald-700">Numer referencyjny faktury</dt>
                <dd className="break-all font-mono">{submission.invoiceReferenceNumber}</dd>
              </div>
              <div>
                <dt className="text-emerald-700">Numer sesji</dt>
                <dd className="break-all font-mono">{submission.sessionReferenceNumber}</dd>
              </div>
            </dl>
            {!submission.sessionClosed && (
              <div className="mt-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span>
                  Faktura została przyjęta, ale nie udało się zamknąć sesji. Nie wysyłaj jej ponownie;
                  użyj numeru referencyjnego do dalszej weryfikacji.
                </span>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDownload}
            className="flex items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Pobierz XML
          </button>
          {!submission && (
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSending}
              className="flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-5 py-2 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isSending ? 'Wysyłanie do KSeF…' : 'Przejdź do potwierdzenia'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function ConfirmationDialog({
  invoice,
  environment,
  onCancel,
  onConfirm,
}: {
  invoice: Faktura;
  environment: KSeFEnvironment;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isProduction = environment === KSeFEnvironment.PROD;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        className="w-full max-w-lg rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <div className="text-sm font-medium text-slate-500">Ostatni krok</div>
            <h2 id="confirmation-title" className="mt-1 text-xl font-bold text-slate-900">
              Potwierdź wysyłkę do KSeF
            </h2>
          </div>
          <button type="button" onClick={onCancel} aria-label="Zamknij" className="text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div className={`rounded-lg border p-4 ${isProduction ? 'border-amber-300 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
            <div className="flex gap-3">
              {isProduction ? (
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
              ) : (
                <ShieldCheck className="h-5 w-5 shrink-0 text-blue-700" />
              )}
              <div>
                <div className="font-semibold">
                  Środowisko {environmentLabel[environment]}
                </div>
                <p className="mt-1 text-sm">
                  {isProduction
                    ? 'To jest rzeczywista wysyłka. Po przyjęciu dokumentu nie można jej cofnąć.'
                    : 'Dokument zostanie wysłany do nieprodukcyjnego środowiska KSeF.'}
                </p>
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">Faktura</dt>
            <dd className="text-right font-semibold">{invoice.nrFaktury}</dd>
            <dt className="text-slate-500">Nabywca</dt>
            <dd className="text-right font-semibold">{invoice.podmiot2.daneIdentyfikacyjne.nazwa}</dd>
            <dt className="text-slate-500">Kwota</dt>
            <dd className="text-right font-semibold">{money.format(invoice.kwotaNaleznosci)}</dd>
          </dl>
        </div>
        <div className="flex flex-col-reverse gap-3 rounded-b-xl bg-slate-50 p-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-white"
          >
            Wróć do podglądu
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex items-center justify-center gap-2 rounded-md px-5 py-2 font-semibold text-white ${
              isProduction ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            <Send className="h-4 w-4" />
            Tak, wyślij fakturę
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  small = false,
  children,
}: {
  label: string;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={`mb-1 block font-medium text-gray-700 ${small ? 'text-xs' : 'text-sm'}`}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Party({
  label,
  party,
}: {
  label: string;
  party: Faktura['podmiot1'] | Faktura['podmiot2'];
}) {
  const data = party.daneIdentyfikacyjne;
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-semibold text-slate-900">{data.nazwa || '—'}</div>
      {'nip' in data && data.nip && <div className="mt-1 text-sm text-slate-600">NIP: {data.nip}</div>}
      {party.adres && (
        <div className="mt-1 text-sm text-slate-600">
          {party.adres.adresL1}
          {party.adres.adresL2 && <><br />{party.adres.adresL2}</>}
        </div>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-medium text-slate-900">{value}</div>
    </div>
  );
}

function Amount({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${strong ? 'mt-1 border-t border-slate-200 pt-3 text-lg font-bold' : ''}`}>
      <span>{label}</span>
      <span>{money.format(value)}</span>
    </div>
  );
}

function calculateVAT(net: number, rate: StawkaPodatku): number {
  const numericRate = Number.parseFloat(rate);
  return Number.isNaN(numericRate) ? 0 : (net * numericRate) / 100;
}

function buildVATSummary(items: LineItem[]) {
  const summary: Faktura['podsumowanieVat'] = {};
  let totalNet = 0;
  let totalVat = 0;

  items.forEach((item) => {
    const net = item.ilosc * item.cenaJednostkowaNetto;
    const vat = calculateVAT(net, item.stawka);
    totalNet += net;
    totalVat += vat;

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

  return { summary, totalNet, totalVat };
}

function humanizeKsefError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'KSeF nie odpowiedział w wymaganym czasie. Faktura nie została oznaczona jako wysłana.';
  }
  const message = error instanceof Error ? error.message : String(error);
  return `Nie udało się wysłać faktury do KSeF. ${message}`;
}
