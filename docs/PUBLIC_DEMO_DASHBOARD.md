# Public demo dashboard security and fidelity

## Entry points

- A **Try Demo Data** button on `/login` opens `/demo`, with no account required.
- `/demo` shares the actual navigation definition in `lib/navigation/sections.ts` with `ClassifiedSidebar`, shares the production KPI renderer (`DashboardKpiCards`) and `BusinessPulse` chart, and follows the existing dashboard group and tab structure. This is a visual/data-adapter approach, not permission to run authenticated page components for public visitors.
- It is a safe, visually matched demo **not the authenticated production dashboard**. Backend-powered widgets, synchronisation, external connections, voice/AI network actions and production settings cannot be mounted for anonymous visitors.
- The demo contains fictional, in-memory products, stores, customers, orders, stock, finance, shipping, marketing, support and NORA summaries. Interactions do not persist between reloads.

## Isolation rules

- `AppRouteShell` does not mount `ProtectedAppShell` on the public demo route. This excludes `AuthProvider`, private shell navigation, push/voice bootstrap, shipping sync, private widgets, and other production data-fetching components.
- `components/demo/DemoDashboardClient.tsx` must **never** import `@/lib/supabase`, real services, authenticated components, direct `fetch` calls, third-party messaging/payment/shipping clients, or privileged APIs.
- Keep demo navigation entirely inside `/demo`; only the explicit Exit / Login link leaves the sandbox.
- No anonymous Supabase read/write grants, mock admin JWTs, credentials, database records, customer messages, or shipping labels are created.
- Pure presentation components and navigation data may be shared with the live dashboard. Production auth, data-fetching, realtime subscriptions, service integrations and action handlers must remain protected. Synchronise remaining visual components when safe.
- The demo banner is permanent and clearly says all figures and actions are fictional. A demo click never books a real shipment, charges a payment or sends a message.

## Acceptance checks

1. Open `/login` signed out and click Try Demo Data. Verify the demo loads without credentials.
2. Confirm same dark theme and sidebar/header/tab/card structure, with a persistent DEMO DATA ONLY banner.
3. Create a sample sale, verify the stock decreases and revenue/order counts change, advance its status, then reset and verify original examples return.
4. Open desktop, folded mobile, and unfolded Fold sizes; verify no live sidebar, speech assistant, sync job or admin actions mount inside the public demo.
5. Verify unauthenticated `/dashboard`, `/orders`, `/finance`, and real API routes remain protected.
6. Verify /demo code does not import Supabase, make network calls, persist to storage or alter real business records.

## Fold and navigation regression

- Below 700 CSS pixels the demo uses its mobile navigation and a closable More drawer, never a production route link.
- At 700 CSS pixels and wider, including unfolded Fold devices, the demo sidebar participates in the horizontal layout rather than covering KPI cards. It begins collapsed at 700–899 CSS pixels and has an explicit expand/collapse control.
- The demo does not persist state and does not mount authenticated components. The real dashboard remains available at `/dashboard` only after appropriate authentication.
- Shared menu labels originate from the actual production navigation tree. Specialist screens not implemented as sample workflows remain inside `/demo` with a clear explanation instead of pretending to be live.
- Shared KPI cards and Business Pulse use a local, fictional reporting adapter. Production operational widgets remain private because they are coupled to Supabase and provider services.
- CI runs `node --test scripts/public-demo-contract.test.cjs` to guard navigation sharing, Fold sidebar layout, and demo isolation.
