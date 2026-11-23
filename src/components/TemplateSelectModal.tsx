import React from 'react';
import { Form } from '../types/form';
import { FORM_TEMPLATES, FormTemplateKey } from '../utils/formTemplates';

interface TemplateSelectModalProps {
  open: boolean;
  onClose: () => void;
  onSelectTemplate: (templateKey: FormTemplateKey) => void;
  targetWerkjaar: string;
  existingForms: Form[];
}

export default function TemplateSelectModal({
  open,
  onClose,
  onSelectTemplate,
  targetWerkjaar,
  existingForms,
}: TemplateSelectModalProps) {
  if (!open) return null;

  // Check of een sjabloon gegevens heeft uit een vorig jaar
  const hasPreviousData = (templateKey: FormTemplateKey): boolean => {
    if (templateKey === 'custom') return false;
    const matchKeywords: Record<string, string[]> = {
      ikaa: ['ikaa'],
      cocktailquiz: ['cocktailquiz', 'cocktail', 'quiz'],
      gewestweekend_titos: ['gewestweekend', 'tito'],
      gewestweekend_ketis: ['gewestweekend', 'keti'],
      gewestweekend_aspis: ['gewestweekend', 'aspi'],
    };
    const kws = matchKeywords[templateKey] || [];
    return existingForms.some(f => {
      const t = (f.title || '').toLowerCase();
      return kws.every(kw => t.includes(kw));
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden my-6 border border-slate-200 dark:border-slate-700 max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50/70 dark:bg-slate-800/80">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-wider mb-1">
              <span className="material-symbols-outlined text-xs">description</span>
              <span>Sjablonen Werkjaar {targetWerkjaar}</span>
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              Kies een Formulier Sjabloon
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Selecteer een standaardformulier om direct alle vragen en instellingen over te nemen.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-9 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Content: Kaarten met opties */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FORM_TEMPLATES.map(tpl => {
              const hasPrev = hasPreviousData(tpl.key);
              return (
                <div
                  key={tpl.key}
                  onClick={() => onSelectTemplate(tpl.key)}
                  className="p-5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-primary dark:hover:border-primary hover:bg-orange-50/30 dark:hover:bg-orange-950/20 transition-all cursor-pointer flex flex-col justify-between group shadow-xs hover:shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="size-10 rounded-2xl bg-orange-100 dark:bg-primary/20 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-xl">{tpl.icon}</span>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {tpl.badge}
                      </span>
                    </div>

                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                      {tpl.title}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-3">
                      {tpl.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
                    {hasPrev ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        <span className="material-symbols-outlined text-xs">history</span>
                        <span>Neemt velden van vorig jaar over</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        Standaard gewestvelden
                      </span>
                    )}

                    <span className="font-bold text-primary group-hover:translate-x-1 transition-transform inline-flex items-center gap-0.5">
                      <span>Kies</span>
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
          <span>Na selectie kun je datum, titel en prijs nog naar wens aanpassen.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            Annuleren
          </button>
        </div>
      </div>
    </div>
  );
}
