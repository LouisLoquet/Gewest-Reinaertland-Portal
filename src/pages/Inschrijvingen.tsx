import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { QRCodeSVG } from 'qrcode.react';
import { Form, FormField } from '../types/form';
import { unescape } from '../utils/date';
import { resolveEventDates } from '../utils/calendar';
import { AddToCalendarButtons } from '../components/AddToCalendarMenu';

function generateEPCQRString(params: {
  iban: string;
  amount?: number;
  recipientName?: string;
  message?: string;
}): string {
  const cleanIban = (params.iban || '').replace(/\s+/g, '').toUpperCase();
  const formattedAmount = params.amount != null ? `EUR${Number(params.amount).toFixed(2)}` : '';
  const recipient = (params.recipientName || 'Gewest Reinaertland').slice(0, 70);
  const remittance = (params.message || '').slice(0, 140);

  return [
    'BCD',
    '002',
    '1',
    'SCT',
    '', // BIC (optioneel binnen SEPA)
    recipient,
    cleanIban,
    formattedAmount,
    '', // Doelcode
    '', // Gestructureerde referentie
    remittance, // Vrije mededeling
    '', // Hint
  ].join('\n');
}

function formatIbanDisplay(iban: string): string {
  const clean = (iban || '').replace(/\s+/g, '').toUpperCase();
  return clean.match(/.{1,4}/g)?.join(' ') || clean;
}

function getAutocompleteValue(field: FormField): string {
  const label = (field.label || '').toLowerCase();

  // Als type === 'email' of label 'e-mail' bevat: autocomplete="email"
  if (field.type === 'email' || label.includes('e-mail') || label.includes('email')) {
    return 'email';
  }

  // Als label 'voornaam en achternaam' bevat: autocomplete="name"
  if (label.includes('voornaam') && label.includes('achternaam')) {
    return 'name';
  }

  // Als label 'voornaam' bevat: autocomplete="given-name"
  if (label.includes('voornaam')) {
    return 'given-name';
  }

  // Als label 'achternaam' bevat: autocomplete="family-name"
  if (label.includes('achternaam')) {
    return 'family-name';
  }

  // Als label 'telefoon' of 'gsm' bevat: autocomplete="tel"
  if (label.includes('telefoon') || label.includes('gsm') || label.includes('tel.') || label.includes('mobiel')) {
    return 'tel';
  }

  // Als label 'naam' of 'volledige naam' is: autocomplete="name"
  if (label === 'naam' || label.includes('volledige naam')) {
    return 'name';
  }

  // Adres en datum velden
  if (field.type === 'date' || label.includes('geboortedatum')) {
    return 'bday';
  }
  if (label.includes('straat') || label.includes('adres')) {
    return 'street-address';
  }
  if (label.includes('postcode')) {
    return 'postal-code';
  }
  if (label.includes('gemeente') || label.includes('woonplaats') || label.includes('stad')) {
    return 'address-level2';
  }

  // Voor overige tekstvelden: autocomplete="on"
  return 'on';
}

interface PaymentDetailsBlockProps {
  iban: string;
  amount?: number;
  message?: string;
  formTitle: string;
  isAfterwards?: boolean;
}

function PaymentDetailsBlock({
  iban,
  amount,
  message,
  formTitle,
  isAfterwards = false,
}: PaymentDetailsBlockProps) {
  const [copiedIban, setCopiedIban] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [copiedRecipient, setCopiedRecipient] = useState(false);
  const [showMobileQr, setShowMobileQr] = useState(false);

  const handleCopyIban = (val: string) => {
    navigator.clipboard.writeText(val.replace(/\s+/g, ''));
    setCopiedIban(true);
    setTimeout(() => setCopiedIban(false), 2500);
  };

  const handleCopyAmount = (val: number | string) => {
    navigator.clipboard.writeText(Number(val).toFixed(2));
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2500);
  };

  const handleCopyMessage = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2500);
  };

  const handleCopyRecipient = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedRecipient(true);
    setTimeout(() => setCopiedRecipient(false), 2500);
  };

  const effectiveMessage = message || formTitle || 'Inschrijving';

  return (
    <div className="space-y-6">
      {/* Melding bovenaan */}
      {isAfterwards ? (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-start gap-3 text-emerald-900 dark:text-emerald-200 text-xs sm:text-sm">
          <span className="material-symbols-outlined text-xl text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
            check_circle
          </span>
          <div>
            <strong className="font-bold block text-sm mb-0.5">Al eerder ingeschreven?</strong>
            <p className="leading-relaxed text-slate-700 dark:text-slate-300">
              Super! Je hoeft het formulier niet nog eens in te vullen of te verzenden. Scan eenvoudig de QR-code met je bank-app of gebruik de overschrijvingsgegevens hieronder.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-primary text-white shrink-0 mt-0.5 shadow-sm">
            <span className="material-symbols-outlined text-2xl">payments</span>
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              Betaling uitvoeren
            </h3>
            <p className="text-sm text-slate-700 dark:text-slate-200 mt-1 leading-relaxed">
              Bedankt voor je inschrijving! Om je inschrijving te voltooien, vragen we om de betaling van{' '}
              <strong className="text-primary font-black text-base">
                €{Number(amount || 0).toFixed(2)}
              </strong>{' '}
              uit te voeren.
            </p>
          </div>
        </div>
      )}

      {/* Instructie banner voor mobiel */}
      <div className="md:hidden p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-start gap-3 text-amber-900 dark:text-amber-200 text-xs">
        <span className="material-symbols-outlined text-xl text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
          smartphone
        </span>
        <div className="space-y-1">
          <strong className="font-bold text-sm block">Betaal met je bank-app of scan de QR-code</strong>
          <p className="leading-relaxed text-slate-600 dark:text-slate-300">
            Gebruik de knoppen hieronder om elk veld met één klik te kopiëren en in je bank-app te plakken, of open de QR-code om deze op een ander scherm te scannen.
          </p>
        </div>
      </div>

      {/* Desktop instructietekst */}
      <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        <span className="material-symbols-outlined text-base text-primary">qr_code_scanner</span>
        <span>Scan de QR-code met de bank-app op je smartphone of gebruik de gegevens voor online banking.</span>
      </div>

      {/* Betaalopties: QR Code + Overschrijving */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start pt-5 border-t border-orange-200/60 dark:border-slate-700/80">
        {/* EPC QR Code (Desktop prominent) */}
        <div className="hidden md:flex flex-col items-center justify-center p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm text-center">
          <div className="p-3.5 bg-white rounded-xl shadow-inner border border-slate-100 flex items-center justify-center">
            <QRCodeSVG
              value={generateEPCQRString({
                iban,
                amount,
                recipientName: 'Gewest Reinaertland',
                message: effectiveMessage,
              })}
              size={190}
              level="M"
              includeMargin={true}
            />
          </div>
          <div className="mt-4 space-y-1">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
              <span className="material-symbols-outlined text-base text-primary">qr_code_scanner</span>
              Scan met je mobiele bank-app
            </span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs">
              Ondersteund door KBC, Belfius, ING, BNP Paribas Fortis, Argenta en alle SEPA bank-apps. Bedrag en mededeling worden automatisch ingevuld.
            </p>
          </div>
        </div>

        {/* Handmatige overschrijving gegevens */}
        <div className="space-y-3">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
            Betaalgegevens overschrijving
          </span>

          {/* Begunstigde */}
          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
            <div className="overflow-hidden">
              <span className="text-[11px] font-bold text-slate-400 block mb-0.5">Begunstigde</span>
              <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-white block truncate">
                Gewest Reinaertland
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleCopyRecipient('Gewest Reinaertland')}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
              title="Kopieer begunstigde"
            >
              <span className="material-symbols-outlined text-[15px]">
                {copiedRecipient ? 'check' : 'content_copy'}
              </span>
              <span>{copiedRecipient ? 'Gekopieerd!' : 'Kopieer'}</span>
            </button>
          </div>

          {/* IBAN */}
          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
            <div className="overflow-hidden">
              <span className="text-[11px] font-bold text-slate-400 block mb-0.5">IBAN Gewestkas</span>
              <span className="font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-white tracking-wide block truncate">
                {formatIbanDisplay(iban)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleCopyIban(iban)}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
              title="Kopieer IBAN"
            >
              <span className="material-symbols-outlined text-[15px]">
                {copiedIban ? 'check' : 'content_copy'}
              </span>
              <span>{copiedIban ? 'Gekopieerd!' : 'Kopieer'}</span>
            </button>
          </div>

          {/* Bedrag */}
          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
            <div className="overflow-hidden">
              <span className="text-[11px] font-bold text-slate-400 block mb-0.5">Te betalen bedrag</span>
              <span className="font-black text-sm text-primary block truncate">
                €{Number(amount || 0).toFixed(2)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleCopyAmount(amount || 0)}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
              title="Kopieer bedrag"
            >
              <span className="material-symbols-outlined text-[15px]">
                {copiedAmount ? 'check' : 'content_copy'}
              </span>
              <span>{copiedAmount ? 'Gekopieerd!' : 'Kopieer'}</span>
            </button>
          </div>

          {/* Mededeling */}
          {effectiveMessage && (
            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
              <div className="overflow-hidden">
                <span className="text-[11px] font-bold text-slate-400 block mb-0.5">Betalingsmededeling</span>
                <span className="font-semibold text-xs sm:text-sm text-slate-800 dark:text-white block truncate">
                  {effectiveMessage}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopyMessage(effectiveMessage)}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                title="Kopieer mededeling"
              >
                <span className="material-symbols-outlined text-[15px]">
                  {copiedMessage ? 'check' : 'content_copy'}
                </span>
                <span>{copiedMessage ? 'Gekopieerd!' : 'Kopieer'}</span>
              </button>
            </div>
          )}

          {/* Mobiele QR toggle */}
          <div className="md:hidden pt-2 border-t border-slate-100 dark:border-slate-700/60 text-center">
            <button
              type="button"
              onClick={() => setShowMobileQr(!showMobileQr)}
              className="text-xs font-semibold text-slate-600 hover:text-primary dark:text-slate-300 dark:hover:text-primary inline-flex items-center gap-1.5 py-2 px-3 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">
                {showMobileQr ? 'visibility_off' : 'qr_code_2'}
              </span>
              <span>{showMobileQr ? 'QR-code verbergen' : 'Toon QR-code (bv. voor ander scherm/toestel)'}</span>
            </button>

            {showMobileQr && (
              <div className="mt-3 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center animate-in fade-in">
                <div className="p-2.5 bg-white rounded-xl border border-slate-100">
                  <QRCodeSVG
                    value={generateEPCQRString({
                      iban,
                      amount,
                      recipientName: 'Gewest Reinaertland',
                      message: effectiveMessage,
                    })}
                    size={180}
                    level="M"
                    includeMargin={true}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Scanbaar met een tweede smartphone of tablet.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Geruststelling */}
      <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
        <span className="material-symbols-outlined text-base shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5">
          verified
        </span>
        <div className="space-y-0.5">
          <strong className="block font-bold">100% gratis & veilig voor iedereen</strong>
          <p className="leading-relaxed">
            Er zijn geen extra transactie- of servicekosten. De betaling wordt rechtstreeks gestort op de rekening van de gewestkas en handmatig gecontroleerd door de gewestleiding.
          </p>
        </div>
      </div>
    </div>
  );
}

function PaymentModal({
  open,
  onClose,
  title,
  iban,
  amount,
  message,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  iban: string;
  amount?: number;
  message?: string;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      window.addEventListener('keydown', onKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 mb-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-2xl">qr_code_2</span>
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white leading-tight">
                Betaalgegevens & QR-code
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium line-clamp-1">
                {title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-9 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Sluiten"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Inhoud */}
        <PaymentDetailsBlock
          iban={iban}
          amount={amount}
          message={message}
          formTitle={title}
          isAfterwards={true}
        />

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-colors cursor-pointer text-sm"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InschrijvingenPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [forms, setForms] = useState<Form[]>([]);
  const [loadingForms, setLoadingForms] = useState(true);

  const [currentForm, setCurrentForm] = useState<Form | null>(null);
  const [loadingCurrentForm, setLoadingCurrentForm] = useState(false);

  // Formulier antwoorden state
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [submittedSuccess, setSubmittedSuccess] = useState<{
    message: string;
    requirePayment?: boolean;
    paymentAmount?: number;
    paymentIban?: string;
    paymentMessage?: string;
  } | null>(null);
  const [paymentModalData, setPaymentModalData] = useState<{
    open: boolean;
    title: string;
    iban: string;
    amount?: number;
    message?: string;
  }>({ open: false, title: '', iban: '' });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 1. Laad overzicht van openbare formulieren
  useEffect(() => {
    const fetchForms = async () => {
      try {
        const res = await fetch('/api/public/forms');
        if (res.ok) {
          const data = await res.json();
          setForms(data);
        }
      } catch (err) {
        console.error('Fout bij ophalen formulieren:', err);
      } finally {
        setLoadingForms(false);
      }
    };
    fetchForms();
  }, []);

  // 2. Laad specifiek formulier als er een id is, of als er exact 1 open formulier is en geen id
  useEffect(() => {
    const formIdToLoad = id || (forms.length === 1 && !id ? String(forms[0].id) : null);
    if (!formIdToLoad) {
      setCurrentForm(null);
      return;
    }

    const fetchSingleForm = async () => {
      setLoadingCurrentForm(true);
      setFormError('');
      setSubmittedSuccess(null);
      try {
        const res = await fetch(`/api/public/forms/${formIdToLoad}`);
        if (res.ok) {
          const data: Form = await res.json();
          setCurrentForm(data);
          // Initialiseer lege antwoorden
          const initialAnswers: Record<string, any> = {};
          data.fields.forEach(f => {
            if (f.type === 'checkbox') initialAnswers[f.id] = [];
            else initialAnswers[f.id] = '';
          });
          setAnswers(initialAnswers);
        } else {
          setCurrentForm(null);
        }
      } catch (err) {
        console.error('Fout bij ophalen formulier:', err);
      } finally {
        setLoadingCurrentForm(false);
      }
    };

    fetchSingleForm();
  }, [id, forms]);

  const handleInputChange = (fieldId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
    if (formError) setFormError('');
  };

  const handleCheckboxChange = (fieldId: string, option: string, checked: boolean) => {
    setAnswers(prev => {
      const currentList: string[] = Array.isArray(prev[fieldId]) ? prev[fieldId] : [];
      let updated: string[];
      if (checked) {
        updated = [...currentList, option];
      } else {
        updated = currentList.filter(item => item !== option);
      }
      return { ...prev, [fieldId]: updated };
    });
    if (formError) setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentForm) return;
    setFormError('');

    // Validatie
    for (const field of currentForm.fields) {
      if (field.required) {
        const val = answers[field.id];
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
          setFormError(`Gelieve het verplichte veld "${field.label}" in te vullen.`);
          // Scroll naar fout
          const elem = document.getElementById(`field-${field.id}`);
          if (elem) elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/forms/${currentForm.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Er is een fout opgetreden bij het indienen.');
        setTimeout(() => {
          const errElem = document.getElementById('form-error-banner');
          if (errElem) {
            errElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            window.scrollTo({ top: 100, behavior: 'smooth' });
          }
        }, 50);
      } else {
        try {
          localStorage.setItem(`submitted_form_${currentForm.id}`, 'true');
        } catch {}
        setSubmittedSuccess({
          message: data.message || currentForm.confirmationMessage || 'Je inschrijving is succesvol ontvangen! Bedankt.',
          requirePayment: Boolean(data.requirePayment ?? currentForm.requirePayment),
          paymentAmount: data.paymentAmount != null ? Number(data.paymentAmount) : currentForm.paymentAmount,
          paymentIban: data.paymentIban || currentForm.paymentIban,
          paymentMessage: data.paymentMessage || currentForm.paymentMessage,
        });
        window.scrollTo({ top: 100, behavior: 'smooth' });
      }
    } catch (err) {
      console.error(err);
      setFormError('Verbindingsfout bij het verzenden van het formulier. Probeer het opnieuw.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    if (!currentForm) return;
    const initialAnswers: Record<string, any> = {};
    currentForm.fields.forEach(f => {
      if (f.type === 'checkbox') initialAnswers[f.id] = [];
      else initialAnswers[f.id] = '';
    });
    setAnswers(initialAnswers);
    setSubmittedSuccess(null);
    setFormError('');
  };

  const inputClass = "w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

  return (
    <div className="relative flex min-h-screen flex-col bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display transition-colors duration-200">
      <Helmet>
        <title>{currentForm ? `${currentForm.title} | Inschrijvingen | Gewest Reinaertland` : 'Inschrijvingen & Formulieren | Gewest Reinaertland'}</title>
        <meta name="description" content="Schrijf je in voor activiteiten, vormingen of evenementen van Gewest Reinaertland." />
      </Helmet>

      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-background-dark/80 px-4 md:px-10 lg:px-20 py-4 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-white overflow-hidden shadow-sm shadow-primary/20">
              <img src="/img/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Gewest Reinaertland</h2>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link className="text-sm font-semibold hover:text-primary transition-colors" to="/agenda">Agenda</Link>
            <Link className="text-sm font-semibold text-primary transition-colors" to="/inschrijvingen">Inschrijvingen</Link>
            <Link className="text-sm font-semibold hover:text-primary transition-colors" to="/#groepen">Groepen</Link>
            <Link className="text-sm font-semibold hover:text-primary transition-colors" to="/fotos">Foto's</Link>
            <a className="text-sm font-semibold hover:text-primary transition-colors" href="/#contact">Contact</a>
          </nav>
          <div className="flex items-center gap-4">
            <Link to="/login" className="hidden sm:flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">
              Login Gewestleiding
            </Link>
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden flex items-center justify-center p-2 text-slate-600 dark:text-slate-300 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative ml-auto w-4/5 max-w-xs h-full bg-white dark:bg-slate-900 shadow-2xl p-6 flex flex-col justify-between border-l border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center justify-between pb-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <img src="/img/logo.png" alt="Logo" className="size-8 object-contain" />
                  <span className="font-bold text-slate-800 dark:text-white">Reinaertland</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <nav className="flex flex-col gap-4 mt-6">
                <Link onClick={() => setMobileMenuOpen(false)} className="text-base font-semibold text-slate-700 dark:text-slate-300 hover:text-primary" to="/agenda">Agenda</Link>
                <Link onClick={() => setMobileMenuOpen(false)} className="text-base font-semibold text-primary" to="/inschrijvingen">Inschrijvingen</Link>
                <Link onClick={() => setMobileMenuOpen(false)} className="text-base font-semibold text-slate-700 dark:text-slate-300 hover:text-primary" to="/#groepen">Groepen</Link>
                <Link onClick={() => setMobileMenuOpen(false)} className="text-base font-semibold text-slate-700 dark:text-slate-300 hover:text-primary" to="/fotos">Foto's</Link>
                <a onClick={() => setMobileMenuOpen(false)} className="text-base font-semibold text-slate-700 dark:text-slate-300 hover:text-primary" href="/#contact">Contact</a>
              </nav>
            </div>
            <Link onClick={() => setMobileMenuOpen(false)} to="/login" className="w-full flex items-center justify-center rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/20">
              Login Gewestleiding
            </Link>
          </div>
        </div>
      )}

      <main className="flex-grow py-12 px-4 md:px-8">
        <div className="mx-auto max-w-3xl">
          {/* Geval 1: Specifiek formulier laden of weergeven */}
          {loadingCurrentForm ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
              <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl"></div>
              <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl"></div>
            </div>
          ) : currentForm ? (
            <div>
              {/* Terug naar alle formulieren knop indien er meerdere zijn */}
              {forms.length > 1 && (
                <button
                  type="button"
                  onClick={() => { setCurrentForm(null); navigate('/inschrijvingen'); }}
                  className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-primary transition-colors mb-6 group cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base group-hover:-translate-x-1 transition-transform">arrow_back</span>
                  Alle formulieren & inschrijvingen
                </button>
              )}

              {/* Geslaagd ingediend scherm */}
              {submittedSuccess ? (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 sm:p-10 shadow-sm text-center">
                  <div className="size-16 sm:size-20 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
                    <span className="material-symbols-outlined text-3xl sm:text-4xl">check_circle</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mb-3">
                    Inschrijving Ontvangen!
                  </h2>
                  <p className="text-slate-600 dark:text-slate-300 text-base sm:text-lg max-w-lg mx-auto mb-6 whitespace-pre-line">
                    {submittedSuccess.message}
                  </p>

                  {submittedSuccess.requirePayment && submittedSuccess.paymentIban ? (
                    <div className="max-w-2xl mx-auto my-6 p-6 sm:p-8 bg-orange-50/60 dark:bg-slate-900/60 rounded-2xl border border-orange-200/80 dark:border-slate-700 text-left space-y-6 animate-in fade-in">
                      <PaymentDetailsBlock
                        iban={submittedSuccess.paymentIban}
                        amount={submittedSuccess.paymentAmount}
                        message={submittedSuccess.paymentMessage || currentForm?.title}
                        formTitle={currentForm?.title || 'Inschrijving'}
                        isAfterwards={false}
                      />
                    </div>
                  ) : null}

                  {/* Zet in agenda blok */}
                  {currentForm && (
                    <div className="max-w-md mx-auto my-6 p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/80 text-center animate-in fade-in">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold mb-2">
                        <span className="material-symbols-outlined text-sm">calendar_month</span>
                        <span>Vergeet het niet in je agenda te zetten!</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3.5">
                        Voeg &quot;{currentForm.title}&quot; direct toe aan je persoonlijke iPhone- of Google-kalender:
                      </p>
                      <AddToCalendarButtons
                        event={{
                          title: currentForm.title,
                          description: currentForm.description || `Inschrijving voor ${currentForm.title} - Gewest Reinaertland (reinaertland.be)`,
                          location: 'Gewest Reinaertland',
                          ...resolveEventDates({ date: currentForm.description || currentForm.title }),
                        }}
                      />
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row justify-center gap-4 mt-8">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-6 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 font-bold text-slate-700 dark:text-white rounded-xl transition-colors cursor-pointer"
                    >
                      Nog een reactie indienen
                    </button>
                    <Link
                      to="/"
                      className="px-6 py-3 bg-primary hover:bg-primary/90 font-bold text-white rounded-xl shadow-md shadow-primary/20 transition-all text-center"
                    >
                      Terug naar de startpagina
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Header Kaart van het formulier */}
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm relative">
                    <div className="h-3 bg-gradient-to-r from-primary to-orange-400"></div>
                    <div className="p-6 md:p-8">
                      <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider mb-2">
                        <span className="material-symbols-outlined text-base">assignment</span>
                        <span>Inschrijvingsformulier</span>
                      </div>
                      <h1 className="text-3xl font-black text-slate-900 dark:text-white leading-tight mb-3">
                        {currentForm.title}
                      </h1>
                      {currentForm.description && (
                        <p className="text-slate-600 dark:text-slate-300 text-base leading-relaxed whitespace-pre-line border-t border-slate-100 dark:border-slate-700/60 pt-4 mt-4">
                          {currentForm.description}
                        </p>
                      )}

                      {currentForm.requirePayment && currentForm.paymentAmount != null && (
                        <div className="mt-4 p-4 rounded-xl bg-orange-50/70 dark:bg-slate-900/50 border border-orange-200/80 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                              <span className="material-symbols-outlined text-xl">payments</span>
                            </div>
                            <div>
                              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                                Deelnameprijs
                              </span>
                              <span className="text-lg font-black text-slate-900 dark:text-white">
                                €{Number(currentForm.paymentAmount).toFixed(2)}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {currentForm.paymentIban && (
                              <button
                                type="button"
                                onClick={() => setPaymentModalData({
                                  open: true,
                                  title: currentForm.title,
                                  iban: currentForm.paymentIban!,
                                  amount: currentForm.paymentAmount,
                                  message: currentForm.paymentMessage,
                                })}
                                className="text-xs font-bold text-primary hover:text-white bg-primary/10 hover:bg-primary px-3 py-1.5 rounded-lg transition-all inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-base">qr_code_2</span>
                                <span>Al ingeschreven? Toon QR-code</span>
                              </button>
                            )}
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200/60 dark:border-slate-700 inline-flex items-center gap-1.5 w-fit">
                              <span className="material-symbols-outlined text-sm text-primary">qr_code_2</span>
                              Betaling via QR of overschrijving
                            </span>
                          </div>
                        </div>
                      )}
                      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-red-500 font-semibold">* Verplicht veld</span>
                        {!currentForm.isOpen && (
                          <span className="text-red-600 dark:text-red-400 font-bold">Dit formulier is gesloten voor reacties</span>
                        )}
                        {!currentForm.allowMultipleSubmissions && (
                          <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">person_cancel</span>
                            Dubbele inschrijvingen niet toegestaan
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Foutmelding bovenaan indien van toepassing */}
                  {formError && (
                    <div id="form-error-banner" className="p-4 sm:p-5 bg-red-50 dark:bg-red-950/60 border-2 border-red-300 dark:border-red-700 rounded-2xl text-red-800 dark:text-red-200 text-sm font-bold flex items-start sm:items-center gap-3 shadow-sm animate-in fade-in zoom-in-95">
                      <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-2xl shrink-0">error</span>
                      <span className="leading-snug">{formError}</span>
                    </div>
                  )}

                  {/* Vragenlijst */}
                  {currentForm.fields.map((field) => {
                    const value = answers[field.id];
                    return (
                      <div
                        key={field.id}
                        id={`field-${field.id}`}
                        className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 md:p-8 shadow-sm transition-all focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/5"
                      >
                        <div className="mb-3">
                          <label className="block text-base font-bold text-slate-800 dark:text-slate-100 leading-snug">
                            {field.label}
                            {field.required && <span className="text-red-500 ml-1" title="Verplicht">*</span>}
                          </label>
                          {field.helpText && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{field.helpText}</p>
                          )}
                          {field.options && field.options.some(o => o.toUpperCase().includes('LEIDING')) && !field.helpText?.toLowerCase().includes('leiding') && (
                            <p className="text-xs text-orange-600 dark:text-orange-400 font-semibold mt-1 flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">info</span>
                              Let op leiding / begeleiding: schrijf je hier steeds in als &apos;LEIDING&apos;.
                            </p>
                          )}
                        </div>

                        {/* Input op basis van type */}
                        <div className="mt-4">
                          {/* 1. Korte tekst */}
                          {field.type === 'text' && (
                            <input
                              type={getAutocompleteValue(field) === 'tel' ? 'tel' : 'text'}
                              name={field.id}
                              id={`input-${field.id}`}
                              autoComplete={getAutocompleteValue(field)}
                              value={value || ''}
                              onChange={e => handleInputChange(field.id, e.target.value)}
                              placeholder={field.placeholder || 'Jouw antwoord...'}
                              className={inputClass}
                            />
                          )}

                          {/* 2. Paragraaf / lange tekst */}
                          {field.type === 'textarea' && (
                            <textarea
                              rows={3}
                              name={field.id}
                              id={`input-${field.id}`}
                              autoComplete={getAutocompleteValue(field)}
                              value={value || ''}
                              onChange={e => handleInputChange(field.id, e.target.value)}
                              placeholder={field.placeholder || 'Jouw antwoord...'}
                              className={inputClass + ' resize-y'}
                            />
                          )}

                          {/* 3. E-mailadres */}
                          {field.type === 'email' && (
                            <div>
                              <div className="relative">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px] pointer-events-none">mail</span>
                                <input
                                  type="email"
                                  name={field.id}
                                  id={`input-${field.id}`}
                                  autoComplete="email"
                                  value={value || ''}
                                  onChange={e => handleInputChange(field.id, e.target.value)}
                                  placeholder={field.placeholder || 'naam@voorbeeld.be'}
                                  className={inputClass + ' pl-11'}
                                />
                              </div>
                            </div>
                          )}

                          {/* 4. Nummer */}
                          {field.type === 'number' && (
                            <input
                              type="number"
                              name={field.id}
                              id={`input-${field.id}`}
                              autoComplete={getAutocompleteValue(field)}
                              value={value || ''}
                              onChange={e => handleInputChange(field.id, e.target.value)}
                              placeholder={field.placeholder || '0'}
                              className={inputClass}
                            />
                          )}

                          {/* 5. Datum */}
                          {field.type === 'date' && (
                            <input
                              type="date"
                              name={field.id}
                              id={`input-${field.id}`}
                              autoComplete={getAutocompleteValue(field)}
                              value={value || ''}
                              onChange={e => handleInputChange(field.id, e.target.value)}
                              className={inputClass}
                            />
                          )}

                          {/* 6. Dropdown (Select) */}
                          {field.type === 'select' && (
                            <select
                              name={field.id}
                              id={`input-${field.id}`}
                              autoComplete={getAutocompleteValue(field)}
                              value={value || ''}
                              onChange={e => handleInputChange(field.id, e.target.value)}
                              className={inputClass}
                            >
                              <option value="">{field.placeholder || 'Maak een keuze...'}</option>
                              {(field.options || []).map((opt, oIdx) => (
                                <option key={oIdx} value={opt}>{opt}</option>
                              ))}
                            </select>
                          )}

                          {/* 7. Radiobuttons (Enkele keuze) */}
                          {field.type === 'radio' && (
                            <div className="space-y-2.5">
                              {(field.options || []).map((opt, oIdx) => {
                                const checked = value === opt;
                                return (
                                  <label
                                    key={oIdx}
                                    className={`flex items-center gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer ${
                                      checked
                                        ? 'border-primary bg-primary/5 dark:bg-primary/10 text-slate-900 dark:text-white ring-1 ring-primary'
                                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`radio-${field.id}`}
                                      checked={checked}
                                      onChange={() => handleInputChange(field.id, opt)}
                                      className="size-4 text-primary focus:ring-primary border-slate-300 dark:border-slate-600"
                                    />
                                    <span className="text-sm font-medium">{opt}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}

                          {/* 8. Checkboxes (Meervoudige keuze) */}
                          {field.type === 'checkbox' && (
                            <div className="space-y-2.5">
                              {(field.options || []).map((opt, oIdx) => {
                                const isChecked = Array.isArray(value) && value.includes(opt);
                                return (
                                  <label
                                    key={oIdx}
                                    className={`flex items-center gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer ${
                                      isChecked
                                        ? 'border-primary bg-primary/5 dark:bg-primary/10 text-slate-900 dark:text-white ring-1 ring-primary'
                                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={e => handleCheckboxChange(field.id, opt, e.target.checked)}
                                      className="size-4 rounded text-primary focus:ring-primary border-slate-300 dark:border-slate-600"
                                    />
                                    <span className="text-sm font-medium">{opt}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Reeds ingeschreven / Achteraf betalen optie */}
                  {currentForm.requirePayment && currentForm.paymentIban && (
                    <div className="p-5 bg-orange-50/70 dark:bg-slate-800/80 rounded-2xl border border-orange-200/70 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <div className="size-9 rounded-xl bg-orange-100 dark:bg-orange-900/40 text-primary flex items-center justify-center shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-xl">qr_code_2</span>
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-800 dark:text-white">
                            Al eerder ingeschreven voor deze activiteit?
                          </h4>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                            Moet je enkel nog betalen? Schrijf je dan niet opnieuw in om dubbele reacties te voorkomen.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPaymentModalData({
                          open: true,
                          title: currentForm.title,
                          iban: currentForm.paymentIban!,
                          amount: currentForm.paymentAmount,
                          message: currentForm.paymentMessage,
                        })}
                        className="px-4 py-2.5 bg-white dark:bg-slate-700 hover:bg-orange-50 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 font-bold text-xs sm:text-sm text-slate-800 dark:text-white rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 shadow-sm cursor-pointer whitespace-nowrap"
                      >
                        <span className="material-symbols-outlined text-base text-primary">payments</span>
                        <span>Toon QR-code & Rekening</span>
                      </button>
                    </div>
                  )}

                  {/* Foutmelding onderaan bij verzendknop */}
                  {formError && (
                    <div className="p-4 bg-red-50 dark:bg-red-950/60 border border-red-300 dark:border-red-700 rounded-xl text-red-700 dark:text-red-300 text-xs sm:text-sm font-bold flex items-center gap-2">
                      <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-lg shrink-0">error</span>
                      <span>{formError}</span>
                    </div>
                  )}

                  {/* Verzendknop */}
                  <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <button
                      type="submit"
                      disabled={submitting || !currentForm.isOpen}
                      className="w-full sm:w-auto px-8 py-3.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-white rounded-xl shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-2 text-base cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                          <span>Bezig met verzenden...</span>
                        </>
                      ) : (
                        <>
                          <span>Inschrijving Verzenden</span>
                          <span className="material-symbols-outlined text-lg">send</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={resetForm}
                      className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                      Formulier wissen
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* Geval 2: Overzicht van alle openbare formulieren */
            <div>
              <div className="mb-10 text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold mb-3">
                  <span className="material-symbols-outlined text-sm">assignment</span>
                  Inschrijvingen & Formulieren
                </div>
                <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                  Actieve Inschrijvingen
                </h1>
                <p className="mt-2 text-slate-600 dark:text-slate-400 text-base max-w-xl">
                  Schrijf je in voor een activiteit, vorming of bijeenkomst van Gewest Reinaertland.
                </p>
              </div>

              {loadingForms ? (
                <div className="grid grid-cols-1 gap-4">
                  {[1, 2].map(i => (
                    <div key={i} className="h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse"></div>
                  ))}
                </div>
              ) : forms.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                  <div className="size-16 bg-slate-100 dark:bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                    <span className="material-symbols-outlined text-3xl">event_available</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Geen actieve inschrijvingen</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
                    Er zijn op dit moment geen openstaande inschrijvingsformulieren. Bekijk gerust de kalender voor aankomende evenementen!
                  </p>
                  <Link
                    to="/agenda"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white font-bold text-sm rounded-xl hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
                  >
                    <span className="material-symbols-outlined text-sm">calendar_month</span>
                    Bekijk de Agenda
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {forms.map(formItem => (
                    <div
                      key={formItem.id}
                      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 group"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                            Inschrijvingen geopend
                          </span>
                          {formItem.requirePayment && formItem.paymentAmount != null && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">payments</span>
                              €{Number(formItem.paymentAmount).toFixed(2)}
                            </span>
                          )}
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                          {formItem.title}
                        </h2>
                        {formItem.description && (
                          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1 line-clamp-2">
                            {formItem.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {formItem.requirePayment && formItem.paymentIban && (
                          <button
                            type="button"
                            onClick={() => setPaymentModalData({
                              open: true,
                              title: formItem.title,
                              iban: formItem.paymentIban!,
                              amount: formItem.paymentAmount,
                              message: formItem.paymentMessage,
                            })}
                            className="px-4 py-3 bg-orange-50 hover:bg-orange-100 dark:bg-slate-700 dark:hover:bg-slate-600 text-primary dark:text-orange-300 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-1.5 border border-orange-200/70 dark:border-slate-600 cursor-pointer shadow-xs"
                            title="Al ingeschreven? Bekijk QR-code & betaalgegevens"
                          >
                            <span className="material-symbols-outlined text-base">qr_code_2</span>
                            <span className="hidden sm:inline">Achteraf betalen</span>
                            <span className="sm:hidden">QR</span>
                          </button>
                        )}
                        <Link
                          to={`/inschrijvingen/${formItem.id}`}
                          className="px-6 py-3 bg-primary hover:bg-primary/90 text-white font-bold text-sm rounded-xl shadow-md shadow-primary/20 transition-all flex items-center justify-center gap-2 shrink-0"
                        >
                          <span>Inschrijven</span>
                          <span className="material-symbols-outlined text-base">arrow_forward</span>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12 dark:border-slate-800 dark:bg-background-dark">
        <div className="mx-auto max-w-7xl px-4 md:px-10 lg:px-20 text-center">
          <div className="flex flex-col items-center gap-6">
            <div className="flex items-center gap-3">
              <img src="/img/logo.png" alt="Logo" className="size-8 object-contain rounded-full" />
              <h2 className="text-lg font-bold">Gewest Reinaertland</h2>
            </div>
            <nav className="flex flex-wrap justify-center gap-8 text-sm font-medium text-slate-500">
              <a className="hover:text-primary transition-colors" href="https://chiro.be" target="_blank" rel="noopener noreferrer">Chirojeugd Vlaanderen</a>
              <Link className="hover:text-primary transition-colors" to="/agenda">Agenda</Link>
              <Link className="hover:text-primary transition-colors" to="/inschrijvingen">Inschrijvingen</Link>
              <Link className="hover:text-primary transition-colors" to="/fotos">Foto's</Link>
              <a className="hover:text-primary transition-colors" href="/#contact">Contact</a>
            </nav>
            <p className="text-xs text-slate-400">© {new Date().getFullYear()} Gewest Reinaertland.</p>
          </div>
        </div>
      </footer>

      {/* Modal voor achteraf betalen / QR-code bekijken */}
      <PaymentModal
        open={paymentModalData.open}
        onClose={() => setPaymentModalData(prev => ({ ...prev, open: false }))}
        title={paymentModalData.title}
        iban={paymentModalData.iban}
        amount={paymentModalData.amount}
        message={paymentModalData.message}
      />
    </div>
  );
}
