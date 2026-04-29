import { useRef, useState } from 'react';
import { Upload, RefreshCw, Trash2, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLang } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

const MAX_MODEL_BYTES = 20 * 1024 * 1024;

export default function ModelUploader({ figures, videosById = {}, onChange }) {
  const { t } = useLang();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const handleUpload = async (figId, file) => {
    setError('');
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.glb') && !lower.endsWith('.gltf')) {
      setError(t('admin.models.notGlb'));
      return;
    }
    if (file.size > MAX_MODEL_BYTES) {
      setError(t('admin.models.tooBig', { mb: (file.size / 1024 / 1024).toFixed(1) }));
      return;
    }
    setBusy(figId);
    const form = new FormData();
    form.append('action', 'upload-model');
    form.append('fig_id', String(figId));
    form.append('file', file);
    const { data, error: invErr } = await supabase.functions.invoke('upload-figure-model', {
      body: form,
    });
    setBusy(null);
    if (invErr || !data?.ok) {
      setError(data?.reason || invErr?.message || 'server');
      return;
    }
    onChange?.();
  };

  const handleDelete = async (figId, hasModel) => {
    if (!hasModel) return;
    if (!window.confirm(t('admin.models.replaceWarn'))) return;
    setBusy(figId);
    const { data, error: invErr } = await supabase.functions.invoke('upload-figure-model', {
      body: { action: 'delete-model', fig_id: figId },
    });
    setBusy(null);
    if (invErr || !data?.ok) {
      setError(data?.reason || invErr?.message || 'server');
      return;
    }
    onChange?.();
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-ivory/70 font-body">{t('admin.models.help')}</p>
      {error && (
        <div role="alert" className="px-3 py-2 rounded bg-red-950/50 border border-red-500 text-sm text-red-200">
          {error}
        </div>
      )}
      <ScrollArea className="h-[60vh]">
        <div className="space-y-2">
          {figures.map((f) => {
            const v = videosById[f.fig_id];
            return (
              <ModelRow
                key={f.fig_id}
                figure={f}
                video={v}
                busy={busy === f.fig_id}
                onUpload={(file) => handleUpload(f.fig_id, file)}
                onDelete={() => handleDelete(f.fig_id, !!v?.modelPath)}
                t={t}
              />
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function ModelRow({ figure, video, busy, onUpload, onDelete, t }) {
  const inputRef = useRef(null);
  const hasVideo = !!video?.url;
  const hasModel = !!video?.modelPath;

  let statusText;
  if (!hasVideo) statusText = t('admin.models.noVideoFirst');
  else if (hasModel) statusText = '✓ .glb';
  else statusText = t('admin.models.empty');

  return (
    <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
      <span className="text-xl w-8 text-center">{figure.ico}</span>
      <div className="flex-1 min-w-0">
        <div className="font-cinzel text-sm font-bold truncate">{figure.name}</div>
        <div className="text-xs text-muted-foreground font-body inline-flex items-center gap-1">
          <Box className="w-3 h-3" /> {statusText}
        </div>
      </div>
      <input
        type="file"
        accept=".glb,.gltf"
        className="hidden"
        ref={inputRef}
        data-testid={`model-file-input-${figure.fig_id}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = '';
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={busy || !hasVideo}
        data-testid={`model-action-${figure.fig_id}`}
        onClick={() => inputRef.current?.click()}
        className="gap-1"
      >
        {hasModel ? <RefreshCw className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
        {hasModel ? t('admin.models.replace') : t('admin.models.upload')}
      </Button>
      {hasModel && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={onDelete}
          className="gap-1 text-red-300"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('admin.models.delete')}
        </Button>
      )}
    </div>
  );
}
