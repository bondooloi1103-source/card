import { Navigate, useSearchParams } from 'react-router-dom';
import { resolveCardParam } from '@/lib/figureSlugs';

export default function ARQueryRedirect() {
  const [params] = useSearchParams();
  const figId = resolveCardParam(params.get('card'));
  if (!figId) return <Navigate to="/" replace />;
  return <Navigate to={`/ar/${figId}`} replace />;
}
