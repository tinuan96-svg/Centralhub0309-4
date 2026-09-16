import type { ReactNode } from 'react';

export default function OrdersLayout({ children }: { children: ReactNode }) {
  return (
    <div className="orders-route-shell min-w-0 w-full">
      <style>{`
        @media (max-width: 699px) {
          .orders-route-shell > div > div:first-child > .ch-card {
            scroll-snap-type: x proximity;
            scroll-padding-inline: 0.25rem;
            overscroll-behavior-inline: contain;
            -webkit-overflow-scrolling: touch;
            touch-action: pan-x;
          }

          .orders-route-shell > div > div:first-child > .ch-card > button {
            flex: 0 0 auto;
            scroll-snap-align: start;
          }
        }
      `}</style>
      {children}
    </div>
  );
}
