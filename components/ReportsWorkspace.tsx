"use client";
import {useMemo,useState} from "react";
import {Download,Printer} from "lucide-react";
import type {Branch,Role} from "../lib/mock";
import {useHR,money} from "../lib/hrState";
import {printHRDocument} from "../lib/printDocument";
const CSV=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;
export default function ReportsWorkspace({branch,role}:{branch:Branch;role:Role}){
 const {data}=useHR();const [field,setField]=useState("gender"),[operator,setOperator]=useState("is"),[value,setValue]=useState(""),[search,setSearch]=useState(""),[page,setPage]=useState(1),[limit,setLimit]=useState(10);
 const fields:{key:string;label:string;values:string[]}[]=[{key:"gender",label:"Gender",values:["Male","Female","Prefer not to say"]},{key:"status",label:"Employment status",values:["Regular","Probationary","Fixed-Term","Project-Based","Clearance Pending"]},{key:"department",label:"Department",values:["Operations","Administration","Marketing","Service"]},{key:"salaryType",label:"Salary type",values:["Daily","Monthly"]},{key:"branch",label:"Branch",values:["UC Mandaluyong","UC Las Piñas","UC Quezon City","MM Mandaluyong"]}];
 const fieldInfo=fields.find(f=>f.key===field)||fields[0];
 const filtered=useMemo(()=>data.people.filter(p=>{
   if(branch!=="All Shops"&&p.branch!==branch)return false;
   if(search&&!`${p.name} ${p.id} ${p.position}`.toLowerCase().includes(search.toLowerCase()))return false;
   if(!value)return true;
   const actual=String(p[field as keyof typeof p]??"").toLowerCase(),target=value.toLowerCase();
   return operator==="contains"?actual.includes(target):operator==="is not"?actual!==target:actual===target;
 }),[data.people,branch,search,field,operator,value]);
 const pages=Math.max(1,Math.ceil(filtered.length/limit));const visible=filtered.slice((Math.min(page,pages)-1)*limit,Math.min(page,pages)*limit);
 const download=()=>{const rows=[["Employee ID","Employee","Branch","Gender","Department","Employment status","Salary type","Basic rate","Position"],...filtered.map(p=>[p.id,p.name,p.branch,p.gender,p.department,p.status,p.salaryType,String(p.rate),p.position])];const url=URL.createObjectURL(new Blob([rows.map(r=>r.map(CSV).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="employee-report-review.csv";a.click();URL.revokeObjectURL(url)};
 if(role==="BM")return <section className="panel">Detailed employee and compensation reports are restricted to HR and Super Admin.</section>;
 return <section className="panel"><div className="rev-title"><div><h3>Additional Report Filters</h3><p>Use one condition at a time. Report totals automatically follow the employee master directory.</p></div><span className="tag">{filtered.length} results</span></div>
 <div className="rev-filters"><label>Search employee<input placeholder="Name, ID or position" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></label><label>Filter by<select value={field} onChange={e=>{setField(e.target.value);setValue("");setPage(1)}}>{fields.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select></label><label>Match<select value={operator} onChange={e=>setOperator(e.target.value)}><option>is</option><option>is not</option><option>contains</option></select></label><label>Value<select value={value} onChange={e=>{setValue(e.target.value);setPage(1)}}><option value="">Any {fieldInfo.label}</option>{fieldInfo.values.map(v=><option key={v}>{v}</option>)}</select></label><button className="secondary" onClick={()=>{setSearch("");setValue("");setPage(1)}}>Clear Filters</button></div>
 <p className="muted">Example: Filter by Gender → is → Female. Use the search above to narrow by employee name or ID. These are current reference records, not government submission files.</p>
 <div className="rev-facts"><div><small>Matching employees</small><b>{filtered.length}</b></div><div><small>Monthly-paid basic rates</small><b>{money(filtered.filter(p=>p.salaryType==="Monthly").reduce((n,p)=>n+p.rate,0))} / month</b></div><div><small>Daily-paid basic rates</small><b>{money(filtered.filter(p=>p.salaryType==="Daily").reduce((n,p)=>n+p.rate,0))} / day</b></div></div>
 <div className="rev-actions"><button className="secondary" onClick={download}><Download size={15}/> Export CSV</button><button className="secondary" onClick={()=>printHRDocument("Employee Reference Report",[["Branch",branch],["Filter",`${fieldInfo.label} ${operator} ${value||"Any"}`],["Matched records",filtered.length]],filtered.map(p=>`${p.id} — ${p.name} — ${p.branch} — ${p.position} — ${p.status}`).join("\n"),["Prepared By","Verified By"])}><Printer size={15}/> Preview / Print Report</button></div>
 <div className="table-wrap"><table><thead><tr><th>ID</th><th>Employee</th><th>Branch</th><th>Gender</th><th>Position</th><th>Status</th></tr></thead><tbody>{visible.map(p=><tr key={p.id}><td>{p.id}</td><td>{p.name}</td><td>{p.branch}</td><td>{p.gender}</td><td>{p.position}</td><td>{p.status}</td></tr>)}</tbody></table>{!visible.length&&<div className="empty">No results. Clear filters or choose another value.</div>}</div><div className="rev-pagination"><label>Rows<select value={limit} onChange={e=>{setLimit(Number(e.target.value));setPage(1)}}>{[5,10,20,50].map(n=><option key={n}>{n}</option>)}</select></label><button className="secondary" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>{Math.min(page,pages)} / {pages}</span><button className="secondary" disabled={page===pages} onClick={()=>setPage(p=>p+1)}>Next</button></div>
 </section>
}
