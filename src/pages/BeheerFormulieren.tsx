import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Form, FormField, FormFieldType, FormSubmission } from '../types/form';
import { computeWerkjaar } from '../utils/date';
import {
  generateParticipantListPdf,
  printParticipantHtml,
  isLeidingSubmission,
  getFieldAnswer,
} from '../utils/participantPdf';
import { exportElementAsImage } from '../utils/printReport';
import {
  FormTemplateKey,
  buildTemplateFormState,
  REINAERTLAND_GROUPS_WITH_LEIDING,
} from '../utils/formTemplates';
import TemplateSelectModal from '../components/TemplateSelectModal';
import EditSubmissionModal from '../components/EditSubmissionModal';
import PaymentReminderModal from '../components/PaymentReminderModal';
import FormulierenRapportage from '../components/FormulierenRapportage';

interface BeheerFormulierenProps {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

function ParticipantListModal({
  open,
  onClose,
  form,
  submissions,
}: {
  open: boolean;
  onClose: () => void;
  form: Form;
  submissions: FormSubmission[];
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const leden = submissions.filter(s => !isLeidingSubmission(s, form.fields));
  const leiding = submissions.filter(s => isLeidingSubmission(s, form.fields));

  const paidCount = submissions.filter(s => s.isPaid).length;
  const paymentAmount = Number(form.paymentAmount || 0);
  const totalPaidAmount = paidCount * paymentAmount;

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [exportingImage, setExportingImage] = useState(false);

  const handleDownloadPdf = () => {
    try {
      setDownloadingPdf(true);
      generateParticipantListPdf(form, submissions);
    } catch (err) {
      console.error('Fout bij exporteren PDF:', err);
      alert('Er is een fout opgetreden bij het downloaden van de PDF. Je kan ook op de knop Afdrukken klikken en opslaan als PDF.');
    } finally {
      setTimeout(() => setDownloadingPdf(false), 500);
    }
  };

  const handleExportImage = async () => {
    const el = document.getElementById('participant-list-print');
    if (!el) return;
    const safeTitle = (form.title || 'Deelnemerslijst').replace(/[^a-zA-Z0-9_-]/g, '_');
    await exportElementAsImage(el, `Deelnemerslijst_${safeTitle}`, setExportingImage);
  };

  const handlePrint = () => {
    const printContent = document.getElementById('participant-list-print');
    if (!printContent) {
      window.print();
      return;
    }
    printParticipantHtml(printContent, form.title);
  };

  const renderRow = (sub: FormSubmission, index: number, isLeaderRow: boolean) => {
    const name = getFieldAnswer(sub, form.fields, ['naam', 'voornaam', 'achternaam', 'wie', 'kapitein', 'deelnemer']) || sub.respondentEmail || `Deelnemer #${index}`;
    const group = getFieldAnswer(sub, form.fields, ['groep', 'chirogroep', 'afdeling', 'chiro']) || (isLeaderRow ? 'LEIDING' : '-');
    const allergies = getFieldAnswer(sub, form.fields, ['allerg', 'dieet', 'vegetar', 'vegan', 'eten', 'voeding', 'medisch', 'ziekte', 'opmerking']);
    const phone = getFieldAnswer(sub, form.fields, ['tel', 'gsm', 'mobiel', 'telefoon', 'contact', 'noodnummer']) || sub.respondentEmail || '-';

    return (
      <tr key={sub.id} className={index % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}>
        <td className="py-2.5 px-2 font-mono text-center text-slate-500 font-bold">{index}</td>
        <td className="py-2.5 px-3 font-bold text-slate-900 text-sm">
          {name}
          {isLeaderRow && (
            <span className="ml-2 text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-slate-900 text-white">
              Leiding
            </span>
          )}
        </td>
        <td className="py-2.5 px-3 font-medium text-slate-700">{group}</td>
        <td className="py-2.5 px-3 text-slate-600">{phone}</td>
        <td className="py-2.5 px-3">
          {allergies ? (
            <span className="font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded text-[11px] inline-block border border-amber-300">
              ⚠️ {allergies}
            </span>
          ) : (
            <span className="text-slate-400">-</span>
          )}
        </td>
        <td className="py-2.5 px-2 text-center">
          {sub.isPaid ? (
            <span className="font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 text-[11px]">
              ✓ Ja
            </span>
          ) : (
            <span className="font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 text-[11px]">
              Nee
            </span>
          )}
        </td>
        <td className="py-2.5 px-2 text-center">
          <div className="size-5 border-2 border-slate-400 rounded mx-auto" />
        </td>
      </tr>
    );
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden my-6 border border-slate-200 dark:border-slate-700 max-h-[92vh] flex flex-col">
        {/* Header acties */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">description</span>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Deelnemerslijst Downloaden & Afdrukken
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {form.title} • {submissions.length} deelnemers ({leden.length} leden, {leiding.length} leiding)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 bg-primary hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Afdrukken of opslaan als PDF"
            >
              <span className="material-symbols-outlined text-base">print</span>
              <span>Afdrukken / PDF</span>
            </button>
            <button
              type="button"
              disabled={exportingImage}
              onClick={handleExportImage}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              title="Download als PNG afbeelding om te delen via WhatsApp of foto's"
            >
              <span className="material-symbols-outlined text-base">
                {exportingImage ? 'hourglass_top' : 'image'}
              </span>
              <span>{exportingImage ? 'Afbeelding maken...' : 'Afbeelding (PNG)'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="size-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-200 dark:bg-slate-700 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        </div>

        {/* Printable Area Preview */}
        <div id="participant-list-print" className="p-6 sm:p-8 overflow-y-auto flex-1 bg-white text-slate-900 font-sans">
          {/* Header op document */}
          <div className="header-banner border-b-2 border-slate-900 pb-4 mb-5">
            <div className="flex justify-between items-start gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-orange-600">
                  Gewest Reinaertland • Deelnemerslijst
                </span>
                <h1 className="text-2xl font-black text-slate-900 mt-1">
                  {form.title}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Afgedrukt op {new Date().toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <div className="text-right text-xs">
                <span className="inline-block bg-slate-100 font-bold px-3 py-1.5 rounded-lg border border-slate-300">
                  Totaal: {submissions.length} ({leden.length} Leden, {leiding.length} Leiding)
                </span>
                <span className="block mt-1.5 font-bold text-emerald-700">
                  {paidCount} van {submissions.length} betaald{totalPaidAmount > 0 ? ` (€${totalPaidAmount.toFixed(2)})` : ''}
                </span>
              </div>
            </div>
          </div>

          {/* 1. SECTIE: LEDEN */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-black uppercase tracking-wider text-orange-600 flex items-center gap-1.5">
                <span>Leden ({leden.length})</span>
              </h2>
            </div>

            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-100 text-slate-800 uppercase font-black tracking-wider text-[11px]">
                  <th className="py-2.5 px-2 w-8 text-center border-b border-slate-300">#</th>
                  <th className="py-2.5 px-3 border-b border-slate-300">Deelnemer</th>
                  <th className="py-2.5 px-3 border-b border-slate-300">Chirogroep / Afdeling</th>
                  <th className="py-2.5 px-3 border-b border-slate-300">Contact</th>
                  <th className="py-2.5 px-3 border-b border-slate-300">Allergieën / Dieet / Opmerkingen</th>
                  <th className="py-2.5 px-2 text-center w-20 border-b border-slate-300">Betaald</th>
                  <th className="py-2.5 px-2 text-center w-20 border-b border-slate-300">Aanwezig</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {leden.map((sub, idx) => renderRow(sub, idx + 1, false))}
              </tbody>
            </table>
            {leden.length === 0 && (
              <p className="text-center py-4 text-slate-400 italic text-xs border border-dashed border-slate-200 rounded-xl my-2">
                Geen leden ingeschreven.
              </p>
            )}
          </div>

          {/* 2. SECTIE: LEIDING */}
          {leiding.length > 0 && (
            <div className="mt-8 pt-4 border-t-2 border-slate-800">
              <div className="bg-slate-900 text-white px-4 py-2 rounded-xl mb-3 flex items-center justify-between">
                <span className="font-black uppercase tracking-wider text-xs flex items-center gap-1.5">
                  <span>LEIDING &amp; BEGELEIDING ({leiding.length})</span>
                </span>
              </div>

              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-300 bg-slate-200 text-slate-800 uppercase font-black tracking-wider text-[11px]">
                    <th className="py-2.5 px-2 w-8 text-center border-b border-slate-300">#</th>
                    <th className="py-2.5 px-3 border-b border-slate-300">Leiding Deelnemer</th>
                    <th className="py-2.5 px-3 border-b border-slate-300">Chirogroep / Rol</th>
                    <th className="py-2.5 px-3 border-b border-slate-300">Contact</th>
                    <th className="py-2.5 px-3 border-b border-slate-300">Allergieën / Dieet / Opmerkingen</th>
                    <th className="py-2.5 px-2 text-center w-20 border-b border-slate-300">Betaald</th>
                    <th className="py-2.5 px-2 text-center w-20 border-b border-slate-300">Aanwezig</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {leiding.map((sub, idx) => renderRow(sub, idx + 1, true))}
                </tbody>
              </table>
            </div>
          )}

          {submissions.length === 0 && (
            <p className="text-center py-8 text-slate-400 italic">Nog geen inschrijvingen ontvangen.</p>
          )}

          <div className="mt-8 pt-4 border-t border-slate-200 text-slate-400 text-[11px] flex justify-between">
            <span>Gewest Reinaertland • reinaertland.be</span>
            <span>Geprint voor intern gebruik door gewestleiding</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
          <span>
            Klik op &apos;Download PDF&apos; voor een instant digitaal document (werkt op alle smartphones en computers).
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 font-bold text-xs rounded-xl text-slate-700 dark:text-white cursor-pointer"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BeheerFormulieren({ authFetch }: BeheerFormulierenProps) {
  // Hoofdmodus: Tab 1 = formulieren overzicht / builder / inzendingen, Tab 2 = rapportage & statistieken
  const [activeTab, setActiveTab] = useState<'forms' | 'reports'>('forms');

  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);

  // Werkjaar state
  const currentInitialWerkjaar = computeWerkjaar(new Date());
  const [selectedWerkjaar, setSelectedWerkjaar] = useState<string>(
    currentInitialWerkjaar >= '2026-2027' ? currentInitialWerkjaar : '2026-2027'
  );

  // Modus: 'list' | 'builder' | 'submissions'
  const [viewMode, setViewMode] = useState<'list' | 'builder' | 'submissions'>('list');

  // Huidig geselecteerd formulier voor bewerken of inzendingen
  const [activeForm, setActiveForm] = useState<Form | null>(null);

  // Sjabloonselectie modal
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateNotice, setTemplateNotice] = useState<string>('');

  // Form Builder state
  const [builderTitle, setBuilderTitle] = useState('');
  const [builderDescription, setBuilderDescription] = useState('');
  const [builderIsOpen, setBuilderIsOpen] = useState(true);
  const [builderConfirmationMessage, setBuilderConfirmationMessage] = useState('Bedankt voor je reactie! We hebben je inschrijving goed ontvangen.');
  const [builderRequirePayment, setBuilderRequirePayment] = useState(false);
  const [builderPaymentAmount, setBuilderPaymentAmount] = useState('');
  const [builderPaymentIban, setBuilderPaymentIban] = useState('');
  const [builderPaymentMessage, setBuilderPaymentMessage] = useState('');
  const [builderAllowMultiple, setBuilderAllowMultiple] = useState(false);
  const [builderWerkjaar, setBuilderWerkjaar] = useState(selectedWerkjaar);
  const [builderFields, setBuilderFields] = useState<FormField[]>([]);
  const [savingForm, setSavingForm] = useState(false);
  const [builderError, setBuilderError] = useState('');

  // Submissions state
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);
  const [submissionToEdit, setSubmissionToEdit] = useState<FormSubmission | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'form' | 'submission'; id: number; subId?: number } | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);

  // Leiding Drankbijdrage & Betaling modal
  const [editingLeidingPaymentSub, setEditingLeidingPaymentSub] = useState<FormSubmission | null>(null);
  const [leidingPaidVal, setLeidingPaidVal] = useState<boolean>(true);
  const [leidingDrankVal, setLeidingDrankVal] = useState<number>(0);
  const [leidingNotesVal, setLeidingNotesVal] = useState<string>('');
  const [savingLeidingPayment, setSavingLeidingPayment] = useState<boolean>(false);

  const openLeidingPaymentModal = (sub: FormSubmission) => {
    setEditingLeidingPaymentSub(sub);
    setLeidingPaidVal(Boolean(sub.isPaid));
    setLeidingDrankVal(Number(sub.drankBijdrage) || 0);
    setLeidingNotesVal(sub.paymentNotes || '');
  };

  const handleSaveLeidingPayment = async () => {
    if (!activeForm || !editingLeidingPaymentSub) return;
    setSavingLeidingPayment(true);
    try {
      const res = await authFetch(`/api/forms/${activeForm.id}/submissions/${editingLeidingPaymentSub.id}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isPaid: leidingPaidVal,
          drankBijdrage: leidingDrankVal,
          paymentNotes: leidingNotesVal,
        }),
      });
      if (res.ok) {
        const paidAtStr = leidingPaidVal ? (editingLeidingPaymentSub.paidAt || new Date().toISOString()) : null;
        setSubmissions(prev =>
          prev.map(s => s.id === editingLeidingPaymentSub.id ? {
            ...s,
            isPaid: leidingPaidVal,
            paidAt: paidAtStr,
            drankBijdrage: leidingDrankVal,
            paymentNotes: leidingNotesVal,
          } : s)
        );
        setSelectedSubmission(prev =>
          prev && prev.id === editingLeidingPaymentSub.id ? {
            ...prev,
            isPaid: leidingPaidVal,
            paidAt: paidAtStr,
            drankBijdrage: leidingDrankVal,
            paymentNotes: leidingNotesVal,
          } : prev
        );
        showToast('Betaling en drankbijdrage voor leiding opgeslagen!');
        setEditingLeidingPaymentSub(null);
      } else {
        showToast('Fout bij opslaan betaling.');
      }
    } catch {
      showToast('Fout bij opslaan betaling.');
    } finally {
      setSavingLeidingPayment(false);
    }
  };

  // Toast / feedback notification
  const [toastMessage, setToastMessage] = useState('');
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handleSendPaymentReminders = async () => {
    if (!activeForm) return;
    setSendingReminders(true);
    try {
      const res = await authFetch(`/api/forms/${activeForm.id}/send-payment-reminders`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setShowReminderModal(false);
        showToast(`${data.sentCount} betaalherinnering(en) succesvol verzonden!`);
      } else {
        const err = await res.json();
        showToast(err.error || 'Fout bij verzenden van betaalherinneringen.');
      }
    } catch (err) {
      console.error(err);
      showToast('Netwerkfout bij verzenden betaalherinneringen.');
    } finally {
      setSendingReminders(false);
    }
  };

  // Werkjaren lijst (strikt vanaf 2026-2027; er zijn geen oudere werkjaren)
  const availableWerkjaren = useMemo(() => {
    const list = new Set<string>();
    list.add('2026-2027');
    list.add('2027-2028');
    if (currentInitialWerkjaar >= '2026-2027') {
      list.add(currentInitialWerkjaar);
    }
    forms.forEach(f => {
      const w = f.werkjaar || computeWerkjaar(f.createdAt);
      if (w && w >= '2026-2027') list.add(w);
    });
    return Array.from(list).filter(w => w >= '2026-2027').sort().reverse();
  }, [forms, currentInitialWerkjaar]);

  // Werkjaar wisselen
  const changeWerkjaar = (direction: number) => {
    const idx = availableWerkjaren.indexOf(selectedWerkjaar);
    if (idx !== -1) {
      const nextIdx = idx + direction;
      if (nextIdx >= 0 && nextIdx < availableWerkjaren.length) {
        setSelectedWerkjaar(availableWerkjaren[nextIdx]);
      }
    }
  };

  // Formulieren gefilterd per werkjaar
  const werkjaarForms = useMemo(() => {
    return forms.filter(f => (f.werkjaar || computeWerkjaar(f.createdAt)) === selectedWerkjaar);
  }, [forms, selectedWerkjaar]);

  // Filterbare velden (select, radio, of velden met opties)
  const filterableFields = useMemo(() => {
    if (!activeForm || !activeForm.fields) return [];
    return activeForm.fields.filter(f => (f.options && f.options.length > 0) || f.type === 'select' || f.type === 'radio');
  }, [activeForm]);

  // Tellertjes voor datums en statussen
  const countToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return submissions.filter(s => s.createdAt && s.createdAt.startsWith(today)).length;
  }, [submissions]);

  const countWeek = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return submissions.filter(s => s.createdAt && new Date(s.createdAt).getTime() >= sevenDaysAgo).length;
  }, [submissions]);

  const countMonth = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return submissions.filter(s => s.createdAt && new Date(s.createdAt).getTime() >= thirtyDaysAgo).length;
  }, [submissions]);

  const countPaid = useMemo(() => submissions.filter(s => s.isPaid).length, [submissions]);
  const countUnpaid = useMemo(() => submissions.filter(s => !s.isPaid).length, [submissions]);

  // Gefilterde inzendingen
  const filteredSubmissions = useMemo(() => {
    return submissions.filter(sub => {
      // Betaalfilter
      if (paymentFilter === 'paid' && !sub.isPaid) return false;
      if (paymentFilter === 'unpaid' && sub.isPaid) return false;

      // Datumfilter
      if (dateFilter !== 'all') {
        const subTime = new Date(sub.createdAt).getTime();
        const now = Date.now();
        if (dateFilter === 'today') {
          const today = new Date().toISOString().slice(0, 10);
          if (!sub.createdAt.startsWith(today)) return false;
        } else if (dateFilter === 'week') {
          if (now - subTime > 7 * 24 * 60 * 60 * 1000) return false;
        } else if (dateFilter === 'month') {
          if (now - subTime > 30 * 24 * 60 * 60 * 1000) return false;
        }
      }

      // Vraag-specifieke filters
      for (const [fId, chosenOpt] of Object.entries(fieldFilters)) {
        if (!chosenOpt) continue;
        const val = sub.data?.[fId];
        if (Array.isArray(val)) {
          if (!val.includes(chosenOpt)) return false;
        } else {
          if (String(val ?? '') !== chosenOpt) return false;
        }
      }

      // Zoekopdracht
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (sub.respondentEmail?.toLowerCase().includes(q)) return true;
        return JSON.stringify(sub.data).toLowerCase().includes(q);
      }

      return true;
    });
  }, [submissions, paymentFilter, dateFilter, fieldFilters, searchQuery]);

  const hasActiveFilters = Boolean(
    paymentFilter !== 'all' ||
    dateFilter !== 'all' ||
    Object.values(fieldFilters).some(v => Boolean(v)) ||
    searchQuery.trim()
  );

  const clearAllFilters = () => {
    setPaymentFilter('all');
    setDateFilter('all');
    setFieldFilters({});
    setSearchQuery('');
  };

  const handleTogglePayment = async (subId: number, currentPaid: boolean) => {
    if (!activeForm) return;
    try {
      const nextPaid = !currentPaid;
      const res = await authFetch(`/api/forms/${activeForm.id}/submissions/${subId}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaid: nextPaid }),
      });
      if (res.ok) {
        const paidAtStr = nextPaid ? new Date().toISOString() : null;
        setSubmissions(prev =>
          prev.map(s => s.id === subId ? { ...s, isPaid: nextPaid, paidAt: paidAtStr } : s)
        );
        setSelectedSubmission(prev =>
          prev && prev.id === subId ? { ...prev, isPaid: nextPaid, paidAt: paidAtStr } : prev
        );
        showToast(nextPaid ? 'Inzending gemarkeerd als betaald!' : 'Inzending gemarkeerd als niet-betaald.');
      }
    } catch (err) {
      console.error(err);
      showToast('Fout bij bijwerken betaalstatus.');
    }
  };

  // Formulieren ophalen
  const fetchForms = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/forms');
      if (res.ok) {
        const data = await res.json();
        setForms(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForms();
  }, []);

  // Open sjabloonselectie modal
  const handleOpenTemplateModal = () => {
    setShowTemplateModal(true);
  };

  // Sjabloon gekozen
  const handleSelectTemplate = (templateKey: FormTemplateKey) => {
    setShowTemplateModal(false);
    const config = buildTemplateFormState(templateKey, selectedWerkjaar, forms);
    setActiveForm(null);
    setBuilderTitle(config.title);
    setBuilderDescription(config.description);
    setBuilderIsOpen(true);
    setBuilderConfirmationMessage(config.confirmationMessage);
    setBuilderRequirePayment(config.requirePayment);
    setBuilderPaymentAmount(config.paymentAmount);
    setBuilderPaymentIban(config.paymentIban);
    setBuilderPaymentMessage(config.paymentMessage);
    setBuilderAllowMultiple(config.allowMultipleSubmissions);
    setBuilderFields(config.fields);
    setBuilderWerkjaar(selectedWerkjaar);
    setBuilderError('');

    if (config.copiedFromPreviousYear) {
      setTemplateNotice(`Gegevens en vragen zijn automatisch overgenomen van "${config.previousFormTitle}". Pas de titel, datum of prijs aan indien nodig.`);
    } else {
      setTemplateNotice('');
    }

    setViewMode('builder');
  };

  // Open builder voor bewerken
  const handleEditForm = (form: Form) => {
    setActiveForm(form);
    setBuilderTitle(form.title || '');
    setBuilderDescription(form.description || '');
    setBuilderIsOpen(form.isOpen);
    setBuilderConfirmationMessage(form.confirmationMessage || 'Bedankt voor je reactie! We hebben je inschrijving goed ontvangen.');
    setBuilderRequirePayment(Boolean(form.requirePayment));
    setBuilderPaymentAmount(form.paymentAmount !== undefined && form.paymentAmount !== null ? String(form.paymentAmount) : '');
    setBuilderPaymentIban(form.paymentIban || '');
    setBuilderPaymentMessage(form.paymentMessage || '');
    setBuilderAllowMultiple(Boolean(form.allowMultipleSubmissions));
    setBuilderWerkjaar(form.werkjaar || selectedWerkjaar);
    setBuilderFields(Array.isArray(form.fields) ? JSON.parse(JSON.stringify(form.fields)) : []);
    setTemplateNotice('');
    setBuilderError('');
    setViewMode('builder');
  };

  // Open inzendingen scherm
  const handleViewSubmissions = async (form: Form) => {
    setActiveForm(form);
    setViewMode('submissions');
    setPaymentFilter('all');
    setDateFilter('all');
    setFieldFilters({});
    setSearchQuery('');
    setLoadingSubmissions(true);
    try {
      const res = await authFetch(`/api/forms/${form.id}/submissions`);
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  // Veld toevoegen in builder
  const handleAddField = (type: FormFieldType = 'text') => {
    const newField: FormField = {
      id: `f_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      type,
      label: type === 'select' ? 'Chirogroep' : 'Nieuwe vraag',
      required: false,
      options: type === 'select' || type === 'radio' || type === 'checkbox' ? [...REINAERTLAND_GROUPS_WITH_LEIDING] : undefined,
    };
    setBuilderFields(prev => [...prev, newField]);
  };

  const handleUpdateField = (index: number, updates: Partial<FormField>) => {
    setBuilderFields(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  };

  const handleDeleteField = (index: number) => {
    setBuilderFields(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddOption = (fieldIndex: number) => {
    setBuilderFields(prev => {
      const copy = [...prev];
      const opts = copy[fieldIndex].options || [];
      copy[fieldIndex] = { ...copy[fieldIndex], options: [...opts, `Optie ${opts.length + 1}`] };
      return copy;
    });
  };

  const handleUpdateOption = (fieldIndex: number, optIndex: number, val: string) => {
    setBuilderFields(prev => {
      const copy = [...prev];
      const opts = [...(copy[fieldIndex].options || [])];
      opts[optIndex] = val;
      copy[fieldIndex] = { ...copy[fieldIndex], options: opts };
      return copy;
    });
  };

  const handleDeleteOption = (fieldIndex: number, optIndex: number) => {
    setBuilderFields(prev => {
      const copy = [...prev];
      const opts = (copy[fieldIndex].options || []).filter((_, i) => i !== optIndex);
      copy[fieldIndex] = { ...copy[fieldIndex], options: opts };
      return copy;
    });
  };

  // Opslaan in database
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!builderTitle.trim()) {
      setBuilderError('Titel van het formulier is verplicht.');
      return;
    }
    if (builderFields.length === 0) {
      setBuilderError('Voeg ten minste 1 vraag toe aan het formulier.');
      return;
    }

    setSavingForm(true);
    setBuilderError('');

    const payload = {
      title: builderTitle.trim(),
      description: builderDescription.trim(),
      isOpen: builderIsOpen,
      confirmationMessage: builderConfirmationMessage.trim(),
      fields: builderFields,
      requirePayment: builderRequirePayment,
      paymentAmount: builderRequirePayment && builderPaymentAmount ? parseFloat(builderPaymentAmount) : null,
      paymentIban: builderRequirePayment ? builderPaymentIban.trim() : null,
      paymentMessage: builderRequirePayment ? builderPaymentMessage.trim() : null,
      allowMultipleSubmissions: builderAllowMultiple,
      werkjaar: builderWerkjaar,
    };

    try {
      let res: Response;
      if (activeForm) {
        res = await authFetch(`/api/forms/${activeForm.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await authFetch('/api/forms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        setBuilderError(data.error || 'Fout bij opslaan.');
      } else {
        showToast(activeForm ? 'Formulier succesvol bijgewerkt!' : 'Nieuw formulier succesvol aangemaakt!');
        await fetchForms();
        setViewMode('list');
      }
    } catch (err) {
      console.error(err);
      setBuilderError('Fout bij opslaan formulier.');
    } finally {
      setSavingForm(false);
    }
  };

  // Status wisselen (open/dicht / pauzeren / hervatten)
  const handleToggleOpen = async (form: Form) => {
    try {
      const nextIsOpen = !form.isOpen;
      const res = await authFetch(`/api/forms/${form.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          isOpen: nextIsOpen,
          confirmationMessage: form.confirmationMessage,
          sendEmailConfirmation: form.sendEmailConfirmation,
          notifyAdminEmail: form.notifyAdminEmail,
          requirePayment: form.requirePayment,
          paymentAmount: form.paymentAmount,
          paymentIban: form.paymentIban,
          paymentMessage: form.paymentMessage,
          allowMultipleSubmissions: form.allowMultipleSubmissions,
          fields: form.fields,
          werkjaar: form.werkjaar,
        }),
      });
      if (res.ok) {
        setForms(prev => prev.map(f => f.id === form.id ? { ...f, isOpen: nextIsOpen } : f));
        if (activeForm && activeForm.id === form.id) {
          setActiveForm(prev => prev ? { ...prev, isOpen: nextIsOpen } : null);
        }
        showToast(nextIsOpen ? 'Formulier geopend voor inschrijvingen.' : 'Formulier gepauzeerd voor inschrijvingen.');
      } else {
        showToast('Fout bij wijzigen status.');
      }
    } catch (err) {
      console.error(err);
      showToast('Fout bij wijzigen status.');
    }
  };

  // Link kopiëren
  const handleCopyLink = (formId: number) => {
    const url = `${window.location.origin}/inschrijvingen/${formId}`;
    navigator.clipboard.writeText(url);
    showToast('Inschrijvingslink gekopieerd naar klembord!');
  };

  // Inschrijving bewerken opslaan
  const handleSaveEditedSubmission = async (
    updatedData: Record<string, any>,
    updatedEmail: string,
    updatedIsPaid: boolean,
    updatedNotes: string,
    updatedDrank?: number
  ): Promise<boolean> => {
    if (!activeForm || !submissionToEdit) return false;
    try {
      const finalDrank = updatedDrank !== undefined ? updatedDrank : (submissionToEdit.drankBijdrage || 0);
      const res = await authFetch(`/api/forms/${activeForm.id}/submissions/${submissionToEdit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: updatedData,
          respondentEmail: updatedEmail,
          isPaid: updatedIsPaid,
          paymentNotes: updatedNotes,
          drankBijdrage: finalDrank,
        }),
      });

      if (!res.ok) {
        return false;
      }

      // Update in submissions array
      setSubmissions(prev =>
        prev.map(s =>
          s.id === submissionToEdit.id
            ? {
                ...s,
                data: updatedData,
                respondentEmail: updatedEmail,
                isPaid: updatedIsPaid,
                paymentNotes: updatedNotes,
                drankBijdrage: finalDrank,
                paidAt: updatedIsPaid ? (s.paidAt || new Date().toISOString()) : null,
              }
            : s
        )
      );

      if (selectedSubmission?.id === submissionToEdit.id) {
        setSelectedSubmission(prev =>
          prev
            ? {
                ...prev,
                data: updatedData,
                respondentEmail: updatedEmail,
                isPaid: updatedIsPaid,
                paymentNotes: updatedNotes,
                drankBijdrage: finalDrank,
                paidAt: updatedIsPaid ? (prev.paidAt || new Date().toISOString()) : null,
              }
            : null
        );
      }

      showToast('Inschrijving succesvol gewijzigd!');
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  // Verwijderen uitvoeren (formulier of inzending)
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      if (itemToDelete.type === 'form') {
        const res = await authFetch(`/api/forms/${itemToDelete.id}`, { method: 'DELETE' });
        if (res.ok) {
          showToast('Formulier verwijderd.');
          fetchForms();
          if (activeForm?.id === itemToDelete.id) setViewMode('list');
        }
      } else if (itemToDelete.type === 'submission' && activeForm && itemToDelete.subId) {
        const res = await authFetch(`/api/forms/${activeForm.id}/submissions/${itemToDelete.subId}`, { method: 'DELETE' });
        if (res.ok) {
          showToast('Inzending verwijderd.');
          setSubmissions(prev => prev.filter(s => s.id !== itemToDelete.subId));
          if (selectedSubmission?.id === itemToDelete.subId) setSelectedSubmission(null);
        }
      }
    } catch (err) {
      console.error(err);
      alert('Fout bij verwijderen.');
    } finally {
      setItemToDelete(null);
    }
  };

  // Navigatie vanaf Rapportage naar submissions van een specifiek formulier
  const handleSelectFormForSubmissions = (formId: number) => {
    const target = forms.find(f => f.id === formId);
    if (target) {
      setActiveTab('forms');
      setSelectedWerkjaar(target.werkjaar || computeWerkjaar(target.createdAt));
      handleViewSubmissions(target);
    }
  };

  const inputClass = "w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

  return (
    <div className="max-w-6xl mx-auto pb-16">
      {/* Toast Notificatie */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-sm font-semibold animate-in fade-in slide-in-from-bottom-3 border border-slate-700">
          <span className="material-symbols-outlined text-green-400 text-lg">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ─── 2 HOOFDTABS: FORMULIEREN OVERZICHT VS RAPPORTAGE & STATISTIEKEN ─── */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 mb-8 gap-4 sm:gap-8">
        <button
          type="button"
          onClick={() => {
            setActiveTab('forms');
            setViewMode('list');
          }}
          className={`pb-3.5 font-bold text-sm sm:text-base flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'forms'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <span className="material-symbols-outlined text-lg">dynamic_form</span>
          <span>Formulieren & Beheer</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('reports');
            setViewMode('list');
          }}
          className={`pb-3.5 font-bold text-sm sm:text-base flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'reports'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <span className="material-symbols-outlined text-lg">insights</span>
          <span>Rapportage & Statistieken</span>
        </button>
      </div>

      {/* ─── TAB 2: RAPPORTAGE & STATISTIEKEN ──────────────────────────── */}
      {activeTab === 'reports' && (
        <FormulierenRapportage
          authFetch={authFetch}
          availableWerkjaren={availableWerkjaren}
          currentWerkjaar={selectedWerkjaar}
          onSelectFormForSubmissions={handleSelectFormForSubmissions}
        />
      )}

      {/* ─── TAB 1: FORMULIEREN BEHEER ─────────────────────────────────── */}
      {activeTab === 'forms' && (
        <>
          {/* ─── 1. OVERZICHT VAN FORMULIEREN IN WERKJAAR ──────────────────── */}
          {viewMode === 'list' && (
            <div>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
                <div>
                  <h2 className="text-3xl font-black tracking-tight text-slate-800 dark:text-white">Formulieren & Inschrijvingen</h2>
                  <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
                    Beheer inschrijvingen per werkjaar, gebruik standaardsjablonen en exporteer deelnemerslijsten.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOpenTemplateModal}
                  className="w-full sm:w-auto px-5 py-2.5 bg-primary text-white font-bold rounded-xl shadow-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  Nieuw Formulier Maken
                </button>
              </div>

              {/* Werkjaar Navigator (identiek aan /beheer/financien) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs mb-8">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => changeWerkjaar(1)}
                    disabled={availableWerkjaren.indexOf(selectedWerkjaar) >= availableWerkjaren.length - 1}
                    className="size-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="Vorig werkjaar"
                  >
                    <span className="material-symbols-outlined text-base">chevron_left</span>
                  </button>

                  <div className="relative">
                    <select
                      value={selectedWerkjaar}
                      onChange={e => setSelectedWerkjaar(e.target.value)}
                      className="appearance-none font-black text-sm text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 pr-9 outline-none cursor-pointer hover:border-primary transition-colors"
                    >
                      {availableWerkjaren.map(wj => (
                        <option key={wj} value={wj}>
                          Werkjaar {wj}
                        </option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-base">
                      arrow_drop_down
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => changeWerkjaar(-1)}
                    disabled={availableWerkjaren.indexOf(selectedWerkjaar) <= 0}
                    className="size-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="Volgend werkjaar"
                  >
                    <span className="material-symbols-outlined text-base">chevron_right</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="material-symbols-outlined text-base text-primary">folder_open</span>
                  <span>
                    {werkjaarForms.length} formulier(en) in werkjaar {selectedWerkjaar}
                  </span>
                </div>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
                  {[1, 2].map(i => (
                    <div key={i} className="h-44 bg-slate-100 dark:bg-slate-800 rounded-2xl"></div>
                  ))}
                </div>
              ) : werkjaarForms.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-8">
                  <div className="size-16 rounded-full bg-orange-50 dark:bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-3xl">dynamic_form</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">
                    Geen formulieren in werkjaar {selectedWerkjaar}
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mx-auto mb-6">
                    Maak voor dit werkjaar formulieren aan met een standaard sjabloon (IKAA, Cocktailquiz, Gewestweekend Tito&apos;s/Keti&apos;s/Aspi&apos;s).
                  </p>
                  <button
                    onClick={handleOpenTemplateModal}
                    className="px-5 py-2.5 bg-primary text-white font-bold text-sm rounded-xl hover:bg-primary/90 transition-all shadow-md shadow-primary/20 cursor-pointer inline-flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    Kies een Sjabloon
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {werkjaarForms.map(form => (
                    <div
                      key={form.id}
                      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between group"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                            form.isOpen
                              ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                          }`}>
                            <span className={`size-1.5 rounded-full ${form.isOpen ? 'bg-green-500' : 'bg-slate-400'}`}></span>
                            {form.isOpen ? 'Inschrijvingen Open' : 'Gesloten'}
                          </span>

                          <button
                            onClick={() => handleCopyLink(form.id)}
                            className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary flex items-center gap-1 cursor-pointer transition-colors"
                            title="Deelbare link kopiëren"
                          >
                            <span className="material-symbols-outlined text-[15px]">link</span>
                            Link delen
                          </button>
                        </div>

                        <h3 className="text-xl font-bold text-slate-800 dark:text-white group-hover:text-primary transition-colors">
                          {form.title}
                        </h3>
                        {form.description && (
                          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 line-clamp-2">
                            {form.description}
                          </p>
                        )}

                        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">quiz</span>
                            {(form.fields || []).length} vraag/vragen
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">assignment_turned_in</span>
                            {form.submissionCount || 0} reactie(s)
                          </span>
                          {form.requirePayment && (
                            <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full font-bold">
                              <span className="material-symbols-outlined text-[15px]">payments</span>
                              €{Number(form.paymentAmount || 0).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actieknoppen onderaan */}
                      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
                        <button
                          onClick={() => handleViewSubmissions(form)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs rounded-lg transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">groups</span>
                          <span>Inzendingen ({form.submissionCount || 0})</span>
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleToggleOpen(form)}
                            className="size-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center cursor-pointer transition-colors"
                            title={form.isOpen ? 'Sluit formulier voor nieuwe reacties' : 'Open formulier voor reacties'}
                          >
                            <span className="material-symbols-outlined text-lg">{form.isOpen ? 'pause_circle' : 'play_circle'}</span>
                          </button>

                          <button
                            onClick={() => handleEditForm(form)}
                            className="size-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center cursor-pointer transition-colors"
                            title="Formulier bewerken"
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>

                          <button
                            onClick={() => setItemToDelete({ type: 'form', id: form.id })}
                            className="size-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center cursor-pointer transition-colors"
                            title="Formulier verwijderen"
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── 2. FORM BUILDER ────────────────────────────────────────────── */}
          {viewMode === 'builder' && (
            <form onSubmit={handleSaveForm} className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-primary cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-base">arrow_back</span>
                  Terug naar formulieren
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    Annuleren
                  </button>
                  <button
                    type="submit"
                    disabled={savingForm}
                    className="px-6 py-2 bg-primary text-white font-bold text-sm rounded-xl shadow-md hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {savingForm ? 'Opslaan...' : activeForm ? 'Wijzigingen Opslaan' : 'Formulier Aanmaken'}
                  </button>
                </div>
              </div>

              {templateNotice && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-xs">
                  <span className="material-symbols-outlined text-base text-emerald-600 shrink-0">check_circle</span>
                  <span>{templateNotice}</span>
                </div>
              )}

              {builderError && (
                <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm font-bold">
                  {builderError}
                </div>
              )}

              {/* Basis instellingen kaart */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Titel van het formulier *
                    </label>
                    <input
                      type="text"
                      value={builderTitle}
                      onChange={e => setBuilderTitle(e.target.value)}
                      placeholder="bv. Gewestweekend Tito's 2026-2027"
                      className={inputClass}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Werkjaar *
                    </label>
                    <select
                      value={builderWerkjaar}
                      onChange={e => setBuilderWerkjaar(e.target.value)}
                      className={inputClass}
                    >
                      {availableWerkjaren.map(wj => (
                        <option key={wj} value={wj}>
                          Werkjaar {wj}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Beschrijving / Uitleg
                  </label>
                  <textarea
                    rows={3}
                    value={builderDescription}
                    onChange={e => setBuilderDescription(e.target.value)}
                    placeholder="Korte toelichting, meeneemlijst of praktische info voor de deelnemers..."
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <label className="flex items-center gap-2.5 cursor-pointer bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600">
                    <input
                      type="checkbox"
                      checked={builderIsOpen}
                      onChange={e => setBuilderIsOpen(e.target.checked)}
                      className="size-4 rounded text-primary focus:ring-primary border-slate-300 dark:border-slate-600 cursor-pointer"
                    />
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 block text-xs sm:text-sm">Inschrijvingen geopend</span>
                      <span className="text-[11px] text-slate-400 block">Zichtbaar en invulbaar voor bezoekers</span>
                    </div>
                  </label>

                  {/* ─── 2 KEER INSCHRIJVEN TOGGLE ─── */}
                  <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600">
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 block text-xs sm:text-sm">2 keer inschrijven toestaan</span>
                      <span className="text-[11px] text-slate-400 block">
                        {builderAllowMultiple
                          ? 'Aan (meerdere inschrijvingen toegestaan)'
                          : 'Uit (Aanbevolen: blokkeert dubbele inschrijving bij ≥90% gelijke velden)'}
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={builderAllowMultiple}
                        onChange={e => setBuilderAllowMultiple(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>

                {/* Betaaloptie sectie */}
                <div className="pt-5 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-xl">payments</span>
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                        Betaaloptie / Gewestkas
                      </h4>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={builderRequirePayment}
                        onChange={e => setBuilderRequirePayment(e.target.checked)}
                        className="size-4 rounded text-primary focus:ring-primary border-slate-300 dark:border-slate-600"
                      />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Betaling vereist</span>
                    </label>
                  </div>

                  {builderRequirePayment && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 p-4 rounded-xl bg-orange-50/50 dark:bg-slate-900/40 border border-orange-100 dark:border-slate-700 animate-in fade-in">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Prijs per inschrijving (€) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={builderPaymentAmount}
                          onChange={e => setBuilderPaymentAmount(e.target.value)}
                          placeholder="bv. 35.00"
                          className={inputClass}
                          required={builderRequirePayment}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          IBAN Rekeningnummer
                        </label>
                        <input
                          type="text"
                          value={builderPaymentIban}
                          onChange={e => setBuilderPaymentIban(e.target.value)}
                          placeholder="BE..."
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Gestructureerde Mededeling / Omschrijving
                        </label>
                        <input
                          type="text"
                          value={builderPaymentMessage}
                          onChange={e => setBuilderPaymentMessage(e.target.value)}
                          placeholder="bv. Gewestweekend + Naam lid"
                          className={inputClass}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Vragenlijst in de builder */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                    Vragen & Velden ({builderFields.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddField('text')}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">short_text</span> + Tekst
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddField('select')}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">arrow_drop_down_circle</span> + Keuzelijst (Chiro)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddField('radio')}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">radio_button_checked</span> + Radio
                    </button>
                  </div>
                </div>

                {builderFields.map((field, fIdx) => (
                  <div
                    key={field.id}
                    className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <input
                            type="text"
                            value={field.label}
                            onChange={e => handleUpdateField(fIdx, { label: e.target.value })}
                            placeholder="Vraag / Label..."
                            className="w-full font-bold text-slate-800 dark:text-white bg-transparent border-b border-slate-200 dark:border-slate-700 pb-1 outline-none focus:border-primary text-base"
                          />
                        </div>
                        <div>
                          <select
                            value={field.type}
                            onChange={e => {
                              const newType = e.target.value as FormFieldType;
                              handleUpdateField(fIdx, {
                                type: newType,
                                options: (newType === 'select' || newType === 'radio' || newType === 'checkbox') && !field.options
                                  ? [...REINAERTLAND_GROUPS_WITH_LEIDING]
                                  : field.options,
                              });
                            }}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-bold outline-none cursor-pointer"
                          >
                            <option value="text">Korte tekst</option>
                            <option value="textarea">Lange tekst / Paragraaf</option>
                            <option value="select">Keuzelijst (Dropdown)</option>
                            <option value="radio">Meerkeuze (Radio)</option>
                            <option value="checkbox">Selectievakjes (Checkboxes)</option>
                            <option value="email">E-mailadres</option>
                            <option value="number">Nummer</option>
                            <option value="date">Datum</option>
                          </select>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteField(fIdx)}
                        className="size-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center justify-center cursor-pointer transition-colors"
                        title="Vraag verwijderen"
                      >
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </div>

                    {/* Opties voor select, radio of checkbox */}
                    {(field.type === 'select' || field.type === 'radio' || field.type === 'checkbox') && (
                      <div className="pl-4 border-l-2 border-primary/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Keuzemogelijkheden:</span>
                          {/* Snelknop om alle Chirogroepen + Leiding in te voegen */}
                          <button
                            type="button"
                            onClick={() => handleUpdateField(fIdx, { options: [...REINAERTLAND_GROUPS_WITH_LEIDING] })}
                            className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                          >
                            + Alle Chirogroepen &amp; LEIDING invoegen
                          </button>
                        </div>

                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {(field.options || []).map((opt, oIdx) => (
                            <div key={oIdx} className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-xs text-slate-400">drag_indicator</span>
                              <input
                                type="text"
                                value={opt}
                                onChange={e => handleUpdateOption(fIdx, oIdx, e.target.value)}
                                className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white outline-none focus:border-primary"
                              />
                              <button
                                type="button"
                                onClick={() => handleDeleteOption(fIdx, oIdx)}
                                className="text-slate-400 hover:text-red-500 cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-sm">close</span>
                              </button>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddOption(fIdx)}
                          className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer pt-1"
                        >
                          <span className="material-symbols-outlined text-sm">add</span> Optie toevoegen
                        </button>
                      </div>
                    )}

                    {/* Extra veldopties (Placeholder & Verplicht) */}
                    <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100 dark:border-slate-700 text-xs">
                      <div className="flex-1 max-w-sm">
                        <input
                          type="text"
                          value={field.placeholder || ''}
                          onChange={e => handleUpdateField(fIdx, { placeholder: e.target.value })}
                          placeholder="Optionele placeholder tekst..."
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 outline-none focus:border-primary"
                        />
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={e => handleUpdateField(fIdx, { required: e.target.checked })}
                          className="size-4 rounded text-primary focus:ring-primary border-slate-300 dark:border-slate-600"
                        />
                        <span className="font-bold text-slate-700 dark:text-slate-300">Verplicht veld</span>
                      </label>
                    </div>
                  </div>
                ))}

                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleAddField('text')}
                    className="px-6 py-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl text-primary font-bold text-sm inline-flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
                  >
                    <span className="material-symbols-outlined text-lg">add_circle</span>
                    Vraag Toevoegen
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ─── 3. INZENDINGEN BEKIJKEN & EXPORTEREN ─────────────────────────── */}
          {viewMode === 'submissions' && activeForm && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-primary cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-base">arrow_back</span>
                  Terug naar overzicht ({selectedWerkjaar})
                </button>

                <div className="flex flex-wrap items-center gap-2.5">
                  <Link
                    to="/beheer/financien"
                    className="px-4 py-2 bg-orange-50 hover:bg-orange-100 text-primary dark:bg-orange-950/40 dark:hover:bg-orange-900/50 border border-primary/30 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Koppel deze inschrijvingen aan de gewestkas"
                  >
                    <span className="material-symbols-outlined text-base">payments</span>
                    <span>Koppel aan Kas</span>
                  </Link>

                  {(activeForm.requirePayment || countUnpaid > 0) && (
                    <button
                      type="button"
                      onClick={() => setShowReminderModal(true)}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Stuur een vriendelijke betaalherinnering naar alle niet-betaalde deelnemers"
                    >
                      <span className="material-symbols-outlined text-base">forward_to_inbox</span>
                      <span>Betaalherinnering ({countUnpaid})</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowPrintModal(true)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200 dark:border-slate-600"
                  >
                    <span className="material-symbols-outlined text-base text-primary">description</span>
                    <span>Deelnemerslijst (PDF / Print)</span>
                  </button>

                  <a
                    href={`/api/forms/${activeForm.id}/export`}
                    download
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">download</span>
                    <span>Exporteer CSV</span>
                  </a>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-700">
                  <div>
                    <span className="text-xs font-bold text-primary uppercase">Inzendingen • Werkjaar {activeForm.werkjaar || selectedWerkjaar}</span>
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white mt-0.5">{activeForm.title}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300">
                      {submissions.length} reactie(s)
                    </span>
                    <span className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">payments</span>
                      {countPaid} / {submissions.length} betaald
                      {activeForm.paymentAmount && activeForm.paymentAmount > 0 ? (
                        <span> (€{(countPaid * Number(activeForm.paymentAmount)).toFixed(2)})</span>
                      ) : null}
                    </span>
                  </div>
                </div>

                {/* Filters & Zoekbalk */}
                <div className="space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="relative flex-1">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Zoek in inzendingen (op naam, e-mail, groep)..."
                        className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-800 dark:text-white text-xs outline-none focus:border-primary"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-700/60 p-0.5 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => setPaymentFilter('all')}
                          className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                            paymentFilter === 'all' ? 'bg-white dark:bg-slate-800 text-primary shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          Alles ({submissions.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentFilter('paid')}
                          className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                            paymentFilter === 'paid' ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          Betaald ({countPaid})
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentFilter('unpaid')}
                          className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                            paymentFilter === 'unpaid' ? 'bg-white dark:bg-slate-800 text-amber-600 shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          Niet betaald ({countUnpaid})
                        </button>
                      </div>
                    </div>
                  </div>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-primary hover:bg-primary/10 font-bold transition-colors cursor-pointer text-xs"
                    >
                      <span className="material-symbols-outlined text-sm">filter_alt_off</span>
                      Filters wissen
                    </button>
                  )}
                </div>
              </div>

              {/* Tabel met inzendingen */}
              {loadingSubmissions ? (
                <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse"></div>
              ) : submissions.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-12 text-center">
                  <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">inbox</span>
                  <p className="text-slate-500 dark:text-slate-400 font-medium">Nog geen reacties ontvangen voor dit formulier.</p>
                </div>
              ) : filteredSubmissions.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-12 text-center">
                  <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">filter_list_off</span>
                  <p className="text-slate-700 dark:text-slate-200 font-bold">Geen inzendingen gevonden voor deze filters</p>
                  <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">Pas je zoekopdracht of filters aan om resultaten te zien.</p>
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="mt-4 px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl shadow-sm hover:bg-primary/90 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-base">filter_alt_off</span>
                    Filters wissen
                  </button>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <tr>
                          <th className="p-4">Tijdstip</th>
                          <th className="p-4">Respondent</th>
                          <th className="p-4 text-center">Betaalstatus</th>
                          {(activeForm.fields || []).slice(0, 2).map(f => (
                            <th key={f.id} className="p-4 truncate max-w-[200px]" title={f.label}>
                              {f.label}
                            </th>
                          ))}
                          <th className="p-4 text-right">Acties</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-slate-700 dark:text-slate-300">
                        {filteredSubmissions.map(sub => {
                          const dateStr = new Date(sub.createdAt).toLocaleString('nl-BE', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          });
                          const isLeader = isLeidingSubmission(sub, activeForm.fields);
                          return (
                            <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                              <td className="p-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 font-medium">
                                {dateStr}
                              </td>
                              <td className="p-4 font-semibold text-slate-800 dark:text-white">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span>{sub.respondentEmail || 'Anoniem'}</span>
                                  {isLeader && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40">
                                      Leiding
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-4 text-center whitespace-nowrap">
                                <div className="inline-flex flex-col items-center gap-1 justify-center">
                                  <div className="inline-flex items-center gap-1.5 justify-center">
                                    {isLeader ? (
                                      <button
                                        type="button"
                                        onClick={() => openLeidingPaymentModal(sub)}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                          sub.isPaid
                                            ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/50'
                                            : 'bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/50'
                                        }`}
                                        title="Klik om betaling en drankbijdrage voor leiding aan te passen"
                                      >
                                        <span className="material-symbols-outlined text-[15px]">
                                          {sub.isPaid ? 'check_circle' : 'schedule'}
                                        </span>
                                        <span>{sub.isPaid ? 'Betaald' : 'Nog te betalen'}</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleTogglePayment(sub.id, !!sub.isPaid)}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                          sub.isPaid
                                            ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/50'
                                            : 'bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/50'
                                        }`}
                                        title={sub.isPaid ? 'Klik om als onbetaald te markeren' : 'Klik om als betaald te markeren'}
                                      >
                                        <span className="material-symbols-outlined text-[15px]">
                                          {sub.isPaid ? 'check_circle' : 'schedule'}
                                        </span>
                                        <span>{sub.isPaid ? 'Betaald' : 'Nog te betalen'}</span>
                                      </button>
                                    )}

                                    {sub.paymentNotes && (
                                      <span
                                        className="size-6 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-300 flex items-center justify-center cursor-help transition-colors"
                                        title={`Betaalnotitie: ${sub.paymentNotes}`}
                                      >
                                        <span className="material-symbols-outlined text-xs text-primary">note</span>
                                      </span>
                                    )}
                                  </div>

                                  {/* Drankforfait badge voor leiding */}
                                  {isLeader && (
                                    <button
                                      type="button"
                                      onClick={() => openLeidingPaymentModal(sub)}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer border ${
                                        Number(sub.drankBijdrage) === 10
                                          ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700'
                                          : Number(sub.drankBijdrage) === 5
                                          ? 'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/60 dark:text-orange-200 dark:border-orange-700'
                                          : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                      }`}
                                      title="Klik om drankforfait leiding te wijzigen (0€, 5€ of 10€)"
                                    >
                                      <span className="material-symbols-outlined text-[12px]">sports_bar</span>
                                      <span>
                                        {Number(sub.drankBijdrage) === 10
                                          ? 'Drank: €10 (2 d.)'
                                          : Number(sub.drankBijdrage) === 5
                                          ? 'Drank: €5 (1 d.)'
                                          : 'Drank: €0 (geen)'}
                                      </span>
                                    </button>
                                  )}
                                </div>
                              </td>
                              {(activeForm.fields || []).slice(0, 2).map(f => {
                                const val = sub.data[f.id];
                                const display = Array.isArray(val) ? val.join(', ') : String(val ?? '-');
                                return (
                                  <td key={f.id} className="p-4 truncate max-w-[200px] text-xs" title={display}>
                                    {display}
                                  </td>
                                );
                              })}
                              <td className="p-4 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedSubmission(sub)}
                                    className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-primary/10 hover:text-primary rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                  >
                                    Details
                                  </button>
                                  {/* ─── BEHEERDER KAN INSCHRIJVING AANPASSEN ─── */}
                                  <button
                                    type="button"
                                    onClick={() => setSubmissionToEdit(sub)}
                                    className="size-8 rounded-lg hover:bg-orange-50 dark:hover:bg-primary/20 text-slate-500 hover:text-primary flex items-center justify-center cursor-pointer transition-colors"
                                    title="Inschrijving aanpassen (bv. Chirogroep wijzigen)"
                                  >
                                    <span className="material-symbols-outlined text-base">edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setItemToDelete({ type: 'submission', id: activeForm.id, subId: sub.id })}
                                    className="size-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 flex items-center justify-center cursor-pointer transition-colors"
                                    title="Inzending wissen"
                                  >
                                    <span className="material-symbols-outlined text-base">delete</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ─── 4. MODAL: DETAILS VAN EEN INZENDING ────────────────────────────── */}
      {selectedSubmission && activeForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl w-full max-w-xl overflow-hidden my-8 border border-slate-200 dark:border-slate-700">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Inzending Details</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ontvangen op {new Date(selectedSubmission.createdAt).toLocaleString('nl-BE')}
                </p>
              </div>
              <button
                onClick={() => setSelectedSubmission(null)}
                className="size-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
              {/* Betaalstatus Sectie */}
              <div className="py-3 first:pt-0">
                <span className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Betaalstatus</span>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border bg-slate-50/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700">
                  <div className="flex items-start gap-2.5">
                    <span className={`material-symbols-outlined text-2xl shrink-0 mt-0.5 ${selectedSubmission.isPaid ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {selectedSubmission.isPaid ? 'check_circle' : 'schedule'}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold ${selectedSubmission.isPaid ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                          {selectedSubmission.isPaid ? 'Betaald' : 'Nog niet betaald'}
                        </span>
                        {activeForm.paymentAmount && activeForm.paymentAmount > 0 ? (
                          <span className="text-[11px] font-semibold text-slate-500">
                            (€{Number(activeForm.paymentAmount).toFixed(2)})
                          </span>
                        ) : null}
                        {isLeidingSubmission(selectedSubmission, activeForm.fields) && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60">
                            Leiding
                          </span>
                        )}
                      </div>
                      {selectedSubmission.isPaid && selectedSubmission.paidAt && (
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          Betaald op {new Date(selectedSubmission.paidAt).toLocaleString('nl-BE')}
                        </span>
                      )}
                      {selectedSubmission.paymentNotes && (
                        <span className="text-xs text-slate-600 dark:text-slate-300 italic block mt-1">
                          Notitie: {selectedSubmission.paymentNotes}
                        </span>
                      )}
                      {isLeidingSubmission(selectedSubmission, activeForm.fields) && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-medium">
                          <span className="material-symbols-outlined text-base">sports_bar</span>
                          <span>
                            Drankforfait: <strong className="font-bold">€{Number(selectedSubmission.drankBijdrage) || 0}</strong>{' '}
                            ({Number(selectedSubmission.drankBijdrage) === 10 ? '2 dagen alcohol' : Number(selectedSubmission.drankBijdrage) === 5 ? '1 dag alcohol' : 'Geen alcohol'})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {isLeidingSubmission(selectedSubmission, activeForm.fields) ? (
                    <button
                      type="button"
                      onClick={() => openLeidingPaymentModal(selectedSubmission)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap self-start sm:self-center bg-amber-500 hover:bg-amber-600 text-white shadow-xs flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">edit</span>
                      <span>Status & Drank wijzigen</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleTogglePayment(selectedSubmission.id, !!selectedSubmission.isPaid)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap self-start sm:self-center ${
                        selectedSubmission.isPaid
                          ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/50'
                          : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/50'
                      }`}
                    >
                      {selectedSubmission.isPaid ? 'Markeer als onbetaald' : 'Markeer als betaald'}
                    </button>
                  )}
                </div>
              </div>

              {selectedSubmission.respondentEmail && (
                <div className="py-3">
                  <span className="block text-xs font-bold uppercase text-slate-400 mb-1">Respondent E-mail</span>
                  <span className="font-semibold text-primary">{selectedSubmission.respondentEmail}</span>
                </div>
              )}

              {(activeForm.fields || []).map(f => {
                const answer = selectedSubmission.data[f.id];
                let display = 'Niet ingevuld';
                if (answer !== undefined && answer !== null && answer !== '') {
                  display = Array.isArray(answer) ? answer.join(', ') : String(answer);
                }
                return (
                  <div key={f.id} className="py-3">
                    <span className="block text-xs font-bold uppercase text-slate-400 mb-1">{f.label}</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100 whitespace-pre-line">
                      {display}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  setSubmissionToEdit(selectedSubmission);
                  setSelectedSubmission(null);
                }}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                <span>Inschrijving Aanpassen</span>
              </button>

              <button
                onClick={() => setSelectedSubmission(null)}
                className="px-5 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 font-bold text-xs rounded-xl text-slate-700 dark:text-white cursor-pointer"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 5. MODAL: INSCHRIJVING BEWERKEN ───────────────────────────────── */}
      {submissionToEdit && activeForm && (
        <EditSubmissionModal
          open={Boolean(submissionToEdit)}
          submission={submissionToEdit}
          form={activeForm}
          onClose={() => setSubmissionToEdit(null)}
          onSave={handleSaveEditedSubmission}
        />
      )}

      {/* ─── 6. MODAL: SJABLOON SELECTIE VOOR NIEUW FORMULIER ──────────────── */}
      {showTemplateModal && (
        <TemplateSelectModal
          open={showTemplateModal}
          onClose={() => setShowTemplateModal(false)}
          onSelectTemplate={handleSelectTemplate}
          targetWerkjaar={selectedWerkjaar}
          existingForms={forms}
        />
      )}

      {/* ─── 7. BEVESTIGINGSMODAL VOOR VERWIJDEREN ──────────────────────────── */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-700">
            <div className="size-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-2xl">delete</span>
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white text-center mb-2">
              {itemToDelete.type === 'form' ? 'Formulier definitief verwijderen?' : 'Inzending verwijderen?'}
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-center text-sm mb-6">
              {itemToDelete.type === 'form'
                ? 'Weet je zeker dat je dit formulier en alle bijbehorende inzendingen wilt wissen? Dit kan niet ongedaan worden gemaakt.'
                : 'Weet je zeker dat je deze inzending wilt wissen?'}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-colors cursor-pointer"
              >
                Ja, verwijderen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 8. PRINTBARE & DOWNLOADBARE DEELNEMERSLIJST MODAL ───────────── */}
      {showPrintModal && activeForm && (
        <ParticipantListModal
          open={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          form={activeForm}
          submissions={filteredSubmissions}
        />
      )}

      {/* ─── 9. 1-KLIK BETAALHERINNERING MODAL ─────────────────────────────── */}
      {showReminderModal && activeForm && (
        <PaymentReminderModal
          open={showReminderModal}
          onClose={() => setShowReminderModal(false)}
          form={activeForm}
          submissions={submissions}
          onConfirmSend={handleSendPaymentReminders}
          sending={sendingReminders}
        />
      )}

      {/* ─── 10. POPUP: BETALING & DRANKBIJDRAGE LEIDING ─────────────────────── */}
      {editingLeidingPaymentSub && activeForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700 animate-in zoom-in-95">
            {/* Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50/70 dark:bg-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <span className="material-symbols-outlined text-xl">sports_bar</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Betaling & Drankbijdrage</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                      Leiding
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {editingLeidingPaymentSub.respondentEmail || `Inzending #${editingLeidingPaymentSub.id}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingLeidingPaymentSub(null)}
                className="size-8 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 text-xs">
              {/* Betaalstatus toggle */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  1. Betaalstatus Inschrijving
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLeidingPaidVal(true)}
                    className={`p-3 rounded-2xl border text-center font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      leidingPaidVal
                        ? 'bg-emerald-500 border-emerald-500 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">check_circle</span>
                    <span>Betaald {activeForm.paymentAmount ? `(€${Number(activeForm.paymentAmount).toFixed(2)})` : ''}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeidingPaidVal(false)}
                    className={`p-3 rounded-2xl border text-center font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      !leidingPaidVal
                        ? 'bg-amber-500 border-amber-500 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">schedule</span>
                    <span>Nog te betalen</span>
                  </button>
                </div>
              </div>

              {/* Drankbijdrage opties: 0, 5, 10 euro */}
              <div className="p-3.5 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 rounded-2xl space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                  2. Drankbijdrage Leiding (Forfait) *
                </label>
                <p className="text-[11px] text-amber-800/80 dark:text-amber-400">
                  Duid aan welk forfait deze leiding heeft overgeschreven voor drank. Wordt automatisch gekoppeld aan de kas op /financien.
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[
                    { val: 0, icon: 'block', title: '0 €', desc: 'Geen alcohol' },
                    { val: 5, icon: 'sports_bar', title: '5 €', desc: '1 dag alcohol' },
                    { val: 10, icon: 'sports_bar', title: '10 €', desc: '2 dagen alcohol' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setLeidingDrankVal(opt.val)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                        leidingDrankVal === opt.val
                          ? 'border-amber-500 bg-amber-500 text-white font-bold shadow-xs ring-2 ring-amber-500/30'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-amber-300'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-lg mb-0.5 ${leidingDrankVal === opt.val ? 'text-white' : 'text-amber-600'}`}>
                        {opt.icon}
                      </span>
                      <span className="text-sm font-black">{opt.title}</span>
                      <span className={`text-[10px] leading-tight mt-0.5 ${leidingDrankVal === opt.val ? 'text-amber-100' : 'text-slate-400'}`}>
                        {opt.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notitie */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Opmerking / Betaalnotitie (optioneel)
                </label>
                <input
                  type="text"
                  value={leidingNotesVal}
                  onChange={e => setLeidingNotesVal(e.target.value)}
                  placeholder="bv. Overgeschreven via Payconiq / Samen met inschrijving"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-xs outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50/50 dark:bg-slate-850">
              <button
                type="button"
                onClick={() => setEditingLeidingPaymentSub(null)}
                disabled={savingLeidingPayment}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 font-bold text-xs rounded-xl text-slate-700 dark:text-white transition-colors cursor-pointer"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={handleSaveLeidingPayment}
                disabled={savingLeidingPayment}
                className="px-5 py-2 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {savingLeidingPayment ? (
                  <>
                    <div className="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Opslaan...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">save</span>
                    <span>Opslaan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
