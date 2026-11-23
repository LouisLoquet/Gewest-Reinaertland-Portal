import React, { useState, useEffect } from 'react';
import { Form, FormField, FormSubmission, REINAERTLAND_GROUPS } from '../types/form';
import { REINAERTLAND_GROUPS_WITH_LEIDING } from '../utils/formTemplates';
import { isLeidingSubmission } from '../utils/participantPdf';

interface EditSubmissionModalProps {
  open: boolean;
  submission: FormSubmission | null;
  form: Form;
  onClose: () => void;
  onSave: (
    updatedData: Record<string, any>,
    respondentEmail: string,
    isPaid: boolean,
    paymentNotes: string,
    drankBijdrage?: number
  ) => Promise<boolean>;
}

export default function EditSubmissionModal({
  open,
  submission,
  form,
  onClose,
  onSave,
}: EditSubmissionModalProps) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [respondentEmail, setRespondentEmail] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [drankBijdrage, setDrankBijdrage] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isLeader = Boolean(submission && isLeidingSubmission(submission, form.fields));

  useEffect(() => {
    if (submission) {
      setFormData(submission.data ? JSON.parse(JSON.stringify(submission.data)) : {});
      setRespondentEmail(submission.respondentEmail || '');
      setIsPaid(Boolean(submission.isPaid));
      setPaymentNotes(submission.paymentNotes || '');
      setDrankBijdrage(Number(submission.drankBijdrage) || 0);
      setError('');
    }
  }, [submission]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || !submission) return null;

  const handleInputChange = (fieldId: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleCheckboxToggle = (fieldId: string, opt: string) => {
    setFormData(prev => {
      const currentList: string[] = Array.isArray(prev[fieldId]) ? [...prev[fieldId]] : [];
      if (currentList.includes(opt)) {
        return { ...prev, [fieldId]: currentList.filter(x => x !== opt) };
      } else {
        return { ...prev, [fieldId]: [...currentList, opt] };
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const ok = await onSave(
        formData,
        respondentEmail.trim(),
        isPaid,
        paymentNotes.trim(),
        isLeader ? drankBijdrage : 0
      );
      if (ok) {
        onClose();
      } else {
        setError('Fout bij opslaan van de inschrijving.');
      }
    } catch (err: any) {
      setError(err?.message || 'Er is een fout opgetreden.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden my-6 border border-slate-200 dark:border-slate-700 max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50/70 dark:bg-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">edit</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Inschrijving Aanpassen
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inzending #{submission.id} • {form.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-9 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-bold rounded-xl flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">error</span>
              <span>{error}</span>
            </div>
          )}

          <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50 rounded-2xl p-4 text-xs text-orange-800 dark:text-orange-200 flex items-start gap-2.5">
            <span className="material-symbols-outlined text-base text-orange-600 shrink-0">info</span>
            <div>
              <span>
                Pas hier de inschrijving aan indien iemand bijvoorbeeld de verkeerde Chirogroep of afdeling heeft gekozen.
                Voor leiding kies je bij groep &apos;LEIDING&apos;.
              </span>
            </div>
          </div>

          {/* Respondent E-mail */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              E-mailadres Respondent (voor bevestigingen)
            </label>
            <input
              type="email"
              value={respondentEmail}
              onChange={e => setRespondentEmail(e.target.value)}
              placeholder="bv. lid@reinaertland.be"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm outline-none focus:border-primary"
            />
          </div>

          {/* Alle velden van het formulier */}
          <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-700">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Ingevulde Antwoorden
            </h4>

            {form.fields.map(field => {
              const val = formData[field.id];
              const isGroupField = ['groep', 'chirogroep', 'afdeling', 'chiro'].some(k =>
                (field.label || '').toLowerCase().includes(k)
              );

              return (
                <div key={field.id} className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>

                  {/* SELECT */}
                  {field.type === 'select' && (
                    <select
                      value={val !== undefined && val !== null ? String(val) : ''}
                      onChange={e => handleInputChange(field.id, e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm outline-none focus:border-primary"
                    >
                      <option value="">-- Maak een keuze --</option>
                      {(field.options && field.options.length > 0
                        ? field.options
                        : isGroupField
                        ? REINAERTLAND_GROUPS_WITH_LEIDING
                        : []
                      ).map(opt => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                      {/* Zorg dat LEIDING altijd als keuze beschikbaar is voor groepsvelden */}
                      {isGroupField && !field.options?.includes('LEIDING') && (
                        <option value="LEIDING">LEIDING</option>
                      )}
                    </select>
                  )}

                  {/* RADIO */}
                  {field.type === 'radio' && (
                    <div className="space-y-2 pt-1">
                      {(field.options || []).map(opt => (
                        <label key={opt} className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                          <input
                            type="radio"
                            name={`edit_${field.id}`}
                            checked={val === opt}
                            onChange={() => handleInputChange(field.id, opt)}
                            className="size-4 text-primary focus:ring-primary border-slate-300"
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* CHECKBOX */}
                  {field.type === 'checkbox' && (
                    <div className="space-y-2 pt-1">
                      {(field.options || []).map(opt => {
                        const checked = Array.isArray(val) && val.includes(opt);
                        return (
                          <label key={opt} className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleCheckboxToggle(field.id, opt)}
                              className="size-4 rounded text-primary focus:ring-primary border-slate-300"
                            />
                            <span>{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* TEXTAREA */}
                  {field.type === 'textarea' && (
                    <textarea
                      rows={3}
                      value={val !== undefined && val !== null ? String(val) : ''}
                      onChange={e => handleInputChange(field.id, e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm outline-none focus:border-primary"
                    />
                  )}

                  {/* INPUT TEXT / EMAIL / DATE / NUMBER */}
                  {field.type !== 'select' && field.type !== 'radio' && field.type !== 'checkbox' && field.type !== 'textarea' && (
                    <input
                      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                      value={val !== undefined && val !== null ? String(val) : ''}
                      onChange={e => handleInputChange(field.id, e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm outline-none focus:border-primary"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Betaalstatus Sectie - Altijd beschikbaar zodat beheerder altijd betalingen kan aanduiden */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Betaalstatus {isLeader && '& Drankbijdrage'}
            </h4>
            <label className="flex items-center gap-2.5 cursor-pointer bg-slate-50 dark:bg-slate-700/40 p-3 rounded-xl border border-slate-200 dark:border-slate-600 hover:border-primary/40 transition-colors">
              <input
                type="checkbox"
                checked={isPaid}
                onChange={e => setIsPaid(e.target.checked)}
                className="size-4 rounded text-primary focus:ring-primary border-slate-300"
              />
              <div>
                <span className="font-bold text-slate-800 dark:text-white text-xs block">
                  Gemarkeerd als betaald{form.paymentAmount && form.paymentAmount > 0 ? ` (€${Number(form.paymentAmount).toFixed(2)})` : ''}
                </span>
                <span className="text-[11px] text-slate-400">
                  {isPaid ? 'Deelnemer heeft voldaan (in kas of overschrijving)' : 'Nog niet ontvangen op rekening of in kas'}
                </span>
              </div>
            </label>

            {/* Drankbijdrage leiding */}
            {isLeader && (
              <div className="p-3.5 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 rounded-2xl space-y-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-600 text-base">sports_bar</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                    Drankbijdrage Leiding (Forfait)
                  </span>
                </div>
                <p className="text-[11px] text-amber-800/80 dark:text-amber-400">
                  Kies het forfait voor drank (wordt automatisch gekoppeld aan de kas op /financien):
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[
                    { val: 0, label: '0 €', desc: 'Geen alcohol' },
                    { val: 5, label: '5 €', desc: '1 dag alcohol' },
                    { val: 10, label: '10 €', desc: '2 dagen alcohol' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setDrankBijdrage(opt.val)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        drankBijdrage === opt.val
                          ? 'border-amber-500 bg-amber-500 text-white font-bold shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-amber-300'
                      }`}
                    >
                      <div className="text-sm font-black">{opt.label}</div>
                      <div className={`text-[10px] leading-tight mt-0.5 ${drankBijdrage === opt.val ? 'text-amber-100' : 'text-slate-400'}`}>
                        {opt.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Betaalnotitie (bv. contant ontvangen, afwijkende mededeling)
              </label>
              <input
                type="text"
                value={paymentNotes}
                onChange={e => setPaymentNotes(e.target.value)}
                placeholder="bv. Contant betaald op startdag"
                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-xs outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Footer acties */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 font-bold text-xs rounded-xl text-slate-700 dark:text-white transition-colors cursor-pointer"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Opslaan...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">save</span>
                  <span>Wijzigingen Opslaan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
