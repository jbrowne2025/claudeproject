import { supabase } from './supabase.js';

const API_URL = import.meta.env.VITE_API_URL;

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function post(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function analysePhoto(image, mimeType) {
  return post('/api/analyse-photo', { image, mimeType });
}

export function analyseIngredient(name) {
  return post('/api/analyse-ingredient', { name });
}

export function lookup(query) {
  return post('/api/lookup', { query });
}

export function recommendTarget({ age, sex, conditions, ldl, hdl }) {
  return post('/api/recommend-target', { age, sex, conditions, ldl, hdl });
}
