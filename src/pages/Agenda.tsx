import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { safeHref } from '../utils/safeUrl';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from 'react-helmet-async';
import { unescape, formatFullDate, parseNlDate, isEventPassed } from '../utils/date';
import { resolveEventDates } from '../utils/calendar';
import AddToCalendarMenu from '../components/AddToCalendarMenu';

interface Event {
  id: number;
  title: string;
  date: string;
  endDate?: string;
  time: string;
  location: string;
  type: string;
  website?: string;
}

export default function AgendaPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState('Alle');
  const [activeLocation, setActiveLocation] = useState('Alle');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch('/api/events');
        const data = await res.json();
        // Alleen aankomende/actieve evenementen tonen op de publieke agendapagina
        const upcoming = (data as Event[]).filter(e => !isEventPassed(e));
        const sorted = upcoming.sort((a: Event, b: Event) => {
          const timeA = parseNlDate(a.date)?.getTime() || 0;
          const timeB = parseNlDate(b.date)?.getTime() || 0;
          return timeA - timeB;
        });
        setEvents(sorted);
      } catch (error) {
        console.error('Error fetching events', error);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, []);

  const types = ['Alle', ...Array.from(new Set(events.map(e => e.type).filter(Boolean)))];
  const locations = ['Alle', ...Array.from(new Set(events.map(e => e.location).filter(Boolean)))];

  const filtered = events.filter(e => {
    const typeMatch = activeType === 'Alle' || e.type === activeType;
    const locationMatch = activeLocation === 'Alle' || e.location === activeLocation;
    return typeMatch && locationMatch;
  });

  return (
    <div className="relative flex min-h-screen flex-col bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display transition-colors duration-200">
      <Helmet>
        <title>Agenda | Gewest Reinaertland</title>
        <meta name="description" content="Bekijk de komende activiteiten, vergaderingen en evenementen van Gewest Reinaertland." />
        <link rel="canonical" href="https://reinaertland.be/agenda" />
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
              <Link className="text-sm font-semibold text-primary" to="/agenda">Agenda</Link>
              <Link className="text-sm font-semibold hover:text-primary transition-colors" to="/inschrijvingen">Inschrijvingen</Link>
              <Link className="text-sm font-semibold hover:text-primary transition-colors" to="/#groepen">Groepen</Link>
              <Link className="text-sm font-semibold hover:text-primary transition-colors" to="/fotos">Foto's</Link>
              <a className="text-sm font-semibold hover:text-primary transition-colors" href="/#contact">Contact</a>
            </nav>
            <div className="flex items-center gap-4">
              <Link to="/login" className="hidden sm:flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">
                  Login Gewestleiding
              </Link>
              <button className="md:hidden flex items-center justify-center p-2 text-slate-600 dark:text-slate-300 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      onClick={() => setMobileMenuOpen(true)}>
                  <span className="material-symbols-outlined">menu</span>
              </button>
            </div>
        </div>
      </header>

      {/* Overlay & Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 h-full w-72 bg-white dark:bg-slate-950 z-50 shadow-2xl flex flex-col md:hidden border-r border-slate-200 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <img src="/img/logo.png" alt="Logo" className="size-10 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
                  <h2 className="font-bold text-slate-800 dark:text-white leading-tight">Reinaertland</h2>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="size-10 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 shadow-sm">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
              
              <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                {[
                  { to: '/agenda', label: 'Agenda', icon: 'event', type: 'link', active: true },
                  { to: '/inschrijvingen', label: 'Inschrijvingen', icon: 'assignment', type: 'link', active: false },
                  { to: '/#groepen', label: 'Groepen', icon: 'groups', type: 'anchor' },
                  { to: '/fotos', label: 'Foto\'s', icon: 'photo_library', type: 'link' },
                  { to: '/#contact', label: 'Contact', icon: 'mail', type: 'anchor' },
                ].map((item) => {
                  const content = (
                    <div className={`flex items-center gap-4 px-4 py-4 rounded-xl transition-colors border border-transparent font-bold text-lg ${
                      item.active 
                        ? 'bg-primary/5 text-primary border-primary/10' 
                        : 'hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-100 dark:hover:border-slate-800'
                    }`}>
                      <span className={`material-symbols-outlined ${item.active ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}`}>{item.icon}</span>
                      {item.label}
                    </div>
                  );
                  return item.type === 'link' ? (
                    <Link key={item.label} to={item.to} onClick={() => setMobileMenuOpen(false)}>{content}</Link>
                  ) : (
                    <a key={item.label} href={item.to} onClick={() => setMobileMenuOpen(false)}>{content}</a>
                  );
                })}
              </nav>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800">
                <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary py-4 font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">
                  <span className="material-symbols-outlined text-sm">login</span>
                  Login Gewestleiding
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="flex-grow">
        {/* Hero */}
        <section className="relative px-4 py-16 md:py-20 lg:px-20 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-30">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent-blue/20 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2"></div>
          </div>
          <div className="mx-auto max-w-7xl relative">
            <Link to="/" className="group inline-flex items-center gap-2 text-slate-500 hover:text-primary transition-colors font-medium bg-white dark:bg-slate-900 px-4 py-2 rounded-full shadow-sm border border-slate-200 dark:border-slate-800 mb-8">
                <span className="material-symbols-outlined text-base group-hover:-translate-x-1 transition-transform">arrow_back</span>
                Terug naar home
            </Link>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-bold mb-4">
                  <span className="material-symbols-outlined text-base">calendar_month</span>
                  Volledige Agenda
                </div>
                <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white leading-tight">
                  Activiteiten van<br />
                  <span className="text-primary">Gewest Reinaertland</span>
                </h1>
                <p className="mt-4 text-lg text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
                  Blijf op de hoogte van alle vergaderingen, vormingen en evenementen in ons gewest.
                </p>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
                <span className="material-symbols-outlined text-primary">event_available</span>
                <span><span className="font-bold text-slate-800 dark:text-white">{events.length}</span> activiteit(en) gepland</span>
              </div>
            </div>
          </div>
        </section>

        {/* Filters */}
        <div className="sticky top-[73px] z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 lg:px-20 overflow-x-auto scrollbar-hide shadow-sm">
          <div className="mx-auto max-w-7xl py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2 sm:pb-0">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2 shrink-0">Activiteit:</span>
              {types.map(t => (
                <button key={t} onClick={() => setActiveType(t)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                    activeType === t ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="h-px w-full sm:h-6 sm:w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2 shrink-0">Locatie:</span>
              {locations.map(l => (
                <button key={l} onClick={() => setActiveLocation(l)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                    activeLocation === l ? 'bg-accent-blue text-white shadow-md shadow-accent-blue/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Events Grid */}
        <section className="px-4 py-12 lg:px-20 min-h-[400px]">
          <div className="mx-auto max-w-7xl">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="h-48 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse"></div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 border border-slate-100 dark:border-slate-700">
                  <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600">event_busy</span>
                </div>
                <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">
                  {events.length === 0 ? 'Geen geplande activiteiten' : 'Geen resultaten'}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 max-w-sm">
                  {events.length === 0
                    ? 'Er zijn momenteel geen activiteiten gepland. Kom binnenkort gerust nog eens een kijkje nemen!'
                    : 'Er zijn geen activiteiten die voldoen aan je gekozen filters.'}
                </p>
                {events.length > 0 && (
                  <button onClick={() => { setActiveType('Alle'); setActiveLocation('Alle'); }}
                          className="mt-6 text-primary font-bold hover:underline">
                    Filters resetten
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filtered.map(item => {
                  const dateObj = parseNlDate(item.date);
                  const month = dateObj ? dateObj.toLocaleString('nl-BE', { month: 'short' }).toUpperCase() : '???';
                  const startDay = item.date.split(' ')[0];
                  const endDay = item.endDate ? item.endDate.split(' ')[0] : null;
                  const displayDay = endDay && endDay !== startDay ? `${startDay}-${endDay}` : startDay;
                  
                  const content = (
                    <div className="group h-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col relative cursor-pointer">
                      {/* Decorative accent */}
                      <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r ${item.type === 'Vergadering' ? 'from-primary to-orange-300' : 'from-accent-blue to-blue-300'}`}></div>
                      
                      <div className="flex items-start gap-5 mb-6">
                        <div className="flex flex-col items-center justify-center w-16 h-16 bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 rounded-xl shrink-0 overflow-hidden shadow-sm group-hover:border-primary/30 transition-colors">
                          <span className="text-[10px] font-black text-primary uppercase bg-slate-100 dark:bg-slate-800 w-full text-center py-1 border-b border-slate-200 dark:border-slate-600 leading-none">{month}</span>
                          <span className={`font-black text-slate-800 dark:text-white leading-none flex-1 flex items-center justify-center w-full px-1 text-center tracking-tighter ${displayDay.length > 2 ? 'text-sm' : 'text-xl'}`}>{displayDay}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap gap-2 mb-2">
                            <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-wider rounded-md">{item.type}</span>
                            {item.endDate && <span className="px-2 py-0.5 bg-accent-blue/10 text-accent-blue text-[10px] font-black uppercase tracking-wider rounded-md">Meerdaags</span>}
                          </div>
                          <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-tight group-hover:text-primary transition-colors">{unescape(item.title)}</h3>
                        </div>
                      </div>

                      <div className="space-y-3 mt-auto pt-6 border-t border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 p-2 rounded-lg border border-slate-50 dark:border-slate-600">
                          <span className="material-symbols-outlined text-[18px] text-slate-400">calendar_today</span>
                          <span className="font-medium">{formatFullDate(item.date)} {item.endDate ? ` t/m ${formatFullDate(item.endDate)}` : ''}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-1.5 flex-1">
                            <span className="material-symbols-outlined text-[18px] text-slate-400">schedule</span>
                            <span>{item.time || 'N.t.b.'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-1">
                            <span className="material-symbols-outlined text-[18px] text-slate-400">location_on</span>
                            <span className="truncate" title={unescape(item.location)}>{unescape(item.location)}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60 mt-2">
                          {safeHref(item.website) ? (
                            <a
                              href={safeHref(item.website)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:gap-2 transition-all group/btn"
                            >
                              <span>Meer info</span>
                              <span className="material-symbols-outlined text-sm">arrow_forward</span>
                            </a>
                          ) : (
                            <span className="text-[11px] text-slate-400">Reinaertland</span>
                          )}

                          <AddToCalendarMenu
                            event={{
                              title: unescape(item.title),
                              description: `${unescape(item.title)} - Gewest Reinaertland${item.website ? ' • ' + item.website : ''}`,
                              location: unescape(item.location) || 'Gewest Reinaertland',
                              ...resolveEventDates(item),
                            }}
                            compact
                          />
                        </div>
                      </div>
                    </div>
                  );

                  return (
                    <div key={item.id} className="h-full">
                      {content}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
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
    </div>
  );
}
