import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLang, translateReason } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import {
  fetchTournaments,
  fetchTournamentParticipantCounts,
  fetchMyTournamentEntries,
  createSession,
} from '@/lib/gameApi';
import Fleuron from '@/components/ornaments/Fleuron';
import CodexRule from '@/components/ornaments/CodexRule';
import { toast } from 'react-hot-toast';

function Section({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="font-meta text-[10px] tracking-[0.35em] uppercase text-brass/70 mb-4 border-b border-brass/20 pb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function TournamentCard({ t, status, entered, participantCount, onPlay, onView }) {
  const { lang } = useLang();
  const fmtDate = (iso) => new Date(iso).toLocaleString(lang === 'mn' ? 'mn' : 'en', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="bg-ink/60 border border-brass/20 rounded-lg px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <p className="font-display text-base text-ivory leading-tight" style={{ fontVariationSettings: '"opsz" 30, "wght" 500' }}>
          {t.name}
        </p>
        <p className="font-meta text-[10px] tracking-[0.25em] uppercase text-brass/60">
          {t.lang.toUpperCase()} · {t.round_size} {lang === 'mn' ? 'асуулт' : 'questions'}
        </p>
        <p className="font-body text-xs text-ivory/50">
          {fmtDate(t.starts_at)} → {fmtDate(t.ends_at)}
        </p>
        {participantCount > 0 && (
          <p className="font-body text-xs text-ivory/40">
            {participantCount} {lang === 'mn' ? 'оролцогч' : 'participants'}
          </p>
        )}
      </div>

      <div className="shrink-0">
        {status === 'upcoming' && (
          <span className="inline-block px-3 py-1.5 text-xs font-body text-ivory/40 border border-ivory/10 rounded">
            {lang === 'mn' ? 'Удахгүй' : 'Starts soon'}
          </span>
        )}
        {status === 'active' && (
          entered ? (
            <button
              onClick={onView}
              className="px-4 py-2 text-xs font-meta tracking-[0.2em] uppercase text-ivory bg-brass/20 border border-brass/50 hover:bg-brass/30 transition-colors rounded"
            >
              {lang === 'mn' ? 'Үр дүнгээ харах' : 'View your result'}
            </button>
          ) : (
            <button
              onClick={onPlay}
              className="px-4 py-2 text-xs font-meta tracking-[0.2em] uppercase text-ivory bg-seal/80 border border-seal hover:bg-seal transition-colors rounded"
            >
              {lang === 'mn' ? 'Тоглох' : 'Play'}
            </button>
          )
        )}
        {status === 'past' && (
          <button
            onClick={onView}
            className="px-4 py-2 text-xs font-meta tracking-[0.2em] uppercase text-ivory/70 border border-brass/30 hover:text-ivory hover:border-brass/60 transition-colors rounded"
          >
            {lang === 'mn' ? 'Дэвжээ харах' : 'View leaderboard'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Tournaments() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t: translate, lang } = useLang();

  const [tournaments, setTournaments] = useState([]);
  const [counts, setCounts] = useState({});
  const [entered, setEntered] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const all = await fetchTournaments();
        if (cancelled) return;
        setTournaments(all);
        const ids = all.map((t) => t.id);
        const [cMap, myEntered] = await Promise.all([
          fetchTournamentParticipantCounts(ids),
          user ? fetchMyTournamentEntries(user.id) : Promise.resolve(new Set()),
        ]);
        if (cancelled) return;
        setCounts(cMap);
        setEntered(myEntered);
      } catch (e) {
        if (!cancelled) toast.error(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user]);

  const now = new Date();
  const upcoming = tournaments.filter((t) => !t.published && new Date(t.starts_at) > now);
  const active = tournaments.filter(
    (t) => !t.published && new Date(t.starts_at) <= now && new Date(t.ends_at) >= now,
  );
  const past = tournaments.filter((t) => t.published || new Date(t.ends_at) < now);

  const handlePlay = async (t) => {
    if (playingId) return;
    setPlayingId(t.id);
    try {
      const { id: sessionId } = await createSession({ mode: 'tournament', tournament_id: t.id });
      navigate(`/games/quotes?session=${sessionId}`);
    } catch (e) {
      toast.error(translateReason(translate, e.message));
      setPlayingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-ink contour-bg">
      <div className="max-w-[52rem] mx-auto px-5 md:px-8 pt-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 font-meta text-[10px] tracking-[0.3em] uppercase text-brass/75 hover:text-ivory"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {lang === 'mn' ? 'Буцах' : 'Back'}
        </button>
      </div>

      <div className="max-w-[52rem] mx-auto px-5 md:px-8 pt-8 pb-6 text-center space-y-3">
        <CodexRule
          caption={lang === 'mn' ? 'КОДЕКС · ТЭМЦЭЭН' : 'CODEX · TOURNAMENTS'}
          fleuronSize={20}
        />
        <h1 className="display-title text-[clamp(2rem,5vw,3rem)] text-ivory"
            style={{ fontVariationSettings: '"opsz" 96, "SOFT" 70' }}>
          {lang === 'mn' ? 'Тэмцээнүүд' : 'Tournaments'}
        </h1>
      </div>

      <div className="max-w-[52rem] mx-auto px-5 md:px-8 pb-16">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-crimson rounded-full animate-spin" />
          </div>
        ) : (upcoming.length + active.length + past.length === 0) ? (
          <div className="text-center py-16 space-y-3">
            <Fleuron size={36} className="mx-auto opacity-60" />
            <p className="font-prose italic text-ivory/70">
              {lang === 'mn' ? 'Одоогоор тэмцээн байхгүй байна.' : 'No tournaments yet.'}
            </p>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <Section title={lang === 'mn' ? 'Идэвхтэй' : 'Active'}>
                <div className="space-y-3">
                  {active.map((t) => (
                    <TournamentCard
                      key={t.id} t={t} status="active"
                      entered={entered.has(t.id)}
                      participantCount={counts[t.id] ?? 0}
                      onPlay={() => handlePlay(t)}
                      onView={() => navigate(`/app/tournaments/${t.id}`)}
                    />
                  ))}
                </div>
              </Section>
            )}
            {upcoming.length > 0 && (
              <Section title={lang === 'mn' ? 'Удахгүй' : 'Upcoming'}>
                <div className="space-y-3">
                  {upcoming.map((t) => (
                    <TournamentCard
                      key={t.id} t={t} status="upcoming"
                      entered={entered.has(t.id)}
                      participantCount={counts[t.id] ?? 0}
                      onPlay={() => {}}
                      onView={() => {}}
                    />
                  ))}
                </div>
              </Section>
            )}
            {past.length > 0 && (
              <Section title={lang === 'mn' ? 'Өнгөрсөн' : 'Past'}>
                <div className="space-y-3">
                  {past.map((t) => (
                    <TournamentCard
                      key={t.id} t={t} status="past"
                      entered={entered.has(t.id)}
                      participantCount={counts[t.id] ?? 0}
                      onPlay={() => {}}
                      onView={() => navigate(`/app/tournaments/${t.id}`)}
                    />
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
