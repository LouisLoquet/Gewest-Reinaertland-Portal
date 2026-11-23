// ─── Shared Datum & Tekst Helpers (Gewest Reinaertland) ────────────────────────

export const NL_MONTHS_FULL = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december'
];

export const NL_MONTHS_SHORT = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec'
];

/**
 * Controleert of een datumstring exact het verwachte Nederlandse formaat heeft:
 * bijv. "8 augustus 2026"
 */
export const isValidDutchDate = (str: string): boolean => {
  if (!str) return false;
  const regex = /^\d{1,2}\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4}$/i;
  return regex.test(str.trim());
};

/**
 * Zet een datumstring (ISO of Nederlands) om naar een voluit geschreven datum:
 * bijv. "8 augustus 2026"
 */
export function formatFullDate(dateStr: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();

  // Als het al in het juiste formaat staat (bv. 8 augustus 2026), geef het netjes genormaliseerd terug
  if (isValidDutchDate(trimmed)) {
    const parts = trimmed.split(/\s+/);
    const day = parseInt(parts[0]);
    const month = parts[1].toLowerCase();
    const year = parts[2];
    return `${day} ${month} ${year}`;
  }

  let d: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    d = new Date(trimmed + 'T00:00:00');
  } else {
    const parts = trimmed.split(' ');
    if (parts.length >= 2) {
      const day = parseInt(parts[0]);
      const monthIdx = NL_MONTHS_FULL.findIndex(m => m.toLowerCase().startsWith(parts[1].toLowerCase().slice(0, 3)));
      const year = parseInt(parts[2] || String(new Date().getFullYear()));
      if (!isNaN(day) && monthIdx !== -1) d = new Date(year, monthIdx, day);
    }
  }

  if (!d || isNaN(d.getTime())) return dateStr;
  return `${d.getDate()} ${NL_MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Parset een Nederlandse datumstring (bv. "8 augustus 2026" of "8-10 augustus 2026") of ISO string naar een Date object.
 * Geeft de begindatum terug.
 */
export function parseNlDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const day = parseInt(parts[0].split('-')[0]);
    const monthIdx = NL_MONTHS_FULL.findIndex(m => m.toLowerCase().startsWith(parts[1].toLowerCase().slice(0, 3)));
    const year = parseInt(parts[2] || String(new Date().getFullYear()));
    if (!isNaN(day) && monthIdx !== -1 && !isNaN(year)) return new Date(year, monthIdx, day);
  }
  return null;
}

/**
 * Bepaalt de einddatum van een evenement.
 * Als endDate aanwezig is en geldig, wordt die gebruikt.
 * Anders wordt date gecontroleerd (bv. "8-10 augustus 2026").
 */
export function getEventEndDate(event: { date: string; endDate?: string | null }): Date | null {
  if (event.endDate && event.endDate.trim()) {
    const parsedEnd = parseNlDate(event.endDate.trim());
    if (parsedEnd) return parsedEnd;
  }

  if (event.date) {
    const trimmed = event.date.trim();
    const parts = trimmed.split(/\s+/);
    // Ondersteun "8-10 augustus 2026"
    if (parts.length >= 2 && parts[0].includes('-')) {
      const dayParts = parts[0].split('-');
      const lastDay = parseInt(dayParts[dayParts.length - 1]);
      const monthIdx = NL_MONTHS_FULL.findIndex(m => m.toLowerCase().startsWith(parts[1].toLowerCase().slice(0, 3)));
      const year = parseInt(parts[2] || String(new Date().getFullYear()));
      if (!isNaN(lastDay) && monthIdx !== -1 && !isNaN(year)) {
        return new Date(year, monthIdx, lastDay);
      }
    }
    return parseNlDate(trimmed);
  }

  return null;
}

/**
 * Controleert of een evenement reeds afgelopen is.
 * Een evenement wordt pas als afgelopen beschouwd ná het einde van de dag waarop het plaatsvindt (23:59:59.999).
 * Gedurende de dag van het evenement zelf blijft het zichtbaar als gepland/actief.
 */
export function isEventPassed(event: { date: string; endDate?: string | null }): boolean {
  const end = getEventEndDate(event);
  if (!end) return false;
  // Einde van de dag van het evenement (23:59:59.999)
  const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  return Date.now() > endOfDay.getTime();
}

/**
 * Helper om HTML entities te decoderen
 */
export function unescape(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x60;/g, '`');
}

/**
 * Berekent het Chiro-werkjaar op basis van een datumstring of Date (1 okt t/m 30 sept).
 * Bijv. 2 november 2026 valt in werkjaar '2026-2027'.
 */
export function computeWerkjaar(dateStr?: string | Date | null): string {
  const d = dateStr ? (typeof dateStr === 'string' ? new Date(dateStr) : dateStr) : new Date();
  if (isNaN(d.getTime())) {
    return '2026-2027';
  }
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const calculated = month >= 10 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  return calculated < '2026-2027' ? '2026-2027' : calculated;
}

