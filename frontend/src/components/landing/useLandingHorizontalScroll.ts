import type { RefObject } from 'react';
import { useEffect } from 'react';

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

function wheelToHorizontal(strip: HTMLElement, e: WheelEvent): void {
  const overflow = strip.scrollWidth - strip.clientWidth;
  if (overflow <= 1) return;
  if (e.deltaY === 0) return;
  const maxLeft = overflow;
  const atStart = strip.scrollLeft <= 1;
  const atEnd = strip.scrollLeft >= maxLeft - 1;
  if (e.deltaY < 0 && atStart) return;
  if (e.deltaY > 0 && atEnd) return;
  e.preventDefault();
  strip.scrollLeft += e.deltaY;
}

/**
 * Maps vertical wheel to horizontal scroll on `.scroll-wrapper__strip` inside `rootRef`.
 * Skips coarse / touch-primary devices; listeners removed on unmount.
 */
export function useLandingHorizontalScroll(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const mq = window.matchMedia(FINE_POINTER);
    const attached: Array<{ el: HTMLElement; fn: (e: WheelEvent) => void }> = [];

    const sync = () => {
      attached.forEach(({ el, fn }) => el.removeEventListener('wheel', fn));
      attached.length = 0;
      if (!mq.matches) return;
      root.querySelectorAll<HTMLElement>('.scroll-wrapper__strip').forEach((strip) => {
        const fn = (e: WheelEvent) => wheelToHorizontal(strip, e);
        strip.addEventListener('wheel', fn, { passive: false });
        attached.push({ el: strip, fn });
      });
    };

    sync();
    mq.addEventListener('change', sync);
    return () => {
      mq.removeEventListener('change', sync);
      attached.forEach(({ el, fn }) => el.removeEventListener('wheel', fn));
    };
  }, []);
}
