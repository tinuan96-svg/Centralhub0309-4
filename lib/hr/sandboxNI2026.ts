/** Non-authoritative sandbox: UK Class 1 NI for ordinary category A employees.
 * Source: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
 * Effective 6 April 2026–5 April 2027. NOT a final payroll calculation.
 * Excludes PAYE, director annual methods, special categories, employer relief,
 * aggregation, earnings-period exceptions, statutory pay and pension.
 */
export const sandboxNI2026={
  taxYear:'2026-27',effectiveFrom:'2026-04-06',effectiveTo:'2027-04-05',
  source:'https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027',
  weekly:{primaryThresholdPence:24200,upperEarningsLimitPence:96700,secondaryThresholdPence:9600},
  monthly:{primaryThresholdPence:104800,upperEarningsLimitPence:418900,secondaryThresholdPence:41700}
} as const;
export type SandboxFrequency='weekly'|'monthly';
export type SandboxResult={
  taxYear:string;frequency:SandboxFrequency;niCategory:'A';grossPence:number;
  employeeNIPence:number;employerNIPence:number;grossPlusEmployerNIPence:number;
  estimatesOnly:true;payrollApproved:false;payECalculated:false;pensionCalculated:false;
  excluded:string[];
};
const roundPennies=(pence:number,rate:number)=>Math.round(pence*rate);
export function calculateSandboxNI(grossPence:number,frequency:SandboxFrequency,category:string='A'):SandboxResult{
  if(category!=='A')throw new Error('Only ordinary NI category A is supported in this sandbox');
  if(frequency!=='weekly'&&frequency!=='monthly')throw new Error('Weekly or monthly pay is required');
  if(!Number.isSafeInteger(grossPence)||grossPence<0||grossPence>100_000_000)
    throw new Error('Gross pay must be a safe non-negative integer number of pence');
  const {primaryThresholdPence:pt,upperEarningsLimitPence:uel,secondaryThresholdPence:st}=sandboxNI2026[frequency];
  const middle=Math.max(0,Math.min(grossPence,uel)-pt);
  const upper=Math.max(0,grossPence-uel);
  // The official illustrative rates are 8% up to the UEL, then 2% above.
  const employeeNIPence=roundPennies(middle*.08+upper*.02,1);
  const employerNIPence=roundPennies(Math.max(0,grossPence-st)*.15,1);
  return {
    taxYear:sandboxNI2026.taxYear,frequency,niCategory:'A',grossPence,employeeNIPence,
    employerNIPence,grossPlusEmployerNIPence:grossPence+employerNIPence,
    estimatesOnly:true,payrollApproved:false,payECalculated:false,pensionCalculated:false,
    excluded:['PAYE tax','employee and employer pensions','student loans','statutory payments',
      'employment allowance and employer relief','special employee/director circumstances']
  };
}
