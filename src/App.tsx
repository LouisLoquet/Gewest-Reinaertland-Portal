import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Fotos from './pages/Fotos';
import AgendaPage from './pages/Agenda';
import InschrijvingenPage from './pages/Inschrijvingen';
import BeheerFormulieren from './pages/BeheerFormulieren';
import Albums from './Albums';
import Financien, { computeWerkjaar, formatEuro } from './pages/Financien';
import LeidingBeheer from './pages/LeidingBeheer';
import FirstLoginPasswordModal from './components/FirstLoginPasswordModal';
import { safeHref, safeCssUrl } from './utils/safeUrl';

const LOCATIONS = [
  'Sint-Agnes, Stekene',
  'Sint-Andreas, Stekene',
  'Alleman, Sinaai',
  'Wij, Sinaai',
  'Hermelinde, Kemzeke',
  'Juventa, Kemzeke',
  'Judocus, Verrebroek',
  'Saleghem, Meerdonk',
  'Inter-Jeugdig, De Klinge',
  'Andere'
];

// Inactiviteitstimer: na 2 uur inactiviteit automatisch uitloggen
export const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export function updateLastActivity() {
  localStorage.setItem('gewest_last_active', String(Date.now()));
}

export function checkIsInactive(): boolean {
  const storedUser = localStorage.getItem('user');
  if (!storedUser) return false;
  const lastActiveStr = localStorage.getItem('gewest_last_active');
  if (!lastActiveStr) {
    updateLastActivity();
    return false;
  }
  const lastActive = Number(lastActiveStr) || 0;
  return (Date.now() - lastActive) > INACTIVITY_TIMEOUT_MS;
}

export function performInactivityLogout(reason: 'inactivity' | 'expired' = 'inactivity') {
  localStorage.removeItem('user');
  localStorage.removeItem('gewest_last_active');
  fetch('/api/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  if (window.location.pathname.startsWith('/beheer')) {
    window.location.href = `/login?reason=${reason}`;
  }
}

function authFetch(url: string, options: RequestInit = {}) {
  if (checkIsInactive()) {
    performInactivityLogout('inactivity');
    return Promise.reject(new Error('Sessie verlopen wegens inactiviteit.'));
  }

  updateLastActivity();

  return fetch(url, {
    ...options,
    credentials: 'include',   // Stuurt HttpOnly auth-cookie automatisch mee
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  }).then(res => {
    if (res.status === 401) {
      performInactivityLogout('expired');
    }
    return res;
  });
}

function applyDarkMode(dark: boolean) {
  if (dark) {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }
}

async function saveDarkModePreference(userId: string, darkMode: boolean) {
  try {
    await authFetch(`/api/users/${userId}/preferences`, {
      method: 'PUT',
      body: JSON.stringify({ darkMode }),
    });
  } catch (e) {
    console.error('Could not save dark mode preference', e);
  }
}

async function loadDarkModePreference(userId: string): Promise<boolean | null> {
  try {
    const res = await authFetch(`/api/users/${userId}/preferences`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.darkMode === 'boolean' ? data.darkMode : null;
  } catch (e) {
    return null;
  }
}

import { 
  unescape, 
  NL_MONTHS_FULL, 
  isValidDutchDate, 
  formatFullDate, 
  parseNlDate, 
  getEventEndDate, 
  isEventPassed 
} from './utils/date';

// ─── Huidige ingelogde gebruiker lezen ────────────────────────────────────────
function getCurrentUser() {
  try {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const activePage = location.pathname.split('/')[2] || 'dashboard'; // Use second part since first is 'beheer'
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (checkIsInactive()) {
      performInactivityLogout('inactivity');
      return;
    }
    updateLastActivity();

    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);

        const localTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyDarkMode(localTheme === 'dark' || (!localTheme && prefersDark));

        if (parsed.id) {
          loadDarkModePreference(parsed.id).then(serverDark => {
            if (serverDark !== null) applyDarkMode(serverDark);
          });
        }
      } catch (e) {
        localStorage.removeItem('user');
      }
    }

    // Verifieer sessie altijd server-side via /api/me en synchroniseer actuele rollen & mustChangePassword
    authFetch('/api/me')
      .then(async (res) => {
        if (res.ok) {
          const freshUser = await res.json();
          setUser(freshUser);
          localStorage.setItem('user', JSON.stringify(freshUser));
          if (typeof freshUser.darkMode === 'boolean') {
            applyDarkMode(freshUser.darkMode);
          }
        } else if (res.status === 401) {
          setUser(null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Activiteit bijhouden en inactiviteitstimeout detecteren
    let lastThrottled = Date.now();
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastThrottled > 15000) {
        lastThrottled = now;
        updateLastActivity();
      }
    };

    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    activityEvents.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }));

    const checkTimer = setInterval(() => {
      if (checkIsInactive()) {
        performInactivityLogout('inactivity');
      }
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (checkIsInactive()) {
          performInactivityLogout('inactivity');
        } else {
          updateLastActivity();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      activityEvents.forEach(evt => window.removeEventListener(evt, handleActivity));
      clearInterval(checkTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    localStorage.removeItem('user');
    localStorage.removeItem('gewest_last_active');
    window.location.href = '/login';
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const userRoles = Array.isArray(user?.roles) ? user.roles : [user?.role || 'leiding'];
  const isAdmin = userRoles.includes('admin') || userRoles.includes('groepsleiding') || userRoles.includes('website');

  const navItems = [
    { to: '/beheer/dashboard', icon: 'dashboard', label: 'Dashboard', key: 'dashboard' },
    { to: '/beheer/financien', icon: 'payments', label: 'Financiën', key: 'financien' },
    { to: '/beheer/agenda', icon: 'event', label: 'Agenda', key: 'agenda' },
    { to: '/beheer/formulieren', icon: 'dynamic_form', label: 'Formulieren', key: 'formulieren' },
    { to: '/beheer/leiding', icon: 'manage_accounts', label: 'Leiding & Toegang', key: 'leiding' },
    { to: '/beheer/albums', icon: 'photo_library', label: 'Albums', key: 'albums' },
    { to: '/beheer/berichten', icon: 'mail', label: 'Berichten', key: 'berichten' },
    { to: '/beheer/profile', icon: 'settings', label: 'Instellingen', key: 'profile' },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 font-display text-slate-900 dark:text-slate-100 min-h-screen flex relative transition-colors duration-200">
      {/* Verplichte wachtwoord wijziging na eerste login */}
      {user?.mustChangePassword && (
        <FirstLoginPasswordModal
          user={user}
          onSuccess={(updatedUser) => setUser(updatedUser)}
        />
      )}

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 dark:bg-slate-900/60 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        ></div>
      )}

      <aside className={`w-64 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex flex-col fixed h-full z-40 transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src="/img/logo.png" alt="Logo" className="size-10 md:size-12 rounded-full object-cover border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm" />
            <div>
              <h1 className="text-base md:text-lg font-bold leading-none text-slate-800 dark:text-white">Reinaertland</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">Dashboard</p>
            </div>
          </div>
          <button className="md:hidden text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" onClick={() => setMobileMenuOpen(false)}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map(({ to, icon, label, key }) => (
            <Link
              key={key}
              to={to}
              onClick={() => setMobileMenuOpen(false)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-semibold transition-all ${
                activePage === key
                  ? 'bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 text-primary'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm hover:text-primary dark:hover:text-primary border border-transparent'
              }`}
            >
              <span className="material-symbols-outlined">{icon}</span>
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
          {/* Rol badges */}
          <div className="px-2 pb-2 flex flex-wrap gap-1">
            {userRoles.map((rk: string) => {
              const roleLabel = rk === 'admin' ? 'Admin'
                : rk === 'groepsleiding' ? 'Groepsleiding'
                : rk === 'media' ? 'Media'
                : rk === 'som' ? 'SOM'
                : rk === 'veegee' ? 'VEEGEE'
                : rk === 'twizzit' ? 'Twizzit'
                : rk === 'website' ? 'Website'
                : rk === 'penningmeester' ? 'Penningmeester'
                : 'Leiding';
              const roleIcon = rk === 'admin' ? 'shield_person'
                : rk === 'groepsleiding' ? 'crown'
                : rk === 'penningmeester' ? 'account_balance_wallet'
                : rk === 'media' ? 'photo_camera'
                : rk === 'som' ? 'volunteer_activism'
                : rk === 'veegee' ? 'groups'
                : rk === 'twizzit' ? 'badge'
                : rk === 'website' ? 'code'
                : 'person';
              return (
                <span
                  key={rk}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-orange-50 dark:bg-primary/20 text-primary border-orange-100 dark:border-primary/30"
                >
                  <span className="material-symbols-outlined text-[10px]">
                    {roleIcon}
                  </span>
                  {roleLabel}
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-3 px-2 py-3">
            <div
              className="size-10 rounded-full bg-slate-200 dark:bg-slate-700 bg-cover bg-center shrink-0 border border-slate-200 dark:border-slate-600"
              style={{ backgroundImage: safeCssUrl(user.avatar) }}
            ></div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold truncate text-slate-800 dark:text-white">{user.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 mt-2 text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-primary dark:hover:text-primary transition-colors cursor-pointer shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">logout</span> Uitloggen
          </button>
        </div>
      </aside>

      <main className="flex-1 w-full md:ml-64 flex flex-col min-h-screen bg-white dark:bg-slate-900 transition-colors duration-200">
        <div className="md:hidden flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20 shadow-sm">
          <div className="flex items-center gap-3">
            <img src="/img/logo.png" alt="Logo" className="size-8 rounded-full border border-slate-200 dark:border-slate-600 object-cover" />
            <h1 className="font-bold text-slate-800 dark:text-white tracking-tight capitalize">{activePage}</h1>
          </div>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex items-center justify-center p-2 text-slate-600 dark:text-slate-300 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
        </div>

        <div className="p-4 sm:p-6 md:p-8 flex-1 w-full overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function Dashboard() {
  const [user, setUser] = useState<any>({ name: "Gewestleiding" });
  const [agendaItems, setAgendaItems] = useState<any[]>([]);
  const [leidingMembers, setLeidingMembers] = useState<any[]>([]);
  const [financeSummary, setFinanceSummary] = useState<{ bankBalance: number; eventsCount: number; currentProfit: number } | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) return;

    try {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      
      const fetchData = async () => {
        try {
          const eventsRes = await fetch('/api/events');
          const events = await eventsRes.json();
          // Alleen aankomende evenementen tonen op het dashboard overzicht
          const upcomingEvents = (events as any[]).filter(e => !isEventPassed(e));
          upcomingEvents.sort((a: any, b: any) => (parseNlDate(a.date)?.getTime() || 0) - (parseNlDate(b.date)?.getTime() || 0));
          setAgendaItems(upcomingEvents);

          const membersRes = await authFetch('/api/users');
          if (membersRes.ok) {
            setLeidingMembers(await membersRes.json());
          }

          const finRes = await authFetch('/api/finances');
          if (finRes.ok) {
            const finData = await finRes.json();
            const curWj = computeWerkjaar(new Date().toISOString().slice(0, 10));
            const curEvents = (finData.events || []).filter((e: any) => (e.werkjaar || computeWerkjaar(e.date)) === curWj);
            const profit = curEvents.reduce((acc: number, ev: any) => {
              const items = ev.items || [];
              const inc = items.filter((i: any) => i.type !== 'expense' && i.category !== 'uitgave').reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
              const exp = items.filter((i: any) => i.type === 'expense' || i.category === 'uitgave').reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
              return acc + (inc - exp);
            }, 0);
            setFinanceSummary({
              bankBalance: Number(finData.settings?.bankBalance) || 0,
              eventsCount: curEvents.length,
              currentProfit: profit
            });
          }
        } catch (error) { console.error("Error fetching data", error); }
      };
      fetchData();
    } catch (e) {
      localStorage.removeItem('user');
    }
  }, []);

  const nextMeeting = agendaItems.find(item => item.type === 'Vergadering');

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-800 dark:text-white">Welkom, {user.name.split(' ')[0]} 👋</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Hier is een overzicht van de laatste updates voor het gewest.</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">
        <section className="col-span-12">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
            <span className="material-symbols-outlined text-primary">rocket_launch</span> Snelkoppelingen & Cijfers
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Financiën Mini Overzicht Widget */}
            <Link
              to="/beheer/financien"
              className="group relative overflow-hidden flex flex-col justify-between p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-primary/50 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="size-11 flex items-center justify-center bg-emerald-50 dark:bg-emerald-950/40 rounded-xl text-emerald-600 dark:text-emerald-400 shrink-0">
                  <span className="material-symbols-outlined text-2xl">payments</span>
                </div>
                <span className="material-symbols-outlined text-slate-400 group-hover:text-primary group-hover:translate-x-1 transition-all text-sm">arrow_forward</span>
              </div>
              <div className="my-2">
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Gewestrekening</p>
                <p className="font-black text-2xl text-slate-900 dark:text-white tracking-tight mt-0.5">
                  {financeSummary ? formatEuro(financeSummary.bankBalance) : '€ 0,00'}
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center text-xs">
                <span className="text-slate-400 text-[11px]">Werkjaar winst:</span>
                <span className={`font-black text-xs ${
                  (financeSummary?.currentProfit ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}>
                  {financeSummary
                    ? ((financeSummary.currentProfit >= 0 ? '+' : '') + formatEuro(financeSummary.currentProfit))
                    : '€ 0,00'}
                </span>
              </div>
            </Link>

            <a
              href="https://drive.google.com/drive/folders/1op4nkA9b3z1iBY9X2BKxmzL8wliL_b-H?usp=drive_link"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative overflow-hidden flex flex-col justify-between p-6 bg-gradient-to-br from-primary via-[#e25530] to-[#b83818] rounded-2xl text-white shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 hover:-translate-y-1 transition-all duration-300 border border-white/15 cursor-pointer"
            >
              {/* Zachte achtergrondgloed */}
              <div className="absolute -top-10 -right-10 size-32 bg-white/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />
              <div className="absolute -bottom-8 -left-8 size-24 bg-black/15 rounded-full blur-xl pointer-events-none" />

              {/* Watermerk folder icoon */}
              <span className="material-symbols-outlined absolute -right-2 -bottom-2 text-7xl text-white/10 group-hover:text-white/20 group-hover:scale-110 group-hover:-rotate-3 transition-all duration-500 pointer-events-none select-none">
                folder_shared
              </span>

              {/* Bovenste rij: icoonbadge & open-knop badge */}
              <div className="flex items-center justify-between z-10">
                <div className="size-11 flex items-center justify-center bg-white/20 backdrop-blur-md rounded-xl border border-white/30 shadow-xs group-hover:scale-105 transition-transform">
                  <span className="material-symbols-outlined text-2xl text-white">cloud_queue</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-white/20 hover:bg-white/30 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/25 shadow-xs transition-colors">
                  Openen
                  <span className="material-symbols-outlined text-xs group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">
                    arrow_outward
                  </span>
                </span>
              </div>

              {/* Tekstcontent */}
              <div className="z-10 mt-5">
                <span className="text-[11px] font-bold text-white/80 block uppercase tracking-wider">
                  Gewestarchief
                </span>
                <span className="text-xl font-black block tracking-tight leading-tight mt-0.5">
                  Google Drive
                </span>
                <p className="text-xs text-white/75 mt-1 font-medium truncate">
                  Verslagen, draaiboeken & documenten
                </p>
              </div>
            </a>

            <div className="flex flex-col justify-between p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
              <div className="size-11 flex items-center justify-center bg-orange-50 dark:bg-primary/20 rounded-xl text-primary shrink-0">
                <span className="material-symbols-outlined text-2xl">calendar_month</span>
              </div>
              <div className="my-2">
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Volgende Vergadering</p>
                <p className="font-black text-lg text-slate-900 dark:text-white mt-0.5 truncate">{nextMeeting ? nextMeeting.date : 'Geen gepland'}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="col-span-12 lg:col-span-6 space-y-8">
          <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">event</span>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Binnenkort</h3>
              </div>
              <Link to="/beheer/agenda" className="text-primary text-sm font-semibold hover:underline">Volledige agenda</Link>
            </div>
            <div className="p-6 space-y-4">
              {agendaItems.length > 0 ? agendaItems.slice(0, 2).map(item => {
                const _d = parseNlDate(item.date);
                const startDay = item.date.split(' ')[0];
                const endDay = item.endDate ? item.endDate.split(' ')[0] : null;
                const displayDay = endDay && endDay !== startDay ? `${startDay}-${endDay}` : startDay;
                const _month = _d ? _d.toLocaleString('nl-BE', { month: 'short' }).toUpperCase() : '???';
                return (
                  <div key={item.id} className="flex items-start gap-4 p-4 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <div className="flex flex-col items-center justify-center w-16 h-16 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shrink-0 shadow-sm overflow-hidden">
                      <span className="text-xs font-bold text-primary uppercase bg-slate-50 dark:bg-slate-800 w-full text-center py-0.5 border-b border-slate-100 dark:border-slate-600 leading-tight">{_month}</span>
                      <span className={`font-black text-slate-800 dark:text-white leading-none flex-1 flex items-center justify-center ${displayDay.length > 2 ? 'text-sm' : 'text-lg'}`}>{displayDay}</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 dark:text-white">{unescape(item.title)}</h4>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">schedule</span> {item.time}</span>
                        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">location_on</span> {unescape(item.location)}</span>
                      </div>
                    </div>
                  </div>
                );
              }) : <p className="text-slate-500 dark:text-slate-400 text-sm">Geen evenementen gepland.</p>}
            </div>
          </section>

          <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">group</span>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Gewestleiding</h3>
              </div>
              <Link to="/beheer/leiding" className="text-primary text-sm font-semibold hover:underline">Alle leiding</Link>
            </div>
            <div className="p-6">
              <div className="flex flex-col gap-4">
                {leidingMembers.length > 0 ? leidingMembers.slice(0, 3).map(member => (
                  <div key={member.id} className="flex items-center gap-4">
                    <div className="size-12 rounded-full bg-slate-200 dark:bg-slate-700 bg-cover bg-center shrink-0 border border-slate-200 dark:border-slate-600"
                      style={{ backgroundImage: safeCssUrl(member.avatar, `https://placehold.co/150x150/d94824/white?text=${encodeURIComponent((member.name || 'L').charAt(0))}`) }}></div>
                    <div>
                      <h4 className="font-bold text-slate-800 dark:text-white">{member.name}</h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{member.role}</p>
                    </div>
                  </div>
                )) : <p className="text-slate-500 dark:text-slate-400 text-sm">Geen leiding gevonden.</p>}
              </div>
            </div>
          </section>
        </div>

        <div className="col-span-12 lg:col-span-6 space-y-8">
          <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm h-full flex flex-col">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">add_to_drive</span>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Google Drive</h3>
              </div>
              <a href="https://drive.google.com/drive/folders/1op4nkA9b3z1iBY9X2BKxmzL8wliL_b-H?usp=drive_link" target="_blank" rel="noopener noreferrer" className="text-primary text-sm font-semibold hover:underline flex items-center gap-1">
                Open Drive <span className="material-symbols-outlined text-sm">open_in_new</span>
              </a>
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { href: 'https://drive.google.com/drive/folders/1xRx_RfCYvX0C_lUf7t6vKc5WRwa2aRRI', icon: 'description', label: 'Verslagen' },
                  { href: 'https://drive.google.com/drive/folders/1tsar5x5ahBZDooJE8eOoxvZgyISmCNEa', icon: 'event', label: 'Gewestweekend' },
                  { href: 'https://drive.google.com/drive/folders/17KG4QfGaXuRaCDn2he_ubCgMuUTDbZnr', icon: 'star', label: 'IKAA' },
                  { href: 'https://drive.google.com/drive/folders/1g3QEfJajV2bo7RzGCoRj7M1miWB9uFEy', icon: 'local_bar', label: 'Cocktailquiz' },
                  { href: 'https://drive.google.com/drive/folders/1gc4nQZLZYjAhGdiQDhCOG0CU8aJPzaex', icon: 'menu_book', label: 'Draaiboeken' },
                  { href: 'https://drive.google.com/drive/folders/1L4htundEXuwJ93z1hYwdn4jBB3aID-AV', icon: 'groups', label: 'SOM' },
                  { href: 'https://drive.google.com/drive/folders/1fW3w5xGlWO1pZjqzGjtz2yUI0vc9NfsE', icon: 'account_balance', label: 'Kas' },
                  { href: 'https://drive.google.com/drive/folders/14zERpS3yBHX0yu3du98Z9AfV1yDOGv2G', icon: 'key', label: 'Logins' },
                  { href: 'https://drive.google.com/drive/u/0/folders/1kR0dzOAkum47xwiT17R36HlOY9PDNhNK', icon: 'language', label: 'Website' },
                ].map(({ href, icon, label }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group">
                    <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors">{icon}</span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
                  </a>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function Leiding() {
  const [leidingMembers, setLeidingMembers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [newMember, setNewMember] = useState({ name: '', role: '', phone: '', email: '', chiroGroup: '' });
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('');

  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  // Alfabetisch sorteren + filteren op zoekterm en functie
  const filteredMembers = leidingMembers
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'))
    .filter(m => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
        m.name.toLowerCase().includes(q) ||
        (m.role || '').toLowerCase().includes(q) ||
        (m.chiroGroup || '').toLowerCase().includes(q);
      const matchesRole = !selectedRole || m.role === selectedRole;
      return matchesSearch && matchesRole;
    });

  // Unieke functies voor dropdown (dynamisch vanuit data)
  const uniqueRoles = [...new Set(leidingMembers.map(m => m.role).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl'));

  const fetchMembers = async () => {
    try {
      const res = await authFetch('/api/members');
      setLeidingMembers(await res.json());
    } catch (error) { console.error("Error fetching members", error); }
  };

  useEffect(() => { fetchMembers(); }, []);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const avatar = `https://placehold.co/150x150/d94824/white?text=${newMember.name.charAt(0)}`;
      if (editId) {
        await authFetch(`/api/members/${editId}`, {
          method: 'PUT',
          body: JSON.stringify({ ...newMember, avatar: leidingMembers.find(m => m.id === editId)?.avatar || avatar })
        });
      } else {
        await authFetch('/api/members', { method: 'POST', body: JSON.stringify({ ...newMember, avatar }) });
      }
      setShowModal(false);
      setEditId(null);
      setNewMember({ name: '', role: '', phone: '', email: '', chiroGroup: '' });
      fetchMembers();
    } catch (error) { alert("Fout bij opslaan lid."); }
  };

  const handleEdit = (member: any) => {
    setNewMember({ name: member.name, role: member.role, phone: member.phone || '', email: member.email || '', chiroGroup: member.chiroGroup || '' });
    setEditId(member.id);
    setShowModal(true);
  };

  const confirmDelete = async () => {
    if (itemToDelete) {
      try {
        await authFetch(`/api/members/${itemToDelete}`, { method: 'DELETE' });
        setItemToDelete(null);
        fetchMembers();
      } catch (error) { alert("Fout bij verwijderen."); }
    }
  };

  const inputClass = "w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none";

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-800 dark:text-white">Leiding</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Overzicht van alle leiding binnen het gewest.</p>
        </div>
        {/* Nieuw lid knop: alleen voor admin */}
        {isAdmin && (
          <button onClick={() => { setEditId(null); setNewMember({ name: '', role: '', phone: '', email: '', chiroGroup: '' }); setShowModal(true); }}
            className="w-full sm:w-auto px-4 py-2 bg-primary text-white font-bold rounded-lg shadow-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0">
            <span className="material-symbols-outlined text-sm">person_add</span> Nieuw Lid
          </button>
        )}
      </div>

      {/* Info banner voor gewone leiding */}
      {!isAdmin && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 dark:text-slate-400">
          <span className="material-symbols-outlined text-base text-slate-400">info</span>
          Contactgegevens zijn alleen zichtbaar voor Groepsleiding.
        </div>
      )}

      <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
            <input
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
              placeholder="Zoek op naam, functie of groep..." type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="w-full sm:w-auto px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value)}
          >
            <option value="">Alle Functies</option>
            {uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Mobiele kaartjes: nu tot lg schermbreedte */}
        <div className="grid grid-cols-1 gap-4 p-4 lg:hidden bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700">
          {filteredMembers.map(member => (
            <div key={member.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-full bg-cover bg-center shrink-0 border border-slate-200 dark:border-slate-600"
                  style={{ backgroundImage: safeCssUrl(member.avatar) }}></div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-white">{member.name}</h4>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-50 dark:bg-primary/20 text-primary border border-orange-100 dark:border-primary/30">
                    {member.role}
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-center text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                <span className="font-medium">{member.chiroGroup || 'Geen groep'}</span>
                {/* Telefoon alleen tonen voor admin */}
                {isAdmin && <span>{member.phone || '-'}</span>}
              </div>
              {/* Actieknoppen alleen voor admin */}
              {isAdmin && (
                <div className="flex justify-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <a href={`tel:${member.phone}`} className="size-9 text-slate-400 hover:text-primary bg-slate-50 dark:bg-slate-700 hover:bg-orange-50 dark:hover:bg-primary/10 rounded-full transition-colors flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[20px] leading-none">call</span>
                  </a>
                  <a href={`mailto:${member.email}`} target="_blank" rel="noopener noreferrer" className="size-9 text-slate-400 hover:text-primary bg-slate-50 dark:bg-slate-700 hover:bg-orange-50 dark:hover:bg-primary/10 rounded-full transition-colors flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[20px] leading-none">mail</span>
                  </a>
                  <button onClick={() => handleEdit(member)} className="size-9 text-slate-400 hover:text-primary bg-slate-50 dark:bg-slate-700 hover:bg-orange-50 dark:hover:bg-primary/10 rounded-full transition-colors flex items-center justify-center shrink-0 cursor-pointer">
                    <span className="material-symbols-outlined text-[20px] leading-none">edit</span>
                  </button>
                  <button onClick={() => setItemToDelete(member.id)} className="size-9 text-slate-400 hover:text-red-600 bg-slate-50 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors flex items-center justify-center shrink-0 cursor-pointer">
                    <span className="material-symbols-outlined text-[20px] leading-none">delete</span>
                  </button>
                </div>
              )}
            </div>
          ))}
          {filteredMembers.length === 0 && (
            <div className="col-span-full py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
              {searchQuery || selectedRole ? 'Geen resultaten gevonden.' : 'Geen leiding gevonden.'}
            </div>
          )}
        </div>

        {/* Desktop tabel: nu pas vanaf lg schermbreedte */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-700">
                <th className="px-4 py-4 w-[25%]">Lid</th>
                <th className="px-4 py-4 w-[15%]">Chiro</th>
                <th className="px-4 py-4 w-[15%]">Functie</th>
                {/* Contactkolommen alleen voor admin */}
                {isAdmin && <th className="px-4 py-4 w-[15%]">Telefoon</th>}
                {isAdmin && <th className="px-4 py-4 w-[20%]">Email</th>}
                {isAdmin && <th className="px-4 py-4 w-[10%] text-center">Actie</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredMembers.map(member => (
                <tr key={member.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="size-8 rounded-full bg-slate-200 dark:bg-slate-700 bg-cover bg-center shrink-0 border border-slate-200 dark:border-slate-600"
                        style={{ backgroundImage: safeCssUrl(member.avatar) }}></div>
                      <span className="font-bold text-sm text-slate-800 dark:text-white truncate">{member.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 font-medium truncate">{member.chiroGroup || '-'}</td>
                  <td className="px-4 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 dark:bg-primary/20 text-primary border border-orange-100 dark:border-primary/30 truncate max-w-full">
                      {member.role}
                    </span>
                  </td>
                  {isAdmin && <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 truncate">{member.phone || '-'}</td>}
                  {isAdmin && <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 truncate">{member.email || '-'}</td>}
                  {isAdmin && (
                    <td className="px-4 py-4 text-center">
                      <div className="flex justify-center gap-1">
                        <a href={`tel:${member.phone}`} title={member.phone} className="size-8 text-slate-400 hover:text-primary hover:bg-orange-50 dark:hover:bg-primary/10 rounded-full transition-colors flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-base leading-none">call</span>
                        </a>
                        <button onClick={() => handleEdit(member)} className="size-8 text-slate-400 hover:text-primary hover:bg-orange-50 dark:hover:bg-primary/10 rounded-full transition-colors flex items-center justify-center shrink-0 cursor-pointer">
                          <span className="material-symbols-outlined text-base leading-none">edit</span>
                        </button>
                        <button onClick={() => setItemToDelete(member.id)} className="size-8 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors flex items-center justify-center shrink-0 cursor-pointer">
                          <span className="material-symbols-outlined text-base leading-none">delete</span>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filteredMembers.length === 0 && (
                <tr><td colSpan={isAdmin ? 6 : 3} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">{searchQuery || selectedRole ? 'Geen resultaten gevonden.' : 'Geen leiding gevonden.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal: alleen admin kan dit bereiken */}
      {isAdmin && showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">{editId ? 'Lid Bewerken' : 'Nieuw Lid Toevoegen'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handleAddMember} className="p-6 space-y-4">
              {[{ label: 'Naam', field: 'name', type: 'text', req: true }, { label: 'Email', field: 'email', type: 'email', req: true }, { label: 'Telefoon', field: 'phone', type: 'tel', req: false }].map(({ label, field, type, req }) => (
                <div key={field}>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{label}</label>
                  <input required={req} type={type} value={(newMember as any)[field]} onChange={e => setNewMember({...newMember, [field]: e.target.value})} className={inputClass} />
                </div>
              ))}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Functie</label>
                <select required value={newMember.role} onChange={e => setNewMember({...newMember, role: e.target.value})} className={inputClass}>
                  <option value="">Selecteer een functie</option>
                  <option>Gewestleiding</option><option>Penningmeester</option><option>Groepsleiding</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Chirogroep</label>
                <select required value={newMember.chiroGroup} onChange={e => setNewMember({...newMember, chiroGroup: e.target.value})} className={inputClass}>
                  <option value="">Selecteer een groep</option>
                  {['Alleman','Hermelinde','Inter-Jeugdig','Judocus','Juventa','Saleghem','Sint-Agnes','Sint-Andreas','Wij'].map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg">Annuleren</button>
                <button type="submit" className="px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary/90">{editId ? 'Opslaan' : 'Toevoegen'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DeleteConfirmModal open={!!itemToDelete} onCancel={() => setItemToDelete(null)} onConfirm={confirmDelete} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function Agenda() {
  const [agendaItems, setAgendaItems] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState({ 
    title: '', 
    date: '', 
    endDate: '', 
    time: '', 
    location: LOCATIONS[0], 
    type: 'Vergadering',
    website: ''
  });
  const [hasEndDate, setHasEndDate] = useState(false);
  const [showCustomLocation, setShowCustomLocation] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [gcalStatus, setGcalStatus] = useState<any>(null);
  const [syncingGcal, setSyncingGcal] = useState(false);
  const [gcalFeedback, setGcalFeedback] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);

  const eventTypes = ["Vergadering", "IKAA", "Gewestweekend", "Fuif", "Eetfestijn", "Kasactie", "Activiteit", "Cocktailquiz", "Pintreceptie"];
  const [selectedFilters, setSelectedFilters] = useState<string[]>(eventTypes);

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      setAgendaItems(data);
    } catch (error) { console.error("Error fetching events", error); }
  };

  const fetchGcalStatus = async () => {
    try {
      const res = await authFetch('/api/events/google-status');
      if (res.ok) {
        const data = await res.json();
        setGcalStatus(data);
      }
    } catch {}
  };

  const handleSyncGoogle = async () => {
    setSyncingGcal(true);
    setGcalFeedback(null);
    try {
      const res = await authFetch('/api/events/sync-google', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setGcalFeedback({
          type: 'success',
          message: data.message || `${data.syncedCount || 0} afspraken gesynchroniseerd met Google Agenda!`
        });
        fetchEvents();
        fetchGcalStatus();
      } else {
        setGcalFeedback({
          type: 'error',
          message: data.error || 'Kon niet synchroniseren met Google Agenda.'
        });
      }
    } catch (err: any) {
      setGcalFeedback({
        type: 'error',
        message: err?.message || 'Verbindingsfout bij Google synchronisatie.'
      });
    } finally {
      setSyncingGcal(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    fetchGcalStatus();
  }, []);

  const upcomingItems = React.useMemo(() => {
    return agendaItems
      .filter(item => !isEventPassed(item))
      .sort((a, b) => (parseNlDate(a.date)?.getTime() || 0) - (parseNlDate(b.date)?.getTime() || 0));
  }, [agendaItems]);

  const pastItems = React.useMemo(() => {
    return agendaItems
      .filter(item => isEventPassed(item))
      .sort((a, b) => (getEventEndDate(b)?.getTime() || 0) - (getEventEndDate(a)?.getTime() || 0));
  }, [agendaItems]);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!isValidDutchDate(newEvent.date)) {
      setFormError("Startdatum moet exact dit formaat zijn: 8 augustus 2026");
      return;
    }
    if (hasEndDate && !isValidDutchDate(newEvent.endDate)) {
      setFormError("Einddatum moet exact dit formaat zijn: 10 augustus 2026");
      return;
    }

    const payload = { ...newEvent, endDate: hasEndDate ? newEvent.endDate : '' };
    try {
      if (editId) {
        await authFetch(`/api/events/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await authFetch('/api/events', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowModal(false);
      setEditId(null);
      setNewEvent({ title: '', date: '', endDate: '', time: '', location: LOCATIONS[0], type: 'Vergadering', website: '' });
      setHasEndDate(false);
      setShowCustomLocation(false);
      fetchEvents();
    } catch (error) { alert("Fout bij opslaan evenement."); }
  };

  const handleEdit = (item: any) => {
    const isCustom = item.location && !LOCATIONS.includes(item.location);
    setNewEvent({ 
      title: item.title, 
      date: item.date, 
      endDate: item.endDate || '', 
      time: item.time, 
      location: isCustom ? 'Andere' : item.location, 
      type: item.type,
      website: item.website || ''
    });
    // Als het een custom locatie is, overschrijven we de state direct met de echte waarde
    if (isCustom) {
      setNewEvent(prev => ({ ...prev, location: item.location }));
    }
    setHasEndDate(!!item.endDate);
    setShowCustomLocation(isCustom);
    setEditId(item.id);
    setFormError('');
    setShowModal(true);
  };

  const confirmDelete = async () => {
    if (itemToDelete) {
      try {
        await authFetch(`/api/events/${itemToDelete}`, { method: 'DELETE' });
        setItemToDelete(null);
        fetchEvents();
      } catch (error) { alert("Fout bij verwijderen."); }
    }
  };

  const handleCleanupPast = async () => {
    setIsCleaningUp(true);
    try {
      const res = await authFetch('/api/events/past', { method: 'DELETE' });
      if (res.ok) {
        setShowCleanupModal(false);
        fetchEvents();
      } else {
        alert("Fout bij het opschonen van afgelopen evenementen.");
      }
    } catch (error) {
      alert("Fout bij het opschonen.");
    } finally {
      setIsCleaningUp(false);
    }
  };

  const displayedList = activeTab === 'upcoming' ? upcomingItems : pastItems;
  const filteredAgenda = displayedList.filter(item => selectedFilters.includes(item.type));
  const inputClass = "w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none";

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-3xl font-black tracking-tight text-slate-800 dark:text-white">Agenda</h2>
            {gcalStatus?.hasPrivateKey ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" title="Google Agenda bot is actief en gesynchroniseerd">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Google Agenda Live</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800" title="Google Agenda integratie ingesteld">
                <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                <span>Google Agenda</span>
              </span>
            )}
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Beheer alle activiteiten en vergaderingen van het gewest. Nieuwe items worden automatisch naar Google Agenda verzonden.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSyncGoogle}
            disabled={syncingGcal}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-bold text-xs rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 border border-slate-200 dark:border-slate-600"
            title="Synchroniseer alle bestaande afspraken met Google Agenda"
          >
            <span className="material-symbols-outlined text-base text-primary">
              {syncingGcal ? 'hourglass_top' : 'sync'}
            </span>
            <span>{syncingGcal ? 'Synchroniseren...' : 'Sync met Google Agenda'}</span>
          </button>

          <button
            onClick={() => {
              setEditId(null);
              setNewEvent({ title: '', date: '', endDate: '', time: '', location: LOCATIONS[0], type: 'Vergadering', website: '' });
              setHasEndDate(false);
              setShowCustomLocation(false);
              setFormError('');
              setShowModal(true);
            }}
            className="px-4 py-2 bg-primary text-white font-bold rounded-lg shadow-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-sm">add</span> Nieuw Event
          </button>
        </div>
      </div>

      {/* Google Agenda sync feedback banner */}
      {gcalFeedback && (
        <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs mb-5 animate-in fade-in ${
          gcalFeedback.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
            : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
        }`}>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base">
              {gcalFeedback.type === 'success' ? 'check_circle' : 'info'}
            </span>
            <span>{gcalFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setGcalFeedback(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Tabs voor Aankomend vs Afgelopen */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('upcoming')}
          className={`flex items-center gap-2 pb-3 px-4 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'upcoming'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">event_upcoming</span>
          <span>Aankomend</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
            activeTab === 'upcoming' ? 'bg-primary/10 text-primary' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
          }`}>
            {upcomingItems.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('past')}
          className={`flex items-center gap-2 pb-3 px-4 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'past'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">history</span>
          <span>Afgelopen</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
            activeTab === 'past' ? 'bg-primary/10 text-primary' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
          }`}>
            {pastItems.length}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {activeTab === 'past' && pastItems.length > 0 && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl mb-4">
              <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
                <span className="material-symbols-outlined text-base">info</span>
                <span>Afgelopen evenementen worden automatisch verborgen op de website.</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCleanupModal(true)}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
              >
                <span className="material-symbols-outlined text-sm">delete_sweep</span>
                Alle afgelopen wissen
              </button>
            </div>
          )}

          {filteredAgenda.map(item => {
            const _d = parseNlDate(item.date);
            const startDay = item.date.split(' ')[0];
            const endDay = item.endDate ? item.endDate.split(' ')[0] : null;
            const displayDay = endDay && endDay !== startDay ? `${startDay}-${endDay}` : startDay;
            const _month = _d ? _d.toLocaleString('nl-BE', { month: 'short' }).toUpperCase() : '???';
            const isPassed = isEventPassed(item);

            return (
              <div key={item.id} className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row gap-4 sm:gap-6 relative group ${isPassed ? 'opacity-90' : ''}`}>
                <div className="flex flex-col items-center justify-center w-20 h-20 bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700 rounded-xl shrink-0 overflow-hidden mx-auto sm:mx-0">
                  <span className="text-sm font-bold text-primary uppercase bg-slate-100 dark:bg-slate-700 w-full text-center py-1 border-b border-slate-200 dark:border-slate-600">{_month}</span>
                  <span className={`font-black text-slate-800 dark:text-white leading-none flex-1 flex items-center justify-center ${displayDay.length > 2 ? 'text-lg' : 'text-2xl'}`}>{displayDay}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap justify-between items-start gap-2">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white truncate">{item.title}</h3>
                    <div className="flex items-center gap-2">
                      {item.googleEventId && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 text-xs font-bold rounded-full shrink-0" title="Gesynchroniseerd met Google Agenda">
                          <span className="material-symbols-outlined text-[13px]">cloud_done</span>
                          <span>Google Agenda</span>
                        </span>
                      )}
                      {isPassed && (
                        <span className="inline-block px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-bold rounded-full shrink-0">
                          Afgelopen
                        </span>
                      )}
                      <span className="inline-block px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-full shrink-0">{item.type}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[18px] text-slate-400 dark:text-slate-500">calendar_today</span>{formatFullDate(item.date)} {item.endDate ? ` t/m ${formatFullDate(item.endDate)}` : ''}</div>
                    <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[18px] text-slate-400 dark:text-slate-500">schedule</span>{item.time}</div>
                    <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[18px] text-slate-400 dark:text-slate-500">location_on</span>{item.location}</div>
                  </div>
                  {safeHref(item.website) && (
                    <div className="mt-2 text-xs font-bold text-primary flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">link</span>
                      <a href={safeHref(item.website)} target="_blank" rel="noopener noreferrer" className="hover:underline truncate max-w-[200px] sm:max-w-none">{item.website}</a>
                    </div>
                  )}
                </div>
                {/* Actieknoppen: nu onderaan gecentreerd op mobiel, rechts op desktop maar altijd zichtbaar */}
                <div className="flex sm:flex-col justify-center sm:justify-start gap-2 pt-4 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-700">
                  <button onClick={() => handleEdit(item)} className="size-9 text-slate-400 hover:text-primary bg-slate-50 dark:bg-slate-700 hover:bg-orange-50 dark:hover:bg-primary/10 rounded-full transition-colors flex items-center justify-center shrink-0 cursor-pointer" title="Bewerken">
                    <span className="material-symbols-outlined text-[20px] leading-none">edit</span>
                  </button>
                  <button onClick={() => setItemToDelete(item.id)} className="size-9 text-slate-400 hover:text-red-600 bg-slate-50 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors flex items-center justify-center shrink-0 cursor-pointer" title="Verwijderen">
                    <span className="material-symbols-outlined text-[20px] leading-none">delete</span>
                  </button>
                </div>
              </div>
            );
          })}
          {filteredAgenda.length === 0 && (
            <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
              {activeTab === 'upcoming'
                ? (upcomingItems.length === 0 ? 'Geen aankomende evenementen gepland.' : 'Geen aankomende evenementen voor de geselecteerde filters.')
                : (pastItems.length === 0 ? 'Geen afgelopen evenementen in het archief.' : 'Geen afgelopen evenementen voor de geselecteerde filters.')
              }
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm sticky top-8">
            <h3 className="font-bold text-slate-800 dark:text-white mb-4">Filters</h3>
            <div className="space-y-3">
              {eventTypes.map(type => (
                <label key={type} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" className="rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary"
                    checked={selectedFilters.includes(type)}
                    onChange={() => setSelectedFilters(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])} />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{type}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden my-8 border border-slate-200 dark:border-slate-700">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 rounded-t-2xl">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">{editId ? 'Event Bewerken' : 'Nieuw Event Toevoegen'}</h3>
              <button onClick={() => setShowModal(false)} className="size-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><span className="material-symbols-outlined text-sm">close</span></button>
            </div>
            <form onSubmit={handleAddEvent} className="p-6 space-y-4 overflow-x-hidden">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm font-bold rounded-lg animate-in fade-in zoom-in-95">
                  ⚠️ {formError}
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Titel</label>
                <input required type="text" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} className={inputClass} placeholder="bv. Gewestvergadering" />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Startdatum</label>
                  <input required type="text" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} className={inputClass} placeholder="bv. 8 augustus 2026" />
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Tijd</label>
                  <div className="relative">
                    <input required type="text" value={newEvent.time} onChange={e => setNewEvent({...newEvent, time: e.target.value})} className={inputClass} placeholder="bv. 20:00 of Hele dag" />
                    <div className="mt-2 flex gap-2 pb-1 overflow-x-auto scrollbar-hide">
                      {['Hele dag', '18:00', '20:00'].map(t => (
                        <button key={t} type="button" onClick={() => setNewEvent({...newEvent, time: t})} className="px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-bold text-slate-500 hover:bg-primary/10 hover:text-primary transition-colors whitespace-nowrap shrink-0">{t}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Heeft een einddatum?</label>
                  <label className="relative flex items-center cursor-pointer">
                    <input type="checkbox" className="peer sr-only" checked={hasEndDate} onChange={e => setHasEndDate(e.target.checked)} />
                    <div className="w-11 h-6 bg-slate-200 dark:bg-slate-600 rounded-full peer-checked:bg-primary transition-colors"></div>
                    <div className="absolute left-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow-sm"></div>
                  </label>
                </div>
                {hasEndDate && (
                  <div className="mt-4 animate-in fade-in slide-in-from-top-2 min-w-0">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Einddatum</label>
                    <input required type="text" value={newEvent.endDate} onChange={e => setNewEvent({...newEvent, endDate: e.target.value})} className={inputClass} placeholder="bv. 10 augustus 2026" />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Locatie</label>
                <select required value={showCustomLocation ? 'Andere' : newEvent.location} 
                  onChange={e => {
                    const val = e.target.value;
                    if (val === 'Andere') {
                      setShowCustomLocation(true);
                      setNewEvent({...newEvent, location: ''});
                    } else {
                      setShowCustomLocation(false);
                      setNewEvent({...newEvent, location: val});
                    }
                  }} className={inputClass}>
                  {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                {showCustomLocation && (
                  <input required type="text" value={newEvent.location} placeholder="Voer locatie in..." className={inputClass + " mt-2"} onChange={e => setNewEvent({...newEvent, location: e.target.value})} />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Type</label>
                  <select required value={newEvent.type} onChange={e => setNewEvent({...newEvent, type: e.target.value})} className={inputClass}>
                    {eventTypes.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Website (Optioneel)</label>
                  <input type="url" value={newEvent.website} onChange={e => setNewEvent({...newEvent, website: e.target.value})} placeholder="https://..." className={inputClass} />
                </div>
              </div>

              <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 rounded-xl text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-blue-600 dark:text-blue-400">sync</span>
                <span>Wordt automatisch gesynchroniseerd met de Google Agenda van het Gewest.</span>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg">Annuleren</button>
                <button type="submit" className="px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all">{editId ? 'Opslaan' : 'Toevoegen'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DeleteConfirmModal open={!!itemToDelete} onCancel={() => setItemToDelete(null)} onConfirm={confirmDelete} />
      <DeleteConfirmModal 
        open={showCleanupModal} 
        onCancel={() => setShowCleanupModal(false)} 
        onConfirm={handleCleanupPast} 
        title="Afgelopen evenementen verwijderen?"
        description={`Weet je zeker dat je alle ${pastItems.length} afgelopen evenement(en) definitief wilt wissen uit de database? Deze actie kan niet ongedaan worden gemaakt.`}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function Profile() {
  const [userProfile, setUserProfile] = useState<any>({
    id: "", name: "", email: "", phone: "",
    avatar: "https://placehold.co/150x150/d94824/white?text=GL", receivePost: false
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  useEffect(() => {
    setIsDarkMode(document.documentElement.classList.contains('dark'));
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUserProfile({
          id: parsed.id || "", name: parsed.name || "", email: parsed.email || "",
          phone: parsed.phone || "",
          avatar: parsed.avatar || `https://placehold.co/150x150/d94824/white?text=${parsed.name?.charAt(0) || 'GL'}`,
          receivePost: parsed.receivePost === true || parsed.receivePost === 1
        });
      } catch (e) {}
    }
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true); setSaveMsg('');
    try {
      const res = await authFetch(`/api/users/${userProfile.id}/profile`, {
        method: 'PUT', body: JSON.stringify(userProfile)
      });
      if (!res.ok) throw new Error("Fout bij opslaan");
      const existingStored = getCurrentUser() || {};
      localStorage.setItem('user', JSON.stringify({ ...existingStored, ...userProfile }));
      setSaveMsg('Profiel succesvol opgeslagen!');
      setTimeout(() => setSaveMsg(''), 4000);
      window.dispatchEvent(new Event('storage'));
    } catch (error) {
      setSaveMsg('Er ging iets mis bij het opslaan.');
    } finally { setIsSaving(false); }
  };

  const handleAvatarChange = () => {
    const url = prompt("Voer de URL in van je nieuwe profielfoto:", userProfile.avatar);
    if (url) setUserProfile({ ...userProfile, avatar: url });
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      const res = await authFetch(`/api/users/${userProfile.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fout bij verwijderen account.');
      localStorage.removeItem('user');
      alert('Je account is succesvol verwijderd.');
      window.location.href = '/login';
    } catch (err: any) {
      alert(err.message || 'Kon account niet verwijderen.');
      setIsDeletingAccount(false);
      setShowDeleteModal(false);
    }
  };

  const toggleTheme = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const dark = e.target.checked;
    setIsDarkMode(dark);
    applyDarkMode(dark);
    if (userProfile.id) await saveDarkModePreference(userProfile.id, dark);
  };

  const inputClass = "w-full px-4 py-2 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white focus:bg-white dark:focus:bg-slate-600 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none";

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-black tracking-tight text-slate-800 dark:text-white">Profiel & Instellingen</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Beheer je persoonlijke gegevens en applicatie instellingen.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm flex flex-col items-center text-center">
            <div className="size-32 rounded-full bg-slate-200 dark:bg-slate-700 bg-cover bg-center border-4 border-white dark:border-slate-700 shadow-md mb-4"
              style={{ backgroundImage: safeCssUrl(userProfile.avatar) }}></div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white">{userProfile.name}</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-2">Gewest Reinaertland</p>
            {/* Profielfoto info */}
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 leading-relaxed">
              Plak een directe afbeelding-URL (bijv. van Google Drive of Imgur). Geen bestandsupload mogelijk.
            </p>
            <button onClick={handleAvatarChange} className="px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-white dark:hover:bg-slate-600 hover:shadow-sm transition-all w-full cursor-pointer">
              Foto Wijzigen (URL)
            </button>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-4">
              <span className="material-symbols-outlined text-primary">person</span> Persoonlijke Gegevens
            </h3>
            <form className="space-y-4" onSubmit={handleSaveProfile}>
              {saveMsg && (
                <div className={`px-4 py-3 rounded-lg text-sm font-medium ${saveMsg.includes('mis') ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700' : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700'}`}>
                  {saveMsg}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Volledige Naam</label>
                  <input className={inputClass} type="text" value={userProfile.name} onChange={(e) => setUserProfile({...userProfile, name: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Email Adres</label>
                  <input className="w-full px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-500 cursor-not-allowed" type="email" value={userProfile.email} disabled />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Telefoonnummer</label>
                  <input className={inputClass} type="tel" value={userProfile.phone} onChange={(e) => setUserProfile({...userProfile, phone: e.target.value})} placeholder="bv. 0470 12 34 56" />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <button type="submit" disabled={isSaving} className="px-6 py-2 bg-primary text-white font-bold rounded-lg shadow-md shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50">
                  {isSaving ? 'Bezig...' : 'Opslaan'}
                </button>
              </div>
            </form>
          </section>

          <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-4">
              <span className="material-symbols-outlined text-primary">settings</span> Voorkeuren & Notificaties
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/30">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-white">Post van Chiro Nationaal</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Ontvang het tijdschrift en brieven per post.</p>
                </div>
                <label className="relative flex items-center cursor-pointer">
                  <input type="checkbox" className="peer sr-only" checked={userProfile.receivePost}
                    onChange={async (e) => {
                      const val = e.target.checked;
                      setUserProfile({...userProfile, receivePost: val});
                      try {
                        await authFetch(`/api/users/${userProfile.id}/profile`, {
                          method: 'PUT',
                          body: JSON.stringify({ ...userProfile, receivePost: val }),
                        });
                        const existingStored = getCurrentUser() || {};
                        localStorage.setItem('user', JSON.stringify({ ...existingStored, ...userProfile, receivePost: val }));
                      } catch (err) { console.error('Fout bij opslaan receivePost', err); }
                    }}
                  />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-600 rounded-full peer-checked:bg-primary transition-colors"></div>
                  <div className="absolute left-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow-sm"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/30">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-white">Donkere Modus</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Schakel het donkere thema in voor de applicatie.</p>
                </div>
                <label className="relative flex items-center cursor-pointer">
                  <input type="checkbox" className="peer sr-only" checked={isDarkMode} onChange={toggleTheme} />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-600 rounded-full peer-checked:bg-primary transition-colors"></div>
                  <div className="absolute left-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow-sm"></div>
                </label>
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-4">
              <span className="material-symbols-outlined text-primary">lock</span> Wachtwoord Wijzigen
            </h3>
            <PasswordChangeForm />
          </section>

          <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm border-l-4 border-l-red-500">
            <h3 className="text-lg font-bold mb-2 text-slate-800 dark:text-white">Gevarenzone</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Acties hier kunnen niet ongedaan worden gemaakt.</p>
            <button
              type="button"
              className="px-4 py-2 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-medium rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
              onClick={() => setShowDeleteModal(true)}
            >
              Account Verwijderen
            </button>
          </section>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-700 shadow-xl text-center">
            <div className="size-12 rounded-full bg-red-50 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-2xl">warning</span>
            </div>
            <h4 className="font-bold text-slate-900 dark:text-white text-base mb-1">
              Account definitief verwijderen?
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
              Weet je zeker dat je jouw account wilt verwijderen? Je verliest onmiddellijk toegang tot het beheerportaal. Deze actie kan niet ongedaan worden gemaakt.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingAccount}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isDeletingAccount ? 'Bezig...' : 'Ja, verwijder mijn account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function PasswordChangeForm() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const userId = getCurrentUser()?.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.next !== form.confirm) { setStatus({ type: 'error', msg: 'Nieuwe wachtwoorden komen niet overeen.' }); return; }
    if (form.next.length < 8 || !/[a-zA-Z]/.test(form.next) || !/[0-9]/.test(form.next)) { setStatus({ type: 'error', msg: 'Wachtwoord moet minstens 8 tekens lang zijn met minstens één letter en één cijfer.' }); return; }
    setLoading(true); setStatus(null);
    try {
      const res = await authFetch(`/api/users/${userId}/password`, { method: 'PUT', body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fout bij wijzigen.');
      setStatus({ type: 'success', msg: 'Wachtwoord succesvol gewijzigd!' });
      setForm({ current: '', next: '', confirm: '' });
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message });
    } finally { setLoading(false); }
  };

  const inputClass = "w-full px-4 py-2 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white focus:bg-white dark:focus:bg-slate-600 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {status && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${status.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700'}`}>
          {status.msg}
        </div>
      )}
      <div>
        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Huidig Wachtwoord</label>
        <input type="password" value={form.current} onChange={e => setForm({...form, current: e.target.value})} required className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Nieuw Wachtwoord</label>
          <input type="password" value={form.next} onChange={e => setForm({...form, next: e.target.value})} required className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Bevestig Wachtwoord</label>
          <input type="password" value={form.confirm} onChange={e => setForm({...form, confirm: e.target.value})} required className={inputClass} />
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <button type="submit" disabled={loading} className="px-6 py-2 bg-primary text-white font-bold rounded-lg shadow-md shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50">
          {loading ? 'Bezig...' : 'Wachtwoord Wijzigen'}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function Gebruikers() {
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  // Niet-admins krijgen een nette melding i.p.v. een lege/kapotte pagina
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-24 text-center">
        <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-4xl text-slate-400">lock</span>
        </div>
        <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">Geen toegang</h2>
        <p className="text-slate-500 dark:text-slate-400">Alleen Groepsleiding mag gebruikers beheren.</p>
      </div>
    );
  }

  const [users, setUsers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'leiding' });
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchUsers = async () => {
    try {
      const res = await authFetch('/api/users');
      setUsers(await res.json());
    } catch (e) { console.error('Error fetching users', e); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try {
      const method = editId ? 'PUT' : 'POST';
      const url = editId ? `/api/users/${editId}` : '/api/users';
      
      const res = await authFetch(url, { method, body: JSON.stringify(newUser) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fout bij opslaan.');
      
      setShowModal(false);
      setEditId(null);
      setNewUser({ name: '', email: '', password: '', role: 'leiding' });
      setSuccess(editId ? `Gebruiker "${newUser.name}" bijgewerkt!` : `Gebruiker "${newUser.name}" aangemaakt!`);
      fetchUsers();
      setTimeout(() => setSuccess(''), 6000);
    } catch (err: any) { setError(err.message); }
  };

  const handleEdit = (u: any) => {
    setNewUser({ name: u.name, email: u.email, password: '', role: u.role });
    setEditId(u.id);
    setError('');
    setShowModal(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    try {
      await authFetch(`/api/users/${userToDelete}`, { method: 'DELETE' });
      setUserToDelete(null);
      fetchUsers();
    } catch (e) { console.error('Error deleting user', e); }
  };

  const inputClass = "w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none";

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-800 dark:text-white">Gebruikers</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Beheer wie er kan inloggen op het dashboard.</p>
        </div>
        <button onClick={() => { setEditId(null); setNewUser({ name: '', email: '', password: '', role: 'leiding' }); setError(''); setShowModal(true); }}
          className="w-full sm:w-auto px-4 py-2 bg-primary text-white font-bold rounded-lg shadow-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0">
          <span className="material-symbols-outlined text-sm">person_add</span> Nieuwe Gebruiker
        </button>
      </div>

      {success && (
        <div className="mb-6 px-4 py-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-400 rounded-lg text-sm font-medium flex items-center gap-2">
          <span className="material-symbols-outlined text-base">check_circle</span> {success}
        </div>
      )}

      <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
          <p className="text-sm text-slate-500 dark:text-slate-400">Iedereen hieronder kan inloggen en het dashboard beheren.</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group">
              <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-700 bg-cover bg-center shrink-0 border border-slate-200 dark:border-slate-600"
                style={{ backgroundImage: safeCssUrl(u.avatar, `https://placehold.co/150x150/d94824/white?text=${encodeURIComponent((u.name || 'L').charAt(0))}`) }}></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-slate-800 dark:text-white truncate">{u.name}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${
                    u.role === 'admin'
                      ? 'bg-orange-50 dark:bg-primary/20 text-primary border-orange-100 dark:border-primary/30'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600'
                  }`}>
                    {u.role === 'admin' ? 'Groepsleiding' : 'Leiding'}
                  </span>
                  {u.id === currentUser?.id && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600">Jij</span>
                  )}
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleEdit(u)}
                  className="size-9 text-slate-400 hover:text-primary bg-slate-50 dark:bg-slate-700 hover:bg-orange-50 dark:hover:bg-primary/10 rounded-full transition-colors flex items-center justify-center shrink-0 cursor-pointer">
                  <span className="material-symbols-outlined text-[20px] leading-none">edit</span>
                </button>
                {u.id !== currentUser?.id && (
                  <button onClick={() => setUserToDelete(u.id)}
                    className="size-9 text-slate-400 hover:text-red-600 bg-slate-50 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors flex items-center justify-center shrink-0 cursor-pointer">
                    <span className="material-symbols-outlined text-[20px] leading-none">delete</span>
                  </button>
                )}
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <div className="px-6 py-8 text-center text-slate-500 dark:text-slate-400 text-sm">Geen gebruikers gevonden.</div>
          )}
        </div>
      </section>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">{editId ? 'Gebruiker Bewerken' : 'Nieuwe Gebruiker'}</h3>
              <button onClick={() => { setShowModal(false); setEditId(null); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              {error && <div className="px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg text-sm">{error}</div>}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Naam</label>
                <input required type="text" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">E-mailadres</label>
                <input required type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Rol</label>
                <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} className={inputClass}>
                  <option value="leiding">Leiding</option>
                  <option value="admin">Groepsleiding (Admin)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{editId ? 'Wachtwoord wijzigen (Optioneel)' : 'Tijdelijk Wachtwoord'}</label>
                <input required={!editId} type="text" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} placeholder={editId ? "Leeg laten om te behouden" : "Min. 8 tekens"} className={inputClass} />
                {!editId && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Geef dit wachtwoord door — de persoon kan het zelf wijzigen via Instellingen.</p>}
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => { setShowModal(false); setEditId(null); }} className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg">Annuleren</button>
                <button type="submit" className="px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary/90">{editId ? 'Opslaan' : 'Aanmaken'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DeleteConfirmModal
        open={!!userToDelete}
        onCancel={() => setUserToDelete(null)}
        onConfirm={confirmDelete}
        title="Gebruiker verwijderen?"
        description="Deze persoon kan daarna niet meer inloggen."
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function DeleteConfirmModal({ open, onCancel, onConfirm, title = 'Weet je het zeker?', description = 'Deze actie kan niet ongedaan worden gemaakt.' }: {
  open: boolean; onCancel: () => void; onConfirm: () => void; title?: string; description?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-3xl">warning</span>
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
        <p className="text-slate-500 dark:text-slate-400 mb-6">{description}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={onCancel} className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Annuleren</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors">Verwijderen</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function Messages() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgToDelete, setMsgToDelete] = useState<string | null>(null);

  const fetchMessages = async () => {
    try {
      const res = await authFetch('/api/messages');
      const data = await res.json();
      data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMessages(data);
    } catch (e) { console.error('Error fetching messages', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMessages(); }, []);

  const confirmDelete = async () => {
    if (!msgToDelete) return;
    try {
      await authFetch(`/api/messages/${msgToDelete}`, { method: 'DELETE' });
      setMsgToDelete(null);
      fetchMessages();
    } catch (e) { console.error('Error deleting message', e); }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-black tracking-tight text-slate-800 dark:text-white">Berichten</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Ingekomen berichten via het contactformulier.</p>
      </div>

      <div className="space-y-4">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="h-32 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse"></div>)
        ) : messages.length > 0 ? messages.map(msg => (
          <div key={msg.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm group relative">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                  {msg.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-white">{msg.name}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{msg.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-400 bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded-md">
                  {new Date(msg.createdAt).toLocaleString('nl-BE', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                </span>
                <button onClick={() => setMsgToDelete(msg.id)} 
                  className="size-9 text-slate-400 hover:text-red-600 bg-slate-50 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors flex items-center justify-center shrink-0 cursor-pointer">
                  <span className="material-symbols-outlined text-[20px] leading-none">delete</span>
                </button>
              </div>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>
            <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-700 flex justify-end">
              <a href={`mailto:${msg.email}?subject=Re: Bericht via website`} className="text-primary text-xs font-bold flex items-center gap-1 hover:underline">
                <span className="material-symbols-outlined text-sm">reply</span> Beantwoorden
              </a>
            </div>
          </div>
        )) : (
          <div className="text-center py-20 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
            <span className="material-symbols-outlined text-5xl text-slate-200 mb-4">mail_outline</span>
            <p className="text-slate-500">Nog geen berichten ontvangen.</p>
          </div>
        )}
      </div>

      <DeleteConfirmModal open={!!msgToDelete} onCancel={() => setMsgToDelete(null)} onConfirm={confirmDelete} title="Bericht verwijderen?" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <HelmetProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          
          {/* Beheer routes */}
          <Route path="/beheer/dashboard" element={<DashboardLayout><Dashboard /></DashboardLayout>} />
          <Route path="/beheer/profile" element={<DashboardLayout><Profile /></DashboardLayout>} />
          <Route path="/beheer/leiding" element={<DashboardLayout><LeidingBeheer authFetch={authFetch} /></DashboardLayout>} />
          <Route path="/beheer/gebruikers" element={<Navigate to="/beheer/leiding" replace />} />
          <Route path="/beheer/financien" element={<DashboardLayout><Financien authFetch={authFetch} /></DashboardLayout>} />
          <Route path="/beheer/agenda" element={<DashboardLayout><Agenda /></DashboardLayout>} />
          <Route path="/beheer/formulieren" element={<DashboardLayout><BeheerFormulieren authFetch={authFetch} /></DashboardLayout>} />
          <Route path="/beheer/albums" element={<DashboardLayout><Albums authFetch={authFetch} /></DashboardLayout>} />
          <Route path="/beheer/berichten" element={<DashboardLayout><Messages /></DashboardLayout>} />
          
          {/* Redirects voor oude paden */}
          <Route path="/dashboard" element={<Navigate to="/beheer/dashboard" replace />} />
          <Route path="/profile" element={<Navigate to="/beheer/profile" replace />} />
          <Route path="/leiding" element={<Navigate to="/beheer/leiding" replace />} />
          <Route path="/gebruikers" element={<Navigate to="/beheer/leiding" replace />} />
          <Route path="/financien" element={<Navigate to="/beheer/financien" replace />} />
          <Route path="/kas" element={<Navigate to="/beheer/financien" replace />} />
          <Route path="/albums" element={<Navigate to="/beheer/albums" replace />} />
          <Route path="/formulieren" element={<Navigate to="/inschrijvingen" replace />} />

          {/* Publieke routes */}
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/inschrijvingen" element={<InschrijvingenPage />} />
          <Route path="/inschrijvingen/:id" element={<InschrijvingenPage />} />
          <Route path="/fotos" element={<Fotos />} />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </HelmetProvider>
  );
}