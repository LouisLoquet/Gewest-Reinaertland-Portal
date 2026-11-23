import express, { Request, Response, NextFunction } from 'express';
import { createClient } from '@libsql/client';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import validator from 'validator';
import dotenv from 'dotenv';
import nodemailer, { Transporter } from 'nodemailer';
import { isEventPassed } from './src/utils/date';
import {
  insertGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  findMatchingGoogleEvent,
  fetchUpcomingGoogleEvents,
  convertGoogleEventToWebsiteEvent,
  getGoogleCalendarStatus,
  GOOGLE_CALENDAR_CONFIG
} from './googleCalendar';

dotenv.config();

// Voorkom dat de server stilletjes crasht bij onverwachte fouten
process.on('uncaughtException', (err) => {
  console.error('🔥 CRITICAL ERROR (uncaughtException):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

const IS_PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || 'https://reinaertland.be').replace(/\/+$/, '');
const SESSION_INACTIVITY_HOURS = Math.max(0.5, Math.min(24, Number(process.env.SESSION_INACTIVITY_HOURS) || 2));

if (IS_PROD && (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 32)) {
  console.error('❌ FATAL: JWT_SECRET ontbreekt of is korter dan 32 tekens in productie. Server wordt niet gestart.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET?.trim() || crypto.randomBytes(64).toString('hex');

// Echte 12-round bcrypt dummy hash voor constante responstijd bij login (voorkomt timing attacks / user enumeration)
const DUMMY_BCRYPT_HASH = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 12);

const ALLOWED_ORIGINS = new Set<string>([ALLOWED_ORIGIN]);
try {
  const parsedOrigin = new URL(ALLOWED_ORIGIN);
  if (parsedOrigin.hostname.startsWith('www.')) {
    ALLOWED_ORIGINS.add(`${parsedOrigin.protocol}//${parsedOrigin.hostname.slice(4)}`);
  } else {
    ALLOWED_ORIGINS.add(`${parsedOrigin.protocol}//www.${parsedOrigin.hostname}`);
  }
} catch {}

const VALID_ROLES = new Set([
  'admin',
  'groepsleiding',
  'website',
  'penningmeester',
  'media',
  'som',
  'veegee',
  'twizzit',
  'leiding',
]);

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

// ============================================================
// SECURITY & SANITIZATION HELPERS
// ============================================================
function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHeaderCRLF(input: unknown): string {
  return String(input ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function maskEmail(email: string): string {
  const clean = String(email || '').trim();
  const [local, domain] = clean.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

function sanitizeText(input: unknown, maxLength = 500): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLength);
}

function sanitizeHttpUrl(input: unknown, maxLength = 500): string {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim().slice(0, maxLength);
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function sanitizeImageUrl(input: unknown, maxLength = 1_500_000): string {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > maxLength) return '';

  // Veilige lokale paden
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !/['"()\\\r\n]/.test(trimmed)) {
    return trimmed;
  }

  // Veilige raster base64 data-URI's (blokkeert expliciet SVG/HTML/script data-URI's)
  if (/^data:image\/(webp|png|jpeg|jpg|gif);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed;
  }

  // Enkel veilige http/https URL's zonder CSS-injectiekarakters
  if (trimmed.length > 1000) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    const serialized = parsed.toString();
    if (/['"()\\\r\n]/.test(serialized)) return '';
    return serialized;
  } catch {
    return '';
  }
}

function parsePositiveIntId(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  let s = Array.isArray(val) ? val.join('; ') : String(val);
  // Voorkom CSV / Excel DDE Formula Injection (=, +, -, @, TAB, CR)
  if (/^[\s]*[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

function isStrongPassword(password: unknown): boolean {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    password.length <= 128 &&
    /[a-zA-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

function generateTemporaryPassword(): string {
  // Cryptografisch willekeurig wachtwoord (14 tekens, gegarandeerd letters + cijfers)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return `${out}a9!`;
}

function sanitizeRoles(rawRoles: unknown, fallbackRole?: unknown): string[] {
  const candidates = Array.isArray(rawRoles) && rawRoles.length > 0
    ? rawRoles
    : (fallbackRole ? [fallbackRole] : ['leiding']);
  const cleaned = Array.from(
    new Set(
      candidates
        .map(r => String(r ?? '').toLowerCase().trim())
        .filter(r => VALID_ROLES.has(r))
    )
  );
  return cleaned.length > 0 ? cleaned : ['leiding'];
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: (IS_PROD ? 'strict' : 'lax') as 'strict' | 'lax',
    maxAge: SESSION_INACTIVITY_HOURS * 60 * 60 * 1000,
    path: '/',
  };
}

function getClearCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: (IS_PROD ? 'strict' : 'lax') as 'strict' | 'lax',
    path: '/',
  };
}

function issueAuthCookie(
  res: Response,
  payload: { id: number; email: string; role: string; roles: string[]; name: string; tv: number }
) {
  const token = jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${SESSION_INACTIVITY_HOURS}h`,
  });
  res.cookie('authToken', token, getAuthCookieOptions());
}

// ============================================================
// E-MAIL SERVICE (NODEMAILER / SMTP)
// ============================================================
let emailTransporter: Transporter | null = null;
function getEmailTransporter() {
  if (emailTransporter) return emailTransporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  try {
    emailTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    return emailTransporter;
  } catch (err) {
    console.error('Fout bij initialiseren email transporter:', err);
    return null;
  }
}

async function sendConfirmationEmail(params: {
  to: string;
  formTitle: string;
  formId: number;
  confirmationMessage?: string;
  answers: Record<string, any>;
  fields: any[];
  requirePayment?: boolean;
  paymentAmount?: number;
  paymentIban?: string;
  paymentMessage?: string;
}) {
  try {
    const transporter = getEmailTransporter();
    if (!transporter) {
      console.log(`ℹ️ [MAIL] Geen SMTP geconfigureerd. Bevestigingsmail naar <${maskEmail(params.to)}> overgeslagen.`);
      return false;
    }

    const from = process.env.SMTP_FROM || 'Gewest Reinaertland <no-reply@reinaertland.be>';
    const safeSubjectTitle = stripHeaderCRLF(params.formTitle).slice(0, 120);
    const subject = `Inschrijving bevestigd: ${safeSubjectTitle} - Gewest Reinaertland`;

    const fieldsHtml = params.fields.map(f => {
      const val = params.answers[f.id];
      if (val === undefined || val === null || val === '') return '';
      const displayVal = Array.isArray(val) ? val.join(', ') : String(val);
      return `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #475569; width: 35%;">${escapeHtml(f.label)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${escapeHtml(displayVal)}</td>
        </tr>
      `;
    }).filter(Boolean).join('');

    let paymentHtml = '';
    if (params.requirePayment && params.paymentIban) {
      const amountStr = Number(params.paymentAmount || 0).toFixed(2);
      const safeFormId = Number.isSafeInteger(params.formId) ? params.formId : 0;
      paymentHtml = `
        <div style="margin-top: 24px; padding: 20px; background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px;">
          <h3 style="margin: 0 0 10px 0; color: #c2410c; font-size: 16px;">💶 Betaalgegevens</h3>
          <p style="margin: 0 0 12px 0; font-size: 14px; color: #7c2d12;">Om je inschrijving definitief te voltooien, vragen we om de betaling uit te voeren:</p>
          <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <tr><td style="padding: 4px 0; color: #7c2d12; font-weight: bold;">Te betalen bedrag:</td><td style="padding: 4px 0; font-weight: bold; color: #c2410c;">€ ${escapeHtml(amountStr)}</td></tr>
            <tr><td style="padding: 4px 0; color: #7c2d12; font-weight: bold;">Begunstigde:</td><td style="padding: 4px 0;">Gewest Reinaertland</td></tr>
            <tr><td style="padding: 4px 0; color: #7c2d12; font-weight: bold;">IBAN:</td><td style="padding: 4px 0; font-family: monospace; font-weight: bold;">${escapeHtml(params.paymentIban)}</td></tr>
            <tr><td style="padding: 4px 0; color: #7c2d12; font-weight: bold;">Mededeling:</td><td style="padding: 4px 0;">${escapeHtml(params.paymentMessage || params.formTitle)}</td></tr>
          </table>
          <p style="margin: 14px 0 0 0; font-size: 12px; color: #9a3412;">
            Tip: Je kunt de betaal-QR-code ook direct bekijken op <a href="https://reinaertland.be/inschrijvingen/${safeFormId}" style="color: #ea580c; text-decoration: underline;">de inschrijvingspagina</a>.
          </p>
        </div>
      `;
    }

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc; border-radius: 16px;">
        <div style="background-color: #ffffff; padding: 28px; border-radius: 12px; border: 1px solid #e2e8f0;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #ea580c; font-size: 22px; margin: 0 0 6px 0;">Gewest Reinaertland</h1>
            <p style="color: #64748b; font-size: 14px; margin: 0;">Bevestiging van je inschrijving</p>
          </div>
          <p style="font-size: 15px; color: #334155; line-height: 1.5;">
            Hallo,<br><br>
            ${escapeHtml(params.confirmationMessage || 'Bedankt voor je inschrijving! We hebben je antwoorden goed ontvangen.').replace(/\n/g, '<br>')}
          </p>
          <div style="margin-top: 20px;">
            <h3 style="font-size: 15px; color: #0f172a; margin-bottom: 8px;">Jouw ingevulde gegevens (${escapeHtml(params.formTitle)}):</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              ${fieldsHtml}
            </table>
          </div>
          ${paymentHtml}
          <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
            Gewest Reinaertland • <a href="https://reinaertland.be" style="color: #ea580c; text-decoration: none;">reinaertland.be</a>
          </div>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from,
      to: stripHeaderCRLF(params.to),
      subject,
      html,
    });
    console.log(`✅ [MAIL] Bevestigingsmail verzonden naar ${maskEmail(params.to)}`);
    return true;
  } catch (error) {
    console.error('❌ [MAIL] Fout bij versturen bevestigingsmail:', error);
    return false;
  }
}

async function sendAdminNotificationEmail(params: {
  adminEmail: string;
  formTitle: string;
  answers: Record<string, any>;
}) {
  try {
    const transporter = getEmailTransporter();
    if (!transporter) return false;
    const from = process.env.SMTP_FROM || 'Gewest Reinaertland <no-reply@reinaertland.be>';
    const safeTitle = stripHeaderCRLF(params.formTitle).slice(0, 120);
    await transporter.sendMail({
      from,
      to: stripHeaderCRLF(params.adminEmail),
      subject: `Nieuwe reactie op formulier: ${safeTitle}`,
      text: `Er is een nieuwe inschrijving binnengekomen voor "${safeTitle}".\n\nBekijk alle inzendingen in het beheerpaneel: https://reinaertland.be/beheer/formulieren`,
    });
    return true;
  } catch (err) {
    console.error('Fout bij admin notificatiemail:', err);
    return false;
  }
}

async function sendPaymentReminderEmail(params: {
  to: string;
  recipientName: string;
  formTitle: string;
  formId: number;
  paymentAmount: number;
  paymentIban: string;
  paymentMessage?: string;
}) {
  try {
    const transporter = getEmailTransporter();
    if (!transporter) {
      console.log(`ℹ️ [MAIL] Geen SMTP geconfigureerd. Betaalherinnering naar <${maskEmail(params.to)}> gesimuleerd.`);
      return true;
    }

    const from = process.env.SMTP_FROM || 'Gewest Reinaertland <no-reply@reinaertland.be>';
    const safeSubjectTitle = stripHeaderCRLF(params.formTitle).slice(0, 120);
    const subject = `Betaalherinnering: ${safeSubjectTitle} - Gewest Reinaertland`;
    const amountStr = Number(params.paymentAmount || 0).toFixed(2);
    const safeFormId = Number.isSafeInteger(params.formId) ? params.formId : 0;
    const formUrl = `https://reinaertland.be/inschrijvingen/${safeFormId}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc; border-radius: 16px;">
        <div style="background-color: #ffffff; padding: 28px; border-radius: 12px; border: 1px solid #e2e8f0;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #ea580c; font-size: 22px; margin: 0 0 6px 0;">Gewest Reinaertland</h1>
            <p style="color: #64748b; font-size: 14px; margin: 0;">Betaalherinnering voor je inschrijving</p>
          </div>
          
          <p style="font-size: 15px; color: #334155; line-height: 1.6;">
            Beste ${escapeHtml(params.recipientName || 'deelnemer')},<br><br>
            We kijken er al enorm naar uit om je te zien op <strong>${escapeHtml(params.formTitle)}</strong>!<br><br>
            Volgens onze administratie staat het inschrijvingsgeld voor jouw inschrijving momenteel nog open. We willen je vriendelijk vragen om de betaling in orde te brengen:
          </p>

          <div style="margin: 24px 0; padding: 20px; background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px;">
            <h3 style="margin: 0 0 12px 0; color: #c2410c; font-size: 16px;">💶 Betaalgegevens</h3>
            <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #7c2d12; font-weight: bold; width: 40%;">Openstaand bedrag:</td>
                <td style="padding: 6px 0; font-weight: bold; color: #c2410c; font-size: 16px;">€ ${escapeHtml(amountStr)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #7c2d12; font-weight: bold;">Begunstigde:</td>
                <td style="padding: 6px 0; color: #1e293b;">Gewest Reinaertland</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #7c2d12; font-weight: bold;">IBAN:</td>
                <td style="padding: 6px 0; font-family: monospace; font-weight: bold; color: #0f172a;">${escapeHtml(params.paymentIban)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #7c2d12; font-weight: bold;">Mededeling:</td>
                <td style="padding: 6px 0; color: #1e293b;">${escapeHtml(params.paymentMessage || params.formTitle)}</td>
              </tr>
            </table>
            
            <div style="margin-top: 18px; text-align: center;">
              <a href="${formUrl}" style="display: inline-block; background-color: #ea580c; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 13px; padding: 10px 20px; border-radius: 8px;">
                Bekijk Payconiq / QR-code online &rarr;
              </a>
            </div>
          </div>

          <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
            <em>Heb je de overschrijving intussen al uitgevoerd? Dan mag je deze herinnering negeren. Het kan 1 à 2 werkdagen duren voor een overschrijving zichtbaar is in onze gewestkas.</em>
          </p>

          <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
            Gewest Reinaertland • <a href="https://reinaertland.be" style="color: #ea580c; text-decoration: none;">reinaertland.be</a>
          </div>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from,
      to: stripHeaderCRLF(params.to),
      subject,
      html,
    });
    console.log(`✅ [MAIL] Betaalherinnering verzonden naar ${maskEmail(params.to)}`);
    return true;
  } catch (err) {
    console.error('❌ [MAIL] Fout bij versturen betaalherinnering:', err);
    return false;
  }
}

function computeServerWerkjaar(dateStr?: string | null): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(d.getTime())) {
    return '2026-2027';
  }
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const calculated = month >= 10 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  return calculated < '2026-2027' ? '2026-2027' : calculated;
}

// ============================================================
// DB INIT
// ============================================================
async function initDB() {
  console.log('⏳ Database initialiseren...');
  try {
    await db.executeMultiple(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        endDate TEXT,
        time TEXT,
        location TEXT,
        type TEXT,
        website TEXT
      );
      CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT,
        phone TEXT,
        email TEXT,
        chiroGroup TEXT,
        avatar TEXT
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        message TEXT NOT NULL,
        createdAt TEXT
      );
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        avatar TEXT,
        role TEXT DEFAULT 'leiding'
      );
      CREATE TABLE IF NOT EXISTS albums (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        url TEXT NOT NULL,
        coverImage TEXT,
        year TEXT,
        category TEXT
      );
      CREATE TABLE IF NOT EXISTS forms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        fields TEXT NOT NULL,
        isOpen INTEGER DEFAULT 1,
        confirmationMessage TEXT,
        sendEmailConfirmation INTEGER DEFAULT 1,
        notifyAdminEmail TEXT,
        require_payment INTEGER DEFAULT 0,
        payment_amount REAL,
        payment_iban TEXT,
        payment_message TEXT,
        allow_multiple_submissions INTEGER DEFAULT 1,
        werkjaar TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT
      );
      CREATE TABLE IF NOT EXISTS form_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        formId INTEGER NOT NULL,
        data TEXT NOT NULL,
        respondentEmail TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS finance_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        bankBalance REAL DEFAULT 0,
        googleSheetUrl TEXT,
        updatedAt TEXT
      );
      CREATE TABLE IF NOT EXISTS finance_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        werkjaar TEXT NOT NULL,
        items TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT
      );
    `);

    // Probeer kolommen toe te voegen (als ze nog niet bestaan)
    const columns = [
      { table: 'users', col: 'phone', type: 'TEXT' },
      { table: 'users', col: 'address', type: 'TEXT' },
      { table: 'users', col: 'birthdate', type: 'TEXT' },
      { table: 'users', col: 'receivePost', type: 'INTEGER DEFAULT 0' },
      { table: 'users', col: 'darkMode', type: 'INTEGER DEFAULT NULL' },
      { table: 'users', col: 'roles', type: "TEXT DEFAULT '[\"leiding\"]'" },
      { table: 'users', col: 'chiroGroup', type: 'TEXT' },
      { table: 'users', col: 'mustChangePassword', type: 'INTEGER DEFAULT 0' },
      { table: 'users', col: 'hasLogin', type: 'INTEGER DEFAULT 1' },
      { table: 'users', col: 'tokenVersion', type: 'INTEGER DEFAULT 0' },
      { table: 'events', col: 'endDate', type: 'TEXT' },
      { table: 'events', col: 'website', type: 'TEXT' },
      { table: 'events', col: 'googleEventId', type: 'TEXT' },
      { table: 'forms', col: 'sendEmailConfirmation', type: 'INTEGER DEFAULT 1' },
      { table: 'forms', col: 'notifyAdminEmail', type: 'TEXT' },
      { table: 'forms', col: 'require_payment', type: 'INTEGER DEFAULT 0' },
      { table: 'forms', col: 'payment_amount', type: 'REAL' },
      { table: 'forms', col: 'payment_iban', type: 'TEXT' },
      { table: 'forms', col: 'payment_message', type: 'TEXT' },
      { table: 'forms', col: 'allow_multiple_submissions', type: 'INTEGER DEFAULT 1' },
      { table: 'forms', col: 'werkjaar', type: 'TEXT' },
      { table: 'form_submissions', col: 'is_paid', type: 'INTEGER DEFAULT 0' },
      { table: 'form_submissions', col: 'paid_at', type: 'TEXT' },
      { table: 'form_submissions', col: 'payment_notes', type: 'TEXT' },
      { table: 'form_submissions', col: 'drank_bijdrage', type: 'REAL DEFAULT 0' }
    ];

    for (const c of columns) {
      try { await db.execute(`ALTER TABLE ${c.table} ADD COLUMN ${c.col} ${c.type}`); } catch (e) {}
    }

    // Zorg dat alle formulieren minstens werkjaar 2026-2027 hebben (er zijn geen oudere jaren)
    try {
      await db.execute("UPDATE forms SET werkjaar = '2026-2027' WHERE werkjaar IS NULL OR werkjaar = '' OR werkjaar < '2026-2027'");
    } catch (e) {}

    // Default finance settings rij
    try {
      await db.execute(`INSERT OR IGNORE INTO finance_settings (id, bankBalance, googleSheetUrl, updatedAt) VALUES (1, 0, '', datetime('now'))`);
    } catch (e) {}

    // Zorg dat formulieren waarvan de betalingsgegevens gewist waren door pauzeren/hervatten hersteld worden
    try {
      await db.execute(`
        UPDATE forms 
        SET require_payment = 1 
        WHERE (require_payment = 0 OR require_payment IS NULL) 
          AND (
            (payment_amount IS NOT NULL AND payment_amount > 0)
            OR (payment_iban IS NOT NULL AND LENGTH(TRIM(payment_iban)) > 0)
            OR id IN (SELECT DISTINCT formId FROM form_submissions WHERE is_paid = 1)
          )
      `);
    } catch (e) {}

    const userCount = await db.execute('SELECT COUNT(*) as count FROM users');
    if ((userCount.rows[0].count as number) === 0) {
      const envPassword = process.env.DEFAULT_ADMIN_PASSWORD?.trim();
      const initialPassword = envPassword || generateTemporaryPassword();
      const mustChange = envPassword ? 0 : 1;
      const hashed = await bcrypt.hash(initialPassword, 12);
      await db.execute({
        sql: `INSERT INTO users (name, email, password, avatar, role, roles, chiroGroup, mustChangePassword, hasLogin, tokenVersion)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        args: [
          process.env.DEFAULT_ADMIN_NAME || 'Admin',
          (process.env.DEFAULT_ADMIN_EMAIL || 'admin@reinaertland.be').toLowerCase().trim(),
          hashed,
          'https://placehold.co/150x150/d94824/white?text=LL',
          'admin',
          JSON.stringify(['admin', 'groepsleiding', 'leiding']),
          'Gewest',
          mustChange
        ],
      });
      if (!envPassword) {
        console.log(`⚠️ Initiële admin account aangemaakt met eenmalig gegenereerd wachtwoord: ${initialPassword}`);
      } else {
        console.log(`⚠️ Initiële admin account aangemaakt.`);
      }
    }

    // Sync bestaande leden naar de gecombineerde users tabel indien nog niet aanwezig
    // Gebruikt per gebruiker een cryptografisch willekeurig wachtwoord (nooit hardcoded) en hasLogin = 0 tot expliciet geactiveerd
    try {
      const membersResult = await db.execute('SELECT * FROM members');
      for (const m of membersResult.rows as any[]) {
        if (!m.email || !validator.isEmail(String(m.email).trim())) continue;
        const cleanEmail = String(m.email).toLowerCase().trim();
        const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [cleanEmail] });
        if (existing.rows.length === 0) {
          const tempPass = await bcrypt.hash(generateTemporaryPassword(), 12);
          const safeInitial = encodeURIComponent(String(m.name || 'L').charAt(0));
          const safeAvatar = sanitizeImageUrl(m.avatar) || `https://placehold.co/150x150/d94824/white?text=${safeInitial}`;
          const safeRoleList = sanitizeRoles(m.role ? [m.role] : ['leiding']).filter(r => r !== 'admin');
          const finalRoles = safeRoleList.length > 0 ? safeRoleList : ['leiding'];
          await db.execute({
            sql: `INSERT INTO users (name, email, password, avatar, role, roles, phone, chiroGroup, mustChangePassword, hasLogin, tokenVersion)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0)`,
            args: [
              sanitizeText(m.name, 100),
              cleanEmail,
              tempPass,
              safeAvatar,
              finalRoles[0],
              JSON.stringify(finalRoles),
              sanitizeText(m.phone, 20),
              sanitizeText(m.chiroGroup, 100)
            ]
          });
        }
      }
    } catch (e) {
      // Members sync fallback
    }

    console.log('✅ Database klaar.');
  } catch (err) {
    console.error('❌ Database init fout:', err);
  }
}

// ============================================================
// ROLLEN & AUTORISATIE HELPERS
// ============================================================
function getUserRoles(user: any): string[] {
  if (!user) return [];
  let roles: string[] = [];
  if (user.roles) {
    try {
      const parsed = typeof user.roles === 'string' ? JSON.parse(user.roles) : user.roles;
      if (Array.isArray(parsed)) roles = parsed;
    } catch {}
  }
  if (roles.length === 0 && user.role) {
    roles = [user.role];
  }
  return roles.map(r => String(r).toLowerCase().trim());
}

function isStrictAdmin(user: any): boolean {
  if (!user) return false;
  return getUserRoles(user).includes('admin');
}

function hasAnyRole(user: any, allowedRoles: string[]): boolean {
  if (!user) return false;
  const userRoles = getUserRoles(user);
  if (userRoles.includes('admin') || userRoles.includes('groepsleiding')) return true;
  return allowedRoles.some(r => userRoles.includes(r.toLowerCase().trim()));
}

const MUST_CHANGE_PASSWORD_ALLOWED_PATHS = new Set([
  '/api/me',
  '/api/me/first-password',
  '/api/logout',
]);

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.authToken;
  if (!token || typeof token !== 'string') {
    return res.status(401).json({ error: 'Niet ingelogd.' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
    const userId = Number(decoded?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      res.clearCookie('authToken', getClearCookieOptions());
      return res.status(401).json({ error: 'Ongeldige sessie.' });
    }

    // Controleer LIVE in de database of gebruiker nog bestaat, actief is, en of tokenVersion klopt (directe sessie-intrekking)
    const userRes = await db.execute({
      sql: 'SELECT id, name, email, role, roles, hasLogin, mustChangePassword, tokenVersion FROM users WHERE id = ?',
      args: [userId],
    });
    if (userRes.rows.length === 0) {
      res.clearCookie('authToken', getClearCookieOptions());
      return res.status(401).json({ error: 'Account niet gevonden.' });
    }

    const dbUser = userRes.rows[0] as any;
    if (dbUser.hasLogin === 0) {
      res.clearCookie('authToken', getClearCookieOptions());
      return res.status(401).json({ error: 'Toegang tot dit account is uitgeschakeld.' });
    }

    const dbTokenVersion = Number(dbUser.tokenVersion ?? 0);
    if (typeof decoded.tv !== 'number' || decoded.tv !== dbTokenVersion) {
      res.clearCookie('authToken', getClearCookieOptions());
      return res.status(401).json({ error: 'Sessie is ingetrokken. Gelieve opnieuw in te loggen.' });
    }

    const freshRoles = getUserRoles(dbUser);
    const mustChange = dbUser.mustChangePassword === 1;

    (req as any).user = {
      id: Number(dbUser.id),
      email: String(dbUser.email),
      name: String(dbUser.name),
      role: freshRoles[0] || String(dbUser.role || 'leiding'),
      roles: freshRoles,
      mustChangePassword: mustChange,
      tv: dbTokenVersion,
    };

    // Server-side handhaving: verplicht wachtwoord wijzigen voordat overige API-routes gebruikt mogen worden
    const cleanPath = req.originalUrl.split('?')[0];
    if (mustChange && !MUST_CHANGE_PASSWORD_ALLOWED_PATHS.has(cleanPath)) {
      return res.status(403).json({
        error: 'Je moet eerst je tijdelijk wachtwoord wijzigen voordat je toegang krijgt tot het portaal.',
        mustChangePassword: true,
      });
    }

    // Sliding session: als token ouder is dan 10 min en gebruiker actief is, vernieuw sessie met verse rollen & tokenVersion
    const nowUnix = Math.floor(Date.now() / 1000);
    if (decoded.iat && (nowUnix - decoded.iat > 10 * 60)) {
      issueAuthCookie(res, {
        id: Number(dbUser.id),
        email: String(dbUser.email),
        role: freshRoles[0] || 'leiding',
        roles: freshRoles,
        name: String(dbUser.name),
        tv: dbTokenVersion,
      });
    }

    next();
  } catch {
    res.clearCookie('authToken', getClearCookieOptions());
    return res.status(401).json({ error: 'Ongeldige of verlopen sessie.' });
  }
}

function requireStrictAdmin(req: Request, res: Response, next: NextFunction) {
  void requireAuth(req, res, () => {
    const user = (req as any).user;
    if (!user || !isStrictAdmin(user)) {
      return res.status(403).json({ error: 'Geen toegang. Alleen de Admin mag deze actie uitvoeren.' });
    }
    next();
  });
}

function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    void requireAuth(req, res, () => {
      const user = (req as any).user;
      if (!user || !hasAnyRole(user, allowedRoles)) {
        return res.status(403).json({ error: 'Geen toegang. Onvoldoende rechten voor deze actie.' });
      }
      next();
    });
  };
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  void requireAuth(req, res, () => {
    const user = (req as any).user;
    if (!user || !hasAnyRole(user, ['admin', 'groepsleiding', 'website'])) {
      return res.status(403).json({ error: 'Geen toegang.' });
    }
    next();
  });
}

function requireSelfOrAdmin(req: Request, res: Response, next: NextFunction) {
  void requireAuth(req, res, () => {
    const user = (req as any).user;
    const targetId = parsePositiveIntId(req.params.id);
    if (!targetId) {
      return res.status(400).json({ error: 'Ongeldig gebruikers-ID.' });
    }
    if (user.id !== targetId && !hasAnyRole(user, ['admin', 'groepsleiding', 'website'])) {
      return res.status(403).json({ error: 'Geen toegang.' });
    }
    next();
  });
}

function computeWerkjaar(dateStr: string): string {
  if (!dateStr) return '2026-2027';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '2026-2027';
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();
  const calculated = month >= 10 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  return calculated < '2026-2027' ? '2026-2027' : calculated;
}

function isLeidingSubmissionServer(subData: any, fields: any[]): boolean {
  if (!subData || typeof subData !== 'object') return false;

  const getFieldAnswer = (terms: string[]) => {
    for (const f of fields || []) {
      const lbl = (f.label || '').toLowerCase();
      if (terms.some(t => lbl.includes(t))) {
        const val = subData[f.id];
        if (val !== undefined && val !== null && val !== '') {
          return Array.isArray(val) ? val.join(', ') : String(val);
        }
      }
    }
    return '';
  };

  const group = getFieldAnswer(['groep', 'chirogroep', 'afdeling', 'chiro', 'tak']);
  const role = getFieldAnswer(['functie', 'rol', 'leiding', 'begeleiding']);

  if (
    /leiding/i.test(group) ||
    /leiding/i.test(role) ||
    group.trim().toUpperCase() === 'LEIDING'
  ) {
    return true;
  }

  for (const key of Object.keys(subData)) {
    const val = String(subData[key] || '').trim();
    if (val.toUpperCase() === 'LEIDING') {
      return true;
    }
  }

  return false;
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Basis security headers voor alle routes
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: IS_PROD ? ["'self'"] : ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https://placehold.co", "https:"],
        connectSrc: ["'self'"],
        frameSrc: ["'self'"],
        frameAncestors: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false,
  }));

  // --- 🚀 BELANGRIJK: Start poort meteen voor Render/UptimeRobot ---
  app.all(['/ping', '/health'], (req, res) => res.status(200).send('pong'));

  // API-specifieke middleware (statische assets krijgen zo GEEN Vary: Origin, credentials of rate-limit verlies)
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.use('/api', cors({
    origin: (origin, callback) => {
      if (!IS_PROD) return callback(null, true);
      if (!origin || ALLOWED_ORIGINS.has(origin)) return callback(null, true);
      return callback(new Error('CORS niet toegestaan'));
    },
    credentials: true,
  }));

  app.use('/api', cookieParser());
  app.use('/api', express.json({ limit: '2mb' }));

  // CSRF / Origin verificatie voor alle state-changing API requests in productie (defense-in-depth bovenop SameSite=Strict)
  app.use('/api', (req, res, next) => {
    if (!IS_PROD) return next();
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

    const originHeader = req.headers.origin;
    let requestOrigin = '';
    if (typeof originHeader === 'string' && originHeader) {
      requestOrigin = originHeader.replace(/\/+$/, '');
    } else if (typeof req.headers.referer === 'string' && req.headers.referer) {
      try {
        requestOrigin = new URL(req.headers.referer).origin;
      } catch {}
    }

    if (!requestOrigin || !ALLOWED_ORIGINS.has(requestOrigin)) {
      return res.status(403).json({ error: 'Verzoek geweigerd door CSRF-beveiliging.' });
    }
    next();
  });

  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 150,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Te veel aanvragen. Probeer over enkele minuten opnieuw.' },
  }));

  const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Te veel pogingen. Probeer over 15 minuten opnieuw.' },
  });

  const emailActionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Te veel e-mailacties in korte tijd. Wacht even en probeer opnieuw.' },
  });

  const syncLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Te veel synchronisatieverzoeken. Probeer over enkele minuten opnieuw.' },
  });

  // --- API Routes ---
  app.get('/api/events', asyncHandler(async (req, res) => {
    const result = await db.execute('SELECT * FROM events ORDER BY date ASC');
    res.json(result.rows);
  }));

  // Google Calendar koppelingsstatus
  app.get('/api/events/google-status', requireAuth, asyncHandler(async (req, res) => {
    try {
      const status = await getGoogleCalendarStatus();
      res.json(status);
    } catch (err) {
      console.error('Fout bij ophalen Google Agenda status:', err);
      res.status(500).json({ error: 'Fout bij ophalen Google Agenda status.' });
    }
  }));

  // Tweerichtingssynchronisatie: synchroniseert Google Agenda <-> Website Agenda
  app.post('/api/events/sync-google', syncLimiter, requireAuth, asyncHandler(async (req, res) => {
    try {
      // 1. Haal alle huidige database afspraken op
      const currentDbEvents = await db.execute('SELECT * FROM events ORDER BY date ASC');
      const dbRows = currentDbEvents.rows as any[];

      let importedCount = 0;
      let pushedCount = 0;
      let updatedCount = 0;

      // 2. STAP 1: GOOGLE CALENDAR -> WEBSITE (Inkomend)
      // Haal alle afspraken op uit Google Agenda
      const googleEvents = await fetchUpcomingGoogleEvents();

      // Houd bij welke Google IDs we al behandeld hebben om duplicaten te voorkomen
      const processedGoogleIds = new Set<string>();

      for (const gEvent of googleEvents) {
        if (!gEvent.id || processedGoogleIds.has(gEvent.id)) continue;
        processedGoogleIds.add(gEvent.id);

        const converted = convertGoogleEventToWebsiteEvent(gEvent);
        if (!converted) continue;

        // Check 1: Bestaat er al een event in DB met exact dit googleEventId?
        const matchByGoogleId = dbRows.find(r => r.googleEventId === gEvent.id);

        // Check 2: Bestaat er al een event in DB met dezelfde titel en datum?
        const matchByTitleDate = dbRows.find(r => {
          const t1 = String(r.title || '').trim().toLowerCase();
          const t2 = converted.title.trim().toLowerCase();
          const sameTitle = t1 === t2 || t1.includes(t2) || t2.includes(t1);
          const sameDate = String(r.date || '').trim() === converted.date.trim();
          return sameTitle && sameDate;
        });

        const existingMatch = matchByGoogleId || matchByTitleDate;

        if (existingMatch) {
          // Koppel googleEventId indien die nog leeg was
          if (!existingMatch.googleEventId || existingMatch.googleEventId !== gEvent.id) {
            await db.execute({
              sql: 'UPDATE events SET googleEventId = ? WHERE id = ?',
              args: [gEvent.id, existingMatch.id]
            });
            existingMatch.googleEventId = gEvent.id;
            updatedCount++;
          }
        } else {
          // Staat nog NIET op de website -> Voeg toe aan de database!
          const insertRes = await db.execute({
            sql: 'INSERT INTO events (title, date, endDate, time, location, type, website, googleEventId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            args: [
              converted.title,
              converted.date,
              converted.endDate || '',
              converted.time || '',
              converted.location || 'Gewest Reinaertland',
              converted.type || 'Activiteit',
              converted.website || '',
              gEvent.id
            ]
          });

          // Voeg toe aan lokale cache zodat we geen duplicaten importeren
          dbRows.push({
            id: Number(insertRes.lastInsertRowid),
            title: converted.title,
            date: converted.date,
            endDate: converted.endDate,
            time: converted.time,
            location: converted.location,
            type: converted.type,
            website: converted.website,
            googleEventId: gEvent.id
          });
          importedCount++;
        }
      }

      // 3. STAP 2: WEBSITE -> GOOGLE CALENDAR (Uitgaand)
      // Check of er lokale afspraken zijn die nog niet in Google Calendar stonden
      for (const row of dbRows) {
        if (row.googleEventId) continue;

        const eventInput = {
          title: String(row.title || ''),
          date: String(row.date || ''),
          endDate: row.endDate ? String(row.endDate) : undefined,
          time: row.time ? String(row.time) : undefined,
          location: row.location ? String(row.location) : undefined,
          type: row.type ? String(row.type) : undefined,
          website: row.website ? String(row.website) : undefined
        };

        try {
          // Zoek eerst of er al een overeenkomstige afspraak in Google staat
          let gId = await findMatchingGoogleEvent(eventInput);

          if (!gId) {
            // Maak nieuwe afspraak in Google Calendar
            gId = await insertGoogleCalendarEvent(eventInput);
            if (gId) pushedCount++;
          }

          if (gId) {
            await db.execute({
              sql: 'UPDATE events SET googleEventId = ? WHERE id = ?',
              args: [gId, row.id]
            });
            row.googleEventId = gId;
          }
        } catch (pushErr) {
          console.warn('[Google Sync] Kon lokaal event niet naar Google pushen:', pushErr);
        }
      }

      res.json({
        success: true,
        importedCount,
        pushedCount,
        updatedCount,
        message: `Tweerichtingssynchronisatie voltooid: ${importedCount} afspraak(en) geïmporteerd uit Google Agenda, ${pushedCount} gepusht naar Google.`
      });
    } catch (err) {
      console.error('Fout bij tweerichtingssynchronisatie met Google Agenda:', err);
      res.status(500).json({ error: 'Fout bij synchroniseren met Google Agenda.' });
    }
  }));

  app.post('/api/events', requireAuth, asyncHandler(async (req, res) => {
    const title = sanitizeText(req.body.title, 200);
    const date = sanitizeText(req.body.date, 100);
    const endDate = sanitizeText(req.body.endDate, 100);
    const time = sanitizeText(req.body.time, 50);
    const location = sanitizeText(req.body.location, 200);
    const type = sanitizeText(req.body.type, 50);
    const rawWebsite = typeof req.body.website === 'string' ? req.body.website.trim() : '';
    const website = rawWebsite ? sanitizeHttpUrl(rawWebsite, 500) : '';
    if (rawWebsite && !website) {
      return res.status(400).json({ error: 'Ongeldige website-URL. Gebruik een geldige http:// of https:// link.' });
    }
    if (!title || !date) return res.status(400).json({ error: 'Titel en datum zijn verplicht.' });

    const result = await db.execute({
      sql: 'INSERT INTO events (title, date, endDate, time, location, type, website) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [title, date, endDate, time, location, type, website],
    });
    const newId = Number(result.lastInsertRowid);

    // Automatisch toevoegen aan Google Agenda
    let googleEventId: string | null = null;
    try {
      googleEventId = await insertGoogleCalendarEvent({
        title,
        date,
        endDate,
        time,
        location,
        type,
        website
      });
      if (googleEventId) {
        await db.execute({
          sql: 'UPDATE events SET googleEventId = ? WHERE id = ?',
          args: [googleEventId, newId]
        });
      }
    } catch (gcalErr) {
      console.warn('[Google Calendar Sync] Fout bij automatisch toevoegen:', gcalErr);
    }

    res.json({ id: newId, title, date, endDate, time, location, type, website, googleEventId });
  }));

  app.put('/api/events/:id', requireAuth, asyncHandler(async (req, res) => {
    const eventId = parsePositiveIntId(req.params.id);
    if (!eventId) return res.status(400).json({ error: 'Ongeldig evenement-ID.' });

    const title = sanitizeText(req.body.title, 200);
    const date = sanitizeText(req.body.date, 100);
    const endDate = sanitizeText(req.body.endDate, 100);
    const time = sanitizeText(req.body.time, 50);
    const location = sanitizeText(req.body.location, 200);
    const type = sanitizeText(req.body.type, 50);
    const rawWebsite = typeof req.body.website === 'string' ? req.body.website.trim() : '';
    const website = rawWebsite ? sanitizeHttpUrl(rawWebsite, 500) : '';
    if (rawWebsite && !website) {
      return res.status(400).json({ error: 'Ongeldige website-URL. Gebruik een geldige http:// of https:// link.' });
    }
    if (!title || !date) return res.status(400).json({ error: 'Titel en datum zijn verplicht.' });

    const existingRow = await db.execute({
      sql: 'SELECT googleEventId FROM events WHERE id = ?',
      args: [eventId]
    });
    if (existingRow.rows.length === 0) return res.status(404).json({ error: 'Evenement niet gevonden.' });
    const currentGoogleId = existingRow.rows[0]?.googleEventId ? String(existingRow.rows[0].googleEventId) : null;

    await db.execute({
      sql: 'UPDATE events SET title=?, date=?, endDate=?, time=?, location=?, type=?, website=? WHERE id=?',
      args: [title, date, endDate, time, location, type, website, eventId],
    });

    let updatedGoogleId = currentGoogleId;
    try {
      if (currentGoogleId) {
        await updateGoogleCalendarEvent(currentGoogleId, { title, date, endDate, time, location, type, website });
      } else {
        updatedGoogleId = await insertGoogleCalendarEvent({ title, date, endDate, time, location, type, website });
        if (updatedGoogleId) {
          await db.execute({
            sql: 'UPDATE events SET googleEventId = ? WHERE id = ?',
            args: [updatedGoogleId, eventId]
          });
        }
      }
    } catch (gcalErr) {
      console.warn('[Google Calendar Sync] Fout bij bijwerken in Google Agenda:', gcalErr);
    }

    res.json({ success: true, googleEventId: updatedGoogleId });
  }));

  app.delete('/api/events/past', requireAuth, asyncHandler(async (req, res) => {
    try {
      const result = await db.execute('SELECT id, date, endDate, googleEventId FROM events');
      const pastRows = result.rows.filter((row: any) =>
        isEventPassed({ date: String(row.date || ''), endDate: row.endDate ? String(row.endDate) : undefined })
      );
      const pastIds = pastRows.map((row: any) => row.id);

      if (pastIds.length > 0) {
        const placeholders = pastIds.map(() => '?').join(',');
        await db.execute({
          sql: `DELETE FROM events WHERE id IN (${placeholders})`,
          args: pastIds,
        });
      }
      res.json({ success: true, count: pastIds.length });
    } catch (err) {
      console.error('Fout bij verwijderen afgelopen events:', err);
      res.status(500).json({ error: 'Fout bij verwijderen van afgelopen evenementen.' });
    }
  }));

  app.delete('/api/events/:id', requireAuth, asyncHandler(async (req, res) => {
    const eventId = parsePositiveIntId(req.params.id);
    if (!eventId) return res.status(400).json({ error: 'Ongeldig evenement-ID.' });

    try {
      const existingRow = await db.execute({
        sql: 'SELECT googleEventId FROM events WHERE id = ?',
        args: [eventId]
      });
      const currentGoogleId = existingRow.rows[0]?.googleEventId ? String(existingRow.rows[0].googleEventId) : null;
      if (currentGoogleId) {
        await deleteGoogleCalendarEvent(currentGoogleId);
      }
    } catch (gcalErr) {
      console.warn('[Google Calendar Sync] Fout bij verwijderen uit Google Agenda:', gcalErr);
    }

    await db.execute({ sql: 'DELETE FROM events WHERE id = ?', args: [eventId] });
    res.json({ success: true });
  }));

  // --- Members ---
  app.get('/api/members', requireAuth, asyncHandler(async (req, res) => {
    const isAdmin = hasAnyRole((req as any).user, ['admin', 'groepsleiding', 'website']);
    const sql = isAdmin
      ? 'SELECT id, name, role, phone, email, chiroGroup, avatar FROM members'
      : 'SELECT id, name, role, chiroGroup, avatar FROM members';
    const result = await db.execute(sql);
    res.json(result.rows);
  }));

  app.post('/api/members', requireAdmin, asyncHandler(async (req, res) => {
    const name = sanitizeText(req.body.name, 100);
    if (!name) return res.status(400).json({ error: 'Naam is verplicht.' });
    const role = sanitizeText(req.body.role, 100);
    const phone = sanitizeText(req.body.phone, 20);
    const chiroGroup = sanitizeText(req.body.chiroGroup, 100);
    const avatar = sanitizeImageUrl(req.body.avatar);
    const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim().slice(0, 200) : '';
    if (email && !validator.isEmail(email)) {
      return res.status(400).json({ error: 'Ongeldig e-mailadres.' });
    }
    const result = await db.execute({
      sql: 'INSERT INTO members (name, role, phone, email, chiroGroup, avatar) VALUES (?, ?, ?, ?, ?, ?)',
      args: [name, role, phone, email, chiroGroup, avatar],
    });
    res.json({ id: Number(result.lastInsertRowid), name, role });
  }));

  app.put('/api/members/:id', requireAdmin, asyncHandler(async (req, res) => {
    const memberId = parsePositiveIntId(req.params.id);
    if (!memberId) return res.status(400).json({ error: 'Ongeldig lid-ID.' });
    const name = sanitizeText(req.body.name, 100);
    if (!name) return res.status(400).json({ error: 'Naam is verplicht.' });
    const role = sanitizeText(req.body.role, 100);
    const phone = sanitizeText(req.body.phone, 20);
    const chiroGroup = sanitizeText(req.body.chiroGroup, 100);
    const avatar = sanitizeImageUrl(req.body.avatar);
    const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim().slice(0, 200) : '';
    if (email && !validator.isEmail(email)) {
      return res.status(400).json({ error: 'Ongeldig e-mailadres.' });
    }
    await db.execute({
      sql: 'UPDATE members SET name=?, role=?, phone=?, email=?, chiroGroup=?, avatar=? WHERE id=?',
      args: [name, role, phone, email, chiroGroup, avatar, memberId],
    });
    res.json({ success: true });
  }));

  app.delete('/api/members/:id', requireAdmin, asyncHandler(async (req, res) => {
    const memberId = parsePositiveIntId(req.params.id);
    if (!memberId) return res.status(400).json({ error: 'Ongeldig lid-ID.' });
    await db.execute({ sql: 'DELETE FROM members WHERE id = ?', args: [memberId] });
    res.json({ success: true });
  }));

  // --- Messages ---
  app.get('/api/messages', requireAuth, asyncHandler(async (req, res) => {
    const result = await db.execute('SELECT * FROM messages ORDER BY createdAt DESC');
    res.json(result.rows);
  }));

  app.post('/api/messages',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { error: 'Te veel berichten. Probeer later opnieuw.' } }),
    asyncHandler(async (req, res) => {
      const name = sanitizeText(req.body.name, 100);
      const message = sanitizeText(req.body.message, 2000);
      const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim().slice(0, 200) : '';
      if (!name || !message) {
        return res.status(400).json({ error: 'Naam en bericht zijn verplicht.' });
      }
      if (!email || !validator.isEmail(email)) {
        return res.status(400).json({ error: 'Gelieve een geldig e-mailadres in te vullen.' });
      }
      await db.execute({
        sql: 'INSERT INTO messages (name, email, message, createdAt) VALUES (?, ?, ?, ?)',
        args: [name, email, message, new Date().toISOString()],
      });
      res.json({ success: true });
    })
  );

  app.delete('/api/messages/:id', requireAuth, asyncHandler(async (req, res) => {
    const msgId = parsePositiveIntId(req.params.id);
    if (!msgId) return res.status(400).json({ error: 'Ongeldig bericht-ID.' });
    await db.execute({ sql: 'DELETE FROM messages WHERE id = ?', args: [msgId] });
    res.json({ success: true });
  }));

  // --- Albums ---
  app.get('/api/albums', asyncHandler(async (req, res) => {
    const result = await db.execute('SELECT * FROM albums ORDER BY year DESC, id DESC');
    res.json(result.rows);
  }));

  app.post('/api/albums', requireRole('media', 'website'), asyncHandler(async (req, res) => {
    const title = sanitizeText(req.body.title, 200);
    const description = sanitizeText(req.body.description, 1000);
    const url = sanitizeHttpUrl(req.body.url, 1000);
    const rawCover = typeof req.body.coverImage === 'string' ? req.body.coverImage.trim() : '';
    const coverImage = rawCover ? sanitizeImageUrl(rawCover) : '';
    const year = sanitizeText(req.body.year, 20);
    const category = sanitizeText(req.body.category, 50) || 'Overig';

    if (!title || !url) {
      return res.status(400).json({ error: 'Titel en een geldige http(s) albumlink zijn verplicht.' });
    }
    if (rawCover && !coverImage) {
      return res.status(400).json({ error: 'Ongeldige coverafbeelding. Gebruik een veilige afbeeldingslink of upload een WebP/PNG/JPG bestand.' });
    }

    const result = await db.execute({
      sql: 'INSERT INTO albums (title, description, url, coverImage, year, category) VALUES (?, ?, ?, ?, ?, ?)',
      args: [title, description, url, coverImage, year, category],
    });
    res.json({ id: Number(result.lastInsertRowid) });
  }));

  app.put('/api/albums/:id', requireRole('media', 'website'), asyncHandler(async (req, res) => {
    const albumId = parsePositiveIntId(req.params.id);
    if (!albumId) return res.status(400).json({ error: 'Ongeldig album-ID.' });

    const title = sanitizeText(req.body.title, 200);
    const description = sanitizeText(req.body.description, 1000);
    const url = sanitizeHttpUrl(req.body.url, 1000);
    const rawCover = typeof req.body.coverImage === 'string' ? req.body.coverImage.trim() : '';
    const coverImage = rawCover ? sanitizeImageUrl(rawCover) : '';
    const year = sanitizeText(req.body.year, 20);
    const category = sanitizeText(req.body.category, 50) || 'Overig';

    if (!title || !url) {
      return res.status(400).json({ error: 'Titel en een geldige http(s) albumlink zijn verplicht.' });
    }
    if (rawCover && !coverImage) {
      return res.status(400).json({ error: 'Ongeldige coverafbeelding.' });
    }

    await db.execute({
      sql: 'UPDATE albums SET title=?, description=?, url=?, coverImage=?, year=?, category=? WHERE id=?',
      args: [title, description, url, coverImage, year, category, albumId],
    });
    res.json({ success: true });
  }));

  app.delete('/api/albums/:id', requireRole('media', 'website'), asyncHandler(async (req, res) => {
    const albumId = parsePositiveIntId(req.params.id);
    if (!albumId) return res.status(400).json({ error: 'Ongeldig album-ID.' });
    await db.execute({ sql: 'DELETE FROM albums WHERE id = ?', args: [albumId] });
    res.json({ success: true });
  }));

  // ============================================================
  // --- Formulieren & Inschrijvingen ---
  // ============================================================

  interface FormFieldItem {
    id: string;
    type: string;
    label: string;
    placeholder?: string;
    helpText?: string;
    required?: boolean;
    options?: string[];
  }

  function isDuplicateSubmission(
    newAnswers: Record<string, any>,
    newRespondentEmail: string,
    existingRows: any[],
    fields: FormFieldItem[]
  ): { isDuplicate: boolean; reason?: string } {
    if (!existingRows || existingRows.length === 0) return { isDuplicate: false };

    const cleanStr = (v: any): string => {
      if (v === undefined || v === null) return '';
      if (Array.isArray(v)) {
        return v.map(x => String(x).trim().toLowerCase()).sort().join(' ');
      }
      return String(v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    };

    const newEmailNorm = cleanStr(newRespondentEmail);

    const extractName = (ans: Record<string, any>): string => {
      for (const f of fields || []) {
        const l = (f.label || '').toLowerCase();
        if (['naam', 'voornaam', 'achternaam', 'wie', 'kapitein', 'deelnemer'].some(k => l.includes(k))) {
          const val = cleanStr(ans[f.id]);
          if (val) return val;
        }
      }
      return '';
    };

    const extractPhone = (ans: Record<string, any>): string => {
      for (const f of fields || []) {
        const l = (f.label || '').toLowerCase();
        if (['tel', 'gsm', 'telefoon', 'noodnummer', 'mobiel', 'contact'].some(k => l.includes(k))) {
          const val = cleanStr(ans[f.id]).replace(/[^0-9]/g, '');
          if (val && val.length >= 8) return val;
        }
      }
      return '';
    };

    const newName = extractName(newAnswers);
    const newPhone = extractPhone(newAnswers);

    for (const row of existingRows) {
      let existingAnswers: Record<string, any> = {};
      try {
        existingAnswers = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
      } catch {}

      const existingEmailNorm = cleanStr(row.respondentEmail);
      const existingName = extractName(existingAnswers);
      const existingPhone = extractPhone(existingAnswers);

      // Check A: Identieke naam gecombineerd met e-mail of telefoon
      if (newName && existingName && newName === existingName) {
        if (newEmailNorm && existingEmailNorm && newEmailNorm === existingEmailNorm) {
          return { isDuplicate: true, reason: 'Identieke naam en e-mailadres' };
        }
        if (newPhone && existingPhone && newPhone === existingPhone) {
          return { isDuplicate: true, reason: 'Identieke naam en telefoonnummer' };
        }
      }

      // Check B: Veld-voor-veld percentage vergelijking (minstens 90% van de velden gelijk)
      let matchingFields = 0;
      let evaluatedFields = 0;

      if (fields && fields.length > 0) {
        for (const field of fields) {
          const val1 = cleanStr(newAnswers[field.id]);
          const val2 = cleanStr(existingAnswers[field.id]);

          if (val1 !== '' || val2 !== '') {
            evaluatedFields++;
            if (val1 === val2) {
              matchingFields++;
            }
          }
        }
      } else {
        const allKeys = Array.from(new Set([...Object.keys(newAnswers), ...Object.keys(existingAnswers)]));
        for (const key of allKeys) {
          const val1 = cleanStr(newAnswers[key]);
          const val2 = cleanStr(existingAnswers[key]);
          if (val1 !== '' || val2 !== '') {
            evaluatedFields++;
            if (val1 === val2) matchingFields++;
          }
        }
      }

      // Neem respondent e-mailadres mee als dat nog niet als veld aanwezig was
      if (newEmailNorm !== '' || existingEmailNorm !== '') {
        const hasEmailField = fields?.some(f => f.type === 'email');
        if (!hasEmailField) {
          evaluatedFields++;
          if (newEmailNorm === existingEmailNorm) {
            matchingFields++;
          }
        }
      }

      if (evaluatedFields > 0) {
        const similarity = matchingFields / evaluatedFields;
        // Als 90% of meer van de velden gelijk zijn:
        if (similarity >= 0.899 || (evaluatedFields >= 3 && evaluatedFields - matchingFields <= 1 && newName && newName === existingName)) {
          return { isDuplicate: true, reason: `${Math.round(similarity * 100)}% van de velden komen overeen met een eerdere inschrijving` };
        }
      }
    }

    return { isDuplicate: false };
  }

  // --- Publieke formulieren routes ---
  app.get('/api/public/forms', asyncHandler(async (req, res) => {
    try {
      const result = await db.execute('SELECT id, title, description, isOpen, require_payment, payment_amount, payment_iban, payment_message, createdAt FROM forms WHERE isOpen = 1 ORDER BY id DESC');
      res.json(result.rows.map((row: any) => ({
        ...row,
        isOpen: row.isOpen === 1,
        requirePayment: row.require_payment === 1,
        paymentAmount: row.payment_amount != null ? Number(row.payment_amount) : undefined,
        paymentIban: row.payment_iban || undefined,
        paymentMessage: row.payment_message || undefined,
      })));
    } catch (error) {
      console.error('Fout bij ophalen publieke formulieren:', error);
      res.status(500).json({ error: 'Fout bij ophalen formulieren.' });
    }
  }));

  app.get('/api/public/forms/:id', asyncHandler(async (req, res) => {
    const formId = parsePositiveIntId(req.params.id);
    if (!formId) return res.status(400).json({ error: 'Ongeldig formulier-ID.' });
    try {
      const result = await db.execute({
        sql: 'SELECT id, title, description, fields, isOpen, confirmationMessage, require_payment, payment_amount, payment_iban, payment_message, allow_multiple_submissions FROM forms WHERE id = ?',
        args: [formId],
      });
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Formulier niet gevonden.' });
      }
      const form = result.rows[0];
      let parsedFields = [];
      try { parsedFields = JSON.parse(form.fields as string); } catch { parsedFields = []; }
      res.json({
        id: form.id,
        title: form.title,
        description: form.description,
        fields: parsedFields,
        isOpen: form.isOpen === 1,
        confirmationMessage: form.confirmationMessage,
        requirePayment: form.require_payment === 1,
        paymentAmount: form.payment_amount != null ? Number(form.payment_amount) : undefined,
        paymentIban: form.payment_iban || undefined,
        paymentMessage: form.payment_message || undefined,
        allowMultipleSubmissions: form.allow_multiple_submissions !== 0,
      });
    } catch (error) {
      console.error('Fout bij ophalen formulier:', error);
      res.status(500).json({ error: 'Fout bij ophalen formulier.' });
    }
  }));

  app.post('/api/public/forms/:id/submit',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { error: 'Te veel inzendingen vanaf dit IP-adres. Probeer later opnieuw.' } }),
    asyncHandler(async (req, res) => {
      const formId = parsePositiveIntId(req.params.id);
      if (!formId) return res.status(400).json({ error: 'Ongeldig formulier-ID.' });

      try {
        const formResult = await db.execute({
          sql: 'SELECT * FROM forms WHERE id = ?',
          args: [formId],
        });
        if (formResult.rows.length === 0) {
          return res.status(404).json({ error: 'Formulier niet gevonden.' });
        }
        const form = formResult.rows[0];
        if (form.isOpen !== 1) {
          return res.status(400).json({ error: 'Dit formulier is helaas gesloten voor nieuwe reacties.' });
        }

        let fields: FormFieldItem[] = [];
        try { fields = JSON.parse(form.fields as string); } catch { fields = []; }

        const rawAnswers = req.body?.answers;
        if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) {
          return res.status(400).json({ error: 'Ongeldige formuliergegevens.' });
        }

        // Allowlist: accepteer uitsluitend gedefinieerde field.id sleutels met begrensde lengtes
        const answers: Record<string, any> = {};
        for (const field of fields) {
          const val = rawAnswers[field.id];
          if (val === undefined || val === null) continue;
          if (Array.isArray(val)) {
            answers[field.id] = val
              .slice(0, 50)
              .map(v => sanitizeText(String(v ?? ''), 300))
              .filter(Boolean);
          } else if (typeof val === 'boolean' || typeof val === 'number') {
            answers[field.id] = val;
          } else {
            answers[field.id] = sanitizeText(String(val), 2000);
          }
        }

        // Validatie verplichte velden
        for (const field of fields) {
          if (field.required) {
            const val = answers[field.id];
            if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
              return res.status(400).json({ error: `Het veld "${field.label}" is verplicht.` });
            }
          }
          if (field.type === 'email' && answers[field.id]) {
            const emailStr = String(answers[field.id]).trim();
            if (!validator.isEmail(emailStr)) {
              return res.status(400).json({ error: `Gelieve een geldig e-mailadres in te vullen voor "${field.label}".` });
            }
          }
        }

        // Zoek respondent e-mail
        let respondentEmail = '';
        for (const field of fields) {
          if (field.type === 'email' && answers[field.id] && validator.isEmail(String(answers[field.id]).trim())) {
            respondentEmail = String(answers[field.id]).trim().toLowerCase();
            break;
          }
        }

        // Controleer dubbele inschrijving indien meervoudige inschrijvingen uitgeschakeld zijn
        if (Number(form.allow_multiple_submissions) === 0) {
          const existingSubsResult = await db.execute({
            sql: 'SELECT data, respondentEmail FROM form_submissions WHERE formId = ?',
            args: [form.id],
          });
          const dupCheck = isDuplicateSubmission(answers, respondentEmail, existingSubsResult.rows, fields);
          if (dupCheck.isDuplicate) {
            return res.status(400).json({
              error: '2 keer inschrijven is niet mogelijk! Je bent al ingeschreven voor dit formulier (minstens 90% van de ingevulde gegevens komen overeen met een eerdere inschrijving). Neem contact op met de gewestleiding om je inschrijving aan te passen.'
            });
          }
        }

        const createdAt = new Date().toISOString();
        const subResult = await db.execute({
          sql: 'INSERT INTO form_submissions (formId, data, respondentEmail, createdAt) VALUES (?, ?, ?, ?)',
          args: [form.id, JSON.stringify(answers), respondentEmail || null, createdAt],
        });

        // Verzend optioneel bevestigingsmail naar respondent
        if (respondentEmail && form.sendEmailConfirmation !== 0) {
          sendConfirmationEmail({
            to: respondentEmail,
            formTitle: form.title as string,
            formId: Number(form.id),
            confirmationMessage: form.confirmationMessage as string,
            answers,
            fields,
            requirePayment: form.require_payment === 1,
            paymentAmount: form.payment_amount != null ? Number(form.payment_amount) : undefined,
            paymentIban: form.payment_iban as string,
            paymentMessage: form.payment_message as string,
          }).catch(err => console.error('Fout bij verzenden bevestigingsmail:', err));
        }

        // Verzend optioneel admin notificatie
        if (form.notifyAdminEmail && validator.isEmail(String(form.notifyAdminEmail).trim())) {
          sendAdminNotificationEmail({
            adminEmail: String(form.notifyAdminEmail).trim(),
            formTitle: form.title as string,
            answers,
          }).catch(err => console.error('Fout bij verzenden admin notificatiemail:', err));
        }

        res.json({
          success: true,
          submissionId: Number(subResult.lastInsertRowid),
          message: form.confirmationMessage || 'Je antwoorden zijn succesvol verzonden! Bedankt.',
          requirePayment: form.require_payment === 1,
          paymentAmount: form.payment_amount != null ? Number(form.payment_amount) : undefined,
          paymentIban: form.payment_iban || undefined,
          paymentMessage: form.payment_message || undefined,
        });
      } catch (error) {
        console.error('Fout bij indienen formulier:', error);
        res.status(500).json({ error: 'Er is een fout opgetreden bij het verwerken van je reactie.' });
      }
    })
  );

  // --- Formulieren Beheer (Leiding & Admin) ---
  app.get('/api/forms', requireAuth, asyncHandler(async (req, res) => {
    try {
      const result = await db.execute(`
        SELECT f.*, COUNT(s.id) as submissionCount
        FROM forms f
        LEFT JOIN form_submissions s ON s.formId = f.id
        GROUP BY f.id
        ORDER BY f.id DESC
      `);
      const forms = result.rows.map((row: any) => {
        let parsedFields = [];
        try { parsedFields = JSON.parse(row.fields); } catch {}
        return {
          ...row,
          isOpen: row.isOpen === 1,
          sendEmailConfirmation: row.sendEmailConfirmation === 1,
          requirePayment: row.require_payment === 1,
          paymentAmount: row.payment_amount != null ? Number(row.payment_amount) : undefined,
          paymentIban: row.payment_iban || undefined,
          paymentMessage: row.payment_message || undefined,
          allowMultipleSubmissions: row.allow_multiple_submissions !== 0,
          werkjaar: (row.werkjaar as string) || computeServerWerkjaar(row.createdAt != null ? String(row.createdAt) : null),
          fields: parsedFields,
          submissionCount: Number(row.submissionCount) || 0,
        };
      });
      res.json(forms);
    } catch (error) {
      console.error('Fout bij ophalen formulieren:', error);
      res.status(500).json({ error: 'Fout bij ophalen formulieren.' });
    }
  }));

  app.get('/api/forms/:id', requireAuth, asyncHandler(async (req, res) => {
    const formId = parsePositiveIntId(req.params.id);
    if (!formId) return res.status(400).json({ error: 'Ongeldig formulier-ID.' });
    try {
      const result = await db.execute({
        sql: `
          SELECT f.*, COUNT(s.id) as submissionCount
          FROM forms f
          LEFT JOIN form_submissions s ON s.formId = f.id
          WHERE f.id = ?
          GROUP BY f.id
        `,
        args: [formId],
      });
      if (result.rows.length === 0) return res.status(404).json({ error: 'Formulier niet gevonden.' });
      const row = result.rows[0];
      let parsedFields = [];
      try { parsedFields = JSON.parse(row.fields as string); } catch {}
      res.json({
        ...row,
        isOpen: row.isOpen === 1,
        sendEmailConfirmation: row.sendEmailConfirmation === 1,
        requirePayment: row.require_payment === 1,
        paymentAmount: row.payment_amount != null ? Number(row.payment_amount) : undefined,
        paymentIban: row.payment_iban || undefined,
        paymentMessage: row.payment_message || undefined,
        allowMultipleSubmissions: row.allow_multiple_submissions !== 0,
        werkjaar: (row.werkjaar as string) || computeServerWerkjaar(row.createdAt != null ? String(row.createdAt) : null),
        fields: parsedFields,
        submissionCount: Number(row.submissionCount) || 0,
      });
    } catch (error) {
      console.error('Fout bij ophalen formulier:', error);
      res.status(500).json({ error: 'Fout bij ophalen formulier.' });
    }
  }));

  app.post('/api/forms', requireAuth, asyncHandler(async (req, res) => {
    try {
      const title = sanitizeText(req.body.title, 200);
      const description = sanitizeText(req.body.description, 2000);
      const confirmationMessage = sanitizeText(req.body.confirmationMessage, 1000);
      const notifyAdminEmail = typeof req.body.notifyAdminEmail === 'string' ? req.body.notifyAdminEmail.trim().slice(0, 200) : '';
      if (notifyAdminEmail && !validator.isEmail(notifyAdminEmail)) {
        return res.status(400).json({ error: 'Ongeldig notificatie e-mailadres.' });
      }
      const isOpen = req.body.isOpen !== false ? 1 : 0;
      const sendEmailConfirmation = req.body.sendEmailConfirmation !== false ? 1 : 0;
      const requirePayment = req.body.requirePayment ? 1 : 0;
      const paymentAmount = (req.body.paymentAmount !== undefined && req.body.paymentAmount !== null && req.body.paymentAmount !== '')
        ? Number(req.body.paymentAmount)
        : null;
      if (paymentAmount !== null && (!Number.isFinite(paymentAmount) || paymentAmount < 0 || paymentAmount > 100000)) {
        return res.status(400).json({ error: 'Ongeldig betaalbedrag.' });
      }
      const paymentIban = sanitizeText(req.body.paymentIban, 50);
      const paymentMessage = sanitizeText(req.body.paymentMessage, 200);
      const allowMultipleSubmissions = req.body.allowMultipleSubmissions ? 1 : 0;
      const fields = Array.isArray(req.body.fields) ? JSON.stringify(req.body.fields.slice(0, 100)) : '[]';

      if (!title) return res.status(400).json({ error: 'Titel van het formulier is verplicht.' });

      const now = new Date().toISOString();
      const werkjaar = sanitizeText(req.body.werkjaar, 30) || computeServerWerkjaar(now);
      const result = await db.execute({
        sql: `INSERT INTO forms (title, description, fields, isOpen, confirmationMessage, sendEmailConfirmation, notifyAdminEmail, require_payment, payment_amount, payment_iban, payment_message, allow_multiple_submissions, werkjaar, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [title, description, fields, isOpen, confirmationMessage, sendEmailConfirmation, notifyAdminEmail, requirePayment, paymentAmount, paymentIban, paymentMessage, allowMultipleSubmissions, werkjaar, now, now],
      });

      res.json({ id: Number(result.lastInsertRowid), title, isOpen: isOpen === 1, werkjaar });
    } catch (error) {
      console.error('Fout bij aanmaken formulier:', error);
      res.status(500).json({ error: 'Fout bij opslaan formulier.' });
    }
  }));

  app.put('/api/forms/:id', requireAuth, asyncHandler(async (req, res) => {
    const formId = parsePositiveIntId(req.params.id);
    if (!formId) return res.status(400).json({ error: 'Ongeldig formulier-ID.' });
    try {
      const currentRes = await db.execute({ sql: 'SELECT * FROM forms WHERE id = ?', args: [formId] });
      if (currentRes.rows.length === 0) return res.status(404).json({ error: 'Formulier niet gevonden.' });
      const current = currentRes.rows[0];

      const title = req.body.title !== undefined ? sanitizeText(req.body.title, 200) : String(current.title || '');
      const description = req.body.description !== undefined ? sanitizeText(req.body.description, 2000) : (current.description ? String(current.description) : '');
      const confirmationMessage = req.body.confirmationMessage !== undefined ? sanitizeText(req.body.confirmationMessage, 1000) : (current.confirmationMessage ? String(current.confirmationMessage) : '');
      const notifyAdminEmail = req.body.notifyAdminEmail !== undefined ? (typeof req.body.notifyAdminEmail === 'string' ? req.body.notifyAdminEmail.trim().slice(0, 200) : '') : (current.notifyAdminEmail ? String(current.notifyAdminEmail) : '');
      if (notifyAdminEmail && !validator.isEmail(notifyAdminEmail)) {
        return res.status(400).json({ error: 'Ongeldig notificatie e-mailadres.' });
      }
      const isOpen = req.body.isOpen !== undefined ? (req.body.isOpen ? 1 : 0) : Number(current.isOpen ?? 1);
      const sendEmailConfirmation = req.body.sendEmailConfirmation !== undefined ? (req.body.sendEmailConfirmation ? 1 : 0) : Number(current.sendEmailConfirmation ?? 1);
      const requirePayment = req.body.requirePayment !== undefined ? (req.body.requirePayment ? 1 : 0) : Number(current.require_payment ?? 0);
      const paymentAmount = req.body.paymentAmount !== undefined
        ? (req.body.paymentAmount !== null && req.body.paymentAmount !== '' ? Number(req.body.paymentAmount) : null)
        : (current.payment_amount != null ? Number(current.payment_amount) : null);
      if (paymentAmount !== null && (!Number.isFinite(paymentAmount) || paymentAmount < 0 || paymentAmount > 100000)) {
        return res.status(400).json({ error: 'Ongeldig betaalbedrag.' });
      }
      const paymentIban = req.body.paymentIban !== undefined ? sanitizeText(req.body.paymentIban, 50) : (current.payment_iban ? String(current.payment_iban) : '');
      const paymentMessage = req.body.paymentMessage !== undefined ? sanitizeText(req.body.paymentMessage, 200) : (current.payment_message ? String(current.payment_message) : '');
      const allowMultipleSubmissions = req.body.allowMultipleSubmissions !== undefined ? (req.body.allowMultipleSubmissions ? 1 : 0) : Number(current.allow_multiple_submissions ?? 1);
      const fields = req.body.fields !== undefined ? (Array.isArray(req.body.fields) ? JSON.stringify(req.body.fields.slice(0, 100)) : '[]') : String(current.fields || '[]');
      const werkjaar = req.body.werkjaar !== undefined ? (sanitizeText(req.body.werkjaar, 30) || null) : (current.werkjaar ? String(current.werkjaar) : null);

      if (!title) return res.status(400).json({ error: 'Titel van het formulier is verplicht.' });

      const now = new Date().toISOString();
      await db.execute({
        sql: `UPDATE forms SET title=?, description=?, fields=?, isOpen=?, confirmationMessage=?, sendEmailConfirmation=?, notifyAdminEmail=?, require_payment=?, payment_amount=?, payment_iban=?, payment_message=?, allow_multiple_submissions=?, werkjaar=COALESCE(?, werkjaar), updatedAt=?
              WHERE id=?`,
        args: [title, description, fields, isOpen, confirmationMessage, sendEmailConfirmation, notifyAdminEmail, requirePayment, paymentAmount, paymentIban, paymentMessage, allowMultipleSubmissions, werkjaar, now, formId],
      });

      res.json({ success: true, isOpen: isOpen === 1, requirePayment: requirePayment === 1 });
    } catch (error) {
      console.error('Fout bij bijwerken formulier:', error);
      res.status(500).json({ error: 'Fout bij bijwerken formulier.' });
    }
  }));

  // Gedeeltelijk bijwerken formulier (bv. status wisselen of betalingsoptie updaten zonder andere velden te overschrijven)
  app.patch('/api/forms/:id', requireAuth, asyncHandler(async (req, res) => {
    const formId = parsePositiveIntId(req.params.id);
    if (!formId) return res.status(400).json({ error: 'Ongeldig formulier-ID.' });
    try {
      const currentRes = await db.execute({ sql: 'SELECT * FROM forms WHERE id = ?', args: [formId] });
      if (currentRes.rows.length === 0) return res.status(404).json({ error: 'Formulier niet gevonden.' });
      const current = currentRes.rows[0];

      const title = req.body.title !== undefined ? sanitizeText(req.body.title, 200) : String(current.title || '');
      const description = req.body.description !== undefined ? sanitizeText(req.body.description, 2000) : (current.description ? String(current.description) : '');
      const confirmationMessage = req.body.confirmationMessage !== undefined ? sanitizeText(req.body.confirmationMessage, 1000) : (current.confirmationMessage ? String(current.confirmationMessage) : '');
      const notifyAdminEmail = req.body.notifyAdminEmail !== undefined ? (typeof req.body.notifyAdminEmail === 'string' ? req.body.notifyAdminEmail.trim().slice(0, 200) : '') : (current.notifyAdminEmail ? String(current.notifyAdminEmail) : '');
      if (notifyAdminEmail && !validator.isEmail(notifyAdminEmail)) {
        return res.status(400).json({ error: 'Ongeldig notificatie e-mailadres.' });
      }
      const isOpen = req.body.isOpen !== undefined ? (req.body.isOpen ? 1 : 0) : Number(current.isOpen ?? 1);
      const sendEmailConfirmation = req.body.sendEmailConfirmation !== undefined ? (req.body.sendEmailConfirmation ? 1 : 0) : Number(current.sendEmailConfirmation ?? 1);
      const requirePayment = req.body.requirePayment !== undefined ? (req.body.requirePayment ? 1 : 0) : Number(current.require_payment ?? 0);
      const paymentAmount = req.body.paymentAmount !== undefined
        ? (req.body.paymentAmount !== null && req.body.paymentAmount !== '' ? Number(req.body.paymentAmount) : null)
        : (current.payment_amount != null ? Number(current.payment_amount) : null);
      if (paymentAmount !== null && (!Number.isFinite(paymentAmount) || paymentAmount < 0 || paymentAmount > 100000)) {
        return res.status(400).json({ error: 'Ongeldig betaalbedrag.' });
      }
      const paymentIban = req.body.paymentIban !== undefined ? sanitizeText(req.body.paymentIban, 50) : (current.payment_iban ? String(current.payment_iban) : '');
      const paymentMessage = req.body.paymentMessage !== undefined ? sanitizeText(req.body.paymentMessage, 200) : (current.payment_message ? String(current.payment_message) : '');
      const allowMultipleSubmissions = req.body.allowMultipleSubmissions !== undefined ? (req.body.allowMultipleSubmissions ? 1 : 0) : Number(current.allow_multiple_submissions ?? 1);
      const fields = req.body.fields !== undefined ? (Array.isArray(req.body.fields) ? JSON.stringify(req.body.fields.slice(0, 100)) : '[]') : String(current.fields || '[]');
      const werkjaar = req.body.werkjaar !== undefined ? (sanitizeText(req.body.werkjaar, 30) || null) : (current.werkjaar ? String(current.werkjaar) : null);

      const now = new Date().toISOString();
      await db.execute({
        sql: `UPDATE forms SET title=?, description=?, fields=?, isOpen=?, confirmationMessage=?, sendEmailConfirmation=?, notifyAdminEmail=?, require_payment=?, payment_amount=?, payment_iban=?, payment_message=?, allow_multiple_submissions=?, werkjaar=COALESCE(?, werkjaar), updatedAt=?
              WHERE id=?`,
        args: [title, description, fields, isOpen, confirmationMessage, sendEmailConfirmation, notifyAdminEmail, requirePayment, paymentAmount, paymentIban, paymentMessage, allowMultipleSubmissions, werkjaar, now, formId],
      });

      res.json({ success: true, isOpen: isOpen === 1, requirePayment: requirePayment === 1 });
    } catch (error) {
      console.error('Fout bij patchen formulier:', error);
      res.status(500).json({ error: 'Fout bij bijwerken formulier.' });
    }
  }));

  app.delete('/api/forms/:id', requireAuth, asyncHandler(async (req, res) => {
    const formId = parsePositiveIntId(req.params.id);
    if (!formId) return res.status(400).json({ error: 'Ongeldig formulier-ID.' });
    try {
      await db.execute({ sql: 'DELETE FROM form_submissions WHERE formId = ?', args: [formId] });
      await db.execute({ sql: 'DELETE FROM forms WHERE id = ?', args: [formId] });
      res.json({ success: true });
    } catch (error) {
      console.error('Fout bij verwijderen formulier:', error);
      res.status(500).json({ error: 'Fout bij verwijderen formulier.' });
    }
  }));

  app.get('/api/forms/:id/submissions', requireAuth, asyncHandler(async (req, res) => {
    const formId = parsePositiveIntId(req.params.id);
    if (!formId) return res.status(400).json({ error: 'Ongeldig formulier-ID.' });
    try {
      const result = await db.execute({
        sql: 'SELECT * FROM form_submissions WHERE formId = ? ORDER BY id DESC',
        args: [formId],
      });
      const submissions = result.rows.map((row: any) => {
        let parsedData = {};
        try { parsedData = JSON.parse(row.data); } catch {}
        return {
          id: row.id,
          formId: row.formId,
          data: parsedData,
          respondentEmail: row.respondentEmail,
          isPaid: row.is_paid === 1,
          paidAt: row.paid_at || null,
          paymentNotes: row.payment_notes || '',
          drankBijdrage: row.drank_bijdrage !== null && row.drank_bijdrage !== undefined ? Number(row.drank_bijdrage) : 0,
          createdAt: row.createdAt,
        };
      });
      res.json(submissions);
    } catch (error) {
      console.error('Fout bij ophalen inzendingen:', error);
      res.status(500).json({ error: 'Fout bij ophalen inzendingen.' });
    }
  }));

  app.patch('/api/forms/:formId/submissions/:id/payment', requireAuth, asyncHandler(async (req, res) => {
    const formId = parsePositiveIntId(req.params.formId);
    const subId = parsePositiveIntId(req.params.id);
    if (!formId || !subId) return res.status(400).json({ error: 'Ongeldig ID.' });
    try {
      const isPaid = req.body.isPaid ? 1 : 0;
      const paymentNotes = req.body.paymentNotes !== undefined ? sanitizeText(req.body.paymentNotes, 500) : null;
      let drankBijdrage: number | null = null;
      if (req.body.drankBijdrage !== undefined && req.body.drankBijdrage !== null && req.body.drankBijdrage !== '') {
        const parsed = Number(req.body.drankBijdrage);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10000) {
          return res.status(400).json({ error: 'Ongeldige drankbijdrage.' });
        }
        drankBijdrage = parsed;
      }
      const paidAt = isPaid
        ? (typeof req.body.paidAt === 'string' && !isNaN(Date.parse(req.body.paidAt)) ? new Date(req.body.paidAt).toISOString() : new Date().toISOString())
        : null;

      await db.execute({
        sql: `UPDATE form_submissions 
              SET is_paid = ?, 
                  paid_at = ?, 
                  payment_notes = CASE WHEN ? IS NOT NULL THEN ? ELSE payment_notes END,
                  drank_bijdrage = CASE WHEN ? IS NOT NULL THEN ? ELSE drank_bijdrage END
              WHERE id = ? AND formId = ?`,
        args: [isPaid, paidAt, paymentNotes, paymentNotes, drankBijdrage, drankBijdrage, subId, formId],
      });

      res.json({ success: true, isPaid: isPaid === 1, paidAt, paymentNotes, drankBijdrage });
    } catch (error) {
      console.error('Fout bij bijwerken betaalstatus:', error);
      res.status(500).json({ error: 'Fout bij bijwerken betaalstatus.' });
    }
  }));

  // Inschrijving aanpassen (beheerder kan groep, antwoorden of respondent e-mail wijzigen)
  app.put('/api/forms/:formId/submissions/:id', requireAuth, asyncHandler(async (req, res) => {
    const formId = parsePositiveIntId(req.params.formId);
    const subId = parsePositiveIntId(req.params.id);
    if (!formId || !subId) return res.status(400).json({ error: 'Ongeldig ID.' });
    try {
      const { data, respondentEmail, isPaid, paymentNotes, drankBijdrage } = req.body;
      let parsedData: string | null = null;
      if (data !== undefined) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          return res.status(400).json({ error: 'Ongeldige inschrijvingsdata.' });
        }
        parsedData = JSON.stringify(data);
      }
      const cleanEmail = respondentEmail !== undefined
        ? (respondentEmail ? String(respondentEmail).trim().toLowerCase().slice(0, 200) : '')
        : null;
      if (cleanEmail && !validator.isEmail(cleanEmail)) {
        return res.status(400).json({ error: 'Ongeldig e-mailadres.' });
      }
      const cleanNotes = paymentNotes !== undefined ? sanitizeText(paymentNotes, 500) : null;
      let cleanDrank: number | null = null;
      if (drankBijdrage !== undefined && drankBijdrage !== null && drankBijdrage !== '') {
        const parsed = Number(drankBijdrage);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10000) {
          return res.status(400).json({ error: 'Ongeldige drankbijdrage.' });
        }
        cleanDrank = parsed;
      }
      const now = new Date().toISOString();

      await db.execute({
        sql: `UPDATE form_submissions 
              SET data = COALESCE(?, data),
                  respondentEmail = CASE WHEN ? IS NOT NULL THEN ? ELSE respondentEmail END,
                  is_paid = CASE WHEN ? IS NOT NULL THEN ? ELSE is_paid END,
                  paid_at = CASE 
                    WHEN ? = 1 THEN COALESCE(paid_at, ?) 
                    WHEN ? = 0 THEN NULL 
                    ELSE paid_at 
                  END,
                  payment_notes = CASE WHEN ? IS NOT NULL THEN ? ELSE payment_notes END,
                  drank_bijdrage = CASE WHEN ? IS NOT NULL THEN ? ELSE drank_bijdrage END
              WHERE id = ? AND formId = ?`,
        args: [
          parsedData,
          respondentEmail !== undefined ? (cleanEmail || '') : null,
          cleanEmail || null,
          isPaid !== undefined ? (isPaid ? 1 : 0) : null,
          isPaid !== undefined ? (isPaid ? 1 : 0) : null,
          isPaid !== undefined ? (isPaid ? 1 : 0) : null,
          now,
          isPaid !== undefined ? (isPaid ? 1 : 0) : null,
          paymentNotes !== undefined ? cleanNotes : null,
          cleanNotes,
          cleanDrank,
          cleanDrank,
          subId,
          formId
        ]
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Fout bij bijwerken inschrijving:', error);
      res.status(500).json({ error: 'Fout bij bijwerken inschrijving.' });
    }
  }));

  // 1-Klik Betaalherinnering sturen naar alle niet-betaalden
  app.post('/api/forms/:id/send-payment-reminders', emailActionLimiter, requireAuth, asyncHandler(async (req, res) => {
    const formId = parsePositiveIntId(req.params.id);
    if (!formId) return res.status(400).json({ error: 'Ongeldig formulier-ID.' });
    try {
      const formRes = await db.execute({
        sql: 'SELECT * FROM forms WHERE id = ?',
        args: [formId]
      });

      if (formRes.rows.length === 0) {
        return res.status(404).json({ error: 'Formulier niet gevonden.' });
      }

      const form = formRes.rows[0];
      if (!form.payment_iban) {
        return res.status(400).json({ error: 'Dit formulier heeft geen IBAN ingesteld. Vul eerst een IBAN in bij het bewerken van dit formulier.' });
      }

      const subsRes = await db.execute({
        sql: 'SELECT * FROM form_submissions WHERE formId = ?',
        args: [formId]
      });

      const unpaidSubs = subsRes.rows.filter(s => Number(s.is_paid) !== 1);
      let sentCount = 0;
      let missingEmailCount = 0;

      for (const sub of unpaidSubs) {
        const email = sub.respondentEmail ? String(sub.respondentEmail).trim() : '';
        if (!email || !validator.isEmail(email)) {
          missingEmailCount++;
          continue;
        }

        // Probeer naam van deelnemer te vinden
        let recipientName = '';
        try {
          const parsed = typeof sub.data === 'string' ? JSON.parse(sub.data) : sub.data;
          for (const key of Object.keys(parsed || {})) {
            const val = parsed[key];
            if (typeof val === 'string' && val.trim().length > 1 && !val.includes('@') && !/^\+?\d{8,}$/.test(val)) {
              recipientName = val.trim();
              break;
            }
          }
        } catch {}

        const ok = await sendPaymentReminderEmail({
          to: email,
          recipientName: recipientName || 'deelnemer',
          formTitle: form.title as string,
          formId,
          paymentAmount: Number(form.payment_amount || 0),
          paymentIban: form.payment_iban as string,
          paymentMessage: form.payment_message as string,
        });

        if (ok) sentCount++;
      }

      res.json({
        success: true,
        sentCount,
        totalUnpaid: unpaidSubs.length,
        missingEmailCount,
      });
    } catch (error) {
      console.error('Fout bij versturen betaalherinneringen:', error);
      res.status(500).json({ error: 'Fout bij versturen betaalherinneringen.' });
    }
  }));

  app.get('/api/forms-reports', requireAuth, asyncHandler(async (req, res) => {
    try {
      const formsRes = await db.execute(`
        SELECT id, title, description, isOpen, fields, require_payment, payment_amount, werkjaar, createdAt
        FROM forms
        ORDER BY id DESC
      `);
      const subsRes = await db.execute(`
        SELECT s.id, s.formId, s.data, s.respondentEmail, s.is_paid, s.paid_at, s.createdAt,
               f.title as formTitle, f.werkjaar
        FROM form_submissions s
        JOIN forms f ON s.formId = f.id
        ORDER BY s.id DESC
      `);
      res.json({
        forms: formsRes.rows.map((f: any) => ({
          ...f,
          werkjaar: f.werkjaar || computeServerWerkjaar(f.createdAt),
          isOpen: f.isOpen === 1,
          requirePayment: f.require_payment === 1,
          paymentAmount: f.payment_amount != null ? Number(f.payment_amount) : 0,
          fields: typeof f.fields === 'string' ? JSON.parse(f.fields) : f.fields,
        })),
        submissions: subsRes.rows.map((s: any) => ({
          id: s.id,
          formId: s.formId,
          formTitle: s.formTitle,
          werkjaar: s.werkjaar || computeServerWerkjaar(s.createdAt),
          data: typeof s.data === 'string' ? JSON.parse(s.data) : s.data,
          respondentEmail: s.respondentEmail,
          isPaid: s.is_paid === 1,
          paidAt: s.paid_at,
          createdAt: s.createdAt,
        }))
      });
    } catch (error) {
      console.error('Fout bij ophalen formulier rapporten:', error);
      res.status(500).json({ error: 'Fout bij ophalen formulier rapporten.' });
    }
  }));

  app.delete('/api/forms/:id/submissions/:subId', requireAuth, asyncHandler(async (req, res) => {
    const formId = parsePositiveIntId(req.params.id);
    const subId = parsePositiveIntId(req.params.subId);
    if (!formId || !subId) return res.status(400).json({ error: 'Ongeldig ID.' });
    try {
      await db.execute({
        sql: 'DELETE FROM form_submissions WHERE id = ? AND formId = ?',
        args: [subId, formId],
      });
      res.json({ success: true });
    } catch (error) {
      console.error('Fout bij verwijderen inzending:', error);
      res.status(500).json({ error: 'Fout bij verwijderen inzending.' });
    }
  }));

  app.get('/api/forms/:id/export', requireAuth, asyncHandler(async (req, res) => {
    const formId = parsePositiveIntId(req.params.id);
    if (!formId) return res.status(400).send('Ongeldig formulier-ID');
    try {
      const formResult = await db.execute({ sql: 'SELECT * FROM forms WHERE id = ?', args: [formId] });
      if (formResult.rows.length === 0) return res.status(404).send('Formulier niet gevonden');
      const form = formResult.rows[0];

      let fields: FormFieldItem[] = [];
      try { fields = JSON.parse(form.fields as string); } catch {}

      const subsResult = await db.execute({
        sql: 'SELECT * FROM form_submissions WHERE formId = ? ORDER BY id ASC',
        args: [formId],
      });

      const headers = ['ID', 'Tijdstip', 'E-mailadres', 'Betaalstatus', 'Betaaldatum', 'Betaalnotitie', ...fields.map(f => f.label)];
      const csvRows = [headers.map(escapeCsvCell).join(';')];

      for (const row of subsResult.rows) {
        let answers: Record<string, any> = {};
        try { answers = JSON.parse(row.data as string); } catch {}
        const values = [
          row.id,
          row.createdAt,
          row.respondentEmail || '',
          row.is_paid === 1 ? 'Betaald' : 'Nog niet betaald',
          row.paid_at || '',
          row.payment_notes || '',
          ...fields.map(f => answers[f.id] !== undefined ? answers[f.id] : '')
        ];
        csvRows.push(values.map(escapeCsvCell).join(';'));
      }

      const csvContent = '\uFEFF' + csvRows.join('\r\n');
      const cleanTitle = String(form.title).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="inschrijvingen_${cleanTitle}_${formId}.csv"`);
      res.send(csvContent);
    } catch (error) {
      console.error('Fout bij exporteren inzendingen:', error);
      res.status(500).send('Fout bij exporteren inzendingen.');
    }
  }));

  // Koppeling: Overzicht van formulieren voor het kasbeheer
  app.get('/api/finances/available-forms', requireAuth, asyncHandler(async (req, res) => {
    try {
      const formsRes = await db.execute(`
        SELECT id, title, fields, require_payment, payment_amount, createdAt
        FROM forms
        ORDER BY id DESC
      `);

      const subsRes = await db.execute(`
        SELECT id, formId, data, is_paid, drank_bijdrage
        FROM form_submissions
      `);

      const subsByForm = new Map<number, any[]>();
      for (const row of subsRes.rows) {
        const formId = Number(row.formId);
        if (!subsByForm.has(formId)) subsByForm.set(formId, []);
        subsByForm.get(formId)!.push(row);
      }

      const results = formsRes.rows.map((fRow: any) => {
        const formId = Number(fRow.id);
        const tariff = Number(fRow.payment_amount) || 0;
        const reqPayment = fRow.require_payment === 1;
        let fields: any[] = [];
        try { fields = JSON.parse(fRow.fields || '[]'); } catch {}

        const formSubs = subsByForm.get(formId) || [];
        const totalSubs = formSubs.length;

        let paidSubs = 0;
        let ledenCount = 0;
        let leidingCount = 0;
        let paidLedenCount = 0;
        let paidLeidingCount = 0;
        let totalDrankForfait = 0;
        let paidDrankForfait = 0;

        for (const sub of formSubs) {
          let subData: any = {};
          try { subData = typeof sub.data === 'string' ? JSON.parse(sub.data) : sub.data; } catch {}
          const isLeader = isLeidingSubmissionServer(subData, fields);
          const isPaid = Number(sub.is_paid) === 1;
          const drank = Number(sub.drank_bijdrage) || 0;

          if (isPaid) paidSubs++;

          if (isLeader) {
            leidingCount++;
            if (isPaid) {
              paidLeidingCount++;
              paidDrankForfait += drank;
            }
            totalDrankForfait += drank;
          } else {
            ledenCount++;
            if (isPaid) {
              paidLedenCount++;
            }
          }
        }

        const usePaid = paidSubs > 0;
        const autoLedenAmount = usePaid ? (paidLedenCount * tariff) : (ledenCount * tariff);
        const autoLeidingAmount = usePaid ? (paidLeidingCount * tariff) : (leidingCount * tariff);
        const autoDrankForfaitAmount = usePaid ? paidDrankForfait : totalDrankForfait;

        return {
          id: formId,
          title: fRow.title,
          requirePayment: reqPayment,
          paymentAmount: tariff,
          totalSubmissions: totalSubs,
          paidSubmissions: paidSubs,
          totalExpectedAmount: totalSubs * tariff,
          totalPaidAmount: paidSubs * tariff,
          ledenCount,
          leidingCount,
          paidLedenCount,
          paidLeidingCount,
          autoLedenAmount,
          autoLeidingAmount,
          autoDrankForfaitAmount,
          totalDrankForfait,
          paidDrankForfait,
        };
      });

      res.json(results);
    } catch (error) {
      console.error('Fout bij ophalen beschikbare formulieren:', error);
      res.status(500).json({ error: 'Fout bij ophalen formulieren.' });
    }
  }));

  // --- Users / Leden ---
  app.get('/api/users', requireAuth, asyncHandler(async (req, res) => {
    try {
      const isAdmin = hasAnyRole((req as any).user, ['admin', 'groepsleiding', 'website']);
      const result = await db.execute('SELECT id, name, email, avatar, role, roles, phone, address, birthdate, chiroGroup, mustChangePassword, hasLogin FROM users ORDER BY name ASC');
      const users = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        avatar: row.avatar,
        role: row.role,
        roles: getUserRoles(row),
        phone: row.phone,
        chiroGroup: row.chiroGroup,
        ...(isAdmin
          ? {
              address: row.address,
              birthdate: row.birthdate,
              hasLogin: row.hasLogin !== 0,
              mustChangePassword: row.mustChangePassword === 1,
            }
          : {}),
      }));
      res.json(users);
    } catch (err) {
      console.error('Fout bij ophalen gebruikers:', err);
      res.status(500).json({ error: 'Fout bij ophalen gebruikers.' });
    }
  }));

  app.post('/api/users', requireRole('website', 'admin'), asyncHandler(async (req, res) => {
    try {
      const caller = (req as any).user;
      const callerIsStrictAdmin = isStrictAdmin(caller);
      const { name, email, password, role, roles, phone, chiroGroup, hasLogin, mustChangePassword } = req.body;
      const cleanName = sanitizeText(name, 100);
      const cleanEmail = typeof email === 'string' ? email.toLowerCase().trim().slice(0, 200) : '';
      if (!cleanEmail || !cleanName) return res.status(400).json({ error: 'Naam en e-mailadres zijn verplicht.' });
      if (!validator.isEmail(cleanEmail)) return res.status(400).json({ error: 'Ongeldig e-mailadres.' });

      const finalRoles = sanitizeRoles(roles, role);
      if (finalRoles.includes('admin') && !callerIsStrictAdmin) {
        return res.status(403).json({ error: 'Alleen de huidige Admin mag de Admin-rol toewijzen.' });
      }

      const primaryRole = finalRoles[0] || 'leiding';
      const shouldLogin = hasLogin !== false ? 1 : 0;

      let rawPassword = '';
      let autoGeneratedPassword: string | undefined;
      if (typeof password === 'string' && password.trim().length > 0) {
        if (!isStrongPassword(password)) {
          return res.status(400).json({ error: 'Wachtwoord moet minstens 8 tekens lang zijn en minstens één letter en één cijfer bevatten (max 128 tekens).' });
        }
        rawPassword = password;
      } else {
        rawPassword = generateTemporaryPassword();
        if (shouldLogin === 1) autoGeneratedPassword = rawPassword;
      }

      const hashed = await bcrypt.hash(rawPassword, 12);
      const needPwChange = autoGeneratedPassword ? 1 : (mustChangePassword !== undefined ? (mustChangePassword ? 1 : 0) : 1);
      const avatar = `https://placehold.co/150x150/d94824/white?text=${encodeURIComponent(cleanName.charAt(0))}`;

      const result = await db.execute({
        sql: `INSERT INTO users (name, email, password, avatar, role, roles, phone, chiroGroup, hasLogin, mustChangePassword, tokenVersion)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        args: [
          cleanName,
          cleanEmail,
          hashed,
          avatar,
          primaryRole,
          JSON.stringify(finalRoles),
          sanitizeText(phone, 20),
          sanitizeText(chiroGroup, 100),
          shouldLogin,
          needPwChange
        ],
      });
      const newUserId = Number(result.lastInsertRowid);

      // Als de nieuwe gebruiker de admin rol heeft (enkel toegestaan door strict admin), ontneem deze van alle anderen
      if (finalRoles.includes('admin')) {
        const others = await db.execute({
          sql: "SELECT id, role, roles FROM users WHERE id != ? AND (role = 'admin' OR roles LIKE '%\"admin\"%')",
          args: [newUserId]
        });
        for (const o of others.rows as any[]) {
          const oRoles = getUserRoles(o).filter(r => r !== 'admin');
          const fRoles = oRoles.length > 0 ? oRoles : ['leiding'];
          await db.execute({
            sql: "UPDATE users SET role = ?, roles = ?, tokenVersion = COALESCE(tokenVersion, 0) + 1 WHERE id = ?",
            args: [fRoles[0], JSON.stringify(fRoles), o.id]
          });
        }
      }

      res.json({
        success: true,
        id: newUserId,
        ...(autoGeneratedPassword ? { temporaryPassword: autoGeneratedPassword } : {}),
      });
    } catch (e: any) {
      if (e.message?.includes('UNIQUE') || e.code === 'SQLITE_CONSTRAINT') {
        res.status(409).json({ error: 'Dit e-mailadres is al in gebruik.' });
      } else {
        console.error('Fout bij toevoegen gebruiker:', e);
        res.status(500).json({ error: 'Fout bij toevoegen gebruiker.' });
      }
    }
  }));

  app.put('/api/users/:id', requireRole('website', 'admin'), asyncHandler(async (req, res) => {
    const targetId = parsePositiveIntId(req.params.id);
    if (!targetId) return res.status(400).json({ error: 'Ongeldig gebruikers-ID.' });

    try {
      const caller = (req as any).user;
      const callerIsStrictAdmin = isStrictAdmin(caller);

      const existingRes = await db.execute({
        sql: 'SELECT id, name, email, role, roles, hasLogin, tokenVersion FROM users WHERE id = ?',
        args: [targetId],
      });
      if (existingRes.rows.length === 0) {
        return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
      }
      const existingUser = existingRes.rows[0] as any;
      const existingRoles = getUserRoles(existingUser);
      const targetIsCurrentlyAdmin = existingRoles.includes('admin');

      const { name, email, role, roles, phone, chiroGroup, hasLogin, mustChangePassword, password } = req.body;
      const cleanName = sanitizeText(name, 100);
      const cleanEmail = typeof email === 'string' ? email.toLowerCase().trim().slice(0, 200) : '';
      if (!cleanName || !cleanEmail || !validator.isEmail(cleanEmail)) {
        return res.status(400).json({ error: 'Geldige naam en e-mailadres zijn verplicht.' });
      }

      const finalRoles = sanitizeRoles(roles, role);
      const assigningAdmin = finalRoles.includes('admin');

      // Strikte bescherming tegen verticale escalatie / overname van Admin-account door website/groepsleiding
      if ((targetIsCurrentlyAdmin || assigningAdmin) && !callerIsStrictAdmin) {
        return res.status(403).json({ error: 'Alleen de Admin mag het Admin-account wijzigen of de Admin-rol toekennen.' });
      }

      // Voorkom dat de enige admin zijn eigen admin-rol verwijdert zonder overdracht
      if (targetIsCurrentlyAdmin && !assigningAdmin) {
        const adminCountRes = await db.execute(`SELECT COUNT(*) as count FROM users WHERE role = 'admin' OR roles LIKE '%"admin"%'`);
        if (Number(adminCountRes.rows[0]?.count || 0) <= 1) {
          return res.status(400).json({ error: 'Je kunt de Admin-rol van de enige Admin niet verwijderen. Draag eerst de Admin-rol over aan een ander lid.' });
        }
      }

      const primaryRole = finalRoles[0] || 'leiding';
      const newHasLogin = hasLogin ? 1 : 0;
      const hasPasswordUpdate = typeof password === 'string' && password.trim().length > 0;

      if (hasPasswordUpdate && !isStrongPassword(password)) {
        return res.status(400).json({ error: 'Nieuw wachtwoord moet minstens 8 tekens lang zijn met minstens één letter en één cijfer.' });
      }

      const rolesChanged = JSON.stringify([...existingRoles].sort()) !== JSON.stringify([...finalRoles].sort());
      const loginChanged = (existingUser.hasLogin !== 0 ? 1 : 0) !== newHasLogin;
      const shouldRevokeSessions = hasPasswordUpdate || rolesChanged || loginChanged;
      const nextTokenVersion = Number(existingUser.tokenVersion ?? 0) + (shouldRevokeSessions ? 1 : 0);

      if (hasPasswordUpdate) {
        const hashed = await bcrypt.hash(password, 12);
        await db.execute({
          sql: `UPDATE users SET name=?, email=?, role=?, roles=?, phone=?, chiroGroup=?, hasLogin=?, mustChangePassword=?, password=?, tokenVersion=?
                WHERE id=?`,
          args: [
            cleanName,
            cleanEmail,
            primaryRole,
            JSON.stringify(finalRoles),
            sanitizeText(phone, 20),
            sanitizeText(chiroGroup, 100),
            newHasLogin,
            mustChangePassword ? 1 : 0,
            hashed,
            nextTokenVersion,
            targetId
          ],
        });
      } else {
        await db.execute({
          sql: `UPDATE users SET name=?, email=?, role=?, roles=?, phone=?, chiroGroup=?, hasLogin=?, mustChangePassword=?, tokenVersion=?
                WHERE id=?`,
          args: [
            cleanName,
            cleanEmail,
            primaryRole,
            JSON.stringify(finalRoles),
            sanitizeText(phone, 20),
            sanitizeText(chiroGroup, 100),
            newHasLogin,
            mustChangePassword ? 1 : 0,
            nextTokenVersion,
            targetId
          ],
        });
      }

      // Indien admin toegekend (enkel door strict admin), ontneem van alle andere gebruikers (maximaal 1 admin)
      if (assigningAdmin) {
        const others = await db.execute({
          sql: "SELECT id, role, roles FROM users WHERE id != ? AND (role = 'admin' OR roles LIKE '%\"admin\"%')",
          args: [targetId]
        });
        for (const o of others.rows as any[]) {
          const oRoles = getUserRoles(o).filter(r => r !== 'admin');
          const fRoles = oRoles.length > 0 ? oRoles : ['leiding'];
          await db.execute({
            sql: "UPDATE users SET role = ?, roles = ?, tokenVersion = COALESCE(tokenVersion, 0) + 1 WHERE id = ?",
            args: [fRoles[0], JSON.stringify(fRoles), o.id]
          });
        }
      }

      // Als de ingelogde gebruiker zijn eigen account wijzigde en tokenVersion steeg, ververs cookie direct
      if (targetId === caller.id && shouldRevokeSessions && newHasLogin === 1) {
        issueAuthCookie(res, {
          id: targetId,
          email: cleanEmail,
          role: primaryRole,
          roles: finalRoles,
          name: cleanName,
          tv: nextTokenVersion,
        });
      }

      res.json({ success: true });
    } catch (e: any) {
      if (e.message?.includes('UNIQUE') || e.code === 'SQLITE_CONSTRAINT') {
        res.status(409).json({ error: 'Dit e-mailadres is al in gebruik.' });
      } else {
        console.error('Fout bij bijwerken gebruiker:', e);
        res.status(500).json({ error: 'Fout bij bijwerken gebruiker.' });
      }
    }
  }));

  // Admin rol exclusief overdragen aan een ander lid (STRIKT enkel voor huidige Admin!)
  app.post('/api/users/transfer-admin', requireStrictAdmin, asyncHandler(async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const currentUserId = currentUser.id;
      const targetUserId = Number(req.body.targetUserId);
      if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
        return res.status(400).json({ error: 'Geen geldige doelgebruiker opgegeven.' });
      }
      if (targetUserId === currentUserId) return res.status(400).json({ error: 'Je bent al Admin.' });

      const targetRes = await db.execute({ sql: 'SELECT id, name, role, roles, hasLogin FROM users WHERE id = ?', args: [targetUserId] });
      if (targetRes.rows.length === 0) return res.status(404).json({ error: 'Doelgebruiker niet gevonden.' });
      const targetUser = targetRes.rows[0] as any;
      if (targetUser.hasLogin === 0) {
        return res.status(400).json({ error: 'Je kunt de Admin-rol niet overdragen aan een account zonder inlogtoegang.' });
      }

      // 1. Verwijder admin van huidige gebruiker en verhoog tokenVersion
      let newCurrentRoles = ['groepsleiding', 'leiding'];
      let newCurrentTv = Number(currentUser.tv ?? 0) + 1;
      const currentRes = await db.execute({ sql: 'SELECT id, name, email, role, roles, tokenVersion FROM users WHERE id = ?', args: [currentUserId] });
      if (currentRes.rows.length > 0) {
        const curUser = currentRes.rows[0] as any;
        const curRoles = getUserRoles(curUser).filter(r => r !== 'admin');
        newCurrentRoles = curRoles.length > 0 ? curRoles : ['groepsleiding', 'leiding'];
        newCurrentTv = Number(curUser.tokenVersion ?? 0) + 1;
        await db.execute({
          sql: "UPDATE users SET role = ?, roles = ?, tokenVersion = ? WHERE id = ?",
          args: [newCurrentRoles[0], JSON.stringify(newCurrentRoles), newCurrentTv, currentUserId]
        });
      }

      // 2. Verwijder admin van alle anderen
      const allAdmins = await db.execute({
        sql: "SELECT id, role, roles FROM users WHERE id != ? AND id != ? AND (role = 'admin' OR roles LIKE '%\"admin\"%')",
        args: [targetUserId, currentUserId]
      });
      for (const row of allAdmins.rows as any[]) {
        const rList = getUserRoles(row).filter(r => r !== 'admin');
        const fList = rList.length > 0 ? rList : ['leiding'];
        await db.execute({
          sql: "UPDATE users SET role = ?, roles = ?, tokenVersion = COALESCE(tokenVersion, 0) + 1 WHERE id = ?",
          args: [fList[0], JSON.stringify(fList), row.id]
        });
      }

      // 3. Ken admin toe aan target gebruiker
      const tRoles = getUserRoles(targetUser).filter(r => r !== 'admin');
      const finalTargetRoles = ['admin', ...tRoles];
      await db.execute({
        sql: "UPDATE users SET role = 'admin', roles = ? WHERE id = ?",
        args: [JSON.stringify(finalTargetRoles), targetUserId]
      });

      // Ververs cookie van de huidige gebruiker met zijn nieuwe (niet-admin) rollen en verhoogde tokenVersion
      issueAuthCookie(res, {
        id: currentUserId,
        email: currentUser.email,
        role: newCurrentRoles[0],
        roles: newCurrentRoles,
        name: currentUser.name,
        tv: newCurrentTv,
      });

      res.json({ success: true, message: `Admin-rol is succesvol overgedragen aan ${targetUser.name}.` });
    } catch (err) {
      console.error('Fout bij overdragen admin:', err);
      res.status(500).json({ error: 'Fout bij overdragen van de admin-rol.' });
    }
  }));

  app.delete('/api/users/:id', requireSelfOrAdmin, asyncHandler(async (req, res) => {
    try {
      const targetId = parsePositiveIntId(req.params.id)!;
      const caller = (req as any).user;
      const currentUserId = caller.id;

      // Controleer of doelgebruiker bestaat
      const userRes = await db.execute({ sql: 'SELECT id, role, roles FROM users WHERE id = ?', args: [targetId] });
      if (userRes.rows.length === 0) {
        return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
      }

      // Indien target user de admin is: enkel strict admin mag dit aanraken, en voorkom verwijderen van enige admin
      const targetRoles = getUserRoles(userRes.rows[0]);
      if (targetRoles.includes('admin')) {
        if (!isStrictAdmin(caller)) {
          return res.status(403).json({ error: 'Alleen de Admin mag een Admin-account verwijderen.' });
        }
        const adminCountRes = await db.execute(`SELECT COUNT(*) as count FROM users WHERE role = 'admin' OR roles LIKE '%"admin"%'`);
        const adminCount = Number(adminCountRes.rows[0]?.count || 0);
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'Je kan dit account niet verwijderen omdat dit de enige Admin is. Draag eerst de Admin-rol over aan een ander lid.' });
        }
      }

      await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [targetId] });

      // Indien de gebruiker zijn eigen account verwijdert, wis het sessiecookie met exacte cookie-opties
      if (currentUserId === targetId) {
        res.clearCookie('authToken', getClearCookieOptions());
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Fout bij verwijderen gebruiker:', err);
      res.status(500).json({ error: 'Fout bij verwijderen gebruiker.' });
    }
  }));

  app.post('/api/users/import', requireRole('website', 'admin'), asyncHandler(async (req, res) => {
    const list = Array.isArray(req.body.users) ? req.body.users : [];
    if (list.length === 0) return res.status(400).json({ error: 'Geen gegevens ontvangen om te importeren.' });
    if (list.length > 500) return res.status(400).json({ error: 'Maximaal 500 gebruikers per import toegestaan.' });

    let imported = 0;
    let updated = 0;
    const errors: string[] = [];
    const createdCredentials: Array<{ name: string; email: string; temporaryPassword: string }> = [];

    for (const item of list) {
      const email = typeof item?.email === 'string' ? item.email.toLowerCase().trim().slice(0, 200) : '';
      const name = sanitizeText(item?.name, 100);
      if (!name || !email || !validator.isEmail(email)) {
        errors.push(`Rij overgeslagen: ongeldige of ontbrekende naam/e-mail.`);
        continue;
      }
      const phone = sanitizeText(item?.phone, 20);
      const chiroGroup = sanitizeText(item?.chiroGroup, 100);
      // CSV-import mag NOOIT de 'admin'-rol toewijzen of afnemen
      const safeRoles = sanitizeRoles(item?.roles, item?.role).filter(r => r !== 'admin');
      const finalRoles = safeRoles.length > 0 ? safeRoles : ['leiding'];
      const shouldLogin = item?.hasLogin !== false ? 1 : 0;

      try {
        const existing = await db.execute({ sql: 'SELECT id, role, roles FROM users WHERE email = ?', args: [email] });
        if (existing.rows.length > 0) {
          const existingRoles = getUserRoles(existing.rows[0]);
          if (existingRoles.includes('admin')) {
            errors.push(`Admin-account (${email}) overgeslagen uit veiligheidsoverwegingen.`);
            continue;
          }
          await db.execute({
            sql: 'UPDATE users SET name=?, phone=?, chiroGroup=?, role=?, roles=?, hasLogin=?, tokenVersion = COALESCE(tokenVersion, 0) + 1 WHERE id=?',
            args: [name, phone, chiroGroup, finalRoles[0], JSON.stringify(finalRoles), shouldLogin, existing.rows[0].id]
          });
          updated++;
        } else {
          const tempPass = (typeof item?.temporaryPassword === 'string' && isStrongPassword(item.temporaryPassword))
            ? item.temporaryPassword
            : generateTemporaryPassword();
          const hashed = await bcrypt.hash(tempPass, 12);
          const avatar = `https://placehold.co/150x150/d94824/white?text=${encodeURIComponent(name.charAt(0))}`;
          await db.execute({
            sql: `INSERT INTO users (name, email, password, avatar, role, roles, phone, chiroGroup, hasLogin, mustChangePassword, tokenVersion)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
            args: [name, email, hashed, avatar, finalRoles[0], JSON.stringify(finalRoles), phone, chiroGroup, shouldLogin]
          });
          imported++;
          if (shouldLogin === 1) {
            createdCredentials.push({ name, email, temporaryPassword: tempPass });
          }
        }
      } catch (err) {
        console.error('Fout bij importeren gebruiker:', err);
        errors.push(`Fout bij importeren van ${email}.`);
      }
    }

    res.json({ success: true, imported, updated, errors, createdCredentials });
  }));

  app.get('/api/users/export', requireRole('website', 'admin'), asyncHandler(async (req, res) => {
    try {
      const result = await db.execute('SELECT name, email, phone, chiroGroup, role, roles, hasLogin, mustChangePassword FROM users ORDER BY name ASC');

      const headers = ['Naam', 'E-mailadres', 'Telefoon', 'Chirogroep', 'Rollen', 'Login Toegang', 'Moet Wachtwoord Wijzigen'];
      const csvRows = [headers.map(escapeCsvCell).join(';')];

      for (const row of result.rows as any[]) {
        const rolesList = getUserRoles(row).join(', ');
        const values = [
          row.name,
          row.email,
          row.phone || '',
          row.chiroGroup || '',
          rolesList,
          row.hasLogin !== 0 ? 'Ja' : 'Nee',
          row.mustChangePassword === 1 ? 'Ja' : 'Nee',
        ];
        csvRows.push(values.map(escapeCsvCell).join(';'));
      }

      const csvContent = '\uFEFF' + csvRows.join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="leiding_gewest_reinaertland_${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csvContent);
    } catch (err) {
      console.error('Fout bij exporteren leidinglijst:', err);
      res.status(500).send('Fout bij exporteren leidinglijst.');
    }
  }));

  // --- Profile / Preferences ---
  app.get('/api/me', requireAuth, asyncHandler(async (req, res) => {
    const result = await db.execute({
      sql: 'SELECT id, name, email, avatar, role, roles, phone, address, birthdate, receivePost, darkMode, chiroGroup, mustChangePassword, hasLogin FROM users WHERE id = ?',
      args: [(req as any).user.id]
    });
    if (result.rows.length === 0) return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
    const user = result.rows[0] as any;
    const userRoles = getUserRoles(user);
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: userRoles[0] || user.role,
      roles: userRoles,
      phone: user.phone || '',
      address: user.address || '',
      birthdate: user.birthdate || '',
      receivePost: user.receivePost === 1,
      darkMode: user.darkMode === null || user.darkMode === undefined ? null : user.darkMode === 1,
      chiroGroup: user.chiroGroup || '',
      mustChangePassword: user.mustChangePassword === 1,
      hasLogin: user.hasLogin !== 0,
    });
  }));

  app.put('/api/users/:id/profile', requireSelfOrAdmin, asyncHandler(async (req, res) => {
    const targetId = parsePositiveIntId(req.params.id)!;
    const caller = (req as any).user;

    if (targetId !== caller.id && !isStrictAdmin(caller)) {
      const tRes = await db.execute({ sql: 'SELECT role, roles FROM users WHERE id = ?', args: [targetId] });
      if (tRes.rows.length > 0 && getUserRoles(tRes.rows[0]).includes('admin')) {
        return res.status(403).json({ error: 'Alleen de Admin mag het Admin-profiel bewerken.' });
      }
    }

    const { name, phone, avatar, receivePost } = req.body;
    const cleanName = sanitizeText(name, 100);
    if (!cleanName) return res.status(400).json({ error: 'Naam is verplicht.' });
    const rawAvatar = typeof avatar === 'string' ? avatar.trim() : '';
    const safeAvatar = rawAvatar ? sanitizeImageUrl(rawAvatar) : '';
    if (rawAvatar && !safeAvatar) {
      return res.status(400).json({ error: 'Ongeldige profielfoto-URL.' });
    }

    await db.execute({
      sql: 'UPDATE users SET name=?, phone=?, avatar=?, receivePost=? WHERE id=?',
      args: [cleanName, sanitizeText(phone, 20), safeAvatar, receivePost ? 1 : 0, targetId],
    });
    res.json({ success: true });
  }));

  app.get('/api/users/:id/preferences', requireSelfOrAdmin, asyncHandler(async (req, res) => {
    const targetId = parsePositiveIntId(req.params.id)!;
    const result = await db.execute({ sql: 'SELECT darkMode FROM users WHERE id = ?', args: [targetId] });
    if (result.rows.length === 0) return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
    const dm = (result.rows[0] as any).darkMode;
    res.json({ darkMode: dm === null || dm === undefined ? null : dm === 1 });
  }));

  app.put('/api/users/:id/preferences', requireSelfOrAdmin, asyncHandler(async (req, res) => {
    const targetId = parsePositiveIntId(req.params.id)!;
    await db.execute({ sql: 'UPDATE users SET darkMode = ? WHERE id = ?', args: [req.body.darkMode ? 1 : 0, targetId] });
    res.json({ success: true });
  }));

  app.put('/api/users/:id/password', strictLimiter, requireSelfOrAdmin, asyncHandler(async (req, res) => {
    const targetId = parsePositiveIntId(req.params.id)!;
    const caller = (req as any).user;
    const { currentPassword, newPassword } = req.body;

    if (typeof currentPassword !== 'string' || currentPassword.length === 0 || currentPassword.length > 128) {
      return res.status(400).json({ error: 'Huidig wachtwoord is verplicht.' });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ error: 'Nieuw wachtwoord moet minstens 8 tekens lang zijn en minstens één letter en één cijfer bevatten.' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'Nieuw wachtwoord mag niet gelijk zijn aan je huidige wachtwoord.' });
    }

    const userRes = await db.execute({
      sql: 'SELECT id, email, name, role, roles, password, tokenVersion FROM users WHERE id = ?',
      args: [targetId]
    });
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
    const targetUser = userRes.rows[0] as any;

    if (targetId !== caller.id && getUserRoles(targetUser).includes('admin') && !isStrictAdmin(caller)) {
      return res.status(403).json({ error: 'Alleen de Admin mag het Admin-wachtwoord wijzigen.' });
    }

    if (!await bcrypt.compare(currentPassword, targetUser.password)) {
      return res.status(401).json({ error: 'Huidig wachtwoord fout.' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    const nextTv = Number(targetUser.tokenVersion ?? 0) + 1;
    await db.execute({
      sql: 'UPDATE users SET password = ?, mustChangePassword = 0, tokenVersion = ? WHERE id = ?',
      args: [hashed, nextTv, targetId]
    });

    // Als gebruiker eigen wachtwoord wijzigt: ververs huidige sessiecookie (alle andere/gestolen sessies worden ongeldig!)
    if (targetId === caller.id) {
      const freshRoles = getUserRoles(targetUser);
      issueAuthCookie(res, {
        id: targetId,
        email: String(targetUser.email),
        role: freshRoles[0] || 'leiding',
        roles: freshRoles,
        name: String(targetUser.name),
        tv: nextTv,
      });
    }

    res.json({ success: true });
  }));

  app.post('/api/me/first-password', strictLimiter, requireAuth, asyncHandler(async (req, res) => {
    const caller = (req as any).user;
    const userId = caller.id;
    const { newPassword } = req.body;

    // Beveiliging: enkel toegestaan indien mustChangePassword effectief actief staat in DB!
    const userRes = await db.execute({
      sql: 'SELECT id, email, name, role, roles, mustChangePassword, tokenVersion FROM users WHERE id = ?',
      args: [userId]
    });
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
    const dbUser = userRes.rows[0] as any;

    if (dbUser.mustChangePassword !== 1) {
      return res.status(403).json({ error: 'Gebruik het normale wachtwoordformulier bij Instellingen om je wachtwoord te wijzigen.' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ error: 'Nieuw wachtwoord moet minstens 8 tekens lang zijn en minstens één letter en één cijfer bevatten.' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    const nextTv = Number(dbUser.tokenVersion ?? 0) + 1;
    await db.execute({
      sql: 'UPDATE users SET password = ?, mustChangePassword = 0, tokenVersion = ? WHERE id = ?',
      args: [hashed, nextTv, userId],
    });

    const freshRoles = getUserRoles(dbUser);
    issueAuthCookie(res, {
      id: userId,
      email: String(dbUser.email),
      role: freshRoles[0] || 'leiding',
      roles: freshRoles,
      name: String(dbUser.name),
      tv: nextTv,
    });

    res.json({ success: true, message: 'Wachtwoord succesvol gewijzigd.' });
  }));

  app.post('/api/login', strictLimiter, asyncHandler(async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim().slice(0, 200) : '';
    const password = req.body.password;
    if (!email || typeof password !== 'string' || password.length === 0 || password.length > 128) {
      return res.status(401).json({ error: 'Onjuist e-mailadres of wachtwoord.' });
    }

    const result = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
    const user = result.rows[0] as any;
    // Altijd een echte 12-round bcrypt.compare uitvoeren tegen timing attacks (user enumeration)
    const passwordMatch = await bcrypt.compare(password, user ? String(user.password) : DUMMY_BCRYPT_HASH);
    if (!user || !passwordMatch) {
      return res.status(401).json({ error: 'Onjuist e-mailadres of wachtwoord.' });
    }
    if (user.hasLogin === 0) {
      return res.status(403).json({ error: 'Dit account heeft momenteel geen toegang tot het portaal.' });
    }

    const userRoles = getUserRoles(user);
    const tv = Number(user.tokenVersion ?? 0);
    issueAuthCookie(res, {
      id: Number(user.id),
      email: String(user.email),
      role: userRoles[0] || String(user.role || 'leiding'),
      roles: userRoles,
      name: String(user.name),
      tv,
    });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: userRoles[0] || user.role,
        roles: userRoles,
        mustChangePassword: user.mustChangePassword === 1,
        phone: user.phone || '',
        chiroGroup: user.chiroGroup || ''
      }
    });
  }));

  app.post('/api/logout', asyncHandler(async (req, res) => {
    // Echte server-side sessie-intrekking: verhoog tokenVersion zodat een gekopieerde cookie niet meer werkt
    const token = req.cookies?.authToken;
    if (token && typeof token === 'string') {
      try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
        const userId = Number(decoded?.id);
        if (Number.isSafeInteger(userId) && userId > 0) {
          await db.execute({
            sql: 'UPDATE users SET tokenVersion = COALESCE(tokenVersion, 0) + 1 WHERE id = ?',
            args: [userId],
          });
        }
      } catch {}
    }
    res.clearCookie('authToken', getClearCookieOptions());
    res.json({ success: true });
  }));

  // ============================================================
  // FINANCIËN & KASBEHEER
  // ============================================================
  app.get('/api/finances', requireAuth, asyncHandler(async (req, res) => {
    try {
      const settingsRes = await db.execute('SELECT * FROM finance_settings WHERE id = 1');
      const settings = settingsRes.rows[0] || { id: 1, bankBalance: 0, googleSheetUrl: '', updatedAt: '' };

      const eventsRes = await db.execute('SELECT * FROM finance_events ORDER BY COALESCE(updatedAt, createdAt, date) DESC, id DESC');
      const events = eventsRes.rows.map((row: any) => {
        let parsedItems = [];
        try { parsedItems = JSON.parse(row.items); } catch {}
        return {
          ...row,
          items: parsedItems
        };
      });

      // Zoek penningmeester
      const penningRes = await db.execute(`
        SELECT id, name, email, phone, avatar, roles, chiroGroup FROM users
        WHERE roles LIKE '%penningmeester%' OR role = 'penningmeester'
        LIMIT 1
      `);
      const penningmeester = penningRes.rows[0] || null;

      res.json({
        settings: {
          ...settings,
          bankBalance: Number((settings as any).bankBalance) || 0
        },
        events,
        penningmeester: penningmeester ? {
          ...penningmeester,
          roles: getUserRoles(penningmeester)
        } : null
      });
    } catch (err) {
      console.error('Fout bij ophalen financiën:', err);
      res.status(500).json({ error: 'Fout bij ophalen financiële gegevens.' });
    }
  }));

  app.put('/api/finances/settings', requireRole('penningmeester', 'website'), asyncHandler(async (req, res) => {
    try {
      const { bankBalance, googleSheetUrl } = req.body;
      const numericBalance = Number(bankBalance);
      if (!Number.isFinite(numericBalance) || Math.abs(numericBalance) > 10_000_000) {
        return res.status(400).json({ error: 'Ongeldig banksaldo.' });
      }
      const rawSheetUrl = typeof googleSheetUrl === 'string' ? googleSheetUrl.trim() : '';
      const safeSheetUrl = rawSheetUrl ? sanitizeHttpUrl(rawSheetUrl, 500) : '';
      if (rawSheetUrl && !safeSheetUrl) {
        return res.status(400).json({ error: 'Ongeldige Google Sheet URL.' });
      }
      const now = new Date().toISOString();
      await db.execute({
        sql: 'UPDATE finance_settings SET bankBalance=?, googleSheetUrl=?, updatedAt=? WHERE id = 1',
        args: [numericBalance, safeSheetUrl, now]
      });
      res.json({ success: true, bankBalance: numericBalance, updatedAt: now });
    } catch (err) {
      console.error('Fout bij bijwerken financiële instellingen:', err);
      res.status(500).json({ error: 'Fout bij bijwerken instellingen.' });
    }
  }));

  app.post('/api/finances/events', requireRole('penningmeester', 'website'), asyncHandler(async (req, res) => {
    try {
      const { name, date, werkjaar, items } = req.body;
      const cleanName = sanitizeText(name, 200);
      if (!cleanName) return res.status(400).json({ error: 'Evenementnaam is verplicht.' });
      const finalDate = sanitizeText(date, 30) || new Date().toISOString().slice(0, 10);
      const finalWerkjaar = sanitizeText(werkjaar, 30) || computeWerkjaar(finalDate);
      const safeItems = Array.isArray(items) ? items.slice(0, 500) : [];
      const itemsJson = JSON.stringify(safeItems);
      const now = new Date().toISOString();

      const result = await db.execute({
        sql: `INSERT INTO finance_events (name, date, werkjaar, items, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [cleanName, finalDate, finalWerkjaar, itemsJson, now, now]
      });

      res.json({
        id: Number(result.lastInsertRowid),
        name: cleanName,
        date: finalDate,
        werkjaar: finalWerkjaar,
        items: safeItems
      });
    } catch (err) {
      console.error('Fout bij aanmaken financieel evenement:', err);
      res.status(500).json({ error: 'Fout bij aanmaken evenement.' });
    }
  }));

  app.put('/api/finances/events/:id', requireRole('penningmeester', 'website'), asyncHandler(async (req, res) => {
    const eventId = parsePositiveIntId(req.params.id);
    if (!eventId) return res.status(400).json({ error: 'Ongeldig evenement-ID.' });
    try {
      const { name, date, werkjaar, items } = req.body;
      const cleanName = sanitizeText(name, 200);
      if (!cleanName) return res.status(400).json({ error: 'Evenementnaam is verplicht.' });
      const finalDate = sanitizeText(date, 30) || new Date().toISOString().slice(0, 10);
      const finalWerkjaar = sanitizeText(werkjaar, 30) || computeWerkjaar(finalDate);
      const safeItems = Array.isArray(items) ? items.slice(0, 500) : [];
      const itemsJson = JSON.stringify(safeItems);
      const now = new Date().toISOString();

      await db.execute({
        sql: `UPDATE finance_events SET name=?, date=?, werkjaar=?, items=?, updatedAt=?
              WHERE id=?`,
        args: [cleanName, finalDate, finalWerkjaar, itemsJson, now, eventId]
      });

      res.json({ success: true });
    } catch (err) {
      console.error('Fout bij bijwerken financieel evenement:', err);
      res.status(500).json({ error: 'Fout bij bijwerken evenement.' });
    }
  }));

  app.delete('/api/finances/events/:id', requireRole('penningmeester', 'website'), asyncHandler(async (req, res) => {
    const eventId = parsePositiveIntId(req.params.id);
    if (!eventId) return res.status(400).json({ error: 'Ongeldig evenement-ID.' });
    try {
      await db.execute({ sql: 'DELETE FROM finance_events WHERE id = ?', args: [eventId] });
      res.json({ success: true });
    } catch (err) {
      console.error('Fout bij verwijderen financieel evenement:', err);
      res.status(500).json({ error: 'Fout bij verwijderen evenement.' });
    }
  }));

  // 404 voor onbekende API routes
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API-route niet gevonden.' });
  });

  // Globale error handler (lekt nooit stack traces of interne foutmeldingen naar de client)
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Bestand of verzoek is te groot.' });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Ongeldig JSON-verzoek.' });
    }
    if (err?.message === 'CORS niet toegestaan') {
      return res.status(403).json({ error: 'CORS toegang geweigerd.' });
    }
    console.error('❌ Onverwachte serverfout:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Er is een interne serverfout opgetreden.' });
    }
  });

  // ============================================================
  // VITE / STATIC
  // ============================================================
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Statische bestanden serveren met geoptimaliseerde Cache-Control headers
    app.use(express.static('dist', {
      setHeaders: (res, filePath) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('/assets/')) {
          // Vite hashed bundles (JS, CSS) -> immutable 1 jaar
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (normalized.endsWith('.html')) {
          // HTML SPA shell -> direct revalideren zodat nieuwe releases meteen live gaan
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        } else if (normalized.match(/\.(png|jpg|jpeg|webp|svg|ico|woff|woff2|ttf|eot)$/i)) {
          // Afbeeldingen en webfonts -> 30 dagen cache met stale-while-revalidate
          res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
        } else {
          // Overige statische bestanden (robots.txt, sitemap.xml)
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
      }
    }));

    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      res.sendFile('index.html', { root: 'dist' });
    });
  }

  // Luister eerst op de poort
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server draait op poort ${PORT}`);
    // Initialiseer DB op de achtergrond zodat startup niet blokkeert
    initDB();
  });
}

startServer();