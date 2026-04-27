import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { QrCode, Volume2, ChevronDown, BookMarked } from 'lucide-react';
import GoldButton from './GoldButton';

const cards = [
  {
    rank: 'K',
    suit: '♠',
    name: 'Чингис Хаан',
    years: '1162–1227',
    color: '#e8d5a3',
    image: 'https://media.base44.com/images/public/69e6f6bdacc080e2495e1601/fd166574c_generated_5129f3ac.png',
  },
  {
    rank: 'Q',
    suit: '♥',
    name: 'Бөртэ Үжин',
    years: '1161–1230',
    color: '#e8a0a0',
    image: 'https://media.base44.com/images/public/69e6f6bdacc080e2495e1601/0a8798933_generated_e066f3d0.png',
  },
  {
    rank: 'J',
    suit: '♦',
    name: 'Сүбээдэй Баатар',
    years: '1175–1248',
    color: '#e8c0a0',
    image: 'https://media.base44.com/images/public/69e6f6bdacc080e2495e1601/3c56968eb_generated_c3091fa9.png',
  },
  {
    rank: 'A',
    suit: '♣',
    name: 'Елүй Чуцай',
    years: '1190–1244',
    color: '#e8d5a3',
    image: 'https://media.base44.com/images/public/69e6f6bdacc080e2495e1601/507c0c30a_generated_77486eba.png',
  },
];

const fanAngles = [-18, -6, 6, 18];
const fanOffsets = ['-60px', '-20px', '20px', '60px'];

function PhoneMockup({ scanning, activeCard }) {
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [showLang, setShowLang] = useState(false);

  useEffect(() => {
    if (!scanning) return;
    setMessages([]);
    setTyping(false);
    setShowLang(false);

    const t1 = setTimeout(() => {
      setMessages([{ role: 'ai', text: `Би бол ${activeCard.name}. Миний түүхийг сонсооройтой.` }]);
    }, 800);
    const t2 = setTimeout(() => {
      setMessages(prev => [...prev, { role: 'user', text: 'Та хэзээ төрсөн бэ?' }]);
    }, 2000);
    const t3 = setTimeout(() => setTyping(true), 2800);
    const t4 = setTimeout(() => {
      setTyping(false);
      setMessages(prev => [...prev, { role: 'ai', text: `${activeCard.years} онд төрсөн. Монголын агуу эзэн хаан.` }]);
    }, 4200);
    const t5 = setTimeout(() => setShowLang(true), 5000);

    return () => [t1, t2, t3, t4, t5].forEach(clearTimeout);
  }, [scanning, activeCard]);

  return (
    <div
      className="relative mx-auto"
      style={{
        width: '200px',
        height: '380px',
        borderRadius: '28px',
        background: '#0d0d0d',
        border: '2px solid #333',
        boxShadow: '0 30px 80px rgba(0,0,0,0.8), 0 0 0 1px #222',
        overflow: 'hidden',
      }}
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-5 rounded-b-xl" style={{ background: '#0d0d0d', zIndex: 10 }} />

      {!scanning ? (
        <div className="w-full h-full flex flex-col items-center justify-center" style={{ background: '#111' }}>
          <div className="relative w-28 h-28 mb-4">
            <div className="absolute inset-0 border-2 rounded" style={{ borderColor: '#c9a84c' }} />
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2" style={{ borderColor: '#c9a84c' }} />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2" style={{ borderColor: '#c9a84c' }} />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2" style={{ borderColor: '#c9a84c' }} />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2" style={{ borderColor: '#c9a84c' }} />
            <div
              className="absolute left-0 right-0 h-0.5"
              style={{
                background: 'linear-gradient(to right, transparent, #c9a84c, transparent)',
                animation: 'scanLine 1.5s ease-in-out infinite',
                top: '50%',
              }}
            />
            <QrCode className="absolute inset-0 m-auto w-10 h-10" style={{ color: '#c9a84c44' }} />
          </div>
          <p className="font-cormorant text-xs text-center px-4" style={{ color: '#c9a84c88' }}>
            QR код уншуулах
          </p>
        </div>
      ) : (
        <div className="w-full h-full flex flex-col" style={{ background: '#0f0f0f' }}>
          <div className="px-3 pt-7 pb-2 flex items-center gap-2" style={{ borderBottom: '1px solid #222' }}>
            <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0" style={{ border: '1px solid #c9a84c' }}>
              <img src={activeCard.image} alt="" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="font-playfair text-xs font-bold" style={{ color: '#e8d5a3' }}>{activeCard.name}</p>
              <p className="font-cormorant" style={{ fontSize: '9px', color: '#c9a84c' }}>AI · Онлайн</p>
            </div>
          </div>

          <div className="flex-1 p-2 overflow-hidden flex flex-col gap-2 justify-end">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="rounded-xl px-2 py-1.5 max-w-[75%]"
                  style={{
                    background: msg.role === 'user' ? 'rgba(201,168,76,0.15)' : '#1a1a1a',
                    border: msg.role === 'user' ? '1px solid rgba(201,168,76,0.3)' : '1px solid #2a2a2a',
                    fontSize: '8px',
                    color: '#e8d5a3',
                    fontFamily: 'Cormorant Garamond, serif',
                    lineHeight: '1.4',
                    animation: 'fadeIn 0.3s ease',
                  }}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="rounded-xl px-3 py-2 flex gap-1" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1 h-1 rounded-full" style={{ background: '#c9a84c', animation: `bounce 1s ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {showLang && (
            <div className="px-2 pb-2 flex gap-1 justify-center" style={{ animation: 'fadeIn 0.3s ease' }}>
              {['МОН', 'ENG', '中文'].map((l, i) => (
                <button
                  key={l}
                  className="rounded px-1.5 py-0.5"
                  style={{
                    border: '1px solid rgba(201,168,76,0.4)',
                    color: i === 0 ? '#c9a84c' : '#e8d5a360',
                    fontSize: '7px',
                    background: i === 0 ? 'rgba(201,168,76,0.1)' : 'transparent',
                    fontFamily: 'Cormorant Garamond, serif',
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          )}

          <div className="px-2 pb-3">
            <div className="rounded-full px-3 py-1.5 flex items-center gap-1" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
              <div className="flex-1 h-1.5 rounded" style={{ background: '#2a2a2a' }} />
              <Volume2 style={{ width: '8px', height: '8px', color: '#c9a84c' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CardFan({ activeIndex, onCardClick }) {
  return (
    <div className="relative w-[min(320px,90vw)] aspect-[32/30]">
      {cards.map((card, i) => {
        const isActive = i === activeIndex;
        const angle = fanAngles[i];
        return (
          <div
            key={i}
            onClick={() => onCardClick(i)}
            className="absolute cursor-pointer transition-all duration-500 w-[min(130px,36vw)] aspect-[130/195]"
            style={{
              left: '50%',
              bottom: '0',
              transformOrigin: 'bottom center',
              transform: `translateX(calc(-50% + ${fanOffsets[i]})) rotate(${angle}deg) ${isActive ? 'translateY(-28px) scale(1.08)' : 'scale(1)'}`,
              borderRadius: '10px',
              border: isActive ? '2px solid #c9a84c' : '1.5px solid #d4a843',
              boxShadow: isActive
                ? '0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(201,168,76,0.35)'
                : '0 20px 60px rgba(0,0,0,0.8)',
              overflow: 'hidden',
              zIndex: isActive ? 10 : i + 1,
              background: 'linear-gradient(160deg, #f5e6c8, #d4b87a)',
            }}
          >
            <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
            <div className="absolute top-1 left-1.5 leading-none">
              <div className="font-playfair font-black" style={{ fontSize: '14px', color: '#1a0a00', lineHeight: 1 }}>{card.rank}</div>
              <div style={{ fontSize: '11px', color: i === 1 || i === 2 ? '#8b0000' : '#1a0a00', lineHeight: 1 }}>{card.suit}</div>
            </div>
            <div className="absolute bottom-1 right-1.5 leading-none rotate-180">
              <div className="font-playfair font-black" style={{ fontSize: '14px', color: '#1a0a00', lineHeight: 1 }}>{card.rank}</div>
              <div style={{ fontSize: '11px', color: i === 1 || i === 2 ? '#8b0000' : '#1a0a00', lineHeight: 1 }}>{card.suit}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function HeroSection() {
  const [activeCard, setActiveCard] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState('idle');

  const handleScan = () => {
    if (scanPhase === 'idle') {
      setScanPhase('scanning');
      setTimeout(() => {
        setScanPhase('chatting');
        setScanning(true);
      }, 1500);
    } else {
      setScanPhase('idle');
      setScanning(false);
    }
  };

  const handleCardClick = (i) => {
    setActiveCard(i);
    setScanPhase('idle');
    setScanning(false);
  };

  return (
    <section
      className="relative min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(180deg, #0a0c14 0%, #100d04 50%, #0a0c14 100%)' }}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: '800px', height: '400px', background: 'radial-gradient(ellipse, rgba(201,168,76,0.04) 0%, transparent 70%)' }}
        />
      </div>

      <nav className="relative z-20 flex items-center justify-between px-4 sm:px-6 md:px-8 py-4 sm:py-5 gap-2">
        <div className="font-playfair font-black text-base sm:text-lg md:text-xl tracking-[0.15em] sm:tracking-widest whitespace-nowrap" style={{ color: '#c9a84c' }}>
          ALTAN DOMOG
        </div>
        <div className="hidden md:flex items-center gap-6 lg:gap-8">
          {[
            { label: 'Хэрхэн ажилладаг', href: '#how' },
            { label: 'Цуглуулга', href: '#cards' },
            { label: 'Онцлогууд', href: '#features' },
            { label: 'Үнэ', href: '#pricing' },
          ].map(({ label, href }) => (
            <a key={label} href={href} className="font-cormorant text-base transition-colors duration-300" style={{ color: '#e8d5a370' }}
              onMouseEnter={e => e.target.style.color = '#c9a84c'}
              onMouseLeave={e => e.target.style.color = '#e8d5a370'}
            >
              {label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/collection"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-full font-cormorant text-sm transition-colors"
            style={{ border: '1px solid rgba(201,168,76,0.4)', color: '#e8d5a3' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <BookMarked className="w-4 h-4" /> Цуглуулга
          </Link>
          <GoldButton to="/app" className="text-xs sm:text-sm px-3 sm:px-5 py-2 whitespace-nowrap">Апп руу орох</GoldButton>
        </div>
      </nav>

      <div className="relative z-10 flex-1 flex flex-col lg:flex-row items-center justify-center gap-10 sm:gap-12 lg:gap-20 px-4 sm:px-6 md:px-8 py-8 sm:py-12 max-w-7xl mx-auto w-full">

        <div className="flex flex-col items-center lg:items-start gap-6 sm:gap-8 w-full">
          <div className="text-center lg:text-left">
            <p className="font-cormorant text-xs sm:text-sm tracking-widest uppercase mb-3" style={{ color: '#c9a84c80' }}>
              Алтан Домог · 52 түүхэн зүтгэлтний баглаа
            </p>
            <h1 className="font-playfair text-[2.25rem] leading-[1.05] sm:text-5xl md:text-6xl font-black mb-4" style={{ color: '#e8d5a3' }}>
              ИХ МОНГОЛ УЛСЫН<br />
              <span style={{ color: '#c9a84c' }}>ТҮҮХИЙН ХӨЗӨР</span>
            </h1>
            <p className="font-cormorant text-base sm:text-lg md:text-xl leading-relaxed max-w-md mx-auto lg:mx-0" style={{ color: '#e8d5a380' }}>
              Чингис Хаанаас Занабазар хүртэл — 52 түүхэн дүрийн намтар, ишлэл, гавьяа нэг алтан хөзрийн багцад. QR уншуулмагц AI хөтөч амьсгалтай ярьж өгнө.
            </p>
          </div>

          <div className="flex flex-col items-center">
            <p className="font-cormorant text-sm tracking-widest uppercase mb-6" style={{ color: '#c9a84c60' }}>
              Хөзрийн дизайн жишээ — дарж сонго
            </p>
            <CardFan activeIndex={activeCard} onCardClick={handleCardClick} />
          </div>

          <div className="text-center lg:text-left">
            <div
              className="font-playfair text-2xl font-bold transition-all duration-500"
              style={{ color: '#e8d5a3' }}
            >
              {cards[activeCard].name}
            </div>
            <div className="font-cormorant text-sm" style={{ color: '#c9a84c' }}>
              {cards[activeCard].years} · {cards[activeCard].rank}{cards[activeCard].suit}
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <GoldButton to="/app">Дэлгэрэнгүй үзэх</GoldButton>
            <Link
              to="/order?tier=premium"
              className="px-8 py-3 rounded-full font-cormorant text-lg font-semibold tracking-wider uppercase inline-flex items-center justify-center transition-transform duration-300 hover:scale-[1.03]"
              style={{ background: '#c9a84c', color: '#0a0c14', border: '1.5px solid #c9a84c' }}
            >
              Хөзрийн багц захиалах
            </Link>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6">
          <div className="text-center mb-2">
            <h3 className="font-playfair text-2xl font-bold" style={{ color: '#e8d5a3' }}>
              QR уншуулж AI-тай яриа
            </h3>
            <p className="font-cormorant text-base mt-1" style={{ color: '#e8d5a360' }}>
              Хөзрийг уншуулаад туршиж үзээрэй
            </p>
          </div>

          <PhoneMockup scanning={scanning} activeCard={cards[activeCard]} />

          <button
            onClick={handleScan}
            className="flex items-center gap-3 px-8 py-3 rounded-full font-cormorant text-lg font-semibold tracking-wider uppercase transition-all duration-300"
            style={{
              border: '1.5px solid #c9a84c',
              color: scanPhase === 'chatting' ? '#0a0c14' : '#e8d5a3',
              background: scanPhase === 'chatting' ? '#c9a84c' : scanPhase === 'scanning' ? 'rgba(201,168,76,0.15)' : 'transparent',
              boxShadow: scanPhase === 'scanning' ? '0 0 20px rgba(201,168,76,0.3)' : 'none',
            }}
          >
            {scanPhase === 'idle' && <><QrCode className="w-5 h-5" /> QR Уншуулах</>}
            {scanPhase === 'scanning' && <><div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} /> Уншиж байна...</>}
            {scanPhase === 'chatting' && <><Volume2 className="w-5 h-5" /> Дахин эхлэх</>}
          </button>

          <div className="flex gap-3">
            {[
              { lang: 'Монгол', flag: '🇲🇳' },
              { lang: 'English', flag: '🇺🇸' },
              { lang: '中文', flag: '🇨🇳' },
            ].map(({ lang, flag }) => (
              <div
                key={lang}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full font-cormorant text-sm"
                style={{ border: '1px solid rgba(201,168,76,0.25)', color: '#e8d5a380' }}
              >
                <span>{flag}</span> {lang}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative z-10 flex justify-center pb-8">
        <div className="flex flex-col items-center gap-2 animate-bounce">
          <p className="font-cormorant text-xs tracking-widest uppercase" style={{ color: '#c9a84c40' }}>Доош гүйлгэх</p>
          <ChevronDown className="w-5 h-5" style={{ color: '#c9a84c40' }} />
        </div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, transparent, #0a0c14)' }}
      />

      <style>{`
        @keyframes scanLine {
          0%, 100% { top: 10%; }
          50% { top: 90%; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </section>
  );
}
