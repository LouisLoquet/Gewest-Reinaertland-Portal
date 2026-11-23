import React, { useState, useMemo, useEffect } from 'react';
import { Form, FormSubmission, REINAERTLAND_GROUPS } from '../types/form';
import { isLeidingSubmission, getFieldAnswer } from '../utils/participantPdf';

interface ReportForm {
  id: number;
  title: string;
  description?: string;
  isOpen: boolean;
  werkjaar: string;
  requirePayment: boolean;
  paymentAmount: number;
  fields: any[];
}

interface ReportSubmission {
  id: number;
  formId: number;
  formTitle: string;
  werkjaar: string;
  data: Record<string, any>;
  respondentEmail?: string | null;
  isPaid: boolean;
  paidAt?: string | null;
  createdAt: string;
}

interface FormulierenRapportageProps {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  availableWerkjaren: string[];
  currentWerkjaar: string;
  onSelectFormForSubmissions?: (formId: number) => void;
}

export default function FormulierenRapportage({
  authFetch,
  availableWerkjaren,
  currentWerkjaar,
  onSelectFormForSubmissions,
}: FormulierenRapportageProps) {
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<ReportForm[]>([]);
  const [submissions, setSubmissions] = useState<ReportSubmission[]>([]);
  const [selectedWerkjaar, setSelectedWerkjaar] = useState<string>(currentWerkjaar);
  const [selectedChiroFilter, setSelectedChiroFilter] = useState<string | null>(null);

  useEffect(() => {
    async function loadReports() {
      setLoading(true);
      try {
        const res = await authFetch('/api/forms-reports');
        if (res.ok) {
          const data = await res.json();
          setForms(data.forms || []);
          setSubmissions(data.submissions || []);
        }
      } catch (err) {
        console.error('Fout bij ophalen rapportage data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadReports();
  }, [authFetch]);

  // Werkjaren opties (strikt vanaf 2026-2027)
  const allWerkjaren = useMemo(() => {
    const set = new Set<string>();
    availableWerkjaren.filter(w => w >= '2026-2027').forEach(w => set.add(w));
    forms.forEach(f => {
      if (f.werkjaar && f.werkjaar >= '2026-2027') set.add(f.werkjaar);
    });
    submissions.forEach(s => {
      if (s.werkjaar && s.werkjaar >= '2026-2027') set.add(s.werkjaar);
    });
    if (set.size === 0) set.add('2026-2027');
    return Array.from(set).sort().reverse();
  }, [availableWerkjaren, forms, submissions]);

  // Gefilterde data op basis van werkjaar
  const filteredForms = useMemo(() => {
    if (selectedWerkjaar === 'all') return forms;
    return forms.filter(f => f.werkjaar === selectedWerkjaar);
  }, [forms, selectedWerkjaar]);

  const filteredSubmissions = useMemo(() => {
    if (selectedWerkjaar === 'all') return submissions;
    return submissions.filter(s => s.werkjaar === selectedWerkjaar);
  }, [submissions, selectedWerkjaar]);

  // Helper om de Chirogroep van een inzending te bepalen
  const getSubmissionChiro = (sub: ReportSubmission): string => {
    const formFields = forms.find(f => f.id === sub.formId)?.fields || [];
    if (isLeidingSubmission(sub as unknown as FormSubmission, formFields)) {
      return 'LEIDING';
    }
    const grp = getFieldAnswer(sub as unknown as FormSubmission, formFields, ['groep', 'chirogroep', 'afdeling', 'chiro']);
    if (!grp) return 'Onbekend / Geen';

    // Probeer te matchen met bekende Reinaertland Chiro's
    for (const known of REINAERTLAND_GROUPS) {
      const simplifiedKnown = known.toLowerCase().replace(/[^a-z]/g, '');
      const simplifiedGrp = grp.toLowerCase().replace(/[^a-z]/g, '');
      if (simplifiedGrp.includes(simplifiedKnown) || simplifiedKnown.includes(simplifiedGrp)) {
        return known;
      }
    }
    return grp;
  };

  // KPIs
  const totalSubmissions = filteredSubmissions.length;

  const leidingCount = useMemo(() => {
    return filteredSubmissions.filter(s => {
      const formFields = forms.find(f => f.id === subFormId(s))?.fields || [];
      return isLeidingSubmission(s as unknown as FormSubmission, formFields);
    }).length;
  }, [filteredSubmissions, forms]);

  function subFormId(s: ReportSubmission) {
    return s.formId;
  }

  const ledenCount = totalSubmissions - leidingCount;

  // Inkomsten
  const totalRevenue = useMemo(() => {
    return filteredSubmissions.reduce((acc, sub) => {
      if (!sub.isPaid) return acc;
      const f = forms.find(item => item.id === sub.formId);
      return acc + (Number(f?.paymentAmount) || 0);
    }, 0);
  }, [filteredSubmissions, forms]);

  const paidCount = useMemo(() => filteredSubmissions.filter(s => s.isPaid).length, [filteredSubmissions]);

  // Chiro Leaderboard / Rangschikking
  const chiroStats = useMemo(() => {
    const map: Record<string, { total: number; leden: number; leiding: number; events: Set<string> }> = {};

    // Initialiseer alle 9 officiële Reinaertland Chiro's
    REINAERTLAND_GROUPS.forEach(g => {
      map[g] = { total: 0, leden: 0, leiding: 0, events: new Set() };
    });
    map['LEIDING'] = { total: 0, leden: 0, leiding: 0, events: new Set() };

    filteredSubmissions.forEach(sub => {
      const chiro = getSubmissionChiro(sub);
      if (!map[chiro]) {
        map[chiro] = { total: 0, leden: 0, leiding: 0, events: new Set() };
      }
      map[chiro].total++;
      if (chiro === 'LEIDING') {
        map[chiro].leiding++;
      } else {
        map[chiro].leden++;
      }
      if (sub.formTitle) map[chiro].events.add(sub.formTitle);
    });

    const entries = Object.entries(map).map(([chiro, data]) => ({
      chiro,
      total: data.total,
      leden: data.leden,
      leiding: data.leiding,
      eventsCount: data.events.size,
      percent: totalSubmissions > 0 ? (data.total / totalSubmissions) * 100 : 0,
    }));

    // Sorteer op aantal deelnemers aflopend
    return entries.sort((a, b) => b.total - a.total);
  }, [filteredSubmissions, forms, totalSubmissions]);

  const topChiro = chiroStats.find(c => c.chiro !== 'LEIDING' && c.total > 0) || chiroStats[0];

  // Inschrijvingen per formulier / evenement
  const eventStats = useMemo(() => {
    return filteredForms.map(form => {
      const subs = filteredSubmissions.filter(s => s.formId === form.id);
      const isGewestweekend = (form.title || '').toLowerCase().includes('gewestweekend');
      const capacity = isGewestweekend ? 150 : undefined;
      const formPaid = subs.filter(s => s.isPaid).length;

      // Zoek populairste chiro voor dit formulier
      const formChiroMap: Record<string, number> = {};
      subs.forEach(s => {
        const c = getSubmissionChiro(s);
        if (c !== 'LEIDING') {
          formChiroMap[c] = (formChiroMap[c] || 0) + 1;
        }
      });
      const topForEvent = Object.entries(formChiroMap).sort((a, b) => b[1] - a[1])[0];

      return {
        form,
        total: subs.length,
        capacity,
        capacityPercent: capacity ? Math.min(100, (subs.length / capacity) * 100) : undefined,
        paidCount: formPaid,
        paidRevenue: formPaid * (Number(form.paymentAmount) || 0),
        topChiro: topForEvent ? `${topForEvent[0]} (${topForEvent[1]})` : 'Geen data',
      };
    });
  }, [filteredForms, filteredSubmissions]);

  // Meerjarige trend (vergelijking over alle werkjaren)
  const yearlyTrend = useMemo(() => {
    const map: Record<string, { werkjaar: string; total: number; formsCount: number; revenue: number }> = {};
    allWerkjaren.forEach(wj => {
      map[wj] = { werkjaar: wj, total: 0, formsCount: 0, revenue: 0 };
    });

    forms.forEach(f => {
      const wj = f.werkjaar;
      if (wj && map[wj]) map[wj].formsCount++;
    });

    submissions.forEach(s => {
      const wj = s.werkjaar;
      if (wj && map[wj]) {
        map[wj].total++;
        if (s.isPaid) {
          const f = forms.find(item => item.id === s.formId);
          map[wj].revenue += Number(f?.paymentAmount) || 0;
        }
      }
    });

    return Object.values(map).sort((a, b) => a.werkjaar.localeCompare(b.werkjaar));
  }, [allWerkjaren, forms, submissions]);

  // Export samenvattend rapport als CSV
  const handleExportCsv = () => {
    const rows = [
      ['CHIRO GEWEST REINAERTLAND - RAPPORTAGE INSCHRIJVINGEN'],
      [`Werkjaar: ${selectedWerkjaar === 'all' ? 'Alle Werkjaren' : selectedWerkjaar}`],
      [`Totaal inschrijvingen: ${totalSubmissions} (Leden: ${ledenCount}, Leiding: ${leidingCount})`],
      [`Totaal ontvangen inschrijvingsgeld: €${totalRevenue.toFixed(2)}`],
      [],
      ['RANGSCHIKKING CHIROGROEPEN'],
      ['Plaats', 'Chirogroep', 'Totaal Deelnemers', 'Leden', 'Leiding', 'Aandeel %'],
      ...chiroStats.map((c, i) => [
        i + 1,
        c.chiro,
        c.total,
        c.leden,
        c.leiding,
        `${c.percent.toFixed(1)}%`,
      ]),
      [],
      ['EVENEMENTEN & FORMULIEREN'],
      ['Titel', 'Aantal Inschrijvingen', 'Capaciteit (Doel)', 'Betaald', 'Opbrengst (€)', 'Top Chiro'],
      ...eventStats.map(e => [
        e.form.title,
        e.total,
        e.capacity ? `${e.total}/${e.capacity}` : 'Geen limiet',
        `${e.paidCount}/${e.total}`,
        `€${e.paidRevenue.toFixed(2)}`,
        e.topChiro,
      ]),
    ];

    const csvContent = '\uFEFF' + rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Rapportage_Inschrijvingen_Gewest_Reinaertland_${selectedWerkjaar}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse py-8">
        <div className="h-28 bg-slate-100 dark:bg-slate-800 rounded-3xl"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl"></div>
          ))}
        </div>
        <div className="h-96 bg-slate-100 dark:bg-slate-800 rounded-3xl"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* ─── HEADER & WERKJAAR NAVIGATOR ──────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-orange-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 size-64 bg-primary/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-orange-300 text-xs font-bold mb-3 border border-white/10 backdrop-blur-sm">
              <span className="material-symbols-outlined text-sm">insights</span>
              <span>Inschrijvingen & Deelnemers Dashboard</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
              Rapportage & Statistieken
            </h2>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Gedetailleerde inzichten per werkjaar, capaciteitsopvolging van gewestweekenden en de Chiro-kampioensranglijst.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-white/10 backdrop-blur-md p-1.5 rounded-2xl border border-white/20 flex items-center gap-2">
              <span className="material-symbols-outlined text-orange-400 pl-2 text-lg">calendar_month</span>
              <select
                value={selectedWerkjaar}
                onChange={e => setSelectedWerkjaar(e.target.value)}
                className="bg-transparent text-white font-bold text-sm pr-3 py-1 outline-none cursor-pointer [&>option]:text-slate-900"
              >
                <option value="all">Alle werkjaren samen</option>
                {allWerkjaren.map(wj => (
                  <option key={wj} value={wj}>
                    Werkjaar {wj}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Exporteer volledig rapport naar Excel/CSV"
            >
              <span className="material-symbols-outlined text-base">file_download</span>
              <span>Download CSV Rapport</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── KPI KAARTEN ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Totaal Inschrijvingen */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Totaal Inschrijvingen
            </span>
            <div className="size-9 rounded-xl bg-orange-50 dark:bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">groups</span>
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white">
            {totalSubmissions}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-bold text-slate-700 dark:text-slate-200">{ledenCount} leden</span>
            <span>•</span>
            <span className="font-bold text-primary">{leidingCount} leiding</span>
          </div>
        </div>

        {/* KPI 2: Chiro Kampioen */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Grootste Chiro Delegatie
            </span>
            <div className="size-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">emoji_events</span>
            </div>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white truncate" title={topChiro ? topChiro.chiro : 'Geen data'}>
            {topChiro && topChiro.total > 0 ? topChiro.chiro.split(',')[0] : 'Nog geen inschrijvingen'}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {topChiro && topChiro.total > 0 ? (
              <span className="font-bold text-amber-600 dark:text-amber-400">
                {topChiro.total} deelnemers ({topChiro.percent.toFixed(1)}% van totaal)
              </span>
            ) : (
              'Wacht op eerste inschrijving'
            )}
          </p>
        </div>

        {/* KPI 3: Gewestweekend Totaal */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Gewestweekend Deelnemers
            </span>
            <div className="size-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">camping</span>
            </div>
          </div>
          {(() => {
            const gwSubs = filteredSubmissions.filter(s => (s.formTitle || '').toLowerCase().includes('gewestweekend'));
            const gwCount = gwSubs.length;
            const target = 450; // 3 forms x 150
            return (
              <>
                <div className="text-3xl font-black text-slate-900 dark:text-white">
                  {gwCount}
                  <span className="text-sm font-semibold text-slate-400 ml-1.5">/ 450 max</span>
                </div>
                <div className="mt-2 w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, (gwCount / target) * 100)}%` }}
                  />
                </div>
              </>
            );
          })()}
        </div>

        {/* KPI 4: Ingeschreven gelden */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Ontvangen Inschrijfgeld
            </span>
            <div className="size-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">payments</span>
            </div>
          </div>
          <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
            €{totalRevenue.toFixed(2)}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-bold text-slate-700 dark:text-slate-300">{paidCount}</span> van de {totalSubmissions} betaald
          </p>
        </div>
      </div>

      {/* ─── CHIRO RANGSCHIKKING & LEADERBOARD ("ZOT DOEN") ───────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500 text-2xl">trophy</span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Chiro Rangschikking & Leaderboard
              </h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
              Welke Chirogroep vaardigde de meeste deelnemers af in {selectedWerkjaar === 'all' ? 'alle jaren' : `werkjaar ${selectedWerkjaar}`}?
            </p>
          </div>

          {selectedChiroFilter && (
            <button
              type="button"
              onClick={() => setSelectedChiroFilter(null)}
              className="text-xs text-primary font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">filter_alt_off</span>
              Filter wissen ({selectedChiroFilter})
            </button>
          )}
        </div>

        {/* PODIUM TOP 3 */}
        {chiroStats.filter(c => c.total > 0).length >= 2 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 pb-4">
            {/* 2e Plaats (Zilver) */}
            {chiroStats[1] && (
              <div className="order-2 sm:order-1 bg-gradient-to-b from-slate-100 to-slate-50 dark:from-slate-700/60 dark:to-slate-800/80 rounded-2xl p-5 border border-slate-200 dark:border-slate-600 text-center flex flex-col justify-between">
                <div>
                  <span className="text-3xl mb-1 inline-block">🥈</span>
                  <div className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">2e Plaats</div>
                  <h4 className="text-lg font-bold text-slate-800 dark:text-white mt-1">
                    {chiroStats[1].chiro}
                  </h4>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-600">
                  <span className="text-2xl font-black text-slate-800 dark:text-white">{chiroStats[1].total}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">{chiroStats[1].percent.toFixed(1)}% van alle deelnemers</span>
                </div>
              </div>
            )}

            {/* 1e Plaats (Goud) */}
            {chiroStats[0] && (
              <div className="order-1 sm:order-2 bg-gradient-to-b from-amber-100/70 via-amber-50/50 to-white dark:from-amber-950/40 dark:via-slate-800 dark:to-slate-800 rounded-2xl p-6 border-2 border-amber-400 dark:border-amber-500 shadow-md text-center flex flex-col justify-between sm:-mt-3">
                <div>
                  <span className="text-4xl mb-1 inline-block animate-bounce">👑</span>
                  <div className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">1e Plaats • Kampioen</div>
                  <h4 className="text-xl font-black text-slate-900 dark:text-white mt-1">
                    {chiroStats[0].chiro}
                  </h4>
                </div>
                <div className="mt-4 pt-3 border-t border-amber-200 dark:border-amber-700/60">
                  <span className="text-3xl font-black text-amber-600 dark:text-amber-400">{chiroStats[0].total}</span>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 block">{chiroStats[0].percent.toFixed(1)}% van alle deelnemers</span>
                </div>
              </div>
            )}

            {/* 3e Plaats (Brons) */}
            {chiroStats[2] && (
              <div className="order-3 bg-gradient-to-b from-orange-100/50 to-slate-50 dark:from-orange-950/30 dark:to-slate-800/80 rounded-2xl p-5 border border-orange-200 dark:border-slate-600 text-center flex flex-col justify-between">
                <div>
                  <span className="text-3xl mb-1 inline-block">🥉</span>
                  <div className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-500">3e Plaats</div>
                  <h4 className="text-lg font-bold text-slate-800 dark:text-white mt-1">
                    {chiroStats[2].chiro}
                  </h4>
                </div>
                <div className="mt-4 pt-3 border-t border-orange-200 dark:border-slate-600">
                  <span className="text-2xl font-black text-slate-800 dark:text-white">{chiroStats[2].total}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">{chiroStats[2].percent.toFixed(1)}% van alle deelnemers</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VOLLEDIGE TABEL MET BALKENVOORTGANG */}
        <div className="space-y-3 pt-2">
          {chiroStats.map((item, idx) => {
            const isTop3 = idx < 3 && item.total > 0;
            return (
              <div
                key={item.chiro}
                className="p-3.5 sm:p-4 rounded-2xl border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors flex flex-col gap-2 cursor-pointer"
                onClick={() => setSelectedChiroFilter(selectedChiroFilter === item.chiro ? null : item.chiro)}
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`size-6 rounded-full flex items-center justify-center text-xs font-black ${
                        idx === 0
                          ? 'bg-amber-400 text-slate-900'
                          : idx === 1
                          ? 'bg-slate-300 text-slate-800'
                          : idx === 2
                          ? 'bg-orange-300 text-slate-900'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="font-bold text-slate-800 dark:text-white">
                      {item.chiro}
                    </span>
                    {item.chiro === 'LEIDING' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                        Begeleiding
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {item.total} <span className="text-xs font-normal text-slate-400">({item.percent.toFixed(1)}%)</span>
                    </span>
                  </div>
                </div>

                {/* Voortgangsbalk */}
                <div className="w-full bg-slate-100 dark:bg-slate-700/60 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      idx === 0
                        ? 'bg-amber-500'
                        : isTop3
                        ? 'bg-orange-500'
                        : item.chiro === 'LEIDING'
                        ? 'bg-slate-700 dark:bg-slate-400'
                        : 'bg-primary/70'
                    }`}
                    style={{ width: `${Math.max(2, item.percent)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── INSCHRIJVINGEN PER EVENEMENT IN DIT WERKJAAR ───────────── */}
      <div className="space-y-4">
        <div>
          <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">event_available</span>
            <span>Inschrijvingen per Evenement ({selectedWerkjaar === 'all' ? 'Alle Jaren' : selectedWerkjaar})</span>
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Overzicht van alle formulieren en de bezettingsgraad voor gewestactiviteiten.
          </p>
        </div>

        {eventStats.length === 0 ? (
          <div className="p-8 text-center bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 text-sm">
            Geen formulieren gevonden voor werkjaar {selectedWerkjaar}.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {eventStats.map(item => (
              <div
                key={item.form.id}
                className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        item.form.isOpen
                          ? 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {item.form.isOpen ? 'Open voor reacties' : 'Gesloten'}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">
                      Werkjaar {item.form.werkjaar}
                    </span>
                  </div>

                  <h4 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                    {item.form.title}
                  </h4>

                  {/* Capaciteit of aantal */}
                  <div className="mt-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-semibold">Deelnemersaantal:</span>
                      <span className="font-black text-slate-900 dark:text-white text-sm">
                        {item.total} {item.capacity && <span className="text-slate-400 font-normal">/ {item.capacity}</span>}
                      </span>
                    </div>

                    {item.capacity && (
                      <div>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              (item.capacityPercent || 0) >= 90
                                ? 'bg-rose-500'
                                : (item.capacityPercent || 0) >= 70
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${item.capacityPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-1 text-right">
                          {item.capacityPercent?.toFixed(0)}% van 150 bezet
                        </span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400">Meeste inschrijvingen:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200 truncate max-w-[150px]">
                        {item.topChiro}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
                  {(item.form.requirePayment || item.paidRevenue > 0) && (
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      €{item.paidRevenue.toFixed(2)} betaald
                    </span>
                  )}
                  {onSelectFormForSubmissions && (
                    <button
                      type="button"
                      onClick={() => onSelectFormForSubmissions(item.form.id)}
                      className="ml-auto px-3.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <span>Bekijk Deelnemers</span>
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── HISTORISCHE VERGELIJKING OVER DE JAREN HEEN ─────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 shadow-sm space-y-6">
        <div>
          <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-orange-500">bar_chart</span>
            <span>Historische Trend per Werkjaar</span>
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Vergelijk het totaal aantal inschrijvingen en opbrengsten over opeenvolgende Chiro-werkjaren.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {yearlyTrend.map(y => (
            <div
              key={y.werkjaar}
              className={`p-5 rounded-2xl border transition-all ${
                y.werkjaar === selectedWerkjaar
                  ? 'bg-primary/5 border-primary/40 ring-2 ring-primary/20'
                  : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="text-xs font-bold text-slate-400 uppercase">Werkjaar {y.werkjaar}</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {y.total} <span className="text-xs font-normal text-slate-400">inschrijvingen</span>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">{y.formsCount} formulieren</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">€{y.revenue.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
