// A figure that counts up to its value as the data lands (and from the old
// value to the new one when it changes). Still for people who ask for less motion.
import { useEffect, useRef, useState } from 'react';

const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function CountUp({ value, format, ms = 700 }: { value: number; format: (n: number) => string; ms?: number }) {
  const [shown, setShown] = useState(() => (still() ? value : 0));
  const from = useRef(0);
  useEffect(() => {
    if (still() || !Number.isFinite(value)) {
      setShown(value);
      from.current = value;
      return;
    }
    const a = from.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      // A frame's own clock can read a little earlier than `start` (the frame began before this effect
      // ran): without the floor, the first frame showed a small negative number.
      const p = Math.min(1, Math.max(0, (now - start) / ms));
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(p === 1 ? value : a + (value - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, ms]);
  return <>{format(Number.isInteger(value) ? Math.round(shown) : shown)}</>;
}
