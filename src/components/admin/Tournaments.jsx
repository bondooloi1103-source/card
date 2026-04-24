import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

function randSeed() {
  const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function toLocalDatetimeValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const FILTER_OPTS = ['upcoming', 'active', 'past', 'published'];

function classify(t) {
  const now = new Date();
  if (t.published) return 'published';
  if (new Date(t.ends_at) < now) return 'past';
  if (new Date(t.starts_at) <= now && new Date(t.ends_at) >= now) return 'active';
  return 'upcoming';
}

export default function AdminTournaments({ onToast }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('active');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    lang: 'mn',
    round_size: 10,
    starts_at: '',
    ends_at: '',
  });

  const load = async () => {
    const { data, error } = await supabase
      .from('tournaments')
      .select('id, name, lang, round_size, starts_at, ends_at, published, created_at')
      .order('starts_at', { ascending: false });
    if (error) { onToast('Тэмцээн ачаалахад алдаа: ' + error.message, true); return; }
    setRows(data ?? []);
  };

  useEffect(() => { load(); }, []);

  const visible = rows.filter((r) => classify(r) === filter);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { onToast('Нэр оруулна уу.', true); return; }
    if (!form.starts_at || !form.ends_at) { onToast('Эхлэх болон дуусах цагийг оруулна уу.', true); return; }
    if (new Date(form.ends_at) <= new Date(form.starts_at)) {
      onToast('Дуусах цаг эхлэх цагаас хожуу байх ёстой.', true); return;
    }
    setBusy(true);
    const { error } = await supabase.from('tournaments').insert({
      name: form.name.trim(),
      lang: form.lang,
      round_size: Number(form.round_size),
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
      seed: randSeed(),
      created_by: user.id,
      published: false,
    });
    setBusy(false);
    if (error) { onToast('Үүсгэхэд алдаа: ' + error.message, true); return; }
    onToast('Тэмцээн үүсгэгдлээ.');
    setShowForm(false);
    setForm({ name: '', lang: 'mn', round_size: 10, starts_at: '', ends_at: '' });
    load();
  };

  const handlePublish = async (id) => {
    setBusy(true);
    const { error } = await supabase.functions.invoke('tournament-finalize', {
      body: { tournament_id: id },
    });
    setBusy(false);
    if (error) { onToast('Нийтлэхэд алдаа: ' + error.message, true); return; }
    onToast('Тэмцээн нийтлэгдлээ.');
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-cinzel text-base font-bold">Тэмцээнүүд</h3>
        <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Хаах' : '+ Шинэ тэмцээн'}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-muted/40 border border-border rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-body">Нэр</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Тэмцээний нэр" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-body">Хэл</label>
              <select
                value={form.lang}
                onChange={(e) => setForm({ ...form, lang: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-body"
              >
                <option value="mn">Монгол</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-body">Асуултын тоо (5–20)</label>
              <Input
                type="number" min={5} max={20} value={form.round_size}
                onChange={(e) => setForm({ ...form, round_size: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-body">Эхлэх цаг</label>
              <Input
                type="datetime-local" value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-muted-foreground font-body">Дуусах цаг</label>
              <Input
                type="datetime-local" value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Болих</Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? 'Үүсгэж байна…' : 'Үүсгэх'}
            </Button>
          </div>
        </form>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTER_OPTS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-body rounded border ${
              filter === f ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {f === 'upcoming' ? 'Удахгүй' : f === 'active' ? 'Идэвхтэй' : f === 'past' ? 'Өнгөрсөн' : 'Нийтлэгдсэн'}
            <span className="ml-1 opacity-60">({rows.filter((r) => classify(r) === f).length})</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground font-body text-center py-8">Тэмцээн байхгүй.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((t) => (
            <div key={t.id} className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3 gap-4">
              <div className="min-w-0">
                <p className="font-cinzel text-sm font-semibold truncate">{t.name}</p>
                <p className="text-xs text-muted-foreground font-body mt-0.5">
                  {t.lang.toUpperCase()} · {t.round_size}Q ·{' '}
                  {new Date(t.starts_at).toLocaleString('mn')} → {new Date(t.ends_at).toLocaleString('mn')}
                </p>
              </div>
              {!t.published && (
                <Button
                  size="sm" variant="outline"
                  onClick={() => handlePublish(t.id)}
                  disabled={busy}
                  className="shrink-0 text-xs"
                >
                  Одоо нийтлэх
                </Button>
              )}
              {t.published && (
                <span className="text-xs text-green-600 font-body shrink-0">✓ Нийтлэгдсэн</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
