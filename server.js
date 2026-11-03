require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const nodemailer = require('nodemailer');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(ROOT, 'data');
const REGISTRATIONS_FILE = path.join(DATA_DIR, 'registrations.json');
const events = require('./events.json');
const eventById = new Map(events.map((event) => [event.id, event]));
let storeQueue = Promise.resolve();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function sendPage(response, statusCode, heading, message) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  });
  response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)} · ASTRA</title><body style="margin:0;background:#090b18;color:#f4f1e9;font:16px/1.6 Segoe UI,Arial,sans-serif"><main style="max-width:620px;margin:12vh auto;padding:40px 28px;border:1px solid #34364b;background:#121526"><p style="color:#d8ff59;font:12px monospace;letter-spacing:.14em">ASTRA · SAMRAT ASHOK TECHNOLOGICAL INSTITUTE</p><h1 style="font-size:34px;line-height:1.1">${escapeHtml(heading)}</h1><p>${escapeHtml(message)}</p><a href="/" style="display:inline-block;margin-top:15px;color:#090b18;background:#d8ff59;padding:12px 18px;text-decoration:none;font:12px monospace;text-transform:uppercase">Return to ASTRA</a></main></body></html>`);
}

async function readRegistrations() {
  try {
    return JSON.parse(await fs.readFile(REGISTRATIONS_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function updateRegistrations(update) {
  const job = storeQueue.then(async () => {
    const registrations = await readRegistrations();
    const result = await update(registrations);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(REGISTRATIONS_FILE, `${JSON.stringify(registrations, null, 2)}\n`, 'utf8');
    return result;
  });
  storeQueue = job.catch(() => {});
  return job;
}

async function readJsonBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw Object.assign(new Error('Request is too large.'), { statusCode: 413 });
  }
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error('Please submit valid form data.'), { statusCode: 400 });
  }
}

function validateRegistration(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const mobile = typeof body.mobile === 'string' ? body.mobile.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  const digits = mobile.replace(/\D/g, '');

  if (!eventById.has(eventId)) throw Object.assign(new Error('Please choose a valid event.'), { statusCode: 400 });
  if (name.length < 2 || name.length > 100) throw Object.assign(new Error('Enter a name between 2 and 100 characters.'), { statusCode: 400 });
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'), { statusCode: 400 });
  if (mobile.length > 20 || digits.length < 8 || digits.length > 15) throw Object.assign(new Error('Enter a valid mobile number with 8 to 15 digits.'), { statusCode: 400 });
  if (note.length > 1000) throw Object.assign(new Error('The note must be 1,000 characters or less.'), { statusCode: 400 });

  return { name, email, mobile, note, eventId };
}

function makeMailer() {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from || host === 'smtp.example.com') return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const auth = process.env.SMTP_USER && process.env.SMTP_PASS
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined;
  return { from, transporter: nodemailer.createTransport({ host, port, secure, auth }) };
}

async function handleRegistration(request, response) {
  try {
    const values = validateRegistration(await readJsonBody(request));
    const mailer = makeMailer();
    if (!mailer) {
      return sendJson(response, 503, { error: 'Email verification is not configured. Add your SMTP settings to the .env file and restart the server.' });
    }

    const event = eventById.get(values.eventId);
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
    const registration = {
      id: crypto.randomUUID(),
      eventId: values.eventId,
      eventTitle: event.title,
      name: values.name,
      email: values.email,
      mobile: values.mobile,
      note: values.note,
      status: 'pending_email_verification',
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      tokenHash,
    };

    await updateRegistrations((registrations) => { registrations.push(registration); });
    const baseUrl = (process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
    const verificationUrl = `${baseUrl}/verify?token=${encodeURIComponent(token)}`;
    try {
      await mailer.transporter.sendMail({
        from: mailer.from,
        to: values.email,
        subject: `Verify your ASTRA registration: ${event.title}`,
        text: `Hi ${values.name},\n\nOpen this link within 30 minutes to verify your email and complete your registration for ${event.title}:\n${verificationUrl}\n\nIf you did not request this registration, you can ignore this email.\n\nASTRA · Samrat Ashok Technological Institute`,
        html: `<p>Hi ${escapeHtml(values.name)},</p><p>Open this link within 30 minutes to verify your email and complete your registration for <strong>${escapeHtml(event.title)}</strong> at ASTRA, Samrat Ashok Technological Institute.</p><p><a href="${escapeHtml(verificationUrl)}">Verify my email and complete registration</a></p><p>If you did not request this registration, you can ignore this email.</p>`,
      });
    } catch (error) {
      await updateRegistrations((registrations) => {
        const index = registrations.findIndex((item) => item.id === registration.id);
        if (index !== -1) registrations.splice(index, 1);
      });
      console.error('Could not send registration verification email:', error.message);
      return sendJson(response, 502, { error: 'The verification email could not be sent. Check the SMTP settings and try again.' });
    }

    return sendJson(response, 201, { message: `Verification link sent to ${values.email}. Open it within 30 minutes to complete your ${event.title} registration.` });
  } catch (error) {
    return sendJson(response, error.statusCode || 500, { error: error.statusCode ? error.message : 'The registration could not be processed.' });
  }
}

async function handleVerification(url, response) {
  const token = url.searchParams.get('token') || '';
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return sendPage(response, 400, 'Invalid verification link', 'This link is not valid. Return to ASTRA and register for your event again.');

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  try {
    const result = await updateRegistrations((registrations) => {
      const registration = registrations.find((item) => item.tokenHash === tokenHash && item.status === 'pending_email_verification');
      if (!registration) return { status: 'invalid' };
      if (Date.now() > new Date(registration.expiresAt).getTime()) return { status: 'expired' };
      registration.status = 'verified';
      registration.verifiedAt = new Date().toISOString();
      delete registration.tokenHash;
      return { status: 'verified', eventTitle: registration.eventTitle };
    });

    if (result.status === 'expired') return sendPage(response, 410, 'Link expired', 'This verification link has expired. Return to ASTRA and register for the event again.');
    if (result.status !== 'verified') return sendPage(response, 400, 'Link already used or invalid', 'This verification link has already been used or is no longer valid.');
    return sendPage(response, 200, 'Email verified — you’re registered!', `Your email is verified and your registration for ${result.eventTitle} is complete.`);
  } catch (error) {
    console.error('Could not verify registration:', error.message);
    return sendPage(response, 500, 'Verification unavailable', 'We could not complete the verification right now. Please try again later.');
  }
}

const publicFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/script.js', ['script.js', 'text/javascript; charset=utf-8']],
  ['/events.json', ['events.json', 'application/json; charset=utf-8']],
]);

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'POST' && url.pathname === '/api/register') return handleRegistration(request, response);
  if (request.method === 'GET' && url.pathname === '/verify') return handleVerification(url, response);

  const publicFile = publicFiles.get(url.pathname);
  if ((request.method === 'GET' || request.method === 'HEAD') && publicFile) {
    try {
      const content = await fs.readFile(path.join(ROOT, publicFile[0]));
      response.writeHead(200, {
        'Content-Type': publicFile[1],
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      return response.end(request.method === 'HEAD' ? undefined : content);
    } catch {
      return sendJson(response, 500, { error: 'The website could not be loaded.' });
    }
  }
  return sendJson(response, 404, { error: 'Page not found.' });
});

server.listen(PORT, () => {
  console.log(`ASTRA website listening at http://localhost:${PORT}`);
  if (!makeMailer()) console.log('Email is not configured yet. Copy .env.example to .env and add SMTP settings to enable verification emails.');
});
