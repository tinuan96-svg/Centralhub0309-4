# CentralHub compliance and integrations release gate
Document version: 1.0 · 25 September 2026

This is an internal review checklist, not a statement of HMRC or ICO approval.

## Existing site
- Public CentralHub privacy, website/demo terms, security and contact pages explain their limited scope.
- Independent paid customer terms, DPA, precise provider/transfer inventory, role allocation and category-based retention schedule: NOT VERIFIED. Obtain appropriate legal and operational review before broad commercial onboarding.
- Company number and address are present in existing project material; current authoritative Companies House verification still required before representing them as freshly independently verified.

## Each future integration
1. Official provider: HMRC VAT MTD, Corporation Tax service, PAYE RTI, relevant local authority, CDS/customs, or Companies House. Confirm its current integration interface; do not infer one service's access from another.
2. Data mapping: fields, source, user/customer role, lawful basis, recipients, storage and processing locations, transfer safeguards, retention/erasure, and rights-request routing.
3. Security: tenant separation, privilege controls, encrypted token storage, audit trail, complete fraud prevention where required, secure error handling and revocation.
4. Product status: planned -> developing -> sandbox verified -> access pending -> production verified. Never mark live on the basis of Hello World.
5. Pre-activation review: update privacy/terms/DPA where material; obtain a discrete government account authorisation and per-submission approval; disable live payment and filing until end-to-end test and external access verification.
6. Record version/effective date, reviewer and evidence in the normal approved change-management system. Never store real taxpayer IDs or credentials in a public repository.

## Project boundaries
CentralHub private administration and CentralHub Shop control plane are separate. Shop demo is fictional; its separate commercial service documentation and customer permissions require specific review. Changes to one project do not confer HMRC authorisation or customer consent on the other.
