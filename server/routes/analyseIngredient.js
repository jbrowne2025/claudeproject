import { Router } from 'express';
import { askAI } from '../lib/anthropic.js';
import { supabase } from '../lib/supabase.js';

const router = Router();

function cacheKey(name) {
  return name.trim().toLowerCase();
}

router.post('/analyse-ingredient', async (req, res) => {
  const { name } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const key = cacheKey(name);

  try {
    const { data: cached } = await supabase
      .from('ingredient_cache')
      .select('data')
      .eq('name_key', key)
      .maybeSingle();

    if (cached) {
      return res.json(cached.data);
    }

    const system =
      'You are a cholesterol nutrition expert. Respond ONLY with valid JSON, no preamble or markdown fences, ' +
      'matching this shape: {"name": string, "level": "low"|"medium"|"high", "cholesterol_mg": number, "serving": string, ' +
      '"ldl_impact": string, "hdl_impact": string, "substitute": string}';
    const result = await askAI(system, `Analyse this ingredient/food: ${name}`);

    await supabase.from('ingredient_cache').insert({ name_key: key, data: result });

    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
