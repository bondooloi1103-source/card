import { useEffect, useState } from 'react';
import {
  initGuestSlots,
  listGuestSlots,
  generateGuestToken,
  revokeGuestSlot,
} from '@/lib/guestApi';
import { isGuest } from '@/lib/authStore';
import { useLang } from '@/lib/i18n';

export default function GuestSlotsPanel() {
  const { t } = useLang();
  const [slots, setSlots] = useState([]);
  const [activeUrl, setActiveUrl] = useState(null);
  const [confirmingIdx, setConfirmingIdx] = useState(null);
  const [error, setError] = useState(null);

  if (isGuest()) return null;

  async function refresh() {
    try {
      const r = await listGuestSlots();
      setSlots(r.slots || []);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    (async () => {
      try { await initGuestSlots(); } catch { /* idempotent; ignore */ }
      refresh();
    })();
  }, []);

  async function onGenerate(slot_idx) {
    setError(null);
    try {
      const r = await generateGuestToken(slot_idx);
      setActiveUrl(r.url);
    } catch (e) {
      setError(e.message);
    }
  }

  async function onRevoke(slot_idx) {
    setError(null);
    try {
      await revokeGuestSlot(slot_idx);
      setConfirmingIdx(null);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  function copyUrl() {
    if (!activeUrl) return;
    try { navigator.clipboard.writeText(activeUrl); } catch { /* ignore */ }
    setActiveUrl(null);
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{t('guest.panelTitle')}</h2>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {slots.map((s) => (
        <div
          key={s.slot_idx}
          data-testid="guest-slot"
          className="flex items-center justify-between p-3 border rounded"
        >
          <div>
            {s.display_name ? (
              <span>
                {t('guest.slotClaimed', { name: s.display_name })}
                {s.online && <span className="text-green-600 text-sm ml-2">●</span>}
              </span>
            ) : (
              <span className="text-gray-500">{t('guest.slotEmpty')}</span>
            )}
          </div>
          <div className="space-x-2">
            <button
              type="button"
              className="px-3 py-1 border rounded"
              onClick={() => onGenerate(s.slot_idx)}
            >
              {t('guest.generateLinkButton')}
            </button>
            {s.auth_user_id && (
              confirmingIdx === s.slot_idx ? (
                <>
                  <span className="text-sm">{t('guest.revokeConfirm')}</span>
                  <button
                    type="button"
                    className="px-3 py-1 border rounded text-red-600"
                    onClick={() => onRevoke(s.slot_idx)}
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1 border rounded"
                    onClick={() => setConfirmingIdx(null)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="px-3 py-1 border rounded"
                  onClick={() => setConfirmingIdx(s.slot_idx)}
                >
                  {t('guest.revokeButton')}
                </button>
              )
            )}
          </div>
        </div>
      ))}
      {activeUrl && (
        <div className="p-3 border rounded bg-gray-50 space-y-2">
          <p className="text-sm">{t('guest.copyUrlLabel')}</p>
          <input
            readOnly
            value={activeUrl}
            className="w-full border p-1 text-xs"
            onFocus={(e) => e.target.select()}
          />
          <p className="text-xs text-gray-500">{t('guest.expiresIn', { minutes: 15 })}</p>
          <div className="space-x-2">
            <button type="button" className="px-3 py-1 border rounded" onClick={copyUrl}>
              Copy
            </button>
            <button
              type="button"
              className="px-3 py-1 border rounded"
              onClick={() => setActiveUrl(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
