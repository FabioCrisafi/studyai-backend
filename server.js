const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENROUTER_KEY || process.env.OPENAI_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET = process.env.SUPABASE_SECRET;

app.use(cors({
  origin: [
    'https://studyai-frontend-mauve.vercel.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000'
  ]
}));
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => {
  res.json({ status: 'StudyAI Backend läuft ✓' });
});

// ── AI Analyse ────────────────────────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  if (!API_KEY) return res.status(500).json({ error: 'API Key nicht konfiguriert' });
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Kein Prompt übergeben' });

  const isOpenAI = API_KEY.startsWith('sk-') && !API_KEY.startsWith('sk-or-');
  const endpoint = isOpenAI
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';
  const model = isOpenAI ? 'gpt-4o-mini' : 'meta-llama/llama-3.3-70b-instruct:free';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
  };
  if (!isOpenAI) {
    headers['HTTP-Referer'] = 'https://studyai-frontend-mauve.vercel.app';
    headers['X-Title'] = 'StudyAI';
  }
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || `API Fehler ${response.status}`;
      if (response.status === 401) return res.status(401).json({ error: 'API Key ungültig.' });
      if (response.status === 429) return res.status(429).json({ error: 'Zu viele Anfragen. Bitte warte kurz.' });
      return res.status(response.status).json({ error: msg });
    }
    const data = await response.json();
    res.json({ result: data.choices?.[0]?.message?.content || '' });
  } catch (err) {
    res.status(500).json({ error: 'Serverfehler: ' + err.message });
  }
});

// ── Supabase Proxy (Secret Key bleibt sicher im Backend) ─────────────────────
app.all('/api/db/*', async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SECRET) {
    return res.status(500).json({ error: 'Supabase nicht konfiguriert' });
  }

  // Pfad nach /api/db/ weitergeben an Supabase REST API
  const supabasePath = req.params[0];
  const url = `${SUPABASE_URL}/rest/v1/${supabasePath}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;

  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_SECRET,
    'Authorization': `Bearer ${SUPABASE_SECRET}`,
    'Prefer': req.headers['prefer'] || '',
  };

  // User-JWT vom Frontend weiterleiten für RLS
  if (req.headers['x-user-token']) {
    headers['Authorization'] = `Bearer ${req.headers['x-user-token']}`;
    headers['apikey'] = process.env.SUPABASE_ANON || SUPABASE_SECRET;
  }

  try {
    const fetchOptions = {
      method: req.method,
      headers,
    };
    if (['POST', 'PATCH', 'PUT'].includes(req.method) && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'DB Fehler: ' + err.message });
  }
});

// ── Supabase Auth Proxy ───────────────────────────────────────────────────────
app.post('/api/auth/:action', async (req, res) => {
  if (!SUPABASE_URL) return res.status(500).json({ error: 'Supabase nicht konfiguriert' });

  const action = req.params.action;
  const anonKey = process.env.SUPABASE_ANON || SUPABASE_SECRET;

  const authEndpoints = {
    'signup': '/auth/v1/signup',
    'login': '/auth/v1/token?grant_type=password',
    'logout': '/auth/v1/logout',
    'refresh': '/auth/v1/token?grant_type=refresh_token',
  };

  const path = authEndpoints[action];
  if (!path) return res.status(400).json({ error: 'Unbekannte Auth-Aktion' });

  try {
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': req.headers['authorization'] || `Bearer ${anonKey}`,
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Auth Fehler: ' + err.message });
  }
});

app.listen(PORT, () => console.log(`StudyAI Backend läuft auf Port ${PORT}`));
