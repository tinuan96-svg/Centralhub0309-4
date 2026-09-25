import { NextResponse } from 'next/server';
import { AccessDenied, requireVerifiedSuperAdmin } from '@/lib/access-control/admin';
import { getTaxSandboxReadiness } from '@/lib/tax/sandbox-readiness';
import { runSyntheticSandboxFixture, type FixtureProvider } from '@/lib/tax/sandbox-fixtures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const responseHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vary': 'Authorization',
  'X-Content-Type-Options': 'nosniff',
};
const failure = (status: number, error: string) => NextResponse.json({ error }, { status, headers: responseHeaders });

/** Protected server-only environment presence check; never return any credential value. */
export async function GET(request: Request) {
  try {
    await requireVerifiedSuperAdmin(request);
    return NextResponse.json({
      sandboxOnly: true,
      liveFilingEnabled: false,
      providers: getTaxSandboxReadiness(),
    }, { headers: responseHeaders });
  } catch (error) {
    return error instanceof AccessDenied ? failure(error.status, error.message) : failure(503, 'Sandbox readiness unavailable');
  }
}

/** Explicit, read-only sandbox diagnostics only: no taxpayer OAuth, returns or filings. */
export async function POST(request: Request) {
  try {
    await requireVerifiedSuperAdmin(request);
    const payload: unknown = await request.json().catch(() => null);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return failure(400, 'Invalid diagnostic request');
    const diagnostic = (payload as Record<string, unknown>).diagnostic;
    if (diagnostic === 'synthetic_fixture') {
      // Never accept financial, personal or taxpayer payloads: fixed fictional test fixtures only.
      if (Object.keys(payload).some(key => key !== 'diagnostic' && key !== 'provider')) {
        return failure(400, 'Only a fixture provider ID is accepted');
      }
      const provider = (payload as Record<string, unknown>).provider;
      const allowed: readonly string[] = ['vat', 'paye', 'corporation_tax', 'business_rates', 'customs', 'companies_house'];
      if (typeof provider !== 'string' || !allowed.includes(provider)) return failure(400, 'Unknown fictional fixture provider');
      return NextResponse.json({ sandboxOnly: true, liveFilingEnabled: false, ...runSyntheticSandboxFixture(provider as FixtureProvider) }, { headers: responseHeaders });
    }
    if (diagnostic !== 'vat_application' && diagnostic !== 'companies_house_company_read') {
      return failure(400, 'Only sandbox application and read-only company tests are supported');
    }

    const providerId = diagnostic === 'vat_application' ? 'vat' : 'companies_house';
    const provider = getTaxSandboxReadiness().find((entry) => entry.id === providerId);
    if (!provider?.configured) return failure(409, 'Sandbox credentials are not yet fully configured');

    if (diagnostic === 'vat_application') {
      // This is an application-only Hello World check, NOT VAT user OAuth or VAT filing certification.
      const clientId = process.env.HMRC_VAT_SANDBOX_CLIENT_ID!;
      const clientSecret = process.env.HMRC_VAT_SANDBOX_CLIENT_SECRET!;
      const tokenResponse = await fetch('https://test-api.service.hmrc.gov.uk/oauth/token', {
        method: 'POST',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'hello',
        }),
      });
      if (!tokenResponse.ok) return failure(502, 'HMRC sandbox application authentication failed; check credentials and Hello World subscription');
      const tokenData: unknown = await tokenResponse.json().catch(() => null);
      const token = tokenData && typeof tokenData === 'object' && !Array.isArray(tokenData)
        ? (tokenData as Record<string, unknown>).access_token : null;
      if (typeof token !== 'string' || !token) return failure(502, 'HMRC sandbox did not return an application access token');
      const helloResponse = await fetch('https://test-api.service.hmrc.gov.uk/hello/application', {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.hmrc.1.0+json' },
      });
      if (!helloResponse.ok) return failure(502, 'HMRC sandbox application check failed; check Hello World API subscription');
      return NextResponse.json({
        diagnostic, passed: true, sandboxOnly: true,
        note: 'HMRC sandbox application authentication passed. VAT taxpayer authorisation, obligations, return calculations and filing have NOT been tested.',
      }, { headers: responseHeaders });
    }

    // The company number must be from Companies House's sandbox test-data generator.
    const companyNumber = process.env.CH_SANDBOX_COMPANY_NUMBER!.trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(companyNumber)) return failure(409, 'Invalid sandbox test company number');
    const basic = Buffer.from(`${process.env.CH_SANDBOX_API_KEY!}:`).toString('base64');
    const lookup = await fetch(`https://api-sandbox.company-information.service.gov.uk/company/${companyNumber}`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' },
    });
    if (!lookup.ok) return failure(502, 'Companies House sandbox company lookup failed; verify test API key and test company number');
    return NextResponse.json({
      diagnostic, passed: true, sandboxOnly: true,
      note: 'Read-only Companies House sandbox lookup passed. OAuth filing authorisation and document submissions have NOT been tested.',
    }, { headers: responseHeaders });
  } catch (error) {
    return error instanceof AccessDenied ? failure(error.status, error.message) : failure(503, 'Sandbox diagnostic unavailable; no filing was attempted');
  }
}
