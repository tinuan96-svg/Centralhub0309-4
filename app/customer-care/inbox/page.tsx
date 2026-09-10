import InboxClient from './InboxClient';

export default function InboxPage({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <div
      id="support-inbox-page"
      className="h-full min-h-0 overflow-hidden [&>div]:!h-full [&>div]:!max-h-full"
    >
      <style>{`
        /*
         * The left Support Inbox customer/conversation list must own its scroll.
         * This is intentionally scoped to this page so the chat timeline and the
         * main CentralHub/sidebar scrolling remain completely independent.
         */
        #support-inbox-page {
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }

        #support-inbox-page > div {
          height: 100% !important;
          max-height: 100% !important;
          min-height: 0 !important;
          overflow: hidden !important;
        }

        #support-inbox-page > div > aside:first-of-type {
          height: 100% !important;
          max-height: 100% !important;
          min-height: 0 !important;
          overflow: hidden !important;
        }

        #support-inbox-page > div > aside:first-of-type > div:nth-child(2) {
          flex: 1 1 auto !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          overscroll-behavior-y: contain;
          touch-action: pan-y;
          -webkit-overflow-scrolling: touch;
          scrollbar-gutter: stable;
          position: relative;
        }

        /* Make touch dragging reliable in Chrome/WebView on Fold/tablet widths. */
        #support-inbox-page > div > aside:first-of-type > div:nth-child(2) > button {
          touch-action: pan-y;
        }
      `}</style>
      <InboxClient params={params} searchParams={searchParams} />
    </div>
  );
}
