import { useEffect, useRef, useState } from 'react';

export default function Timer({ sentAt, timerS, onExpire }) {
  const [width, setWidth] = useState(100);
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    const startMs = new Date(sentAt).getTime();
    const totalMs = timerS * 1000;

    function tick() {
      const elapsed = Date.now() - startMs;
      const remaining = Math.max(0, totalMs - elapsed);
      setWidth((remaining / totalMs) * 100);
      if (remaining === 0 && !firedRef.current) {
        firedRef.current = true;
        onExpire?.();
      }
    }

    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [sentAt, timerS, onExpire]);

  return (
    <div className="max-w-md mx-auto h-[2px] bg-brass/20 overflow-hidden">
      <div
        data-testid="timer-bar"
        className="h-full bg-gradient-to-r from-seal to-brass"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
