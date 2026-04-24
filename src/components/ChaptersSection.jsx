import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FIGURES, ERAS, ERA_KEYS, getEra } from '@/lib/figuresData';
import { useLang } from '@/lib/i18n';
import CodexRule from '@/components/ornaments/CodexRule';
import CornerTicks from '@/components/ornaments/CornerTicks';
import EraFigureTile from '@/components/EraFigureTile';

export default function ChaptersSection({ figures = FIGURES }) {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  // Group figures by era, keyed to ERA_KEYS order.
  const byEra = useMemo(() => {
    const groups = Object.fromEntries(ERA_KEYS.map((k) => [k, []]));
    figures.forEach((fig) => {
      const e = getEra(fig);
      if (!groups[e]) groups[e] = [];
      groups[e].push(fig);
    });
    // sort each era by fig_id for a stable read
    ERA_KEYS.forEach((k) => groups[k].sort((a, b) => a.fig_id - b.fig_id));
    return groups;
  }, [figures]);

  return (
    <section className="relative py-24 px-4">
      <div className="max-w-[84rem] mx-auto">
        {/* Section heading */}
        <div className="text-center space-y-5 mb-14">
          <CodexRule caption={t('codex.chapter.III')} fleuronSize={22} />
          <h2 className="display-title text-[clamp(2.2rem,5vw,4rem)] text-ivory">
            {t('chapters.title.prefix')} <span className="text-seal">{t('chapters.title.suffix')}</span>
          </h2>
          <p className="max-w-xl mx-auto prose-body italic text-ivory/70">
            {t('chapters.subtitle')}
          </p>
        </div>

        {/* Era plates */}
        <div className="space-y-16">
          {ERA_KEYS.map((key, idx) => {
            const era = ERAS[key];
            const figs = byEra[key] || [];
            if (figs.length === 0) return null;
            return (
              <article
                key={key}
                id={`chapter-${key}`}
                className="relative border border-brass/30 bg-ink/40 overflow-hidden"
                style={{ scrollMarginTop: '6rem' }}
              >
                <CornerTicks size={14} inset={8} thickness={1} opacity={0.85} />

                {/* Era colored left bar */}
                <span
                  aria-hidden
                  className="absolute left-0 top-0 bottom-0 w-[3px]"
                  style={{ background: era.color }}
                />

                <div className="grid md:grid-cols-[auto_1fr] gap-8 md:gap-10 p-7 md:p-10">
                  {/* LEFT — massive roman numeral + meta */}
                  <div className="flex md:flex-col items-start gap-5 md:gap-3 md:min-w-[10rem]">
                    <div
                      className="font-display leading-none text-[clamp(4.5rem,9vw,8rem)]"
                      style={{
                        fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1, "wght" 500',
                        color: era.color,
                        textShadow: '0 0 18px rgba(0,0,0,0.4)',
                      }}
                    >
                      {era.roman}
                    </div>
                    <div className="flex-1 md:flex-initial">
                      <div className="font-meta text-[9.5px] tracking-[0.3em] uppercase text-brass/70">
                        Ora · {lang === 'en' ? (era.years_en || era.years) : era.years}
                      </div>
                      <div
                        className="font-display text-[11px] tracking-[0.24em] uppercase text-ivory/55 mt-1"
                        style={{ fontVariationSettings: '"opsz" 24' }}
                      >
                        {era.label_en}
                      </div>
                    </div>
                  </div>

                  {/* RIGHT — title, intro, figures */}
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <h3
                        className="display-title text-[clamp(1.75rem,3.5vw,3rem)] text-ivory leading-[1]"
                        style={{ fontVariationSettings: '"opsz" 96, "SOFT" 60, "wght" 520' }}
                      >
                        {lang === 'en' ? era.label_en : era.label}
                      </h3>
                      <button
                        onClick={() => navigate(`/story/${key}`)}
                        className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 text-[10px] font-meta tracking-[0.26em] uppercase text-ivory bg-seal/80 border border-seal hover:bg-seal transition-colors"
                      >
                        ▶ {t('chapters.play')}
                      </button>
                    </div>

                    <p className="prose-body italic text-[15px] leading-[1.7] text-ivory/78 mt-4 max-w-2xl">
                      {lang === 'en' ? (era.intro_en || era.intro) : era.intro}
                    </p>

                    {/* Figures strip */}
                    <div className="mt-7 pt-6 border-t border-brass/25">
                      <div className="flex items-baseline justify-between mb-4">
                        <span className="font-meta text-[10px] tracking-[0.28em] uppercase text-brass/80">
                          {t('chapters.dramatis')}
                        </span>
                        <span className="font-meta text-[10px] tracking-[0.22em] text-brass/60">
                          {String(figs.length).padStart(2, '0')} {t('chapters.count')}
                        </span>
                      </div>

                      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 md:flex-wrap md:overflow-visible md:pb-0">
                        {figs.map((f) => (
                          <EraFigureTile key={f.fig_id} figure={f} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* between-era plate marker */}
                {idx < ERA_KEYS.length - 1 && figs.length > 0 && (
                  <div className="h-px bg-gradient-to-r from-transparent via-brass/30 to-transparent" />
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
