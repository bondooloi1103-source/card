import { useLang, translateReason } from '@/lib/i18n';
import { startRoom } from '@/lib/liveRoomApi';
import Fleuron from '@/components/ornaments/Fleuron';
import BrassButton from '@/components/ornaments/BrassButton';

export default function LiveRoomLobby({ room, sessionId, currentUserId }) {
  const { t } = useLang();
  const isHost = room.session?.host_user_id === currentUserId;
  const canStart = isHost && room.participants.length >= 2;

  async function onStart() {
    try { await startRoom(sessionId); }
    catch (err) { alert(translateReason(t, err.message)); }
  }

  return (
    <div className="min-h-screen bg-ink contour-bg px-6 py-10">
      <div className="max-w-xl mx-auto text-center space-y-6">
        <Fleuron size={48} className="mx-auto opacity-80" />
        <h1 className="font-display text-3xl text-ivory">{t('live.lobby.joinCode')}</h1>
        <div className="font-display tracking-[0.3em] text-5xl text-brass">{room.session?.join_code}</div>

        <div className="space-y-2">
          <p className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass/70">
            {t('live.lobby.players')} ({room.participants.length}/{room.session?.player_cap ?? 8})
          </p>
          <ul className="space-y-1">
            {room.participants.map((p) => (
              <li key={p.user_id} className="font-display text-ivory">
                {p.username ?? p.user_id.slice(0, 8)}
                {p.user_id === room.session?.host_user_id && (
                  <span className="ml-2 text-brass text-xs">★ host</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {isHost ? (
          <BrassButton variant="primary" size="md" onClick={onStart} disabled={!canStart}>
            {t('live.lobby.start')}
          </BrassButton>
        ) : (
          <p className="font-prose italic text-ivory/70">{t('live.lobby.waitingForHost')}</p>
        )}
      </div>
    </div>
  );
}
