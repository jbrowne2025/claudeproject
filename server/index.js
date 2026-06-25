import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { requireAuth } from './middleware/auth.js';
import analysePhotoRoute from './routes/analysePhoto.js';
import analyseIngredientRoute from './routes/analyseIngredient.js';
import lookupRoute from './routes/lookup.js';
import recommendTargetRoute from './routes/recommendTarget.js';

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json({ limit: '10mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter, requireAuth);
app.use('/api', analysePhotoRoute);
app.use('/api', analyseIngredientRoute);
app.use('/api', lookupRoute);
app.use('/api', recommendTargetRoute);

app.get('/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API listening on port ${port}`));
