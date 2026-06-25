const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

function headers() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  };
}

function parseJson(raw) {
  return JSON.parse(raw.replace(/```json|```/g, '').trim());
}

async function send(body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Anthropic API error (${res.status})`);
  }
  const text = data.content?.[0]?.text || '';
  return parseJson(text);
}

export async function askAI(systemPrompt, prompt) {
  return send({
    model: MODEL,
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
  });
}

export async function askAIVision(base64, mediaType, systemPrompt, prompt) {
  return send({
    model: MODEL,
    max_tokens: 1000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
}
