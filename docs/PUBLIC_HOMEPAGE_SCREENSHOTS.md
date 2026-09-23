# CentralHub public integrations screenshot capture guide

The public marketing gallery lives on the **actual CentralHub** homepage at `/`. Its approved-image manifest is `lib/publicFeatureGallery.ts`, and its renderer is `components/PublicRealIntegrationsShowcase.tsx`.

## Security: before taking or publishing screenshots

**Never publish an unredacted screenshot of the actual production dashboard.** It can reveal customer conversations, telephone numbers, emails, delivery addresses, financial data, credentials, supplier pricing, account IDs, access tokens, or confidential internal incidents.

1. Capture only from an authorised demonstration environment with **fictional demo accounts, fake customer/order/supplier data, and synthetic financial/security figures**. Avoid using a live production customer or store account, even temporarily. Do not change production records to make a marketing screenshot.
2. Use the current actual CentralHub UI, navigation, colours and real route layout, not a generated fake interface or a third-party stock screenshot. Never claim that an integration is connected if the pictured state is only a simulation.
3. Prefer recreating a harmless example in a separate approved test environment or approved demo account. If that is not possible, crop away private content and irreversibly remove/redact sensitive pixels **before saving** the final image. Check expanded previews and thumbnails at 100% zoom; do not rely on HTML/CSS overlays or browser blurring.
4. Never include private auth screens, credentials, API keys, webhook URLs, bank account details, Meta access tokens, or business/private personal information in image files, alt text, names, EXIF or the Git commit history. Strip EXIF/metadata. Public image files and previous Git revisions can be downloaded permanently.
5. Have a human review each final screenshot for factual accuracy, image contents, authorisation and public release. Only then add it to `public/home-demo/` under the exact matching filename below, on `main`.
6. No Supabase Storage public bucket, new API access, disabled RLS, or anonymous database access is required for this gallery.

## Screenshot inventory

| Filename in `public/home-demo/` | Actual CentralHub area to capture | Fictional content / redaction |
| --- | --- | --- |
| `whatsapp-inbox-demo.webp` | Customer Care → Inbox | Fictional contact details and message text, sample ticket/order IDs. |
| `whatsapp-channels-demo.webp` | Customer Care → Channels | Example store and connection state; hide phone numbers, provider IDs and webhook URLs. |
| `marketing-integrations-demo.webp` | Marketing → Integrations | Actual provider tiles and safe example status. Never imply every provider is connected by default. |
| `marketing-campaigns-demo.webp` | Marketing → Campaigns | Fictional campaigns and example budgets/results. |
| `analytics-overview-demo.webp` | Analytics overview | Fake visitors, acquisition and revenue numbers. |
| `analytics-traffic-demo.webp` | Analytics/GA4 views | Use a configured demo property or approved fictional visualisation clearly labelled demo. |
| `orders-queue-demo.webp` | Orders | Fictional customer, order IDs and delivery details. |
| `inventory-fulfilment-demo.webp` | Inventory / Picking / Packing / Shipping | Fictional SKU, stock and example orders. |
| `finance-reconciliation-demo.webp` | Finance → Transactions / reconciliation | Fully fictional bank rows and no real account/reference numbers. |
| `finance-profitability-demo.webp` | Finance → Profitability | Fictional sales and cost amounts only. |
| `nora-assistant-demo.webp` | NORA assistant | Public-safe example question and answer, no connected email or customer data. |
| `security-radar-demo.webp` | Dashboard → Security Radar / Site Health | Artificial alerts only; hide sensitive security incidents and internal infrastructure details. |

Use 16:9 or similar horizontal screenshots; aim for 1200–1600px wide and modest file sizes. Use WebP when possible. A screen image is displayed only if its named file exists in `public/home-demo/` at build time. Until a screenshot is verified, the homepage shows an honest “privacy-safe screenshot not published yet” placeholder, without broken links or mislabelling a mockup as a real capture.

The public interactive demo at `/#interactive-demo` remains separate from the screenshot gallery. It uses isolated browser-only sample data; it cannot connect a messaging account, change a live order, process a payment, or operate the production database.

## Release checks

- All images originate from the actual product and contain only authorised public-safe details.
- Open thumbnails and enlarged images on Fold-sized mobile and desktop screens.
- Verify no screenshot route, public component, or page exposes private records, auth tokens, or real customer data.
- Run the CentralHub CI workflow and confirm Netlify production deploy for the resulting `main` commit.
