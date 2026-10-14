/** Historical fictional DTR -> automatically prepared payslip PREVIEWS.
 * These are never released, paid or approvable without separately uploaded/verified attendance.
 * This is intentionally a deterministic browser-local DEMO backfill, not a real payroll ledger.
 */
import type {Person} from './people';
import type {PayslipDraft,PayrollConfig} from './payrollConfig';
import type {PayrollRelease} from './hrState';
import {basicRateOnDate,roundMoney} from './payrollConfig';
import {buildDemoAttendance,DEMO_ATTENDANCE_AS_OF,type DemoAttendanceRow} from './demoAttendance';
import {cutoffForDate,addCutoffDays} from './attendanceUpload';
import {demoCutoffEarnings} from './payrollAttendance';
import {computeGovernmentDeductions,estimateMonthlyBasis} from './payrollCalculations';

const ID_PREFIX='AUTO-DEMO-';
export const isDemoBackfillDraft=(d:PayslipDraft)=>d.id.startsWith(ID_PREFIX);
const safeDays=(n:number)=>Math.max(0,Math.round(n*100)/100);

/** Merge only MISSING historical previews: never touch user drafts, completed releases or signed documents. */
export function backfillHistoricalDemoPreviews<T extends {people:Person[];payrollReleases:PayrollRelease[];payrollConfig?:PayrollConfig}>(state:T):T{
 const cfg=state.payrollConfig;
 if(!cfg||!state.people.length)return state;
 const existing=new Set(cfg.payslipDrafts.map(d=>`${d.employeeId}:${d.periodStart}`));
 const issued=new Set(state.payrollReleases.filter(r=>r.kind==='Salary').map(r=>`${r.employeeId}:${r.periodStart}`));
 const byEmployee=new Map<string,Map<string,DemoAttendanceRow[]>>();
 for(const row of buildDemoAttendance(state.people)){
  const cutoff=cutoffForDate(row.date);
  // On Oct 14 the punch is Pending Today. Never calculate an unfinished cutoff.
  if(addCutoffDays(cutoff,6)>=DEMO_ATTENDANCE_AS_OF)continue;
  let weeks=byEmployee.get(row.employeeId);
  if(!weeks){weeks=new Map();byEmployee.set(row.employeeId,weeks)}
  let days=weeks.get(cutoff);
  if(!days){days=[];weeks.set(cutoff,days)}
  days.push(row);
 }
 const prepared:PayslipDraft[]=[];
 for(const person of state.people){
  const weeks=byEmployee.get(person.id);
  if(!weeks)continue;
  for(const [start,rows] of weeks){
   const key=`${person.id}:${start}`;
   if(existing.has(key)||issued.has(key))continue;
   const end=addCutoffDays(start,6);
   if(start<`${DEMO_ATTENDANCE_AS_OF.slice(0,4)}-01-01`)continue;
   const salaryRate=basicRateOnDate(person.id,person.rate,start,cfg.rateChanges);
   if(!Number.isFinite(salaryRate)||salaryRate<=0)continue;
   const worked=rows.filter(r=>r.status==='Present'||r.status==='Late'||r.status==='Overtime');
   const daysWorked=worked.length;
   const lateMinutes=worked.reduce((a,r)=>a+r.lateMinutes,0);
   const scheduledDays=rows.filter(r=>r.status!=='Rest Day').length;
   const pending=rows.filter(r=>r.status==='Incomplete'||r.status==='On Leave');
   // Sample overtime cannot be treated as approved OT. Always preview as 0 hours.
   const unverifiedOt=rows.filter(r=>r.status==='Overtime').length;
   const earn=demoCutoffEarnings({salaryType:person.salaryType,rate:salaryRate,daysWorked,paidLeaveDays:0,scheduledDays,lateMinutes,otHours:0});
   const gross=roundMoney(Math.max(0,earn.gross+earn.lateReduction));
   const month=cfg.monthlyBases[person.id]??estimateMonthlyBasis(salaryRate,person.salaryType);
   // These are only reference computations and must never be remitted or posted from fictional DTR.
   const gov=gross>0?computeGovernmentDeductions({monthlyBasis:month,weeklyGross:earn.gross,periodEnd:end,versions:cfg.deductionVersions,birExempt:cfg.birExemptEmployees.includes(person.id),basisEstimated:person.salaryType==='Daily'&&!cfg.monthlyBases[person.id]}):null;
   const reference=roundMoney((gov?.employeeTotal||0)+earn.lateReduction);
   const needsDeductionReview=reference>gross;
   // For zero/insufficient wages, do not invent payment or collect deductions.
   const deductions=needsDeductionReview?0:reference;
   const remarks=`SIMULATED attendance preview only. NOT a payable, approved, released, or verified payslip. ${daysWorked} fictional day(s) worked. ${pending.length} incomplete/unmatched leave day(s). ${unverifiedOt} overtime day(s) excluded until supervisor approval. ${needsDeductionReview?'Reference deductions exceed wages; shown as 0 pending HR review. ':''}Upload a full valid attendance CSV for this branch/cutoff to replace this preview with an automatically calculated For Review payslip. HR must verify pay rates, holidays, leave, ECOLA, tax and loan rules.`;
   prepared.push({
    id:`${ID_PREFIX}${start}-${person.id}`,employeeId:person.id,periodStart:start,periodEnd:end,
    days:daysWorked,workedDays:daysWorked,workedHours:safeDays(worked.reduce((n,r)=>n+r.hoursWorked,0)),
    salaryType:person.salaryType,rateAmount:salaryRate,dailyRate:earn.dailyRate,hourlyRate:earn.hourlyRate,
    paidLeaveDays:0,unpaidLeaveDays:rows.filter(r=>r.status==='On Leave').length,
    lateMinutes,scheduledDays,otHours:0,allowances:0,ecolaPay:0,holidayExtra:0,
    basicPay:roundMoney(earn.basic+earn.lateReduction),otPay:0,lateDeduction:earn.lateReduction,
    gross,deductions,net:roundMoney(gross-deductions),
    deductionBreakdown:needsDeductionReview?[]:(gov?.items||[]).map(x=>({agency:x.agency,employee:x.employee,employer:x.employer,version:x.version})),
    loanDeduction:0,loanEntries:[],manualDeduction:0,
    status:'Draft',attendanceSource:'Demo Cutoff',createdAt:DEMO_ATTENDANCE_AS_OF,remarks
   });
   existing.add(key);
  }
 }
 if(!prepared.length)return state;
 return {...state,payrollConfig:{...cfg,payslipDrafts:[...cfg.payslipDrafts,...prepared]}};
}
