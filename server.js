const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENROUTER_KEY || process.env.OPENAI_KEY;

app.use(cors({
  origin: [
    'https://studyai-frontend-mauve.vercel.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000'
  ]
}));
app.use(express.json({ limit: '2mb' }));

app.get('/', (req, res) => {
  res.json({ status: 'StudyAI Backend läuft ✓' });
});

app.post('/api/analyze', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'API Key nicht konfiguriert' });
  }

  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Kein Prompt übergeben' });
  }

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
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || `API Fehler ${response.status}`;
      if (response.status === 401) return res.status(401).json({ error: 'API Key ungültig.' });
      if (response.status === 429) return res.status(429).json({ error: 'Zu viele Anfragen. Bitte warte kurz.' });
      return res.status(response.status).json({ error: msg });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    res.json({ result: content });

  } catch (err) {
    console.error('Backend Fehler:', err);
    res.status(500).json({ error: 'Serverfehler: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`StudyAI Backend läuft auf Port ${PORT}`);
});
