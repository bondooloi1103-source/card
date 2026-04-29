import { useEffect, useRef, useState } from 'react';
import { Upload, RefreshCw, Trash2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLang } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useFigureARPack } from '@/hooks/useFigureARPack';
import { FIGURES } from '@/lib/figuresData';

const MAX_PACK_BYTES = 30 * 1024 * 1024;

const DEFAULT_ORDER = FIGURES.map((f) => f.fig_id);

export default function ARPackUploader() {
  const { t } = useLang();
  const pack = useFigureARPack();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [orderText, setOrderText] = useState(JSON.stringify(DEFAULT_ORDER));
  const inputRef = useRef(null);

  useEffect(() => {
    if (pack.targetOrder?.length) {
      setOrderText(JSON.stringify(pack.targetOrder));
    }
  }, [pack.targetOrder]);

  const validateOrder = () => {
    try {
      const parsed = JSON.parse(orderText);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      const numeric = parsed.map(Number);
      if (numeric.some((v) => !Number.isInteger(v) || v <= 0)) return null;
      return numeric;
    } catch {
      return null;
    }
  };

  const handleUpload = async (file) => {
    setError('');
    if (!file.name.toLowerCase().endsWith('.mind')) {
      setError(t('admin.arPack.notMind'));
      return;
    }
    if (file.size > MAX_PACK_BYTES) {
      setError(t('admin.arPack.tooBig', { mb: (file.size / 1024 / 1024).toFixed(1) }));
      return;
    }
    const order = validateOrder();
    if (!order) {
      setError(t('admin.arPack.targetOrder'));
      return;
    }

    setBusy(true);
    const form = new FormData();
    form.append('action', 'upload-pack');
    form.append('file', file);
    form.append('target_order', JSON.stringify(order));
    const { data, error: invErr } = await supabase.functions.invoke('upload-figure-ar-pack', {
      body: form,
    });
    setBusy(false);
    if (invErr || !data?.ok) {
      setError(data?.reason || invErr?.message || 'server');
      return;
    }
  };

  const handleDelete = async () => {
    if (!pack.ready) return;
    if (!window.confirm(t('admin.arPack.replaceWarn'))) return;
    setBusy(true);
    const { data, error: invErr } = await supabase.functions.invoke('upload-figure-ar-pack', {
      body: { action: 'delete-pack' },
    });
    setBusy(false);
    if (invErr || !data?.ok) {
      setError(data?.reason || invErr?.message || 'server');
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-xs text-ivory/70 font-body">{t('admin.arPack.help')}</p>
      {error && (
        <div role="alert" className="px-3 py-2 rounded bg-red-950/50 border border-red-500 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
        <Layers className="w-5 h-5 text-brass" />
        <div className="flex-1 min-w-0">
          <div className="font-cinzel text-sm font-bold truncate">
            {pack.ready ? `✓ ${pack.targetOrder.length} targets` : t('admin.arPack.empty')}
          </div>
        </div>
        <input
          type="file"
          accept=".mind"
          className="hidden"
          ref={inputRef}
          data-testid="ar-pack-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = '';
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          data-testid="ar-pack-upload-button"
          onClick={() => inputRef.current?.click()}
          className="gap-1"
        >
          {pack.ready ? <RefreshCw className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
          {pack.ready ? t('admin.arPack.replace') : t('admin.arPack.upload')}
        </Button>
        {pack.ready && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            data-testid="ar-pack-delete-button"
            onClick={handleDelete}
            className="gap-1 text-red-300"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('admin.arPack.delete')}
          </Button>
        )}
      </div>

      <label className="block">
        <span className="block text-xs text-brass/80 font-meta tracking-[0.2em] uppercase mb-1.5">
          {t('admin.arPack.targetOrder')}
        </span>
        <textarea
          rows={4}
          value={orderText}
          onChange={(e) => setOrderText(e.target.value)}
          className="w-full font-mono text-xs bg-ink/60 border border-brass/30 rounded p-2 text-ivory/90"
          data-testid="ar-pack-order-input"
        />
      </label>
    </div>
  );
}
