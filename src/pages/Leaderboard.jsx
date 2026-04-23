import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLang } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { fetchLeaderboard } from '@/lib/gameApi';
import Fleuron from '@/components/ornaments/Fleuron';
import CodexRule from '@/components/ornaments/CodexRule';

export default function Leaderboard() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;

  const [tab, setTab] = useState('weekly');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLeaderboard(tab, 20)
      .then((data) => {
        if (!cancelled) {
          setRows(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const myRow = rows.find((r) => r.user_id === userId);
  const topRows = rows.slice(0, 20);
  const myRankVisible = myRow && topRows.some((r) => r.user_id === userId);

  return (
    <div className="min-h-screen bg-ink contour-bg">
      <div className="max-w-[50rem] mx-auto px-5 md:px-8 pt-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 font-meta text-[10px] tracking-[0.3em] uppercase text-brass/75 hover:text-ivory"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {lang === 'en' ? 'Back' : 'Буцах'}
        </button>
      </div>

      <div className="max-w-[50rem] mx-auto px-5 md:px-8 pt-8 pb-6 text-center space-y-3">
        <CodexRule
          caption={lang === 'en' ? 'CODEX · LEADERBOARD' : 'КОДЕКС · ТЭРГҮҮЛЭГЧИД'}
          fleuronSize={20}
        />
        <h1
          className="display-title text-[clamp(2rem,5vw,3rem)] text-ivory"
          style={{ fontVariationSettings: '"opsz" 96, "SOFT" 70' }}
        >
          {t('leaderboard.title')}
        </h1>
      </div>

      <div className="max-w-[50rem] mx-auto px-5 md:px-8 pb-4 flex items-center justify-center gap-2">
        {[
          { key: 'weekly', label: t('leaderboard.tab.weekly') },
          { key: 'all_time', label: t('leaderboard.tab.all') },
        ].map((tDef) => (
          <button
            key={tDef.key}
            onClick={() => setTab(tDef.key)}
            className={`px-4 py-2 font-meta text-[10px] tracking-[0.28em] uppercase border ${
              tab === tDef.key
                ? 'border-brass text-ivory'
                : 'border-brass/30 text-brass/70 hover:text-ivory'
            }`}
          >
            {tDef.label}
          </button>
        ))}
      </div>

      <div className="max-w-[50rem] mx-auto px-5 md:px-8 pb-16">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-crimson rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <Fleuron size={36} className="mx-auto opacity-60" />
            <p className="font-prose italic text-ivory/70">{t('leaderboard.empty')}</p>
          </div>
        ) : (
          <table className="w-full text-ivory">
            <thead>
              <tr className="font-meta text-[9.5px] uppercase tracking-[0.28em] text-brass/70 border-b border-brass/30">
                <th className="text-left py-3 pl-3 w-10">{t('leaderboard.col.rank')}</th>
                <th className="text-left py-3">{t('leaderboard.col.user')}</th>
                <th className="text-right py-3 hidden sm:table-cell">
                  {t('leaderboard.col.games')}
                </th>
                <th className="text-right py-3">{t('leaderboard.col.points')}</th>
                <th className="text-right py-3 pr-3">{t('leaderboard.col.acc')}</th>
              </tr>
            </thead>
            <tbody>
              {topRows.map((r, i) => (
                <tr
                  key={r.user_id}
                  className={`border-b border-brass/10 ${r.user_id === userId ? 'bg-brass/5' : ''}`}
                >
                  <td className="py-3 pl-3 font-meta text-[11px] text-brass">{i + 1}</td>
                  <td className="py-3 font-display">{r.username}</td>
                  <td className="py-3 text-right hidden sm:table-cell font-meta text-[12px] text-ivory/70">
                    {r.games_played}
                  </td>
                  <td className="py-3 text-right font-display">{r.total_points}</td>
                  <td className="py-3 pr-3 text-right font-meta text-[12px] text-ivory/70">
                    {r.accuracy_pct}%
                  </td>
                </tr>
              ))}
              {myRow && !myRankVisible && (
                <tr className="border-t-2 border-brass/30 bg-brass/5">
                  <td className="py-3 pl-3 font-meta text-[11px] text-brass">…</td>
                  <td className="py-3 font-display">
                    {myRow.username}{' '}
                    <span className="text-brass/60 text-[10px] ml-1">
                      {t('leaderboard.yourRank')}
                    </span>
                  </td>
                  <td className="py-3 text-right hidden sm:table-cell font-meta text-[12px] text-ivory/70">
                    {myRow.games_played}
                  </td>
                  <td className="py-3 text-right font-display">{myRow.total_points}</td>
                  <td className="py-3 pr-3 text-right font-meta text-[12px] text-ivory/70">
                    {myRow.accuracy_pct}%
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
