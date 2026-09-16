require('dotenv').config();

const path = require('path');
const express = require('express');
const { roastResume, RoastError, MODEL } = require('./lib/roast');

const PORT = Number(process.env.PORT) || 3000;
const MIN_CHARS = 200;
const MAX_CHARS = 15000;
const MAX_ROLE_CHARS = 100;
const MAX_JD_CHARS = 8000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const FILE_TYPES = {
  'application/pdf': (buf) => buf.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/jpeg': (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
};
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN) || 8;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // correct client IPs behind Render/Railway/Fly proxies

app.use(express.json({ limit: '4mb' })); // 2 MB file becomes ~2.7 MB as base64
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// --- Tiny in-memory rate limiter (per IP) so nobody burns through your API credits.
const WINDOW_MS = 60_000;
const hits = new Map();

function rateLimit(req, res, next) {
  const now = Date.now();
  const entry = hits.get(req.ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    hits.set(req.ip, { start: now, count: 1 });
    return next();
  }
  if (entry.count >= RATE_LIMIT_PER_MIN) {
    res.set('Retry-After', String(Math.ceil((entry.start + WINDOW_MS - now) / 1000)));
    return res.status(429).json({ error: 'That’s a lot of roasting. Wait a minute and try again.' });
  }
  entry.count += 1;
  return next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of hits) if (now - entry.start > WINDOW_MS) hits.delete(ip);
}, WINDOW_MS).unref();

// --- API
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: MODEL, mock: process.env.MOCK_ROAST === '1' });
});

const bad = (res, status, error) => res.status(status).json({ error });

function readFile(file) {
  if (!file) return { file: null };
  if (typeof file !== 'object' || typeof file.data !== 'string' || typeof file.mediaType !== 'string') {
    return { error: [400, 'The attached file was malformed. Attach it again.'] };
  }
  const check = FILE_TYPES[file.mediaType];
  if (!check) return { error: [415, 'Only PDF and JPG files are supported.'] };

  const data = file.data.replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(data, 'base64');
  if (buf.length === 0) return { error: [400, 'The attached file is empty.'] };
  if (buf.length > MAX_FILE_BYTES) return { error: [413, 'That file is over 2 MB. Compress it or paste the text instead.'] };
  if (!check(buf)) return { error: [415, 'That file doesn’t look like a real PDF or JPG. Try exporting it again.'] };

  return { file: { mediaType: file.mediaType, data: buf.toString('base64') } };
}

app.post('/api/roast', rateLimit, async (req, res) => {
  const body = req.body || {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const role = str(body.role);
  const jobDescription = str(body.jobDescription);
  const resumeText = str(body.resume);

  if (role.length < 2) return bad(res, 400, 'Add the role you’re applying for.');
  if (role.length > MAX_ROLE_CHARS) return bad(res, 400, `Keep the role under ${MAX_ROLE_CHARS} characters.`);
  if (jobDescription.length > MAX_JD_CHARS) {
    return bad(res, 413, `The job description is over ${MAX_JD_CHARS.toLocaleString()} characters. Paste the key parts only.`);
  }

  const { file, error } = readFile(body.file);
  if (error) return bad(res, ...error);

  if (!file) {
    if (resumeText.length < MIN_CHARS) {
      return bad(res, 400, `Paste at least ${MIN_CHARS} characters of your resume, or attach a PDF or JPG.`);
    }
    if (resumeText.length > MAX_CHARS) {
      return bad(res, 413, `That’s over ${MAX_CHARS.toLocaleString()} characters. Trim it to the essentials and try again.`);
    }
  }

  try {
    const result = await roastResume({
      role,
      jobDescription,
      resumeText: file ? '' : resumeText,
      file,
    });
    return res.json(result);
  } catch (err) {
    const known = err instanceof RoastError;
    const status = known ? err.status : 500;
    console.error(`[roast] ${status}`, known ? err.cause || err.message : err);
    return res.status(status).json({
      error: known ? err.publicMessage : 'Something broke on our side. Try again.',
    });
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Body-parser errors (bad JSON, oversized payload)
app.use((err, _req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That upload is too large. Keep files under 2 MB.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request was malformed. Refresh the page and try again.' });
  }
  return next(err);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Resume Roast AI running at http://localhost:${PORT}`);
    if (process.env.MOCK_ROAST === '1') {
      console.log('MOCK_ROAST=1: returning a canned roast, no API calls.');
    } else if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('Warning: ANTHROPIC_API_KEY is not set. Roasts will fail until you add it to .env');
    }
  });
}

module.exports = app;
