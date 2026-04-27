import React from 'react';
import { Check } from 'lucide-react';
import useScrollReveal from './useScrollReveal';
import GoldDivider from './GoldDivider';
import GoldButton from './GoldButton';

const tiers = [
  {
    key: 'basic',
    name: 'Энгийн хувилбар',
    price: '29,900₮',
    features: [
      '52 хөзөр бүхий багц',
      'QR код бүхий AI чат',
      'Монгол хэлний дэмжлэг',
      'Стандарт хайрцаг',
    ],
    highlighted: false,
  },
  {
    key: 'premium',
    name: 'Premium хувилбар',
    price: '49,900₮',
    features: [
      '52 хөзөр + 4 тусгай хөзөр',
      'QR код бүхий AI чат',
      '3 хэлний дэмжлэг',
      'Дуут тайлбар',
      'Premium хайрцаг',
    ],
    highlighted: true,
  },
  {
    key: 'collector',
    name: 'Collector Edition',
    price: '99,000₮',
    features: [
      '56 хөзөр + 8 тусгай хөзөр',
      'QR код бүхий AI чат',
      '3 хэлний дэмжлэг',
      'Дуут тайлбар',
      'Алтан хүрээтэй хайрцаг',
      'Дугаарлагдсан хувилбар',
      'Гарын үсэгтэй сертификат',
    ],
    highlighted: false,
  },
];

function PricingCard({ tier, index }) {
  const { ref, isVisible } = useScrollReveal(0.2);

  return (
    <div
      ref={ref}
      className="relative flex flex-col rounded-xl p-6 sm:p-8 transition-all duration-700"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(40px)',
        transitionDelay: `${index * 150}ms`,
        border: tier.highlighted ? '1.5px solid #c9a84c' : '1px solid rgba(201,168,76,0.2)',
        background: tier.highlighted ? 'rgba(201,168,76,0.06)' : 'rgba(26,18,0,0.4)',
      }}
    >
      {tier.highlighted && (
        <div
          className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-1 rounded-full font-cormorant text-sm font-semibold uppercase tracking-widest"
          style={{ background: '#c9a84c', color: '#0a0c14' }}
        >
          Хамгийн их сонгодог
        </div>
      )}
      <div className="text-center mb-8">
        <h3 className="font-playfair text-2xl font-bold mb-4" style={{ color: '#e8d5a3' }}>
          {tier.name}
        </h3>
        <div className="font-playfair text-4xl sm:text-5xl font-black" style={{ color: '#c9a84c' }}>
          {tier.price}
        </div>
      </div>
      <div className="flex-1">
        <ul className="space-y-4">
          {tier.features.map((feature, i) => (
            <li key={i} className="flex items-start gap-3">
              <Check className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#c9a84c' }} />
              <span className="font-cormorant text-base" style={{ color: '#e8d5a3cc' }}>
                {feature}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-8">
        <GoldButton to={`/order?tier=${tier.key}`} className="w-full">Захиалах</GoldButton>
      </div>
    </div>
  );
}

export default function Pricing() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section id="pricing" className="py-16 sm:py-20 md:py-24 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-5xl mx-auto">
        <div
          ref={ref}
          className="text-center mb-16 transition-all duration-700"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'translateY(0)' : 'translateY(30px)',
          }}
        >
          <h2 className="font-playfair text-3xl sm:text-4xl md:text-5xl font-bold mb-4" style={{ color: '#c9a84c' }}>
            Үнийн санал
          </h2>
          <p className="font-cormorant text-lg max-w-2xl mx-auto" style={{ color: '#e8d5a380' }}>
            Өөртөө суралцах, хайртай хүндээ бэлэглэх, эсвэл цуглуулагчийн хайрцагт үлдээх — гурван түвшин.
          </p>
        </div>
        <GoldDivider />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 mt-12 sm:mt-16">
          {tiers.map((tier, i) => (
            <PricingCard key={i} tier={tier} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
