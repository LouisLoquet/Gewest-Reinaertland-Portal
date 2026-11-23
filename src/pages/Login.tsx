import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';

export default function Login() {
  const [searchParams] = useSearchParams();
  const reason = searchParams.get('reason');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Inloggen mislukt. Probeer het opnieuw.');
        return;
      }
      // Sla zowel token als gebruikersinfo op en update activiteitstijd
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('gewest_last_active', String(Date.now()));
      navigate('/dashboard');
    } catch (err) {
      setError('Kan geen verbinding maken met de server. Probeer het later opnieuw.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark p-4 font-display relative">
      <div className="absolute top-4 left-4 sm:top-8 sm:left-8">
        <Link to="/" className="flex items-center gap-2 text-slate-500 hover:text-primary transition-colors font-medium bg-white dark:bg-slate-900 px-4 py-2 rounded-full shadow-sm border border-slate-200 dark:border-slate-800">
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Terug naar home
        </Link>
      </div>
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="p-8 sm:p-12">
          {/* Logo + titel */}
          <div className="text-center mb-10">
            <Link to="/" className="inline-flex items-center justify-center size-16 rounded-2xl bg-primary text-white mb-6 shadow-lg shadow-primary/30 hover:bg-primary/90 transition-colors">
              <img src="/img/logo.png" className="w-full h-full object-contain" />
            </Link>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Welkom terug</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">Log in op het Gewest Reinaertland portaal</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Sessie / inactiviteit melding */}
            {reason === 'inactivity' && !error && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 rounded-xl text-sm font-medium">
                <span className="material-symbols-outlined text-base shrink-0 mt-0.5 text-amber-600">timer</span>
                <span>Je bent automatisch uitgelogd na 2 uur inactiviteit. Log opnieuw in om verder te gaan.</span>
              </div>
            )}
            {reason === 'expired' && !error && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 rounded-xl text-sm font-medium">
                <span className="material-symbols-outlined text-base shrink-0 mt-0.5 text-amber-600">lock_reset</span>
                <span>Je sessie is verlopen. Gelieve opnieuw in te loggen.</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium">
                <span className="material-symbols-outlined text-base shrink-0 mt-0.5">error</span>
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300" htmlFor="email">
                E-mailadres
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">mail</span>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                  placeholder="naam@reinaertland.be"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300" htmlFor="password">
                  Wachtwoord
                </label>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">lock</span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  <span className="material-symbols-outlined text-base">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/30 hover:bg-primary/90 hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100 mt-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Bezig met inloggen...
                </>
              ) : (
                <>
                  Inloggen
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </>
              )}
            </button>
          </form>
        </div>

        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Geen toegang? <a href="mailto:contact@reinaertland.be" target="_blank" rel="noopener noreferrer" className="font-bold text-primary hover:underline">Contacteer de beheerder</a>
          </p>
        </div>
      </div>
    </div>
  );
}
