import React from 'react';
import { BookOpen, Bot, Headphones, Globe, Gift, Award } from 'lucide-react';
import useScrollReveal from './useScrollReveal';
import GoldDivider from './GoldDivider';

const features = [
  {
    icon: BookOpen,
    title: '52 зүтгэлтэн',
    desc: 'Хаад, хатад, жанжид, соёлын зүтгэлтэн — МЭ 1162 оноос XX зуун хүртэлх Монголын агуу дүрүүд нэг багцад.',
  },
  {
    icon: Bot,
    title: 'AI түүхэн хөтөч',
    desc: 'Хөзөр бүрийн цаана мэргэжилтний өгөгдлөөр бэлтгэсэн AI — байлдааны тактик, гэр бүл, эш үгийг нэг дор хариулна.',
  },
  {
    icon: Headphones,
    title: 'Дуут намтар',
    desc: 'Монгол дикторын уншсан 2–3 минутын хураангуй — аялалдаа, унтахынхаа өмнө чих шингээж сонсоорой.',
  },
  {
    icon: Globe,
    title: 'Монгол · Eng · 中文',
    desc: 'Гурван хэлний интерфейс ба AI хариулт — гадаадын найз, ач зээд бэлэглэхэд санаа зоволтгүй.',
  },
  {
    icon: Gift,
    title: 'Төрөл бүрийн бэлэг',
    desc: 'Алтан хүрээтэй хайрцаг, мэндчилгээний карт, дугаарлагдсан серийн дугаар — уламжлалт баярт тохирсон бэлэг.',
  },
  {
    icon: Award,
    title: 'Цуглуулагчийн чанар',
    desc: '330 gsm алтан цаас, дулаан товойлгосон лого, UV лак — бат бөх, гоёмсог — хэрэглэж ч, үзүүлж ч урт насална.',
  },
];

function FeatureTile({ feature, index }) {
  const { ref, isVisible } = useScrollReveal(0.2);
  const Icon = feature.icon;

  return (
    <div
      ref={ref}
      className="group p-6 sm:p-8 rounded-xl transition-all duration-700 hover:-translate-y-1"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(40px)',
        transitionDelay: `${index * 100}ms`,
        border: '1px solid rgba(201,168,76,0.15)',
        background: 'rgba(26,18,0,0.5)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(201,168,76,0.4)';
        e.currentTarget.style.background = 'rgba(201,168,76,0.06)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)';
        e.currentTarget.style.background = 'rgba(26,18,0,0.5)';
      }}
    >
      <div
        className="w-14 h-14 rounded-lg flex items-center justify-center mb-5"
        style={{ background: 'rgba(201,168,76,0.1)' }}
      >
        <Icon className="w-7 h-7" style={{ color: '#c9a84c' }} />
      </div>
      <h3 className="font-playfair text-xl font-bold mb-3" style={{ color: '#e8d5a3' }}>
        {feature.title}
      </h3>
      <p className="font-cormorant text-base leading-relaxed" style={{ color: '#e8d5a370' }}>
        {feature.desc}
      </p>
    </div>
  );
}

export default function Features() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section id="features" className="py-16 sm:py-20 md:py-24 px-4 sm:px-6 scroll-mt-20">
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
            Яагаад Алтан Домог?
          </h2>
          <p className="font-cormorant text-lg max-w-2xl mx-auto" style={{ color: '#e8d5a380' }}>
            Энгийн тоглоомын хөзөр биш — судлаачийн өгөгдөл, уран бүтээлчийн дизайн, AI-гийн мэдлэг нэгдсэн цуглуулагчийн эд.
          </p>
        </div>
        <GoldDivider />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 mt-12 sm:mt-16">
          {features.map((f, i) => (
            <FeatureTile key={i} feature={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
