import { useState } from 'react';
import { Icon } from '../lib/icons.jsx';
import { Button, Field, inputCls, AiLoading, AiError, LevelBadge } from '../lib/ui.jsx';
import { lookup } from '../lib/api.js';

export default function Lookup() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function doLookup() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const d = await lookup(q);
      setResult(d);
    } catch {
      setError('Not found. Try a different term.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 pt-3.5 pb-21">
      <Field label="Search any food or ingredient">
        <div className="flex gap-2">
          <input
            className={`${inputCls} flex-1`}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doLookup()}
            placeholder="e.g. eggs, cheddar, coconut oil…"
          />
          <Button variant="primary" size="sm" onClick={doLookup}>
            <Icon name="search" size={14} />
          </Button>
        </div>
      </Field>

      {loading && <AiLoading text={`Looking up "${query}"…`} />}
      {error && <AiError text={error} />}
      {result && (
        <div className="bg-white border border-black/10 rounded-xl p-4 mt-2.5">
          <div className="text-center py-4 px-0">
            <div className="text-xl font-medium mb-2">{result.name}</div>
            <LevelBadge level={result.level} />
          </div>
          <div className="mt-2">
            <InfoLine k="Per serving" v={result.serving} />
            <InfoLine k="Cholesterol" v={<strong>{result.cholesterol_mg}mg</strong>} />
            <InfoLine k="LDL impact" v={result.ldl_impact} />
            <InfoLine k="HDL impact" v={result.hdl_impact} />
            <InfoLine k="Daily guide" v={result.daily_recommendation} />
            <InfoLine k="Notes" v={result.nutritional_notes} last />
          </div>
          {!!result.alternatives?.length && (
            <div className="mt-3">
              <div className="text-xs text-gray-500 mb-1.5">Healthier alternatives</div>
              {result.alternatives.map((a, i) => (
                <div key={i} className="inline-flex items-center gap-1 bg-[#E1F5EE] text-[#085041] px-2 py-1 rounded-md text-xs mb-1 mr-1">
                  <Icon name="exchange" size={12} /> {a}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoLine({ k, v, last }) {
  return (
    <div className={`flex justify-between items-baseline py-2.5 gap-2 text-sm ${last ? '' : 'border-b border-black/5'}`}>
      <span className="text-gray-500 shrink-0">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
