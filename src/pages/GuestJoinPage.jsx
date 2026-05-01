import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { claimGuestSession } from '@/lib/guestSession';
import { useLang } from '@/lib/i18n';

export default function GuestJoinPage() {
  const { t } = useLang();
  const nav = useNavigate();
  const loc = useLocation();
  const [error, setError] = useState(null);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    // Suppress Referer leakage of the token. <meta name=referrer> is
    // best-effort; the Netlify _headers file adds the HTTP header in prod.
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);

    const params = new URLSearchParams(loc.search);
    const token = params.get('token');
    // Scrub token from address bar + history before doing anything else.
    window.history.replaceState(null, '', '/guest/join');
    if (!token) {
      setError('expired_or_invalid');
      return () => { document.head.removeChild(meta); };
    }

    let cancelled = false;
    claimGuestSession(token)
      .then(() => {
        if (cancelled) return;
        setClaimed(true);
        nav('/', { replace: true });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || 'expired_or_invalid');
      });

    return () => {
      cancelled = true;
      try { document.head.removeChild(meta); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-md mx-auto p-8">
      {!error && !claimed && <p>{t('guest.joinPageTitle')}…</p>}
      {error && <p className="text-red-600">{t('guest.joinErrorExpired')}</p>}
    </div>
  );
}
