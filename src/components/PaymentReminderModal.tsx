import React, { useEffect } from 'react';
import { Form, FormSubmission } from '../types/form';

interface PaymentReminderModalProps {
  open: boolean;
  onClose: () => void;
  form: Form;
  submissions: FormSubmission[];
  onConfirmSend: () => Promise<void>;
  sending: boolean;
}

export default function PaymentReminderModal({
  open,
  onClose,
  form,
  submissions,
  onConfirmSend,
  sending,
}: PaymentReminderModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    if (open) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, sending]);

  if (!open) return null;

  const unpaid = submissions.filter(s => !s.isPaid);
  const unpaidWithEmail = unpaid.filter(s => s.respondentEmail && s.respondentEmail.includes('@'));
  const unpaidWithoutEmail = unpaid.filter(s => !s.respondentEmail || !s.respondentEmail.includes('@'));
  const totalAmount = unpaid.length * Number(form.paymentAmount || 0);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden my-6 border border-slate-200 dark:border-slate-700 max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50/70 dark:bg-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">forward_to_inbox</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Betaalherinnering Versturen
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {form.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={sending}
            onClick={onClose}
            className="size-9 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Inhoud */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {!form.paymentIban && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
              <span className="material-symbols-outlined text-base shrink-0 text-amber-600 mt-0.5">warning</span>
              <div>
                <strong className="block font-bold">Geen IBAN rekeningnummer ingesteld</strong>
                <span>
                  Er is nog geen IBAN rekeningnummer ingevuld voor dit formulier. Bewerk het formulier via het potlood-icoon en stel een IBAN in onder &apos;Betaaloptie / Gewestkas&apos; om betalingsherinneringen te kunnen versturen.
                </span>
              </div>
            </div>
          )}

          {/* Statistieken overzicht */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-center">
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 block uppercase tracking-wider">
                Niet-Betaald
              </span>
              <span className="text-2xl font-black text-amber-900 dark:text-amber-200 mt-0.5 block">
                {unpaid.length}
              </span>
              <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80 font-medium">
                €{totalAmount.toFixed(2)} open
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 text-center">
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 block uppercase tracking-wider">
                Krijgen Mail
              </span>
              <span className="text-2xl font-black text-emerald-900 dark:text-emerald-200 mt-0.5 block">
                {unpaidWithEmail.length}
              </span>
              <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 font-medium">
                met e-mailadres
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 text-center">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
                Geen E-mail
              </span>
              <span className="text-2xl font-black text-slate-700 dark:text-slate-300 mt-0.5 block">
                {unpaidWithoutEmail.length}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                overgeslagen
              </span>
            </div>
          </div>

          {unpaid.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-emerald-300 dark:border-emerald-800 rounded-2xl bg-emerald-50/40 dark:bg-emerald-950/20">
              <span className="material-symbols-outlined text-3xl text-emerald-600 dark:text-emerald-400 mb-1">
                check_circle
              </span>
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
                Geweldig! Alle deelnemers hebben reeds betaald.
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                Er hoeven geen herinneringen verzonden te worden.
              </p>
            </div>
          ) : (
            <>
              {/* E-mail Preview Box */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50/50 dark:bg-slate-900/30">
                <div className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700/60 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">mail</span>
                    <span>Voorbeeld van de e-mail</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">no-reply@reinaertland.be</span>
                </div>

                <div className="p-4 space-y-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
                  <div>
                    <span className="text-slate-400 font-bold block mb-0.5">Onderwerp:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      Betaalherinnering: {form.title} - Gewest Reinaertland
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2">
                    <p>Beste deelnemer,</p>
                    <p>
                      We kijken ernaar uit je te zien op <strong>{form.title}</strong>!
                      Volgens onze administratie staat het inschrijvingsgeld van <strong>€{Number(form.paymentAmount || 0).toFixed(2)}</strong> momenteel nog open.
                    </p>
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-orange-200 dark:border-slate-700 text-[11px] space-y-1">
                      <div><strong>IBAN:</strong> <span className="font-mono">{form.paymentIban || 'Gewestkas'}</span></div>
                      <div><strong>Mededeling:</strong> {form.paymentMessage || form.title}</div>
                      <div><strong>Bedrag:</strong> €{Number(form.paymentAmount || 0).toFixed(2)}</div>
                    </div>
                    <p className="text-[11px] text-slate-500 italic">
                      Inclusief directe link naar de online Payconiq &amp; QR-code betaalpagina.
                    </p>
                  </div>
                </div>
              </div>

              {unpaidWithoutEmail.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-700/50 text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-slate-400">info</span>
                  <span>
                    {unpaidWithoutEmail.length} van de {unpaid.length} openstaande inschrijvingen hebben geen e-mailadres en worden overgeslagen.
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actieknoppen */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 flex justify-between items-center">
          <button
            type="button"
            disabled={sending}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 font-bold text-xs text-slate-700 dark:text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
          >
            Annuleren
          </button>

          <button
            type="button"
            disabled={sending || unpaidWithEmail.length === 0 || !form.paymentIban}
            onClick={onConfirmSend}
            title={!form.paymentIban ? 'Stel eerst een IBAN in bij het formulier' : undefined}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-base">
              {sending ? 'hourglass_top' : 'send'}
            </span>
            <span>
              {sending
                ? 'Bezig met verzenden...'
                : `Verstuur Herinnering (${unpaidWithEmail.length})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
