import { Router } from 'express';
import { askAIVision } from '../lib/anthropic.js';

const router = Router();

router.post('/analyse-photo', async (req, res) => {
  const { image, mimeType } = req.body || {};
  if (!image || !mimeType) {
    return res.status(400).json({ error: 'image and mimeType are required' });
  }

  try {
    const system =
      'You are a cholesterol nutrition expert analysing a photo of a meal. ' +
      'Respond ONLY with valid JSON, no preamble or markdown fences, matching this shape: ' +
      '{"mealName": string, "ingredients": [{"name": string, "level": "low"|"medium"|"high", "cholesterol_mg": number, "serving": string, "ldl_impact": string, "hdl_impact": string, "substitute": string}], "totalCholesterol_mg": number, "riskScore": "low"|"medium"|"high", "riskExplanation": string}';
    const result = await askAIVision(image, mimeType, system, 'Identify this meal and estimate its cholesterol content.');
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
