# Resume Roast AI

Tell it the job, add your resume, get roasted. One page, no sign-up. Powered by the Claude API.

- Enter the role you're applying for (required) and paste the job description (optional).
- Paste your resume as text, or upload a PDF or JPG up to 2 MB.
- Get a witty (but constructive) roast written for that role, an ATS score out of 100 for that role, three specific fixes, the job keywords your resume is missing, and a spelling, grammar, and punctuation check.

## How it works

```
public/            Static frontend (HTML, CSS, vanilla JS)
  index.html
  styles.css
  app.js
  favicon.svg
lib/roast.js       Claude API call, prompt, response validation, error mapping
server.js          Express server: serves /public and exposes POST /api/roast
.env.example       Environment variable template
```

The browser only ever talks to `/api/roast`. The server calls Claude with your key from `process.env.ANTHROPIC_API_KEY`, so the key never reaches frontend code.

Structured output is enforced with a forced tool call (`tool_choice`), so the model always returns:

```json
{
  "score": 64,
  "roast": "3-4 sentence roast…",
  "fixes": [
    { "title": "Short imperative", "detail": "Specific change for this resume" },
    { "title": "…", "detail": "…" },
    { "title": "…", "detail": "…" }
  ],
  "missingKeywords": ["SEO", "Google Analytics"],
  "languageIssues": [
    { "type": "spelling", "original": "manageing", "suggestion": "managing" }
  ]
}
```

PDFs and JPGs are sent straight to Claude as document and image inputs, so there's no PDF parsing library and scanned resumes work too.

The server validates and clamps that shape before returning it.

## Setup

Requires Node.js 18 or newer.

```bash
git clone <your-repo-url> resume-roast-ai
cd resume-roast-ai
npm install
cp .env.example .env
```

Open `.env` and add your key from https://console.anthropic.com:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Run it:

```bash
npm run dev        # auto-restarts on file changes
# or
npm start
```

Open http://localhost:3000.

### Working on the UI without an API key

```bash
npm run dev:mock
```

`MOCK_ROAST=1` returns a canned roast after a short delay, so you can iterate on animations without spending credits. (On Windows, set the variable with `set MOCK_ROAST=1 && node server.js`, or put `MOCK_ROAST=1` in `.env`.)

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | | Your Anthropic API key |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-5` | Any Claude model that supports tool use |
| `PORT` | No | `3000` | Port the server listens on |
| `RATE_LIMIT_PER_MIN` | No | `8` | Roasts allowed per IP per minute |
| `MOCK_ROAST` | No | `0` | `1` returns a canned response, no API call |

## API

`POST /api/roast`

Request body:

```json
{
  "role": "Data Analyst",
  "jobDescription": "optional, up to 8,000 characters",
  "resume": "plain text, 200 to 15,000 characters (skip when sending a file)",
  "file": { "name": "resume.pdf", "mediaType": "application/pdf", "data": "<base64>" }
}
```

`role` is required. Send either `resume` or `file`. `file.mediaType` must be `application/pdf` or `image/jpeg`, and the decoded file must be 2 MB or smaller. The server also checks the file's real signature, not just the declared type.

| Status | Meaning |
|---|---|
| 200 | `{ score, roast, fixes }` |
| 400 | Missing role, resume too short, or malformed request |
| 413 | Resume, job description, or file too large |
| 415 | File isn't a real PDF or JPG |
| 422 | The AI couldn't read the file |
| 429 | Rate limit hit (see `Retry-After` header) |
| 5xx | Missing/invalid key, model unavailable, upstream overload or timeout |

Every error response is `{ "error": "Human-readable message" }`, which the UI shows as-is.

`GET /api/health` returns `{ ok, model, mock }`.

## Deploy

Any Node host works. The app reads `PORT` from the environment and trusts the platform proxy for rate limiting.

**Render / Railway**
1. Push this repo to GitHub.
2. Create a new Web Service from the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add `ANTHROPIC_API_KEY` in the service's environment settings.

**Fly.io / any VPS**: `npm ci && npm start` behind your usual process manager, with `ANTHROPIC_API_KEY` set in the environment.

Never commit `.env`; it's already in `.gitignore`.

## Notes

- The rate limiter is in-memory, which is fine for a single instance. If you scale horizontally, move it to Redis or your platform's edge rate limiting.
- Resume text, uploaded files, and job descriptions are sent to the Claude API for the roast and are not stored or logged by this server.
- The prompt tells the model to roast the document, never the person, and to ignore any instructions embedded in the pasted text.
- Animations respect `prefers-reduced-motion`.

## License

MIT
