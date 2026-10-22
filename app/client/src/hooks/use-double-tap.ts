import { useCallback, useRef } from 'react';
import type { TouchEvent } from 'react';

const MOVE_TOLERANCE_PX = 10;

// iOS Safari never fires `dblclick` on a double tap (it zooms instead), so touch needs its own detector.
export function useDoubleTap(delayMs = 300) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef<{ el: EventTarget; time: number } | null>(null);

  return useCallback(
    (callback: () => void) => ({
      onDoubleClick: callback,
      onTouchStart: (e: TouchEvent) => {
        const t = e.touches[0];
        touchStart.current = { x: t.clientX, y: t.clientY };
      },
      onTouchEnd: (e: TouchEvent) => {
        const t = e.changedTouches[0];
        const start = touchStart.current;
        if (!start || Math.hypot(t.clientX - start.x, t.clientY - start.y) > MOVE_TOLERANCE_PX) {
          lastTap.current = null;
          return;
        }
        const now = Date.now();
        const prev = lastTap.current;
        if (prev && prev.el === e.currentTarget && now - prev.time < delayMs) {
          lastTap.current = null;
          e.preventDefault();
          callback();
        } else {
          lastTap.current = { el: e.currentTarget, time: now };
        }
      },
    }),
    [delayMs],
  );
}
