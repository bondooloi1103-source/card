import { Navigate, useSearchParams } from 'react-router-dom';
import { FIGURES } from '@/lib/figuresData';

const SLUG_MAP = Object.fromEntries(
  FIGURES.map((f) => [`FIG_${String(f.fig_id).padStart(3, '0')}`, f.fig_id]),
);

function resolveCardParam(raw) {
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isInteger(n) && n > 0) return n;
  const upper = String(raw).toUpperCase();
  if (SLUG_MAP[upper]) return SLUG_MAP[upper];
  const trailing = upper.match(/_(\d+)$/);
  if (trailing) {
    const id = Number(trailing[1]);
    if (FIGURES.some((f) => f.fig_id === id)) return id;
  }
  return null;
}

export default function ARQueryRedirect() {
  const [params] = useSearchParams();
  const figId = resolveCardParam(params.get('card'));
  if (!figId) return <Navigate to="/" replace />;
  return <Navigate to={`/ar/${figId}`} replace />;
}
