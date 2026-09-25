# CentralHub: UK tax integrations — sandbox credential handoff

**State:** sandbox credential/readiness and limited read-only diagnostics only. No live filing, taxpayer OAuth grant, payment, return calculation certification, PAYE RTI XML submission, Corporation Tax CT600 XML submission, or Companies House filing is implemented or authorised by this change.

## Scope and trust boundaries

- Preserves all existing CentralHub VAT settings, transactions, periods, finance data, and company identities. No database migration or RLS change. Does not change CentralHub Shop or customer stores.
- All provider credentials are kept only in **Netlify project environment variables** for `centralhubnetwork`, available to the server runtime. Never put credentials in GitHub, chat, screenshot, `NEXT_PUBLIC_*` variables, client JavaScript, URL query parameters, or public demos.
- The `/api/finance/tax-sandbox` route requires a fresh bearer session verified with Supabase and an active verified CentralHub Super Admin identity. It never returns, logs, persists, or echoes credential values or upstream API response bodies. It is `no-store`.
- `GET` reports whether required private environment variables are **present**, not whether they are valid or the integration is approved.
- Explicit `POST` diagnostics only call fixed **sandbox endpoints**. No provider application or user is auto-connected. There is no production fallback or filing endpoint. PAYE and CT XML have *no* diagnostic submission implemented.

## 1. HMRC VAT MTD REST

1. Sign in at https://developer.service.hmrc.gov.uk/api-documentation .
2. Create an HMRC **sandbox** application; subscribe it to **Hello World** (needed for the application-only diagnostic) and **VAT (MTD)**.
3. Save the sandbox application **client ID** and **client secret** as private Netlify environment variables:
   - `HMRC_VAT_SANDBOX_CLIENT_ID`
   - `HMRC_VAT_SANDBOX_CLIENT_SECRET`
4. In CentralHub Finance → Tax integration readiness, click **Refresh status**, then **Test sandbox application**. This performs a client-credentials OAuth request to `https://test-api.service.hmrc.gov.uk/oauth/token` followed by a read-only `GET /hello/application`.
5. Passing means only that the application credentials and Hello World subscription work. VAT obligations, MTD user OAuth, test-organisation enrolment, delegated grants, fraud-prevention headers, calculations, consent and actual filing remain untested and disabled.

**Next engineering stage, not implemented in this handoff:** a CSRF-protected, per-company HMRC user OAuth code + PKCE flow; encrypted and access-controlled scoped token storage, rotation and revocation; VAT obligations read; realistic sandbox fixture returns with no real customer records; fraud-prevention header validation; independent nine-box and record-link audits; explicit human review and filing approval. The optional illustrative OAuth redirect URI in `.env.example` is *not* registered as a working callback; do not enable it yet.

Official docs: https://developer.service.hmrc.gov.uk/api-documentation/docs/testing ; https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/1.0 .

## 2. PAYE RTI — HMRC XML test service

HMRC's REST Developer Hub sandbox **does not test the RTI XML filing service**. Obtain the current RTI XML technical specifications, testing instructions, four-digit Vendor ID and appropriate test service credentials from HMRC Software Developer Support (SDS) through its official guidance. After issuance, reserve these private Netlify variables:

- `HMRC_PAYE_TEST_VENDOR_ID`
- `HMRC_PAYE_XML_TEST_SENDER_ID`
- `HMRC_PAYE_XML_TEST_PASSWORD`

Presence of these variables is a configuration checkpoint **only**. We have not implemented payroll calculations, RTI message schema validation, FPS/EPS generation, XML authentication, transport to the HMRC RTI test service, or payroll production approval. Do not use the VAT OAuth client ID or REST sandbox URLs for RTI XML.

Official: https://www.gov.uk/guidance/basic-guide-for-xml-software-developers .

## 3. Corporation Tax CT600 — HMRC XML test service

Obtain Corporation Tax Online XML specifications, recognition applicant instructions, vendor ID and test-service credentials from HMRC SDS separately from PAYE. Reserve these private variables when HMRC issues the appropriate information:

- `HMRC_CT_TEST_VENDOR_ID`
- `HMRC_CT_XML_TEST_SENDER_ID`
- `HMRC_CT_XML_TEST_PASSWORD`

These are placeholders for the next integration stage; their presence does **not** prove compatibility with HMRC's current XML test service or legal readiness. CT600 XML schemas, company-year calculations, iXBRL accounts/computations, authentication, dedicated XML test transport and production recognition remain unimplemented.

Official: https://developer.service.hmrc.gov.uk/api-documentation/docs/api/xml/Corporation%20Tax%20Online ; https://www.gov.uk/guidance/basic-guide-for-xml-software-developers .

## 4. Companies House API Filing sandbox

1. Sign in to https://developer.company-information.service.gov.uk/get-started .
2. Create a **Test** application and separate test **API key** and **OAuth web client** (not the live ones).
3. Use the Companies House sandbox test-data generator to create a fictitious company. Preserve its company number and authentication code **privately**. No real company numbers or real corporate filings should be used for the first sandbox checks.
4. Save in private Netlify environment variables:
   - `CH_SANDBOX_API_KEY`
   - `CH_SANDBOX_COMPANY_NUMBER` (the eight-character fictitious test company number)
   - `CH_SANDBOX_CLIENT_ID`
   - `CH_SANDBOX_CLIENT_SECRET`
5. On the CentralHub tax readiness panel click **Test sandbox company lookup**. This performs a read-only `GET /company/{sandbox-company-number}` with a test API key on **https://api-sandbox.company-information.service.gov.uk** and reports pass/fail only.

Passing does **not** validate OAuth, company authentication code, transactions, filing APIs, annual accounts or confirmation statement support. Those functions need additional authorisation, test company and filing-specific implementation.

Official: https://developer.company-information.service.gov.uk/api-testing .

## Deployment, access and acceptance

- Existing pipeline: GitHub repository `tinuan96-svg/Centralhub0309-4`, branch `main`, then existing Netlify project `centralhubnetwork`. Do not create branches or new paid projects.
- Environment variables must be configured for the **correct Netlify site and server runtime**. The Super Admin panel is at `https://centralhub.network/finance` or `/finance/vat`.
- Re-deploy after setting environment variables, then refresh readiness. Credential detection is not an upstream connection test.
- Only the explicitly initiated HMRC application-only and Companies House sandbox company-read diagnostics may contact upstream providers. No taxpayer or company filing traffic is sent.
- Security, CI and browser verification must pass before describing the UI as deployed; do not confuse Netlify deployment status with Github CI or with successful third-party sandbox access.

## 5. Business Rates — VOA API sandbox (separate from council payments)

As of September 2026, **HMRC Developer Hub offers a Valuation Office Agency Business Rates API** for property search/valuation, property claims and associated cases. This is distinct from local authorities calculating, billing and collecting the Business Rates bill. The API does **not** provide a universal local-council payment method.

Official service documentation: https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/business-rates-api/2.0

- Create/subscribe an HMRC **sandbox** application for the VOA Business Rates API and complete its own provider authorisation and test-user prerequisites before any external call.
- Store any issued sandbox application credentials in private Netlify server environment only:
  - `HMRC_BUSINESS_RATES_SANDBOX_CLIENT_ID`
  - `HMRC_BUSINESS_RATES_SANDBOX_CLIENT_SECRET`
- The current panel only detects their presence and runs fixed **fictional local** property-reference/amount checks. It does not call VOA, search real properties, open a claim or initiate a rates payment.

## 6. Customs Declarations / Import VAT — separate CDS sandbox

Official service documentation: https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/customs-declarations/2.0

- Create and subscribe an HMRC **sandbox** application to the relevant Customs Declaration Service APIs and obtain test-user authorisation for `customs-services` and a fictional test EORI.
- Store separately issued app credentials as private server variables:
  - `HMRC_CUSTOMS_SANDBOX_CLIENT_ID`
  - `HMRC_CUSTOMS_SANDBOX_CLIENT_SECRET`
- The panel only reports configuration presence and runs fixed **fictional local** EORI, commodity-code and pence-format checks. No customs declarations, duty payments or Import VAT retrievals are sent, even to sandbox.

## 7. Fictional local acceptance tests (no credentials required)

CentralHub Finance → Tax integration readiness offers "Test fictional data locally" for VAT, PAYE, Corporation Tax, VOA Business Rates, Customs and Companies House. These deterministic built-in cases are never derived from customer records. The authorised Super Admin explicitly starts them; they return only pass/fail, check names and a statement that no government API was contacted.

The checks are limited to basic numeric or reference-field consistency; they **do not validate** official submission XML/JSON schemas, payroll or tax rates, VAT digital links, approved fraud prevention headers, OAuth grants, real government sandbox responses, filings or payments. Do not submit these fictitious records to a real government account or mistake a local fixture pass for API verification.

## Private sandbox credentials — current handoff

No genuine HMRC or Companies House sandbox secret should be fabricated, written to a repository, copied from a production app or supplied in chat. Configure each issued test key in the existing CentralHub Netlify project's private runtime environment only. The Shop fictional demo must **never** inherit or use the private CentralHub government credentials.

For VAT user-restricted endpoints, separately create an HMRC sandbox organisation test user and complete a consent-based sandbox OAuth flow with fraud-prevention requirements before any externally-connected VAT functionality can be labelled tested. The current implemented VAT "Hello World" application diagnostic is not that end-to-end flow.

PAYE RTI and CT600 remain separate HMRC XML test services, not REST sandbox endpoints. Obtain applicable test-service access before integrating their transports.

This stage changes no production taxpayer authorisation, financial transaction, payroll record, company record, live filing, or payment.
