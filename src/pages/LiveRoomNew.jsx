import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@/lib/i18n';
import { createSession } from '@/lib/gameApi';
import Fleuron from '@/components/ornaments/Fleuron';
import BrassButton from '@/components/ornaments/BrassButton';

export default function LiveRoomNew() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const [roundSize, setRoundSize] = useState(10);
  const [timerS, setTimerS] = useState(15);
  const [playerCap, setPlayerCap] = useState(8);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { join_code } = await createSession({
        mode: 'live_room',
        lang,
        round_size: roundSize,
        timer_s: timerS,
        player_cap: playerCap,
      });
      navigate(`/games/quotes/live/${join_code}`);
    } catch (err) {
      setError(err.message ?? 'create_failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink contour-bg flex items-center justify-center px-6">
      <form onSubmit={submit} className="max-w-md w-full space-y-5 text-center">
        <Fleuron size={48} className="mx-auto opacity-80" />
        <h1 className="font-display text-3xl text-ivory">{t('live.new.title')}</h1>

        <label className="block text-left">
          <span className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass/70">{t('live.new.roundSize')}</span>
          <select value={roundSize} onChange={(e) => setRoundSize(Number(e.target.value))}
                  className="w-full bg-ink border border-brass/40 text-ivory px-3 py-2">
            <option value={5}>5</option><option value={10}>10</option><option value={15}>15</option>
          </select>
        </label>

        <label className="block text-left">
          <span className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass/70">{t('live.new.timer')}</span>
          <select value={timerS} onChange={(e) => setTimerS(Number(e.target.value))}
                  className="w-full bg-ink border border-brass/40 text-ivory px-3 py-2">
            <option value={10}>10s</option><option value={15}>15s</option><option value={20}>20s</option>
          </select>
        </label>

        <label className="block text-left">
          <span className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass/70">{t('live.new.playerCap')}</span>
          <input type="number" min={2} max={8} value={playerCap}
                 onChange={(e) => setPlayerCap(Number(e.target.value))}
                 className="w-full bg-ink border border-brass/40 text-ivory px-3 py-2" />
        </label>

        {error && <p className="text-seal text-sm">{error}</p>}
        <BrassButton type="submit" variant="primary" size="md" disabled={submitting}>
          {t('live.new.submit')}
        </BrassButton>
      </form>
    </div>
  );
}
