'use client';

import { useEffect, useState } from 'react';

/**
 * Seconds left until `closesAt`, corrected for the difference between this
 * device's clock and the server's (`offsetMs` = server time − device time).
 * Calls `onEnd` once when the countdown reaches zero.
 */
export function useCountdown(closesAt: string | null | undefined, offsetMs: number, onEnd?: () => void) {
  const end = closesAt ? new Date(closesAt).getTime() : null;
  const calc = () => (end === null ? null : Math.max(0, Math.ceil((end - (Date.now() + offsetMs)) / 1000)));
  const [left, setLeft] = useState<number | null>(calc);

  useEffect(() => {
    setLeft(calc());
    if (end === null) return;
    let fired = false;
    const tick = () => {
      const v = calc();
      setLeft(v);
      if (v === 0 && !fired) {
        fired = true;
        onEnd?.();
      }
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end, offsetMs]);

  return left;
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Circular countdown in the site palette; turns red in the last 10 seconds. */
export function CountdownRing({
  left,
  total,
  dark = false,
  size = 'md',
}: {
  left: number;
  total: number;
  dark?: boolean;
  size?: 'md' | 'lg';
}) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, left / total) : 0;
  const urgent = left <= 10;
  return (
    <div
      className={`countdown countdown--${size}${dark ? ' countdown--dark' : ''}${urgent ? ' countdown--urgent' : ''}`}
      role="timer"
      aria-live={urgent ? 'assertive' : 'off'}
      aria-label={`${left} seconds left`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="countdown__track" cx="50" cy="50" r={r} />
        <circle
          className="countdown__bar"
          cx="50"
          cy="50"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="countdown__text">{left >= 60 ? clock(left) : left}</span>
    </div>
  );
}
