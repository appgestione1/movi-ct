import { useState, useEffect, useRef } from 'react';

export default function FlipNumber({ value }) {
  const [displayed, setDisplayed] = useState(value);
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (value === displayed) return;
    setAnimating(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDisplayed(value);
      setAnimating(false);
    }, 150);
    return () => clearTimeout(timerRef.current);
  }, [value]); // eslint-disable-line

  const pad = (n) => String(Math.max(0, Math.floor(n))).padStart(2, '0');

  return (
    <span className={`digit-block ${animating ? 'digit-change' : ''}`}>
      {pad(displayed)}
    </span>
  );
}
