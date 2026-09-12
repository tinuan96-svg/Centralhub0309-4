'use client';

/**
 * Lightweight visual-only Shruthi skin.
 *
 * Important performance rule: never mutate the assistant DOM from observers and
 * never load the large portrait image when the assistant opens. The portrait is
 * kept as an approved asset for future profile/about surfaces, while the live
 * assistant uses only the avatar to keep Android/Fold WebView interaction fluid.
 */
export default function ShruthiIdentitySkin() {
  return (
    <style jsx global>{`
      .nora-screen {
        contain: layout paint;
      }

      .nora-screen h2 {
        font-size: 0 !important;
      }

      .nora-screen h2::after {
        content: 'SHRUTHI · ശ്രുതി';
        display: inline-block;
        font-size: 2.25rem;
        line-height: 1;
        font-weight: 300;
        letter-spacing: -0.02em;
      }

      .nora-orb-core {
        isolation: isolate;
        contain: paint;
      }

      .nora-orb-core::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 3;
        border-radius: inherit;
        pointer-events: none;
        background:
          linear-gradient(180deg, rgba(3,8,18,.02), rgba(3,8,18,.20)),
          url('/shruthi-avatar.png') center 30% / cover no-repeat;
      }

      .nora-orb-core::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 4;
        border-radius: inherit;
        pointer-events: none;
        background: radial-gradient(circle at 50% 32%, transparent 46%, rgba(3,10,22,.10) 76%, rgba(3,10,22,.28));
        box-shadow: inset 0 0 18px rgba(117,205,255,.16);
      }

      .nora-orb-flow,
      .nora-orb-stars {
        z-index: 5;
        opacity: .08 !important;
        pointer-events: none;
      }

      .nora-speaking .nora-orb-core::after,
      .nora-listening .nora-orb-core::after {
        animation: shruthi-soft-glow 2.4s ease-in-out infinite;
      }

      @keyframes shruthi-soft-glow {
        0%, 100% { box-shadow: inset 0 0 16px rgba(117,205,255,.12); }
        50% { box-shadow: inset 0 0 26px rgba(117,205,255,.24); }
      }

      @media (min-width: 640px) {
        .nora-screen h2::after { font-size: 3rem; }
      }

      @media (prefers-reduced-motion: reduce) {
        .nora-speaking .nora-orb-core::after,
        .nora-listening .nora-orb-core::after {
          animation: none;
        }
      }
    `}</style>
  );
}
