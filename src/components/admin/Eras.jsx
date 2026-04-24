import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ERAS, ERA_KEYS } from '@/lib/figuresData';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

const LANGS = ['mn', 'en'];
const KINDS = ['intro', 'outro'];

export default function AdminEras({ onToast }) {
  const { user } = useAuth();
  const [state, setState] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);

  const load = async () => {
    setLoading(true);
    const slugs = ERA_KEYS.flatMap((e) => [`era_intro:${e}`, `era_outro:${e}`]);
    const { data, error } = await supabase
      .from('story_content')
      .select('slug, lang, text, status')
      .in('slug', slugs);
    setLoading(false);
    if (error) { onToast('Ачаалахад алдаа: ' + error.message, true); return; }
    const next = {};
    for (const era of ERA_KEYS) for (const kind of KINDS) for (const lang of LANGS) {
      next[`${era}:${kind}:${lang}`] = { text: '', status: 'draft' };
    }
    for (const r of data ?? []) {
      const [prefix, era] = r.slug.split(':');
      const kind = prefix.endsWith('intro') ? 'intro' : 'outro';
      next[`${era}:${kind}:${r.lang}`] = { text: r.text, status: r.status };
    }
    setState(next);
  };
  useEffect(() => { load(); }, []);

  const save = async (era, kind, lang, nextStatus) => {
    const key = `${era}:${kind}:${lang}`;
    const row = state[key];
    setSavingKey(key);
    const status = nextStatus ?? row.status;
    const slug = `era_${kind}:${era}`;
    const { error } = await supabase.from('story_content').upsert(
      { slug, lang, text: row.text, status, updated_by: user?.id },
      { onConflict: 'slug,lang' },
    );
    setSavingKey(null);
    if (error) { onToast('Хадгалахад алдаа: ' + error.message, true); return; }
    setState((p) => ({ ...p, [key]: { ...p[key], status } }));
    onToast(status === 'published' ? 'Нийтлэгдлээ' : 'Хадгалагдлаа');
  };

  if (loading) return <p className="text-sm font-body p-6">Ачаалж байна…</p>;

  return (
    <div className="space-y-10">
      {ERA_KEYS.map((era) => {
        const def = ERAS[era];
        return (
          <section key={era} className="border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-cinzel text-sm font-bold">
              {def.roman} · {def.label}
            </h3>
            {KINDS.map((kind) => (
              <div key={kind} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {LANGS.map((lang) => {
                  const key = `${era}:${kind}:${lang}`;
                  const row = state[key];
                  const isPub = row?.status === 'published';
                  return (
                    <div key={lang} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-muted-foreground">
                          {kind === 'intro' ? 'Эхлэл' : 'Төгсгөл'} · {lang.toUpperCase()}
                        </label>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          isPub ? 'bg-emerald-900/40 text-emerald-300' : 'bg-amber-900/40 text-amber-300'
                        }`}>
                          {isPub ? 'Нийтлэгдсэн' : 'Ноорог'}
                        </span>
                      </div>
                      <Textarea
                        rows={5}
                        value={row?.text ?? ''}
                        onChange={(e) =>
                          setState((p) => ({ ...p, [key]: { ...p[key], text: e.target.value } }))
                        }
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm"
                                disabled={savingKey === key}
                                onClick={() => save(era, kind, lang)}>
                          Хадгалах
                        </Button>
                        {isPub ? (
                          <Button variant="outline" size="sm"
                                  disabled={savingKey === key}
                                  onClick={() => save(era, kind, lang, 'draft')}>
                            Нийтлэлээс авах
                          </Button>
                        ) : (
                          <Button size="sm"
                                  disabled={savingKey === key || !row?.text?.trim()}
                                  onClick={() => save(era, kind, lang, 'published')}>
                            Нийтлэх
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
