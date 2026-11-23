import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { printHtmlReport, exportElementAsImage } from '../utils/printReport';
import { safeImageUrl } from '../utils/safeUrl';

interface FinanceItem {
  id: string;
  type: 'income' | 'expense';
  category: 'inschrijving_leden' | 'inschrijving_leiding' | 'drank_forfait' | 'drank_inkomsten' | 'drank_leiding' | 'overig_inkomen' | 'uitgave';
  description: string;
  amount: number;
}

interface FinanceEvent {
  id: number;
  name: string;
  date: string;
  werkjaar: string;
  items: FinanceItem[];
  createdAt?: string;
  updatedAt?: string;
}

interface FinanceSettings {
  bankBalance: number;
  googleSheetUrl?: string;
  updatedAt?: string;
}

interface Penningmeester {
  id: number;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  roles?: string[];
  chiroGroup?: string;
}

interface AvailableForm {
  id: number;
  title: string;
  slug?: string;
  requirePayment: boolean;
  paymentAmount: number;
  totalSubmissions: number;
  paidSubmissions: number;
  totalPaidAmount: number;
  totalExpectedAmount?: number;
  ledenCount?: number;
  leidingCount?: number;
  paidLedenCount?: number;
  paidLeidingCount?: number;
  autoLedenAmount?: number;
  autoLeidingAmount?: number;
  autoDrankForfaitAmount?: number;
  totalDrankForfait?: number;
  paidDrankForfait?: number;
}

interface FinancienProps {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

export function computeWerkjaar(dateStr: string): string {
  if (!dateStr) return '2026-2027';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '2026-2027';
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();
  const calculated = month >= 10 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  return calculated < '2026-2027' ? '2026-2027' : calculated;
}

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(amount);
}

// ─────────────────────────────────────────────────────────────────────────────
// TAARTDIAGRAM / DONUT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface DonutSlice {
  label: string;
  category: string;
  amount: number;
  color: string;
  percent: number;
}

function EventDonutChart({ event, onMobileClick }: { event: FinanceEvent; onMobileClick?: () => void }) {
  const [hoveredSlice, setHoveredSlice] = useState<DonutSlice | null>(null);

  // Splits items
  const items = event.items || [];
  const leden = items.filter(i => i.category === 'inschrijving_leden').reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
  const leiding = items.filter(i => i.category === 'inschrijving_leiding').reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
  const forfaitDrank = items.filter(i => i.category === 'drank_forfait').reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
  const inkomstenDrank = items.filter(i => i.category === 'drank_inkomsten' || i.category === 'drank_leiding').reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
  const overigInkomen = items.filter(i => i.category === 'overig_inkomen').reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
  const uitgaven = items.filter(i => i.type === 'expense' || i.category === 'uitgave').reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

  const totalIncome = leden + leiding + forfaitDrank + inkomstenDrank + overigInkomen;
  const netProfit = totalIncome - uitgaven;
  const isProfit = netProfit >= 0;

  // Segmenten voor de visualisatie
  const categories: { label: string; category: string; amount: number; color: string }[] = [
    { label: 'Inschrijving leden', category: 'inschrijving_leden', amount: leden, color: '#0ea5e9' },
    { label: 'Inschrijving leiding', category: 'inschrijving_leiding', amount: leiding, color: '#6366f1' },
    { label: 'Forfait drank leiding', category: 'drank_forfait', amount: forfaitDrank, color: '#f59e0b' },
    { label: 'Inkomsten drank (tap)', category: 'drank_inkomsten', amount: inkomstenDrank, color: '#f97316' },
    { label: 'Overige inkomsten', category: 'overig_inkomen', amount: overigInkomen, color: '#10b981' },
    { label: 'Uitgaven', category: 'uitgave', amount: uitgaven, color: '#f43f5e' },
  ].filter(c => c.amount > 0);

  const grandTotal = categories.reduce((sum, c) => sum + c.amount, 0);

  const slices: DonutSlice[] = categories.map(c => ({
    ...c,
    percent: grandTotal > 0 ? (c.amount / grandTotal) * 100 : 0
  }));

  // SVG parameters
  const size = 180;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  const handleMobileTap = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768 && onMobileClick) {
      onMobileClick();
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative size-[180px] flex items-center justify-center cursor-pointer sm:cursor-default"
        onClick={handleMobileTap}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
          {/* Achtergrond cirkel */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-100 dark:text-slate-700/50"
          />
          {slices.length === 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference} ${circumference}`}
              opacity="0.3"
            />
          ) : (
            slices.map((slice, idx) => {
              const dashLength = (slice.percent / 100) * circumference;
              const dashOffset = -((accumulatedPercent / 100) * circumference);
              accumulatedPercent += slice.percent;

              return (
                <circle
                  key={idx}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={hoveredSlice?.category === slice.category ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={`${dashLength} ${circumference}`}
                  strokeDashoffset={dashOffset}
                  className="transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => setHoveredSlice(slice)}
                  onMouseLeave={() => setHoveredSlice(null)}
                  onClick={(e) => {
                    if (typeof window !== 'undefined' && window.innerWidth < 768 && onMobileClick) {
                      e.stopPropagation();
                      onMobileClick();
                    } else {
                      setHoveredSlice(hoveredSlice?.category === slice.category ? null : slice);
                    }
                  }}
                />
              );
            })
          )}
        </svg>

        {/* Winst in het midden */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 pointer-events-none">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {hoveredSlice ? hoveredSlice.label : (isProfit ? 'Nettowinst' : 'Nettoverlies')}
          </span>
          <span className={`text-base font-black tracking-tight ${
            hoveredSlice
              ? 'text-slate-900 dark:text-white'
              : (isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')
          }`}>
            {hoveredSlice ? formatEuro(hoveredSlice.amount) : formatEuro(netProfit)}
          </span>
          {hoveredSlice && (
            <span className="text-[10px] font-semibold text-slate-400">
              {hoveredSlice.percent.toFixed(1)}% van totaal
            </span>
          )}
        </div>
      </div>

      {/* Mobiele knop om menuutje met de verdeling te openen */}
      {onMobileClick && (
        <button
          type="button"
          onClick={onMobileClick}
          className="sm:hidden mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs rounded-xl transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">pie_chart</span>
          <span>Bekijk verdeling</span>
        </button>
      )}

      {/* Legenda met hover effect */}
      <div className="w-full mt-4 space-y-1.5 text-xs">
        <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 font-medium pb-1 border-b border-slate-100 dark:border-slate-800">
          <span>Totaal Inkomsten:</span>
          <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatEuro(totalIncome)}</span>
        </div>
        <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 font-medium pb-1 border-b border-slate-100 dark:border-slate-800">
          <span>Totaal Uitgaven:</span>
          <span className="font-bold text-rose-600 dark:text-rose-400">{formatEuro(uitgaven)}</span>
        </div>
        <div className="flex justify-between items-center font-bold pt-1">
          <span className="text-slate-700 dark:text-slate-300">Resultaat:</span>
          <span className={isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
            {formatEuro(netProfit)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: MOBIELE VERDELING VAN HET TAARTDIAGRAM
// ─────────────────────────────────────────────────────────────────────────────
function MobileDistributionModal({
  event,
  onClose
}: {
  event: FinanceEvent | null;
  onClose: () => void;
}) {
  if (!event) return null;

  const items = event.items || [];
  const leden = items.filter(i => i.category === 'inschrijving_leden').reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
  const leiding = items.filter(i => i.category === 'inschrijving_leiding').reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
  const forfaitDrank = items.filter(i => i.category === 'drank_forfait').reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
  const inkomstenDrank = items.filter(i => i.category === 'drank_inkomsten' || i.category === 'drank_leiding').reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
  const overigInkomen = items.filter(i => i.category === 'overig_inkomen').reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
  const uitgaven = items.filter(i => i.type === 'expense' || i.category === 'uitgave').reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

  const totalIncome = leden + leiding + forfaitDrank + inkomstenDrank + overigInkomen;
  const netProfit = totalIncome - uitgaven;
  const isProfit = netProfit >= 0;

  const categories = [
    { label: 'Inschrijving leden', amount: leden, bg: 'bg-sky-500' },
    { label: 'Inschrijving leiding', amount: leiding, bg: 'bg-indigo-500' },
    { label: 'Forfait drank leiding', amount: forfaitDrank, bg: 'bg-amber-500' },
    { label: 'Inkomsten drank (tap)', amount: inkomstenDrank, bg: 'bg-orange-500' },
    { label: 'Overige inkomsten', amount: overigInkomen, bg: 'bg-emerald-500' },
    { label: 'Uitgaven', amount: uitgaven, bg: 'bg-rose-500' },
  ].filter(c => c.amount > 0);

  const grandTotal = categories.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:hidden animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full bg-white dark:bg-slate-800 rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl border-t border-slate-200 dark:border-slate-700 overflow-hidden animate-in slide-in-from-bottom duration-250"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="pt-3 pb-1 flex justify-center shrink-0">
          <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600"></div>
        </div>

        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-primary">Financiële Verdeling</span>
            <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight mt-0.5">
              {event.name}
            </h3>
            <span className="text-xs text-slate-400">
              {new Date(event.date).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })} • {event.werkjaar}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Content body */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Overzichtskaartjes */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl">
              <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 block">Inkomsten</span>
              <span className="text-sm font-black text-emerald-800 dark:text-emerald-200">{formatEuro(totalIncome)}</span>
            </div>
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl">
              <span className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-400 block">Uitgaven</span>
              <span className="text-sm font-black text-rose-800 dark:text-rose-200">{formatEuro(uitgaven)}</span>
            </div>
            <div className={`p-2.5 border rounded-xl ${
              isProfit
                ? 'bg-emerald-100/60 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-100'
                : 'bg-rose-100/60 dark:bg-rose-900/40 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-100'
            }`}>
              <span className="text-[10px] font-bold uppercase block">{isProfit ? 'Winst' : 'Verlies'}</span>
              <span className="text-sm font-black">{formatEuro(netProfit)}</span>
            </div>
          </div>

          {/* Verdeling per categorie */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Verdeling per categorie</h4>
            {categories.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">Nog geen inkomsten of uitgaven ingegeven.</p>
            ) : (
              <div className="space-y-2">
                {categories.map((c, idx) => {
                  const pct = grandTotal > 0 ? (c.amount / grandTotal) * 100 : 0;
                  return (
                    <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                          <span className={`size-2.5 rounded-full ${c.bg}`}></span>
                          {c.label}
                        </span>
                        <div className="text-right">
                          <span className="font-black text-slate-900 dark:text-white">{formatEuro(c.amount)}</span>
                          <span className="text-[11px] text-slate-400 ml-1.5">({pct.toFixed(1)}%)</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full ${c.bg} rounded-full`} style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Individuele posten */}
          {items.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Alle geregistreerde posten ({items.length})</h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto pr-1">
                {items.map((it, idx) => {
                  const isExp = it.type === 'expense' || it.category === 'uitgave';
                  return (
                    <div key={idx} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 block">{it.description || 'Post'}</span>
                      </div>
                      <span className={`font-bold shrink-0 ${isExp ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {isExp ? '-' : '+'}{formatEuro(it.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERZICHTS STAAFDIAGRAM VAN HET WERKJAAR
// ─────────────────────────────────────────────────────────────────────────────
function YearlyBarChart({ events }: { events: FinanceEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400">
        <span className="material-symbols-outlined text-4xl mb-2">bar_chart</span>
        <p>Geen evenementen geregistreerd voor dit werkjaar.</p>
      </div>
    );
  }

  // Bereken totalen per event
  const data = events.map(ev => {
    const items = ev.items || [];
    const income = items.filter(i => i.type !== 'expense' && i.category !== 'uitgave').reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const expense = items.filter(i => i.type === 'expense' || i.category === 'uitgave').reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const profit = income - expense;
    return { name: ev.name, date: ev.date, income, expense, profit };
  });

  const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expense, Math.abs(d.profit))), 100);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <span className="size-2.5 sm:size-3 rounded-sm bg-emerald-500"></span> Inkomsten
          </span>
          <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
            <span className="size-2.5 sm:size-3 rounded-sm bg-rose-500"></span> Uitgaven
          </span>
        </div>
        <span className="text-[11px] sm:text-xs text-slate-400">Hoogste post: {formatEuro(maxVal)}</span>
      </div>

      <div className="space-y-3 sm:space-y-4 pt-1">
        {data.map((item, idx) => {
          const incPct = (item.income / maxVal) * 100;
          const expPct = (item.expense / maxVal) * 100;
          const isProf = item.profit >= 0;

          return (
            <div key={idx} className="p-3 sm:p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/80">
              <div className="flex justify-between items-center mb-2 gap-2">
                <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-white truncate">
                  {item.name}
                </span>
                <span className={`text-xs font-black shrink-0 ${isProf ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {isProf ? `+${formatEuro(item.profit)}` : formatEuro(item.profit)}
                </span>
              </div>

              {/* Baren */}
              <div className="space-y-1.5">
                {/* Inkomsten */}
                <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px]">
                  <span className="w-14 sm:w-16 text-slate-400 shrink-0">Inkomsten</span>
                  <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-2 sm:h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(incPct, 2)}%` }}
                    />
                  </div>
                  <span className="w-16 sm:w-20 text-right font-medium text-slate-600 dark:text-slate-300 shrink-0">
                    {formatEuro(item.income)}
                  </span>
                </div>

                {/* Uitgaven */}
                <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px]">
                  <span className="w-14 sm:w-16 text-slate-400 shrink-0">Uitgaven</span>
                  <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-2 sm:h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-rose-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(expPct, 2)}%` }}
                    />
                  </div>
                  <span className="w-16 sm:w-20 text-right font-medium text-slate-600 dark:text-slate-300 shrink-0">
                    {formatEuro(item.expense)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// JAARVERSLAG MODAL & PRINT/EXPORT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface JaarverslagModalProps {
  open: boolean;
  onClose: () => void;
  werkjaar: string;
  events: FinanceEvent[];
  bankBalance: number;
  penningmeester: Penningmeester | null;
}

function JaarverslagModal({ open, onClose, werkjaar, events, bankBalance, penningmeester }: JaarverslagModalProps) {
  if (!open) return null;

  // Breakdown per event
  const tableData = events.map(ev => {
    const items = ev.items || [];
    const leden = items.filter(i => i.category === 'inschrijving_leden').reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const leiding = items.filter(i => i.category === 'inschrijving_leiding').reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const forfaitDrank = items.filter(i => i.category === 'drank_forfait').reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const inkomstenDrank = items.filter(i => i.category === 'drank_inkomsten' || i.category === 'drank_leiding').reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const overig = items.filter(i => i.category === 'overig_inkomen').reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const income = leden + leiding + forfaitDrank + inkomstenDrank + overig;
    const expense = items.filter(i => i.type === 'expense' || i.category === 'uitgave').reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const profit = income - expense;
    return {
      id: ev.id,
      name: ev.name,
      date: ev.date,
      leden,
      leiding,
      forfaitDrank,
      inkomstenDrank,
      overig,
      income,
      expense,
      profit
    };
  });

  const totalLeden = tableData.reduce((s, d) => s + d.leden, 0);
  const totalLeiding = tableData.reduce((s, d) => s + d.leiding, 0);
  const totalForfaitDrank = tableData.reduce((s, d) => s + d.forfaitDrank, 0);
  const totalInkomstenDrank = tableData.reduce((s, d) => s + d.inkomstenDrank, 0);
  const totalOverig = tableData.reduce((s, d) => s + d.overig, 0);
  const grandIncome = tableData.reduce((s, d) => s + d.income, 0);
  const grandExpense = tableData.reduce((s, d) => s + d.expense, 0);
  const grandProfit = grandIncome - grandExpense;

  const [exportingImage, setExportingImage] = useState(false);

  const handlePrint = () => {
    const el = document.getElementById('printable-jaarverslag');
    if (!el) {
      window.print();
      return;
    }
    printHtmlReport(el, `Financieel-Jaarverslag-Gewest-Reinaertland-${werkjaar}`);
  };

  const handleExportImage = async () => {
    const el = document.getElementById('printable-jaarverslag');
    if (!el) return;
    await exportElementAsImage(el, `Financieel-Jaarverslag-Gewest-Reinaertland-${werkjaar}`, setExportingImage);
  };

  const handleExportCSV = () => {
    const rows = [
      ['CHIRO GEWEST REINAERTLAND - FINANCIEEL JAARVERSLAG', `Werkjaar ${werkjaar}`],
      ['Gegenereerd op', new Date().toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })],
      ['Penningmeester', penningmeester?.name || 'Gewestleiding', penningmeester?.email || ''],
      ['Huidig saldo gewestrekening', formatEuro(bankBalance)],
      [],
      ['Datum', 'Evenement', 'Inschrijving Leden (€)', 'Inschrijving Leiding (€)', 'Forfait Drank Leiding (€)', 'Inkomsten Drank / Tap (€)', 'Overige Inkomsten (€)', 'Totale Inkomsten (€)', 'Totale Uitgaven (€)', 'Netto Resultaat (€)'],
      ...tableData.map(d => [
        d.date,
        `"${d.name.replace(/"/g, '""')}"`,
        d.leden.toFixed(2),
        d.leiding.toFixed(2),
        d.forfaitDrank.toFixed(2),
        d.inkomstenDrank.toFixed(2),
        d.overig.toFixed(2),
        d.income.toFixed(2),
        d.expense.toFixed(2),
        d.profit.toFixed(2)
      ]),
      [],
      ['TOTAAL WERKJAAR', '', totalLeden.toFixed(2), totalLeiding.toFixed(2), totalForfaitDrank.toFixed(2), totalInkomstenDrank.toFixed(2), totalOverig.toFixed(2), grandIncome.toFixed(2), grandExpense.toFixed(2), grandProfit.toFixed(2)]
    ];
    const csvContent = '\uFEFF' + rows.map(r => r.join(';')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Financieel-Jaarverslag-Gewest-Reinaertland-${werkjaar}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-5xl my-6 flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Modal Controls (Hidden on print) */}
        <div className="no-print p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/40 shrink-0">
          <div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">description</span>
              Financieel Jaarverslag {werkjaar}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Overzicht van alle inkomsten, uitgaven en winsten voor werkjaar {werkjaar}.
            </p>
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

        {/* Printable Paper View */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 dark:bg-slate-900/70">
          <div
            id="printable-jaarverslag"
            className="bg-white text-slate-900 p-6 sm:p-10 rounded-2xl shadow-sm border border-slate-200 mx-auto max-w-4xl space-y-6 text-sm"
          >
            {/* Print Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b-2 border-slate-900 gap-4 avoid-break">
              <div>
                <span className="text-xs uppercase font-black tracking-widest text-orange-600">
                  Chiro Gewest Reinaertland
                </span>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-0.5">
                  Financieel Jaarverslag
                </h1>
                <p className="text-sm font-semibold text-slate-600 mt-1">
                  Werkjaar {werkjaar} (1 oktober t/m 30 september)
                </p>
              </div>
              <div className="sm:text-right text-xs text-slate-500 space-y-1">
                <div><strong>Datum opmaak:</strong> {new Date().toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                {penningmeester && (
                  <div>
                    <strong>Penningmeester:</strong> {penningmeester.name} ({penningmeester.email})
                  </div>
                )}
                <div><strong>Actueel rekeningsaldo:</strong> <span className="font-bold text-slate-900">{formatEuro(bankBalance)}</span></div>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 avoid-break">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="block text-[11px] font-bold uppercase text-slate-500">Totale Inkomsten</span>
                <span className="text-lg font-black text-emerald-700 mt-0.5 block">{formatEuro(grandIncome)}</span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="block text-[11px] font-bold uppercase text-slate-500">Totale Uitgaven</span>
                <span className="text-lg font-black text-rose-700 mt-0.5 block">{formatEuro(grandExpense)}</span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="block text-[11px] font-bold uppercase text-slate-500">Netto Resultaat</span>
                <span className={`text-lg font-black mt-0.5 block ${grandProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {grandProfit >= 0 ? `+${formatEuro(grandProfit)}` : formatEuro(grandProfit)}
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="block text-[11px] font-bold uppercase text-slate-500">Aantal Evenementen</span>
                <span className="text-lg font-black text-slate-800 mt-0.5 block">{tableData.length}</span>
              </div>
            </div>

            {/* Detail Tabel */}
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Gedetailleerd overzicht per evenement
              </h4>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="p-2.5">Datum</th>
                      <th className="p-2.5">Evenement</th>
                      <th className="p-2.5 text-right">Inschr. Leden</th>
                      <th className="p-2.5 text-right">Inschr. Leiding</th>
                      <th className="p-2.5 text-right">Forfait Drank</th>
                      <th className="p-2.5 text-right">Inkomsten Drank</th>
                      <th className="p-2.5 text-right">Overig</th>
                      <th className="p-2.5 text-right">Inkomsten</th>
                      <th className="p-2.5 text-right">Uitgaven</th>
                      <th className="p-2.5 text-right">Resultaat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tableData.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-6 text-center text-slate-400 italic">
                          Geen evenementen geregistreerd in werkjaar {werkjaar}.
                        </td>
                      </tr>
                    ) : (
                      tableData.map(d => (
                        <tr key={d.id} className="hover:bg-slate-50/80">
                          <td className="p-2.5 whitespace-nowrap text-slate-500">{new Date(d.date).toLocaleDateString('nl-BE')}</td>
                          <td className="p-2.5 font-bold text-slate-900">{d.name}</td>
                          <td className="p-2.5 text-right text-slate-600">{formatEuro(d.leden)}</td>
                          <td className="p-2.5 text-right text-slate-600">{formatEuro(d.leiding)}</td>
                          <td className="p-2.5 text-right text-slate-600">{formatEuro(d.forfaitDrank)}</td>
                          <td className="p-2.5 text-right text-slate-600">{formatEuro(d.inkomstenDrank)}</td>
                          <td className="p-2.5 text-right text-slate-600">{formatEuro(d.overig)}</td>
                          <td className="p-2.5 text-right font-semibold text-emerald-700">{formatEuro(d.income)}</td>
                          <td className="p-2.5 text-right font-semibold text-rose-700">{formatEuro(d.expense)}</td>
                          <td className={`p-2.5 text-right font-bold ${d.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {d.profit >= 0 ? `+${formatEuro(d.profit)}` : formatEuro(d.profit)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {tableData.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100/80 font-black border-t-2 border-slate-300 text-slate-900">
                        <td colSpan={2} className="p-2.5 uppercase text-xs">Totaal Werkjaar</td>
                        <td className="p-2.5 text-right">{formatEuro(totalLeden)}</td>
                        <td className="p-2.5 text-right">{formatEuro(totalLeiding)}</td>
                        <td className="p-2.5 text-right">{formatEuro(totalForfaitDrank)}</td>
                        <td className="p-2.5 text-right">{formatEuro(totalInkomstenDrank)}</td>
                        <td className="p-2.5 text-right">{formatEuro(totalOverig)}</td>
                        <td className="p-2.5 text-right text-emerald-700">{formatEuro(grandIncome)}</td>
                        <td className="p-2.5 text-right text-rose-700">{formatEuro(grandExpense)}</td>
                        <td className={`p-2.5 text-right ${grandProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {grandProfit >= 0 ? `+${formatEuro(grandProfit)}` : formatEuro(grandProfit)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Inkomstenverdeling posten */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 avoid-break">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h5 className="font-bold text-xs uppercase text-slate-600">Verdeling Inkomsten</h5>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Inschrijvingen Leden:</span>
                    <span className="font-semibold text-slate-900">{formatEuro(totalLeden)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Inschrijvingen Leiding:</span>
                    <span className="font-semibold text-slate-900">{formatEuro(totalLeiding)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Forfait Drank Leiding:</span>
                    <span className="font-semibold text-slate-900">{formatEuro(totalForfaitDrank)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Inkomsten Drank / Tap:</span>
                    <span className="font-semibold text-slate-900">{formatEuro(totalInkomstenDrank)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Overige Inkomsten:</span>
                    <span className="font-semibold text-slate-900">{formatEuro(totalOverig)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200 font-bold text-emerald-700">
                    <span>Totaal Inkomsten:</span>
                    <span>{formatEuro(grandIncome)}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h5 className="font-bold text-xs uppercase text-slate-600">Resultaat & Kas</h5>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Totale Inkomsten:</span>
                    <span className="font-semibold text-emerald-700">{formatEuro(grandIncome)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Totale Uitgaven:</span>
                    <span className="font-semibold text-rose-700">{formatEuro(grandExpense)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200 font-bold text-slate-900">
                    <span>Netto Resultaat:</span>
                    <span className={grandProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                      {grandProfit >= 0 ? `+${formatEuro(grandProfit)}` : formatEuro(grandProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200">
                    <span>Huidig Rekeningsaldo:</span>
                    <span className="font-bold text-slate-900">{formatEuro(bankBalance)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPECIFIEK EVENEMENT VERSLAG MODAL & PRINT/EXPORT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface EventVerslagModalProps {
  event: FinanceEvent | null;
  onClose: () => void;
  penningmeester: Penningmeester | null;
  bankBalance?: number;
  availableForms?: AvailableForm[];
}

function EventVerslagModal({
  event,
  onClose,
  penningmeester,
  bankBalance,
  availableForms = []
}: EventVerslagModalProps) {
  if (!event) return null;

  const items = event.items || [];
  const leden = items.filter(i => i.category === 'inschrijving_leden').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const leiding = items.filter(i => i.category === 'inschrijving_leiding').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const forfaitDrank = items.filter(i => i.category === 'drank_forfait').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const inkomstenDrank = items.filter(i => i.category === 'drank_inkomsten' || i.category === 'drank_leiding').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const overigeInkomsten = items.filter(i => i.category === 'overig_inkomen');
  const overigTotaal = overigeInkomsten.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const totalIncome = leden + leiding + forfaitDrank + inkomstenDrank + overigTotaal;

  const uitgaven = items.filter(i => i.type === 'expense' || i.category === 'uitgave');
  const totalExpense = uitgaven.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const netProfit = totalIncome - totalExpense;
  const isProfit = netProfit >= 0;

  // Segmenten voor de visualisatie
  const categories: { label: string; amount: number; color: string }[] = [
    { label: 'Inschrijving leden', amount: leden, color: '#0ea5e9' },
    { label: 'Inschrijving leiding', amount: leiding, color: '#6366f1' },
    { label: 'Forfait drank leiding', amount: forfaitDrank, color: '#f59e0b' },
    { label: 'Inkomsten drank (bar / tap)', amount: inkomstenDrank, color: '#f97316' },
    { label: 'Overige inkomsten', amount: overigTotaal, color: '#10b981' },
    { label: 'Uitgaven (kosten)', amount: totalExpense, color: '#f43f5e' },
  ].filter(c => c.amount > 0);

  const grandTotal = categories.reduce((sum, c) => sum + c.amount, 0);

  const slices = categories.map(c => ({
    ...c,
    percent: grandTotal > 0 ? (c.amount / grandTotal) * 100 : 0
  }));

  // SVG parameters
  const size = 120;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPercent = 0;

  const [exportingImage, setExportingImage] = useState(false);

  // Gekoppeld formulier opsporen (op basis van titel match)
  const matchedForm = availableForms.find(f =>
    event.name.toLowerCase().includes(f.title.toLowerCase()) ||
    f.title.toLowerCase().includes(event.name.toLowerCase())
  );

  const handlePrint = () => {
    const el = document.getElementById('printable-eventverslag');
    if (!el) {
      window.print();
      return;
    }
    const safeName = (event.name || 'Evenement').replace(/[^a-zA-Z0-9_-]/g, '_');
    printHtmlReport(el, `Financieel-Verslag-${safeName}-${event.werkjaar || 'werkjaar'}`);
  };

  const handleExportImage = async () => {
    const el = document.getElementById('printable-eventverslag');
    if (!el) return;
    const safeName = (event.name || 'Evenement').replace(/[^a-zA-Z0-9_-]/g, '_');
    await exportElementAsImage(el, `Financieel-Verslag-${safeName}-${event.werkjaar || 'werkjaar'}`, setExportingImage);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-4xl my-6 flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Modal Controls (verborgen bij print) */}
        <div className="no-print p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/40 shrink-0">
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">assessment</span>
              Financieel Verslag: {event.name}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Volledig overzicht van inkomsten, uitgaven en de nettobalans op 1 pagina.
            </p>
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

        {/* Printable Paper View (Compact 1-Page Layout) */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-100 dark:bg-slate-900/70">
          <div
            id="printable-eventverslag"
            className="bg-white text-slate-900 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 mx-auto max-w-4xl space-y-3 sm:space-y-3.5 text-xs"
          >
            {/* Print Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-2.5 border-b-2 border-slate-900 gap-2 avoid-break">
              <div>
                <span className="text-[10px] uppercase font-black tracking-widest text-orange-600">
                  Chiro Gewest Reinaertland
                </span>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5 leading-tight">
                  {event.name}
                </h1>
                <p className="text-xs font-semibold text-slate-600 mt-0.5">
                  Financieel Evenementenverslag • Werkjaar {event.werkjaar}
                </p>
                <p className="text-[11px] text-slate-500">
                  Datum activiteit: {event.date ? new Date(event.date).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '-'}
                </p>
              </div>
              <div className="sm:text-right text-[11px] text-slate-500 space-y-0.5">
                <div><strong>Datum opmaak:</strong> {new Date().toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                {penningmeester && (
                  <div>
                    <strong>Penningmeester:</strong> {penningmeester.name} ({penningmeester.email})
                  </div>
                )}
                {bankBalance !== undefined && bankBalance > 0 && (
                  <div><strong>Gewestrekening saldo:</strong> <span className="font-bold text-slate-900">{formatEuro(bankBalance)}</span></div>
                )}
                {matchedForm && (
                  <div className="text-orange-700 font-semibold">
                    <strong>Gekoppeld formulier:</strong> {matchedForm.title}
                  </div>
                )}
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 avoid-break">
              <div className="p-2 sm:p-2.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl">
                <span className="block text-[10px] font-bold uppercase text-emerald-800">Totale Inkomsten</span>
                <span className="text-base sm:text-lg font-black text-emerald-700 mt-0.5 block">{formatEuro(totalIncome)}</span>
              </div>
              <div className="p-2 sm:p-2.5 bg-rose-50/70 border border-rose-200/80 rounded-xl">
                <span className="block text-[10px] font-bold uppercase text-rose-800">Totale Uitgaven</span>
                <span className="text-base sm:text-lg font-black text-rose-700 mt-0.5 block">{formatEuro(totalExpense)}</span>
              </div>
              <div className={`p-2 sm:p-2.5 rounded-xl border ${isProfit ? 'bg-emerald-50/70 border-emerald-200/80' : 'bg-rose-50/70 border-rose-200/80'}`}>
                <span className={`block text-[10px] font-bold uppercase ${isProfit ? 'text-emerald-800' : 'text-rose-800'}`}>
                  Netto Resultaat
                </span>
                <span className={`text-base sm:text-lg font-black mt-0.5 block ${isProfit ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {isProfit ? `+${formatEuro(netProfit)}` : formatEuro(netProfit)}
                </span>
              </div>
              <div className="p-2 sm:p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="block text-[10px] font-bold uppercase text-slate-500">Geregistreerde Posten</span>
                <span className="text-base sm:text-lg font-black text-slate-800 mt-0.5 block">
                  {items.length} {items.length === 1 ? 'post' : 'posten'}
                </span>
              </div>
            </div>

            {/* Visualisatie Donut & Legende */}
            <div className="p-3 bg-slate-50/90 border border-slate-200 rounded-xl avoid-break">
              <div className="flex flex-col sm:flex-row items-center justify-around gap-4">
                {/* Donut SVG (compact) */}
                <div className="relative size-[120px] flex items-center justify-center shrink-0">
                  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
                    <circle
                      cx={size / 2}
                      cy={size / 2}
                      r={radius}
                      fill="none"
                      stroke="#e2e8f0"
                      strokeWidth={strokeWidth}
                    />
                    {slices.length === 0 ? (
                      <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth={strokeWidth}
                        strokeDasharray={`${circumference} ${circumference}`}
                        opacity="0.3"
                      />
                    ) : (
                      slices.map((slice, idx) => {
                        const dashLength = (slice.percent / 100) * circumference;
                        const dashOffset = -((accumulatedPercent / 100) * circumference);
                        accumulatedPercent += slice.percent;
                        return (
                          <circle
                            key={idx}
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            fill="none"
                            stroke={slice.color}
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${dashLength} ${circumference}`}
                            strokeDashoffset={dashOffset}
                          />
                        );
                      })
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2 pointer-events-none">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      {isProfit ? 'Nettowinst' : 'Nettoverlies'}
                    </span>
                    <span className={`text-xs font-black ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isProfit ? `+${formatEuro(netProfit)}` : formatEuro(netProfit)}
                    </span>
                  </div>
                </div>

                {/* Donut Legend */}
                <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                  {categories.length === 0 ? (
                    <p className="text-slate-400 italic text-[11px] col-span-2">Geen bedragen ingevoerd.</p>
                  ) : (
                    categories.map((cat, idx) => {
                      const pct = grandTotal > 0 ? (cat.amount / grandTotal) * 100 : 0;
                      return (
                        <div key={idx} className="flex items-center justify-between p-1 px-2 rounded-lg bg-white border border-slate-200/80">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="font-semibold text-slate-700 truncate text-[11px]">{cat.label}</span>
                          </div>
                          <div className="text-right shrink-0 ml-1.5 flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 text-[11px]">{formatEuro(cat.amount)}</span>
                            <span className="text-[10px] text-slate-400">({pct.toFixed(1)}%)</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Gedetailleerd Overzicht: 2 Kolommen (Inkomsten & Uitgaven) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 avoid-break">
              {/* Kolom 1: Inkomsten */}
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1 border-b-2 border-emerald-500 avoid-break">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">trending_up</span>
                    Inkomsten & Ontvangsten
                  </h4>
                  <span className="text-[11px] font-bold text-emerald-700">{formatEuro(totalIncome)}</span>
                </div>

                <div className="space-y-1 text-xs">
                  {leden > 0 && (
                    <div className="flex justify-between items-center p-1.5 px-2 bg-sky-50/60 border border-sky-100 rounded-lg avoid-break">
                      <span className="font-bold text-slate-900 text-xs">Inschrijvingsgeld leden</span>
                      <span className="font-bold text-sky-700 text-xs">{formatEuro(leden)}</span>
                    </div>
                  )}

                  {leiding > 0 && (
                    <div className="flex justify-between items-center p-1.5 px-2 bg-indigo-50/60 border border-indigo-100 rounded-lg avoid-break">
                      <span className="font-bold text-slate-900 text-xs">Inschrijvingsgeld leiding</span>
                      <span className="font-bold text-indigo-700 text-xs">{formatEuro(leiding)}</span>
                    </div>
                  )}

                  {forfaitDrank > 0 && (
                    <div className="flex justify-between items-center p-1.5 px-2 bg-amber-50/60 border border-amber-100 rounded-lg avoid-break">
                      <span className="font-bold text-slate-900 text-xs">Forfait drank leiding</span>
                      <span className="font-bold text-amber-700 text-xs">{formatEuro(forfaitDrank)}</span>
                    </div>
                  )}

                  {inkomstenDrank > 0 && (
                    <div className="flex justify-between items-center p-1.5 px-2 bg-orange-50/60 border border-orange-100 rounded-lg avoid-break">
                      <span className="font-bold text-slate-900 text-xs">Inkomsten drank (bar / tap)</span>
                      <span className="font-bold text-orange-700 text-xs">{formatEuro(inkomstenDrank)}</span>
                    </div>
                  )}

                  {overigeInkomsten.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-1.5 px-2 bg-slate-50 border border-slate-200/80 rounded-lg avoid-break">
                      <span className="font-semibold text-slate-800 text-xs truncate mr-2">{item.description || `Overige inkomst #${idx + 1}`}</span>
                      <span className="font-bold text-emerald-700 text-xs shrink-0">{formatEuro(Number(item.amount) || 0)}</span>
                    </div>
                  ))}

                  {totalIncome === 0 && (
                    <div className="p-2 text-center text-slate-400 italic bg-slate-50 border border-dashed border-slate-200 rounded-lg text-xs">
                      Geen inkomsten geregistreerd.
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-1 border-t border-slate-200 font-bold text-slate-900 text-xs avoid-break">
                    <span>Totaal Ontvangsten:</span>
                    <span className="text-emerald-700">{formatEuro(totalIncome)}</span>
                  </div>
                </div>
              </div>

              {/* Kolom 2: Uitgaven */}
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1 border-b-2 border-rose-500 avoid-break">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-rose-800 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">trending_down</span>
                    Uitgaven & Kosten
                  </h4>
                  <span className="text-[11px] font-bold text-rose-700">{formatEuro(totalExpense)}</span>
                </div>

                <div className="space-y-1 text-xs">
                  {uitgaven.length === 0 ? (
                    <div className="p-2 text-center text-slate-400 italic bg-slate-50 border border-dashed border-slate-200 rounded-lg text-xs">
                      Geen uitgaven ingevoerd voor dit evenement.
                    </div>
                  ) : (
                    uitgaven.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-1.5 px-2 bg-slate-50 border border-slate-200/80 rounded-lg avoid-break">
                        <span className="font-semibold text-slate-800 text-xs truncate mr-2">{item.description || `Uitgave #${idx + 1}`}</span>
                        <span className="font-bold text-rose-700 text-xs shrink-0">{formatEuro(Number(item.amount) || 0)}</span>
                      </div>
                    ))
                  )}

                  <div className="flex justify-between items-center pt-1 border-t border-slate-200 font-bold text-slate-900 text-xs avoid-break">
                    <span>Totaal Uitgaven:</span>
                    <span className="text-rose-700">{formatEuro(totalExpense)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Balans Samenvatting (1-line) */}
            <div className="p-2.5 px-4 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs avoid-break">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Netto Resultaat</span>
                <p className="text-[11px] text-slate-300">
                  Ontvangsten ({formatEuro(totalIncome)}) min kosten ({formatEuro(totalExpense)})
                </p>
              </div>
              <div className="text-right">
                <span className={`text-base sm:text-lg font-black ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isProfit ? `+${formatEuro(netProfit)}` : formatEuro(netProfit)}
                </span>
                <span className="block text-[9px] text-slate-400 uppercase font-semibold">
                  {isProfit ? 'Winstgevend' : 'Tekort / Verlies'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOFD COMPONENT: FINANCIËN
// ─────────────────────────────────────────────────────────────────────────────
export default function Financien({ authFetch }: FinancienProps) {
  const [settings, setSettings] = useState<FinanceSettings>({ bankBalance: 0 });
  const [events, setEvents] = useState<FinanceEvent[]>([]);
  const [penningmeester, setPenningmeester] = useState<Penningmeester | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableForms, setAvailableForms] = useState<AvailableForm[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<number | ''>('');
  const [showJaarverslagModal, setShowJaarverslagModal] = useState(false);
  const [showSyncFormModal, setShowSyncFormModal] = useState(false);
  const [syncSelectedFormId, setSyncSelectedFormId] = useState<number | ''>('');
  const [syncTargetMode, setSyncTargetMode] = useState<'existing' | 'new'>('new');
  const [syncTargetEventId, setSyncTargetEventId] = useState<number | ''>('');
  const [syncCustomAmount, setSyncCustomAmount] = useState<string>('');
  const [syncLedenAmount, setSyncLedenAmount] = useState<string>('');
  const [syncLeidingAmount, setSyncLeidingAmount] = useState<string>('');
  const [syncDrankForfaitAmount, setSyncDrankForfaitAmount] = useState<string>('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [mobileBreakdownEvent, setMobileBreakdownEvent] = useState<FinanceEvent | null>(null);
  const [viewingEventVerslag, setViewingEventVerslag] = useState<FinanceEvent | null>(null);

  // Werkjaar selectie (startend vanaf 2026-2027)
  const currentInitialWerkjaar = computeWerkjaar(new Date().toISOString().slice(0, 10));
  const [selectedWerkjaar, setSelectedWerkjaar] = useState<string>(
    currentInitialWerkjaar < '2026-2027' ? '2026-2027' : currentInitialWerkjaar
  );

  // Autorisatie
  const storedUser = localStorage.getItem('user');
  let currentUser: any = null;
  try { currentUser = storedUser ? JSON.parse(storedUser) : null; } catch {}

  const userRoles: string[] = Array.isArray(currentUser?.roles)
    ? currentUser.roles
    : [currentUser?.role || ''];
  const lowerRoles = userRoles.map(r => String(r).toLowerCase().trim());
  const canEdit = lowerRoles.includes('admin') || lowerRoles.includes('groepsleiding') || lowerRoles.includes('penningmeester') || lowerRoles.includes('website');

  // Modals state
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [newBalanceInput, setNewBalanceInput] = useState('');
  const [deleteEventId, setDeleteEventId] = useState<number | null>(null);

  // Formulier voor evenement
  const [activeTab, setActiveTab] = useState<'algemeen' | 'inschrijvingen' | 'overig' | 'uitgaven'>('algemeen');
  const [eventForm, setEventForm] = useState<{
    name: string;
    date: string;
    werkjaar: string;
    inschrijvingLeden: number;
    inschrijvingLeiding: number;
    forfaitDrank: number;
    inkomstenDrank: number;
    overigeInkomsten: { description: string; amount: number }[];
    uitgaven: { description: string; amount: number }[];
  }>({
    name: '',
    date: new Date().toISOString().slice(0, 10),
    werkjaar: currentInitialWerkjaar,
    inschrijvingLeden: 0,
    inschrijvingLeiding: 0,
    forfaitDrank: 0,
    inkomstenDrank: 0,
    overigeInkomsten: [],
    uitgaven: [],
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/finances');
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings || { bankBalance: 0 });
        setEvents(sortEventsByUpdated(data.events || []));
        setPenningmeester(data.penningmeester);
      }

      const formsRes = await authFetch('/api/finances/available-forms');
      if (formsRes.ok) {
        const fData = await formsRes.json();
        const list: AvailableForm[] = Array.isArray(fData)
          ? fData
          : (Array.isArray(fData?.forms) ? fData.forms : []);
        setAvailableForms(list);
      }
    } catch (err) {
      console.error('Fout bij laden financiële gegevens:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Sorteerfunctie: Meest recent bewerkt eerst (updatedAt DESC, createdAt DESC, date DESC)
  const sortEventsByUpdated = (list: FinanceEvent[]) => {
    return [...list].sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || a.date).getTime() || 0;
      const timeB = new Date(b.updatedAt || b.createdAt || b.date).getTime() || 0;
      return timeB - timeA;
    });
  };

  // Filter evenementen per geselecteerd werkjaar, altijd gesorteerd op laatst bewerkt eerst
  const sortedEvents = sortEventsByUpdated(events);
  const filteredEvents = sortedEvents.filter(e => (e.werkjaar || computeWerkjaar(e.date)) === selectedWerkjaar);

  // Bereken werkjaar KPI's
  const werkjaarTotalIncome = filteredEvents.reduce((acc, ev) => {
    const items = ev.items || [];
    return acc + items.filter(i => i.type !== 'expense' && i.category !== 'uitgave').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  }, 0);

  const werkjaarTotalExpense = filteredEvents.reduce((acc, ev) => {
    const items = ev.items || [];
    return acc + items.filter(i => i.type === 'expense' || i.category === 'uitgave').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  }, 0);

  const werkjaarNetProfit = werkjaarTotalIncome - werkjaarTotalExpense;

  // Unieke werkjaren voor selector (startend vanaf 2026-2027)
  const availableWerkjaren = Array.from(new Set([
    '2026-2027',
    currentInitialWerkjaar,
    ...events.map(e => e.werkjaar || computeWerkjaar(e.date))
  ]))
  .filter(wj => wj >= '2026-2027')
  .sort()
  .reverse();

  // Werkjaar navigatie
  const changeWerkjaar = (direction: number) => {
    const idx = availableWerkjaren.indexOf(selectedWerkjaar);
    if (idx !== -1) {
      const nextIdx = idx - direction;
      if (nextIdx >= 0 && nextIdx < availableWerkjaren.length) {
        setSelectedWerkjaar(availableWerkjaren[nextIdx]);
      }
    }
  };

  // Open Add modal
  const openAddEvent = () => {
    setEditingEventId(null);
    setSelectedFormId('');
    setEventForm({
      name: '',
      date: new Date().toISOString().slice(0, 10),
      werkjaar: selectedWerkjaar,
      inschrijvingLeden: 0,
      inschrijvingLeiding: 0,
      forfaitDrank: 0,
      inkomstenDrank: 0,
      overigeInkomsten: [],
      uitgaven: [],
    });
    setActiveTab('algemeen');
    setShowEventModal(true);
  };

  // Open Edit modal
  const openEditEvent = (ev: FinanceEvent) => {
    setEditingEventId(ev.id);
    setSelectedFormId('');
    const items = ev.items || [];
    const ledenItem = items.find(i => i.category === 'inschrijving_leden');
    const leidingItem = items.find(i => i.category === 'inschrijving_leiding');
    const forfaitItem = items.find(i => i.category === 'drank_forfait');
    const inkomstenDrankItem = items.find(i => i.category === 'drank_inkomsten');
    const legacyDrankItem = items.find(i => i.category === 'drank_leiding');
    const overige = items.filter(i => i.category === 'overig_inkomen').map(i => ({ description: i.description, amount: Number(i.amount) || 0 }));
    const uitg = items.filter(i => i.type === 'expense' || i.category === 'uitgave').map(i => ({ description: i.description, amount: Number(i.amount) || 0 }));

    setEventForm({
      name: ev.name,
      date: ev.date || new Date().toISOString().slice(0, 10),
      werkjaar: ev.werkjaar || computeWerkjaar(ev.date),
      inschrijvingLeden: ledenItem ? Number(ledenItem.amount) : 0,
      inschrijvingLeiding: leidingItem ? Number(leidingItem.amount) : 0,
      forfaitDrank: forfaitItem ? Number(forfaitItem.amount) : 0,
      inkomstenDrank: inkomstenDrankItem ? Number(inkomstenDrankItem.amount) : (legacyDrankItem ? Number(legacyDrankItem.amount) : 0),
      overigeInkomsten: overige,
      uitgaven: uitg,
    });
    setActiveTab('algemeen');
    setShowEventModal(true);
  };

  // Compile live formulierdata naar een FinanceEvent voor het verslag
  const compileEventFromForm = (): FinanceEvent => {
    const compiledItems: FinanceItem[] = [];
    if (eventForm.inschrijvingLeden > 0) {
      compiledItems.push({
        id: 'leden',
        type: 'income',
        category: 'inschrijving_leden',
        description: 'Inschrijvingsgeld leden',
        amount: Number(eventForm.inschrijvingLeden)
      });
    }
    if (eventForm.inschrijvingLeiding > 0) {
      compiledItems.push({
        id: 'leiding',
        type: 'income',
        category: 'inschrijving_leiding',
        description: 'Inschrijvingsgeld leiding',
        amount: Number(eventForm.inschrijvingLeiding)
      });
    }
    if (eventForm.forfaitDrank > 0) {
      compiledItems.push({
        id: 'drank_forfait',
        type: 'income',
        category: 'drank_forfait',
        description: 'Forfait drank leiding',
        amount: Number(eventForm.forfaitDrank)
      });
    }
    if (eventForm.inkomstenDrank > 0) {
      compiledItems.push({
        id: 'drank_inkomsten',
        type: 'income',
        category: 'drank_inkomsten',
        description: 'Inkomsten drank (bar / tap)',
        amount: Number(eventForm.inkomstenDrank)
      });
    }
    eventForm.overigeInkomsten.forEach((item, idx) => {
      if (item.amount > 0 || (item.description && item.description.trim())) {
        compiledItems.push({
          id: `overig_${idx}`,
          type: 'income',
          category: 'overig_inkomen',
          description: item.description || `Overige inkomst #${idx + 1}`,
          amount: Number(item.amount) || 0
        });
      }
    });
    eventForm.uitgaven.forEach((item, idx) => {
      if (item.amount > 0 || (item.description && item.description.trim())) {
        compiledItems.push({
          id: `uitgave_${idx}`,
          type: 'expense',
          category: 'uitgave',
          description: item.description || `Uitgave #${idx + 1}`,
          amount: Number(item.amount) || 0
        });
      }
    });

    return {
      id: editingEventId || 0,
      name: eventForm.name || 'Nieuw Evenement',
      date: eventForm.date || new Date().toISOString().slice(0, 10),
      werkjaar: eventForm.werkjaar || computeWerkjaar(eventForm.date),
      items: compiledItems
    };
  };

  const handleOpenEventVerslagFromForm = () => {
    const currentEvent = compileEventFromForm();
    setViewingEventVerslag(currentEvent);
  };

  // Save Event
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.name) return;

    // Construeer items array
    const compiledItems: FinanceItem[] = [];
    if (eventForm.inschrijvingLeden > 0) {
      compiledItems.push({
        id: 'leden',
        type: 'income',
        category: 'inschrijving_leden',
        description: 'Inschrijvingsgeld leden',
        amount: Number(eventForm.inschrijvingLeden)
      });
    }
    if (eventForm.inschrijvingLeiding > 0) {
      compiledItems.push({
        id: 'leiding',
        type: 'income',
        category: 'inschrijving_leiding',
        description: 'Inschrijvingsgeld leiding',
        amount: Number(eventForm.inschrijvingLeiding)
      });
    }
    if (eventForm.forfaitDrank > 0) {
      compiledItems.push({
        id: 'drank_forfait',
        type: 'income',
        category: 'drank_forfait',
        description: 'Forfait drank leiding',
        amount: Number(eventForm.forfaitDrank)
      });
    }
    if (eventForm.inkomstenDrank > 0) {
      compiledItems.push({
        id: 'drank_inkomsten',
        type: 'income',
        category: 'drank_inkomsten',
        description: 'Inkomsten drank (bar / tap)',
        amount: Number(eventForm.inkomstenDrank)
      });
    }
    eventForm.overigeInkomsten.forEach((item, idx) => {
      if (item.amount > 0) {
        compiledItems.push({
          id: `overig_${idx}`,
          type: 'income',
          category: 'overig_inkomen',
          description: item.description || 'Overige inkomst',
          amount: Number(item.amount)
        });
      }
    });
    eventForm.uitgaven.forEach((item, idx) => {
      if (item.amount > 0) {
        compiledItems.push({
          id: `uitgave_${idx}`,
          type: 'expense',
          category: 'uitgave',
          description: item.description || 'Uitgave',
          amount: Number(item.amount)
        });
      }
    });

    const payload = {
      name: eventForm.name,
      date: eventForm.date,
      werkjaar: eventForm.werkjaar || computeWerkjaar(eventForm.date),
      items: compiledItems
    };

    try {
      if (editingEventId) {
        await authFetch(`/api/finances/events/${editingEventId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        await authFetch('/api/finances/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      setShowEventModal(false);
      fetchData();
    } catch (err) {
      alert('Fout bij opslaan evenement.');
    }
  };

  // Delete Event
  const handleDeleteEvent = async () => {
    if (!deleteEventId) return;
    try {
      await authFetch(`/api/finances/events/${deleteEventId}`, { method: 'DELETE' });
      setDeleteEventId(null);
      fetchData();
    } catch (err) {
      alert('Fout bij verwijderen.');
    }
  };

  // Update Bank Saldo
  const handleUpdateBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const amount = parseFloat(newBalanceInput);
      if (isNaN(amount)) return;
      await authFetch('/api/finances/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankBalance: amount, googleSheetUrl: settings.googleSheetUrl })
      });
      setShowBalanceModal(false);
      fetchData();
    } catch (err) {
      alert('Fout bij bijwerken saldo.');
    }
  };

  // Quick Sync Inschrijvingsgeld overnemen van formulier
  const handleExecuteSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncSelectedFormId) {
      alert('Selecteer eerst een inschrijvingsformulier.');
      return;
    }
    const form = availableForms.find(f => f.id === Number(syncSelectedFormId));
    if (!form) return;

    const parsedLeden = parseFloat(syncLedenAmount);
    const parsedLeiding = parseFloat(syncLeidingAmount);
    const parsedDrank = parseFloat(syncDrankForfaitAmount);

    const ledenAmt = !isNaN(parsedLeden) ? parsedLeden : (Number(form.autoLedenAmount) || 0);
    const leidingAmt = !isNaN(parsedLeiding) ? parsedLeiding : (Number(form.autoLeidingAmount) || 0);
    const drankAmt = !isNaN(parsedDrank) ? parsedDrank : (Number(form.autoDrankForfaitAmount) || 0);

    const syncedItems: FinanceItem[] = [];
    if (ledenAmt > 0) {
      syncedItems.push({
        id: 'leden',
        type: 'income',
        category: 'inschrijving_leden',
        description: `Inschrijvingsgeld leden (${form.title})`,
        amount: ledenAmt
      });
    }
    if (leidingAmt > 0) {
      syncedItems.push({
        id: 'leiding',
        type: 'income',
        category: 'inschrijving_leiding',
        description: `Inschrijvingsgeld leiding (${form.title})`,
        amount: leidingAmt
      });
    }
    if (drankAmt > 0) {
      syncedItems.push({
        id: 'drank_forfait',
        type: 'income',
        category: 'drank_forfait',
        description: `Forfait drank leiding (${form.title})`,
        amount: drankAmt
      });
    }

    setSyncLoading(true);
    try {
      if (syncTargetMode === 'existing') {
        if (!syncTargetEventId) {
          alert('Selecteer een bestaand evenement om aan te koppelen.');
          setSyncLoading(false);
          return;
        }
        const targetEv = events.find(e => e.id === Number(syncTargetEventId));
        if (!targetEv) return;
        const otherItems = (targetEv.items || []).filter(
          i => i.category !== 'inschrijving_leden' && i.category !== 'inschrijving_leiding' && i.category !== 'drank_forfait'
        );
        const updatedItems: FinanceItem[] = [
          ...otherItems,
          ...syncedItems
        ];
        await authFetch(`/api/finances/events/${targetEv.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: targetEv.name,
            date: targetEv.date,
            werkjaar: targetEv.werkjaar || computeWerkjaar(targetEv.date),
            items: updatedItems
          })
        });
      } else {
        // Nieuw evenement aanmaken
        await authFetch('/api/finances/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.title,
            date: new Date().toISOString().slice(0, 10),
            werkjaar: selectedWerkjaar,
            items: syncedItems
          })
        });
      }
      setShowSyncFormModal(false);
      setSyncSelectedFormId('');
      setSyncLedenAmount('');
      setSyncLeidingAmount('');
      setSyncDrankForfaitAmount('');
      fetchData();
      alert(`Inschrijvingsgelden en drankforfait van "${form.title}" zijn succesvol overgenomen in de kas!`);
    } catch (err) {
      alert('Fout bij synchroniseren van het formulier.');
    } finally {
      setSyncLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm transition-all";

  // Bereken live preview in modal
  const liveTotalIncome = Number(eventForm.inschrijvingLeden || 0) +
    Number(eventForm.inschrijvingLeiding || 0) +
    Number(eventForm.forfaitDrank || 0) +
    Number(eventForm.inkomstenDrank || 0) +
    eventForm.overigeInkomsten.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const liveTotalExpense = eventForm.uitgaven.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const liveNetProfit = liveTotalIncome - liveTotalExpense;

  return (
    <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8 pb-12 px-3 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined">payments</span>
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                Kas & Financiën
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Financieel overzicht, resultaten per evenement en kasbeheer.
              </p>
            </div>
          </div>
        </div>

        {/* Werkjaar Navigator & Jaarverslag Acties */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 sm:p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
            <button
              onClick={() => changeWerkjaar(-1)}
              disabled={availableWerkjaren.indexOf(selectedWerkjaar) >= availableWerkjaren.length - 1}
              className="p-1 sm:p-1.5 rounded-xl hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Vorig werkjaar"
            >
              <span className="material-symbols-outlined text-base">chevron_left</span>
            </button>

            <select
              value={selectedWerkjaar}
              onChange={e => setSelectedWerkjaar(e.target.value)}
              className="bg-transparent font-bold text-xs sm:text-sm text-slate-800 dark:text-white outline-none cursor-pointer px-1.5 sm:px-2 py-1"
            >
              {availableWerkjaren.map(wj => (
                <option key={wj} value={wj} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                  Werkjaar {wj}
                </option>
              ))}
            </select>

            <button
              onClick={() => changeWerkjaar(1)}
              disabled={availableWerkjaren.indexOf(selectedWerkjaar) <= 0}
              className="p-1 sm:p-1.5 rounded-xl hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Volgend werkjaar"
            >
              <span className="material-symbols-outlined text-base">chevron_right</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowJaarverslagModal(true)}
            className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title={`Bekijk en exporteer jaarverslag voor werkjaar ${selectedWerkjaar}`}
          >
            <span className="material-symbols-outlined text-base text-primary">description</span>
            <span className="hidden sm:inline">Exporteer</span> Jaarverslag
          </button>
        </div>
      </div>

      {/* Saldo op Gewestrekening (Hoofdding) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="md:col-span-2 relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-orange-600 to-amber-600 p-5 sm:p-8 text-white shadow-xl shadow-primary/20 flex flex-col justify-between min-h-[170px] sm:min-h-[190px]">
          <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 size-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between z-10">
            <span className="text-xs font-bold uppercase tracking-wider bg-white/20 backdrop-blur-md px-3 py-1 rounded-full">
              Gewestrekening Saldo
            </span>
            {canEdit && (
              <button
                onClick={() => {
                  setNewBalanceInput(String(settings.bankBalance || 0));
                  setShowBalanceModal(true);
                }}
                className="flex items-center gap-1.5 text-xs font-bold bg-white/20 hover:bg-white/30 backdrop-blur-md px-3 py-1.5 rounded-xl transition-all cursor-pointer shadow-xs"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                Saldo aanpassen
              </button>
            )}
          </div>

          <div className="my-3 z-10">
            <div className="text-3xl sm:text-5xl font-black tracking-tight drop-shadow-sm break-words">
              {formatEuro(settings.bankBalance || 0)}
            </div>
            <p className="text-xs text-orange-100 mt-1">
              Stand van zaken op de centrale gewestrekening
              {settings.updatedAt && (
                <span> • Laatst bijgewerkt: {new Date(settings.updatedAt).toLocaleDateString('nl-BE')}</span>
              )}
            </p>
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-3 pt-2 z-10">
              <button
                onClick={openAddEvent}
                className="flex items-center gap-2 px-4 py-2 bg-white text-slate-900 font-bold rounded-xl shadow-md hover:bg-orange-50 transition-all text-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">add_circle</span>
                Nieuw Evenement
              </button>
            </div>
          )}
        </div>

        {/* Kasverantwoordelijke Widget */}
        <div className="rounded-3xl bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/60">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Kasverantwoordelijke</span>
            <span className="material-symbols-outlined text-primary text-xl">account_balance_wallet</span>
          </div>

          <div className="my-3 flex items-center gap-3.5">
            <img
              src={safeImageUrl(penningmeester?.avatar, "https://placehold.co/150x150/d94824/white?text=PM")}
              alt="Penningmeester"
              className="size-14 rounded-2xl object-cover border-2 border-primary/20 shrink-0 shadow-sm"
            />
            <div className="overflow-hidden">
              <h4 className="font-bold text-slate-900 dark:text-white truncate">
                {penningmeester?.name || 'Gewestleiding'}
              </h4>
              <p className="text-xs font-medium text-primary">Penningmeester</p>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {penningmeester?.email || 'contact@reinaertland.be'}
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            <a
              href={`mailto:${penningmeester?.email || 'contact@reinaertland.be'}?subject=Vraag%20over%20Financi%C3%ABn%20Gewest`}
              className="flex-1 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-primary hover:text-white dark:hover:bg-primary transition-all text-xs font-bold text-center flex items-center justify-center gap-1.5 text-slate-700 dark:text-slate-200"
            >
              <span className="material-symbols-outlined text-sm">mail</span>
              Contacteer
            </a>
            {penningmeester?.phone && (
              <a
                href={`https://wa.me/${penningmeester.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors text-xs font-bold flex items-center justify-center gap-1"
                title="WhatsApp bericht sturen"
              >
                <span className="material-symbols-outlined text-sm">chat</span>
                WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>

      {/* KPI Kaarten Werkjaar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
            <span>Inkomsten ({selectedWerkjaar})</span>
            <span className="material-symbols-outlined text-emerald-500 text-lg">arrow_downward</span>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {formatEuro(werkjaarTotalIncome)}
          </div>
          <span className="text-xs text-slate-400">{filteredEvents.length} evenementen</span>
        </div>

        <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
            <span>Uitgaven ({selectedWerkjaar})</span>
            <span className="material-symbols-outlined text-rose-500 text-lg">arrow_upward</span>
          </div>
          <div className="mt-2 text-2xl font-black text-rose-600 dark:text-rose-400">
            {formatEuro(werkjaarTotalExpense)}
          </div>
          <span className="text-xs text-slate-400">Kosten van alle activiteiten</span>
        </div>

        <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
            <span>Resultaat ({selectedWerkjaar})</span>
            <span className="material-symbols-outlined text-primary text-lg">equalizer</span>
          </div>
          <div className={`mt-2 text-2xl font-black ${
            werkjaarNetProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          }`}>
            {werkjaarNetProfit >= 0 ? `+${formatEuro(werkjaarNetProfit)}` : formatEuro(werkjaarNetProfit)}
          </div>
          <span className="text-xs text-slate-400">
            {werkjaarNetProfit >= 0 ? 'Positief gewestresultaat' : 'Negatief gewestresultaat'}
          </span>
        </div>
      </div>

      {/* Overzichtsgrafiek Werkjaar */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100 dark:border-slate-700/60">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              Overzicht Werkjaar {selectedWerkjaar}
            </h3>
          </div>
          <span className="text-xs font-semibold px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-600 dark:text-slate-300">
            {filteredEvents.length} {filteredEvents.length === 1 ? 'evenement' : 'evenementen'}
          </span>
        </div>

        <YearlyBarChart events={filteredEvents} />
      </div>

      {/* Sectie: Evenementen */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              Evenementen
            </h3>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openAddEvent}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white font-bold rounded-xl shadow-sm hover:bg-primary/90 transition-colors text-xs sm:text-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">add</span>
                <span>Evenement Toevoegen</span>
              </button>
            </div>
          )}
        </div>

        {filteredEvents.length === 0 ? (
          <div className="p-12 text-center bg-slate-50 dark:bg-slate-800/40 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
            <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">pie_chart</span>
            <h4 className="font-bold text-slate-700 dark:text-slate-300">Nog geen evenementen</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Er zijn nog geen evenementen ingegeven voor werkjaar {selectedWerkjaar}.
            </p>
            {canEdit && (
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setSyncSelectedFormId('');
                    setSyncTargetMode('new');
                    setSyncTargetEventId('');
                    setShowSyncFormModal(true);
                  }}
                  className="px-4 py-2 bg-orange-50 hover:bg-orange-100 text-primary dark:bg-orange-950/40 border border-primary/30 font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer"
                >
                  Koppel inschrijvingsgeld
                </button>
                <button
                  type="button"
                  onClick={openAddEvent}
                  className="px-4 py-2 bg-primary text-white font-bold rounded-xl text-xs shadow-xs hover:bg-primary/90 transition-colors cursor-pointer"
                >
                  Voeg eerste evenement toe
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredEvents.map(event => (
              <div
                key={event.id}
                className="bg-white dark:bg-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative group"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h4 className="font-black text-base text-slate-900 dark:text-white leading-tight">
                      {event.name}
                    </h4>
                    <span className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <span className="material-symbols-outlined text-[13px]">calendar_today</span>
                      {new Date(event.date).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setViewingEventVerslag(event)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 dark:hover:bg-primary/10 transition-colors"
                      title="Financieel Verslag (PDF / Print)"
                    >
                      <span className="material-symbols-outlined text-sm">print</span>
                    </button>
                    {canEdit && (
                      <>
                        <button
                          onClick={() => openEditEvent(event)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 dark:hover:bg-primary/10 transition-colors"
                          title="Bewerken"
                        >
                          <span className="material-symbols-outlined text-sm">edit</span>
                        </button>
                        <button
                          onClick={() => setDeleteEventId(event.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Verwijderen"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Taartdiagram */}
                <div className="my-2">
                  <EventDonutChart
                    event={event}
                    onMobileClick={() => setMobileBreakdownEvent(event)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          MODAL: EVENEMENT TOEVOEGEN / BEWERKEN
          ───────────────────────────────────────────────────────────────────────────── */}
      {showEventModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  {editingEventId ? 'Evenement Bewerken' : 'Nieuw Evenement'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Vul de inkomsten en uitgaven live in tijdens of na het evenement.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenEventVerslagFromForm}
                  className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Verslag van dit evenement bekijken en exporteren als PDF"
                >
                  <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                  <span className="hidden sm:inline">Verslag Exporteren (PDF)</span>
                  <span className="sm:hidden">Verslag</span>
                </button>
                <button
                  onClick={() => setShowEventModal(false)}
                  className="size-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-700 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 px-3 sm:px-6 gap-1.5 sm:gap-2 shrink-0 bg-slate-50 dark:bg-slate-900/30 overflow-x-auto no-scrollbar">
              {[
                { id: 'algemeen', label: '1. Algemeen', icon: 'info' },
                { id: 'inschrijvingen', label: '2. Inschrijvingen & Drank', icon: 'payments' },
                { id: 'overig', label: '3. Overige Inkomsten', icon: 'savings' },
                { id: 'uitgaven', label: '4. Uitgaven', icon: 'receipt_long' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-2.5 sm:py-3 px-2.5 sm:px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEvent} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
              {/* TAB 1: ALGEMEEN */}
              {activeTab === 'algemeen' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Naam van het evenement *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="bv. IKAA 2025, Gewestweekend, Fuif..."
                      value={eventForm.name}
                      onChange={e => setEventForm({ ...eventForm, name: e.target.value })}
                      className={inputClass}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Datum van het evenement *
                      </label>
                      <input
                        type="date"
                        required
                        value={eventForm.date}
                        onChange={e => {
                          const newDate = e.target.value;
                          setEventForm({
                            ...eventForm,
                            date: newDate,
                            werkjaar: computeWerkjaar(newDate)
                          });
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Werkjaar (berekend op basis van datum)
                      </label>
                      <select
                        value={eventForm.werkjaar}
                        onChange={e => setEventForm({ ...eventForm, werkjaar: e.target.value })}
                        className={inputClass}
                      >
                        {availableWerkjaren.map(w => (
                          <option key={w} value={w}>Werkjaar {w}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1">Loopt van 1 oktober t/m 30 september</p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: INSCHRIJVINGEN & DRANK */}
              {activeTab === 'inschrijvingen' && (
                <div className="space-y-4">
                  {/* Koppeling met online Inschrijvingsformulier */}
                  <div className="p-4 bg-orange-50/70 dark:bg-orange-950/20 rounded-2xl border border-orange-200/80 dark:border-orange-900/40 space-y-3">
                    <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
                      <span className="material-symbols-outlined text-base">link</span>
                      <span>Koppeling met Inschrijvingsformulier (Automatisch Inschrijvingsgeld)</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Selecteer een formulier van de website om de ontvangen inschrijvingsgelden en deelnemersaantallen automatisch in te vullen in de kas.
                    </p>

                    {availableForms.length === 0 ? (
                      <div className="p-3 bg-white/80 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-500">
                        Nog geen inschrijvingsformulieren aangemaakt. Ga naar <strong className="text-slate-700 dark:text-slate-300">Formulieren</strong> in het zijmenu om een formulier aan te maken.
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <select
                            value={selectedFormId}
                            onChange={e => {
                              const val = e.target.value ? Number(e.target.value) : '';
                              setSelectedFormId(val);
                              if (val) {
                                const found = availableForms.find(f => f.id === val);
                                if (found) {
                                  setEventForm(prev => ({
                                    ...prev,
                                    inschrijvingLeden: Number(found.autoLedenAmount) || 0,
                                    inschrijvingLeiding: Number(found.autoLeidingAmount) || 0,
                                    forfaitDrank: Number(found.autoDrankForfaitAmount) || 0,
                                  }));
                                }
                              }
                            }}
                            className={`${inputClass} flex-1`}
                          >
                            <option value="">-- Kies een inschrijvingsformulier om te koppelen --</option>
                            {availableForms.map(f => (
                              <option key={f.id} value={f.id}>
                                {f.title} ({f.totalSubmissions} inzendingen{f.requirePayment ? ` • ${f.paidSubmissions} betaald = €${f.totalPaidAmount.toFixed(2)}` : ''})
                              </option>
                            ))}
                          </select>
                          {selectedFormId && (
                            <button
                              type="button"
                              onClick={() => {
                                const found = availableForms.find(f => f.id === Number(selectedFormId));
                                if (found) {
                                  setEventForm(prev => ({
                                    ...prev,
                                    inschrijvingLeden: Number(found.autoLedenAmount) || 0,
                                    inschrijvingLeiding: Number(found.autoLeidingAmount) || 0,
                                    forfaitDrank: Number(found.autoDrankForfaitAmount) || 0,
                                  }));
                                }
                              }}
                              className="px-4 py-2.5 bg-primary hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
                              title="Cijfers opnieuw overnemen"
                            >
                              <span className="material-symbols-outlined text-base">sync</span>
                              <span>Opnieuw overnemen</span>
                            </button>
                          )}
                        </div>

                        {selectedFormId && (() => {
                          const found = availableForms.find(f => f.id === Number(selectedFormId));
                          if (!found) return null;
                          return (
                            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                              <span className="px-2.5 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300">
                                👥 {found.totalSubmissions} inschrijvingen ({found.ledenCount || 0} leden, {found.leidingCount || 0} leiding)
                              </span>
                              <span className="px-2.5 py-1 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 rounded-lg font-bold">
                                Leden: {formatEuro(found.autoLedenAmount || 0)}
                              </span>
                              <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-lg font-bold">
                                Leiding: {formatEuro(found.autoLeidingAmount || 0)}
                              </span>
                              {(found.autoDrankForfaitAmount || 0) > 0 && (
                                <span className="px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 rounded-lg font-bold">
                                  🍺 Drankforfait: {formatEuro(found.autoDrankForfaitAmount || 0)}
                                </span>
                              )}
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 ml-auto">
                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                Cijfers overgenomen
                              </span>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>

                  <div className="p-4 bg-blue-50/60 dark:bg-blue-950/20 rounded-2xl border border-blue-100 dark:border-blue-900/40">
                    <label className="block text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300 mb-1">
                      Inschrijvingsgeld leden (€)
                    </label>
                    <p className="text-xs text-blue-700/80 dark:text-blue-400 mb-2">
                      Totaal aan inschrijvingsgelden betaald door leden of groepen.
                    </p>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={eventForm.inschrijvingLeden || ''}
                      onChange={e => setEventForm({ ...eventForm, inschrijvingLeden: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className={inputClass}
                    />
                  </div>

                  <div className="p-4 bg-indigo-50/60 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/40">
                    <label className="block text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300 mb-1">
                      Inschrijvingsgeld leiding (€)
                    </label>
                    <p className="text-xs text-indigo-700/80 dark:text-indigo-400 mb-2">
                      Bijdragen betaald door leiding (inschrijvingsgeld / weekendkost).
                    </p>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={eventForm.inschrijvingLeiding || ''}
                      onChange={e => setEventForm({ ...eventForm, inschrijvingLeiding: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className={inputClass}
                    />
                  </div>

                  <div className="p-4 bg-amber-50/60 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-900/40">
                    <label className="block text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300 mb-1">
                      Forfait drank leiding (€)
                    </label>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400 mb-2">
                      Vaste drankbijdrage van de leiding (0€, 5€ of 10€) gekoppeld aan de formulieren.
                    </p>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={eventForm.forfaitDrank || ''}
                      onChange={e => setEventForm({ ...eventForm, forfaitDrank: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className={inputClass}
                    />
                  </div>

                  <div className="p-4 bg-orange-50/60 dark:bg-orange-950/20 rounded-2xl border border-orange-100 dark:border-orange-900/40">
                    <label className="block text-xs font-bold uppercase tracking-wider text-orange-900 dark:text-orange-300 mb-1">
                      Inkomsten drank (bar / tap) (€)
                    </label>
                    <p className="text-xs text-orange-700/80 dark:text-orange-400 mb-2">
                      Inkomsten van drankverkoop aan leden of bezoekers tijdens het evenement / tooginkomsten.
                    </p>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={eventForm.inkomstenDrank || ''}
                      onChange={e => setEventForm({ ...eventForm, inkomstenDrank: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: OVERIGE INKOMSTEN */}
              {activeTab === 'overig' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-slate-500">
                      Voeg extra inkomstenposten toe (sponsoring, eetfestijn verkoop, bonnetjes, etc.).
                    </p>
                    <button
                      type="button"
                      onClick={() => setEventForm({
                        ...eventForm,
                        overigeInkomsten: [...eventForm.overigeInkomsten, { description: '', amount: 0 }]
                      })}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1 hover:bg-emerald-100 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      Inkomstenpost
                    </button>
                  </div>

                  {eventForm.overigeInkomsten.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-xs">
                      Nog geen overige inkomsten toegevoegd.
                    </div>
                  ) : (
                    eventForm.overigeInkomsten.map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="Omschrijving (bv. Sponsoring, Tombola...)"
                          value={item.description}
                          onChange={e => {
                            const updated = [...eventForm.overigeInkomsten];
                            updated[idx].description = e.target.value;
                            setEventForm({ ...eventForm, overigeInkomsten: updated });
                          }}
                          className={`${inputClass} flex-1`}
                        />
                        <div className="w-32 relative">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Bedrag (€)"
                            value={item.amount || ''}
                            onChange={e => {
                              const updated = [...eventForm.overigeInkomsten];
                              updated[idx].amount = parseFloat(e.target.value) || 0;
                              setEventForm({ ...eventForm, overigeInkomsten: updated });
                            }}
                            className={inputClass}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = eventForm.overigeInkomsten.filter((_, i) => i !== idx);
                            setEventForm({ ...eventForm, overigeInkomsten: updated });
                          }}
                          className="size-9 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center shrink-0"
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 4: UITGAVEN */}
              {activeTab === 'uitgaven' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-slate-500">
                      Voeg alle uitgaven toe (locatiehuur, drankleverancier, inkleding, eten, etc.).
                    </p>
                    <button
                      type="button"
                      onClick={() => setEventForm({
                        ...eventForm,
                        uitgaven: [...eventForm.uitgaven, { description: '', amount: 0 }]
                      })}
                      className="px-3 py-1.5 bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 text-xs font-bold rounded-xl flex items-center gap-1 hover:bg-rose-100 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      Uitgavenpost
                    </button>
                  </div>

                  {eventForm.uitgaven.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-xs">
                      Nog geen uitgaven toegevoegd.
                    </div>
                  ) : (
                    eventForm.uitgaven.map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="Omschrijving (bv. Huur zaal, Colruyt, Brouwerij...)"
                          value={item.description}
                          onChange={e => {
                            const updated = [...eventForm.uitgaven];
                            updated[idx].description = e.target.value;
                            setEventForm({ ...eventForm, uitgaven: updated });
                          }}
                          className={`${inputClass} flex-1`}
                        />
                        <div className="w-32 relative">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Bedrag (€)"
                            value={item.amount || ''}
                            onChange={e => {
                              const updated = [...eventForm.uitgaven];
                              updated[idx].amount = parseFloat(e.target.value) || 0;
                              setEventForm({ ...eventForm, uitgaven: updated });
                            }}
                            className={inputClass}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = eventForm.uitgaven.filter((_, i) => i !== idx);
                            setEventForm({ ...eventForm, uitgaven: updated });
                          }}
                          className="size-9 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center shrink-0"
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Live Preview Balans */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-wrap justify-between items-center gap-4 text-xs font-bold">
                <div className="flex gap-4">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Inkomsten: {formatEuro(liveTotalIncome)}
                  </span>
                  <span className="text-rose-600 dark:text-rose-400">
                    Uitgaven: {formatEuro(liveTotalExpense)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Geschatte Winst:</span>
                  <span className={`text-sm font-black ${
                    liveNetProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {liveNetProfit >= 0 ? `+${formatEuro(liveNetProfit)}` : formatEuro(liveNetProfit)}
                  </span>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-between items-center gap-2 sm:gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleOpenEventVerslagFromForm}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-primary/30 text-primary hover:bg-primary/10 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Bekijk of print het financieel verslag van dit evenement"
                >
                  <span className="material-symbols-outlined text-base">print</span>
                  <span>Verslag / PDF Bekijken</span>
                </button>

                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setShowEventModal(false)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer text-center"
                  >
                    Annuleren
                  </button>
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary text-white font-bold text-xs shadow-md shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer text-center"
                  >
                    {editingEventId ? 'Wijzigingen Opslaan' : 'Evenement Opslaan'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          MODAL: SALDO AANPASSEN
          ───────────────────────────────────────────────────────────────────────────── */}
      {showBalanceModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-md p-5 sm:p-6 border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mb-1.5">
              Saldo Gewestrekening Bijwerken
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Geef het actuele saldo in zoals vermeld op het bankuittreksel.
            </p>

            <form onSubmit={handleUpdateBalance} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Nieuw Saldo (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newBalanceInput}
                  onChange={e => setNewBalanceInput(e.target.value)}
                  className={inputClass}
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBalanceModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-sm hover:bg-primary/90 cursor-pointer"
                >
                  Opslaan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          MODAL: BEVESTIG VERWIJDEREN
          ───────────────────────────────────────────────────────────────────────────── */}
      {deleteEventId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-6 max-w-sm w-full border border-slate-200 dark:border-slate-700 shadow-xl text-center">
            <div className="size-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-2xl">delete</span>
            </div>
            <h4 className="font-bold text-slate-900 dark:text-white text-base mb-1">Evenement Verwijderen?</h4>
            <p className="text-xs text-slate-500 mb-5">
              Weet je zeker dat je dit evenement en de bijbehorende financiële data wilt wissen? Dit kan niet ongedaan worden gemaakt.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setDeleteEventId(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Annuleren
              </button>
              <button
                onClick={handleDeleteEvent}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 shadow-sm cursor-pointer"
              >
                Verwijderen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          MODAL: JAARVERSLAG EXPORT
          ───────────────────────────────────────────────────────────────────────────── */}
      {showJaarverslagModal && (
        <JaarverslagModal
          open={showJaarverslagModal}
          onClose={() => setShowJaarverslagModal(false)}
          werkjaar={selectedWerkjaar}
          events={filteredEvents}
          bankBalance={settings.bankBalance || 0}
          penningmeester={penningmeester}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          MODAL: SPECIFIEK EVENEMENT VERSLAG EXPORT
          ───────────────────────────────────────────────────────────────────────────── */}
      {viewingEventVerslag && (
        <EventVerslagModal
          event={viewingEventVerslag}
          onClose={() => setViewingEventVerslag(null)}
          penningmeester={penningmeester}
          bankBalance={settings.bankBalance || 0}
          availableForms={availableForms}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          MODAL: SNEL INSCHRIJVINGSGELD KOPPELEN / SYNC
          ───────────────────────────────────────────────────────────────────────────── */}
      {showSyncFormModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg p-5 sm:p-8 border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200 space-y-5">
            <div className="flex justify-between items-start">
              <div>
                <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2">
                  <span className="material-symbols-outlined text-xl">sync</span>
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  Inschrijvingsgeld Koppelen & Sync
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Neem de ontvangen inschrijvingsgelden van een online formulier automatisch over in de kas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncFormModal(false)}
                className="size-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-700 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <form onSubmit={handleExecuteSync} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  1. Kies het inschrijvingsformulier *
                </label>
                {availableForms.length === 0 ? (
                  <p className="text-xs text-slate-400 p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700">
                    Geen inschrijvingsformulieren gevonden. Maak eerst een formulier aan onder Formulierenbeheer.
                  </p>
                ) : (
                  <select
                    required
                    value={syncSelectedFormId}
                    onChange={e => {
                      const val = e.target.value ? Number(e.target.value) : '';
                      setSyncSelectedFormId(val);
                      if (val) {
                        const found = availableForms.find(f => f.id === val);
                        if (found) {
                          setSyncLedenAmount((found.autoLedenAmount || 0).toFixed(2));
                          setSyncLeidingAmount((found.autoLeidingAmount || 0).toFixed(2));
                          setSyncDrankForfaitAmount((found.autoDrankForfaitAmount || 0).toFixed(2));
                        }
                      } else {
                        setSyncLedenAmount('');
                        setSyncLeidingAmount('');
                        setSyncDrankForfaitAmount('');
                      }
                    }}
                    className={inputClass}
                  >
                    <option value="">-- Selecteer een inschrijvingsformulier --</option>
                    {availableForms.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.title} ({f.totalSubmissions} inzendingen: {f.ledenCount || 0} leden, {f.leidingCount || 0} leiding • {f.paidSubmissions} betaald = €{f.totalPaidAmount.toFixed(2)})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Geselecteerde formulier samenvatting & aanpasbare bedragen */}
              {syncSelectedFormId && (() => {
                const found = availableForms.find(f => f.id === Number(syncSelectedFormId));
                if (!found) return null;
                const totSync = (parseFloat(syncLedenAmount) || 0) + (parseFloat(syncLeidingAmount) || 0) + (parseFloat(syncDrankForfaitAmount) || 0);
                return (
                  <div className="p-4 bg-orange-50/70 dark:bg-orange-950/20 rounded-2xl border border-orange-200/80 dark:border-orange-900/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="block text-xs font-bold uppercase text-primary">Te importeren inkomsten</span>
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        Totaal: {formatEuro(totSync)}
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-1">
                      <span>{found.title} ({found.totalSubmissions} inschrijvingen: {found.ledenCount || 0} leden, {found.leidingCount || 0} leiding)</span>
                      {found.requirePayment && (
                        <span>{found.paidSubmissions} betaald à €{found.paymentAmount.toFixed(2)} p.p.</span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                      {/* Leden */}
                      <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-blue-200 dark:border-blue-900/50">
                        <label className="block text-[11px] font-bold text-blue-900 dark:text-blue-300 mb-1">
                          Inschrijving Leden (€) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={syncLedenAmount}
                          onChange={e => setSyncLedenAmount(e.target.value)}
                          className={inputClass}
                          placeholder="0.00"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {found.ledenCount || 0} leden ({found.paidLedenCount || 0} betaald)
                        </span>
                      </div>

                      {/* Leiding */}
                      <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-indigo-200 dark:border-indigo-900/50">
                        <label className="block text-[11px] font-bold text-indigo-900 dark:text-indigo-300 mb-1">
                          Inschrijving Leiding (€) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={syncLeidingAmount}
                          onChange={e => setSyncLeidingAmount(e.target.value)}
                          className={inputClass}
                          placeholder="0.00"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {found.leidingCount || 0} leiding ({found.paidLeidingCount || 0} betaald)
                        </span>
                      </div>

                      {/* Forfait drank leiding */}
                      <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-amber-200 dark:border-amber-900/50">
                        <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1">
                          Forfait Drank Leiding (€) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={syncDrankForfaitAmount}
                          onChange={e => setSyncDrankForfaitAmount(e.target.value)}
                          className={inputClass}
                          placeholder="0.00"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Drankbijdragen (0€, 5€ of 10€)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  2. Waar wil je dit inschrijvingsgeld plaatsen?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setSyncTargetMode('new')}
                    className={`p-3 rounded-xl border text-left flex items-start gap-2 transition-all cursor-pointer ${
                      syncTargetMode === 'new'
                        ? 'border-primary bg-primary/10 text-primary font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base mt-0.5">add_circle</span>
                    <div>
                      <span className="block font-bold">Nieuw evenement</span>
                      <span className="text-[11px] font-normal opacity-80">Maak direct een nieuw evenement aan</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSyncTargetMode('existing')}
                    className={`p-3 rounded-xl border text-left flex items-start gap-2 transition-all cursor-pointer ${
                      syncTargetMode === 'existing'
                        ? 'border-primary bg-primary/10 text-primary font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base mt-0.5">edit_calendar</span>
                    <div>
                      <span className="block font-bold">Bestaand evenement</span>
                      <span className="text-[11px] font-normal opacity-80">Koppel aan een al aangemaakt evenement</span>
                    </div>
                  </button>
                </div>
              </div>

              {syncTargetMode === 'existing' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                    Selecteer bestaand evenement in werkjaar {selectedWerkjaar} *
                  </label>
                  {filteredEvents.length === 0 ? (
                    <p className="text-xs text-slate-400 p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
                      Geen evenementen in dit werkjaar. Kies 'Nieuw evenement'.
                    </p>
                  ) : (
                    <select
                      required
                      value={syncTargetEventId}
                      onChange={e => setSyncTargetEventId(e.target.value ? Number(e.target.value) : '')}
                      className={inputClass}
                    >
                      <option value="">-- Kies evenement in {selectedWerkjaar} --</option>
                      {filteredEvents.map(ev => (
                        <option key={ev.id} value={ev.id}>
                          {ev.name} ({new Date(ev.date).toLocaleDateString('nl-BE')})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowSyncFormModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={!syncSelectedFormId || syncLoading}
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base">download</span>
                  <span>{syncLoading ? 'Bezig met importeren...' : 'Inschrijvingsgeld Nu Importeren'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobiele Verdeling Menu (Enkel Mobile) */}
      {mobileBreakdownEvent && (
        <MobileDistributionModal
          event={mobileBreakdownEvent}
          onClose={() => setMobileBreakdownEvent(null)}
        />
      )}
    </div>
  );
}
