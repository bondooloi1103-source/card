import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, KeyRound, UserRound, LogIn, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  checkInviteCode,
  registerWithCode,
  login,
  currentSession,
  bootstrapCode,
} from '@/lib/authStore';
import { notify } from '@/lib/feedback';

const REASON_MSG = {
  not_found: 'Код олдсонгүй.',
  already_used: 'Энэ код ашиглагдсан байна.',
  invalid_username: 'Хэрэглэгчийн нэр хоосон байна.',
  weak_password: 'Нууц үг 4-ээс дээш тэмдэгттэй байх ёстой.',
  username_taken: 'Энэ хэрэглэгчийн нэр аль хэдийн бүртгэлтэй.',
  bad_password: 'Нууц үг буруу байна.',
};

const errMsg = (reason) => REASON_MSG[reason] || 'Алдаа гарлаа.';

const panelStyle = { border: '1px solid rgba(201,168,76,0.25)', background: 'rgba(10,12,20,0.85)' };
const inputWrapStyle = { border: '1px solid rgba(201,168,76,0.3)', background: 'rgba(0,0,0,0.3)' };

function PasswordInput({ value, onChange, placeholder = '********', autoFocus = false }) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="relative">
      <Input
        type={reveal ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="text-foreground pr-10"
        style={inputWrapStyle}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        onClick={() => setReveal((r) => !r)}
        aria-label={reveal ? 'Нууц үгийг нуух' : 'Нууц үгийг харах'}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-brass/60 hover:text-brass"
      >
        {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function OtpLogin() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/app';

  const [mode, setMode] = useState('redeem'); // 'redeem' | 'login'
  const [bootstrap, setBootstrap] = useState(null);

  useEffect(() => {
    if (currentSession()) { navigate(next, { replace: true }); return; }
    bootstrapCode().then(setBootstrap);
  }, [navigate, next]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 py-12"
      style={{ background: 'linear-gradient(180deg, #0a0c14 0%, #100d04 50%, #0a0c14 100%)' }}
    >
      <div className="w-full max-w-md rounded-2xl p-8 space-y-6" style={panelStyle}>
        <div className="flex flex-col items-center text-center space-y-3">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ border: '1.5px solid #c9a84c', background: 'rgba(201,168,76,0.1)' }}
          >
            <ShieldCheck className="w-7 h-7" style={{ color: '#c9a84c' }} />
          </div>
          <h1 className="font-playfair text-2xl font-bold" style={{ color: '#e8d5a3' }}>
            {mode === 'redeem' ? 'Уригдсан код ашиглах' : 'Нэвтрэх'}
          </h1>
          <p className="font-cormorant text-sm" style={{ color: '#e8d5a380' }}>
            {mode === 'redeem'
              ? 'Админаас авсан нэг удаагийн кодоо оруулж дансаа үүсгэнэ үү.'
              : 'Өмнө үүсгэсэн дансаараа нэвтэрнэ үү.'}
          </p>
        </div>

        <div className="grid grid-cols-2 rounded-full overflow-hidden text-xs font-cormorant tracking-wider uppercase"
          style={{ border: '1px solid rgba(201,168,76,0.25)' }}
        >
          {[
            { key: 'redeem', label: 'Код ашиглах' },
            { key: 'login', label: 'Нэвтрэх' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setMode(t.key)}
              className="py-2 transition-colors"
              style={{
                background: mode === t.key ? '#c9a84c' : 'transparent',
                color: mode === t.key ? '#0a0c14' : '#e8d5a3',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {mode === 'redeem' && bootstrap && (
          <div
            className="rounded-md p-3 text-xs font-cormorant text-center space-y-1"
            style={{ border: '1px dashed rgba(201,168,76,0.4)', background: 'rgba(201,168,76,0.06)' }}
          >
            <div className="tracking-widest uppercase" style={{ color: '#c9a84c' }}>Шинээр эхэлж байна уу?</div>
            <div style={{ color: '#e8d5a3' }}>
              Анхны код:
              <span className="font-playfair tracking-widest ml-2" style={{ color: '#c9a84c' }}>
                {bootstrap}
              </span>
            </div>
            <div style={{ color: '#e8d5a360' }}>
              Эхний хэрэглэгч энэ кодыг ашиглаад админ руу нэвтэрч, өөр кодуудыг үүсгэнэ.
            </div>
          </div>
        )}

        {mode === 'redeem'
          ? <RedeemForm next={next} navigate={navigate} />
          : <LoginForm next={next} navigate={navigate} />}

        <p className="text-center text-xs font-cormorant" style={{ color: '#e8d5a350' }}>
          <button type="button" onClick={() => navigate('/')} className="underline">Нүүр хуудас руу буцах</button>
        </p>
      </div>
    </div>
  );
}

function RedeemForm({ next, navigate }) {
  const [step, setStep] = useState('code'); // 'code' | 'account'
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submitCode = async (e) => {
    e.preventDefault();
    setError('');
    const result = await checkInviteCode(code);
    if (!result.ok) { setError(errMsg(result.reason)); return; }
    setStep('account');
  };

  const submitAccount = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Нууц үг таарахгүй байна.'); return; }
    setBusy(true);
    const result = await registerWithCode({ code, username, password });
    setBusy(false);
    if (!result.ok) { setError(errMsg(result.reason)); return; }
    notify.success('toast.auth.loginSuccess');
    navigate(next, { replace: true });
  };

  if (step === 'code') {
    return (
      <form className="space-y-4" onSubmit={submitCode}>
        <label className="block space-y-2">
          <span className="text-xs font-cormorant tracking-widest uppercase" style={{ color: '#c9a84c' }}>
            Нэг удаагийн код
          </span>
          <div className="flex items-center gap-2 rounded-md px-3" style={inputWrapStyle}>
            <KeyRound className="w-4 h-4" style={{ color: '#c9a84c' }} />
            <Input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="AB12CD34"
              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-foreground tracking-[0.3em] font-playfair uppercase"
              autoFocus
            />
          </div>
        </label>

        {error && (
          <p role="alert" aria-live="assertive" className="text-sm text-red-400 font-body">{error}</p>
        )}

        <Button
          type="submit"
          disabled={!code.trim()}
          className="w-full text-base font-cormorant tracking-wider uppercase"
          style={{ background: '#c9a84c', color: '#0a0c14' }}
        >
          Үргэлжлүүлэх
        </Button>
      </form>
    );
  }

  return (
    <form className="space-y-4" onSubmit={submitAccount}>
      <div className="rounded-md p-2 text-center text-xs font-cormorant"
        style={{ border: '1px dashed rgba(201,168,76,0.4)', color: '#e8d5a380' }}
      >
        Код: <span className="font-playfair tracking-widest" style={{ color: '#e8d5a3' }}>{code}</span>
      </div>

      <label className="block space-y-2">
        <span className="text-xs font-cormorant tracking-widest uppercase" style={{ color: '#c9a84c' }}>
          Хэрэглэгчийн нэр
        </span>
        <div className="flex items-center gap-2 rounded-md px-3" style={inputWrapStyle}>
          <UserRound className="w-4 h-4" style={{ color: '#c9a84c' }} />
          <Input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="ner"
            className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-foreground"
            autoFocus
          />
        </div>
      </label>

      <label className="block space-y-2">
        <span className="text-xs font-cormorant tracking-widest uppercase" style={{ color: '#c9a84c' }}>
          Нууц үг
        </span>
        <PasswordInput value={password} onChange={e => setPassword(e.target.value)} />
      </label>

      <label className="block space-y-2">
        <span className="text-xs font-cormorant tracking-widest uppercase" style={{ color: '#c9a84c' }}>
          Нууц үг дахин
        </span>
        <PasswordInput value={confirm} onChange={e => setConfirm(e.target.value)} />
      </label>

      {error && (
        <p role="alert" aria-live="assertive" className="text-sm text-red-400 font-body">{error}</p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => { setStep('code'); setError(''); }}
          className="flex-1"
        >
          Буцах
        </Button>
        <Button
          type="submit"
          disabled={busy || !username || !password}
          className="flex-1 font-cormorant tracking-wider uppercase"
          style={{ background: '#c9a84c', color: '#0a0c14' }}
        >
          {busy ? 'Үүсгэж байна…' : 'Данс үүсгэх'}
        </Button>
      </div>
    </form>
  );
}

function LoginForm({ next, navigate }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const result = await login({ username, password });
    setBusy(false);
    if (!result.ok) { setError(errMsg(result.reason)); return; }
    notify.success('toast.auth.loginSuccess');
    navigate(next, { replace: true });
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block space-y-2">
        <span className="text-xs font-cormorant tracking-widest uppercase" style={{ color: '#c9a84c' }}>
          Хэрэглэгчийн нэр
        </span>
        <div className="flex items-center gap-2 rounded-md px-3" style={inputWrapStyle}>
          <UserRound className="w-4 h-4" style={{ color: '#c9a84c' }} />
          <Input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="ner"
            className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-foreground"
            autoFocus
          />
        </div>
      </label>

      <label className="block space-y-2">
        <span className="text-xs font-cormorant tracking-widest uppercase" style={{ color: '#c9a84c' }}>
          Нууц үг
        </span>
        <PasswordInput value={password} onChange={e => setPassword(e.target.value)} />
      </label>

      {error && (
        <p role="alert" aria-live="assertive" className="text-sm text-red-400 font-body">{error}</p>
      )}

      <Button
        type="submit"
        disabled={busy || !username || !password}
        className="w-full text-base font-cormorant tracking-wider uppercase"
        style={{ background: '#c9a84c', color: '#0a0c14' }}
      >
        {busy ? 'Нэвтэрч байна…' : <><LogIn className="w-4 h-4 mr-2" /> Нэвтрэх</>}
      </Button>
    </form>
  );
}
