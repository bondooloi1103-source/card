import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLang } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { fetchTournament, fetchTournamentLeaderboard } from '@/lib/gameApi';
import MedalIcon, { medalKind } from '@/components/MedalIcon';
import Fleuron from '@/components/ornaments/Fleuron';
import CodexRule from '@/components/ornaments/CodexRule';
import { toast } from 'react-hot-toast';

export default function TournamentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lang } = useLang();

  const [tournament, setTournament] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [t, lb] = await Promise.all([
          fetchTournament(id),
          fetchTournamentLeaderboard(id),
        ]);
        if (cancelled) return;
        setTournament(t);
        setRows(lb);
      } catch (e) {
        if (!cancelled) toast.error(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  const fmtDate = (iso) =>
    new Date(iso).toLocaleString(lang === 'mn' ? 'mn' : 'en', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="min-h-screen bg-ink contour-bg">
      <div className="max-w-[52rem] mx-auto px-5 md:px-8 pt-6">
        <button
          onClick={() => navigate('/app/tournaments')}
          className="flex items-center gap-2 font-meta text-[10px] tracking-[0.3em] uppercase text-brass/75 hover:text-ivory"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {lang === 'mn' ? 'Тэмцээнүүд' : 'Tournaments'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-crimson rounded-full animate-spin" />
        </div>
      ) : !tournament ? (
        <div className="text-center py-24 text-ivory/50 font-body">
          {lang === 'mn' ? 'Тэмцээн олдсонгүй.' : 'Tournament not found.'}
        </div>
      ) : (
        <>
          <div className="max-w-[52rem] mx-auto px-5 md:px-8 pt-8 pb-6 text-center space-y-3">
            <CodexRule
              caption={lang === 'mn' ? 'КОДЕКС · ТЭМЦЭЭН' : 'CODEX · TOURNAMENT'}
              fleuronSize={20}
            />
            <h1
              className="display-title text-[clamp(1.6rem,4vw,2.6rem)] text-ivory"
              style={{ fontVariationSettings: '"opsz" 96, "SOFT" 70' }}
            >
              {tournament.name}
            </h1>
            <p className="font-meta text-[10px] tracking-[0.28em] uppercase text-brass/60">
              {tournament.lang.toUpperCase()} · {tournament.round_size}{' '}
              {lang === 'mn' ? 'асуулт' : 'questions'}
            </p>
            <p className="font-body text-xs text-ivory/40">
              {fmtDate(tournament.starts_at)} → {fmtDate(tournament.ends_at)}
            </p>
            {!tournament.published && (
              <p className="font-body text-xs text-ivory/40 italic">
                {lang === 'mn' ? 'Нийтлэгдэж байна…' : 'Results pending…'}
              </p>
            )}
          </div>

          <div className="max-w-[52rem] mx-auto px-5 md:px-8 pb-16">
            {rows.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <Fleuron size={36} className="mx-auto opacity-60" />
                <p className="font-prose italic text-ivory/70">
                  {lang === 'mn' ? 'Оролцогч алга' : 'No entries yet'}
                </p>
              </div>
            ) : (
              <table className="w-full text-ivory">
                <thead>
                  <tr className="font-meta text-[9.5px] uppercase tracking-[0.28em] text-brass/70 border-b border-brass/30">
                    <th className="text-left py-3 pl-3 w-10">#</th>
                    <th className="text-left py-3">{lang === 'mn' ? 'Тоглогч' : 'Player'}</th>
                    <th className="text-right py-3 pr-3">{lang === 'mn' ? 'Оноо' : 'Score'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isMe = r.user_id === user?.id;
                    const mk = tournament.published ? medalKind(Number(r.rank)) : null;
                    return (
                      <tr
                        key={r.user_id}
                        className={`border-b border-brass/10 ${isMe ? 'bg-brass/5' : ''}`}
                      >
                        <td className="py-3 pl-3 font-meta text-[11px] text-brass">
                          {mk ? (
                            <MedalIcon kind={mk} size={20} title={`${lang === 'mn' ? (mk === 'tournament_gold' ? 'Алт' : mk === 'tournament_silver' ? 'Мөнгө' : 'Хүрэл') : (mk === 'tournament_gold' ? 'Gold' : mk === 'tournament_silver' ? 'Silver' : 'Bronze')}`} />
                          ) : r.rank}
                        </td>
                        <td className="py-3 font-display">
                          {r.username}
                          {isMe && (
                            <span className="ml-2 text-brass/60 font-meta text-[10px]">
                              {lang === 'mn' ? '(та)' : '(you)'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-right font-display">
                          {r.score}/{r.total}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
