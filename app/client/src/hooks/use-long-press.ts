import { useRef, useCallback } from 'react';

export function useLongPress(callback: () => void, delay = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const start = useCallback((e: React.TouchEvent) => {
    startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    timer.current = setTimeout(() => {
      navigator.vibrate?.(40);
      callback();
    }, delay);
  }, [callback, delay]);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    startPos.current = null;
  }, []);

  const move = useCallback((e: React.TouchEvent) => {
    if (!startPos.current) return;
    const dx = e.touches[0].clientX - startPos.current.x;
    const dy = e.touches[0].clientY - startPos.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 10) cancel();
  }, [cancel]);

  return {
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: cancel,
    onTouchCancel: cancel,
  };
}
