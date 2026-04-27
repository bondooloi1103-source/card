import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FIGURES } from '@/lib/figuresData';
import { useOwnedFigures } from '@/hooks/useOwnedFigures';
import { currentSession } from '@/lib/authStore';
import { supabase } from '@/lib/supabase';

const CATEGORIES = [
  { id: 'all', label: 'Бүгд' },
  { id: 'khans', label: 'Хаад' },
  { id: 'queens', label: 'Хатад' },
  { id: 'generals', label: 'Жанжид' },
  { id: 'scholars', label: 'Эрдэмтэд' },
];

export default function Figures() {
  const navigate = useNavigate();
  const session = currentSession();
  const userId = session?.account_id ?? null;
  const { figIds } = useOwnedFigures(userId);
  const ownedSet = new Set(figIds);

  const [activeCat, setActiveCat] = useState('all');
  const [claimingId, setClaimingId] = useState(null);

  const visible = FIGURES.filter((f) => activeCat === 'all' || f.cat === activeCat);

  const handleClaim = async (fig) => {
    if (ownedSet.has(fig.fig_id)) {
      navigate(`/c/${fig.fig_id}`);
      return;
    }
    setClaimingId(fig.fig_id);
    try {
      const { data, error } = await supabase.functions.invoke('claim-card', {
        body: { fig_id: fig.fig_id },
      });
      if (!error && data?.ok && data.owned) {
        navigate(`/c/${fig.fig_id}`);
      } else {
        console.warn('claim-card failed', error || data);
      }
    } catch (err) {
      console.error('claim-card invoke failed', err);
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="min-h-screen px-4 py-6" style={{ background: '#0a0c14', color: '#e8d5a3' }}>
      <header className="max-w-5xl mx-auto mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-playfair text-2xl sm:text-3xl font-bold" style={{ color: '#c9a84c' }}>
            Бүх дүрсүүд ({visible.length})
          </h1>
          <Link to="/collection" className="text-sm underline opacity-80 hover:opacity-100">
            Миний цуглуулга →
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className="px-3 py-1 rounded-full text-sm transition-colors"
              style={{
                border: '1px solid rgba(201,168,76,0.4)',
                background: activeCat === c.id ? 'rgba(201,168,76,0.2)' : 'transparent',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {visible.map((f) => {
          const owned = ownedSet.has(f.fig_id);
          const claiming = claimingId === f.fig_id;
          return (
            <button
              key={f.fig_id}
              onClick={() => handleClaim(f)}
              disabled={claiming}
              className="text-left p-3 rounded transition-all"
              style={{
                border: owned ? '1.5px solid #c9a84c' : '1px solid rgba(201,168,76,0.25)',
                background: owned ? 'rgba(201,168,76,0.08)' : 'rgba(26,18,0,0.4)',
                opacity: claiming ? 0.5 : 1,
              }}
              aria-label={`${f.name}${owned ? ' (цуглуулагдсан)' : ''}`}
            >
              <div className="text-3xl mb-1">{f.ico}</div>
              <div className="text-xs opacity-70">{f.card}</div>
              <div className="font-bold mt-1 text-sm">{f.name}</div>
              <div className="text-xs mt-2" style={{ color: owned ? '#c9a84c' : '#e8d5a380' }}>
                {claiming ? 'Цуглуулж байна…' : owned ? '✓ Цуглуулсан' : '+ Авах'}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
