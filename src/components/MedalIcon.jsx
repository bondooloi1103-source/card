const MEDAL = {
  tournament_gold:   { fill: '#C8992A', stroke: '#8B6914', label: '🥇' },
  tournament_silver: { fill: '#9EA8B4', stroke: '#5C6570', label: '🥈' },
  tournament_bronze: { fill: '#A0684A', stroke: '#6B3F28', label: '🥉' },
};

export default function MedalIcon({ kind, size = 22, className = '', title }) {
  const m = MEDAL[kind];
  if (!m) return null;
  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      title={title}
      style={{ width: size, height: size, fontSize: size * 0.8 }}
      role="img"
      aria-label={title ?? kind}
    >
      {m.label}
    </span>
  );
}

export function medalKind(rank) {
  if (rank === 1) return 'tournament_gold';
  if (rank === 2) return 'tournament_silver';
  if (rank === 3) return 'tournament_bronze';
  return null;
}
