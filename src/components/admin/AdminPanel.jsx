import { useState, useEffect, useRef } from 'react';
import { X, LayoutDashboard, Pencil, Grid3X3, Settings, Save, Trash2, Plus, Upload, Download, Palette, Ticket, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CATEGORIES } from '@/lib/figuresData';
import AdminTournaments from '@/components/admin/Tournaments';
import { base44 } from '@/api/base44Client';
import { useAppSettings } from '@/hooks/useAppSettings';
import { listInviteCodes, createInviteCode, deleteInviteCode, listAccounts } from '@/lib/authStore';

function AdminToast({ message, isError }) {
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl border-2 ${isError ? 'border-red-500 bg-red-950/90' : 'border-green-500 bg-green-950/90'} text-white text-sm font-body shadow-xl`}>
      {message}
    </div>
  );
}

export default function AdminPanel({ figures, onClose, onFiguresChange }) {
  const [tab, setTab] = useState('dashboard');
  const [selectedFig, setSelectedFig] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [figSearch, setFigSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [logs, setLogs] = useState([]);
  const [sessionStart] = useState(Date.now());
  const { settings, saveSetting } = useAppSettings();
  const [brandForm, setBrandForm] = useState({ site_name: '', site_logo: '' });

  // Sync brandForm when settings load
  useEffect(() => {
    setBrandForm({ site_name: settings.site_name, site_logo: settings.site_logo });
  }, [settings.site_name, settings.site_logo]);

  const showToast = (msg, isError = false) => {
    setToast({ message: msg, isError });
    setTimeout(() => setToast(null), 3000);
  };

  const addLog = (msg, level = 'ok') => {
    const time = new Date().toLocaleTimeString('mn-MN');
    setLogs(prev => [...prev, { time, msg, level }]);
  };

  useEffect(() => {
    addLog('Админ панел нээгдлээ', 'ok');
    document.body.style.overflow = 'hidden';

    // Live sync: refresh figures list when any figure changes in DB
    const unsub = base44.entities.Figure.subscribe(async (event) => {
      const latest = await base44.entities.Figure.list('-fig_id', 100);
      onFiguresChange(prev => {
        const merged = prev.map(f => {
          const db = latest.find(d => d.fig_id === f.fig_id);
          return db ? { ...f, ...db } : f;
        });
        latest.forEach(db => {
          if (!merged.find(m => m.fig_id === db.fig_id)) merged.push(db);
        });
        return merged.sort((a, b) => a.fig_id - b.fig_id);
      });
      addLog(`DB өөрчлөлт: ${event.type} #${event.id?.slice(0, 6)}`, 'ok');
    });

    return () => { document.body.style.overflow = ''; unsub(); };
  }, []);

  const selectFig = (fig) => {
    setSelectedFig(fig);
    setEditForm({
      name: fig.name || '',
      yrs: fig.yrs || '',
      card: fig.card || '',
      cat: fig.cat || 'khans',
      ico: fig.ico || '👑',
      role: fig.role || '',
      bio: fig.bio || '',
      fact: fig.fact || '',
      quote: fig.quote || '',
      qattr: fig.qattr || '',
      story: fig.story || '',
      story_en: fig.story_en || '',
      achs: (fig.achs || []).join('\n'),
      rel: (fig.rel || []).join(', '),
    });
    setTab('editor');
  };

  const saveFig = async () => {
    const updated = {
      ...selectedFig,
      ...editForm,
      achs: editForm.achs.split('\n').filter(Boolean),
      rel: editForm.rel.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)),
    };
    
    try {
      if (selectedFig.id) {
        await base44.entities.Figure.update(selectedFig.id, updated);
      } else {
        const created = await base44.entities.Figure.create(updated);
        updated.id = created.id;
      }
      
      const newFigs = figures.map(f => f.fig_id === updated.fig_id ? updated : f);
      if (!figures.find(f => f.fig_id === updated.fig_id)) {
        newFigs.push(updated);
      }
      onFiguresChange(newFigs);
      showToast('Амжилттай хадгаллаа!');
      addLog(`${updated.name} хадгалагдлаа`, 'ok');
    } catch (err) {
      showToast('Хадгалахад алдаа гарлаа', true);
      addLog(`Хадгалахад алдаа: ${err.message}`, 'err');
    }
  };

  const deleteFig = async () => {
    if (!selectedFig || !confirm(`"${selectedFig.name}" устгах уу?`)) return;
    try {
      if (selectedFig.id) {
        await base44.entities.Figure.delete(selectedFig.id);
      }
      const newFigs = figures.filter(f => f.fig_id !== selectedFig.fig_id);
      onFiguresChange(newFigs);
      setSelectedFig(null);
      showToast('Устгагдлаа');
      addLog(`${selectedFig.name} устгагдлаа`, 'warn');
    } catch (err) {
      showToast('Устгахад алдаа гарлаа', true);
    }
  };

  const addFig = () => {
    const maxId = Math.max(0, ...figures.map(f => f.fig_id));
    const newFig = {
      fig_id: maxId + 1,
      cat: 'khans',
      ico: '👑',
      card: 'Шинэ Хөзөр',
      name: 'Шинэ Зүтгэлтэн',
      yrs: '',
      role: '',
      bio: '',
      achs: [],
      fact: '',
      quote: null,
      qattr: null,
      rel: [],
    };
    selectFig(newFig);
    addLog('Шинэ зүтгэлтэн нэмэгдлээ', 'ok');
  };

  const handleImageUpload = async (e, side) => {
    const file = e.target.files[0];
    if (!file || !selectedFig) return;

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const fieldName = side === 'front' ? 'front_img' : 'back_img';
      const updated = { ...selectedFig, [fieldName]: file_url };

      if (selectedFig.id) {
        await base44.entities.Figure.update(selectedFig.id, { [fieldName]: file_url });
      }

      setSelectedFig(updated);
      const newFigs = figures.map(f => f.fig_id === updated.fig_id ? updated : f);
      onFiguresChange(newFigs);
      showToast(`${side === 'front' ? 'Нүүр' : 'Ар'} зураг байршуулагдлаа`);
      addLog(`${selectedFig.name} - ${side} зураг байршуулагдлаа`, 'ok');
    } catch (err) {
      showToast('Зураг байршуулахад алдаа гарлаа', true);
    }
  };

  const handleAudioUpload = async (e, locale) => {
    const file = e.target.files[0];
    if (!file || !selectedFig) return;
    // Soft cap on file size — local-mode uses data URLs in localStorage.
    if (file.size > 5 * 1024 * 1024) {
      showToast(`Файл хэт том (${(file.size / 1024 / 1024).toFixed(1)} MB). 5 MB-аас бага байх ёстой.`, true);
      return;
    }
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const fieldName = locale === 'en' ? 'story_audio_en' : 'story_audio';
      const updated = { ...selectedFig, [fieldName]: file_url };

      if (selectedFig.id) {
        await base44.entities.Figure.update(selectedFig.id, { [fieldName]: file_url });
      }

      setSelectedFig(updated);
      const newFigs = figures.map(f => f.fig_id === updated.fig_id ? updated : f);
      onFiguresChange(newFigs);
      showToast(`${locale === 'en' ? 'Англи' : 'Монгол'} аудио байршуулагдлаа`);
      addLog(`${selectedFig.name} - ${locale} story audio uploaded (${(file.size / 1024).toFixed(0)} KB)`, 'ok');
    } catch (err) {
      showToast('Аудио байршуулахад алдаа гарлаа', true);
    }
  };

  const handleAudioRemove = async (locale) => {
    if (!selectedFig) return;
    const fieldName = locale === 'en' ? 'story_audio_en' : 'story_audio';
    const updated = { ...selectedFig, [fieldName]: null };
    if (selectedFig.id) {
      await base44.entities.Figure.update(selectedFig.id, { [fieldName]: null });
    }
    setSelectedFig(updated);
    const newFigs = figures.map(f => f.fig_id === updated.fig_id ? updated : f);
    onFiguresChange(newFigs);
    showToast('Аудио устгагдлаа');
  };

  const exportDeck = () => {
    const blob = new Blob([JSON.stringify(figures, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mhpc-deck.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Экспортлогдлоо');
  };

  const filteredFigs = figures.filter(f =>
    !figSearch || f.name.toLowerCase().includes(figSearch.toLowerCase())
  );

  const catCounts = {};
  figures.forEach(f => { catCounts[f.cat] = (catCounts[f.cat] || 0) + 1; });

  const elapsed = Math.floor((Date.now() - sessionStart) / 60000);

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <span className="text-xl">⚙️</span>
          <h2 className="font-cinzel text-lg font-bold text-foreground">Админ Панел</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-6 mt-4 bg-muted">
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs font-body">
            <LayoutDashboard className="w-3.5 h-3.5" /> Хянах
          </TabsTrigger>
          <TabsTrigger value="editor" className="gap-1.5 text-xs font-body">
            <Pencil className="w-3.5 h-3.5" /> Засварлах
          </TabsTrigger>
          <TabsTrigger value="deck" className="gap-1.5 text-xs font-body">
            <Grid3X3 className="w-3.5 h-3.5" /> Хөзрүүд
          </TabsTrigger>
          <TabsTrigger value="invites" className="gap-1.5 text-xs font-body">
            <Ticket className="w-3.5 h-3.5" /> Уригдсан код
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 text-xs font-body">
            <Settings className="w-3.5 h-3.5" /> Тохиргоо
          </TabsTrigger>
          <TabsTrigger value="tournaments" className="gap-1.5 text-xs font-body">
            🏆 Тэмцээн
          </TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Нийт Зүтгэлтэн', value: figures.length, ico: '🎴' },
              { label: 'Ангилал', value: Object.keys(CATEGORIES).length, ico: '📂' },
              { label: 'Зурагтай', value: figures.filter(f => f.front_img).length, ico: '🖼️' },
              { label: 'Хугацаа', value: `${elapsed} мин`, ico: '⏱️' },
            ].map((s, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-1">
                <span className="text-2xl">{s.ico}</span>
                <div className="font-cinzel text-xl font-bold text-foreground">{s.value}</div>
                <div className="text-xs text-muted-foreground font-body">{s.label}</div>
              </div>
            ))}
          </div>
          
          {/* Category breakdown */}
          <div className="bg-card border border-border rounded-xl p-4 mb-8">
            <h3 className="font-cinzel text-sm font-bold mb-4">Ангилалын Хуваарилалт</h3>
            <div className="space-y-3">
              {Object.entries(CATEGORIES).map(([key, cat]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-6 text-center">{cat.ico}</span>
                  <span className="text-xs font-body text-muted-foreground w-24">{cat.label}</span>
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${((catCounts[key] || 0) / figures.length) * 100}%`, background: cat.color }}
                    />
                  </div>
                  <span className="text-xs font-body text-muted-foreground w-8 text-right">{catCounts[key] || 0}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Log */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-cinzel text-sm font-bold mb-3">Лог</h3>
            <ScrollArea className="h-48">
              <div className="space-y-1 font-mono text-xs">
                {logs.map((l, i) => (
                  <div key={i} className={`${l.level === 'err' ? 'text-red-400' : l.level === 'warn' ? 'text-yellow-400' : 'text-green-400'}`}>
                    [{l.time}] {l.msg}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        {/* Editor */}
        <TabsContent value="editor" className="flex-1 overflow-hidden p-6">
          <div className="flex gap-6 h-full">
            {/* Figure list */}
            <div className="w-64 flex-shrink-0 flex flex-col gap-3">
              <div className="flex gap-2">
                <Input
                  value={figSearch}
                  onChange={e => setFigSearch(e.target.value)}
                  placeholder="Хайх..."
                  className="bg-muted border-none text-xs font-body"
                />
                <Button size="icon" variant="outline" onClick={addFig}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-1">
                  {filteredFigs.map(f => (
                    <button
                      key={f.fig_id}
                      onClick={() => selectFig(f)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-body transition-colors ${
                        selectedFig?.fig_id === f.fig_id ? 'bg-crimson/20 text-foreground' : 'hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      {f.ico} {f.name}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Edit form */}
            <ScrollArea className="flex-1">
              {selectedFig ? (
                <div className="space-y-4 pr-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-cinzel font-bold text-foreground">{selectedFig.name}</h3>
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" onClick={deleteFig} className="gap-1 text-xs font-body">
                        <Trash2 className="w-3.5 h-3.5" /> Устгах
                      </Button>
                      <Button size="sm" onClick={saveFig} className="gap-1 text-xs font-body bg-crimson hover:bg-crimson/90 text-white">
                        <Save className="w-3.5 h-3.5" /> Хадгалах
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-body">Нэр</label>
                      <Input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="bg-muted border-none text-sm font-body" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-body">Он</label>
                      <Input value={editForm.yrs} onChange={e => setEditForm({...editForm, yrs: e.target.value})} className="bg-muted border-none text-sm font-body" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-body">Хөзрийн нэр</label>
                      <Input value={editForm.card} onChange={e => setEditForm({...editForm, card: e.target.value})} className="bg-muted border-none text-sm font-body" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-body">Ангилал</label>
                      <Select value={editForm.cat} onValueChange={v => setEditForm({...editForm, cat: v})}>
                        <SelectTrigger className="bg-muted border-none text-sm font-body"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(CATEGORIES).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v.ico} {v.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-body">Эможи</label>
                      <Input value={editForm.ico} onChange={e => setEditForm({...editForm, ico: e.target.value})} className="bg-muted border-none text-sm font-body" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-body">Албан тушаал</label>
                      <Input value={editForm.role} onChange={e => setEditForm({...editForm, role: e.target.value})} className="bg-muted border-none text-sm font-body" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-body">Намтар</label>
                    <Textarea value={editForm.bio} onChange={e => setEditForm({...editForm, bio: e.target.value})} className="bg-muted border-none text-sm font-body min-h-[100px]" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-body">Гавьяа (мөр бүрт нэг)</label>
                    <Textarea value={editForm.achs} onChange={e => setEditForm({...editForm, achs: e.target.value})} className="bg-muted border-none text-sm font-body min-h-[80px]" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-body">Сонирхолтой баримт</label>
                    <Textarea value={editForm.fact} onChange={e => setEditForm({...editForm, fact: e.target.value})} className="bg-muted border-none text-sm font-body" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-body">Хэлсэн үг</label>
                      <Input value={editForm.quote || ''} onChange={e => setEditForm({...editForm, quote: e.target.value})} className="bg-muted border-none text-sm font-body" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-body">Эх сурвалж</label>
                      <Input value={editForm.qattr || ''} onChange={e => setEditForm({...editForm, qattr: e.target.value})} className="bg-muted border-none text-sm font-body" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-body">Холбоотой ID-ууд (таслалаар)</label>
                    <Input value={editForm.rel} onChange={e => setEditForm({...editForm, rel: e.target.value})} className="bg-muted border-none text-sm font-body" />
                  </div>

                  {/* Storytelling */}
                  <div className="space-y-3 pt-2 border-t border-border">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🎙️</span>
                      <h4 className="text-sm font-cinzel font-semibold text-foreground">Түүхэн Яриа</h4>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-body">
                      <strong>Дуу хоолой</strong>: Урьдчилан бичсэн MP3 файл байвал тэр нь тоглогдоно. Хоосон үлдвэл доорх <strong>текстийг</strong> хөтчийн TTS уншина.
                    </p>

                    {/* Pre-recorded audio upload — MN + EN */}
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { key: 'mn', label: 'Аудио (Монгол)', field: 'story_audio' },
                        { key: 'en', label: 'Audio (English)', field: 'story_audio_en' },
                      ].map(slot => {
                        const url = selectedFig[slot.field];
                        return (
                          <div key={slot.key} className="space-y-2">
                            <label className="text-xs text-muted-foreground font-body">{slot.label}</label>
                            {url ? (
                              <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/30">
                                <audio
                                  src={url}
                                  controls
                                  preload="metadata"
                                  className="w-full h-9"
                                />
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] text-muted-foreground font-mono truncate">
                                    🎵 {url.startsWith('data:') ? 'data URL' : url.split('/').pop()}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-7 text-xs flex-shrink-0"
                                    onClick={() => handleAudioRemove(slot.key)}
                                  >
                                    Устгах
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <label className="flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed border-border hover:border-gold cursor-pointer transition-colors">
                                <Upload className="w-5 h-5 text-muted-foreground mb-1" />
                                <span className="text-xs text-muted-foreground font-body">MP3 / WAV байршуулах</span>
                                <span className="text-[9px] text-muted-foreground/60 font-body mt-0.5">(дээд тал нь 5 MB)</span>
                                <input
                                  type="file"
                                  accept="audio/*"
                                  className="hidden"
                                  onChange={e => handleAudioUpload(e, slot.key)}
                                />
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Fallback TTS scripts */}
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-body">Түүх — текст (Монгол) <span className="text-muted-foreground/60">/ TTS-д</span></label>
                      <Textarea
                        value={editForm.story}
                        onChange={e => setEditForm({ ...editForm, story: e.target.value })}
                        placeholder="Аудио байхгүй үед энэ текстийг хөтөч уншина..."
                        className="bg-muted border-none text-sm font-body min-h-[100px]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-body">Story — text (English) <span className="text-muted-foreground/60">/ TTS fallback</span></label>
                      <Textarea
                        value={editForm.story_en}
                        onChange={e => setEditForm({ ...editForm, story_en: e.target.value })}
                        placeholder="Spoken-word narration for EN mode…"
                        className="bg-muted border-none text-sm font-body min-h-[100px]"
                      />
                    </div>
                  </div>

                  {/* Image upload */}
                  <div className="space-y-3">
                    <h4 className="text-xs text-muted-foreground font-body font-semibold">Зурагнууд</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {['front', 'back'].map(side => (
                        <div key={side} className="space-y-2">
                          <label className="text-xs text-muted-foreground font-body">{side === 'front' ? 'Нүүр' : 'Ар'} зураг</label>
                          {selectedFig[`${side}_img`] ? (
                            <div className="relative rounded-lg overflow-hidden border border-border">
                              <img src={selectedFig[`${side}_img`]} alt={side} className="w-full h-32 object-cover" crossOrigin="anonymous" />
                              <Button
                                size="sm"
                                variant="destructive"
                                className="absolute top-2 right-2 h-7 text-xs"
                                onClick={async () => {
                                  const updated = { ...selectedFig, [`${side}_img`]: null };
                                  if (selectedFig.id) {
                                    await base44.entities.Figure.update(selectedFig.id, { [`${side}_img`]: null });
                                  }
                                  setSelectedFig(updated);
                                  const newFigs = figures.map(f => f.fig_id === updated.fig_id ? updated : f);
                                  onFiguresChange(newFigs);
                                  showToast('Зураг устгагдлаа');
                                }}
                              >
                                Устгах
                              </Button>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed border-border hover:border-gold cursor-pointer transition-colors">
                              <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                              <span className="text-xs text-muted-foreground font-body">Зураг оруулах</span>
                              <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, side)} />
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground font-body text-sm">
                  Зүүн талаас зүтгэлтэн сонгоно уу
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>

        {/* Deck */}
        <TabsContent value="deck" className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {figures.map(f => (
              <button
                key={f.fig_id}
                onClick={() => selectFig(f)}
                className="bg-card border border-border rounded-lg p-3 text-center hover:border-gold transition-colors space-y-1"
              >
                <span className="text-2xl block">{f.ico}</span>
                <p className="text-[10px] font-body text-foreground truncate">{f.name}</p>
                <p className="text-[9px] text-muted-foreground font-body truncate">{f.card}</p>
                <Badge variant="outline" className="text-[8px] px-1 py-0" style={{ borderColor: CATEGORIES[f.cat]?.color, color: CATEGORIES[f.cat]?.color }}>
                  {CATEGORIES[f.cat]?.label}
                </Badge>
              </button>
            ))}
          </div>
        </TabsContent>

        {/* Invites */}
        <TabsContent value="invites" className="flex-1 overflow-auto p-6">
          <InvitesTab onToast={showToast} onLog={addLog} />
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings" className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto space-y-8">

            {/* Branding */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-gold" />
                <h3 className="font-cinzel font-bold text-foreground">Сайтын Нэр & Лого</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-body">Лого (emoji)</label>
                  <Input
                    value={brandForm.site_logo}
                    onChange={e => setBrandForm(f => ({ ...f, site_logo: e.target.value }))}
                    className="bg-muted border-none text-2xl font-body w-20"
                    placeholder="🏇"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-body">Сайтын нэр</label>
                  <Input
                    value={brandForm.site_name}
                    onChange={e => setBrandForm(f => ({ ...f, site_name: e.target.value }))}
                    className="bg-muted border-none text-sm font-body"
                    placeholder="Altan Domog"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-xl bg-muted px-4 py-2 flex items-center gap-2">
                  <span className="text-xl">{brandForm.site_logo || '🏇'}</span>
                  <span className="font-cinzel text-sm font-bold text-foreground">{brandForm.site_name || 'Altan Domog'}</span>
                </div>
                <Button
                  onClick={async () => {
                    await saveSetting('site_logo', brandForm.site_logo || '🏇');
                    await saveSetting('site_name', brandForm.site_name || 'Altan Domog');
                    showToast('Брэнд хадгаллаа!');
                    addLog('Сайтын нэр/лого шинэчлэгдлээ', 'ok');
                  }}
                  className="bg-gold text-background hover:bg-gold/90 font-body gap-1.5 text-sm shrink-0"
                >
                  <Save className="w-3.5 h-3.5" /> Хадгалах
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground font-body">Өөрчлөлт бүх төхөөрөмж дээр шууд тусна.</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h3 className="font-cinzel font-bold text-foreground">📦 Экспорт</h3>
              <Button onClick={exportDeck} variant="outline" className="gap-2 font-body text-sm">
                <Download className="w-4 h-4" /> JSON татах
              </Button>
            </div>
          </div>
        </TabsContent>
        {/* Tournaments */}
        <TabsContent value="tournaments" className="flex-1 overflow-auto p-6">
          <AdminTournaments onToast={showToast} />
        </TabsContent>

      </Tabs>

      {/* Toast */}
      {toast && <AdminToast message={toast.message} isError={toast.isError} />}
    </div>
  );
}

function InvitesTab({ onToast, onLog }) {
  const [invites, setInvites] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [copiedId, setCopiedId] = useState(null);
  const [grantsAdmin, setGrantsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const [invs, accs] = await Promise.all([listInviteCodes(), listAccounts()]);
      setInvites(invs);
      setAccounts(accs);
    } catch (e) {
      onToast('Код ачаалахад алдаа: ' + (e.message ?? e), true);
    }
  };

  useEffect(() => { refresh(); }, []);

  const accountById = (id) => accounts.find(a => a.id === id);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const record = await createInviteCode({ grants_admin: grantsAdmin });
      await refresh();
      onToast(`Код үүсгэлээ: ${record.code}`);
      onLog(`Уригдсан код үүслээ: ${record.code}${grantsAdmin ? ' (админ)' : ''}`, 'ok');
    } catch (e) {
      onToast('Алдаа: ' + (e.message ?? e), true);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id, code) => {
    if (!confirm(`"${code}" кодыг устгах уу?`)) return;
    try {
      await deleteInviteCode(code);
      await refresh();
      onToast('Код устгагдлаа');
      onLog(`Код устгагдлаа: ${code}`, 'warn');
    } catch (e) {
      onToast('Алдаа: ' + (e.message ?? e), true);
    }
  };

  const handleCopy = async (code, id) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1200);
    } catch {
      onToast('Хуулж чадсангүй', true);
    }
  };

  const available = invites.filter(i => !i.used_by).length;
  const used = invites.length - available;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Нийт', value: invites.length, ico: '🎟️' },
          { label: 'Боломжит', value: available, ico: '🟢' },
          { label: 'Ашиглагдсан', value: used, ico: '✔️' },
        ].map((s, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-1">
            <span className="text-2xl">{s.ico}</span>
            <div className="font-cinzel text-xl font-bold text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground font-body">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-cinzel font-bold text-foreground">Кодын жагсаалт</h3>
          <p className="text-xs text-muted-foreground font-body">Нэг код → нэг данс үүсгэх эрх</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-body text-foreground">
            <input type="checkbox" checked={grantsAdmin} onChange={e => setGrantsAdmin(e.target.checked)} />
            <span>Админ эрх олгох</span>
          </label>
          <Button onClick={handleCreate} disabled={busy} className="gap-1.5 font-body text-sm bg-gold text-background hover:bg-gold/90">
            <Plus className="w-4 h-4" /> {busy ? 'Үүсгэж байна…' : 'Шинэ код үүсгэх'}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {invites.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground font-body">
            Кодын жагсаалт хоосон байна. "Шинэ код үүсгэх" дарна уу.
          </div>
        ) : (
          <table className="w-full text-sm font-body">
            <thead className="bg-muted/50 text-muted-foreground text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-normal">Код</th>
                <th className="text-left px-4 py-2 font-normal">Төлөв</th>
                <th className="text-left px-4 py-2 font-normal">Ашигласан</th>
                <th className="text-right px-4 py-2 font-normal">Үйлдэл</th>
              </tr>
            </thead>
            <tbody>
              {invites.map(inv => {
                const acc = inv.used_by ? accountById(inv.used_by) : null;
                const isUsed = !!inv.used_by;
                return (
                  <tr key={inv.id} className="border-t border-border">
                    <td className="px-4 py-2 font-mono tracking-widest text-foreground">{inv.code}</td>
                    <td className="px-4 py-2">
                      <Badge
                        variant="outline"
                        className={isUsed
                          ? 'border-muted text-muted-foreground'
                          : 'border-green-500/60 text-green-400'}
                      >
                        {isUsed ? 'Ашиглагдсан' : 'Боломжит'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {isUsed ? (
                        <div>
                          <div className="text-foreground">{acc?.username || '—'}</div>
                          <div className="text-muted-foreground">
                            {new Date(inv.used_at).toLocaleString('mn-MN')}
                          </div>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {!isUsed && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => handleCopy(inv.code, inv.id)}
                            title="Хуулах"
                          >
                            {copiedId === inv.id
                              ? <Check className="w-3.5 h-3.5 text-green-400" />
                              : <Copy className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                          onClick={() => handleDelete(inv.id, inv.code)}
                          title="Устгах"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted-foreground font-body">
        💡 Боломжит кодыг бусдад өгвөл тэд "Код ашиглах" хэсэгт оруулж, <strong>нэг</strong> данс үүсгэх боломжтой болно.
        Код ашиглагдсаны дараа дахин хэрэглэгдэхгүй.
      </p>
    </div>
  );
}