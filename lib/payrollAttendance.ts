/** Attendance-to-payroll DEMO calculations. Not verified biometrics or production pay rules. */
import {sampleCutoff,type DemoAttendanceRow} from "./demoAttendance";
import {roundMoney} from "./payrollConfig";
import type {Person} from "./people";

export type PayrollAttendanceSummary={
 rows:DemoAttendanceRow[];periodEnd:string;workedDays:number;scheduledDays:number;
 lateMinutes:number;otHours:number;hasFuture:boolean;incompleteCount:number;
 absentDays:number;unmatchedLeaveDays:number;
};
export function summarizePayrollAttendance(people:readonly Person[],employeeId:string,start:string):PayrollAttendanceSummary{
 const c=sampleCutoff(people,employeeId,start);
 const late=c.rows.reduce((n,r)=>n+r.lateMinutes,0);
 return {rows:c.rows,periodEnd:c.end,workedDays:c.daysWorked,scheduledDays:c.rows.filter(r=>r.status!=="Rest Day"&&r.status!=="Future Demo").length,
 lateMinutes:late,otHours:c.otHours,hasFuture:c.hasFuture,incompleteCount:c.rows.filter(r=>r.status==="Incomplete").length,
 absentDays:c.rows.filter(r=>r.status==="Absent").length,unmatchedLeaveDays:c.rows.filter(r=>r.status==="On Leave").length};
}
/** 8 paid hours for 08:00–17:00, with a provisional one-hour unpaid lunch. */
export function demoCutoffEarnings({salaryType,rate,daysWorked,paidLeaveDays,scheduledDays,lateMinutes,otHours,otMultiplier=125,allowances=0,holidayExtra=0}: {
 salaryType:"Daily"|"Monthly";rate:number;daysWorked:number;paidLeaveDays:number;scheduledDays:number;lateMinutes:number;otHours:number;otMultiplier?:number;allowances?:number;holidayExtra?:number;
}){
 const dailyRate=salaryType==="Daily"?rate:rate/26;
 const hourlyRate=dailyRate/8;
 const paidUnits=Math.max(0,daysWorked+paidLeaveDays);
 const lateReduction=roundMoney(Math.min(paidUnits,Math.max(0,lateMinutes/480))*dailyRate);
 // 12/52 is a PREVIEW of weekly monthly pay; actual company divisor and paid day policy need verification.
 const missedScheduled=Math.max(0,scheduledDays-paidUnits);
 const baseGross=salaryType==="Daily"?paidUnits*dailyRate:Math.max(0,rate*12/52-missedScheduled*dailyRate);
 const basic=roundMoney(Math.max(0,baseGross-lateReduction));
 const ot=roundMoney(hourlyRate*Math.max(0,otHours)*otMultiplier/100);
 const gross=roundMoney(basic+ot+Math.max(0,allowances)+Math.max(0,holidayExtra));
 return {basic,ot,gross,dailyRate:roundMoney(dailyRate),hourlyRate:roundMoney(hourlyRate),lateReduction,unpaidDayEquivalents:missedScheduled};
}
