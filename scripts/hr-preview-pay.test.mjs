import test from 'node:test';
import assert from 'node:assert/strict';
import {previewPay2026} from '../lib/hr/previewPay2026.mjs';
const base={amount:1000,basis:'weekly',period:'weekly',taxCode:'1257L',region:'england',niCategory:'A',
 employeePensionPercent:0,employerPensionPercent:0,studentLoanPlan:'none'};
test('zero pay yields zero pay, deductions and employer cost',()=>{
 const x=previewPay2026({...base,amount:0});
 for(const k of ['grossPence','payePence','employeeNIPence','employerNIPence','netPayPence','totalEmployerCostPence'])
  assert.equal(x[k],0,k);
});
test('ordinary weekly A: £1000 yields £58.66 employee NI and £135.60 employer NI in illustration',()=>{
 const x=previewPay2026(base);
 assert.equal(x.employeeNIPence,5866); assert.equal(x.employerNIPence,13560);
 assert.equal(x.netPayPence,x.grossPence-x.payePence-x.employeeNIPence);
 assert.equal(x.estimatesOnly,true); assert.equal(x.canIssuePayslip,false); assert.equal(x.canReleasePayment,false); assert.equal(x.canSubmitRTI,false);
});
test('monthly £1000 is below category A employee primary threshold',()=>{
 const x=previewPay2026({...base,amount:1000,basis:'monthly',period:'monthly'});
 assert.equal(x.employeeNIPence,0); assert.equal(x.employerNIPence,8745);
});
test('annual £12,570 monthly standard-code illustration has zero PAYE and NI at 2026-27 monthly primary threshold',()=>{
 const x=previewPay2026({...base,amount:12570,basis:'annual',period:'monthly'});
 assert.equal(x.payePence,0);assert.equal(x.employeeNIPence,0);
});
test('illustrative pension and student loan deductions never approve payroll',()=>{
 const x=previewPay2026({...base,amount:4000,basis:'monthly',period:'monthly',employeePensionPercent:5,employerPensionPercent:3,studentLoanPlan:'2',postgraduateLoan:true});
 assert(x.employeePensionPence>0);assert(x.employerPensionPence>0);assert(x.studentLoanPence>0);assert(x.postgraduateLoanPence>0);
 assert.equal(x.approved,false);assert.equal(x.canIssuePayslip,false);
});
test('refuses unsupported codes, regions, categories, high income and bad inputs rather than fabricating final payroll',()=>{
 for(const change of [{taxCode:'BR'},{region:'scotland'},{niCategory:'H'},{amount:-1},{amount:200000,basis:'annual'},{employeePensionPercent:30},{period:'fortnightly'}])
  assert.throws(()=>previewPay2026({...base,...change}));
});
