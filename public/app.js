(() => {
  'use strict';

  const MIN_CHARS = 200;
  const MAX_CHARS = 15000;
  const MAX_FILE_BYTES = 2 * 1024 * 1024;
  const FILE_TYPES = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG' };
  const REQUEST_TIMEOUT_MS = 90_000;
  const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 52;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const $ = (sel) => document.querySelector(sel);
  const el = {
    body: document.body,
    viewInput: $('#view-input'),
    viewResult: $('#view-result'),
    textarea: $('#resume'),
    role: $('#role'),
    jd: $('#jd'),
    field: $('#field'),
    modeBtns: document.querySelectorAll('.mode'),
    dropzone: $('#dropzone'),
    dropInner: $('#drop-inner'),
    fileInput: $('#file-input'),
    fileCard: $('#file-card'),
    fileThumb: $('#file-thumb'),
    fileName: $('#file-name'),
    fileSize: $('#file-size'),
    fileRemove: $('#file-remove'),
    count: $('#count'),
    sampleBtn: $('#sample-btn'),
    clearBtn: $('#clear-btn'),
    roastBtn: $('#roast-btn'),
    roastBtnLabel: $('#roast-btn .btn-label'),
    statusText: $('#status-text'),
    error: $('#error'),
    card: $('#result-card'),
    gauge: $('#gauge'),
    gaugeFill: $('#gauge-fill'),
    gaugeNum: $('#gauge-num'),
    verdict: $('#verdict'),
    targetLine: $('#target-line'),
    keywordsBlock: $('#keywords-block'),
    keywordsHint: $('#keywords-hint'),
    keywordList: $('#keyword-list'),
    langBlock: $('#lang-block'),
    langList: $('#lang-list'),
    langClean: $('#lang-clean'),
    roast: $('#roast'),
    fixList: $('#fix-list'),
    againBtn: $('#again-btn'),
    copyBtn: $('#copy-btn'),
    copyLabel: $('#copy-btn .btn-label'),
  };

  const STATUS_LINES = [
    'Reading between the lines…',
    'Matching you against the role…',
    'Counting the buzzwords…',
    'Hunting for typos…',
    'Looking for a single number…',
    'Parsing it like an ATS would…',
    'Asking a tired recruiter for a second opinion…',
    'Sharpening the feedback…',
  ];

  const SAMPLE_ROLE = 'Digital Marketing Executive';

  const SAMPLE_JD = `We're hiring a Digital Marketing Executive to grow our D2C brand.
Responsibilities: plan and run paid campaigns on Meta and Google, own SEO for the website, build a monthly content calendar, and report performance weekly.
Requirements: 2+ years in digital marketing, hands-on with Meta Ads Manager and Google Analytics, working knowledge of SEO, experience with A/B testing, strong written English.`;

  const SAMPLE_RESUME = `RAHUL SHARMA
rahul.sharma@email.com | +91 98xxxxxx21 | Pune

OBJECTIVE
Hardworking and passionate results-driven professional seeking a challenging role in a reputed organisation where I can utilise my skills and grow along with the company. I am a team player with excellent communication skills and a go-getter attitude.

EXPERIENCE
Marketing Executive, BrightLeaf Solutions (2021 - Present)
- Responsible for manageing social media accounts
- Worked on various campaigns
- Coordinated with team members for diffrent tasks
- Handled client communication

Marketing Intern, Sunrise Media (Jan 2020 - June 2020)
- Assisted the marketing team in there campaigns
- Made posts for Instagram and Facebook
- Did market reserch

EDUCATION
BBA, Symbiosis College, 2020 - 72%
Class XII, Kendriya Vidyalaya, 2017 - 81%

SKILLS
MS Office, Excel, PowerPoint, Leadership, Communication, Teamwork, Canva, Social Media, Time Management, Hard Working

HOBBIES
Reading, travelling, listening to music, cricket`;

  let runId = 0; // increments on every reset so stale animations stop
  let statusTimer = null;
  let lastResult = null;
  let mode = 'text';
  let attached = null; // { name, size, mediaType, data, previewUrl }

  /* ---------------- State ---------------- */

  function setState(state) {
    el.body.dataset.state = state;
    const loading = state === 'loading';
    el.textarea.readOnly = loading;
    el.role.readOnly = loading;
    el.jd.readOnly = loading;
    el.dropInner.disabled = loading;
    el.fileRemove.disabled = loading;
    el.modeBtns.forEach((b) => (b.disabled = loading));
    el.sampleBtn.disabled = loading;
    el.clearBtn.disabled = loading;
    el.roastBtnLabel.textContent = loading ? 'Roasting…' : 'Roast my resume';
    el.roastBtn.setAttribute('aria-busy', String(loading));
    updateInputMeta();
  }

  function swapView(from, to) {
    return new Promise((resolve) => {
      if (reduceMotion.matches) {
        from.hidden = true;
        to.hidden = false;
        return resolve();
      }
      from.classList.add('is-leaving');
      setTimeout(() => {
        from.hidden = true;
        from.classList.remove('is-leaving');
        to.hidden = false;
        resolve();
      }, 320);
    });
  }

  function resumeStatus() {
    if (mode === 'file') {
      return attached
        ? { ok: true, text: `${FILE_TYPES[attached.mediaType]} attached` }
        : { ok: false, text: 'PDF or JPG, up to 2 MB' };
    }
    const len = el.textarea.value.trim().length;
    if (len === 0) return { ok: false, text: '0 characters' };
    if (len < MIN_CHARS) return { ok: false, text: `${MIN_CHARS - len} more characters needed`, short: true };
    if (len > MAX_CHARS) return { ok: false, text: `${(len - MAX_CHARS).toLocaleString()} characters over the limit`, short: true };
    return { ok: true, text: `${len.toLocaleString()} characters` };
  }

  function updateInputMeta() {
    const loading = el.body.dataset.state === 'loading';
    const status = resumeStatus();
    const hasRole = el.role.value.trim().length >= 2;
    const hasAnything = el.textarea.value.trim().length > 0 || attached || el.role.value.trim() || el.jd.value.trim();

    el.count.textContent = status.ok && !hasRole ? 'Add the role you’re applying for' : status.text;
    el.count.classList.toggle('is-short', Boolean(status.short) || (status.ok && !hasRole));
    el.clearBtn.hidden = !hasAnything;
    el.sampleBtn.hidden = Boolean(hasAnything);
    el.roastBtn.disabled = loading || !status.ok || !hasRole;
  }

  /* ---------------- Resume input mode + file ---------------- */

  function setMode(next) {
    mode = next;
    el.modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === next)));
    el.textarea.hidden = next !== 'text';
    el.dropzone.hidden = next !== 'file';
    clearError();
    updateInputMeta();
  }

  function formatBytes(bytes) {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function readAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('That file couldn’t be read. Try another one.'));
      reader.readAsDataURL(file);
    });
  }

  function detectType(file) {
    if (FILE_TYPES[file.type]) return file.type;
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) return 'application/pdf';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    return null;
  }

  async function attachFile(file) {
    if (!file) return;
    clearError();
    const mediaType = detectType(file);
    if (!mediaType) {
      showError('Only PDF and JPG files work here. Export your resume as one of those, or paste the text.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showError(`That file is ${formatBytes(file.size)}. Keep it under 2 MB, or paste the text instead.`);
      return;
    }
    try {
      const data = await readAsBase64(file);
      removeFile(true);
      attached = {
        name: file.name,
        size: file.size,
        mediaType,
        data,
        previewUrl: mediaType === 'image/jpeg' ? URL.createObjectURL(file) : null,
      };
      renderFile();
    } catch (err) {
      showError(err.message);
    }
  }

  function renderFile() {
    el.fileThumb.textContent = '';
    if (attached) {
      if (attached.previewUrl) {
        const img = document.createElement('img');
        img.src = attached.previewUrl;
        img.alt = '';
        el.fileThumb.append(img);
      } else {
        el.fileThumb.textContent = 'PDF';
      }
      el.fileName.textContent = attached.name;
      el.fileSize.textContent = `${FILE_TYPES[attached.mediaType]}, ${formatBytes(attached.size)}`;
    }
    el.fileCard.hidden = !attached;
    el.dropInner.hidden = Boolean(attached);
    updateInputMeta();
  }

  function removeFile(silent) {
    if (attached?.previewUrl) URL.revokeObjectURL(attached.previewUrl);
    attached = null;
    el.fileInput.value = '';
    if (!silent) {
      renderFile();
      el.dropInner.focus();
    }
  }

  function showError(message) {
    el.error.textContent = message;
    el.error.hidden = false;
  }

  function clearError() {
    el.error.hidden = true;
    el.error.textContent = '';
  }

  function startStatusCycle() {
    let i = 0;
    el.statusText.textContent = STATUS_LINES[0];
    statusTimer = setInterval(() => {
      i = (i + 1) % STATUS_LINES.length;
      el.statusText.classList.add('is-swapping');
      setTimeout(() => {
        el.statusText.textContent = STATUS_LINES[i];
        el.statusText.classList.remove('is-swapping');
      }, 250);
    }, 2200);
  }

  function stopStatusCycle() {
    clearInterval(statusTimer);
    statusTimer = null;
  }

  /* ---------------- API ---------------- */

  async function requestRoast(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch('/api/roast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        /* non-JSON response, handled below */
      }

      if (!res.ok) {
        throw new Error(data?.error || `The server returned an error (${res.status}). Try again.`);
      }
      if (!data || typeof data.score !== 'number' || !data.roast || !Array.isArray(data.fixes)) {
        throw new Error('The roast came back in an unexpected shape. Try again.');
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('The roast took too long. Try again.');
      }
      if (err instanceof TypeError) {
        throw new Error('Couldn’t reach the server. Check your connection and try again.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function handleRoast() {
    if (el.roastBtn.disabled || el.body.dataset.state === 'loading') return;

    const role = el.role.value.trim();
    const payload = {
      role,
      jobDescription: el.jd.value.trim(),
      resume: mode === 'text' ? el.textarea.value.trim() : '',
      file: mode === 'file' && attached ? { name: attached.name, mediaType: attached.mediaType, data: attached.data } : null,
    };

    clearError();
    setState('loading');
    startStatusCycle();
    const rect = el.field.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      el.field.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }

    try {
      const result = await requestRoast(payload);
      stopStatusCycle();
      lastResult = { ...result, role, hasJd: Boolean(payload.jobDescription) };
      await swapView(el.viewInput, el.viewResult);
      setState('result');
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      renderResult(lastResult);
      $('#result-title').focus({ preventScroll: true });
    } catch (err) {
      stopStatusCycle();
      setState('idle');
      showError(err.message);
    }
  }

  /* ---------------- Result rendering ---------------- */

  function tierFor(score) {
    if (score < 50) return 'low';
    if (score < 75) return 'mid';
    return 'high';
  }

  function verdictFor(score) {
    if (score < 30) return 'Most ATS filters will bin this before a human sees it.';
    if (score < 50) return 'An ATS will struggle with this. Start with fix number one.';
    if (score < 65) return 'It parses, but it won’t rank. The fixes below close the gap.';
    if (score < 80) return 'Solid base. A few edits and this starts beating the pile.';
    if (score < 90) return 'Strong. You’re polishing now, not rebuilding.';
    return 'Excellent. The roaster had to work for that one.';
  }

  const ARROW_SVG =
    '<svg class="lang-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';

  function renderExtras({ missingKeywords = [], languageIssues = [], hasJd }) {
    el.keywordList.textContent = '';
    el.keywordsBlock.hidden = missingKeywords.length === 0;
    el.keywordsHint.textContent = hasJd
      ? 'Skills and terms the job description asks for that your resume doesn’t show.'
      : 'Core skills for this role that your resume doesn’t show.';
    missingKeywords.forEach((k) => {
      const li = document.createElement('li');
      li.textContent = k;
      el.keywordList.append(li);
    });

    el.langList.textContent = '';
    el.langClean.hidden = languageIssues.length > 0;
    const labels = { spelling: 'Spelling', grammar: 'Grammar', punctuation: 'Punctuation' };
    languageIssues.forEach((issue) => {
      const li = document.createElement('li');
      const type = document.createElement('span');
      type.className = 'lang-type';
      type.dataset.type = issue.type;
      type.textContent = labels[issue.type] || 'Grammar';
      const change = document.createElement('span');
      change.className = 'lang-change';
      const from = document.createElement('del');
      from.className = 'lang-from';
      from.textContent = issue.original;
      const to = document.createElement('ins');
      to.className = 'lang-to';
      to.style.textDecoration = 'none';
      to.textContent = issue.suggestion;
      change.append(from);
      change.insertAdjacentHTML('beforeend', ARROW_SVG);
      change.append(to);
      li.append(type, change);
      el.langList.append(li);
    });
  }

  function renderResult({ score, roast, fixes, role, hasJd, missingKeywords, languageIssues }) {
    const id = ++runId;

    el.card.dataset.tier = tierFor(score);
    el.gauge.setAttribute('aria-label', `ATS compatibility score: ${score} out of 100`);
    el.verdict.textContent = verdictFor(score);
    el.targetLine.textContent = `For ${role}`;
    const basis = document.createElement('span');
    basis.textContent = hasJd ? 'Scored against your job description' : 'Scored for the role in general. Add a job description for a sharper match.';
    el.targetLine.append(basis);
    renderExtras({ missingKeywords, languageIssues, hasJd });
    [el.keywordsBlock, el.langBlock].forEach((b) => b.classList.remove('is-in'));
    el.verdict.classList.remove('is-in');
    el.roast.textContent = '';
    el.fixList.textContent = '';
    el.fixList.parentElement.classList.remove('is-in');

    fixes.forEach((fix, i) => {
      const li = document.createElement('li');
      li.className = 'fix';
      li.style.setProperty('--delay', `${i * 140}ms`);
      const title = document.createElement('p');
      title.className = 'fix-title';
      title.textContent = fix.title;
      const detail = document.createElement('p');
      detail.className = 'fix-detail';
      detail.textContent = fix.detail;
      li.append(title, detail);
      el.fixList.append(li);
    });

    animateGauge(score, id);
    requestAnimationFrame(() => el.verdict.classList.add('is-in'));

    typeRoast(roast, id).then(() => {
      if (id !== runId) return;
      el.fixList.parentElement.classList.add('is-in');
      el.fixList.querySelectorAll('.fix').forEach((node) => node.classList.add('is-in'));
      el.keywordsBlock.style.setProperty('--delay', '480ms');
      el.langBlock.style.setProperty('--delay', '660ms');
      [el.keywordsBlock, el.langBlock].forEach((b) => b.classList.add('is-in'));
    });
  }

  function animateGauge(score, id) {
    const target = GAUGE_CIRCUMFERENCE * (1 - score / 100);

    if (reduceMotion.matches) {
      el.gaugeFill.style.strokeDashoffset = String(target);
      el.gaugeNum.textContent = String(score);
      return;
    }

    const duration = 1500;
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 4);

    el.gaugeFill.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE);
    el.gaugeNum.textContent = '0';

    const frame = (now) => {
      if (id !== runId) return;
      const t = Math.min(1, (now - start) / duration);
      const p = ease(t);
      el.gaugeFill.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE - (GAUGE_CIRCUMFERENCE - target) * p);
      el.gaugeNum.textContent = String(Math.round(score * p));
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function splitSentences(text) {
    const parts = text.match(/[^.!?]+(?:[.!?]+["'”’)\]]*)\s*|[^.!?]+$/g);
    return parts ? parts.map((s) => s.trim()).filter(Boolean) : [text];
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function typeRoast(text, id) {
    const sentences = splitSentences(text);

    if (reduceMotion.matches) {
      el.roast.textContent = sentences.join(' ');
      return;
    }

    const caret = document.createElement('span');
    caret.className = 'caret';
    caret.setAttribute('aria-hidden', 'true');
    el.roast.append(caret);

    // Screen readers get the full text once; the typing is decorative.
    const srText = document.createElement('span');
    srText.className = 'sr-only';
    srText.textContent = text;
    el.roast.prepend(srText);

    await wait(450);
    for (let s = 0; s < sentences.length; s++) {
      const line = document.createElement('span');
      line.className = 'roast-line';
      line.setAttribute('aria-hidden', 'true');
      el.roast.insertBefore(line, caret);
      const sentence = (s > 0 ? ' ' : '') + sentences[s];

      for (let c = 0; c < sentence.length; c++) {
        if (id !== runId) return;
        line.textContent += sentence[c];
        await wait(sentence[c] === ',' ? 90 : 11);
      }
      if (id !== runId) return;
      await wait(320); // beat between lines
    }
    caret.remove();
  }

  /* ---------------- Actions ---------------- */

  async function roastAgain() {
    runId++;
    clearError();
    await swapView(el.viewResult, el.viewInput);
    setState('idle');
    el.role.focus();
  }

  async function copyResult() {
    if (!lastResult) return;
    const { score, roast, fixes, role, missingKeywords = [], languageIssues = [] } = lastResult;
    const lines = [
      `Resume Roast AI: ATS score ${score}/100 for ${role}`,
      '',
      roast,
      '',
      'Fix these first:',
      ...fixes.map((f, i) => `${i + 1}. ${f.title}: ${f.detail}`),
    ];
    if (missingKeywords.length) lines.push('', `Missing keywords: ${missingKeywords.join(', ')}`);
    lines.push('', 'Spelling and grammar:');
    if (languageIssues.length) {
      languageIssues.forEach((i) => lines.push(`- ${i.original} -> ${i.suggestion} (${i.type})`));
    } else {
      lines.push('- No mistakes found');
    }
    const text = lines.join('\n');

    try {
      await navigator.clipboard.writeText(text);
      el.copyLabel.textContent = 'Copied';
    } catch {
      el.copyLabel.textContent = 'Copy failed';
    }
    setTimeout(() => (el.copyLabel.textContent = 'Copy result'), 1800);
  }

  /* ---------------- Events ---------------- */

  [el.textarea, el.role, el.jd].forEach((input) =>
    input.addEventListener('input', () => {
      updateInputMeta();
      if (!el.error.hidden) clearError();
    }),
  );

  [el.textarea, el.role, el.jd].forEach((input) =>
    input.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRoast();
      }
    }),
  );

  el.role.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      el.jd.focus();
    }
  });

  el.modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  el.dropInner.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', () => attachFile(el.fileInput.files[0]));
  el.fileRemove.addEventListener('click', () => removeFile(false));

  ['dragenter', 'dragover'].forEach((type) =>
    el.field.addEventListener(type, (e) => {
      if (el.body.dataset.state === 'loading') return;
      e.preventDefault();
      if (mode !== 'file') setMode('file');
      el.field.classList.add('is-dragging');
    }),
  );
  ['dragleave', 'drop'].forEach((type) =>
    el.field.addEventListener(type, (e) => {
      if (type === 'dragleave' && el.field.contains(e.relatedTarget)) return;
      el.field.classList.remove('is-dragging');
    }),
  );
  el.field.addEventListener('drop', (e) => {
    if (el.body.dataset.state === 'loading') return;
    e.preventDefault();
    attachFile(e.dataTransfer?.files?.[0]);
  });

  el.sampleBtn.addEventListener('click', () => {
    el.role.value = SAMPLE_ROLE;
    el.jd.value = SAMPLE_JD;
    el.textarea.value = SAMPLE_RESUME;
    setMode('text');
    el.textarea.scrollTop = 0;
    el.jd.scrollTop = 0;
    el.roastBtn.focus();
  });

  el.clearBtn.addEventListener('click', () => {
    el.role.value = '';
    el.jd.value = '';
    el.textarea.value = '';
    removeFile(false);
    setMode('text');
    el.role.focus();
  });

  el.roastBtn.addEventListener('click', handleRoast);
  el.againBtn.addEventListener('click', roastAgain);
  el.copyBtn.addEventListener('click', copyResult);

  updateInputMeta();

  /* ---------------- Particles ---------------- */

  (function particles() {
    const canvas = document.getElementById('particles');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dots = [];
    let raf = null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(70, (w * h) / 22000));
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.4 + 0.3,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -(Math.random() * 0.25 + 0.05),
        phase: Math.random() * Math.PI * 2,
        hue: Math.random() < 0.6 ? 265 : 188,
      }));
    }

    function draw(t) {
      const speed = document.body.dataset.state === 'loading' ? 3.2 : 1;
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.x += d.vx * speed;
        d.y += d.vy * speed;
        if (d.y < -4) { d.y = h + 4; d.x = Math.random() * w; }
        if (d.x < -4) d.x = w + 4;
        if (d.x > w + 4) d.x = -4;
        const alpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t / 900 + d.phase));
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${d.hue}, 100%, 75%, ${alpha})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    }

    function start() {
      if (raf || reduceMotion.matches || document.hidden) return;
      raf = requestAnimationFrame(draw);
    }

    function stop() {
      cancelAnimationFrame(raf);
      raf = null;
    }

    resize();
    start();
    window.addEventListener('resize', () => { resize(); });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    reduceMotion.addEventListener?.('change', () => {
      if (reduceMotion.matches) { stop(); ctx.clearRect(0, 0, w, h); } else start();
    });
  })();
})();
