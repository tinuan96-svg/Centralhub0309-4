'use client';

import { ReactNode, useLayoutEffect, useRef } from 'react';
import { metricTileSpan } from '@/lib/dashboard/refreshQueue';

export default function MetricMasonry({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const grid = root.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const measure = () => {
      const style = getComputedStyle(grid);
      const gap = parseFloat(style.rowGap) || 12;
      // Read intrinsic card heights before changing grid placement.
      const cards = Array.from(grid.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
      const spans = cards.map(card => metricTileSpan(card.getBoundingClientRect().height, 8, gap));
      cards.forEach((card, i) => { card.style.gridRowEnd = 'span ' + spans[i]; });
      grid.dataset.packed = 'true';
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    const observeCards = () => { observer.disconnect(); observer.observe(grid); Array.from(grid.children).forEach(card => observer.observe(card)); schedule(); };
    const childrenObserver = new MutationObserver(observeCards);
    childrenObserver.observe(grid, { childList: true });
    observeCards();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); childrenObserver.disconnect(); };
  }, []);
  return <div ref={root} className="ch-section-visual-grid ch-metric-masonry">{children}</div>;
}
