// ─── Security Helpers voor veilige URL's, CSS-achtergronden & HTML escaping ───

/**
 * Escapet HTML speciale tekens om XSS in print-documenten en templates te voorkomen.
 */
export function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Valideert een externe of relatieve link voor gebruik in `<a href={...}>`.
 * Staat uitsluitend `https:`, `http:`, `mailto:`, `tel:` of een veilige relatieve `/`-route toe.
 * Blokkeert `javascript:`, `data:`, `vbscript:` en protocol-relatieve `//evil.com` URL's.
 */
export function safeHref(raw?: string | null): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Veilige interne relatieve route (geen // protocol-relatieve redirect)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol === 'https:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'mailto:' ||
      parsed.protocol === 'tel:'
    ) {
      return parsed.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Valideert een afbeeldings-URL voor gebruik in `<img src>` of CSS `backgroundImage: url(...)`.
 * Staat alleen `https:`, `http:`, relatieve `/img/...` paden, of veilige raster `data:image/(webp|png|jpeg|jpg|gif);base64,...` toe.
 * Blokkeert SVG data-URI's (script-risico) en CSS-injectiekarakters (`'`, `"`, `)`, `\n`).
 */
export function safeImageUrl(raw?: string | null, fallback = ''): string {
  if (!raw || typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  // Veilige lokale assets
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !/['"()\\\r\n]/.test(trimmed)) {
    return trimmed;
  }

  // Veilige base64 rasterafbeeldingen (expliciet GEEN svg+xml)
  if (/^data:image\/(webp|png|jpeg|jpg|gif);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return fallback;
    }
    const serialized = parsed.toString();
    if (/['"()\\\r\n]/.test(serialized)) {
      return fallback;
    }
    return serialized;
  } catch {
    return fallback;
  }
}

/**
 * Genereert een veilige CSS `url("...")` waarde voor inline `backgroundImage` stijlen.
 */
export function safeCssUrl(raw?: string | null, fallback = ''): string {
  const safe = safeImageUrl(raw, fallback);
  return safe ? `url("${safe}")` : 'none';
}
