/**
 * Server-only sandbox configuration registry.
 * Presence of credentials is NOT proof of an authorised connection or a working filing integration.
 * Keep every credential in Netlify server environment variables (never NEXT_PUBLIC_*).
 */
export type TaxProviderId = 'vat' | 'paye' | 'corporation_tax' | 'companies_house';
export type SandboxProvider = {
  id: TaxProviderId;
  name: string;
  protocol: 'REST OAuth2' | 'HMRC RTI XML' | 'HMRC CT XML' | 'Companies House REST OAuth2';
  required: readonly string[];
  configured: boolean;
  missing: string[];
  status: 'awaiting_credentials' | 'credentials_present_untested';
  diagnostic: 'vat_application' | 'companies_house_company_read' | null;
  nextStep: string;
};
const definitions = [
  {
    id: 'vat',
    name: 'VAT (MTD)',
    protocol: 'REST OAuth2',
    required: ['HMRC_VAT_SANDBOX_CLIENT_ID', 'HMRC_VAT_SANDBOX_CLIENT_SECRET'],
    diagnostic: 'vat_application',
    nextStep: 'Create an HMRC REST sandbox app, subscribe to Hello World and VAT (MTD), then add the sandbox app credentials. The initial diagnostic tests application authentication only; VAT user authorisation and fraud-prevention testing remain separate.',
  },
  {
    id: 'paye',
    name: 'PAYE & Payroll RTI',
    protocol: 'HMRC RTI XML',
    required: ['HMRC_PAYE_TEST_VENDOR_ID', 'HMRC_PAYE_XML_TEST_SENDER_ID', 'HMRC_PAYE_XML_TEST_PASSWORD'],
    diagnostic: null,
    nextStep: 'Request HMRC RTI XML specifications, vendor ID and test credentials through Software Developer Support. The REST Developer Hub sandbox cannot test PAYE RTI XML; use the designated HMRC XML test service only after separate implementation and test approval.',
  },
  {
    id: 'corporation_tax',
    name: 'Corporation Tax (CT600)',
    protocol: 'HMRC CT XML',
    required: ['HMRC_CT_TEST_VENDOR_ID', 'HMRC_CT_XML_TEST_SENDER_ID', 'HMRC_CT_XML_TEST_PASSWORD'],
    diagnostic: null,
    nextStep: 'Obtain HMRC CT600 XML developer specifications and test-service access; build schema/iXBRL validation before attempting HMRC XML test submissions. The REST sandbox cannot validate CT600.',
  },
  {
    id: 'companies_house',
    name: 'Companies House Filing',
    protocol: 'Companies House REST OAuth2',
    required: ['CH_SANDBOX_API_KEY', 'CH_SANDBOX_COMPANY_NUMBER', 'CH_SANDBOX_CLIENT_ID', 'CH_SANDBOX_CLIENT_SECRET'],
    diagnostic: 'companies_house_company_read',
    nextStep: 'Create a Companies House test application, test API key and test OAuth web client; create a sandbox test company and save its company number. The first diagnostic performs a read-only company lookup only; it does not validate filing OAuth or submit documents.',
  },
] as const;

/** Return configuration flags and names only; NEVER return values, tokens or upstream bodies. */
export function getTaxSandboxReadiness(env: NodeJS.ProcessEnv = process.env): SandboxProvider[] {
  return definitions.map((item) => {
    const missing = item.required.filter((key) => !env[key]?.trim());
    return {
      ...item,
      required: [...item.required],
      configured: missing.length === 0,
      missing,
      status: missing.length ? 'awaiting_credentials' : 'credentials_present_untested',
    };
  });
}
