/**
 * Fictional, deterministic payslip snapshots for the demo employees and September 2026.
 * This is NOT a backfill of an actual paid salary or a government-verified tax calculation.
 * Only the original, unchanged SAMPLE-PAY records may be regenerated.
 */
import type {Person} from './people';
import type {PayrollRelease} from './hrState';
import type {PayslipDraft,PayrollConfig} from './payrollConfig';
import {initialPayrollConfig,roundMoney} from './payrollConfig';
import {summarizePayrollAttendance,demoCutoffEarnings} from './payrollAttendance';
import {computeGovernmentDeductions,estimateMonthlyBasis} from './payrollCalculations';

const starts=['2026-09-10','2026-09-17','2026-09-24'] as const;
const ends=['2026-09-16','2026-09-23','2026-09-30'] as const;
const paid=['2026-09-18','2026-09-25','2026-10-02'] as const;
const originalGross=(p:Person)=>roundMoney(p.salaryType==='Daily'?p.rate*6:p.rate/4);

/** Fingerprint of untouched, old gross-only mock record (not any edited or live release). */
export function isOriginalGrossOnlySample(release:PayrollRelease,baseline:Person|undefined,person:Person|undefined){
 if(!baseline||!person||person.id!==baseline.id||person.name!==baseline.name||person.rate!==baseline.rate||person.salaryType!==baseline.salaryType)return false;
 const week=ends.indexOf(release.periodEnd as typeof ends[number]);
 if(week<0||release.id!==`SAMPLE-PAY-${baseline.id}-${week+1}`||release.source!=='Sample'||release.kind!=='Salary'||release.status!=='Released'||release.periodStart!==starts[week]||release.paidAt!==paid[week])return false;
 const gross=originalGross(baseline);
 const index=Number(baseline.id.slice(3))-1;
 const deductions=roundMoney(gross*(.07+(index%3)*.01));
 return Math.abs(release.gross-gross)<.001&&Math.abs(release.deductions-deductions)<.001&&Math.abs(release.net-roundMoney(gross-deductions))<.001;
}

export function createIllustrativePayslip(person:Person,people:readonly Person[],week:number,versions:PayrollConfig['deductionVersions']=initialPayrollConfig.deductionVersions){
 if(week<0||week>=starts.length)throw Error('Invalid illustrative cutoff');
 const summary=summarizePayrollAttendance(people,person.id,starts[week]);
 if(summary.hasFuture||summary.rows.length!==7)throw Error('Illustrative cutoff lacks full historical week');
 // There are no real verified leave entitlements on these original sample releases.
 const salary=demoCutoffEarnings({salaryType:person.salaryType,rate:person.rate,daysWorked:summary.workedDays,paidLeaveDays:0,scheduledDays:summary.scheduledDays,lateMinutes:summary.lateMinutes,otHours:summary.otHours});
 const deductions=computeGovernmentDeductions({monthlyBasis:estimateMonthlyBasis(person.rate,person.salaryType),weeklyGross:salary.gross,periodEnd:ends[week],versions,basisEstimated:true});
 // Late pay is a visible separate deduction; calculation of BIR still uses *after-late* taxable earnings.
 const gross=roundMoney(salary.gross+salary.lateReduction);
 // If the fictional week has no payable time, do not invent paid wages or collect
 // monthly remittances from a zero-pay sample; flag the uncollected references.
 if(gross===0){for(const item of deductions.items){item.employee=0;item.employer=0;item.version="NO PAYABLE DEMO WAGES — monthly remittance requires separate HR review"}deductions.employeeTotal=0}
 const total=roundMoney(deductions.employeeTotal+salary.lateReduction);
 const net=roundMoney(gross-total);
 if(gross<0||total>gross||!Number.isFinite(net))throw Error(`Invalid sample payslip totals for ${person.id}`);
 const id=`SAMPLE-PAY-${person.id}-${week+1}`;
 const release:PayrollRelease={id,employeeId:person.id,periodStart:starts[week],periodEnd:ends[week],paidAt:paid[week],gross,deductions:total,net,kind:'Salary',status:'Released',source:'Sample'};
 const draft:PayslipDraft={id:`SAMPLE-DETAIL-${person.id}-${week+1}`,employeeId:person.id,periodStart:starts[week],periodEnd:ends[week],days:summary.workedDays,workedDays:summary.workedDays,workedHours:roundMoney(summary.rows.reduce((sum,row)=>sum+((row.status==='Present'||row.status==='Late'||row.status==='Overtime')?row.hoursWorked:0),0)),paidLeaveDays:0,unpaidLeaveDays:0,lateMinutes:summary.lateMinutes,lateDeduction:salary.lateReduction,scheduledDays:summary.scheduledDays,salaryType:person.salaryType,rateAmount:person.rate,dailyRate:salary.dailyRate,hourlyRate:salary.hourlyRate,attendanceSource:'Demo Cutoff',otHours:summary.otHours,allowances:0,ecolaPay:0,holidayExtra:0,gross,deductions:total,net,basicPay:roundMoney(salary.basic+salary.lateReduction),otPay:salary.ot,deductionBreakdown:deductions.items.map(i=>({agency:i.agency,employee:i.employee,employer:i.employer,version:i.version})),loanDeduction:0,loanEntries:[],manualDeduction:0,status:'Released (Demo)',createdAt:paid[week],releasedId:id,remarks:'FICTIONAL DEMO SNAPSHOT — unverified September 2026 sample attendance, reference deductions and sample pay rates; not evidence of a payment.'};
 return {release,draft};
}

export function seedIllustrativePayslips(people:readonly Person[]){
 const pairs=people.flatMap(person=>starts.map((_,i)=>createIllustrativePayslip(person,people,i)));
 return {releases:pairs.map(p=>p.release),drafts:pairs.map(p=>p.draft)};
}

/**
 * Upgrade only original demo seed rows, and never change manually generated drafts,
 * browser-reviewed releases, existing signatures, or edited sample amounts.
 */
export function upgradeOriginalSamples<T extends {people:Person[];payrollReleases:PayrollRelease[];payrollConfig?:PayrollConfig}>(state:T,baseline:readonly Person[]):T{
 const matching=state.payrollReleases.filter(release=>{
  const original=baseline.find(p=>p.id===release.employeeId);
  const current=state.people.find(p=>p.id===release.employeeId);
  return isOriginalGrossOnlySample(release,original,current)
   && !state.payrollConfig?.payslipDrafts?.some(d=>d.releasedId===release.id)
   && !state.payrollConfig?.signatureRequests?.some(s=>s.releaseId===release.id)
   && !state.payrollConfig?.rateChanges?.some(r=>r.employeeId===release.employeeId&&r.effective<=release.periodEnd)
   && !state.payrollReleases.some(r=>r!==release&&r.employeeId===release.employeeId&&r.periodStart===release.periodStart&&r.kind==='Salary'&&r.source==='Browser Review');
 });
 if(!matching.length)return state;
 const existing=new Map(state.payrollReleases.map(r=>[r.id,r]));
 const details=state.payrollConfig?.payslipDrafts||[];
 const versions=state.payrollConfig?.deductionVersions||initialPayrollConfig.deductionVersions;
 const appended:PayslipDraft[]=[];
 for(const old of matching){
  const person=state.people.find(p=>p.id===old.employeeId)!;
  const week=ends.indexOf(old.periodEnd as typeof ends[number]);
  try {const generated=createIllustrativePayslip(person,state.people,week,versions);existing.set(old.id,generated.release);appended.push(generated.draft)}catch{/* preserve original record if attendance or calculations fail */}
 }
 if(!appended.length)return state;
 return {...state,payrollReleases:state.payrollReleases.map(r=>existing.get(r.id)||r),payrollConfig:{...initialPayrollConfig,...state.payrollConfig,payslipDrafts:[...details,...appended]}};
}
