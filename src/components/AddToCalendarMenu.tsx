import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CalendarEventData,
  buildGoogleCalendarUrl,
  generateIcsContent,
  downloadIcsFile,
} from '../utils/calendar';

interface AddToCalendarMenuProps {
  event: CalendarEventData;
  compact?: boolean;
  className?: string;
}

export default function AddToCalendarMenu({
  event,
  compact = false,
  className = '',
}: AddToCalendarMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const handleAppleCalendar = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const ics = generateIcsContent(event);
    downloadIcsFile(event.title, ics);
    setOpen(false);
  };

  const handleGoogleCalendar = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const url = buildGoogleCalendarUrl(event);
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left ${open ? 'z-50' : 'z-20'} ${className}`}
      onClick={e => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={`inline-flex items-center gap-1.5 font-bold transition-all rounded-xl cursor-pointer ${
          compact
            ? 'px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-600'
            : 'px-4 py-2 text-xs sm:text-sm bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/40 dark:hover:bg-orange-900/50 text-primary border border-primary/20 shadow-xs'
        }`}
        title="Voeg dit evenement toe aan je iPhone of Google kalender"
      >
        <span className="material-symbols-outlined text-base">calendar_month</span>
        <span>Zet in agenda</span>
        <span
          className="material-symbols-outlined text-xs transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        >
          expand_more
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 4 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 bottom-full mb-2 w-60 rounded-2xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 p-1.5 z-50 text-left"
          >
            <div className="px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700/60 mb-1">
              Kies je kalender
            </div>

            {/* Apple Calendar (iPhone / iPad / Mac) */}
            <button
              type="button"
              onClick={handleAppleCalendar}
              className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-orange-50 dark:hover:bg-slate-700 flex items-center gap-2.5 transition-colors cursor-pointer group"
            >
              <span className="size-6 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 group-hover:bg-primary group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-sm">phone_iphone</span>
              </span>
              <div>
                <span className="block leading-tight">Apple Agenda</span>
                <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">iPhone, iPad &amp; Mac</span>
              </div>
            </button>

            {/* Google Calendar */}
            <button
              type="button"
              onClick={handleGoogleCalendar}
              className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-orange-50 dark:hover:bg-slate-700 flex items-center gap-2.5 transition-colors cursor-pointer group"
            >
              <span className="size-6 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 group-hover:bg-primary group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-sm">calendar_today</span>
              </span>
              <div>
                <span className="block leading-tight">Google Agenda</span>
                <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">Android &amp; Browser</span>
              </div>
            </button>

            {/* Outlook / Overige .ics */}
            <button
              type="button"
              onClick={handleAppleCalendar}
              className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-2.5 transition-colors cursor-pointer"
            >
              <span className="size-6 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 text-sm">
                <span className="material-symbols-outlined text-sm">download</span>
              </span>
              <span className="text-[11px]">Download .ics bestand</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Directe actieknoppen voor weergave op bedankpagina's (zoals na inschrijving).
 */
export function AddToCalendarButtons({
  event,
  className = '',
}: {
  event: CalendarEventData;
  className?: string;
}) {
  const handleApple = () => {
    const ics = generateIcsContent(event);
    downloadIcsFile(event.title, ics);
  };

  const handleGoogle = () => {
    const url = buildGoogleCalendarUrl(event);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 ${className}`}>
      <button
        type="button"
        onClick={handleApple}
        className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
      >
        <span className="material-symbols-outlined text-base">phone_iphone</span>
        <span>Apple Agenda (iPhone / Mac)</span>
      </button>

      <button
        type="button"
        onClick={handleGoogle}
        className="px-4 py-2.5 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold text-xs rounded-xl border border-slate-300 dark:border-slate-600 transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
      >
        <span className="material-symbols-outlined text-base text-primary">calendar_month</span>
        <span>Google Agenda</span>
      </button>
    </div>
  );
}
