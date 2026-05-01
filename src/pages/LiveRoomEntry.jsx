import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, ArrowLeft } from 'lucide-react';
import { useLang } from '@/lib/i18n';
import { isGuest } from '@/lib/authStore';
import Fleuron from '@/components/ornaments/Fleuron';
import CornerTicks from '@/components/ornaments/CornerTicks';
import BrassButton from '@/components/ornaments/BrassButton';

/**
 * Hub for the live-rooms entry points: "Enter a code" and "Create a room".
 * Mounted at /games/quotes/live.
 */
export default function LiveRoomEntry() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);

  function submitCode(e) {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z]{6}$/.test(clean)) {
      setError(lang === 'en' ? 'Codes are 6 letters.' : 'Код нь 6 үсэгтэй байна.');
      return;
    }
    navigate(`/games/quotes/live/${clean}`);
  }

  return (
    <div className="min-h-screen bg-ink contour-bg px-5 md:px-8 py-10">
      <div className="max-w-[60rem] mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 font-meta text-[10px] tracking-[0.3em] uppercase text-brass/75 hover:text-ivory"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {t('fd.back')}
        </button>

        <div className="mt-10 text-center space-y-4">
          <Fleuron size={48} className="mx-auto opacity-80" />
          <span className="font-meta text-[10px] tracking-[0.32em] uppercase text-brass/80">
            {lang === 'en' ? 'CODEX · LIVE' : 'КОДЕКС · ЖИВЕ'}
          </span>
          <h1
            className="display-title text-[clamp(2rem,5vw,3.5rem)] text-ivory"
            style={{ fontVariationSettings: '"opsz" 96, "SOFT" 70, "WONK" 1, "wght" 540' }}
          >
            {lang === 'en' ? 'Play with ' : 'Найз нартайгаа '}
            <span className="text-seal">{lang === 'en' ? 'friends' : 'тоглох'}</span>
          </h1>
          <p className="font-prose italic text-ivory/70 max-w-md mx-auto">
            {lang === 'en'
              ? 'Everyone sees the same quotation and answers within a shared timer.'
              : 'Бүгдээрээ нэг ишлэлийг нэг цагт хариулна.'}
          </p>
        </div>

        <div className="mt-12 grid md:grid-cols-2 gap-5">
          {/* Enter code */}
          <form
            onSubmit={submitCode}
            className="relative bg-ink/50 border border-brass/35 hover:border-brass/70 transition-colors p-8 md:p-10 space-y-5"
          >
            <CornerTicks size={14} inset={8} thickness={1} opacity={0.9} />
            <div className="flex items-center gap-4">
              <span className="w-12 h-12 flex items-center justify-center border border-brass/50 text-brass">
                <Users className="w-5 h-5" />
              </span>
              <div>
                <p className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass/80">
                  {lang === 'en' ? 'Have a code?' : 'Код байна уу?'}
                </p>
                <h2
                  className="font-display text-2xl text-ivory leading-tight"
                  style={{ fontVariationSettings: '"opsz" 48, "SOFT" 60' }}
                >
                  {lang === 'en' ? 'Join a room' : 'Өрөөнд нэгдэх'}
                </h2>
              </div>
            </div>
            <input
              type="text"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(null); }}
              placeholder={lang === 'en' ? 'KHANAX' : 'ХААНАХ'}
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              className="w-full bg-ink border border-brass/40 focus:border-brass text-ivory text-center tracking-[0.45em] text-3xl md:text-4xl font-display py-4 outline-none"
            />
            {error && <p className="text-seal text-sm text-center">{error}</p>}
            <BrassButton type="submit" variant="primary" size="md" disabled={code.trim().length < 6}>
              {lang === 'en' ? 'Join' : 'Нэгдэх'}
            </BrassButton>
          </form>

          {/* Create room */}
          <div className="relative bg-ink/50 border border-brass/35 hover:border-brass/70 transition-colors p-8 md:p-10 space-y-5 flex flex-col">
            <CornerTicks size={14} inset={8} thickness={1} opacity={0.9} />
            <div className="flex items-center gap-4">
              <span className="w-12 h-12 flex items-center justify-center border border-seal/70 text-seal">
                <Plus className="w-5 h-5" />
              </span>
              <div>
                <p className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass/80">
                  {lang === 'en' ? 'Host a room' : 'Өрөө үүсгэх'}
                </p>
                <h2
                  className="font-display text-2xl text-ivory leading-tight"
                  style={{ fontVariationSettings: '"opsz" 48, "SOFT" 60' }}
                >
                  {lang === 'en' ? 'New game' : 'Шинэ тоглоом'}
                </h2>
              </div>
            </div>
            <p className="font-prose italic text-ivory/65 text-sm leading-relaxed flex-1">
              {lang === 'en'
                ? 'You choose the round size, timer, and player cap. Share the code; up to 8 can join.'
                : 'Та асуултын тоо, хугацаа, тоглогчийн хязгаарыг сонго. Кодоор 8 хүртэл хүн нэгдэнэ.'}
            </p>
            {isGuest() ? (
              <p className="text-xs text-ivory/55 italic">{t('guest.cannotHostTooltip')}</p>
            ) : (
              <BrassButton
                variant="primary"
                size="md"
                onClick={() => navigate('/games/quotes/live/new')}
              >
                {lang === 'en' ? 'Create a room' : 'Өрөө үүсгэх'}
              </BrassButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
