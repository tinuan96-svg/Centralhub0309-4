/**
 * Deterministic FICTIONAL fixtures for pre-integration development tests.
 * This module neither reads production records nor calls a government API.
 * These are basic input/flow invariants, not HMRC payroll, tax, customs or
 * filing-schema certification. No user-supplied values are accepted.
 */
export type FixtureProvider = 'vat' | 'paye' | 'corporation_tax' | 'business_rates' | 'customs' | 'companies_house';
export type FixtureResult = {
  provider: FixtureProvider;
  mode: 'local_synthetic_only';
  passed: boolean;
  checked: number;
  cases: { name: string; passed: boolean }[];
  note: string;
};

const integerPence = (v: number) => Number.isSafeInteger(v) && v >= 0;
const positiveReference = (v: string) => /^[A-Z0-9-]{5,20}$/.test(v);
type Check = { name: string; passed: boolean };
const check = (name: string, passed: boolean): Check => ({ name, passed });

export function runSyntheticSandboxFixture(provider: FixtureProvider): FixtureResult {
  const cases: Check[] = [];
  switch (provider) {
    case 'vat': {
      // Synthetic nine-box reconciliation, NOT determination of VAT liability.
      const boxes = { box1: 18000, box2: 2000, box3: 20000, box4: 5000, box5: 15000, box6: 100000, box7: 25000, box8: 0, box9: 0 };
      cases.push(check('fictional VAT box 3 equals box 1 plus box 2', boxes.box3 === boxes.box1 + boxes.box2));
      cases.push(check('fictional VAT box 5 reconciles box 3 less box 4', boxes.box5 === boxes.box3 - boxes.box4));
      cases.push(check('all nine fictional VAT amounts have valid integer-pence representation', Object.values(boxes).every(integerPence)));
      cases.push(check('inconsistent fictional VAT reconciliation is rejected', 16000 !== boxes.box3 - boxes.box4));
      break;
    }
    case 'paye': {
      const payroll = { gross: 200000, incomeTax: 22000, employeeNI: 10000, pension: 8000, net: 160000 };
      cases.push(check('fictional payroll net pay reconciles deductions', payroll.net === payroll.gross - payroll.incomeTax - payroll.employeeNI - payroll.pension));
      cases.push(check('negative fictional employee deduction is rejected', !integerPence(-1)));
      cases.push(check('fictional payroll values are safe integer pence', Object.values(payroll).every(integerPence)));
      break;
    }
    case 'corporation_tax': {
      const mock = { accountingProfit: 900000, additions: 120000, deductions: 20000, illustrativeTaxableProfit: 1000000 };
      cases.push(check('fictional profit reconciliation', mock.illustrativeTaxableProfit === mock.accountingProfit + mock.additions - mock.deductions));
      cases.push(check('fictional tax period start precedes end', Date.parse('2026-01-01') < Date.parse('2026-12-31')));
      cases.push(check('missing illustrative accounting-period end is rejected', !Number.isFinite(Date.parse(''))));
      break;
    }
    case 'business_rates': {
      const property = { fictionalReference: 'VOA-TEST-001', rateableValuePence: 2500000, billingCouncil: 'Fictional Borough Council' };
      cases.push(check('synthetic property reference and valuation format', positiveReference(property.fictionalReference) && integerPence(property.rateableValuePence)));
      cases.push(check('fictional local billing authority is identified independently from VOA', property.billingCouncil.length > 0 && !property.billingCouncil.includes('HMRC')));
      cases.push(check('missing synthetic property reference is rejected', !positiveReference('')));
      break;
    }
    case 'customs': {
      const entry = { eori: 'GB000000000000', commodityCode: '0901110000', declaredValuePence: 150000, illustrativeDutyPence: 9000, illustrativeImportVatPence: 31800 };
      cases.push(check('synthetic EORI and commodity-code format', /^GB\d{12}$/.test(entry.eori) && /^\d{8,10}$/.test(entry.commodityCode)));
      cases.push(check('fictional customs amounts are separate non-negative integer amounts', [entry.declaredValuePence, entry.illustrativeDutyPence, entry.illustrativeImportVatPence].every(integerPence)));
      cases.push(check('invalid synthetic commodity code is rejected', !/^\d{8,10}$/.test('ABC')));
      break;
    }
    case 'companies_house': {
      const companyNumber = '00000000';
      cases.push(check('fictional company number format', /^[A-Z0-9]{8}$/.test(companyNumber)));
      cases.push(check('invalid company number format rejected', !/^[A-Z0-9]{8}$/.test('ABC')));
      break;
    }
  }
  return {
    provider,
    mode: 'local_synthetic_only',
    passed: cases.length > 0 && cases.every(item => item.passed),
    checked: cases.length,
    cases,
    note: 'Only deterministic fictional data was validated locally. No HMRC, Valuation Office, council, customs or Companies House request occurred. This is not a schema, tax calculation, fraud-header, OAuth, filing or payment certification.',
  };
}
