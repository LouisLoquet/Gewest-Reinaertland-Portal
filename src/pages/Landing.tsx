import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { safeHref, safeImageUrl } from '../utils/safeUrl';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from 'react-helmet-async';
import { parseNlDate, isEventPassed } from '../utils/date';

interface Album {
  id: number;
  title: string;
  description: string;
  url: string;
  coverImage: string;
  year: string;
  category: string;
}

export default function Landing() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [agendaItems, setAgendaItems] = useState<any[]>([]);
  const [recentAlbums, setRecentAlbums] = useState<Album[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch('/api/events');
        const events = await res.json();
        // Alleen aankomende/actieve evenementen tonen op de landingspagina
        const upcoming = (events as any[]).filter(e => !isEventPassed(e));
        upcoming.sort((a: any, b: any) => {
          const timeA = parseNlDate(a.date)?.getTime() || 0;
          const timeB = parseNlDate(b.date)?.getTime() || 0;
          return timeA - timeB;
        });
        setAgendaItems(upcoming);
      } catch (error) {
        console.error("Error fetching events", error);
      }
    };
    const fetchAlbums = async () => {
      try {
        const res = await fetch('/api/albums');
        const data = await res.json();
        setRecentAlbums(data.slice(0, 3));
      } catch (error) {
        console.error("Error fetching albums", error);
      }
    };
    fetchEvents();
    fetchAlbums();
  }, []);

  const nextSlide = () => {
    if (currentIndex + 3 < agendaItems.length) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const prevSlide = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const displayedAgenda = agendaItems.slice(currentIndex, currentIndex + 3);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !message) return;
    setStatus('submitting');
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message, createdAt: new Date().toISOString() })
      });
      setStatus('success');
      setName(''); setEmail(''); setMessage('');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (error) {
      console.error("Error sending message", error);
      setStatus('error');
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display transition-colors duration-200">
      <Helmet>
        <title>Gewest Reinaertland | De schakel voor Chirogroepen</title>
        <meta name="description" content="Welkom bij Gewest Reinaertland. Ontdek onze agenda, foto's en de Chirogroepen uit Stekene, Sinaai, Kemzeke en omstreken." />
        <link rel="canonical" href="https://reinaertland.be/" />
      </Helmet>
      {/* Header / Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-background-dark/80 px-4 md:px-10 lg:px-20 py-4 shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-white overflow-hidden">
            <img src="/img/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Gewest Reinaertland</h2>
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          <Link className="text-sm font-semibold hover:text-primary transition-colors" to="/agenda">Agenda</Link>
          <Link className="text-sm font-semibold hover:text-primary transition-colors" to="/inschrijvingen">Inschrijvingen</Link>
          <a className="text-sm font-semibold hover:text-primary transition-colors" href="#groepen">Groepen</a>
          <Link className="text-sm font-semibold hover:text-primary transition-colors" to="/fotos">Foto's</Link>
          <a className="text-sm font-semibold hover:text-primary transition-colors" href="#contact">Contact</a>
        </nav>
        <div className="flex items-center gap-3">
          <a
            href="https://www.facebook.com/groups/1312772738595372/"
            target="_blank"
            rel="noopener noreferrer"
            title="Facebookgroep Gewest Reinaertland"
            className="flex items-center justify-center size-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-[#1877F2] hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-200 dark:border-blue-900 shadow-sm"
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </a>
          <Link to="/login" className="hidden sm:flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
            Login Gewestleiding
          </Link>
          <button className="md:hidden flex items-center justify-center p-2 text-slate-600 dark:text-slate-300 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  onClick={() => setMobileMenuOpen(true)}>
            <span className="material-symbols-outlined">menu</span>
          </button>
        </div>
      </div>
    </header>

    {/* Overlay */}
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
                { to: '/agenda', label: 'Agenda', icon: 'event', type: 'link' },
                { to: '/inschrijvingen', label: 'Inschrijvingen', icon: 'assignment', type: 'link' },
                { to: '/#groepen', label: 'Groepen', icon: 'groups', type: 'anchor' },
                { to: '/fotos', label: 'Foto\'s', icon: 'photo_library', type: 'link' },
                { to: '/#contact', label: 'Contact', icon: 'mail', type: 'anchor' },
                { to: 'https://www.facebook.com/groups/1312772738595372/', label: 'Facebookgroep', icon: 'public', type: 'external' },
              ].map((item) => {
                const content = (
                  <div className="flex items-center gap-4 px-4 py-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold text-lg transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-800">
                    <span className="material-symbols-outlined text-primary">{item.icon}</span>
                    {item.label}
                  </div>
                );
                if (item.type === 'external') {
                  return (
                    <a key={item.label} href={item.to} target="_blank" rel="noopener noreferrer" onClick={() => setMobileMenuOpen(false)}>
                      {content}
                    </a>
                  );
                }
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

      <main className="flex-grow overflow-x-hidden">
        {/* Hero Section */}
        <section className="relative px-4 py-16 md:py-24 lg:px-20">
          <div className="mx-auto max-w-7xl">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
              <div className="flex flex-col gap-8">
                <h1 className="text-5xl font-black leading-tight tracking-tight text-slate-900 dark:text-white md:text-6xl lg:text-7xl">
                  Welkom bij <span className="text-primary">Gewest</span> Reinaertland
                </h1>
                <p className="text-lg leading-relaxed text-slate-600 dark:text-slate-400 md:text-xl">
                  De ondersteunende schakel voor alle Chirogroepen in onze regio.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link to="/agenda" className="flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-lg font-bold text-white hover:scale-[1.02] transition-transform shadow-lg shadow-primary/20">
                    <span className="material-symbols-outlined">calendar_month</span>
                    Bekijk onze agenda
                  </Link>
                  <a href="#groepen" className="flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-8 py-4 text-lg font-bold text-slate-900 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                    Ontdek onze groepen
                  </a>
                </div>

                {/* Facebook Community Callout */}
                <a
                  href="https://www.facebook.com/groups/1312772738595372/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 p-3.5 px-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 hover:bg-blue-100/80 dark:hover:bg-blue-900/40 transition-all text-slate-700 dark:text-slate-200 group w-fit shadow-xs"
                >
                  <div className="size-8 rounded-full bg-[#1877F2] text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </div>
                  <div className="text-left text-xs sm:text-sm">
                    <span className="font-bold text-slate-900 dark:text-white group-hover:text-[#1877F2] transition-colors">Volg onze Facebookgroep</span>
                    <span className="block text-slate-500 dark:text-slate-400 text-xs">Voor leiding van Gewest Reinaertland</span>
                  </div>
                  <span className="material-symbols-outlined text-sm text-slate-400 group-hover:translate-x-0.5 transition-transform ml-1">arrow_forward</span>
                </a>
              </div>
              <div className="relative">
                <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-primary via-accent-yellow to-accent-blue opacity-20 blur-2xl"></div>
                <div className="relative aspect-square overflow-hidden rounded-3xl bg-slate-200 shadow-2xl" style={{ backgroundImage: 'url("/img/groepsfoto.webp")', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
                  <div className="absolute bottom-6 left-6 flex items-center gap-4 text-white">
                    <span className="text-xl font-black italic tracking-tighter">IKAA 25'</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Agenda Section */}
        <section className="bg-slate-50 dark:bg-slate-800/50 py-20" id="agenda">
          <div className="mx-auto max-w-7xl px-4 md:px-10 lg:px-20">
            <div className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <div className="text-center md:text-left">
                <h2 className="mb-4 text-3xl font-black text-slate-900 dark:text-white md:text-4xl">Gewest Agenda</h2>
                <p className="max-w-2xl text-slate-600 dark:text-slate-400">Ontdek wat er binnenkort te doen is in ons gewest.</p>
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={prevSlide}
                  disabled={currentIndex === 0}
                  className="size-12 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-primary dark:hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  <span className="material-symbols-outlined">arrow_back_ios_new</span>
                </button>
                <button 
                  onClick={nextSlide}
                  disabled={currentIndex + 3 >= agendaItems.length}
                  className="size-12 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-primary dark:hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  <span className="material-symbols-outlined text-[20px]">arrow_forward_ios</span>
                </button>
              </div>
            </div>

            <div className="relative overflow-hidden mb-12">
              <motion.div 
                className="flex gap-6"
                animate={{ x: `calc(-${currentIndex * (100 / (window.innerWidth < 768 ? 1 : 3))}% - ${currentIndex * (24 / (window.innerWidth < 768 ? 1 : 3))}px)` }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                {agendaItems.length > 0 ? agendaItems.map(item => {
                  const dateObj = parseNlDate(item.date);
                  const month = dateObj ? dateObj.toLocaleString('nl-BE', { month: 'short' }).toUpperCase() : '???';
                  const day = item.date.split(' ')[0];
                  
                  const card = (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col relative overflow-hidden group cursor-pointer h-full">
                      <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${item.type === 'Vergadering' ? 'from-primary to-orange-400' : 'from-accent-blue to-blue-400'}`}></div>
                      <div className="flex items-start gap-4 mb-4">
                        <div className="flex flex-col items-center justify-center w-16 h-16 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl shrink-0 overflow-hidden shadow-sm">
                          <span className="text-xs font-bold text-primary uppercase bg-slate-50 dark:bg-slate-800 w-full text-center py-0.5 border-b border-slate-100 dark:border-slate-600">{month}</span>
                          <span className="text-xl font-black text-slate-800 dark:text-white leading-none flex-1 flex items-center justify-center w-full px-1 text-center tracking-tighter">{day}</span>
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-tight group-hover:text-primary transition-colors">{item.title}</h3>
                          <span className="inline-block mt-1 px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-black uppercase rounded-md tracking-wider">{item.type}</span>
                        </div>
                      </div>
                      <div className="mt-auto space-y-2 text-sm text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px] text-slate-400">calendar_today</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{item.date} {item.endDate ? ` t/m ${item.endDate}` : ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px] text-slate-400">schedule</span>
                          <span>{item.time || 'N.t.b.'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px] text-slate-400">location_on</span>
                          <span className="truncate">{item.location}</span>
                        </div>
                        {item.website && (
                          <div className="pt-2">
                            <div className="text-primary font-bold text-xs flex items-center gap-1 hover:gap-2 transition-all">
                              Meer info <span className="material-symbols-outlined text-sm">arrow_forward</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );

                  const safeWebsite = safeHref(item.website);
                  return (
                    <div key={item.id} className="min-w-full md:min-w-[calc(33.333%-16px)] shrink-0">
                      {safeWebsite ? (
                        <a href={safeWebsite} target="_blank" rel="noopener noreferrer">
                          {card}
                        </a>
                      ) : card}
                    </div>
                  );
                }) : (
                  <div className="w-full text-center py-12 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                    <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">event_busy</span>
                    <p className="text-slate-500">Geen activiteiten gevonden.</p>
                  </div>
                )}
              </motion.div>
            </div>
            
            <div className="flex justify-center">
              <Link to="/agenda" className="group flex items-center gap-3 px-8 py-4 bg-white dark:bg-slate-800 border-2 border-primary text-primary font-bold rounded-2xl hover:bg-primary hover:text-white transition-all shadow-lg shadow-primary/5">
                Bekijk volledige agenda
                <span className="material-symbols-outlined transition-transform group-hover:translate-x-1">calendar_month</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ── NIEUW: Foto's teaser section ─────────────────────────────────────── */}
        {recentAlbums.length > 0 && (
          <section className="bg-white dark:bg-slate-900/50 py-20" id="fotos">
            <div className="mx-auto max-w-7xl px-4 md:px-10 lg:px-20">
              <div className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div className="text-center md:text-left">
                  <h2 className="mb-3 text-3xl font-black text-slate-900 dark:text-white md:text-4xl">Onze Fotoalbums</h2>
                  <p className="max-w-xl text-slate-600 dark:text-slate-400">
                    Herinneringen aan weekends en andere activiteiten.
                  </p>
                </div>
                <Link to="/fotos"
                  className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-primary text-primary font-bold text-sm hover:bg-primary hover:text-white transition-all shrink-0">
                  Alle albums bekijken
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {recentAlbums.map(album => {
                  const safeAlbumUrl = safeHref(album.url) || '#';
                  const safeCover = safeImageUrl(album.coverImage);
                  return (
                  <a key={album.id} href={safeAlbumUrl} target="_blank" rel="noopener noreferrer"
                    className="group relative flex flex-col rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                    {/* Cover */}
                    <div className="relative aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-700">
                      {safeCover ? (
                        <img src={safeCover} alt={album.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent-blue/20">
                          <span className="material-symbols-outlined text-6xl text-primary/40">photo_library</span>
                        </div>
                      )}
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white text-slate-900 rounded-full px-4 py-2 font-bold text-sm flex items-center gap-2 shadow-lg">
                          <span className="material-symbols-outlined text-base">open_in_new</span>
                          Bekijken
                        </div>
                      </div>
                      {/* Badges */}
                      <div className="absolute top-3 left-3 flex gap-2">
                        {album.category && (
                          <span className="px-2 py-0.5 bg-black/40 backdrop-blur-sm text-white text-xs font-bold rounded-full">{album.category}</span>
                        )}
                      </div>
                      <div className="absolute top-3 right-3">
                        <span className="px-2 py-0.5 bg-black/40 backdrop-blur-sm text-white text-xs font-bold rounded-full">{album.year}</span>
                      </div>
                    </div>
                    {/* Info */}
                    <div className="p-5">
                      <h3 className="font-bold text-slate-900 dark:text-white leading-tight group-hover:text-primary transition-colors">{album.title}</h3>
                      {album.description && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{album.description}</p>
                      )}
                    </div>
                  </a>
                  );
                })}
              </div>

              {/* Mobile CTA */}
              <div className="mt-8 flex justify-center md:hidden">
                <Link to="/fotos"
                  className="flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-primary text-primary font-bold text-sm hover:bg-primary hover:text-white transition-all">
                  Alle albums bekijken
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </Link>
              </div>
            </div>
          </section>
        )}
        {/* ─────────────────────────────────────────────────────────────────────── */}

        {/* Local Groups Section */}
        <section className="bg-white py-20 dark:bg-slate-900/50" id="groepen">
          <div className="mx-auto max-w-7xl px-4 md:px-10 lg:px-20">
            <div className="mb-12 flex flex-col items-center text-center">
              <h2 className="mb-4 text-3xl font-black text-slate-900 dark:text-white md:text-4xl">Onze Lokale Chirogroepen</h2>
              <p className="max-w-2xl text-slate-600 dark:text-slate-400">Deze enthousiaste groepen vormen het hart van ons gewest. Zoek een groep in jouw buurt!</p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { name: 'Alleman', city: 'Sinaai', icon: 'groups', color: 'bg-primary/10 text-primary', hover: 'group-hover:bg-primary', link: 'https://www.chiroalleman.be' },
                { name: 'Hermelinde', city: 'Kemzeke', icon: 'groups', color: 'bg-accent-yellow/10 text-yellow-600', hover: 'group-hover:bg-accent-yellow', link: 'https://www.chiro-kemzeke.be' },
                { name: 'Juventa', city: 'Kemzeke', icon: 'groups', color: 'bg-accent-yellow/10 text-yellow-600', hover: 'group-hover:bg-accent-yellow', link: 'https://www.chiro-kemzeke.be' },
                { name: 'Inter-Jeugdig', city: 'De Klinge', icon: 'groups', color: 'bg-accent-blue/10 text-accent-blue', hover: 'group-hover:bg-accent-blue', link: null },
                { name: 'Judocus', city: 'Verrebroek', icon: 'groups', color: 'bg-primary/10 text-primary', hover: 'group-hover:bg-primary', link: 'https://www.chiroverrebroek.be' },
                { name: 'Saleghem', city: 'Meerdonk', icon: 'groups', color: 'bg-accent-blue/10 text-accent-blue', hover: 'group-hover:bg-accent-blue', link: 'https://www.chirosaleghem.com' },
                { name: 'Sint-Agnes', city: 'Stekene', icon: 'groups', color: 'bg-primary/10 text-primary', hover: 'group-hover:bg-primary', link: 'https://meisjes.chirosas.be' },
                { name: 'Sint-Andreas', city: 'Stekene', icon: 'groups', color: 'bg-accent-yellow/10 text-yellow-600', hover: 'group-hover:bg-accent-yellow', link: 'https://jongens.chirosas.be' },
                { name: 'Wij', city: 'Sinaai', icon: 'groups', color: 'bg-accent-blue/10 text-accent-blue', hover: 'group-hover:bg-accent-blue', link: 'https://www.chirowij.be' }
              ].map((group, idx) => {
                const CardContent = (
                  <>
                    <div className={`mb-4 flex size-12 items-center justify-center rounded-xl ${group.color} ${group.hover} group-hover:text-white transition-colors`}>
                      <span className="material-symbols-outlined">{group.icon}</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Chiro {group.name}</h3>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{group.city}</p>
                    {group.link && (
                      <div className="mt-6 flex items-center text-xs font-bold text-primary group-hover:translate-x-2 transition-transform">
                        BEKIJK WEBSITE <span className="material-symbols-outlined ml-1 text-sm">arrow_forward</span>
                      </div>
                    )}
                  </>
                );
                const className = "group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:shadow-xl dark:border-slate-800 dark:bg-slate-800 " + (group.link ? "cursor-pointer" : "");
                return group.link ? (
                  <a key={idx} href={group.link} target="_blank" rel="noopener noreferrer" className={className}>{CardContent}</a>
                ) : (
                  <div key={idx} className={className}>{CardContent}</div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section className="py-20 lg:px-20 px-4" id="contact">
          <div className="mx-auto max-w-7xl">
            <div className="rounded-3xl bg-slate-100 dark:bg-slate-800 p-8 md:p-12 lg:p-16">
              <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
                <div className="flex flex-col gap-6">
                  <h2 className="text-4xl font-black text-slate-900 dark:text-white">Heb je een vraag?</h2>
                  <p className="text-lg text-slate-600 dark:text-slate-400">
                    Vragen over activiteiten, of heb je als leidingsploeg ondersteuning nodig? De gewestleiding staat voor je klaar.
                  </p>
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex size-10 items-center justify-center rounded-full bg-primary text-white">
                        <span className="material-symbols-outlined text-sm">mail</span>
                      </div>
                      <span className="font-medium">contact@reinaertland.be</span>
                    </div>
                  </div>
                </div>
                <form className="flex flex-col gap-4 rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl md:p-8" onSubmit={handleSubmit}>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Naam</label>
                      <input className="rounded-lg border-slate-200 bg-slate-50 p-3 text-slate-900 focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="Jouw naam" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">E-mail</label>
                      <input className="rounded-lg border-slate-200 bg-slate-50 p-3 text-slate-900 focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="jouw@email.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Bericht</label>
                    <textarea className="rounded-lg border-slate-200 bg-slate-50 p-3 text-slate-900 focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="Hoe kunnen we je helpen?" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required></textarea>
                  </div>
                  <button className="mt-2 w-full rounded-xl bg-primary py-4 font-bold text-white shadow-lg hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50" type="submit" disabled={status === 'submitting'}>
                    {status === 'submitting' ? 'Bezig...' : status === 'success' ? 'Verzonden!' : 'Verstuur Bericht'}
                  </button>
                  {status === 'error' && <p className="text-red-500 text-sm mt-2">Er is een fout opgetreden. Probeer het later opnieuw.</p>}
                </form>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12 dark:border-slate-800 dark:bg-background-dark">
        <div className="mx-auto max-w-7xl px-4 md:px-10 lg:px-20 text-center">
          <div className="flex flex-col items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="size-8 text-primary">
                <img src="/img/logo.png" alt="Logo" className="w-full h-full object-contain rounded-full" />
              </div>
              <h2 className="text-lg font-bold">Gewest Reinaertland</h2>
            </div>
            <nav className="flex flex-wrap justify-center items-center gap-6 sm:gap-8 text-sm font-medium text-slate-500">
              <a className="hover:text-primary transition-colors" href="https://chiro.be" target="_blank" rel="noopener noreferrer">Chirojeugd Vlaanderen</a>
              <Link className="hover:text-primary transition-colors" to="/agenda">Agenda</Link>
              <Link className="hover:text-primary transition-colors" to="/inschrijvingen">Inschrijvingen</Link>
              <Link className="hover:text-primary transition-colors" to="/fotos">Foto's</Link>
              <a className="hover:text-primary transition-colors" href="#contact">Contact</a>
              <a className="hover:text-[#1877F2] transition-colors flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold" href="https://www.facebook.com/groups/1312772738595372/" target="_blank" rel="noopener noreferrer">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                Facebookgroep
              </a>
            </nav>
            <p className="text-xs text-slate-400">© {new Date().getFullYear()} Gewest Reinaertland.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}