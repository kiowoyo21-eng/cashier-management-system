/** 13th-month YEAR-TO-DATE audit preview. No payments, signatures or balances are created.
 * DOLE: annual eligible basic earnings / 12, not gross wages / 12.
 * Fictional 2026 DTR is a demonstration only; statutory treatment of holidays,
 * paid leave, and managerial eligibility requires verification by HR.
 */
import type {Person} from './people';
import type {PayrollConfig} from './payrollConfig';
type SalaryRelease={id:string;employeeId:string;periodStart:string;periodEnd:string;kind:string;status:string;source:string;gross:number};
import {basicRateOnDate,roundMoney} from './payrollConfig';
import {buildDemoAttendance} from './demoAttendance';

export type ThirteenthEstimate={employeeId:string;name:string;hire:string;year:number;asOf:string;
 verifiedBasic:number;simulatedBasic:number;eligibleBasic:number;amount:number;
 simulatedWorkedDays:number;verifiedCutoffs:number;unverifiedReleaseCount:number;simulatedLeaveDays:number;
 source:'DEMO'|'MIXED'|'VERIFIED';};

export function buildThirteenthEstimates({people,year,asOf,config,releases}:{people:readonly Person[];year:number;asOf:string;config:PayrollConfig;releases:readonly SalaryRelease[]}):ThirteenthEstimate[]{
 const end=asOf.slice(0,4)===String(year)?asOf:`${year}-12-31`;
 const dates=year===2026?buildDemoAttendance(people):[];
 const peopleById=new Map(people.map(p=>[p.id,p]));
 const groups=new Map<string,typeof dates>();
 for(const row of dates){if(row.date>end)continue;const previous=groups.get(row.employeeId)||[];previous.push(row);groups.set(row.employeeId,previous)}
 const snapshots=config.payslipDrafts.filter(d=>d.status==='Released (Demo)'&&typeof d.basicPay==='number');
 const validReleaseInfo=new Map<string,{start:string;end:string;basic:number}[]>();
 const lockedWindows=new Map<string,{start:string;end:string}[]>();
 const invalidReleaseCounts=new Map<string,number>();
 for(const release of releases){
  if(release.kind!=='Salary'||release.source!=='Browser Review'||release.status!=='Released'||release.periodEnd>end||release.periodStart.slice(0,4)!==String(year)||!peopleById.has(release.employeeId))continue;
  const windows=lockedWindows.get(release.employeeId)||[];
  if(windows.some(w=>release.periodStart<=w.end&&release.periodEnd>=w.start)){invalidReleaseCounts.set(release.employeeId,(invalidReleaseCounts.get(release.employeeId)||0)+1);continue}
  windows.push({start:release.periodStart,end:release.periodEnd});lockedWindows.set(release.employeeId,windows);
  const draft=snapshots.find(d=>d.releasedId===release.id&&d.employeeId===release.employeeId&&d.periodStart===release.periodStart&&d.periodEnd===release.periodEnd);
  if(draft&&Number.isFinite(draft.basicPay)&&draft.basicPay!>=0&&draft.basicPay!<=release.gross){
   const records=validReleaseInfo.get(release.employeeId)||[];
   records.push({start:release.periodStart,end:release.periodEnd,basic:roundMoney(draft.basicPay!)});
   validReleaseInfo.set(release.employeeId,records);
  }else{invalidReleaseCounts.set(release.employeeId,(invalidReleaseCounts.get(release.employeeId)||0)+1)}
 }
 return people.map(person=>{
  const windows=lockedWindows.get(person.id)||[];
  const snapshotsForEmployee=validReleaseInfo.get(person.id)||[];
  const verifiedBasic=roundMoney(snapshotsForEmployee.reduce((n,item)=>n+item.basic,0));
  let simulatedBasic=0,simulatedWorkedDays=0,simulatedLeaveDays=0;
  for(const row of groups.get(person.id)||[]){
   if(row.date<`${year}-01-01`||row.date<person.hire||windows.some(w=>row.date>=w.start&&row.date<=w.end))continue;
   if(row.status==='On Leave'){simulatedLeaveDays++;continue}
   if(!(['Present','Late','Overtime'] as string[]).includes(row.status))continue;
   const rate=basicRateOnDate(person.id,person.rate,row.date,config.rateChanges);
   if(!Number.isFinite(rate)||rate<=0)continue;
   // 26 workdays and 8 paid hours are SAMPLE assumptions, not a legal monthly pay divisor.
   const dayBasic=person.salaryType==='Daily'?rate:rate/26;
   const lateAdjustment=dayBasic*Math.min(1,Math.max(0,row.lateMinutes)/480);
   simulatedBasic+=Math.max(0,dayBasic-lateAdjustment);
   simulatedWorkedDays++;
  }
  simulatedBasic=roundMoney(simulatedBasic);
  const eligibleBasic=roundMoney(verifiedBasic+simulatedBasic);
  return {employeeId:person.id,name:person.name,hire:person.hire,year,asOf:end,verifiedBasic,simulatedBasic,eligibleBasic,
   amount:roundMoney(eligibleBasic/12),simulatedWorkedDays,verifiedCutoffs:snapshotsForEmployee.length,
   unverifiedReleaseCount:invalidReleaseCounts.get(person.id)||0,simulatedLeaveDays,
   source:verifiedBasic>0?(simulatedBasic>0?'MIXED':'VERIFIED'):'DEMO'};
 });
}

/** An exported estimate is never a payroll release or evidence of actual wages. */
export function thirteenthCsvText(estimates:readonly ThirteenthEstimate[],year:number){
 const headers=['Year','Employee ID','Employee','Hire Date','As Of','Verified Basic Salary','Simulated Basic Salary (NOT VERIFIED)','Total Eligible Basic (ESTIMATE)','13th Month (ESTIMATE)','Simulated Days Worked','Verified Cutoffs','Incomplete Historical Releases','Simulated Unverified Leave Days','Status'];
 const items=[headers,...estimates.map(e=>[year,e.employeeId,e.name,e.hire,e.asOf,e.verifiedBasic.toFixed(2),e.simulatedBasic.toFixed(2),e.eligibleBasic.toFixed(2),e.amount.toFixed(2),e.simulatedWorkedDays,e.verifiedCutoffs,e.unverifiedReleaseCount,e.simulatedLeaveDays,e.source])];
 return items.map(row=>row.map(val=>`"${String(val).replace(/^([=+@-])/,'\'$1').replaceAll('"','""')}"`).join(',')).join('\r\n');
}
export function exportThirteenthCSV(estimates:readonly ThirteenthEstimate[],year:number){
 const blob=new Blob([thirteenthCsvText(estimates,year)],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
 a.download=`UCMM_13th_Month_${year}_DEMO_Estimate.csv`;a.click();URL.revokeObjectURL(url);
}
