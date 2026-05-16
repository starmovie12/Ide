import { useRef, useCallback } from 'react';

interface LongPressOptions {
  delay?: number;
  onLongPress: () => void;
  onClick?: () => void;
}

interface LongPressHandlers {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

export function useLongPress({ delay = 500, onLongPress, onClick }: LongPressOptions): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  const start = useCallback(() => {
    isLongPressRef.current = false;
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      onLongPress();
    }, delay);
  }, [delay, onLongPress]);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      stop();
      if (!isLongPressRef.current && onClick) {
        onClick();
      }
    },
    [stop, onClick]
  );

  return {
    onMouseDown: (e: React.MouseEvent) => { e.preventDefault(); start(); },
    onMouseUp: handleMouseUp,
    onMouseLeave: (e: React.MouseEvent) => { stop(); },
    onTouchStart: (e: React.TouchEvent) => { start(); },
    onTouchEnd: (e: React.TouchEvent) => {
      stop();
      if (!isLongPressRef.current && onClick) onClick();
    },
  };
}
