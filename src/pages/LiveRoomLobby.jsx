import { useState } from 'react';
import { Copy, Check, Share2 } from 'lucide-react';
import { useLang, translateReason } from '@/lib/i18n';
import { startRoom } from '@/lib/liveRoomApi';
import { notify } from '@/lib/feedback';
import Fleuron from '@/components/ornaments/Fleuron';
import BrassButton from '@/components/ornaments/BrassButton';

export default function LiveRoomLobby({ room, sessionId, currentUserId }) {
  const { t, lang } = useLang();
  const isHost = room.session?.host_user_id === currentUserId;
  const canStart = isHost && room.participants.length >= 2;
  const joinCode = room.session?.join_code;
  const [copied, setCopied] = useState(false);

  async function onStart() {
    try { await startRoom(sessionId); }
    catch (err) { notify.error(translateReason(t, err.message) || err); }
  }

  async function copyCode() {
    if (!joinCode) return;
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify.error(lang === 'en' ? 'Could not copy.' : 'Хуулж чадсангүй.');
    }
  }

  async function shareLink() {
    if (!joinCode) return;
    const url = `${window.location.origin}/games/quotes/live/${joinCode}`;
    const title = lang === 'en' ? 'Join my quote duel' : 'Миний тоглоомд нэгдээрэй';
    try {
      if (navigator.share) {
        await navigator.share({ title, text: title, url });
      } else {
        await navigator.clipboard.writeText(url);
        notify.success(lang === 'en' ? 'Link copied' : 'Холбоос хуулагдлаа');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        notify.error(lang === 'en' ? 'Could not share.' : 'Хуваалцаж чадсангүй.');
      }
    }
  }

  return (
    <div className="min-h-screen bg-ink contour-bg px-6 py-10">
      <div className="max-w-xl mx-auto text-center space-y-6">
        <Fleuron size={48} className="mx-auto opacity-80" />
        <h1 className="font-display text-3xl text-ivory">{t('live.lobby.joinCode')}</h1>

        <div className="flex items-center justify-center gap-3">
          <div className="font-display tracking-[0.3em] text-5xl text-brass">{joinCode}</div>
          <button
            onClick={copyCode}
            className="w-10 h-10 flex items-center justify-center border border-brass/40 hover:border-brass text-brass transition-colors"
            aria-label={lang === 'en' ? 'Copy code' : 'Кодыг хуулах'}
            title={lang === 'en' ? 'Copy code' : 'Кодыг хуулах'}
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={shareLink}
            className="w-10 h-10 flex items-center justify-center border border-brass/40 hover:border-brass text-brass transition-colors"
            aria-label={lang === 'en' ? 'Share link' : 'Холбоос хуваалцах'}
            title={lang === 'en' ? 'Share link' : 'Холбоос хуваалцах'}
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>

        <RosterBadge eligibleFigIds={room.session?.eligible_fig_ids} t={t} />

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
          <div className="space-y-2">
            <BrassButton variant="primary" size="md" onClick={onStart} disabled={!canStart}>
              {t('live.lobby.start')}
            </BrassButton>
            {!canStart && (
              <p className="font-meta text-[10px] tracking-[0.22em] uppercase text-brass/60">
                {lang === 'en'
                  ? 'Waiting for at least one more player…'
                  : 'Дор хаяж нэг тоглогч хүлээж байна…'}
              </p>
            )}
          </div>
        ) : (
          <p className="font-prose italic text-ivory/70">{t('live.lobby.waitingForHost')}</p>
        )}
      </div>
    </div>
  );
}

function RosterBadge({ eligibleFigIds, t }) {
  if (eligibleFigIds && eligibleFigIds.length > 0) {
    return (
      <span
        className="font-meta text-[10px] tracking-[0.28em] uppercase px-2 py-0.5 rounded inline-block"
        style={{ border: '1px solid rgba(201,168,76,0.6)', color: '#c9a84c' }}
      >
        {t('live.lobby.rosterFigures')} · {eligibleFigIds.length}
      </span>
    );
  }
  return (
    <span
      className="font-meta text-[10px] tracking-[0.28em] uppercase px-2 py-0.5 rounded inline-block opacity-80"
      style={{ border: '1px dashed rgba(201,168,76,0.5)', color: '#c9a84c' }}
      title={t('live.lobby.allFiguresHint')}
    >
      {t('live.lobby.allFigures')}
    </span>
  );
}
