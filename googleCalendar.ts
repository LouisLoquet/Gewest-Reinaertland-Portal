import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { resolveEventDates } from './src/utils/calendar';
import { parseNlDate, NL_MONTHS_FULL } from './src/utils/date';

// ─── Google Agenda Configuratie ──────────────────────────────────────────────
export const GOOGLE_CALENDAR_CONFIG = {
  calendarId: process.env.GOOGLE_CALENDAR_ID || '',
  serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
  apiKey: process.env.GOOGLE_API_KEY || '',
};

export interface EventInput {
  title: string;
  date: string;
  endDate?: string | null;
  time?: string | null;
  location?: string | null;
  type?: string | null;
  website?: string | null;
}

interface ServiceAccountCredentials {
  privateKey?: string;
  clientEmail: string;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Zoekt naar de Google Service Account Private Key:
 * 1. google-calendar-key.json (of service-account.json) in de hoofdmap
 * 2. GOOGLE_SERVICE_ACCOUNT_KEY_JSON in .env (volledige JSON)
 * 3. GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY of GOOGLE_PRIVATE_KEY in .env (PEM string)
 */
export function getServiceAccountCredentials(): ServiceAccountCredentials {
  const defaultEmail = GOOGLE_CALENDAR_CONFIG.serviceAccountEmail;

  // 1. Zoek naar een JSON sleutelbestand in het project
  const candidateFiles = [
    'google-calendar-key.json',
    'google-service-account.json',
    'service-account.json',
    'credentials.json',
    'gewest-agenda-bot.json'
  ];

  for (const filename of candidateFiles) {
    const fullPath = path.resolve(process.cwd(), filename);
    if (fs.existsSync(fullPath)) {
      try {
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.private_key) {
          return {
            privateKey: parsed.private_key,
            clientEmail: parsed.client_email || defaultEmail
          };
        }
      } catch (err) {
        console.warn(`[Google Calendar] Kon sleutelbestand ${filename} niet verwerken:`, err);
      }
    }
  }

  // 2. Omgevingsvariabele met volledige JSON
  const jsonEnv = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
  if (jsonEnv) {
    try {
      const parsed = JSON.parse(jsonEnv);
      if (parsed.private_key) {
        return {
          privateKey: parsed.private_key,
          clientEmail: parsed.client_email || defaultEmail
        };
      }
    } catch (err) {
      console.warn('[Google Calendar] Kon GOOGLE_SERVICE_ACCOUNT_KEY_JSON niet parsen:', err);
    }
  }

  // 3. Omgevingsvariabele met directe PEM private key
  const pemEnv = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY;
  if (pemEnv) {
    // Corrigeer eventuele escaped newlines
    const formattedKey = pemEnv.includes('\\n') ? pemEnv.replace(/\\n/g, '\n') : pemEnv;
    return {
      privateKey: formattedKey,
      clientEmail: defaultEmail
    };
  }

  return { clientEmail: defaultEmail };
}

/**
 * Genereert een gesigneerd JWT en ruilt dit om voor een OAuth2 access token.
 */
export async function getGoogleAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Gebruik cache indien nog ten minste 60 seconden geldig
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const { privateKey, clientEmail } = getServiceAccountCredentials();

  if (!privateKey) {
    throw new Error(
      'Google Service Account Private Key ontbreekt. Plaats "google-calendar-key.json" in de projectmap of stel GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in in .env.'
    );
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const encodeBase64Url = (obj: any) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  const unsignedToken = `${encodeBase64Url(header)}.${encodeBase64Url(claimSet)}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  const signature = signer.sign(privateKey, 'base64url');

  const assertion = `${unsignedToken}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }).toString()
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Google OAuth2 fout (${res.status}): ${errorBody}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600)
  };

  return data.access_token;
}

/**
 * Converteert een gewest-evenement naar een valide Google Calendar Event payload.
 */
export function formatGoogleCalendarEventPayload(event: EventInput) {
  const { startDate, endDate, allDay } = resolveEventDates(event);

  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  const formatDateOnly = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  let start: any;
  let end: any;

  if (allDay) {
    // In Google Calendar is de einddatum van all-day events exclusief (+1 dag)
    const nextDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1);
    start = { date: formatDateOnly(startDate) };
    end = { date: formatDateOnly(nextDay) };
  } else {
    const formatDateTime = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

    start = {
      dateTime: formatDateTime(startDate),
      timeZone: 'Europe/Brussels'
    };
    end = {
      dateTime: formatDateTime(endDate),
      timeZone: 'Europe/Brussels'
    };
  }

  let description = `Type: ${event.type || 'Vergadering'}`;
  if (event.time) {
    description += `\nTijdstip: ${event.time}`;
  }
  if (event.website) {
    description += `\nWebsite: ${event.website}`;
  }
  description += '\n\nGewest Reinaertland • reinaertland.be';

  return {
    summary: event.title,
    description,
    location: event.location || 'Gewest Reinaertland',
    start,
    end
  };
}

/**
 * Zoekt of er in Google Calendar al een afspraak bestaat met dezelfde titel en begindatum.
 * Voorkomt dubbele aanmaak bij het synchroniseren van bestaande agenda-items.
 */
export async function findMatchingGoogleEvent(
  event: EventInput
): Promise<string | null> {
  try {
    const { startDate } = resolveEventDates(event);
    const pad = (n: number) => (n < 10 ? '0' + n : String(n));
    const targetDateStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;

    const calendarId = encodeURIComponent(GOOGLE_CALENDAR_CONFIG.calendarId);
    let url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?maxResults=250&singleEvents=true`;
    const headers: Record<string, string> = {};
    if (GOOGLE_CALENDAR_CONFIG.apiKey) {
      url += `&key=${encodeURIComponent(GOOGLE_CALENDAR_CONFIG.apiKey)}`;
    } else {
      const token = await getGoogleAccessToken();
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: any[] };

    const items = data.items || [];
    const normalizedTarget = (event.title || '').trim().toLowerCase();

    for (const item of items) {
      const summary = (item.summary || '').trim().toLowerCase();
      const itemStart = item.start?.dateTime || item.start?.date || '';
      if (itemStart.startsWith(targetDateStr)) {
        if (summary === normalizedTarget || summary.includes(normalizedTarget) || normalizedTarget.includes(summary)) {
          return item.id;
        }
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Haalt alle actieve en toekomstige evenementen op uit de Google Calendar gewestagenda.
 */
export async function fetchUpcomingGoogleEvents(): Promise<any[]> {
  try {
    const calendarId = encodeURIComponent(GOOGLE_CALENDAR_CONFIG.calendarId);
    // Vanaf begin huidig werkjaar (1 september 2026)
    const timeMin = '2026-09-01T00:00:00Z';
    let url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?timeMin=${timeMin}&maxResults=250&singleEvents=true&orderBy=startTime`;
    const headers: Record<string, string> = {};
    if (GOOGLE_CALENDAR_CONFIG.apiKey) {
      url += `&key=${encodeURIComponent(GOOGLE_CALENDAR_CONFIG.apiKey)}`;
    } else {
      const token = await getGoogleAccessToken();
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.warn(`[Google Calendar] Kon afspraken niet ophalen (${res.status})`);
      return [];
    }
    const data = (await res.json()) as { items?: any[] };
    return data.items || [];
  } catch (err) {
    console.warn('[Google Calendar] Fout bij ophalen van Google evenementen:', err);
    return [];
  }
}

/**
 * Converteert een Google Calendar event object naar het EventInput formaat voor de website database.
 */
export function convertGoogleEventToWebsiteEvent(gEvent: any): (EventInput & { googleEventId: string }) | null {
  const summary = (gEvent.summary || '').trim();
  if (!summary) return null;

  const startRaw = gEvent.start?.dateTime || gEvent.start?.date;
  if (!startRaw) return null;

  const startDateIso = startRaw.slice(0, 10);
  const [startY, startM, startD] = startDateIso.split('-').map(Number);
  if (!startY || !startM || !startD) return null;

  const dateNl = `${startD} ${NL_MONTHS_FULL[startM - 1]} ${startY}`;

  let endDateNl = '';
  const endRaw = gEvent.end?.dateTime || gEvent.end?.date;
  if (endRaw) {
    const endDateIso = endRaw.slice(0, 10);
    const [endY, endM, endD] = endDateIso.split('-').map(Number);

    if (gEvent.start?.date && gEvent.end?.date) {
      // All-day: Google end.date is exclusief (+1 dag)
      const startDateObj = new Date(startY, startM - 1, startD);
      const endDateObj = new Date(endY, endM - 1, endD);
      const diffDays = Math.round((endDateObj.getTime() - startDateObj.getTime()) / (24 * 60 * 60 * 1000));
      if (diffDays > 1) {
        const actualLastDay = new Date(endDateObj.getTime() - 24 * 60 * 60 * 1000);
        endDateNl = `${actualLastDay.getDate()} ${NL_MONTHS_FULL[actualLastDay.getMonth()]} ${actualLastDay.getFullYear()}`;
      }
    } else if (endDateIso !== startDateIso) {
      endDateNl = `${endD} ${NL_MONTHS_FULL[endM - 1]} ${endY}`;
    }
  }

  // Tijdstip bepalen
  let time = 'Hele dag';
  if (gEvent.start?.dateTime) {
    const sDate = new Date(gEvent.start.dateTime);
    const pad = (n: number) => (n < 10 ? '0' + n : String(n));
    const startTimeStr = `${pad(sDate.getHours())}:${pad(sDate.getMinutes())}`;

    if (gEvent.end?.dateTime) {
      const eDate = new Date(gEvent.end.dateTime);
      const endTimeStr = `${pad(eDate.getHours())}:${pad(eDate.getMinutes())}`;
      time = `${startTimeStr} - ${endTimeStr}`;
    } else {
      time = startTimeStr;
    }
  }

  // Type bepalen op basis van trefwoorden
  const lowerSummary = summary.toLowerCase();
  let type = 'Activiteit';
  if (/gewestweekend/i.test(lowerSummary)) {
    type = 'Gewestweekend';
  } else if (/ikaa/i.test(lowerSummary)) {
    type = 'IKAA';
  } else if (/pintreceptie/i.test(lowerSummary)) {
    type = 'Pintreceptie';
  } else if (/cocktailquiz|quiz/i.test(lowerSummary)) {
    type = 'Cocktailquiz';
  } else if (/vergadering|som\b/i.test(lowerSummary)) {
    type = 'Vergadering';
  } else if (/kaas|wijn|wine|wafelenbak|bbq|eetfestijn|spaghetti|eten|ontbijt/i.test(lowerSummary)) {
    type = 'Eetfestijn';
  } else if (/kerstmarkt|kasactie|bloemenslag/i.test(lowerSummary)) {
    type = 'Kasactie';
  } else if (/(fuif|party|dance|beats|chirobal|\bbal\b|open bar|pub\b|ouballen|ou ballen|oude hazen)/i.test(lowerSummary) && !/volleybal|voetbal|handbal/i.test(lowerSummary)) {
    type = 'Fuif';
  } else {
    type = 'Activiteit';
  }

  // Locatie bepalen
  let location = (gEvent.location || '').trim();
  if (!location) {
    if (/kemzeke/i.test(lowerSummary)) location = 'Kemzeke';
    else if (/sinaai/i.test(lowerSummary)) location = 'Sinaai';
    else if (/stekene/i.test(lowerSummary)) location = 'Stekene';
    else if (/meerdonk|saleghem/i.test(lowerSummary)) location = 'Meerdonk';
    else if (/klinge/i.test(lowerSummary)) location = 'De Klinge';
    else if (/verrebroek/i.test(lowerSummary)) location = 'Verrebroek';
    else location = 'Gewest Reinaertland';
  }

  // Website extraheren uit beschrijving indien aanwezig
  let website = '';
  if (gEvent.description) {
    const urlMatch = gEvent.description.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      website = urlMatch[0];
    }
  }

  return {
    title: summary,
    date: dateNl,
    endDate: endDateNl,
    time,
    location,
    type,
    website,
    googleEventId: gEvent.id
  };
}

/**
 * Voegt een afspraak toe aan de Google Calendar gewestagenda.
 * Geeft het Google Event ID terug bij succes.
 */
export async function insertGoogleCalendarEvent(event: EventInput): Promise<string | null> {
  try {
    const token = await getGoogleAccessToken();
    const payload = formatGoogleCalendarEventPayload(event);
    const calendarId = encodeURIComponent(GOOGLE_CALENDAR_CONFIG.calendarId);

    const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ [Google Calendar] Kon evenement niet toevoegen (${res.status}):`, errText);
      return null;
    }

    const data = (await res.json()) as { id: string; htmlLink?: string };
    console.log(`✅ [Google Calendar] Afspraak "${event.title}" toegevoegd aan Google Agenda! ID: ${data.id}`);
    return data.id;
  } catch (err: any) {
    console.warn(`⚠️ [Google Calendar] Sync overgeslagen: ${err?.message || err}`);
    return null;
  }
}

/**
 * Werkt een bestaande afspraak in de Google Calendar gewestagenda bij.
 */
export async function updateGoogleCalendarEvent(
  googleEventId: string,
  event: EventInput
): Promise<boolean> {
  try {
    if (!googleEventId) return false;
    const token = await getGoogleAccessToken();
    const payload = formatGoogleCalendarEventPayload(event);
    const calendarId = encodeURIComponent(GOOGLE_CALENDAR_CONFIG.calendarId);
    const eventId = encodeURIComponent(googleEventId);

    const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ [Google Calendar] Kon evenement niet bijwerken (${res.status}):`, errText);
      return false;
    }

    console.log(`✅ [Google Calendar] Afspraak "${event.title}" bijgewerkt in Google Agenda!`);
    return true;
  } catch (err: any) {
    console.warn(`⚠️ [Google Calendar] Update overgeslagen: ${err?.message || err}`);
    return false;
  }
}

/**
 * Verwijdert een afspraak uit de Google Calendar gewestagenda.
 */
export async function deleteGoogleCalendarEvent(googleEventId: string): Promise<boolean> {
  try {
    if (!googleEventId) return false;
    const token = await getGoogleAccessToken();
    const calendarId = encodeURIComponent(GOOGLE_CALENDAR_CONFIG.calendarId);
    const eventId = encodeURIComponent(googleEventId);

    const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (res.status === 404 || res.status === 410) {
      // Reeds verwijderd uit Google Agenda
      return true;
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ [Google Calendar] Kon evenement niet verwijderen (${res.status}):`, errText);
      return false;
    }

    console.log(`✅ [Google Calendar] Afspraak (ID: ${googleEventId}) verwijderd uit Google Agenda!`);
    return true;
  } catch (err: any) {
    console.warn(`⚠️ [Google Calendar] Verwijderen overgeslagen: ${err?.message || err}`);
    return false;
  }
}

/**
 * Haalt de status op van de Google Calendar koppeling (voor dashboard weergave).
 */
export async function getGoogleCalendarStatus() {
  const creds = getServiceAccountCredentials();
  const hasPrivateKey = Boolean(creds.privateKey);

  let writeAccess = false;
  let readAccess = false;
  let statusMessage = '';

  if (!GOOGLE_CALENDAR_CONFIG.calendarId) {
    return {
      configured: false,
      calendarId: '',
      serviceAccountEmail: GOOGLE_CALENDAR_CONFIG.serviceAccountEmail,
      hasPrivateKey,
      readAccess: false,
      writeAccess: false,
      statusMessage: 'GOOGLE_CALENDAR_ID is nog niet ingesteld in de omgevingsvariabelen.'
    };
  }

  // Test leesrechten met API-key of service account token
  try {
    const calendarId = encodeURIComponent(GOOGLE_CALENDAR_CONFIG.calendarId);
    let testUrl = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?maxResults=1`;
    const headers: Record<string, string> = {};
    if (GOOGLE_CALENDAR_CONFIG.apiKey) {
      testUrl += `&key=${encodeURIComponent(GOOGLE_CALENDAR_CONFIG.apiKey)}`;
    } else if (hasPrivateKey) {
      const token = await getGoogleAccessToken();
      headers.Authorization = `Bearer ${token}`;
    }
    if (GOOGLE_CALENDAR_CONFIG.apiKey || headers.Authorization) {
      const res = await fetch(testUrl, { headers });
      if (res.ok) {
        readAccess = true;
      }
    }
  } catch (err) {
    console.warn('[Google Calendar] Fout bij testen leesrechten:', err);
  }

  // Test schrijfrechten via service account token indien private key aanwezig
  if (hasPrivateKey) {
    try {
      const token = await getGoogleAccessToken();
      if (token) {
        writeAccess = true;
        statusMessage = 'Volledig gekoppeld en klaar voor automatische synchronisatie.';
      }
    } catch (err: any) {
      console.error('[Google Calendar] Service account authenticatie mislukt:', err);
      statusMessage = 'Sleutel aanwezig, maar authenticatie met Google is mislukt. Controleer de serverconfiguratie.';
    }
  } else {
    statusMessage =
      'Google Agenda service account geconfigureerd, maar de private key ontbreekt in de server-omgevingsvariabelen.';
  }

  return {
    configured: true,
    calendarId: GOOGLE_CALENDAR_CONFIG.calendarId,
    serviceAccountEmail: GOOGLE_CALENDAR_CONFIG.serviceAccountEmail,
    hasPrivateKey,
    readAccess,
    writeAccess,
    statusMessage
  };
}
