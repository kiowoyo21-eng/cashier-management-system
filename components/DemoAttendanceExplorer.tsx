"use client";
import {useMemo,useState} from "react";
import {Download,Info} from "lucide-react";
import type {Person} from "../lib/people";
import {buildDemoAttendance,exportDemoAttendanceCSV,sampleCutoff,demoAttendanceMonths,DEMO_ATTENDANCE_AS_OF,type DemoAttendanceStatus} from "../lib/demoAttendance";

type Props={people:Person[];branch:string;selectedEmployee:string;cutoffStart:string;onOpenPayroll:()=>void};
const statuses:("All"|DemoAttendanceStatus)[]=["All","Present","Late","Overtime","Absent","On Leave","Incomplete","Rest Day","Pending Today"];
export default function DemoAttendanceExplorer({people,branch,selectedEmployee,cutoffStart,onOpenPayroll}:Props){
 const [month,setMonth]=useState(DEMO_ATTENDANCE_AS_OF.slice(0,7));
 const [person,setPerson]=useState("All");
 const [status,setStatus]=useState<(typeof statuses)[number]>("All");
 const [page,setPage]=useState(1);
 const rows=useMemo(()=>buildDemoAttendance(people),[people]);
 const visible=useMemo(()=>rows.filter(r=>r.date.startsWith(month)&&(branch==="All Shops"||r.branch===branch)&&(person==="All"||r.employeeId===person)&&(status==="All"||r.status===status)),[rows,month,branch,person,status]);
 const take=35;
 const pages=Math.max(1,Math.ceil(visible.length/take));
 const actualPage=Math.min(page,pages);
 const shown=visible.slice((actualPage-1)*take,actualPage*take);
 const stats={worked:visible.filter(r=>["Present","Late","Overtime"].includes(r.status)).length,late:visible.filter(r=>r.status==="Late").length,absent:visible.filter(r=>r.status==="Absent").length,leave:visible.filter(r=>r.status==="On Leave").length,incomplete:visible.filter(r=>r.status==="Incomplete").length};
 const chosen=selectedEmployee?sampleCutoff(people,selectedEmployee,cutoffStart):null;
 const applied=Boolean(chosen&&chosen.rows.length&&!chosen.hasFuture);
 return <section className="panel uc-demo-attendance">
  <div className="pc-header"><div><h3>January–October 2026 Daily Attendance <span className="tag">DEMO</span></h3><p>Fictional daily logs from January 1 through October 14, 2026, beginning on each employee's hire date. Today is marked pending; no future shifts or genuine biometric entries are implied.</p></div><button type="button" className="secondary" onClick={()=>exportDemoAttendanceCSV(visible)}><Download size={14}/> Export filtered CSV</button></div>
  <div className="uc-attendance-toolbar">
    <label>Month<select value={month} onChange={e=>{setMonth(e.target.value);setPage(1)}}>{demoAttendanceMonths.map(ym=><option key={ym} value={ym}>{new Date(`${ym}-01T12:00:00`).toLocaleDateString("en-PH",{month:"long",year:"numeric"})}</option>)}</select></label>
    <label>Employee<select value={person} onChange={e=>{setPerson(e.target.value);setPage(1)}}><option value="All">All employees</option>{people.filter(p=>branch==="All Shops"||p.branch===branch).map(p=><option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}</select></label>
    <label>Status<select value={status} onChange={e=>{setStatus(e.target.value as (typeof statuses)[number]);setPage(1)}}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
  </div>
  <div className="uc-attendance-stats"><span><b>{visible.length}</b> Rows</span><span><b>{stats.worked}</b> Worked</span><span><b>{stats.late}</b> Late</span><span><b>{stats.absent}</b> Absent</span><span><b>{stats.leave}</b> Leave</span><span><b>{stats.incomplete}</b> Incomplete</span></div>
  <div className="table-wrap"><table><thead><tr><th>Date</th><th>Employee</th><th>Branch</th><th>Time In</th><th>Time Out</th><th>Paid Hrs</th><th>Late</th><th>Status</th><th>OT</th></tr></thead><tbody>{shown.map(r=><tr key={`${r.employeeId}-${r.date}`} title={r.notes}><td>{r.date}</td><td><b>{r.employeeName}</b><small>{r.employeeId}</small></td><td>{r.branch}</td><td>{r.timeIn||"—"}</td><td>{r.timeOut||"—"}</td><td>{r.hoursWorked?`${r.hoursWorked}h`:"—"}</td><td>{r.lateMinutes?`${r.lateMinutes} min`:"—"}</td><td><span className={`uc-attendance-state ${["Absent","Incomplete"].includes(r.status)?"attention":""}`}>{r.status}</span></td><td>{r.overtimeHours||"—"}</td></tr>)}{!shown.length&&<tr><td colSpan={9}>No matching sample logs.</td></tr>}</tbody></table></div>
  <div className="uc-attendance-bottom"><small>{visible.length?`${(actualPage-1)*take+1}–${Math.min(actualPage*take,visible.length)} of ${visible.length} entries`:"0 entries"}</small><div className="rev-actions"><button type="button" className="secondary" disabled={actualPage===1} onClick={()=>setPage(n=>Math.max(1,n-1))}>Previous</button><span>{actualPage}/{pages}</span><button type="button" className="secondary" disabled={actualPage===pages} onClick={()=>setPage(n=>Math.min(pages,n+1))}>Next</button></div></div>
  <div className="pc-alert subtle"><Info size={15}/><div><b>Demo attendance is read-only</b><p>These fictional January–October logs are read-only and are not treated as verified punches. Use an uploaded attendance CSV for automatic payroll computation and HR approval.</p><button type="button" className="secondary" onClick={onOpenPayroll}>Open Attendance Upload & Payroll Approval</button></div></div>
 </section>;
}
