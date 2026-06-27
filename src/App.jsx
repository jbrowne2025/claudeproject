import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { getProfile, getLatestBloodTest, getMeals, addMeal, uploadMealPhoto, upsertProfile, addBloodTest } from './lib/db.js';
import AuthScreen from './components/Auth/AuthScreen.jsx';
import TopBar from './components/TopBar.jsx';
import BottomNav from './components/BottomNav.jsx';
import Dashboard from './components/Dashboard.jsx';
import LogMeal from './components/LogMeal.jsx';
import Lookup from './components/Lookup.jsx';
import History from './components/History.jsx';
import Plans from './components/Plans.jsx';
import Profile from './components/Profile.jsx';
import Tips from './components/Tips.jsx';

function weeklyFromMeals(meals) {
  const weekly = [0, 0, 0, 0, 0, 0, 0];
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const m of meals) {
    const t = m.loggedAt ? new Date(m.loggedAt).getTime() : 0;
    if (t >= cutoff) {
      const day = new Date(m.loggedAt).getDay();
      weekly[day] += m.totalCholesterol_mg || 0;
    }
  }
  return weekly;
}

export default function App() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [meals, setMeals] = useState([]);
  const [profile, setProfile] = useState({});
  const [limit, setLimit] = useState(200);
  const [conditions, setConditions] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setDataLoading(true);
    (async () => {
      const [profileRow, bloodTest, mealRows] = await Promise.all([
        getProfile(user.id),
        getLatestBloodTest(user.id),
        getMeals(user.id),
      ]);
      if (!active) return;
      setProfile({
        name: profileRow?.name || '',
        age: profileRow?.age || '',
        sex: profileRow?.sex || '',
        weight: profileRow?.weight_kg || '',
        total: bloodTest?.total_cholesterol || '',
        ldl: bloodTest?.ldl || '',
        hdl: bloodTest?.hdl || '',
        testdate: bloodTest?.test_date || '',
      });
      setLimit(profileRow?.daily_target_mg || 200);
      setConditions(profileRow?.conditions || []);
      setMeals(mealRows);
      setDataLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const weekly = useMemo(() => weeklyFromMeals(meals), [meals]);

  async function logMeal(meal, photoFile) {
    const photoUrl = photoFile ? await uploadMealPhoto(user.id, photoFile) : null;
    const saved = await addMeal(user.id, meal, photoUrl);
    setMeals((prev) => [
      { ...meal, id: saved.id, loggedAt: saved.logged_at, date: saved.logged_at.slice(0, 10), photoUrl },
      ...prev,
    ]);
  }

  async function saveProfile(form, newConditions, newLimit) {
    await upsertProfile(user.id, {
      name: form.name,
      age: form.age,
      sex: form.sex,
      weight: form.weight,
      dailyTargetMg: newLimit,
      conditions: newConditions,
    });
    if (form.total || form.ldl || form.hdl) {
      await addBloodTest(user.id, form);
    }
    setProfile(form);
    setConditions(newConditions);
    setLimit(newLimit);
  }

  if (loading || (user && dataLoading)) {
    return <div className="max-w-[430px] mx-auto min-h-screen bg-[#f5f5f2]" />;
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="max-w-[430px] mx-auto bg-[#f5f5f2] min-h-screen text-[15px] text-gray-900 leading-relaxed">
      <h2 className="sr-only">Cholesterol meal tracker</h2>
      <TopBar active={tab} onProfile={() => setTab('profile')} />

      {tab === 'dashboard' && <Dashboard meals={meals} profile={profile} limit={limit} weekly={weekly} onNavigate={setTab} />}
      {tab === 'log' && <LogMeal onLogMeal={logMeal} onDone={() => setTab('history')} />}
      {tab === 'lookup' && <Lookup />}
      {tab === 'history' && <History meals={meals} />}
      {tab === 'plans' && <Plans />}
      {tab === 'profile' && (
        <Profile profile={profile} limit={limit} conditions={conditions} onSave={saveProfile} />
      )}
      {tab === 'tips' && <Tips />}

      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
