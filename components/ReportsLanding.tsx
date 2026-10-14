"use client";
import {useMemo,useState} from "react";
import {ArrowLeft,ArrowRight,CalendarDays,Download,ExternalLink,FileSpreadsheet,FileText,Info,Landmark,Printer,Search,Users} from "lucide-react";
import ReportsWorkspace from "./ReportsWorkspace";
import HelpButton from "./HelpButton";
import {php} from "../lib/people";
import {useHR} from "../lib/hrState";
import {exportGovernmentSampleCsv,generateGovernmentReport,governmentAgencies,governmentReportTemplates,type GovernmentAgency,type GovernmentReportTable,type GovernmentReportTemplate,type GovernmentReportId} from "../lib/governmentReports";
import type {Branch,Role} from "../lib/mock";

const months=["January","February","March","April","May","June","July","August","September","October","November","December"];
const agencyColor:Record<GovernmentAgency,{background:string,foreground:string}>={
 DOLE:{background:"#FFF1CD",foreground:"#997112"},SSS:{background:"#E9EFFB",foreground:"#4169A6"},PhilHealth:{background:"#E5F5EB",foreground:"#367853"},"Pag-IBIG":{background:"#F0E8FC",foreground:"#7051A1"},BIR:{background:"#EAF2F8",foreground:"#356C8B"}
};
function escapeHtml(value:unknown){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c))}
function printSampleReport(template:GovernmentReportTemplate,report:GovernmentReportTable,branch:Branch,year:number,month:number){
 const popup=window.open("","_blank");if(!popup){window.alert("Allow pop-ups to preview/print the example report.");return}
 const heading=escapeHtml(template.title);
 const period=template.period==="Annual"?`Year ${year}`:template.period==="Event-based"?`${months[month-1]} ${year} · event sample`:`${months[month-1]} ${year}`;
 const heads=report.columns.map(c=>`<th>${escapeHtml(c)}</th>`).join("");
 const rows=report.rows.map(r=>`<tr>${r.map(cell=>`<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
 const metrics=report.summary.map(m=>`<span><b>${escapeHtml(m.label)}</b>: ${escapeHtml(m.value)}</span>`).join(" · ");
 popup.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>SAMPLE ${heading}</title><style>@page{size:A4 landscape;margin:13mm}body{font:10pt/1.5 Arial,sans-serif;color:#263445}h1{font-size:19pt;margin:6px 0}.label{color:#806009;letter-spacing:.08em;font-weight:700}header{border-bottom:3px solid #e6b51d;padding-bottom:10px;margin-bottom:16px}.note{padding:10px 12px;border:1px solid #e7d6a5;background:#fffaec;margin:14px 0;font-size:9pt}.summary{font-size:9pt;margin:10px 0}table{width:100%;border-collapse:collapse;font-size:8pt}th{background:#f3f5f8;text-align:left}th,td{border:1px solid #dbe0e7;padding:6px;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid}footer{border-top:1px solid #dbe0e7;margin-top:18px;font-size:8pt;padding-top:8px;color:#667286}.toolbar{padding:10px;text-align:right}@media print{.toolbar{display:none}}</style></head><body><div class="toolbar"><button onclick="window.print()">Print / Save PDF</button> <button onclick="window.close()">Close</button></div><header><span class="label">UNDERCHARGERS · FICTIONAL SAMPLE</span><h1>${heading}</h1><div>${escapeHtml(template.agency)} · ${escapeHtml(template.reference)} · ${escapeHtml(branch)} · ${escapeHtml(period)}</div></header><div class="note"><strong>NOT FOR FILING.</strong> ${escapeHtml(report.note)}</div><div class="summary">${metrics}</div><table><thead><tr>${heads}</tr></thead><tbody>${rows||`<tr><td colspan="${report.columns.length}">No sample rows for selected filters.</td></tr>`}</tbody></table><footer>Preparation example only. Not an official government form or proof of compliance.</footer></body></html>`);
 popup.document.close();popup.focus();
}
function AgencyIcon({agency}:{agency:GovernmentAgency}){switch(agency){case "DOLE":return <Landmark size={22}/>;case "SSS":return <Users size={22}/>;case "PhilHealth":return <FileText size={22}/>;case "Pag-IBIG":return <FileSpreadsheet size={22}/>;case "BIR":return <FileText size={22}/>;}}
export default function ReportsLanding({branch,role}:{branch:Branch;role:Role}){
 const {data}=useHR();const [view,setView]=useState<"government"|"employee">("government");
 const [agency,setAgency]=useState<GovernmentAgency|"All">("All");
 const [reportSearch,setReportSearch]=useState("");
 const [selectedId,setSelectedId]=useState<GovernmentReportId|null>(null);
 const [year,setYear]=useState(2026),[month,setMonth]=useState(10);
 const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 const [advanced,setAdvanced]=useState(false),[type,setType]=useState("Headcount"),[status,setStatus]=useState("All"),[dept,setDept]=useState("All"),[search,setSearch]=useState("");
 const reportTemplates=useMemo(()=>governmentReportTemplates.filter(r=>(agency==="All"||r.agency===agency)&&`${r.agency} ${r.title} ${r.reference}`.toLowerCase().includes(reportSearch.toLowerCase())),[agency,reportSearch]);
 const chosen=selectedId?governmentReportTemplates.find(r=>r.id===selectedId):undefined;
 const sample=useMemo(()=>chosen?generateGovernmentReport(chosen,branch,year,month):undefined,[chosen,branch,year,month]);
 const totalPages=Math.max(1,Math.ceil((sample?.rows.length||0)/pageSize));
 const currentPage=Math.min(totalPages,page);
 const visible=sample?.rows.slice((currentPage-1)*pageSize,currentPage*pageSize)||[];
 const employees=data.people.filter(p=>(branch==="All Shops"||p.branch===branch)&&(status==="All"||p.status===status)&&(dept==="All"||p.department===dept)&&`${p.name} ${p.id}`.toLowerCase().includes(search.toLowerCase()));
 const openReport=(id:GovernmentReportId)=>{setSelectedId(id);setPage(1);setPageSize(10)};
 if(role==="BM")return <section className="panel">Reports containing employee pay and government reporting data are restricted to authorized HR and Super Admin users.</section>;
 return <div className="gr-root">
  <div className="gr-module-head"><div><h2>Reports & Analytics</h2></div><HelpButton topic="reports" label="Info"/></div>
  <div className="gr-main-tabs"><button type="button" className={view==="government"?"active":""} onClick={()=>setView("government")}><Landmark size={16}/> Government Reports</button><button type="button" className={view==="employee"?"active":""} onClick={()=>setView("employee")}><Users size={16}/> Employee Analytics</button></div>
  {view==="government"&&<>
    {chosen&&sample?<>
      <button type="button" className="gr-back" onClick={()=>setSelectedId(null)}><ArrowLeft size={15}/> Back to Government Reports</button>
      <section className="gr-report-panel">
        <div className="gr-report-top"><div className="gr-report-heading"><div className="gr-agency-symbol" style={{background:agencyColor[chosen.agency].background,color:agencyColor[chosen.agency].foreground}}><AgencyIcon agency={chosen.agency}/></div><div><span className="gr-small-cap">{chosen.agency} · {chosen.reference}</span><h3>{chosen.title}</h3></div></div><span className="gr-label">Sample / Not for filing</span></div>
        <div className="gr-period-bar"><label>Reporting Year<select aria-label="Reporting year" value={year} onChange={e=>{setYear(Number(e.target.value));setPage(1)}}>{[2025,2026].map(y=><option key={y} value={y}>{y}</option>)}</select></label>{chosen.period!=="Annual"&&<label>Month<select aria-label="Reporting month" value={month} onChange={e=>{setMonth(Number(e.target.value));setPage(1)}}>{months.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select></label>}<span className="gr-period-tag"><CalendarDays size={15}/>{chosen.period} reference</span></div>
        <div className="gr-metrics">{sample.summary.map(s=><div key={s.label}><small>{s.label}</small><strong>{s.value}</strong></div>)}</div>
        <div className="gr-table-title"><h4>Sample Report Preview</h4><div className="gr-buttons"><button type="button" className="secondary" onClick={()=>exportGovernmentSampleCsv(chosen,sample,year,month)}><Download size={15}/> Export Sample CSV</button><button type="button" className="secondary" onClick={()=>printSampleReport(chosen,sample,branch,year,month)}><Printer size={15}/> Print / PDF Preview</button></div></div>
        <div className="gr-data-table"><table><thead><tr>{sample.columns.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{visible.map((record,index)=><tr key={`${chosen.id}-${(currentPage-1)*pageSize+index}`}>{record.map((cell,i)=><td key={i}>{cell}</td>)}</tr>)}{!visible.length&&<tr><td colSpan={sample.columns.length} className="gr-no-data">No sample entries for the selected branch/period.</td></tr>}</tbody></table></div>
        <div className="gr-pagination"><label>Rows <select aria-label="Rows per page" value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}>{[10,20,50].map(n=><option key={n}>{n}</option>)}</select></label><span>{sample.rows.length} rows · Page {currentPage} / {totalPages}</span><button className="secondary" disabled={currentPage===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Previous</button><button className="secondary" disabled={currentPage===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next</button></div>
        <div className="gr-two-info"><div><h4>Data Needed for Actual Filing</h4>{chosen.requires.map(x=><div className="gr-check-row" key={x}><span aria-hidden="true" className="gr-dot"/>{x}</div>)}</div><div><h4>Official Reference</h4><a href={chosen.source} target="_blank" rel="noopener noreferrer">{chosen.sourceName} <ExternalLink size={13}/></a><p>{chosen.notes}</p></div></div>
        <div className="gr-sample-warning"><Info size={17}/><span>{sample.note}</span></div>
      </section>
    </>:<>
      <div className="gr-overview-metrics"><div><b>{governmentReportTemplates.length}</b><span>Sample report types</span></div><div><b>{governmentAgencies.length}</b><span>Government agencies</span></div><div><b>2026</b><span>Illustrative reporting year</span></div></div>
      <section className="gr-catalog"><div className="gr-section-bar"><h3>Government Report Samples</h3><span>Fictional worksheets · NCR branches</span></div><div className="gr-toolbar"><div className="gr-search"><Search size={16}/><input aria-label="Search government reports" placeholder="Search report name or agency..." value={reportSearch} onChange={e=>setReportSearch(e.target.value)}/></div><div className="gr-agency-filter" aria-label="Agency filter"><button type="button" className={agency==="All"?"active":""} onClick={()=>setAgency("All")}>All Agencies</button>{governmentAgencies.map(a=><button type="button" key={a} className={agency===a?"active":""} onClick={()=>setAgency(a)}>{a}</button>)}</div></div>
      <div className="gr-cards">{reportTemplates.map(t=><button type="button" className="gr-report-card" key={t.id} onClick={()=>openReport(t.id)}><span className="gr-card-icon" style={{background:agencyColor[t.agency].background,color:agencyColor[t.agency].foreground}}><AgencyIcon agency={t.agency}/></span><span className="gr-card-main"><span className="gr-card-label">{t.agency} · {t.period}</span><strong>{t.title}</strong><small>{t.short}</small></span><span className="gr-card-footer"><span>View Sample Data</span><ArrowRight size={16}/></span></button>)}{!reportTemplates.length&&<div className="empty">No reports match your search or agency filter.</div>}</div>
      <div className="gr-sample-warning"><Info size={17}/><span>All displayed reports contain fictional demonstration data. These are preparation worksheets—not official agency forms, filed returns, or evidence of compliance. Actual submission requirements must be confirmed with each agency.</span></div>
      </section>
    </>}
  </>}
  {view==="employee"&&<section className="gr-catalog"><div className="gr-section-bar"><h3>Employee Reports</h3><span>Based on current employee records in this browser</span></div><div className="gr-employee-controls"><label>Report Type<select value={type} onChange={e=>setType(e.target.value)}>{[{id:"Headcount",label:"Employee Headcount"},{id:"Gender",label:"Gender Breakdown"},{id:"Employment Status",label:"Employment Status"},{id:"Basic Salary Rates",label:"Basic Salary Summary"}].map(({id,label})=><option key={id} value={id}>{label}</option>)}</select></label><label>Employment Status<select value={status} onChange={e=>setStatus(e.target.value)}>{["All","Regular","Probationary","Fixed-Term","Project-Based"].map(x=><option key={x}>{x}</option>)}</select></label><label>Department<select value={dept} onChange={e=>setDept(e.target.value)}>{["All","Operations","Service","Administration","Marketing"].map(x=><option key={x}>{x}</option>)}</select></label><label>Search Employee<input placeholder="Name or ID" value={search} onChange={e=>setSearch(e.target.value)}/></label><button className="secondary" onClick={()=>{setType("Headcount");setStatus("All");setDept("All");setSearch("")}}>Clear Filters</button></div>
   <div className="gr-metrics"><div><small>Matching employees</small><strong>{employees.length}</strong></div>{type==="Gender"?<><div><small>Male</small><strong>{employees.filter(p=>p.gender==="Male").length}</strong></div><div><small>Female</small><strong>{employees.filter(p=>p.gender==="Female").length}</strong></div></>:type==="Basic Salary Rates"?<><div><small>Monthly basic rate total</small><strong>{php(employees.filter(p=>p.salaryType==="Monthly").reduce((a,p)=>a+p.rate,0))}</strong></div><div><small>Daily basic rate total</small><strong>{php(employees.filter(p=>p.salaryType==="Daily").reduce((a,p)=>a+p.rate,0))}</strong></div></>:<><div><small>Regular</small><strong>{employees.filter(p=>p.status==="Regular").length}</strong></div><div><small>Probationary</small><strong>{employees.filter(p=>p.status==="Probationary").length}</strong></div></>}</div>
   <button type="button" className="secondary gr-builder-toggle" onClick={()=>setAdvanced(x=>!x)}>{advanced?"Hide":"Show"} Advanced Employee Report Builder <ArrowRight size={15}/></button>{advanced&&<ReportsWorkspace branch={branch} role={role}/>}</section>}
 </div>
}
