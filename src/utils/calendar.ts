import { parseNlDate, getEventEndDate } from './date';

export interface CalendarEventData {
  title: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  allDay?: boolean;
}

/**
 * Converteert evenement-gegevens naar geldige Date objecten voor de agenda.
 */
export function resolveEventDates(event: {
  date: string;
  endDate?: string | null;
  time?: string | null;
}): { startDate: Date; endDate: Date; allDay: boolean } {
  let start = parseNlDate(event.date) || new Date();
  let end = getEventEndDate(event) || new Date(start.getTime() + 3 * 60 * 60 * 1000);

  let allDay = true;

  if (event.time && event.time.trim()) {
    const timeMatches = event.time.match(/(\d{1,2}):(\d{2})/g);
    if (timeMatches && timeMatches.length > 0) {
      const [sh, sm] = timeMatches[0].split(':').map(Number);
      start = new Date(start.getFullYear(), start.getMonth(), start.getDate(), sh, sm, 0);
      allDay = false;

      if (timeMatches.length > 1) {
        const [eh, em] = timeMatches[1].split(':').map(Number);
        end = new Date(end.getFullYear(), end.getMonth(), end.getDate(), eh, em, 0);
      } else {
        // Standaard duur van 3 uur indien enkel startuur gekend is
        end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
      }
    }
  }

  // Zorg dat einddatum nooit vóór begindatum ligt
  if (end.getTime() < start.getTime()) {
    end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  }

  return { startDate: start, endDate: end, allDay };
}

/**
 * Genereert een directe URL om het evenement toe te voegen aan Google Agenda (web & mobiele app).
 */
export function buildGoogleCalendarUrl(event: CalendarEventData): string {
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));

  const formatUtc = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const formatDateOnly = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

  let datesParam: string;
  if (event.allDay) {
    // Voor all-day events in Google Calendar moet de einddatum exclusief de volgende dag zijn
    const nextDay = new Date(event.endDate.getTime() + 24 * 60 * 60 * 1000);
    datesParam = `${formatDateOnly(event.startDate)}/${formatDateOnly(nextDay)}`;
  } else {
    datesParam = `${formatUtc(event.startDate)}/${formatUtc(event.endDate)}`;
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: datesParam,
    details: event.description || 'Gewest Reinaertland • reinaertland.be',
    location: event.location || 'Gewest Reinaertland',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Genereert de standaard RFC 5545 iCalendar (.ics) string.
 * Deze wordt direct ondersteund door Apple Agenda (iPhone / iPad / Mac), Microsoft Outlook en Android.
 */
export function generateIcsContent(event: CalendarEventData): string {
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));

  const formatUtc = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const formatDateOnly = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

  let dtStartLine: string;
  let dtEndLine: string;

  if (event.allDay) {
    const nextDay = new Date(event.endDate.getTime() + 24 * 60 * 60 * 1000);
    dtStartLine = `DTSTART;VALUE=DATE:${formatDateOnly(event.startDate)}`;
    dtEndLine = `DTEND;VALUE=DATE:${formatDateOnly(nextDay)}`;
  } else {
    dtStartLine = `DTSTART:${formatUtc(event.startDate)}`;
    dtEndLine = `DTEND:${formatUtc(event.endDate)}`;
  }

  const escapeIcs = (str?: string) =>
    (str || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');

  const now = new Date();
  const uid = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}@reinaertland.be`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gewest Reinaertland//Evenementen//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatUtc(now)}`,
    dtStartLine,
    dtEndLine,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description || 'Gewest Reinaertland • reinaertland.be')}`,
    `LOCATION:${escapeIcs(event.location || 'Gewest Reinaertland')}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Triggert een directe download van het .ics bestand.
 * Op iPhone / iOS opent dit direct de Agenda-app met de vraag "Voeg toe aan agenda".
 */
export function downloadIcsFile(filename: string, icsContent: string): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeName = (filename || 'evenement').replace(/[^a-zA-Z0-9_-]/g, '_');
  link.download = `${safeName}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
