// The Cloudflare adapter is intentionally supplied by the pinned `npx
// @opennextjs/cloudflare@1.20.6` commands in package.json rather than installed
// into CentralHub's normal Next.js runtime dependencies. Netlify/GitHub's app
// typecheck should therefore not try to resolve this CLI-only module locally.
// @ts-ignore -- resolved by the pinned OpenNext CLI during Cloudflare builds.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
