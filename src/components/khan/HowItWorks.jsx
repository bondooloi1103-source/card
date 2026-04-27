import React from 'react';
import { QrCode, MessageCircle, HelpCircle, Volume2 } from 'lucide-react';
import useScrollReveal from './useScrollReveal';
import GoldDivider from './GoldDivider';

const steps = [
  {
    icon: QrCode,
    title: 'QR код уншуулах',
    desc: 'Хөзөр бүрийн арын алтан QR-ыг утсаараа сканнердаж эхэлнэ — апп суулгах шаардлагагүй.',
  },
  {
    icon: MessageCircle,
    title: 'Зүтгэлтэн амилна',
    desc: 'Хөзөрт буй дүр AI-гийн тусламжтайгаар танаас сая асуугдсан юм шиг хариулт өгнө.',
  },
  {
    icon: HelpCircle,
    title: 'Юу ч асуу',
    desc: 'Төрсөн жил, байлдан дагуулалт, гэр бүл, эш үг — танд сонирхолтой зүйлийг эсрэг талаас нь нээ.',
  },
  {
    icon: Volume2,
    title: '3 хэлээр сонс',
    desc: 'Монгол, Англи, Хятад — хариултыг уншуулах эсвэл мэргэжлийн дуу оруулагчийн дуугаар сонсох сонголттой.',
  },
];

function StepCard({ step, index }) {
  const { ref, isVisible } = useScrollReveal(0.2);
  const Icon = step.icon;

  return (
    <div
      ref={ref}
      className="flex flex-col items-center text-center transition-all duration-700"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(40px)',
        transitionDelay: `${index * 150}ms`,
      }}
    >
      <div className="relative mb-6">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{
            border: '1.5px solid #c9a84c',
            background: 'rgba(201,168,76,0.08)',
          }}
        >
          <Icon className="w-8 h-8" style={{ color: '#c9a84c' }} />
        </div>
        <span
          className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center font-playfair text-sm font-bold"
          style={{ background: '#c9a84c', color: '#0a0c14' }}
        >
          {index + 1}
        </span>
      </div>
      <h3 className="font-playfair text-xl font-bold mb-2" style={{ color: '#e8d5a3' }}>
        {step.title}
      </h3>
      <p className="font-cormorant text-base" style={{ color: '#e8d5a380' }}>
        {step.desc}
      </p>
    </div>
  );
}

export default function HowItWorks() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section id="how" className="py-16 sm:py-20 md:py-24 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div
          ref={ref}
          className="text-center mb-16 transition-all duration-700"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'translateY(0)' : 'translateY(30px)',
          }}
        >
          <h2 className="font-playfair text-3xl sm:text-4xl md:text-5xl font-bold mb-4" style={{ color: '#c9a84c' }}>
            Хэрхэн ажилладаг вэ?
          </h2>
          <p className="font-cormorant text-lg max-w-2xl mx-auto" style={{ color: '#e8d5a380' }}>
            Хөзрөө гартаа барь, утсаараа QR-ыг уншуул — 30 секундэд түүхэн дүртэй нүүр тулан ярилцана.
          </p>
        </div>
        <GoldDivider />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10 lg:gap-12 mt-12 sm:mt-16">
          {steps.map((step, i) => (
            <StepCard key={i} step={step} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
