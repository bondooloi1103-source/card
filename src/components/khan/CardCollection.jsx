import React from 'react';
import useScrollReveal from './useScrollReveal';
import GoldDivider from './GoldDivider';

const cards = [
  {
    name: 'Чингис Хаан',
    rank: 'K',
    years: '1162–1227',
    image: 'https://media.base44.com/images/public/69e6f6bdacc080e2495e1601/fd166574c_generated_5129f3ac.png',
  },
  {
    name: 'Хубилай Хаан',
    rank: 'K',
    years: '1215–1294',
    image: 'https://media.base44.com/images/public/69e6f6bdacc080e2495e1601/9666c3a54_generated_96f843e3.png',
  },
  {
    name: 'Мандухай Хатан',
    rank: 'Q',
    years: '1449–1510',
    image: 'https://media.base44.com/images/public/69e6f6bdacc080e2495e1601/7d902f937_generated_938aa618.png',
  },
  {
    name: 'Сүбээдэй Баатар',
    rank: 'J',
    years: '1175–1248',
    image: 'https://media.base44.com/images/public/69e6f6bdacc080e2495e1601/3c56968eb_generated_c3091fa9.png',
  },
  {
    name: 'Бөртэ Үжин',
    rank: 'Q',
    years: '1161–1230',
    image: 'https://media.base44.com/images/public/69e6f6bdacc080e2495e1601/0a8798933_generated_e066f3d0.png',
  },
  {
    name: 'Зэв',
    rank: 'A',
    years: '1181–1225',
    image: 'https://media.base44.com/images/public/69e6f6bdacc080e2495e1601/507c0c30a_generated_77486eba.png',
  },
];

function PlayingCard({ card, index }) {
  const { ref, isVisible } = useScrollReveal(0.1);

  return (
    <div
      ref={ref}
      className="group relative flex flex-col items-center transition-all duration-700"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(50px)',
        transitionDelay: `${index * 100}ms`,
      }}
    >
      <div
        className="relative overflow-hidden transition-all duration-500 group-hover:-translate-y-3 w-full max-w-[240px]"
        style={{
          borderRadius: '10px',
          border: '2px solid #d4a843',
          boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
        }}
      >
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10"
          style={{
            boxShadow: 'inset 0 0 30px rgba(201,168,76,0.15), 0 0 40px rgba(201,168,76,0.2)',
            borderRadius: '10px',
          }}
        />
        <img
          src={card.image}
          alt={card.name}
          className="w-full h-auto block"
        />
      </div>
      <div className="mt-4 text-center">
        <h4 className="font-playfair text-lg font-bold" style={{ color: '#e8d5a3' }}>
          {card.name}
        </h4>
        <p className="font-cormorant text-sm" style={{ color: '#c9a84c' }}>
          {card.rank} · {card.years}
        </p>
      </div>
    </div>
  );
}

export default function CardCollection() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section id="cards" className="py-16 sm:py-20 md:py-24 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-7xl mx-auto">
        <div
          ref={ref}
          className="text-center mb-16 transition-all duration-700"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'translateY(0)' : 'translateY(30px)',
          }}
        >
          <h2 className="font-playfair text-3xl sm:text-4xl md:text-5xl font-bold mb-4" style={{ color: '#c9a84c' }}>
            Хөзрийн багцтай танилц
          </h2>
          <p className="font-cormorant text-lg max-w-2xl mx-auto" style={{ color: '#e8d5a380' }}>
            Хаад (K) · Хатад (Q) · Жанжид (J) · Соёлын зүтгэлтэн (A) — дөрвөн үеийн хөзөр, дөрвөн үеийн түүх.
          </p>
        </div>
        <GoldDivider />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6 md:gap-8 mt-12 sm:mt-16">
          {cards.map((card, i) => (
            <PlayingCard key={i} card={card} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
