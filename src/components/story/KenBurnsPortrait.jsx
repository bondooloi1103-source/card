import { motion, AnimatePresence } from 'framer-motion';

export default function KenBurnsPortrait({ figure, className = '' }) {
  const src = figure?.front_img || '';
  return (
    <div className={`relative overflow-hidden bg-ink ${className}`}>
      <AnimatePresence mode="wait">
        <motion.div
          key={figure?.fig_id || 'empty'}
          initial={{ opacity: 0, scale: 1.0, x: 0, y: 0 }}
          animate={{
            opacity: 1,
            scale: [1.0, 1.08, 1.0],
            x: ['0%', '-3%', '0%'],
            y: ['0%', '-2%', '0%'],
          }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: 0.6 },
            scale: { duration: 20, repeat: Infinity, ease: 'easeInOut' },
            x:     { duration: 20, repeat: Infinity, ease: 'easeInOut' },
            y:     { duration: 20, repeat: Infinity, ease: 'easeInOut' },
          }}
          className="absolute inset-0"
          style={{
            backgroundImage: src ? `url(${src})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'sepia(0.2) contrast(1.05)',
          }}
        />
      </AnimatePresence>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: 'inset 0 0 120px 40px rgba(20,14,6,0.7)' }}
      />
    </div>
  );
}
