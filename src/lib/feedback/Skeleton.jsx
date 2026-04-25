const PULSE = 'animate-pulse bg-brass/10';

function Card({ className = '' }) {
  return (
    <div
      data-skeleton-cell
      aria-hidden="true"
      className={`${PULSE} aspect-[3/4] rounded-xl ${className}`}
    />
  );
}

function Row({ className = '' }) {
  return (
    <div
      data-skeleton-cell
      aria-hidden="true"
      className={`${PULSE} h-12 w-full rounded ${className}`}
    />
  );
}

function Grid({ count = 12, variant = 'card', className = '' }) {
  const Cell = variant === 'row' ? Row : Card;
  const wrap =
    variant === 'row'
      ? `flex flex-col gap-2 ${className}`
      : `grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 ${className}`;
  return (
    <div aria-hidden="true" className={wrap}>
      {Array.from({ length: count }).map((_, i) => (
        <Cell key={i} />
      ))}
    </div>
  );
}

function Text({ lines = 3, className = '' }) {
  const widths = ['w-full', 'w-3/4', 'w-5/6'];
  return (
    <div aria-hidden="true" className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          data-skeleton-line
          className={`${PULSE} h-4 rounded ${widths[i % widths.length]}`}
        />
      ))}
    </div>
  );
}

export const Skeleton = { Card, Row, Grid, Text };
