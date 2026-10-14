"use client";
/** Publishes attendance cutoff alerts even when Payroll Management has not been opened. */
import {useHR} from '../lib/hrState';
import {useEffect,useState} from 'react';
import {useLoanLedger} from '../lib/useLoanLedger';
import {reconcileAutoPayroll} from '../lib/autoPayroll';
import {normalizePayrollConfig} from '../lib/payrollConfig';
import {localToday,cutoffForDate,addCutoffDays,reminderState,employeeCoverage} from '../lib/attendanceUpload';
import {usePublishModuleAlerts,type ModuleAlert} from './ModuleAlerts';

export default function PayrollCutoffAlertPublisher(){
 const {data,update,ready}=useHR();
 const [loans]=useLoanLedger();
 const [today,setToday]=useState(localToday);
 useEffect(()=>{const check=()=>setToday(localToday());const interval=window.setInterval(check,60000);document.addEventListener('visibilitychange',check);return ()=>{window.clearInterval(interval);document.removeEventListener('visibilitychange',check)}},[]);
 const cfg=normalizePayrollConfig(data.payrollConfig);
 useEffect(()=>{
  if(!ready||!cfg.attendanceRecords.some(a=>a.status==='Verified'&&a.periodEnd<=today))return;
  update(prev=>{
   const p=normalizePayrollConfig(prev.payrollConfig);
   const result=reconcileAutoPayroll({cfg:p,people:prev.people,premiums:prev.rates,loans,releases:prev.payrollReleases,today});
   if(result.created===0&&result.refreshed===0)return prev;
   return {...prev,payrollConfig:{...p,payslipDrafts:result.drafts}};
  });
 },[ready,today,cfg.attendanceRecords,cfg.attendanceRows,cfg.rateChanges,cfg.deductionVersions,cfg.monthlyBases,cfg.birExemptEmployees,data.people,data.rates,data.payrollReleases,loans,update]);
 const current=cutoffForDate(today),prev=addCutoffDays(current,-7);
 const branches:string[]=[...new Set<string>(data.people.map(p=>p.branch))];
 const alerts:ModuleAlert[]=[];
 for(const branch of branches){
  for(const start of [current,prev]){
   const end=addCutoffDays(start,6),uploaded=cfg.attendanceRecords.find(a=>a.branch===branch&&a.periodStart===start),validated=uploaded?.status==='Verified'&&cfg.attendanceRows.some(r=>r.branch===branch&&r.date>=start&&r.date<=end);
   const reminder=reminderState(today,end,validated,cfg.attendanceReminderDays);
   if(reminder)alerts.push({id:`cutoff-${start}-${branch}`,title:reminder==='upcoming'?'Attendance Upload Reminder':reminder==='due'?'Cutoff Today — Attendance Required':'Overdue Attendance — Payroll Hold',detail:`${branch} · ${start}–${end} · ${uploaded?.status||'Not Uploaded'}`,level:reminder==='upcoming'?'normal':'urgent',branch,action:'payroll:generate'});
   if(validated&&end<=today){
    const records=cfg.attendanceRows.filter(r=>r.branch===branch&&r.date>=start&&r.date<=end);
    const held=data.people.filter(p=>p.branch===branch&&p.hire<=end&&!employeeCoverage(records,p.id,start,p.hire).ready);
    if(held.length)alerts.push({id:`hold-${start}-${branch}`,title:`${held.length} Employee Attendance Hold${held.length>1?'s':''}`,detail:`${branch} · ${start}–${end} · Complete or correct their attendance`,level:'urgent',branch,action:'payroll:generate'});
   }
  }
 }
 for(const draft of cfg.payslipDrafts){
  if(draft.status==='For Review'){
   const person=data.people.find(p=>p.id===draft.employeeId);
   alerts.push({id:`approval-${draft.id}`,title:'Payroll Awaiting HR Approval',detail:`${person?.name||draft.employeeId} · ${draft.periodStart}–${draft.periodEnd}`,level:'urgent',branch:person?.branch,action:'payroll:generate'});
  }
 }
 for(const r of cfg.rateChanges.filter(r=>r.effective>=today&&r.effective<=addCutoffDays(today,14))){
  const person=data.people.find(p=>p.id===r.employeeId);
  alerts.push({id:`rate-${r.id}`,title:'Scheduled Pay Rate Change',detail:`${person?.name||r.employeeId} · ${r.effective}`,level:'normal',branch:person?.branch,action:'payroll:rates'});
 }
 for(const release of data.payrollReleases.filter(r=>r.source==='Browser Review'&&!cfg.signatureRequests.some(s=>s.releaseId===r.id&&s.status!=='Revoked'))){
  const person=data.people.find(p=>p.id===release.employeeId);
  alerts.push({id:`signature-${release.id}`,title:'Payslip Acknowledgment Not Prepared',detail:`${person?.name||release.employeeId} · ${release.periodEnd}`,level:'normal',branch:person?.branch,action:'payroll:history'});
 }
 usePublishModuleAlerts('payroll',alerts);
 return null;
}
