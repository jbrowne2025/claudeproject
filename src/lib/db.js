import { supabase } from './supabase.js';

export async function getProfile(userId) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return data;
}

export async function upsertProfile(userId, { name, age, sex, weight, dailyTargetMg, conditions }) {
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    name: name || null,
    age: age ? parseInt(age) : null,
    sex: sex || null,
    weight_kg: weight ? parseFloat(weight) : null,
    daily_target_mg: dailyTargetMg ? parseInt(dailyTargetMg) : 200,
    conditions: conditions || [],
  });
  if (error) throw error;
}

export async function getLatestBloodTest(userId) {
  const { data } = await supabase
    .from('blood_tests')
    .select('*')
    .eq('user_id', userId)
    .order('test_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function addBloodTest(userId, { total, ldl, hdl, testdate }) {
  const { error } = await supabase.from('blood_tests').insert({
    user_id: userId,
    total_cholesterol: total ? parseInt(total) : null,
    ldl: ldl ? parseInt(ldl) : null,
    hdl: hdl ? parseInt(hdl) : null,
    test_date: testdate || null,
  });
  if (error) throw error;
}

export async function getMeals(userId) {
  const { data, error } = await supabase
    .from('meals')
    .select('*, meal_ingredients(*)')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((m) => ({
    id: m.id,
    mealName: m.meal_name,
    totalCholesterol_mg: m.total_cholesterol_mg,
    riskScore: m.risk_score,
    photoUrl: m.photo_url,
    loggedAt: m.logged_at,
    date: m.logged_at?.slice(0, 10),
    time: m.logged_at ? new Date(m.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
    ingredients: (m.meal_ingredients || []).map((i) => ({
      name: i.name,
      level: i.level,
      cholesterol_mg: i.cholesterol_mg,
      serving: i.serving,
      ldl_impact: i.ldl_impact,
      hdl_impact: i.hdl_impact,
      substitute: i.substitute,
    })),
  }));
}

export async function addMeal(userId, meal, photoUrl) {
  const { data: mealRow, error } = await supabase
    .from('meals')
    .insert({
      user_id: userId,
      meal_name: meal.mealName,
      total_cholesterol_mg: meal.totalCholesterol_mg,
      risk_score: meal.riskScore,
      photo_url: photoUrl || null,
    })
    .select()
    .single();
  if (error) throw error;

  if (meal.ingredients?.length) {
    const rows = meal.ingredients.map((i) => ({
      meal_id: mealRow.id,
      name: i.name,
      level: i.level,
      cholesterol_mg: i.cholesterol_mg,
      serving: i.serving,
      ldl_impact: i.ldl_impact,
      hdl_impact: i.hdl_impact,
      substitute: i.substitute,
    }));
    const { error: ingErr } = await supabase.from('meal_ingredients').insert(rows);
    if (ingErr) throw ingErr;
  }

  return mealRow;
}

export async function uploadMealPhoto(userId, file) {
  const ext = file.name?.split('.').pop() || 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('meal-photos').upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from('meal-photos').getPublicUrl(path);
  return data.publicUrl;
}
