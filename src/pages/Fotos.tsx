import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { safeHref, safeImageUrl } from '../utils/safeUrl';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from 'react-helmet-async';

interface Album {
  id: number;
  title: string;
  description: string;
  url: string;
  coverImage: string;
  year: string;
  category: string;
}

export default function Fotos() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('Alle');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const fetchAlbums = async () => {
      try {
        const res = await fetch('/api/albums');
        const data = await res.json();
        setAlbums(data);
      } catch (error) {
        console.error('Error fetching albums', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAlbums();
  }, []);

  const categories = ['Alle', ...Array.from(new Set(albums.map(a => a.category).filter(Boolean)))];
  const filtered = activeCategory === 'Alle' ? albums : albums.filter(a => a.category === activeCategory);

  // Groepeer albums per jaar voor de tijdlijnweergave
  const byYear = filtered.reduce((acc: Record<string, Album[]>, album) => {
    const year = album.year || 'Overig';
    if (!acc[year]) acc[year] = [];
    acc[year].push(album);
    return acc;
  }, {});
  const sortedYears = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

  return (
    <div className="relative flex min-h-screen flex-col bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display transition-colors duration-200">
      <Helmet>
        <title>Foto's | Gewest Reinaertland</title>
        <meta name="description" content="Bekijk de fotoalbums van onze activiteiten en weekends bij Gewest Reinaertland." />
        <link rel="canonical" href="https://reinaertland.be/fotos" />
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
              <Link className="text-sm font-semibold hover:text-primary transition-colors" to="/inschrijvingen">Inschrijvingen</Link>
              <Link className="text-sm font-semibold hover:text-primary transition-colors" to="/#groepen">Groepen</Link>
              <Link className="text-sm font-semibold text-primary" to="/fotos">Foto's</Link>
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
                  { to: '/agenda', label: 'Agenda', icon: 'event', type: 'link' },
                  { to: '/inschrijvingen', label: 'Inschrijvingen', icon: 'assignment', type: 'link' },
                  { to: '/#groepen', label: 'Groepen', icon: 'groups', type: 'anchor' },
                  { to: '/fotos', label: 'Foto\'s', icon: 'photo_library', type: 'link', active: true },
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

      <main className="flex-grow overflow-x-hidden">
        {/* Hero */}
        <section className="relative px-4 py-16 md:py-20 lg:px-20 overflow-hidden">
          {/* Decoratieve achtergrond */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent-blue/5 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2"></div>
          </div>
          <div className="mx-auto max-w-7xl relative">
            <Link to="/" className="group inline-flex items-center gap-2 text-slate-500 hover:text-primary transition-colors font-medium bg-white dark:bg-slate-900 px-4 py-2 rounded-full shadow-sm border border-slate-200 dark:border-slate-800 mb-8">
                <span className="material-symbols-outlined text-base group-hover:-translate-x-1 transition-transform">arrow_back</span>
                Terug naar home
            </Link>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-bold mb-4">
                  <span className="material-symbols-outlined text-base">photo_library</span>
                  Fotoalbums
                </div>
                <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white leading-tight">
                  Herinneringen van<br />
                  <span className="text-primary">Reinaertland</span>
                </h1>
                <p className="mt-4 text-lg text-slate-600 dark:text-slate-400 max-w-xl">
                  Blader door onze fotoalbums van weekends en andere activiteiten.
                </p>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
                <span className="material-symbols-outlined text-primary">photo_camera</span>
                <span><span className="font-bold text-slate-800 dark:text-white">{albums.length}</span> album(s) beschikbaar</span>
              </div>
            </div>
          </div>
        </section>

        {/* Categorie filters */}
        {categories.length > 1 && (
          <div className="sticky top-[73px] z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 lg:px-20">
            <div className="mx-auto max-w-7xl py-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                    activeCategory === cat
                      ? 'bg-primary text-white shadow-sm shadow-primary/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Albums */}
        <section className="px-4 py-12 lg:px-20">
          <div className="mx-auto max-w-7xl">

            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse aspect-[4/3]"></div>
                ))}
              </div>
            )}

            {!loading && albums.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600">photo_library</span>
                </div>
                <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">Nog geen albums</h3>
                <p className="text-slate-500 dark:text-slate-400 max-w-sm">
                  Er zijn nog geen fotoalbums toegevoegd. Kom later terug!
                </p>
              </div>
            )}

            {!loading && sortedYears.map(year => (
              <div key={year} className="mb-14">
                {/* Jaar header */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-8 bg-primary rounded-full"></div>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-white">{year}</h2>
                  </div>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
                  <span className="text-sm text-slate-400 dark:text-slate-500 font-medium">{byYear[year].length} album{byYear[year].length !== 1 ? 's' : ''}</span>
                </div>

                {/* Album grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {byYear[year].map(album => {
                    const safeAlbumUrl = safeHref(album.url) || '#';
                    const safeCover = safeImageUrl(album.coverImage);
                    return (
                    <a
                      key={album.id}
                      href={safeAlbumUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative flex flex-col rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                    >
                      {/* Cover afbeelding */}
                      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-700">
                        {safeCover ? (
                          <img
                            src={safeCover}
                            alt={album.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        {/* Fallback als geen cover */}
                        <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent-blue/20 ${safeCover ? 'hidden' : ''}`}>
                          <span className="material-symbols-outlined text-6xl text-primary/40">photo_library</span>
                        </div>

                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white text-slate-900 rounded-full px-4 py-2 font-bold text-sm flex items-center gap-2 shadow-lg">
                            <span className="material-symbols-outlined text-base">open_in_new</span>
                            Album bekijken
                          </div>
                        </div>

                        {/* Categorie badge */}
                        {album.category && (
                          <div className="absolute top-3 left-3">
                            <span className="px-2 py-0.5 bg-black/40 backdrop-blur-sm text-white text-xs font-bold rounded-full">
                              {album.category}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-5 flex flex-col gap-2 flex-1">
                        <h3 className="font-bold text-slate-900 dark:text-white text-lg leading-tight group-hover:text-primary transition-colors">
                          {album.title}
                        </h3>
                        {album.description && (
                          <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                            {album.description}
                          </p>
                        )}
                        <div className="mt-auto pt-3 flex items-center justify-between">
                          <span className="text-xs text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                            {album.year}
                          </span>
                          <span className="text-primary font-bold text-xs flex items-center gap-1 group-hover:gap-2 transition-all">
                            Bekijk
                            <span className="material-symbols-outlined text-sm">arrow_forward</span>
                          </span>
                        </div>
                      </div>
                    </a>
                    );
                  })}
                </div>
              </div>
            ))}
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