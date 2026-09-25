/**
 * Strictly illustrative 2026-27 UK payroll preview. NOT HMRC-compliant PAYE software.
 * Only standard 1257L England/Wales/NI, category A and weekly/monthly employee pay.
 * Cannot approve payroll, generate payslips, run RTI or release salary.
 * Sources: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
 * https://www.gov.uk/government/publications/software-developers-payroll-test-data-2026-to-2027
 */
export const previewPayRules2026 = Object.freeze({
 taxYear: '2026-27', effectiveFrom:'2026-04-06', effectiveTo:'2027-04-05',
 weekly: {periods:52, primary:24200, upper:96700, secondary:9600,
   student:{'1':51730,'2':56509,'4':64990,'5':48076},postgraduate:40384},
 monthly:{periods:12, primary:104800,upper:418900,secondary:41700,
   student:{'1':224166,'2':244875,'4':281625,'5':208333},postgraduate:175000}
});
const asPennies=(n)=>{if(!Number.isFinite(n)||n<0||n>100000000)return NaN;return Math.round(n*100)};
const asPercent=(n)=>{if(!Number.isFinite(n)||n<0||n>25)throw new Error('Contribution must be between 0 and 25%.');return n};
const roundPence=(n)=>Math.round(n);
export function previewPay2026(input){
 const {
  amount,basis='monthly',period='monthly',hours=0,overtimeHours=0,
  overtimeHourlyRate=0,bonus=0,taxCode='1257L',region='england',
  niCategory='A',employeePensionPercent=0,employerPensionPercent=0,
  pensionTaxTreatment='relief_at_source',studentLoanPlan='none',
  postgraduateLoan=false
 }=input;
 if(!['monthly','weekly'].includes(period))throw new Error('Choose weekly or monthly payroll.');
 if(!['annual','monthly','weekly','hourly'].includes(basis))throw new Error('Choose a supported salary basis.');
 if(taxCode!=='1257L'||!['england','wales','northern_ireland'].includes(region))
  throw new Error('This estimate supports only tax code 1257L outside Scotland.');
 if(niCategory!=='A')throw new Error('This estimate supports ordinary NI category A only.');
 if(!['net_pay','relief_at_source'].includes(pensionTaxTreatment))
  throw new Error('Choose a supported pension tax treatment.');
 if(!['none','1','2','4','5'].includes(studentLoanPlan))throw new Error('Student loan plan not supported.');
 const rules=previewPayRules2026[period];
 const salaryPence=asPennies(amount),bonusPence=asPennies(bonus),overtimeRatePence=asPennies(overtimeHourlyRate);
 if([salaryPence,bonusPence,overtimeRatePence].some(x=>!Number.isSafeInteger(x)))
  throw new Error('Enter non-negative pounds and pence within supported limits.');
 if(!Number.isFinite(hours)||hours<0||hours>744||!Number.isFinite(overtimeHours)||overtimeHours<0||overtimeHours>744)
  throw new Error('Enter valid hours for the selected payroll period.');
 const base=roundPence(basis==='annual'?salaryPence/rules.periods:
    basis==='monthly'?salaryPence*(period==='monthly'?1:12/52):
    basis==='weekly'?salaryPence*(period==='weekly'?1:52/12):
    salaryPence*hours);
 const overtime=roundPence(overtimeRatePence*overtimeHours);
 const grossPence=base+overtime+bonusPence;
 if(grossPence>100000000)throw new Error('Gross pay exceeds this preview limit.');
 const ep=asPercent(employeePensionPercent),rp=asPercent(employerPensionPercent);
 const employeePensionPence=roundPence(grossPence*ep/100),employerPensionPence=roundPence(grossPence*rp/100);
 const taxablePence=grossPence-(pensionTaxTreatment==='net_pay'?employeePensionPence:0);
 const annualTaxable=taxablePence*rules.periods;
 if(annualTaxable>10000000)
  throw new Error('PAYE preview is unavailable above £100,000 annualised taxable pay due to personal allowance taper.');
 const taxableAfterAllowance=Math.max(0,annualTaxable-1257000);
 const annualTaxPence=Math.min(taxableAfterAllowance,3770000)*.2+
  Math.max(0,taxableAfterAllowance-3770000)*.4;
 const payePence=roundPence(annualTaxPence/rules.periods);
 const employeeNIPence=roundPence(Math.max(0,Math.min(grossPence,rules.upper)-rules.primary)*.08+
   Math.max(0,grossPence-rules.upper)*.02);
 const employerNIPence=roundPence(Math.max(0,grossPence-rules.secondary)*.15);
 const studentThreshold=studentLoanPlan==='none'?null:rules.student[studentLoanPlan];
 const studentLoanPence=studentThreshold===null?0:Math.floor(Math.max(0,grossPence-studentThreshold)*.09);
 const postgraduateLoanPence=postgraduateLoan?Math.floor(Math.max(0,grossPence-rules.postgraduate)*.06):0;
 const netPayPence=grossPence-payePence-employeeNIPence-employeePensionPence-studentLoanPence-postgraduateLoanPence;
 const totalEmployerCostPence=grossPence+employerNIPence+employerPensionPence;
 return {taxYear:previewPayRules2026.taxYear,period,basis,taxCode,niCategory,
   grossPence,taxablePence,payePence,employeeNIPence,employerNIPence,
   employeePensionPence,employerPensionPence,studentLoanPence,postgraduateLoanPence,
   netPayPence,totalEmployerCostPence,assumptions:[
    'Illustrative annualised non-cumulative PAYE; previous pay/tax, adjustments, benefits and alternative tax codes excluded.',
    'Student loans, pension relief and NIC rounding require comparison with HMRC payroll test data.',
    'Pension contributions assumed to be percentages of gross pay, not statutory qualifying earnings.',
    'Statutory payments, director rules, employer relief, authorised deductions, prior employment and irregular working patterns excluded.'
   ],estimatesOnly:true,approved:false,canIssuePayslip:false,canSubmitRTI:false,canReleasePayment:false};
}
