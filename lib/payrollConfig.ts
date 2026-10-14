/** Frontend payroll review configuration. Source-backed reference schedules are NOT live payroll rules. */
export type PayrollArea = "rates"|"government"|"holidays"|"thirteenth"|"history"|"generate"|"loans"|"attendance";
export type Agency = "SSS"|"PhilHealth"|"Pag-IBIG"|"BIR";
export type DeductionBracket = {min:number;max:number;employee:number;employer:number;rate?:number;fixed?:number;effective:string};
export type DeductionVersion={id:string;agency:Agency;label:string;effective:string;sourceUrl:string;sourceLabel:string;status:"Reference — needs HR review"|"Draft Update"|"Reviewed for Demo";rows:DeductionBracket[];notes:string};
export type MinimumWage={id:string;region:string;classification:string;amount:number;effective:string;source:string};
export type PayRateChange={id:string;employeeId:string;salaryType:"Daily"|"Monthly";amount:number;effective:string;reason:string;status:"Scheduled"|"Applied (Demo)";recordedAt:string};
export type HolidayRule={id:string;date:string;name:string;type:"Regular Holiday"|"Special Non-Working Day"|"Special Working Day";branch:string;baseline:number;department:string;departmentRate:number|null;employeeId:string;employeeRate:number|null;notes:string};
export type AttendanceStatus="Not Uploaded"|"Uploaded"|"For Verification"|"Verified"|"Needs Correction";
export type ImportedAttendanceRow={employeeId:string;branch:string;date:string;timeIn:string;timeOut:string;status:"Present"|"Absent"|"Rest Day"|"On Leave"|"Incomplete";workedHours:number;lateMinutes:number;approvedOtHours:number;otApproved:boolean;notes:string};
export type AttendanceRecord={id:string;branch:string;periodStart:string;periodEnd:string;status:AttendanceStatus;fileName:string;uploadedAt:string;verifiedAt?:string;notes:string};
export type PayslipDraft={id:string;employeeId:string;periodStart:string;periodEnd:string;days:number;otHours:number;allowances:number;holidayExtra:number;gross:number;deductions:number;net:number;basicPay?:number;otPay?:number;dailyRate?:number;hourlyRate?:number;salaryType?:"Daily"|"Monthly";rateAmount?:number;ecolaPay?:number;lateDeduction?:number;workedDays?:number;workedHours?:number;paidLeaveDays?:number;unpaidLeaveDays?:number;lateMinutes?:number;scheduledDays?:number;attendanceSource?:"Demo Cutoff"|"Manual Review"|"Uploaded CSV";attendanceBatchId?:string;attendanceFingerprint?:string;loanDeduction?:number;loanEntries?:{loanId:number;amount:number}[];manualDeduction?:number;deductionBreakdown?:{agency:Agency;employee:number;employer:number;version:string}[];status:"Draft"|"For Review"|"Approved"|"Released (Demo)";createdAt:string;releasedId?:string;reviewer?:string;remarks:string};
export type SignatureRequest={id:string;releaseId:string;employeeId:string;method:"Phone / QR"|"On This Device"|"Print & Upload";status:"Prepared — Backend Required"|"Awaiting Physical Copy"|"Acknowledged (Demo Only)"|"Revoked";createdAt:string;notes:string};
export type ThirteenthReview={employeeId:string;year:number;eligibleBasic:number;amount:number;status:"Draft"|"For Review"|"Approved";notes:string};
export type PayrollConfig={minimumWages:MinimumWage[];rateChanges:PayRateChange[];deductionVersions:DeductionVersion[];holidayRules:HolidayRule[];payslipDrafts:PayslipDraft[];signatureRequests:SignatureRequest[];thirteenthReviews:ThirteenthReview[];attendanceRecords:AttendanceRecord[];attendanceRows:ImportedAttendanceRow[];attendanceReminderDays:number;monthlyBases:Record<string,number>;birExemptEmployees:string[]};
const SSS_SOURCE="https://www.sss.gov.ph/wp-content/uploads/2024/12/2025-SSS-Contribution-Table-rev.pdf";
const BIR_SOURCE="https://bir-cdn.bir.gov.ph/local/pdf/Annex%20E%20RR%2011-2018.pdf";
const PH_SOURCE="https://www.philhealth.gov.ph/uhc/";
const PAGIBIG_SOURCE="https://www.pagibigfund.gov.ph/document/pdf/payments/ESRS.pdf";
const NCR_SOURCE="https://nwpc.dole.gov.ph/ncr/";
const sssRows:DeductionBracket[]=Array.from({length:61},(_,i)=>{const credit=5000+i*500;return {min:i===0?0:credit-250,max:i===60?999999999:credit+249.99,employee:credit*.05,employer:credit*.1+(credit<=14500?10:30),effective:"2025-01-01"}});
// BIR weekly table is a REFERENCE illustration, not a substitute for taxable-pay classification.
const weeklyTax=[[0,4807.99,0,0],[4808,7691.99,15,0],[7692,15384.99,20,432.60],[15385,38461.99,25,1971.20],[38462,153845.99,30,7740.45],[153846,999999999,35,42355.65]];
export const referenceScheduleVersions:DeductionVersion[]=[
 {id:"SSS-2025-REF",agency:"SSS",label:"SSS Employer / Employee — 2025",effective:"2025-01-01",sourceUrl:SSS_SOURCE,sourceLabel:"SSS Circular 2024-006 · 2025",status:"Reference — needs HR review",rows:sssRows,notes:"Illustrative monthly compensation bracket lookup including EC employer portion. Confirm correct classification, MPF and remittance allocation before payroll."},
 {id:"PH-2025-REF",agency:"PhilHealth",label:"PhilHealth 2025 reference",effective:"2025-01-01",sourceUrl:PH_SOURCE,sourceLabel:"PhilHealth UHC premium schedule",status:"Reference — needs HR review",rows:[{min:0,max:9999.99,employee:250,employer:250,rate:5,effective:"2025-01-01"},{min:10000,max:100000,employee:0,employer:0,rate:5,effective:"2025-01-01"},{min:100000.01,max:999999999,employee:2500,employer:2500,rate:5,effective:"2025-01-01"}],notes:"5% total monthly premium (2025 reference), split equally, with ₱10,000 floor and ₱100,000 ceiling. Current 2026 circular must be checked before use."},
 {id:"PAG-2024-REF",agency:"Pag-IBIG",label:"Pag-IBIG mandatory savings reference",effective:"2024-02-01",sourceUrl:PAGIBIG_SOURCE,sourceLabel:"Pag-IBIG Fund eSRS payment guide",status:"Reference — needs HR review",rows:[{min:0,max:1500,employee:0,employer:0,rate:1,effective:"2024-02-01"},{min:1500.01,max:10000,employee:0,employer:0,rate:2,effective:"2024-02-01"},{min:10000.01,max:999999999,employee:200,employer:200,rate:2,effective:"2024-02-01"}],notes:"₱10,000 maximum fund salary; employee/employer savings generally up to ₱200 each. Verify governing circular, exceptions and member classification before production."},
 {id:"BIR-2023-WEEKLY",agency:"BIR",label:"BIR 2023-onwards · Weekly withholding",effective:"2023-01-01",sourceUrl:BIR_SOURCE,sourceLabel:"BIR RR 11-2018 Annex E · Weekly",status:"Reference — needs HR review",rows:weeklyTax.map(([min,max,rate,fixed])=>({min,max,employee:0,employer:0,rate,fixed,effective:"2023-01-01"})),notes:"Taxable WEEKLY compensation brackets; not gross pay. Actual computation requires taxable-income classification and mandatory deductions, plus year-end adjustments."}
];
export const initialPayrollConfig:PayrollConfig={
 minimumWages:[{id:"NCR-28-NA",region:"NCR",classification:"Non-Agriculture",amount:755,effective:"2026-09-26",source:NCR_SOURCE},{id:"NCR-28-SMALL",region:"NCR",classification:"Small Service/Retail — verify eligibility",amount:718,effective:"2026-09-26",source:NCR_SOURCE}],
 rateChanges:[],deductionVersions:referenceScheduleVersions,holidayRules:[],payslipDrafts:[],signatureRequests:[],thirteenthReviews:[],attendanceRecords:[],attendanceRows:[],attendanceReminderDays:2,monthlyBases:{},birExemptEmployees:[]
};
export const normalizePayrollConfig=(p?:Partial<PayrollConfig>):PayrollConfig=>({
 minimumWages:p?.minimumWages||initialPayrollConfig.minimumWages,
 rateChanges:p?.rateChanges||[],deductionVersions:p?.deductionVersions||referenceScheduleVersions,
 holidayRules:p?.holidayRules||[],payslipDrafts:p?.payslipDrafts||[],
 signatureRequests:p?.signatureRequests||[],thirteenthReviews:p?.thirteenthReviews||[],attendanceRecords:p?.attendanceRecords||[],attendanceRows:p?.attendanceRows||[],attendanceReminderDays:Math.max(0,Math.min(7,p?.attendanceReminderDays??2)),monthlyBases:p?.monthlyBases||{},birExemptEmployees:p?.birExemptEmployees||[]
});
export function basicRateOnDate(employeeId:string,original:number,asOf:string,changes:PayRateChange[]){return changes.map((r,index)=>({...r,index})).filter(r=>r.employeeId===employeeId&&r.effective<=asOf).sort((a,b)=>b.effective.localeCompare(a.effective)||b.index-a.index)[0]?.amount??original}
export const roundMoney=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
