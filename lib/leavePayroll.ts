/** Leave classification for payroll PREVIEW ONLY. Approved != automatically paid. */
import type {DemoAttendanceRow} from "./demoAttendance";
export type LeaveRecordLite={employee:string;branch:string;type:string;from:string;to:string;status:string};
export const isPaidLeaveType=(type:string)=>["SIL","Company Sick Leave","Company Paid Leave","Other Paid Leave"].includes(type);
export function approvedLeaveImpact(records:readonly LeaveRecordLite[],employee:string,branch:string,attendance:readonly DemoAttendanceRow[]){
 const scheduled=attendance.filter(row=>row.status!=="Rest Day"&&row.status!=="Future Demo");
 const unpaid=new Set<string>(), paid=new Set<string>();
 for(const leave of records){
  if(leave.status!=="Approved"||leave.employee!==employee||leave.branch!==branch)continue;
  for(const day of scheduled){
   if(day.date<leave.from||day.date>leave.to||["Present","Late","Overtime"].includes(day.status))continue;
   (isPaidLeaveType(leave.type)?paid:unpaid).add(day.date);
  }
 }
 for(const date of unpaid)paid.delete(date); // overlapping unpaid approval must be resolved before using pay preview
 return {paidDays:paid.size,unpaidDays:unpaid.size};
}
export function loadLocalApprovedLeaveImpact(employee:string,branch:string,attendance:readonly DemoAttendanceRow[]){
 try{
  const parsed=JSON.parse(window.localStorage.getItem("uc-hr-ui-leave")||"[]");
  return approvedLeaveImpact(Array.isArray(parsed)?parsed:[],employee,branch,attendance);
 }catch{return {paidDays:0,unpaidDays:0}}
}
