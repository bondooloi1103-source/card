import { Link } from 'react-router-dom';
import { FIGURES } from '@/lib/figuresData';
import { useOwnedFigures } from '@/hooks/useOwnedFigures';
import { currentSession } from '@/lib/authStore';

export default function Collection() {
  const session = currentSession();
  const userId = session?.account_id ?? null;
  const { figIds, loading } = useOwnedFigures(userId);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-brass">
        Уншиж байна…
      </div>
    );
  }

  if (figIds.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center text-brass">
        <p className="text-lg">Карт уншуулаад цуглуулгаа эхлүүл</p>
        <Link
          to="/games/quotes/live?demo=1"
          className="px-5 py-2 rounded border border-brass/50 hover:bg-brass/10"
        >
          Demo тоглоом руу орох
        </Link>
      </div>
    );
  }

  const owned = figIds
    .map((id) => FIGURES.find((f) => f.fig_id === id))
    .filter(Boolean);

  return (
    <div className="min-h-screen px-4 py-6 bg-ink text-brass">
      <h1 className="text-2xl mb-4">Миний цуглуулга ({owned.length})</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {owned.map((f) => (
          <Link
            key={f.fig_id}
            to={`/c/${f.fig_id}`}
            className="block p-3 rounded border border-brass/30 hover:border-brass/70"
            aria-label={f.name}
          >
            <div className="text-3xl mb-1">{f.ico}</div>
            <div className="text-xs opacity-70">{f.card}</div>
            <div className="font-bold mt-1">{f.name}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
