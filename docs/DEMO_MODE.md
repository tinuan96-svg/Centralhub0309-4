# CentralHub actual-app Demo Mode

## Architecture

CentralHub uses one application codebase and one set of pages/components. Authentication always remains on the private CentralHub Supabase project. Operational reads switch between two data planes:

- **Live** — the private CentralHub production database.
- **Demo** — the isolated Centralhub Shop project using a read-only compatibility surface populated from sanitised demo records.

The selected mode is stored in browser local storage and a SameSite cookie. Changing mode reloads the current CentralHub route so existing realtime channels and services are disposed before the alternate data plane mounts.

## Safety boundaries

Demo Mode never receives a production service-role key. The browser uses only the Shop project's publishable key. The Shop compatibility tables allow SELECT only; writes are denied by RLS/grants.

Production authentication remains live so the same authorised CentralHub user can enter and exit Demo Mode without a second identity system. While Demo Mode is active:

- production order synchronisation and automatic DHL invoice sync do not mount;
- live NORA/SHRUTHI action, voice, computer-control and background update components do not mount;
- native push registration is skipped;
- the production Next.js API is blocked with HTTP 423 except the admin/staff session-verification endpoints required to keep the authenticated shell secure;
- the Supabase data client resolves operational queries/RPC/realtime to Centralhub Shop, while `supabase.auth` always resolves to private CentralHub Auth;
- a persistent banner identifies all visible records and metrics as sanitised demo data.

## Customer walkthrough

1. Sign into the normal CentralHub application.
2. Open Dashboard.
3. Choose **Enter Demo**.
4. The same CentralHub application reloads with the persistent Demo Mode banner and reads the isolated Shop dataset.
5. Navigate the normal sidebar and dashboard tabs.
6. Choose **Exit Demo** to reload the same route against live CentralHub data.

The older public `/demo` route remains an unauthenticated preview. It is not the customer demonstration mode described here.
