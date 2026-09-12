'use client';

/**
 * Visual-only Shruthi skin.
 *
 * Keep this component free of DOM mutation observers. The assistant is highly
 * dynamic while listening/processing/speaking, and repeatedly rewriting its
 * DOM from a MutationObserver can create a self-triggering render loop that
 * blocks pointer input. User-facing text is owned by the React components;
 * this file only paints the approved Shruthi imagery.
 */
export default function ShruthiIdentitySkin() {
  return (
    <style jsx global>{`
      .nora-screen::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        background:
          linear-gradient(180deg, rgba(1,4,10,.18), rgba(1,4,10,.78)),
          url('/shruthi-portrait.png') center 20% / cover no-repeat;
        opacity: .12;
        filter: saturate(.82) contrast(1.04);
        mask-image: radial-gradient(circle at 50% 34%, #000 0 18%, rgba(0,0,0,.52) 43%, transparent 78%);
      }

      .nora-orb-core {
        isolation: isolate;
      }

      .nora-orb-core::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 3;
        border-radius: inherit;
        pointer-events: none;
        background:
          linear-gradient(180deg, rgba(3,8,18,.02), rgba(3,8,18,.28)),
          url('/shruthi-avatar.png') center 30% / cover no-repeat;
        filter: saturate(.94) contrast(1.02);
      }

      .nora-orb-core::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 4;
        border-radius: inherit;
        pointer-events: none;
        box-shadow:
          inset 0 0 22px rgba(117,205,255,.16),
          inset 0 -28px 45px rgba(1,5,12,.35);
        background: radial-gradient(circle at 50% 32%, transparent 38%, rgba(3,10,22,.16) 74%, rgba(3,10,22,.36));
      }

      .nora-orb-flow,
      .nora-orb-stars {
        z-index: 5;
        opacity: .12 !important;
        mix-blend-mode: screen;
        pointer-events: none;
      }

      .nora-speaking .nora-orb-core::after,
      .nora-listening .nora-orb-core::after {
        animation: shruthi-soft-glow 1.9s ease-in-out infinite;
      }

      @keyframes shruthi-soft-glow {
        0%, 100% { box-shadow: inset 0 0 20px rgba(117,205,255,.14), inset 0 -28px 45px rgba(1,5,12,.34); }
        50% { box-shadow: inset 0 0 34px rgba(117,205,255,.30), inset 0 -24px 40px rgba(1,5,12,.20); }
      }

      @media (max-width: 699px) {
        .nora-screen::after {
          background-position: center 18%;
          opacity: .09;
        }
      }
    `}</style>
  );
}
