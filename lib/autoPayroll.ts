/** Cutoff-close -> uploaded punches -> auto computation -> HR approval queue.
 * This engine is browser-local DEMO arithmetic, NOT compliant production payroll.
 */
import type {Person} from './people';
import type {PayrollConfig,PayslipDraft,ImportedAttendanceRow} from './payrollConfig';
import {basicRateOnDate,roundMoney} from './payrollConfig';
import {demoCutoffEarnings} from './payrollAttendance';
import {computeGovernmentDeductions,estimateMonthlyBasis} from './payrollCalculations';
import type {PremiumProfile,PayrollRelease} from './hrState';
import {employeeCoverage,addCutoffDays} from './attendanceUpload';
import {loanInstallments,roundLoan,type LoanRecord} from './loanLedger';

export type AutoPayrollIssue={employeeId:string;name:string;reason:string};
export type AutoPayrollResult={drafts:PayslipDraft[];created:number;refreshed:number;skipped:number;issues:AutoPayrollIssue[]};
type Args={cfg:PayrollConfig;people:readonly Person[];premiums:Record<string,PremiumProfile>;loans:readonly LoanRecord[];releases:readonly PayrollRelease[];today:string};
const autoId=(branch:string,start:string,employeeId:string)=>`AUTO-${start}-${employeeId}`;
export function reconcileAutoPayroll({cfg,people,premiums,loans,releases,today}:Args):AutoPayrollResult{
 const next=[...cfg.payslipDrafts],issues:AutoPayrollIssue[]=[];
 let created=0,refreshed=0,skipped=0;
 for(const batch of cfg.attendanceRecords){
  if(batch.status!=='Verified'||batch.periodEnd>today)continue;
  const rows=cfg.attendanceRows.filter(x=>x.branch===batch.branch&&x.date>=batch.periodStart&&x.date<=batch.periodEnd);
  for(const person of people.filter(p=>p.branch===batch.branch&&p.hire<=batch.periodEnd)){
   const existing=next.find(d=>d.employeeId===person.id&&d.periodStart===batch.periodStart&&!d.id.startsWith('SAMPLE-DETAIL-'));
   // An already approved, released, manually drafted or signed snapshot must not be changed automatically.
   if(releases.some(r=>r.employeeId===person.id&&r.periodStart===batch.periodStart&&r.periodEnd===batch.periodEnd&&r.kind==='Salary'&&r.source==='Browser Review')||
    (existing&&(existing.status==='Approved'||existing.status==='Released (Demo)'||(existing.attendanceSource!=='Uploaded CSV'&&!existing.id.startsWith('AUTO-DEMO-'))))){skipped++;continue}
   const c=employeeCoverage(rows,person.id,batch.periodStart,person.hire);
   if(!c.ready){issues.push({employeeId:person.id,name:person.name,reason:c.missing.length?`${c.missing.length} missing date(s): ${c.missing.slice(0,3).join(', ')}`:`${c.incomplete.length} incomplete punch(es)`});continue}
   const summary=c.selected;
   const workedDays=summary.filter(r=>r.status==='Present').length;
   const otHours=roundMoney(summary.reduce((a,r)=>a+r.approvedOtHours,0));
   const lateMinutes=summary.reduce((a,r)=>a+r.lateMinutes,0);
   const scheduledDays=summary.filter(r=>r.status!=='Rest Day').length;
   const paidLeave=0; // Uploaded 'On Leave' is unpaid until approved leave records are linked explicitly.
   if(summary.some(r=>r.status==='On Leave')){issues.push({employeeId:person.id,name:person.name,reason:'Leave found: verify paid/unpaid leave approval before posting payroll'});continue}
   const rate=basicRateOnDate(person.id,person.rate,batch.periodStart,cfg.rateChanges);
   if(!Number.isFinite(rate)||rate<=0){issues.push({employeeId:person.id,name:person.name,reason:'Missing or invalid salary rate'});continue}
   const earn=demoCutoffEarnings({salaryType:person.salaryType,rate,daysWorked:workedDays,paidLeaveDays:paidLeave,scheduledDays,lateMinutes,otHours,otMultiplier:premiums[person.id]?.ot??(person.department==='Operations'?200:person.department==='Service'?150:125)});
   const gross=roundMoney(earn.gross+earn.lateReduction);
   if(gross<=0){issues.push({employeeId:person.id,name:person.name,reason:'Zero computed gross; HR must review before release'});continue}
   const month=cfg.monthlyBases[person.id]??estimateMonthlyBasis(rate,person.salaryType);
   const gov=computeGovernmentDeductions({monthlyBasis:month,weeklyGross:earn.gross,periodEnd:batch.periodEnd,versions:cfg.deductionVersions,birExempt:cfg.birExemptEmployees.includes(person.id),basisEstimated:person.salaryType==='Daily'&&!cfg.monthlyBases[person.id]});
   const entries=loanInstallments(loans,person.id,person.name,batch.periodEnd).map(x=>({loanId:x.loan.id,amount:x.amount}));
   const loanDeduction=roundLoan(entries.reduce((sum,x)=>sum+x.amount,0));
   const deductions=roundMoney(gov.employeeTotal+loanDeduction+earn.lateReduction);
   if(deductions>gross){issues.push({employeeId:person.id,name:person.name,reason:'Deductions exceed gross; manual HR review needed'});continue}
   const fingerprint=JSON.stringify({
    batch:batch.id,
    attendance:summary.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(x=>[x.date,x.status,x.timeIn,x.timeOut,x.approvedOtHours]),
    rate,premium:premiums[person.id]?.ot??(person.department==='Operations'?200:person.department==='Service'?150:125),
    monthlyBasis:month,contributions:gov.items.map(x=>[x.agency,x.employee,x.version]),loanEntries:entries,
    birExempt:cfg.birExemptEmployees.includes(person.id)
   });
   if(existing&&existing.attendanceFingerprint===fingerprint){skipped++;continue}
   const draft:PayslipDraft={id:existing&&!existing.id.startsWith('AUTO-DEMO-')?existing.id:autoId(batch.branch,batch.periodStart,person.id),employeeId:person.id,
    periodStart:batch.periodStart,periodEnd:batch.periodEnd,days:workedDays,workedDays,workedHours:roundMoney(summary.reduce((n,r)=>n+r.workedHours,0)),
    paidLeaveDays:0,unpaidLeaveDays:0,lateMinutes,scheduledDays,salaryType:person.salaryType,rateAmount:rate,dailyRate:earn.dailyRate,hourlyRate:earn.hourlyRate,
    attendanceSource:'Uploaded CSV',attendanceBatchId:batch.id,attendanceFingerprint:fingerprint,otHours,allowances:0,ecolaPay:0,holidayExtra:0,
    basicPay:roundMoney(earn.basic+earn.lateReduction),otPay:earn.ot,lateDeduction:earn.lateReduction,gross,deductions,net:roundMoney(gross-deductions),
    deductionBreakdown:gov.items.map(x=>({agency:x.agency,employee:x.employee,employer:x.employer,version:x.version})),
    loanDeduction,loanEntries:entries,manualDeduction:0,status:'For Review',createdAt:existing?.createdAt||today,
    remarks:`Auto-calculated (browser demo) from CSV ${batch.fileName} · ${workedDays} day(s) worked. HR MUST verify 8-hour shift, holidays, ECOLA, legal contribution and tax rules before approval. Uploaded CSV is not authenticated biometrics.`};
   if(existing){next[next.indexOf(existing)]=draft;refreshed++}else{next.push(draft);created++}
  }
 }
 return {drafts:next,created,refreshed,skipped,issues};
}
