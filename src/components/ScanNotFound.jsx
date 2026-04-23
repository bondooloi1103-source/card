import { Link } from 'react-router-dom';
import Fleuron from '@/components/ornaments/Fleuron';

export default function ScanNotFound() {
  return (
    <div className="min-h-screen bg-ink contour-bg flex flex-col items-center justify-center px-6">
      <div className="max-w-md text-center space-y-5">
        <Fleuron size={48} className="mx-auto opacity-80" />
        <h1 className="font-display text-3xl text-ivory" style={{ fontVariationSettings: '"opsz" 72, "SOFT" 60, "WONK" 1' }}>
          Хөзрийг таних боломжгүй
        </h1>
        <p className="font-prose italic text-ivory/70">
          QR код хүчингүй эсвэл 1–52-с гадуурх дугаартай байна. Өөр хөзрөө уншуулна уу.
        </p>
        <Link
          to="/"
          className="inline-block font-meta text-[10px] tracking-[0.32em] uppercase px-6 py-3 border border-brass/50 text-brass hover:text-ivory hover:border-brass transition-colors"
        >
          Нүүр хуудас руу буцах
        </Link>
      </div>
    </div>
  );
}
