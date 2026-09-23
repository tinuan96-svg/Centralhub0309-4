# Public demo dashboard security and fidelity

## Entry points

- A **Try Demo Data** button on `/login` opens `/demo`, with no account required.
- `/demo` reuses CentralHub's `ch-workspace`, `ch-dashboard`, `ch-panel`, `ch-kpi-grid`, `ch-console-toolbar`, and `ch-tab` CSS classes and the same sidebar/header/tab hierarchy as the administrator UI.
- It is a safe, visually matched demo **not the authenticated production dashboard**. Backend-powered widgets, synchronisation, external connections, voice/AI network actions and production settings cannot be mounted for anonymous visitors.
- The demo contains fictional, in-memory products, stores, customers, orders, stock, finance, shipping, marketing, support and NORA summaries. Interactions do not persist between reloads.

## Isolation rules

- `AppRouteShell` does not mount `ProtectedAppShell` on the public demo route. This excludes `AuthProvider`, private shell navigation, push/voice bootstrap, shipping sync, private widgets, and other production data-fetching components.
- `components/demo/DemoDashboardClient.tsx` must **never** import `@/lib/supabase`, real services, authenticated components, direct `fetch` calls, third-party messaging/payment/shipping clients, or privileged APIs.
- Keep demo navigation entirely inside `/demo`; only the explicit Exit / Login link leaves the sandbox.
- No anonymous Supabase read/write grants, mock admin JWTs, credentials, database records, customer messages, or shipping labels are created.
- If production dashboard styles change, keep the public demo's shared class names and layout in sync, but do not share data-fetching/authentication components with anonymous visitors.
- The demo banner is permanent and clearly says all figures and actions are fictional. A demo click never books a real shipment, charges a payment or sends a message.

## Acceptance checks

1. Open `/login` signed out and click Try Demo Data. Verify the demo loads without credentials.
2. Confirm same dark theme and sidebar/header/tab/card structure, with a persistent DEMO DATA ONLY banner.
3. Create a sample sale, verify the stock decreases and revenue/order counts change, advance its status, then reset and verify original examples return.
4. Open desktop, folded mobile, and unfolded Fold sizes; verify no live sidebar, speech assistant, sync job or admin actions mount inside the public demo.
5. Verify unauthenticated `/dashboard`, `/orders`, `/finance`, and real API routes remain protected.
6. Verify /demo code does not import Supabase, make network calls, persist to storage or alter real business records.
