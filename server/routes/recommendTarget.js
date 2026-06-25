import { Router } from 'express';
import { askAI } from '../lib/anthropic.js';

const router = Router();

router.post('/recommend-target', async (req, res) => {
  const { age, sex, conditions = [], ldl, hdl } = req.body || {};
  if (!age || !sex) {
    return res.status(400).json({ error: 'age and sex are required' });
  }

  try {
    const system =
      'You are a cholesterol nutrition expert. Respond ONLY with valid JSON, no preamble or markdown fences, ' +
      'matching this shape: {"limit_mg": number, "reason": string}';
    const prompt = `Recommend a safe daily dietary cholesterol limit in mg for a person with: age ${age}, sex ${sex}, ` +
      `conditions: ${conditions.length ? conditions.join(', ') : 'none'}, LDL: ${ldl ?? 'unknown'}, HDL: ${hdl ?? 'unknown'}.`;
    const result = await askAI(system, prompt);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
