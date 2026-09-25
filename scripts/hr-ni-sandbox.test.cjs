'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const source=fs.readFileSync('lib/hr/sandboxNI2026.ts','utf8');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
 {module:m,exports:m.exports,require});
const {calculateSandboxNI,sandboxNI2026}=m.exports;
test('official weekly category A £1,000 NI example: employee £58.66',()=>{
 const result=calculateSandboxNI(100000,'weekly','A');
 assert.equal(result.employeeNIPence,5866);
 assert.equal(result.employerNIPence,13560);
 assert.equal(result.grossPlusEmployerNIPence,113560);
 assert.equal(result.payECalculated,false);
 assert.equal(result.payrollApproved,false);
});
test('zero NI below weekly secondary threshold',()=>{
 const r=calculateSandboxNI(9000,'weekly','A');
 assert.equal(r.employeeNIPence,0);assert.equal(r.employerNIPence,0);
});
test('monthly employer and employee NI thresholds',()=>{
 const r=calculateSandboxNI(120000,'monthly','A');
 assert.equal(r.employeeNIPence,1216);assert.equal(r.employerNIPence,11745);
});
test('unsupported NI categories and invalid gross pay fail closed',()=>{
 assert.throws(()=>calculateSandboxNI(100000,'weekly','M'),/Only ordinary/);
 assert.throws(()=>calculateSandboxNI(-1,'weekly','A'),/safe non-negative/);
 assert.throws(()=>calculateSandboxNI(1000.5,'weekly','A'),/safe non-negative/);
 assert.throws(()=>calculateSandboxNI(100000,'fortnightly','A'),/Weekly or monthly/);
});
test('versioned config ends at tax-year boundary',()=>{
 assert.equal(sandboxNI2026.effectiveFrom,'2026-04-06');
 assert.equal(sandboxNI2026.effectiveTo,'2027-04-05');
});
