-- Users profile (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  name TEXT,
  age INTEGER,
  sex TEXT,
  weight_kg DECIMAL,
  conditions TEXT[],
  daily_target_mg INTEGER DEFAULT 200,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Blood test results
CREATE TABLE blood_tests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  total_cholesterol INTEGER,
  ldl INTEGER,
  hdl INTEGER,
  test_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Logged meals
CREATE TABLE meals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  meal_name TEXT NOT NULL,
  total_cholesterol_mg INTEGER,
  risk_score TEXT CHECK (risk_score IN ('low','medium','high')),
  photo_url TEXT,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ingredients per meal
CREATE TABLE meal_ingredients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meal_id UUID REFERENCES meals(id) ON DELETE CASCADE,
  name TEXT,
  level TEXT CHECK (level IN ('low','medium','high')),
  cholesterol_mg INTEGER,
  serving TEXT,
  ldl_impact TEXT,
  hdl_impact TEXT,
  substitute TEXT
);

-- Ingredient lookup cache (shared across all users)
CREATE TABLE ingredient_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name_key TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can only access their own data)
CREATE POLICY "Users own profile" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users own blood tests" ON blood_tests FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own meals" ON meals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own meal ingredients" ON meal_ingredients
  FOR ALL USING (
    meal_id IN (SELECT id FROM meals WHERE user_id = auth.uid())
  );

-- Cache is readable by all authenticated users, writable by service role only
CREATE POLICY "Cache readable by all" ON ingredient_cache
  FOR SELECT USING (auth.role() = 'authenticated');
