import { useState } from 'react';
import { Icon } from '../lib/icons.jsx';
import { Button, Card, Field, inputCls } from '../lib/ui.jsx';
import { recommendTarget } from '../lib/api.js';

const CONDITIONS = ['High cholesterol', 'Heart disease', 'Diabetes', 'Hypertension'];

export default function Profile({ profile, limit, conditions, onSave }) {
  const [form, setForm] = useState({
    name: profile.name || '',
    age: profile.age || '',
    sex: profile.sex || '',
    weight: profile.weight || '',
    total: profile.total || '',
    ldl: profile.ldl || '',
    hdl: profile.hdl || '',
    testdate: profile.testdate || '',
  });
  const [localConditions, setLocalConditions] = useState(conditions);
  const [target, setTarget] = useState(limit);
  const [msg, setMsg] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function toggleCondition(c) {
    setLocalConditions((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function save() {
    setSaving(true);
    setMsg('Saving…');
    try {
      await onSave(form, localConditions, target ? parseInt(target) : limit);
      setMsg('Profile saved.');
    } catch (err) {
      setMsg(`Could not save: ${err.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(''), 2500);
    }
  }

  async function autoTarget() {
    setCalculating(true);
    setMsg('Calculating…');
    try {
      const r = await recommendTarget({
        age: form.age,
        sex: form.sex,
        conditions: localConditions,
        ldl: form.ldl,
        hdl: form.hdl,
      });
      setTarget(r.limit_mg);
      setMsg(`Recommended: ${r.limit_mg}mg/day — ${r.reason}`);
    } catch {
      setMsg('Could not calculate. Set manually.');
    } finally {
      setCalculating(false);
    }
  }

  return (
    <div className="px-4 pt-3.5 pb-21">
      <Card title="Personal details">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Name">
            <input className={inputCls} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Your name" />
          </Field>
          <Field label="Age">
            <input className={inputCls} type="number" min="1" max="120" value={form.age} onChange={(e) => update('age', e.target.value)} placeholder="Years" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Sex">
            <select className={inputCls} value={form.sex} onChange={(e) => update('sex', e.target.value)}>
              <option value="">Select</option>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </select>
          </Field>
          <Field label="Weight (kg)">
            <input className={inputCls} type="number" value={form.weight} onChange={(e) => update('weight', e.target.value)} placeholder="kg" />
          </Field>
        </div>
        <Field label="Health conditions">
          <div className="flex flex-wrap gap-2 mt-1.5">
            {CONDITIONS.map((c) => (
              <label key={c} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-black/20 text-[13px] cursor-pointer bg-white">
                <input type="checkbox" checked={localConditions.includes(c)} onChange={() => toggleCondition(c)} className="accent-emerald-600" /> {c}
              </label>
            ))}
          </div>
        </Field>
      </Card>

      <Card title="Last blood test">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Total chol. (mg/dL)">
            <input className={inputCls} type="number" value={form.total} onChange={(e) => update('total', e.target.value)} placeholder="e.g. 195" />
          </Field>
          <Field label="LDL (mg/dL)">
            <input className={inputCls} type="number" value={form.ldl} onChange={(e) => update('ldl', e.target.value)} placeholder="e.g. 120" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="HDL (mg/dL)">
            <input className={inputCls} type="number" value={form.hdl} onChange={(e) => update('hdl', e.target.value)} placeholder="e.g. 55" />
          </Field>
          <Field label="Test date">
            <input className={inputCls} type="date" value={form.testdate} onChange={(e) => update('testdate', e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Daily target">
        <div className="flex gap-2.5 items-center">
          <input className={inputCls} style={{ maxWidth: 110 }} type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="200" />
          <span className="text-sm text-gray-500">mg / day</span>
        </div>
        <div className="mt-2.5">
          <Button size="sm" onClick={autoTarget} disabled={calculating}>
            <Icon name="sparkles" size={14} /> Auto-recommend
          </Button>
        </div>
      </Card>

      <div className="mb-3">
        <Button variant="primary" full onClick={save} disabled={saving}>
          <Icon name="save" size={16} /> Save profile
        </Button>
      </div>
      {msg && <div className="text-[13px] text-emerald-700 py-2">{msg}</div>}

      <Card title="Reference ranges">
        <div className="grid grid-cols-3 gap-2">
          <RefTile val="<200" label="Total" />
          <RefTile val="<100" label="LDL" />
          <RefTile val=">40" label="HDL" />
        </div>
      </Card>
    </div>
  );
}

function RefTile({ val, label }) {
  return (
    <div className="bg-gray-50 rounded-lg px-2.5 py-3 text-center">
      <div className="text-lg font-medium text-[#0F6E56]">{val}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
      <div className="text-[10px] text-gray-400 mt-0.5">mg/dL</div>
    </div>
  );
}
