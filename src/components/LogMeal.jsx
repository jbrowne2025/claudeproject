import { useState, useRef } from 'react';
import { Icon } from '../lib/icons.jsx';
import { Button, Field, inputCls, AiLoading, AiError, LevelBadge, RiskPill } from '../lib/ui.jsx';
import { analysePhoto, analyseIngredient } from '../lib/api.js';
import { todayStr, nowStr } from '../lib/date.js';

export default function LogMeal({ onLogMeal, onDone }) {
  const [mode, setMode] = useState('photo');
  const [imgSrc, setImgSrc] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoResult, setPhotoResult] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const fileRef = useRef(null);

  const [mealName, setMealName] = useState('');
  const [ingInput, setIngInput] = useState('');
  const [manualIngs, setManualIngs] = useState([]);
  const [ingLoading, setIngLoading] = useState(false);

  async function handlePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      setImgSrc(ev.target.result);
      setPhotoFile(file);
      setPhotoResult(null);
      setPhotoError('');
      setPhotoLoading(true);
      try {
        const b64 = ev.target.result.split(',')[1];
        const d = await analysePhoto(b64, file.type || 'image/jpeg');
        setPhotoResult(d);
      } catch {
        setPhotoError('Could not analyse image. Try manual entry.');
      } finally {
        setPhotoLoading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function savePhotoResult() {
    await onLogMeal({ ...photoResult, time: nowStr(), date: todayStr() }, photoFile);
    setImgSrc(null);
    setPhotoFile(null);
    setPhotoResult(null);
    if (fileRef.current) fileRef.current.value = '';
    onDone();
  }

  async function addManualIng() {
    const name = ingInput.trim();
    if (!name) return;
    setIngLoading(true);
    try {
      const d = await analyseIngredient(name);
      setManualIngs((prev) => [...prev, d]);
      setIngInput('');
    } catch {
      // ignore
    } finally {
      setIngLoading(false);
    }
  }

  function removeIng(idx) {
    setManualIngs((prev) => prev.filter((_, i) => i !== idx));
  }

  function clearManual() {
    setManualIngs([]);
    setMealName('');
    setIngInput('');
  }

  async function logManual() {
    if (!manualIngs.length) {
      alert('Add at least one ingredient.');
      return;
    }
    const total = manualIngs.reduce((s, i) => s + i.cholesterol_mg, 0);
    const h = manualIngs.filter((i) => i.level === 'high').length;
    await onLogMeal({
      mealName: mealName || 'Manual meal',
      ingredients: manualIngs,
      totalCholesterol_mg: total,
      riskScore: h >= 2 ? 'high' : h === 1 ? 'medium' : 'low',
      riskExplanation: '',
      time: nowStr(),
      date: todayStr(),
    });
    clearManual();
    onDone();
  }

  return (
    <div className="px-4 pt-3.5 pb-21">
      <div className="flex bg-gray-100 rounded-lg p-[3px] gap-[3px] mb-3.5">
        <ModeButton active={mode === 'photo'} onClick={() => setMode('photo')} icon="camera" label="Photo scan" />
        <ModeButton active={mode === 'manual'} onClick={() => setMode('manual')} icon="pencil" label="Manual entry" />
      </div>

      {mode === 'photo' && (
        <div>
          <div
            className="border-[1.5px] border-dashed border-black/20 rounded-xl py-7 px-4 text-center cursor-pointer bg-gray-50"
            onClick={() => fileRef.current?.click()}
          >
            <Icon name="camera" size={32} className="text-gray-300 block mx-auto mb-2" />
            <p className="text-sm text-gray-500">Tap to upload meal photo</p>
            <small className="text-xs text-gray-400 block mt-1">AI identifies ingredients &amp; rates cholesterol</small>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          {imgSrc && <img src={imgSrc} alt="Meal" className="w-full rounded-xl mb-3 mt-3" />}
          {photoLoading && <AiLoading text="Analysing your meal…" />}
          {photoError && <AiError text={photoError} />}
          {photoResult && <MealResultCard data={photoResult} onLog={savePhotoResult} />}
        </div>
      )}

      {mode === 'manual' && (
        <div>
          <Field label="Meal name">
            <input className={inputCls} type="text" value={mealName} onChange={(e) => setMealName(e.target.value)} placeholder="e.g. Scrambled eggs on toast" />
          </Field>
          <Field label="Add ingredient">
            <div className="flex gap-2">
              <input
                className={`${inputCls} flex-1`}
                type="text"
                value={ingInput}
                onChange={(e) => setIngInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addManualIng()}
                placeholder="e.g. egg, butter, cheese…"
              />
              <Button variant="primary" size="sm" onClick={addManualIng}>
                <Icon name="sparkles" size={14} />
              </Button>
            </div>
          </Field>
          {ingLoading && <AiLoading text={`Analysing ${ingInput || 'ingredient'}…`} />}
          {!!manualIngs.length && (
            <div className="flex flex-wrap gap-1.5 my-2">
              {manualIngs.map((i, idx) => (
                <div key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-black/20 bg-gray-50">
                  <LevelBadge level={i.level} /> {i.name}
                  <button onClick={() => removeIng(idx)} aria-label="Remove" className="bg-none border-none cursor-pointer p-0 leading-none text-gray-500 text-base">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {!!manualIngs.length && (
            <div className="bg-white border border-black/10 rounded-xl p-4 mt-1">
              {manualIngs.map((i, idx) => (
                <IngRow key={idx} ing={i} last={idx === manualIngs.length - 1} />
              ))}
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <Button variant="primary" className="flex-1" onClick={logManual}>
              <Icon name="check" size={16} /> Log meal
            </Button>
            <Button size="sm" onClick={clearManual}>
              <Icon name="x" size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 p-2 border-none rounded-md text-[13px] cursor-pointer flex items-center justify-center gap-1.5 transition-all ${
        active ? 'bg-white text-gray-900 border border-black/10' : 'bg-none text-gray-500'
      }`}
    >
      <Icon name={icon} size={15} /> {label}
    </button>
  );
}

function IngRow({ ing, last }) {
  return (
    <div className={`flex items-start justify-between gap-2 py-3 ${last ? '' : 'border-b border-black/10'}`}>
      <div className="flex-1">
        <div className="text-sm font-medium mb-0.5">{ing.name}</div>
        <div className="text-xs text-gray-500 leading-relaxed">
          {ing.serving} &bull; {ing.cholesterol_mg}mg &bull; LDL: {ing.ldl_impact}
        </div>
        {ing.substitute && (
          <div className="inline-flex items-center gap-1 bg-[#E1F5EE] text-[#085041] px-2 py-1 rounded-md text-xs mt-1.5">
            <Icon name="exchange" size={12} /> Swap: {ing.substitute}
          </div>
        )}
      </div>
      <LevelBadge level={ing.level} />
    </div>
  );
}

export function MealResultCard({ data, onLog }) {
  return (
    <div className="bg-white border border-black/10 rounded-xl p-4 mt-3">
      <div className="flex justify-between items-start mb-1">
        <div className="text-base font-medium">{data.mealName}</div>
        <RiskPill risk={data.riskScore} />
      </div>
      <div className="text-[13px] text-gray-500 mb-3">{data.riskExplanation}</div>
      {data.ingredients.map((i, idx) => (
        <IngRow key={idx} ing={i} last={idx === data.ingredients.length - 1} />
      ))}
      <div className="flex justify-between items-center pt-3 mt-1 border-t border-black/10">
        <span className="text-sm font-medium">Total: {data.totalCholesterol_mg}mg</span>
        <Button variant="primary" size="sm" onClick={onLog}>
          <Icon name="check" size={14} /> Log meal
        </Button>
      </div>
    </div>
  );
}
