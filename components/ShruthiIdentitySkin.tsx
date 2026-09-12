'use client';

import { useEffect } from 'react';

const SHRUTHI_NAME = 'Shruthi';

function replaceAttribute(el: Element, name: string) {
  const value = el.getAttribute(name);
  if (!value || !/nora/i.test(value)) return;
  el.setAttribute(name, value.replace(/NORA/gi, SHRUTHI_NAME).replace(/Nora/g, SHRUTHI_NAME));
}

function applyShruthiIdentity() {
  const screen = document.querySelector('.nora-screen');
  if (screen) {
    screen.setAttribute('aria-label', 'Shruthi AI Executive Assistant');

    const title = screen.querySelector('h2');
    if (title) title.textContent = 'SHRUTHI · ശ്രുതി';

    screen.querySelectorAll('.nora-processing-card').forEach((el) => {
      if (/NORA/i.test(el.textContent || '')) {
        el.textContent = (el.textContent || '').replace(/NORA/gi, 'Shruthi');
      }
    });

    screen.querySelectorAll('.nora-card-label').forEach((el) => {
      if ((el.textContent || '').trim().toUpperCase() === 'NORA') el.textContent = 'SHRUTHI';
    });

    // Keep the current native wake cue truthful until Picovoice owner-lock is active.
    // NORA remains a supported legacy wake alias during the migration to Shruthi.

    screen.querySelectorAll('input[placeholder], button[aria-label], [title]').forEach((el) => {
      replaceAttribute(el, 'placeholder');
      replaceAttribute(el, 'aria-label');
      replaceAttribute(el, 'title');
    });
  }

  document.querySelectorAll('button[aria-label], img[alt], input[placeholder]').forEach((el) => {
    replaceAttribute(el, 'aria-label');
    replaceAttribute(el, 'alt');
    replaceAttribute(el, 'placeholder');
  });

  document.querySelectorAll('h2, span, p, div').forEach((el) => {
    if (el.children.length) return;
    const text = (el.textContent || '').trim();
    if (!text) return;
    if (text === 'NORA · Live Action') el.textContent = 'SHRUTHI · Live Action';
    else if (text === 'NORA LIVE ACTION') el.textContent = 'SHRUTHI LIVE ACTION';
    else if (text === 'NORA is preparing the browser view') el.textContent = 'Shruthi is preparing the browser view';
    else if (text === 'NORA needs your input') el.textContent = 'Shruthi needs your input';
  });

  document.querySelectorAll('button[aria-label*="Shruthi"]').forEach((el) => {
    const label = el.getAttribute('aria-label') || '';
    if (/^(Open|Talk to) Shruthi/i.test(label)) el.classList.add('shruthi-launcher');
  });
}

export default function ShruthiIdentitySkin() {
  useEffect(() => {
    applyShruthiIdentity();
    const observer = new MutationObserver(() => applyShruthiIdentity());
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'placeholder', 'alt', 'title'],
    });
    return () => observer.disconnect();
  }, []);

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
      }

      .nora-speaking .nora-orb-core::after,
      .nora-listening .nora-orb-core::after {
        animation: shruthi-soft-glow 1.9s ease-in-out infinite;
      }

      .shruthi-launcher {
        background-image:
          linear-gradient(180deg, rgba(4,11,24,.02), rgba(4,11,24,.25)),
          url('/shruthi-avatar.png') !important;
        background-position: center 28% !important;
        background-size: cover !important;
        color: transparent !important;
        border-color: rgba(125,211,252,.55) !important;
        box-shadow: 0 0 0 2px rgba(87,184,255,.12), 0 0 28px rgba(43,147,255,.32) !important;
      }

      .shruthi-launcher svg {
        opacity: 0;
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
