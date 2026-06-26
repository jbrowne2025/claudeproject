// One-off script to pre-populate ingredient_cache with common foods.
// Run with: node scripts/seedIngredients.js
import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { INGREDIENTS, toLookupShape } from '../data/ingredientSeed.js';

function cacheKey(name) {
  return name.trim().toLowerCase();
}

async function run() {
  const rows = [];
  for (const item of INGREDIENTS) {
    rows.push({ name_key: cacheKey(item.name), data: item });
    rows.push({ name_key: `lookup:${cacheKey(item.name)}`, data: toLookupShape(item) });
  }

  const { error, count } = await supabase
    .from('ingredient_cache')
    .upsert(rows, { onConflict: 'name_key', count: 'exact' });

  if (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }

  console.log(`Seeded ${rows.length} ingredient_cache rows (${INGREDIENTS.length} ingredients x 2 key formats).`);
}

run();
