"use client";

import {useEffect,useMemo,useState,type FormEvent} from "react";
import {createPortal} from "react-dom";
import {ArrowLeft,ArrowRight,Plus,FileText,UserRound,BriefcaseBusiness,ShieldCheck,ClipboardList,SlidersHorizontal,Search,ChevronDown,ChevronUp,X,Info,Eye,Pencil,Laptop,Wallet} from "lucide-react";
import type {Branch,Role} from "../lib/mock";
import {shopNames,type Shop} from "../lib/people";
import {useHR,effectiveRate,type HRPerson,type EmployeeAssignment} from "../lib/hrState";
import HelpButton from "./HelpButton";
import {ModuleAlertButton} from "./ModuleAlerts";
import EmployeeDocumentLibrary,{type LocalEmployeeFile} from "./EmployeeDocumentLibrary";
import {basicRateOnDate,normalizePayrollConfig,type PayRateChange} from "../lib/payrollConfig";

type Action="Evaluate"|"Regularize"|"Promote"|"Transfer"|"Offboard";
type PersonalDraft=Pick<HRPerson,"name"|"gender"|"email"|"phone"|"birthDate"|"civilStatus"|"address"|"emergencyName"|"emergencyRelationship"|"emergencyPhone">;

const stages:Record<Action,string[]>={
 Evaluate:["Assessment details","Evaluator recommendation","Review & record"],
 Regularize:["Check probation & documents","Record HR decision","Confirm effective date"],
 Promote:["New position and approved compensation","Supporting decision","Confirm change"],
 Transfer:["Select receiving branch","Review device and obligation clearance","Confirm transfer"],
 Offboard:["Record separation reason","Device returns and obligations","Clearance & final-pay preparation"]
};
// Keep stable section IDs for existing state and workflows. Only user-facing labels change.
const profileSections = [{id:"Profile",label:"Employee Profile"},{id:"Documents",label:"Documents"}] as const;
const actionLabels:Record<Action,string> = {Evaluate:"Record Evaluation",Regularize:"Regularize Employment",Promote:"Promote Employee",Transfer:"Transfer Employee",Offboard:"Process Offboarding"};
const employmentStatuses=["Probationary","Regular","Fixed-Term","Project-Based","Clearance Pending"];
const departments=["Operations","Service","Administration","Marketing"];
const emptyForm={
 name:"",branch:"" as Shop|"",department:"Operations",position:"",gender:"Prefer not to say",
 status:"Probationary",hire:"",salaryType:"Daily" as "Daily"|"Monthly",
 rate:"",probation:"6",sil:"5",vil:"0",email:"",phone:"",birthDate:"",
 civilStatus:"",address:"",emergencyName:"",emergencyRelationship:"",emergencyPhone:""
};
const toPersonalDraft=(p:HRPerson):PersonalDraft=>({
 name:p.name,gender:p.gender,email:p.email,phone:p.phone,birthDate:p.birthDate||"",
 civilStatus:p.civilStatus||"",address:p.address||"",emergencyName:p.emergencyName||"",
 emergencyRelationship:p.emergencyRelationship||"",emergencyPhone:p.emergencyPhone||""
});
const empty=(v?:string)=>v?.trim()||"Not recorded";
const formatDate=(v?:string)=>{
 if(!v)return "Not recorded";
 const d=new Date(`${v}T00:00:00`);
 return Number.isNaN(d.getTime())?v:d.toLocaleDateString("en-PH",{year:"numeric",month:"short",day:"numeric"});
};
const money=(v:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",maximumFractionDigits:2}).format(v);
const compactMoney=(v:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",minimumFractionDigits:0,maximumFractionDigits:2}).format(v);
const salaryAmount=(p:HRPerson,changes:PayRateChange[]=[])=>`${compactMoney(basicRateOnDate(p.id,p.rate,new Date().toISOString().slice(0,10),changes))}/${p.salaryType==="Daily"?"day":"month"}`;

export default function EmployeeWorkspace({branch,role,onAssignDevice,onOpenPayroll}:{branch:Branch;role:Role;onAssignDevice?:(employeeId:string)=>void;onOpenPayroll?:(employeeId:string)=>void}){
 const {data,update}=useHR();
 const [search,setSearch]=useState("");
 const [status,setStatus]=useState("All");
 const [department,setDepartment]=useState("All");
 const [localBranch,setLocalBranch]=useState("All");
 const [gender,setGender]=useState("All");
 const [position,setPosition]=useState("All");
 const [salaryType,setSalaryType]=useState("All");
 const [minRate,setMinRate]=useState("");
 const [maxRate,setMaxRate]=useState("");
 const [hiredFrom,setHiredFrom]=useState("");
 const [hiredTo,setHiredTo]=useState("");
 const [documentFilter,setDocumentFilter]=useState("All");
 const [quick,setQuick]=useState("All");
 const [advancedOpen,setAdvancedOpen]=useState(false);
 useEffect(()=>{if(!advancedOpen)return;const handler=(event:KeyboardEvent)=>{if(event.key==="Escape")setAdvancedOpen(false)};window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler)},[advancedOpen]);
 const [order,setOrder]=useState("name");
 const [page,setPage]=useState(1);
 const [rows,setRows]=useState<10|20|50>(10);
 const [selected,setSelected]=useState<string|null>(null);
 const [tab,setTab]=useState("Profile");
 const [salaryPeriod,setSalaryPeriod]=useState<"month"|"year"|"all">("year");
 const [editingCompensation,setEditingCompensation]=useState(false);
 const [compType,setCompType]=useState<"Daily"|"Monthly">("Daily");
 const [compAmount,setCompAmount]=useState("");
 const [compReason,setCompReason]=useState("");
 const [compError,setCompError]=useState("");
 const [uploads,setUploads]=useState<Record<string,LocalEmployeeFile[]>>({});
 const [employmentDraft,setEmploymentDraft]=useState<{probation:number;sil:number;vil:number}|null>(null);
 const [historyKind,setHistoryKind]=useState<"branch"|"role"|null>(null);
 const [requestedMemo,setRequestedMemo]=useState<string|null>(null);
 const [requestedFolder,setRequestedFolder]=useState<"Onboarding Files"|"Payslips"|null>(null);
 const [detailKind,setDetailKind]=useState<"employee"|"employment"|"salary"|"reviews"|"history"|"assets"|null>(null);
 useEffect(()=>{if(!detailKind)return;const close=(e:KeyboardEvent)=>{if(e.key==="Escape")setDetailKind(null)};window.addEventListener("keydown",close);return ()=>window.removeEventListener("keydown",close)},[detailKind]);
 const [add,setAdd]=useState(false);
 const [form,setForm]=useState({...emptyForm});
 const [editing,setEditing]=useState(false);
 const [personal,setPersonal]=useState<PersonalDraft|null>(null);
 const [action,setAction]=useState<Action|null>(null);
 const [step,setStep]=useState(0);
 const [effective,setEffective]=useState("2026-10-12");
 const [dest,setDest]=useState<Shop>("UC Mandaluyong");
 const [newPosition,setNewPosition]=useState("");
 const [newDepartment,setNewDepartment]=useState("Operations");
 const [memoReference,setMemoReference]=useState("");
 const [newRate,setNewRate]=useState("");
 const [reason,setReason]=useState("");
 const [decision,setDecision]=useState("Approved");
 const [separationType,setSeparationType]=useState("Resignation");
 const [message,setMessage]=useState("");

 useEffect(()=>{if(!historyKind)return;const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")setHistoryKind(null)};window.addEventListener("keydown",onKey);return ()=>window.removeEventListener("keydown",onKey)},[historyKind]);
 const positions=useMemo(()=>[...new Set(data.people.filter(p=>branch==="All Shops"||p.branch===branch).map(p=>p.position))].sort(),[data.people,branch]);
 const genders=useMemo(()=>[...new Set(data.people.filter(p=>branch==="All Shops"||p.branch===branch).map(p=>p.gender))].sort(),[data.people,branch]);
 const people=useMemo(()=>{
  const cutoff=new Date();cutoff.setHours(0,0,0,0);cutoff.setDate(cutoff.getDate()-90);
  const recentSince=`${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,"0")}-${String(cutoff.getDate()).padStart(2,"0")}`;
  const q=search.trim().toLocaleLowerCase();
  const result=data.people.filter(p=>{
   const verifiedCount=p.documents.filter(d=>d.status==="Verified").length;
   const hasMissing=p.documents.some(d=>d.status==="Missing");
   const hasPending=p.documents.some(d=>d.status==="Submitted");
   const documentMatch=documentFilter==="All"||
    (documentFilter==="Missing"&&hasMissing)||
    (documentFilter==="Pending Verification"&&hasPending)||
    (documentFilter==="Complete"&&p.documents.length>0&&verifiedCount===p.documents.length);
   const quickMatch=quick==="All"||
    (quick==="Missing Documents"&&hasMissing)||
    (quick==="Pending Verification"&&hasPending)||
    (quick==="Probationary"&&p.status==="Probationary")||
    (quick==="New Hires"&&p.hire>=recentSince);
   return (branch==="All Shops"||p.branch===branch)&&
    (localBranch==="All"||p.branch===localBranch)&&
    (status==="All"||p.status===status)&&
    (department==="All"||p.department===department)&&
    (gender==="All"||p.gender===gender)&&
    (position==="All"||p.position===position)&&
    (salaryType==="All"||p.salaryType===salaryType)&&
    (salaryType==="All"||minRate===""||basicRateOnDate(p.id,p.rate,new Date().toISOString().slice(0,10),data.payrollConfig?.rateChanges||[])>=Number(minRate))&&
    (salaryType==="All"||maxRate===""||basicRateOnDate(p.id,p.rate,new Date().toISOString().slice(0,10),data.payrollConfig?.rateChanges||[])<=Number(maxRate))&&
    (!hiredFrom||p.hire>=hiredFrom)&&(!hiredTo||p.hire<=hiredTo)&&
    documentMatch&&quickMatch&&
    `${p.name} ${p.id} ${p.position} ${p.department} ${p.branch} ${p.email} ${p.status}`.toLocaleLowerCase().includes(q);
  });
  return result.sort((a,b)=>order==="latest"?b.hire.localeCompare(a.hire):
   order==="oldest"?a.hire.localeCompare(b.hire):
   order==="missing"?a.documents.filter(d=>d.status==="Verified").length/Math.max(a.documents.length,1)-b.documents.filter(d=>d.status==="Verified").length/Math.max(b.documents.length,1):
   order==="salary-high"&&salaryType!=="All"?basicRateOnDate(b.id,b.rate,new Date().toISOString().slice(0,10),data.payrollConfig?.rateChanges||[])-basicRateOnDate(a.id,a.rate,new Date().toISOString().slice(0,10),data.payrollConfig?.rateChanges||[]):
   order==="salary-low"&&salaryType!=="All"?basicRateOnDate(a.id,a.rate,new Date().toISOString().slice(0,10),data.payrollConfig?.rateChanges||[])-basicRateOnDate(b.id,b.rate,new Date().toISOString().slice(0,10),data.payrollConfig?.rateChanges||[]):
   a.name.localeCompare(b.name));
 },[data.people,data.payrollConfig,branch,localBranch,status,department,gender,position,salaryType,minRate,maxRate,hiredFrom,hiredTo,documentFilter,quick,search,order]);
 const activeFilters=[
  ...(search.trim()?[{key:"search",label:`Search: ${search.trim()}`}]:[]),
  ...(localBranch!=="All"?[{key:"branch",label:`Branch: ${localBranch}`}]:[]),
  ...(status!=="All"?[{key:"status",label:`Status: ${status}`}]:[]),
  ...(department!=="All"?[{key:"department",label:`Department: ${department}`}]:[]),
  ...(gender!=="All"?[{key:"gender",label:`Gender: ${gender}`}]:[]),
  ...(position!=="All"?[{key:"position",label:`Position: ${position}`}]:[]),
  ...(salaryType!=="All"?[{key:"salary",label:`Pay type: ${salaryType}`}]:[]),
  ...(minRate!==""&&salaryType!=="All"?[{key:"minRate",label:`Min rate: ${compactMoney(Number(minRate))}`}]:[]),
  ...(maxRate!==""&&salaryType!=="All"?[{key:"maxRate",label:`Max rate: ${compactMoney(Number(maxRate))}`}]:[]),
  ...(hiredFrom?[{key:"hiredFrom",label:`Hired from: ${hiredFrom}`}]:[]),
  ...(hiredTo?[{key:"hiredTo",label:`Hired to: ${hiredTo}`}]:[]),
  ...(documentFilter!=="All"?[{key:"documents",label:`Documents: ${documentFilter}`}]:[]),
  ...(quick!=="All"?[{key:"quick",label:`Quick: ${quick}`}]:[])
 ];
 const pageCount=Math.max(1,Math.ceil(people.length/rows));
 const current=Math.min(page,pageCount);
 const shown=people.slice((current-1)*rows,current*rows);
 const person=data.people.find(p=>p.id===selected);
 const verified=(p:HRPerson)=>p.documents.filter(x=>x.status==="Verified").length;
 const missing=(p:HRPerson)=>p.documents.filter(x=>x.status==="Missing").length;
 const paidSalary=person?(data.payrollReleases||[]).filter(r=>r.employeeId===person.id&&r.status==="Released"&&r.kind==="Salary"&&(
  salaryPeriod==="all"||(salaryPeriod==="year"&&r.paidAt.startsWith(String(new Date().getFullYear())))||(salaryPeriod==="month"&&r.paidAt.startsWith(new Date().toISOString().slice(0,7)))
 )):[];
 const totals=paidSalary.reduce((t,r)=>({gross:t.gross+r.gross,deductions:t.deductions+r.deductions,net:t.net+r.net}),{gross:0,deductions:0,net:0});
 const assignmentHistory:EmployeeAssignment[]=person?(person.assignmentHistory?.length?person.assignmentHistory:[{id:`legacy-current-${person.id}`,effectiveDate:"",kind:"Initial Assignment",branch:person.branch,department:person.department,position:person.position}]):[];
 const assignedAssets=person?data.assets.filter(a=>a.employeeId===person.id&&["Assigned","For Return","Inspection"].includes(a.status)):[];
 const draft=personal;
 const evaluations=person?person.timeline.filter(t=>/evaluat|assessment/i.test(t)):[];
 const documentSubmissions=person?data.submissions.filter(s=>s.employeeId===person.id):[];
 const goToDocuments=(folder:"Onboarding Files"|"Payslips")=>{setDetailKind(null);setHistoryKind(null);setTab("Documents");setRequestedFolder(folder)};

 const updatePerson=(fn:(p:HRPerson)=>HRPerson)=>{
  if(!person)return;
  update(s=>({...s,people:s.people.map(p=>p.id===person.id?fn(p):p)}));
 };
 const openProfile=(id:string,edit=false)=>{
  const target=data.people.find(p=>p.id===id);
  setSelected(id);setTab("Profile");setAction(null);setEditing(edit);setPersonal(edit&&target?toPersonalDraft(target):null);
  setEmploymentDraft(edit&&target?{probation:target.probation,sil:target.sil,vil:target.vil}:null);
  setHistoryKind(null);setRequestedMemo(null);setRequestedFolder(null);setDetailKind(null);
  setMessage("");setAdd(false);
 };
 const backToDirectory=()=>{
  setSelected(null);setHistoryKind(null);setRequestedMemo(null);setRequestedFolder(null);setDetailKind(null);setAction(null);setEditing(false);setPersonal(null);setEmploymentDraft(null);setMessage("");setAdd(false);
 };
 const setFilter=(fn:()=>void)=>{fn();setPage(1)};
 const toggleSummary=(kind:"all"|"regular"|"probationary"|"missing")=>{
  const active=kind==="regular"&&status==="Regular"&&quick==="All" || kind==="probationary"&&quick==="Probationary" || kind==="missing"&&quick==="Missing Documents";
  resetFilters();
  if(!active){if(kind==="regular")setStatus("Regular");if(kind==="probationary")setQuick("Probationary");if(kind==="missing")setQuick("Missing Documents");}
 };
 const metricPeople=data.people.filter(p=>branch==="All Shops"||p.branch===branch);
 const resetFilters=()=>{
  setSearch("");setLocalBranch("All");setStatus("All");setDepartment("All");
  setGender("All");setPosition("All");setSalaryType("All");setMinRate("");setMaxRate("");
  setHiredFrom("");setHiredTo("");setDocumentFilter("All");setQuick("All");setOrder("name");setPage(1);
 };
 const removeFilter=(key:string)=>setFilter(()=>{
  if(key==="search")setSearch("");if(key==="branch")setLocalBranch("All");
  if(key==="status")setStatus("All");if(key==="department")setDepartment("All");
  if(key==="gender")setGender("All");if(key==="position")setPosition("All");
  if(key==="salary"){setSalaryType("All");setMinRate("");setMaxRate("");}
  if(key==="minRate")setMinRate("");if(key==="maxRate")setMaxRate("");
  if(key==="hiredFrom")setHiredFrom("");if(key==="hiredTo")setHiredTo("");
  if(key==="documents")setDocumentFilter("All");if(key==="quick")setQuick("All");
 });
 const startEdit=()=>{if(!person)return;setTab("Profile");setPersonal(toPersonalDraft(person));setEmploymentDraft({probation:person.probation,sil:person.sil,vil:person.vil});setEditing(true);setMessage("")};
 const persistProfile=()=>{
  if(!draft||!draft.name.trim()){setMessage("Employee full name is required.");return}
  updatePerson(p=>({...p,...draft,...(employmentDraft||{}),hire:p.hire,name:draft.name.trim(),timeline:[`${new Date().toISOString().slice(0,10)} · Personal details updated`,...p.timeline]}));
  setEditing(false);setPersonal(null);setEmploymentDraft(null);setMessage("Employee details saved to this browser.");
 };
 const savePersonal=(e:FormEvent)=>{e.preventDefault();persistProfile()};
 const hasUnsavedEdit=()=>Boolean(person&&editing&&((personal&&JSON.stringify(personal)!==JSON.stringify(toPersonalDraft(person)))||(employmentDraft&&JSON.stringify(employmentDraft)!==JSON.stringify({probation:person.probation,sil:person.sil,vil:person.vil}))));
 const confirmLeavingEdits=()=>!hasUnsavedEdit()||window.confirm("You have unsaved employee changes. Discard them and continue?");
 const openAssetsForPerson=()=>{if(person&&onAssignDevice&&confirmLeavingEdits())onAssignDevice(person.id)};
 const openPayRates=()=>{if(person&&onOpenPayroll&&confirmLeavingEdits())onOpenPayroll(person.id)};
 const beginCompensationEdit=()=>{if(!person||role==="BM")return;setEditingCompensation(true);setCompType(person.salaryType);setCompAmount(String(basicRateOnDate(person.id,person.rate,new Date().toISOString().slice(0,10),data.payrollConfig?.rateChanges||[])));setCompReason("");setCompError("")};
 const saveCompensation=()=>{
  if(!person||role==="BM")return;
  const amount=Number(compAmount),reason=compReason.trim();
  if(!Number.isFinite(amount)||amount<=0||!reason){setCompError("Enter a positive salary rate and a required adjustment reason.");return}
  const today=new Date().toISOString().slice(0,10);
  const employeeId=person.id;
  const change:PayRateChange={id:`EMP201-RATE-${Date.now()}`,employeeId,salaryType:compType,amount,effective:today,reason,status:"Applied (Demo)",recordedAt:today};
  update(previous=>{const config=normalizePayrollConfig(previous.payrollConfig);return {...previous,people:previous.people.map(p=>p.id===employeeId?{...p,rate:amount,salaryType:compType,timeline:[`${today} · HR rate review: ${compType} ${money(amount)} · ${reason}`,...p.timeline]}:p),payrollConfig:{...config,rateChanges:[...config.rateChanges,change]}}});
  setEditingCompensation(false);setCompReason("");setMessage("Compensation updated in browser review. Previous payslip snapshots were not changed.");
 };
 const startAction=(a:Action)=>{
  if(!person||!confirmLeavingEdits())return;
  setEditing(false);setPersonal(null);setEmploymentDraft(null);
  setAction(a);setStep(0);setReason("");setDecision("Approved");setSeparationType("Resignation");setEffective("2026-10-12");
  setDest(person.branch);setNewPosition(person.position);setNewDepartment(person.department);setNewRate(String(person.rate));setMemoReference("");setMessage("");
 };
 function create(e:FormEvent){
  e.preventDefault();
  if(!form.branch||!form.name.trim()||!form.position.trim()||!form.hire||!(Number(form.rate)>0)){
   setMessage("Complete full name, assigned branch, position, initial hire date and basic salary.");return;
  }
  const prefix=form.branch.startsWith("MM")?"MM":"UC";
  const max=Math.max(0,...data.people.filter(p=>p.id.startsWith(prefix+"-")).map(p=>Number(p.id.split("-")[1])||0));
  const id=`${prefix}-${String(max+1).padStart(4,"0")}`;
  const p:HRPerson={
   id,name:form.name.trim(),branch:form.branch,department:form.department,position:form.position,
   status:form.status,gender:form.gender,hire:form.hire,salaryType:form.salaryType,
   rate:Number(form.rate),probation:form.status==="Probationary"?Number(form.probation):0,
   sil:Number(form.sil),vil:Number(form.vil),email:form.email,phone:form.phone,
   birthDate:form.birthDate,civilStatus:form.civilStatus,address:form.address,
   emergencyName:form.emergencyName,emergencyRelationship:form.emergencyRelationship,
   emergencyPhone:form.emergencyPhone,
   documents:["Resume","Medical Clearance","Employment Contract","NDA / Company Policies","Government IDs"].map(name=>({name,status:"Missing"})),
   timeline:[`${form.hire} · Employee registered at ${form.branch}`],assignmentHistory:[{id:`initial-${id}`,effectiveDate:form.hire,kind:"Initial Assignment",branch:form.branch,department:form.department,position:form.position}]
  };
  update(s=>({...s,people:[p,...s.people]}));
  setForm({...emptyForm});setAdd(false);openProfile(id);
  setMessage("Employee record created. Review Employee Details, Employment Details, and Documents.");
 }
 function record(){
  if(!person||!action||!reason.trim()){
   setMessage("Enter a supporting reason, evaluation or approval reference before recording the action.");return;
  }
  if(action==="Transfer"&&dest===person.branch&&newDepartment===person.department&&newPosition.trim()===person.position){setMessage("Change the branch, department, or position to record a transfer/reassignment.");return}
  if(action==="Promote"&&(!newPosition.trim()||!(Number(newRate)>0))){setMessage("Enter the new position and approved basic rate.");return}
  if((action==="Transfer"||action==="Promote")&&!newDepartment.trim()){setMessage("Select the receiving department.");return}
  if(action==="Offboard"&&decision==="Approved"&&assignedAssets.length>0){
   setMessage("Complete device retrieval and inspection before marking offboarding as approved.");return;
  }
  const entry=`${effective} · ${action}${action==="Offboard"?` — ${separationType}`:""} (${decision}) · ${reason.trim()}`;
  const employmentChange:Partial<HRPerson>=decision!=="Approved"?{}:
   action==="Regularize"?{status:"Regular",probation:0}:
   action==="Transfer"?{branch:dest,department:newDepartment,position:newPosition.trim()}:
   action==="Promote"?{department:newDepartment,position:newPosition.trim(),rate:Number(newRate)}:
   action==="Offboard"?{status:"Clearance Pending"}:{};
  const isAssignmentChange=decision==="Approved"&&(action==="Transfer"||action==="Promote");
  const memoId=memoReference.trim().toUpperCase();
  updatePerson(p=>({
   ...p,...employmentChange,timeline:[entry,...p.timeline],
   assignmentHistory:isAssignmentChange?[
    ...(p.assignmentHistory?.length?p.assignmentHistory:[{id:`legacy-baseline-${p.id}-${Date.now()}`,effectiveDate:"",kind:"Initial Assignment" as const,branch:p.branch,department:p.department,position:p.position}]),
    {id:`assignment-${Date.now()}`,effectiveDate:effective,kind:action==="Transfer"?(dest===p.branch?"Reassignment":"Transfer"):"Promotion",branch:action==="Transfer"?dest:p.branch,department:newDepartment,position:newPosition.trim(),...(memoId?{memoId,memoType:action==="Transfer"?(dest===p.branch?"Memo of Reassignment":"Memo of Transfer"):"Memo of Promotion"}:{})}
   ]:p.assignmentHistory
  }));
  setAction(null);setStep(0);setMessage(`${action} decision recorded in employee history.`);
 }
 const next=()=>{
  if(!action)return;
  if(step===0&&action==="Promote"&&(!newPosition.trim()||!(Number(newRate)>0))){setMessage("Enter the proposed position and approved basic rate.");return}
  if(step===0&&action==="Transfer"&&(!newPosition.trim()||(dest===person?.branch&&newDepartment===person.department&&newPosition.trim()===person.position))){setMessage("Select a changed assignment and fill in the assigned position.");return}
  if(step>=1&&!reason.trim()){setMessage("Provide a written reason or approval reference before continuing.");return}
  setMessage("");setStep(n=>Math.min(2,n+1));
 };

 if(role==="BM")return <section className="panel">Employee 201 is restricted to authorized HR personnel. Use Employee Document Submission instead.</section>;

 return <div className="rev-stack employee201">
  {!person&&<div className="rev-title">
   <div><p className="uc-compact-summary">{people.length} employee records · {people.filter(p=>missing(p)>0).length} with missing documents</p></div>
   <div className="rev-actions"><HelpButton topic="employee" label="Employee 201 Guide"/><ModuleAlertButton module="employees" branch={branch}/>
    {!person&&!add&&<button className="primary" onClick={()=>{setAdd(true);setMessage("")}}><Plus size={16}/> Add Employee</button>}
   </div>
  </div>}
  {message&&<div className="rev-note" role="status">{message}</div>}

  {add&&<section className="panel">
   <div className="rev-title"><div><h3>Initial Employee Registration</h3><p>Enter onboarding details before creating the employee record. The Hire Date locks after registration.</p></div><button className="secondary" onClick={()=>{setAdd(false);setMessage("")}}>Cancel</button></div>
   <form onSubmit={create} className="employee201-registration">
    <div className="employee201-formsection"><h4>Personal & Contact Information</h4><div className="rev-form">
     <label>Full name *<input required value={form.name} onChange={e=>setForm(s=>({...s,name:e.target.value}))}/></label>
     <label>Gender<select value={form.gender} onChange={e=>setForm(s=>({...s,gender:e.target.value}))}>{["Male","Female","Prefer not to say"].map(x=><option key={x}>{x}</option>)}</select></label>
     <label>Date of birth<input type="date" value={form.birthDate} onChange={e=>setForm(s=>({...s,birthDate:e.target.value}))}/></label>
     <label>Civil status<select value={form.civilStatus} onChange={e=>setForm(s=>({...s,civilStatus:e.target.value}))}><option value="">Select status</option>{["Single","Married","Widowed","Separated","Other"].map(x=><option key={x}>{x}</option>)}</select></label>
     <label>Contact number<input type="tel" value={form.phone} onChange={e=>setForm(s=>({...s,phone:e.target.value}))}/></label>
     <label>Email address<input type="email" value={form.email} onChange={e=>setForm(s=>({...s,email:e.target.value}))}/></label>
     <label className="employee201-wide">Residential address<textarea rows={2} value={form.address} onChange={e=>setForm(s=>({...s,address:e.target.value}))}/></label>
    </div></div>
    <div className="employee201-formsection"><h4>Employment Details</h4><div className="rev-form">
     <label>Assigned branch *<select required value={form.branch} onChange={e=>setForm(s=>({...s,branch:e.target.value as Shop}))}><option value="">Select a branch</option>{shopNames.map(x=><option key={x}>{x}</option>)}</select></label>
     <label>Department<select value={form.department} onChange={e=>setForm(s=>({...s,department:e.target.value}))}>{departments.map(x=><option key={x}>{x}</option>)}</select></label>
     <label>Position *<input required value={form.position} onChange={e=>setForm(s=>({...s,position:e.target.value}))}/></label>
     <label>Employment Status<select value={form.status} onChange={e=>setForm(s=>({...s,status:e.target.value}))}>{employmentStatuses.filter(x=>x!=="Clearance Pending").map(x=><option key={x}>{x}</option>)}</select></label>
     <label>Initial Hire Date * <span className="emp201-fieldhint">Onboarding only; locks after registration.</span><input required type="date" value={form.hire} onChange={e=>setForm(s=>({...s,hire:e.target.value}))}/></label>
     {form.status==="Probationary"&&<label>Probation period (months)<input type="number" min="1" max="12" value={form.probation} onChange={e=>setForm(s=>({...s,probation:e.target.value}))}/></label>}
     <label>Salary Type<select value={form.salaryType} onChange={e=>setForm(s=>({...s,salaryType:e.target.value as "Daily"|"Monthly"}))}><option>Daily</option><option>Monthly</option></select></label>
     <label>Basic rate ({form.salaryType==="Daily"?"per day":"per month"}) *<input required type="number" min="1" value={form.rate} onChange={e=>setForm(s=>({...s,rate:e.target.value}))}/></label>
     <label>SIL allocation (days)<input type="number" min="0" value={form.sil} onChange={e=>setForm(s=>({...s,sil:e.target.value}))}/></label>
     <label>VIL allocation (days)<input type="number" min="0" value={form.vil} onChange={e=>setForm(s=>({...s,vil:e.target.value}))}/></label>
    </div></div>
    <div className="employee201-formsection"><h4>Emergency Contact</h4><div className="rev-form">
     <label>Contact person's name<input value={form.emergencyName} onChange={e=>setForm(s=>({...s,emergencyName:e.target.value}))}/></label>
     <label>Relationship<input value={form.emergencyRelationship} onChange={e=>setForm(s=>({...s,emergencyRelationship:e.target.value}))}/></label>
     <label>Emergency phone<input type="tel" value={form.emergencyPhone} onChange={e=>setForm(s=>({...s,emergencyPhone:e.target.value}))}/></label>
    </div></div>
    <p className="muted">Personnel records are stored in this browser for frontend review only. Do not enter real private employee data until a secure backend is available.</p>
    <div className="rev-actions"><button type="submit" className="primary">Create Employee Record</button><button type="button" className="secondary" onClick={()=>setAdd(false)}>Cancel</button></div>
   </form>
  </section>}

  {!add&&!person&&<>
   <div className="employee201-summary" role="group" aria-label="Employee directory quick filters">
    <button type="button" className="uc-quick-stat" aria-label="Show all employees" onClick={()=>toggleSummary("all")}><small>Employees in view</small><strong>{people.length}</strong></button>
    <button type="button" className={`uc-quick-stat ${status==="Regular"&&quick==="All"?"is-active":""}`} aria-pressed={status==="Regular"&&quick==="All"} onClick={()=>toggleSummary("regular")}><small>Regular employees</small><strong>{metricPeople.filter(p=>p.status==="Regular").length}</strong></button>
    <button type="button" className={`uc-quick-stat ${quick==="Probationary"?"is-active":""}`} aria-pressed={quick==="Probationary"} onClick={()=>toggleSummary("probationary")}><small>Probationary employees</small><strong>{metricPeople.filter(p=>p.status==="Probationary").length}</strong></button>
    <button type="button" className={`uc-quick-stat ${quick==="Missing Documents"?"is-active":""}`} aria-pressed={quick==="Missing Documents"} onClick={()=>toggleSummary("missing")}><small>With missing documents</small><strong>{metricPeople.filter(p=>missing(p)>0).length}</strong></button>
   </div>
   <section className="panel employee201-directory-panel"><div className="rev-title"><div><h3>Employee Directory</h3></div><span className="tag">{people.length} records</span></div>
    <div className="employee201-toolbar">
     <label className="employee201-toolbar-search"><Search size={17}/><input aria-label="Search employee name, ID or position" value={search} onChange={e=>setFilter(()=>setSearch(e.target.value))} placeholder="Search employee name, ID or position…"/></label>
     <button type="button" className={`secondary employee201-filter-toggle ${advancedOpen?"is-open":""}`} aria-expanded={advancedOpen} aria-controls="employee201-advanced-panel" onClick={()=>setAdvancedOpen(v=>!v)}><SlidersHorizontal size={16}/> Filters{activeFilters.filter(x=>x.key!=="search"&&x.key!=="quick").length>0&&<b>{activeFilters.filter(x=>x.key!=="search"&&x.key!=="quick").length}</b>}{advancedOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>}</button>
     <label className="employee201-sort">Sort<select aria-label="Sort employee directory" value={order} onChange={e=>setFilter(()=>setOrder(e.target.value))}><option value="name">Name A–Z</option><option value="latest">Newest hires</option><option value="oldest">Earliest hires</option><option value="missing">Least documents verified</option>{salaryType!=="All"&&<><option value="salary-high">Highest basic rate</option><option value="salary-low">Lowest basic rate</option></>}</select></label>
     {activeFilters.length>0&&<button type="button" className="secondary employee201-clear" onClick={resetFilters}>Clear all</button>}
     <HelpButton topic="filters" label="Help"/>
    </div>
    <div className="employee201-quick-presets" role="group" aria-label="Quick employee filters">
     {(["All","Probationary","Missing Documents","Pending Verification","New Hires"] as const).map(x=><button key={x} type="button" className={`employee201-preset ${quick===x?"active":""}`} aria-pressed={quick===x} onClick={()=>setFilter(()=>setQuick(x))}>{x}{x==="New Hires"&&<small> (90 days)</small>}</button>)}
    </div>
    {advancedOpen&&<div id="employee201-advanced-panel" className="employee201-advanced" role="region" aria-label="Advanced employee filters">
     <div className="employee201-advanced-title"><SlidersHorizontal size={15}/><span>Refine results · rate filters use the selected pay type (daily/monthly).</span></div>
     <div className="employee201-advanced-groups"><div className="employee201-advanced-group"><strong className="employee201-group-heading">Employee Details</strong><div className="employee201-advanced-grid">
      <label>Branch<select value={localBranch} onChange={e=>setFilter(()=>setLocalBranch(e.target.value))}><option value="All">{branch==="All Shops"?"All branches":"Current branch"}</option>{(branch==="All Shops"?shopNames:[branch]).map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Employment Status<select value={status} onChange={e=>setFilter(()=>setStatus(e.target.value))}><option>All</option>{employmentStatuses.map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Department<select value={department} onChange={e=>setFilter(()=>setDepartment(e.target.value))}><option>All</option>{departments.map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Gender<select value={gender} onChange={e=>setFilter(()=>setGender(e.target.value))}><option>All</option>{genders.map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Job Position<select value={position} onChange={e=>setFilter(()=>setPosition(e.target.value))}><option>All</option>{positions.map(x=><option key={x}>{x}</option>)}</select></label>
     </div></div><div className="employee201-advanced-group"><strong className="employee201-group-heading">Employment & Compensation</strong><div className="employee201-advanced-grid">
      <label>Salary Type<select value={salaryType} onChange={e=>setFilter(()=>{setSalaryType(e.target.value);setMinRate("");setMaxRate("");if(order.startsWith("salary"))setOrder("name")})}><option>All</option><option>Daily</option><option>Monthly</option></select></label>

      <label>Hired From<input type="date" value={hiredFrom} max={hiredTo||undefined} onChange={e=>setFilter(()=>setHiredFrom(e.target.value))}/></label>
      <label>Hired To<input type="date" value={hiredTo} min={hiredFrom||undefined} onChange={e=>setFilter(()=>setHiredTo(e.target.value))}/></label>
      <label>Minimum Basic Rate (₱)<input type="number" inputMode="decimal" min="0" step="any" disabled={salaryType==="All"} value={minRate} onChange={e=>setFilter(()=>setMinRate(e.target.value))} placeholder={salaryType==="All"?"Select salary type first":"Minimum rate"}/></label>
      <label>Maximum Basic Rate (₱)<input type="number" inputMode="decimal" min="0" step="any" disabled={salaryType==="All"} value={maxRate} onChange={e=>setFilter(()=>setMaxRate(e.target.value))} placeholder={salaryType==="All"?"Select salary type first":"Maximum rate"}/></label>
     </div></div><div className="employee201-advanced-group"><strong className="employee201-group-heading">Document Requirements</strong><div className="employee201-advanced-grid"><label>Document Status<select value={documentFilter} onChange={e=>setFilter(()=>setDocumentFilter(e.target.value))}><option>All</option><option>Missing</option><option>Pending Verification</option><option>Complete</option></select></label></div></div></div>
     
    <div className="employee201-advanced-footer"><button type="button" className="secondary" onClick={resetFilters}>Reset filters</button><button type="button" className="primary" onClick={()=>setAdvancedOpen(false)}>Show {people.length} employee{people.length===1?"":"s"}</button></div>
    </div>}
    <div className="employee201-resultbar"><strong>{people.length} matching employee{people.length===1?"":"s"}</strong><span>{activeFilters.length} active filter{activeFilters.length===1?"":"s"}</span></div>
    {activeFilters.length>0&&<div className="employee201-chips" aria-label="Applied employee filters">{activeFilters.map(x=><button key={x.key} type="button" className="employee201-chip" onClick={()=>removeFilter(x.key)} aria-label={`Remove ${x.label} filter`}>{x.label}<X size={13}/></button>)}</div>}
    {hiredFrom&&hiredTo&&hiredFrom>hiredTo&&<p className="employee201-filterwarning" role="alert">The hire date range is invalid. Set “Hired from” on or before “Hired to”.</p>}
    {salaryType!=="All"&&minRate!==""&&maxRate!==""&&Number(minRate)>Number(maxRate)&&<p className="employee201-filterwarning" role="alert">Minimum basic rate is greater than the maximum.</p>}
    <p className="employee201-tablehint">On smaller laptop screens, scroll inside the employee table to view all columns. Mobile uses full-detail employee cards.</p>
    <div className="table-wrap employee201-tablewrap"><table className="employee201-table"><thead><tr>
     <th>Employee / ID</th><th>Branch</th><th>Department & Position</th><th>Gender</th><th>Employment Status</th><th>Date Hired</th><th>Salary / Type</th><th>Document Status</th><th>Actions</th>
    </tr></thead><tbody>{shown.map(p=><tr key={p.id}>
     <td><strong>{p.name}</strong><small className="pay-small">{p.id}</small></td>
     <td>{p.branch}</td>
     <td><strong>{p.position}</strong><small className="pay-small">{p.department}</small></td>
     <td>{p.gender}</td>
     <td><span className="tag">{p.status}</span></td>
     <td>{formatDate(p.hire)}</td>
     <td><div className="employee201-salary"><strong className="employee201-salary-amount">{salaryAmount(p,data.payrollConfig?.rateChanges||[])}</strong><small className="employee201-salary-type">{p.salaryType}</small></div></td>
     <td><div className="employee201-docprogress"><strong>{verified(p)}/{p.documents.length} verified</strong><small>{missing(p)>0?`${missing(p)} missing`:"No missing documents"}</small></div></td>
     <td><div className="rev-actions emp201-rowactions"><button type="button" className="secondary" onClick={()=>openProfile(p.id)}><Eye size={15}/> View</button><button type="button" className="secondary" onClick={()=>openProfile(p.id,true)}><Pencil size={15}/> Edit</button></div></td>
    </tr>)}</tbody></table>
    {shown.length===0&&<div className="empty"><strong>No employees match these filters.</strong><p>Try another branch or status, remove a filter chip above, or use Clear All Filters.</p><button type="button" className="secondary" onClick={resetFilters}>Show All Employees</button></div>}
    </div>
    <div className="emp201-responsive-cards" aria-label="Employee directory cards for compact screens">
      {shown.map(p=><article className="emp201-responsive-card" key={p.id}>
       <div className="emp201-responsive-head"><div><strong>{p.name}</strong><small>{p.id} · {p.branch}</small></div><span className="tag">{p.status}</span></div>
       <dl><div><dt>Department / Position</dt><dd>{p.department} · {p.position}</dd></div><div><dt>Gender</dt><dd>{p.gender}</dd></div><div><dt>Hire Date</dt><dd>{formatDate(p.hire)}</dd></div><div><dt>Salary / Type</dt><dd>{salaryAmount(p,data.payrollConfig?.rateChanges||[])} · {p.salaryType}</dd></div><div><dt>Documents</dt><dd>{verified(p)}/{p.documents.length} verified · {missing(p)} missing</dd></div></dl>
       <div className="emp201-responsive-actions"><button className="secondary" type="button" onClick={()=>openProfile(p.id)}><Eye size={15}/> View</button><button className="secondary" type="button" onClick={()=>openProfile(p.id,true)}><Pencil size={15}/> Edit</button></div>
      </article>)}
     {shown.length===0&&<p className="muted">No matching employees.</p>}
    </div>
    <div className="rev-pagination employee201-pages" aria-label="Employee directory pagination">
     <span>Showing {people.length?(current-1)*rows+1:0}–{Math.min(current*rows,people.length)} of {people.length}</span>
     <label>Rows Per Page <select value={rows} onChange={e=>{setRows(Number(e.target.value) as 10|20|50);setPage(1)}}>{[10,20,50].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
     <button className="secondary" disabled={current<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Previous</button>
     <span>Page {current} of {pageCount}</span>
     <button className="secondary" disabled={current>=pageCount} onClick={()=>setPage(p=>Math.min(pageCount,p+1))}>Next</button>
    </div>
   </section>
  </>}

  {person&&!add&&<>
   <button className="rev-back" onClick={backToDirectory}><ArrowLeft size={16}/> Back to Employee Directory</button>
   <section className="panel">
    <div className="rev-title employee201-profiletitle"><div><h3><UserRound size={19}/> {person.name}</h3><p>{person.id} · {person.department} / {person.position} · {person.branch}</p></div><div className="rev-actions"><span className="tag">{person.status}</span><button type="button" className="secondary" onClick={()=>{setEditing(false);setPersonal(null);setEmploymentDraft(null);setAction(null)}}><Eye size={15}/> View</button><button type="button" className={editing?"primary":"secondary"} onClick={startEdit}><Pencil size={15}/> Edit</button></div></div>
    {!action&&<>
     <nav className="rev-tabs employee201-profiletabs" aria-label="Employee 201 tabs">{profileSections.map(({id,label})=><button type="button" key={id} className={tab===id?"active":""} aria-current={tab===id?"page":undefined} onClick={()=>{setTab(id);setMessage("")}}>{label}</button>)}</nav>
     {tab==="Profile"&&<nav className="emp201-jumplinks" aria-label="Jump to employee profile section">{[["Employee Details","personal"],["Employment","employment"],["Salary & Benefits","compensation"],["Reviews","evaluations"],["History","history"],["Clearance & Assets","clearance"],["Employee Actions","actions"]].map(([label,id])=><a key={id} href={`#emp201-${id}`}>{label}</a>)}</nav>}
     <div className="rev-detail employee201-detail">
      {tab==="Profile"&&<div className="emp201-card-grid">
       <section className="employee201-profile-section emp201-summary-card" id="emp201-personal">
        <button type="button" className="emp201-cardhead" onClick={()=>setDetailKind("employee")} aria-label="Open full employee details and document logs"><span><UserRound size={17}/> Employee Details</span><span>View Details <ArrowRight size={14}/></span></button>
        {editing&&draft?<form onSubmit={savePersonal} className="rev-form emp201-summary-edit">
         <label>Full name *<input required value={draft.name} onChange={e=>setPersonal(p=>p?{...p,name:e.target.value}:p)}/></label>
         <label>Gender<select value={draft.gender} onChange={e=>setPersonal(p=>p?{...p,gender:e.target.value}:p)}>{["Male","Female","Prefer not to say"].map(x=><option key={x}>{x}</option>)}</select></label>
         <label>Birth date<input type="date" value={draft.birthDate||""} onChange={e=>setPersonal(p=>p?{...p,birthDate:e.target.value}:p)}/></label>
         <label>Civil status<select value={draft.civilStatus||""} onChange={e=>setPersonal(p=>p?{...p,civilStatus:e.target.value}:p)}><option value="">Select status</option>{["Single","Married","Widowed","Separated","Other"].map(x=><option key={x}>{x}</option>)}</select></label>
         <label>Contact number<input type="tel" value={draft.phone} onChange={e=>setPersonal(p=>p?{...p,phone:e.target.value}:p)}/></label>
         <label>Email address<input type="email" value={draft.email} onChange={e=>setPersonal(p=>p?{...p,email:e.target.value}:p)}/></label>
         <label className="employee201-wide">Residential address<textarea rows={2} value={draft.address||""} onChange={e=>setPersonal(p=>p?{...p,address:e.target.value}:p)}/></label>
         <label>Emergency contact name<input value={draft.emergencyName||""} onChange={e=>setPersonal(p=>p?{...p,emergencyName:e.target.value}:p)}/></label>
         <label>Relationship<input value={draft.emergencyRelationship||""} onChange={e=>setPersonal(p=>p?{...p,emergencyRelationship:e.target.value}:p)}/></label>
         <label>Emergency phone<input type="tel" value={draft.emergencyPhone||""} onChange={e=>setPersonal(p=>p?{...p,emergencyPhone:e.target.value}:p)}/></label>
        </form>:<button type="button" className="emp201-cardbody" onClick={()=>setDetailKind("employee")} aria-label="View employee personal, contact and document records"><span className="emp201-card-fact"><small>Gender</small><b>{person.gender}</b></span><span className="emp201-card-fact"><small>Birth Date</small><b>{formatDate(person.birthDate)}</b></span><span className="emp201-card-fact"><small>Phone</small><b>{empty(person.phone)}</b></span><span className="emp201-card-fact"><small>Email</small><b>{empty(person.email)}</b></span></button>}
       </section>
       <section className="employee201-profile-section emp201-summary-card" id="emp201-employment">
        <button type="button" className="emp201-cardhead" onClick={()=>setDetailKind("employment")} aria-label="Open full employment details and assignment history"><span><BriefcaseBusiness size={17}/> Employment Details</span><span>View History <ArrowRight size={14}/></span></button>
        <div className="emp201-cardbody emp201-cardbody-static">
         <div className="emp201-card-fact"><small>Branch</small><button type="button" className="emp201-inline-link" onClick={()=>setHistoryKind("branch")}>{person.branch}<ArrowRight size={12}/></button></div>
         <div className="emp201-card-fact"><small>Department & Position</small><button type="button" className="emp201-inline-link" onClick={()=>setHistoryKind("role")}>{person.department} — {person.position}<ArrowRight size={12}/></button></div>
         <div className="emp201-card-fact"><small>Hire Date <ShieldCheck size={11}/></small><b>{formatDate(person.hire)}</b></div>
         <div className="emp201-card-fact"><small>Employment Status</small><b>{person.status}</b></div>
        </div>
        {editing&&employmentDraft&&<div className="rev-form emp201-edit-inline"><label>Probation Months<input type="number" min="0" max="12" value={employmentDraft.probation} onChange={e=>setEmploymentDraft(v=>v?{...v,probation:Number(e.target.value)}:v)}/></label><label>SIL Days<input type="number" min="0" value={employmentDraft.sil} onChange={e=>setEmploymentDraft(v=>v?{...v,sil:Number(e.target.value)}:v)}/></label><label>VIL Days<input type="number" min="0" value={employmentDraft.vil} onChange={e=>setEmploymentDraft(v=>v?{...v,vil:Number(e.target.value)}:v)}/></label></div>}
       </section>
       <section className="employee201-profile-section emp201-summary-card" id="emp201-compensation">
        <button type="button" className="emp201-cardhead" onClick={()=>setDetailKind("salary")} aria-label="Open salary, pay rate and benefits history"><span><Wallet size={17}/> Salary & Benefits</span><span>View Details <ArrowRight size={14}/></span></button>
        <button type="button" className="emp201-cardbody" onClick={()=>setDetailKind("salary")} aria-label="View full salary and benefits details">
         <span className="emp201-card-fact"><small>Basic Rate</small><b>{salaryAmount(person,data.payrollConfig?.rateChanges||[])}</b></span>
         <span className="emp201-card-fact"><small>Salary Type</small><b>{person.salaryType}</b></span>
         <span className="emp201-card-fact"><small>SIL</small><b>{person.sil} days</b></span>
         <span className="emp201-card-fact"><small>VIL</small><b>{person.vil} days</b></span>
        </button>
        <button type="button" className="emp201-salary-summary" onClick={()=>setDetailKind("salary")}><span><small>Total Salary Received · {salaryPeriod==="all"?"All Time":salaryPeriod==="month"?"This Month":"This Year"}</small><b>{money(totals.net)}</b></span><span>View History <ArrowRight size={14}/></span></button>
       </section>
       <section className="employee201-profile-section emp201-summary-card" id="emp201-evaluations">
        <button type="button" className="emp201-cardhead" onClick={()=>setDetailKind("reviews")}><span><ClipboardList size={17}/> Performance Reviews <i className="emp201-heading-count">{evaluations.length}</i></span><span>View Details <ArrowRight size={14}/></span></button>
        <button type="button" className="emp201-card-excerpt" onClick={()=>setDetailKind("reviews")}><small>{evaluations.length?"Latest assessment":"Assessment status"}</small><b>{evaluations[0]||"No performance reviews recorded"}</b></button>
       </section>
       <section className="employee201-profile-section emp201-summary-card" id="emp201-history">
        <button type="button" className="emp201-cardhead" onClick={()=>setDetailKind("history")}><span><BriefcaseBusiness size={17}/> Employment History <i className="emp201-heading-count">{person.timeline.length}</i></span><span>View Timeline <ArrowRight size={14}/></span></button>
        <button type="button" className="emp201-card-excerpt" onClick={()=>setDetailKind("history")}><small>Latest activity</small><b>{person.timeline[0]||"No history records"}</b></button>
       </section>
       <section className="employee201-profile-section emp201-summary-card" id="emp201-clearance">
        <button type="button" className="emp201-cardhead" onClick={()=>setDetailKind("assets")}><span><Laptop size={17}/> Clearance & Assigned Assets <i className="emp201-heading-count">{assignedAssets.length}</i></span><span>View Assets <ArrowRight size={14}/></span></button>
        <button type="button" className="emp201-card-excerpt" onClick={()=>setDetailKind("assets")}><small>Employee status · {person.status}</small><b>{assignedAssets.length} outstanding device{assignedAssets.length===1?"":"s"}{assignedAssets.length>0?` · ${assignedAssets[0].name}`:""}</b></button>
       </section>
      </div>}
      {tab==="Documents"&&<EmployeeDocumentLibrary person={person} releases={data.payrollReleases||[]} submissions={data.submissions} uploads={uploads[person.id]||[]} requestedMemo={requestedMemo} onMemoHandled={()=>setRequestedMemo(null)} requestedFolder={requestedFolder} onFolderHandled={()=>setRequestedFolder(null)} onUpload={(folder,file,memoId)=>{const id=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;setUploads(prev=>({...prev,[person.id]:[...(prev[person.id]||[]),{id,name:file.name,folder,file,memoId}]}));return id}}/>}
     </div>
     {tab==="Profile"&&editing&&<div className="emp201-savebar"><span>Editing employee information · Save changes before leaving this profile</span><div className="rev-actions"><button type="button" className="secondary" onClick={()=>{setEditing(false);setPersonal(null);setEmploymentDraft(null)}}>Cancel</button><button type="button" className="primary" onClick={persistProfile}>Save Profile Changes</button></div></div>}
    </>}
    {detailKind&&createPortal(<div className="emp201-history-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setDetailKind(null)}}>
     <section className="emp201-detail-modal" role="dialog" aria-modal="true" aria-labelledby="emp201-detail-dialog-title">
      <header><div><h3 id="emp201-detail-dialog-title">{{employee:"Employee Details",employment:"Employment Details",salary:"Salary & Benefits",reviews:"Performance Reviews",history:"Employment History",assets:"Clearance & Assigned Assets"}[detailKind]}</h3><p>{person.name} · {person.id}</p></div><button className="secondary" type="button" onClick={()=>setDetailKind(null)}><X size={16}/> Close</button></header>
      <div className="emp201-detail-modalbody">
       {detailKind==="employee"&&<>
        <h4>Personal & Contact Information</h4><div className="emp201-dialog-facts">{[["Full Name",person.name],["Employee ID",person.id],["Gender",person.gender],["Birth Date",formatDate(person.birthDate)],["Civil Status",empty(person.civilStatus)],["Phone",empty(person.phone)],["Email",empty(person.email)],["Address",empty(person.address)],["Emergency Contact",empty(person.emergencyName)],["Relationship",empty(person.emergencyRelationship)],["Emergency Phone",empty(person.emergencyPhone)]].map(([label,value])=><div key={label}><small>{label}</small><b>{value}</b></div>)}</div>
        <div className="emp201-dialog-subhead"><h4>Document Logs</h4><button type="button" className="secondary" onClick={()=>goToDocuments("Onboarding Files")}><FileText size={14}/> Open Documents</button></div>
        {person.documents.length===0&&documentSubmissions.length===0?<p className="muted">No document records available.</p>:<div className="emp201-log-list">{person.documents.map((d,i)=><div key={`req-${i}`}><span><FileText size={15}/> {d.name}{d.fileName?` · ${d.fileName}`:""}</span><span className="tag">{d.status}</span></div>)}{documentSubmissions.map(s=><div key={s.id}><span><FileText size={15}/> {s.type} · {s.fileName}</span><span className="tag">{s.status}</span></div>)}</div>}
       </>}
       {detailKind==="employment"&&<>
        <h4>Current Employment</h4><div className="emp201-dialog-facts"><div><small>Branch</small><b>{person.branch}</b></div><div><small>Department & Position</small><b>{person.department} — {person.position}</b></div><div><small>Employment Status</small><b>{person.status}</b></div><div><small>Hire Date (locked)</small><b>{formatDate(person.hire)}</b></div><div><small>Probation Period</small><b>{person.probation} months</b></div></div>
        <div className="emp201-dialog-subhead"><h4>Assignment History</h4><div className="rev-actions"><button type="button" className="secondary" onClick={()=>{setDetailKind(null);setHistoryKind("branch")}}>Branch History</button><button type="button" className="secondary" onClick={()=>{setDetailKind(null);setHistoryKind("role")}}>Position History</button></div></div>
        <div className="emp201-dialog-timeline">{[...assignmentHistory].sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)).map((h,i)=><div key={h.id||i}><small>{formatDate(h.effectiveDate)} · {h.kind}</small><b>{h.branch} · {h.department} — {h.position}</b>{h.memoId?<button type="button" className="emp201-memo-link" onClick={()=>{setDetailKind(null);setTab("Documents");setRequestedMemo(h.memoId||null)}}><FileText size={13}/>{h.memoId}</button>:<small>No memo attached</small>}</div>)}</div>
       </>}
       {detailKind==="salary"&&<>
        <div className="emp201-dialog-facts"><div><small>Basic Rate</small><b>{salaryAmount(person,data.payrollConfig?.rateChanges||[])}</b></div>{person.salaryType==="Daily"&&<div><small>Monthly basic reference (26 days)</small><b>{money(basicRateOnDate(person.id,person.rate,new Date().toISOString().slice(0,10),data.payrollConfig?.rateChanges||[])*26)}</b></div>}<div><small>Salary Type</small><b>{person.salaryType}</b></div><div><small>SIL</small><b>{person.sil} days</b></div><div><small>VIL</small><b>{person.vil} days</b></div></div>
        <div className="rev-actions"><button type="button" className="secondary" onClick={beginCompensationEdit}><Pencil size={15}/> Edit Basic Pay Rate</button></div>{editingCompensation&&<div className="panel uc-emp-rate-editor"><h4>Edit Compensation · HR Demo</h4><div className="rev-form"><label>Salary Type<select value={compType} onChange={e=>setCompType(e.target.value as "Daily"|"Monthly")}><option>Daily</option><option>Monthly</option></select></label><label>Basic Rate (₱)<input type="number" min="0.01" step="0.01" value={compAmount} onChange={e=>setCompAmount(e.target.value)}/></label><div className="pc-field">{compType==="Daily"?"Monthly reference (× 26)":"Daily reference (÷ 26)"}<strong>{money((Number(compAmount)||0)*(compType==="Daily"?26:1/26))}</strong></div><label>Effective Date<input type="date" readOnly value={new Date().toISOString().slice(0,10)}/></label></div><label>Reason / Approval Reference<textarea rows={2} value={compReason} onChange={e=>setCompReason(e.target.value)}/></label>{compError&&<p role="alert" className="pay-subtle">{compError}</p>}<p className="muted">Same-day demo changes only. Past finalized payslips stay unchanged; future-dated salary approvals remain in Payroll Rate Management.</p><div className="rev-actions"><button type="button" className="secondary" onClick={()=>setEditingCompensation(false)}>Cancel</button><button type="button" className="primary" onClick={saveCompensation}>Save HR Rate</button></div></div>}
        <div className="emp201-dialog-subhead"><h4>Salary Received & Releases</h4><label className="emp201-period-select">Period <select value={salaryPeriod} onChange={e=>setSalaryPeriod(e.target.value as "month"|"year"|"all")}><option value="month">This Month</option><option value="year">This Year</option><option value="all">All Time</option></select></label></div>
        <div className="emp201-dialog-totals"><div><small>Net Salary Received</small><strong>{money(totals.net)}</strong></div><div><small>Gross Earnings</small><b>{money(totals.gross)}</b></div><div><small>Total Deductions</small><b>{money(totals.deductions)}</b></div></div>
        <div className="emp201-dialog-subhead"><h4>Released Payroll History ({paidSalary.length})</h4><div className="rev-actions"><button type="button" className="secondary" onClick={()=>goToDocuments("Payslips")}><FileText size={14}/> View Payslips</button>{onOpenPayroll&&<button type="button" className="secondary" onClick={()=>{setDetailKind(null);openPayRates()}}>View Pay Rates <ArrowRight size={14}/></button>}</div></div>
        {paidSalary.length?<div className="table-wrap"><table><thead><tr><th>Payroll Period</th><th>Paid On</th><th>Gross</th><th>Deductions</th><th>Net</th></tr></thead><tbody>{[...paidSalary].sort((a,b)=>b.paidAt.localeCompare(a.paidAt)).map(r=><tr key={r.id}><td>{formatDate(r.periodStart)} – {formatDate(r.periodEnd)}</td><td>{formatDate(r.paidAt)}</td><td>{money(r.gross)}</td><td>{money(r.deductions)}</td><td><b>{money(r.net)}</b></td></tr>)}</tbody></table></div>:<p className="muted">No released salary records for this period.</p>}
        <h4>Premium Pay Rates</h4><div className="emp201-dialog-facts">{[["Overtime",effectiveRate(person,data.rates).ot],["Rest Day",effectiveRate(person,data.rates).rdw],["Rest-Day OT",effectiveRate(person,data.rates).rdot],["Regular Holiday",effectiveRate(person,data.rates).regular],["Special Day",effectiveRate(person,data.rates).special]].map(([n,v])=><div key={n}><small>{n}</small><b>{v}%</b></div>)}</div><p className="muted">Sample browser payroll records only. Actual pay history and government deductions require backend integration.</p>
       </>}
       {detailKind==="reviews"&&<><h4>Performance Assessments</h4>{evaluations.length?evaluations.map((t,i)=><div className="emp201-dialog-entry" key={i}><ClipboardList size={16}/><span>{t}</span></div>):<p className="muted">No assessments recorded yet. Use Employee Actions → Record Assessment to add one.</p>}</>}
       {detailKind==="history"&&<><h4>Employment Timeline</h4>{person.timeline.map((t,i)=><div className="emp201-dialog-entry" key={i}><BriefcaseBusiness size={16}/><span>{t}</span></div>)}<div className="emp201-dialog-subhead"><h4>Assignment Memos</h4><button type="button" className="secondary" onClick={()=>{setDetailKind(null);setHistoryKind("role")}}>Open Assignment History <ArrowRight size={14}/></button></div></>}
       {detailKind==="assets"&&<><div className="emp201-dialog-facts"><div><small>Employment Status</small><b>{person.status}</b></div><div><small>Outstanding Devices</small><b>{assignedAssets.length}</b></div></div><h4>Assigned Asset Records</h4>{assignedAssets.length?assignedAssets.map(a=><div className="emp201-dialog-entry" key={a.id}><Laptop size={16}/><span><b>{a.name}</b><small>{a.id} · {a.status}</small></span></div>):<p className="muted">No outstanding assigned devices.</p>}{assignedAssets.length>0&&<p className="muted">Outstanding devices require retrieval and inspection before final clearance.</p>}{onAssignDevice&&person.status!=="Clearance Pending"&&<button type="button" className="secondary" onClick={()=>{setDetailKind(null);openAssetsForPerson()}}>Assign Device <ArrowRight size={14}/></button>}</>}
      </div>
     </section>
    </div>,document.body)}
    {historyKind&&createPortal(<div className="emp201-history-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setHistoryKind(null)}}>
      <section className="emp201-history-modal" role="dialog" aria-modal="true" aria-labelledby="emp201-history-title">
       <header><div><h3 id="emp201-history-title">{historyKind==="branch"?"Branch History":"Department & Position History"}</h3><p>{person.name} · {person.id}</p></div><button type="button" className="secondary" aria-label="Close assignment history" onClick={()=>setHistoryKind(null)}><X size={16}/> Close</button></header>
       <div className="emp201-history-current"><small>Current {historyKind==="branch"?"Branch":"Department & Position"}</small><b>{historyKind==="branch"?person.branch:`${person.department} — ${person.position}`}</b></div>
       <div className="emp201-history-scroll"><table><thead><tr><th>{historyKind==="branch"?"Branch":"Department & Position"}</th><th>Effective Date</th><th>Change</th><th>Memo</th></tr></thead><tbody>{[...assignmentHistory].sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)).map((h,i)=><tr key={h.id||i}>
        <td><b>{historyKind==="branch"?h.branch:h.department}</b>{historyKind==="role"&&<small>{h.position}</small>}{historyKind==="branch"&&<small>{h.department} · {h.position}</small>}</td>
        <td>{h.effectiveDate?formatDate(h.effectiveDate):"Not recorded"}</td><td>{h.kind}</td>
        <td>{h.memoId?<button type="button" className="emp201-memo-link" onClick={()=>{setHistoryKind(null);setTab("Documents");setRequestedMemo(h.memoId||null)}}><FileText size={14}/><span>{h.memoId}<small>{h.memoType||"Employment Memo"}</small></span></button>:<span className="emp201-no-memo">No memo attached</span>}</td>
       </tr>)}</tbody></table></div>
       <footer><span>Memo links open Employee 201 → Documents → Employment Memos. Older browser records may not include complete assignment history.</span></footer>
      </section>
     </div>,document.body)}
    {action&&<div className="rev-process">
     <div className="rev-title"><h3>{actionLabels[action]} — {person.name}</h3><button className="secondary" onClick={()=>setAction(null)}>Cancel</button></div>
     <div className="rev-steps">{stages[action].map((x,i)=><span key={x} className={i<=step?"active":""}>{i+1}. {x}</span>)}</div>
     <p><strong>Step {step+1}:</strong> {stages[action][step]}</p>
     {action==="Transfer"&&<div className="rev-form"><label>Receiving branch<select value={dest} onChange={e=>setDest(e.target.value as Shop)}>{shopNames.map(x=><option key={x}>{x}</option>)}</select></label><label>Assigned department<select value={newDepartment} onChange={e=>setNewDepartment(e.target.value)}>{departments.map(x=><option key={x}>{x}</option>)}</select></label><label>Assigned position<input value={newPosition} onChange={e=>setNewPosition(e.target.value)} required/></label></div>}
     {action==="Promote"&&<div className="rev-form"><label>New department<select value={newDepartment} onChange={e=>setNewDepartment(e.target.value)}>{departments.map(x=><option key={x}>{x}</option>)}</select></label><label>New position<input value={newPosition} onChange={e=>setNewPosition(e.target.value)}/></label><label>Approved basic rate<input type="number" min="1" value={newRate} onChange={e=>setNewRate(e.target.value)}/></label></div>}
     {(action==="Transfer"||action==="Promote")&&<label>Memo reference (if issued)<input maxLength={64} value={memoReference} placeholder="e.g. MEMO-2026-001" onChange={e=>setMemoReference(e.target.value)}/><small className="muted">Link the uploaded memo in Documents → Employment Memos using this reference.</small></label>}
     {action==="Offboard"&&<><label>Separation Type<select value={separationType} onChange={e=>setSeparationType(e.target.value)}><option>Resignation</option><option>Termination</option><option>Contract Completion</option><option>End of Project</option><option>Retirement</option></select></label><p className="rev-note">{assignedAssets.length} outstanding device(s). Final approval requires completed equipment retrieval and inspection. Termination decisions require appropriate documentation and authorized review.</p></>}
     <label>Effective date<input type="date" value={effective} onChange={e=>setEffective(e.target.value)}/></label>
     <label>Assessment, supporting reason or approval reference<textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain the decision and supporting information"/></label>
     {step===2&&<label>HR decision<select value={decision} onChange={e=>setDecision(e.target.value)}><option>Approved</option><option>Deferred</option><option>Declined</option></select></label>}
     {step===2&&<div className="rev-document"><h4>Decision Summary</h4><p>Action: {action}{action==="Offboard"?` — ${separationType}`:""} · Employee: {person.id}</p><p>Effective: {effective} · Decision: {decision}</p><p>Supporting reason: {reason||"Not provided"}</p><p className="muted">Browser-only review record. This is not a formal signed decision or production approval.</p></div>}
     <div className="rev-actions"><button className="secondary" onClick={()=>step===0?setAction(null):setStep(s=>s-1)}>Back</button><button className="primary" onClick={step===2?record:next}>{step===2?"Record Decision":"Continue"} <ArrowRight size={15}/></button></div>
    </div>}
   </section>
   {!action&&tab==="Profile"&&<section className="panel emp201-actions-surface">
     <div className="emp201-actions-area" id="emp201-actions">
      <div className="emp201-actions-header"><div><h4>Employee Actions</h4></div><HelpButton topic="workflow" label="About employee actions"/></div>
      <div className="emp201-action-grid">
       <button type="button" className="emp201-action-button" onClick={()=>startAction("Evaluate")} disabled={person.status==="Clearance Pending"}><ClipboardList size={18}/><span><b>Record Assessment</b><small>Performance evaluation</small></span><ArrowRight size={15}/></button>
       {person.status==="Probationary"&&<button type="button" className="emp201-action-button" onClick={()=>startAction("Regularize")}><ShieldCheck size={18}/><span><b>Regularize</b><small>Employment status</small></span><ArrowRight size={15}/></button>}
       <button type="button" className="emp201-action-button" onClick={()=>startAction("Promote")} disabled={person.status==="Clearance Pending"}><BriefcaseBusiness size={18}/><span><b>Promote</b><small>Position & compensation</small></span><ArrowRight size={15}/></button>
       <button type="button" className="emp201-action-button" onClick={()=>startAction("Transfer")} disabled={person.status==="Clearance Pending"}><ArrowRight size={18}/><span><b>Transfer</b><small>Branch reassignment</small></span><ArrowRight size={15}/></button>
       {onOpenPayroll&&<button type="button" className="emp201-action-button" onClick={openPayRates} disabled={person.status==="Clearance Pending"}><Wallet size={18}/><span><b>Adjust Pay Rate</b><small>Payroll rate review</small></span><ArrowRight size={15}/></button>}
       {onAssignDevice&&<button type="button" className="emp201-action-button" onClick={openAssetsForPerson} disabled={person.status==="Clearance Pending"}><Laptop size={18}/><span><b>Assign Device</b><small>Accountability & turnover</small></span><ArrowRight size={15}/></button>}
      </div>
      <div className="emp201-offboarding"><div><h5>End Employment</h5><span>Resignation, termination, or contract completion</span></div><button type="button" className="emp201-offboard-button" disabled={person.status==="Clearance Pending"} onClick={()=>startAction("Offboard")}>Process Offboarding <ArrowRight size={15}/></button></div>
     </div>

   </section>}
  </>}
 </div>;
}
