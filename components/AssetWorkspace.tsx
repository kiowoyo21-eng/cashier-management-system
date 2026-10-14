"use client";

import {useEffect,useMemo,useRef,useState,type FormEvent,type PointerEvent} from "react";
import {Laptop,Plus,ArrowLeft,ArrowRight,FileSignature,ClipboardCheck,FileText,Info,RotateCcw} from "lucide-react";
import type {Branch,Role} from "../lib/mock";
import {useHR,type AssetRecord,type AssetStatus} from "../lib/hrState";
import HelpButton from "./HelpButton";
import {ModuleAlertButton} from "./ModuleAlerts";
import {printHRDocument} from "../lib/printDocument";

type Process="assign"|"retrieve"|"inspect";
type SignMethod="phone"|"onsite"|"print";
const processSteps:Record<Process,string[]>={
 assign:["Assignment Details","Accountability Form","Turnover Confirmation"],
 retrieve:["Accountable Employee","Return Condition","Return Acknowledgment","Confirm Retrieval"],
 inspect:["Device Condition","Inspection Findings","Inventory Status","Confirm Inspection"]
};
const methodName:Record<SignMethod,string>={phone:"Phone / QR Code",onsite:"Sign on This Device",print:"Printed Form"};
const today=()=>new Date().toISOString().slice(0,10);
const ACCOUNTABILITY_TERMS="I acknowledge receipt of the company-issued equipment and listed accessories in the stated condition. I understand my responsibility to exercise reasonable care, use the equipment in accordance with company policies, promptly report any damage or loss, and return company property when requested. This form documents accountability and does not establish automatic financial liability for loss or damage.";

function SignaturePad({onChange}:{onChange:(signed:boolean)=>void}){
 const canvas=useRef<HTMLCanvasElement|null>(null);
 const drawing=useRef(false);
 const coords=(e:PointerEvent<HTMLCanvasElement>)=>{const el=e.currentTarget,b=el.getBoundingClientRect();return {x:(e.clientX-b.left)*el.width/b.width,y:(e.clientY-b.top)*el.height/b.height}};
 const down=(e:PointerEvent<HTMLCanvasElement>)=>{const el=e.currentTarget,ctx=el.getContext("2d");if(!ctx)return;drawing.current=true;el.setPointerCapture(e.pointerId);const p=coords(e);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineWidth=2.8;ctx.lineCap="round";ctx.strokeStyle="#243142"};
 const move=(e:PointerEvent<HTMLCanvasElement>)=>{if(!drawing.current)return;const ctx=e.currentTarget.getContext("2d");if(!ctx)return;const p=coords(e);ctx.lineTo(p.x,p.y);ctx.stroke()};
 const end=()=>{if(drawing.current){drawing.current=false;onChange(true)}};
 return <div className="acc-signature"><canvas ref={canvas} width={800} height={190} aria-label="Employee signature drawing area" onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end}/><div className="acc-signature-footer"><small>Employee signature — frontend review capture only; not a verified electronic signature.</small><button type="button" className="secondary" onClick={()=>{const c=canvas.current;c?.getContext("2d")?.clearRect(0,0,c.width,c.height);onChange(false)}}><RotateCcw size={13}/> Clear</button></div></div>
}

export default function AssetWorkspace({branch,role,prefillEmployeeId}:{branch:Branch;role:Role;prefillEmployeeId?:string}){
 const {data,update}=useHR();
 const assets=data.assets,people=data.people;
 const editable=role==="HR"||role==="Super Admin";
 const setAssets=(change:(prev:AssetRecord[])=>AssetRecord[])=>update(s=>({...s,assets:change(s.assets)}));
 const [search,setSearch]=useState("");
 const [filter,setFilter]=useState<AssetStatus|"All">("All");
 const [branchFilter,setBranchFilter]=useState<string>("All");
 const [selected,setSelected]=useState<string|null>(null);
 const [process,setProcess]=useState<Process|null>(null);
 const [stage,setStage]=useState(0);
 const [employeeId,setEmployeeId]=useState("");
 const [employeeSearch,setEmployeeSearch]=useState("");
 const [condition,setCondition]=useState("Good");
 const [accessories,setAccessories]=useState("");
 const [notes,setNotes]=useState("");
 const [assignmentDate,setAssignmentDate]=useState(today());
 const [signMethod,setSignMethod]=useState<SignMethod>("phone");
 const [documentPreview,setDocumentPreview]=useState(false);
 const [signatureDrawn,setSignatureDrawn]=useState(false);
 const [signedCopy,setSignedCopy]=useState<File|null>(null);
 const [officer,setOfficer]=useState("");
 const [handedOver,setHandedOver]=useState(false);
 const [reviewed,setReviewed]=useState(false);
 const [outcome,setOutcome]=useState<"Free"|"Maintenance"|"Retired">("Free");
 const [message,setMessage]=useState("");
 const [adding,setAdding]=useState(false);
 const [newDevice,setNewDevice]=useState<{name:string;serial:string;condition:string;accessories:string;homeBranch:string}>({name:"",serial:"",condition:"Good",accessories:"",homeBranch:branch==="All Shops"?"UC Mandaluyong":branch});
 useEffect(()=>{if(!prefillEmployeeId||!editable)return;const found=people.find(p=>p.id===prefillEmployeeId);if(!found)return;setEmployeeId(found.id);setProcess(null);setSelected(null);setAdding(false);setFilter("Free");setSearch("");setBranchFilter(found.branch);setMessage(`Assign Device · ${found.name} preselected. Choose an available device from the list.`)},[prefillEmployeeId,editable]);
 const asset=assets.find(a=>a.id===selected);
 const employee=people.find(p=>p.id===employeeId);
 const visibleAssets=useMemo(()=>assets.filter(a=>(filter==="All"||a.status===filter)&&(branchFilter==="All"||(a.homeBranch||people.find(p=>p.id===a.employeeId)?.branch||"")===branchFilter)&&(branch==="All Shops"||(a.homeBranch||people.find(p=>p.id===a.employeeId)?.branch||"")===branch)&&`${a.id} ${a.name} ${a.serial} ${people.find(p=>p.id===a.employeeId)?.name||""}`.toLowerCase().includes(search.toLowerCase())),[assets,people,filter,search,branchFilter,branch]);
 const employeeMatches=people.filter(p=>(branch==="All Shops"||p.branch===branch)&&`${p.id} ${p.name}`.toLowerCase().includes(employeeSearch.toLowerCase()));
 const scopedAssets=assets.filter(a=>branch==="All Shops"||(a.homeBranch||people.find(p=>p.id===a.employeeId)?.branch||"")===branch);
 const count=(status:AssetStatus)=>scopedAssets.filter(a=>a.status===status).length;
 const resetProcess=()=>{setProcess(null);setSelected(null);setStage(0);setMessage("")};
 const begin=(id:string,type:Process)=>{
  const a=assets.find(x=>x.id===id);
  if(!a||!editable)return;
  if(type==="assign"&&a.status!=="Free"&&a.status!=="Pending Turnover")return;
  if(type==="retrieve"&&a.status!=="Assigned")return;
  if(type==="inspect"&&a.status!=="Inspection")return;
  setSelected(id);setProcess(type);setStage(a.status==="Pending Turnover"&&type==="assign"?1:0);
  setEmployeeId(a.employeeId||prefillEmployeeId||"");setEmployeeSearch("");setCondition(a.condition);setAccessories(a.accessories);
  setNotes(a.notes||"");setAssignmentDate(a.assignmentDate||today());setSignMethod(a.signingMethod||"phone");
  setDocumentPreview(false);setSignatureDrawn(false);setSignedCopy(null);setOfficer(a.assignedBy||"");setHandedOver(false);setReviewed(false);setMessage("");
 };
 const editSelected=(fields:Partial<AssetRecord>)=>setAssets(prev=>prev.map(x=>x.id===selected?{...x,...fields}:x));
 const addDevice=(e:FormEvent)=>{
  e.preventDefault();if(!editable)return;
  if(branch!=="All Shops"&&newDevice.homeBranch!==branch){setMessage("Device branch must match your selected authorized branch.");return}
  const serial=newDevice.serial.trim();if(assets.some(a=>a.serial.trim().toLowerCase()===serial.toLowerCase())){setMessage("Serial number already exists. Please enter a unique serial number.");return}
  setAssets(prev=>[{id:`AST-${1+Math.max(1000,...prev.map(a=>Number(a.id.replace(/\D/g,""))||0))}`,name:newDevice.name.trim(),homeBranch:newDevice.homeBranch,serial,status:"Free",employeeId:"",condition:newDevice.condition,accessories:newDevice.accessories,notes:"",history:[`${today()}: Device registered`],date:today(),signed:false},...prev]);
  setNewDevice({name:"",serial:"",condition:"Good",accessories:"",homeBranch:branch==="All Shops"?"UC Mandaluyong":branch});setFilter("All");setAdding(false);setMessage("Device added to available inventory in this browser.")
 };
 const formFields=():[string,unknown][]=>[
  ["Accountable employee",employee?.name||"Not selected"],["Employee number",employee?.id||""],
  ["Current branch (reference only)",employee?.branch||""],["Asset ID",asset?.id||""],
  ["Device / Model",asset?.name||""],["Serial number",asset?.serial||""],
  ["Device condition",condition],["Included accessories",accessories||"None recorded"],
  ["Assignment date",assignmentDate],["Issuing officer",officer||"To be completed during turnover"]
 ];
 const printForm=()=>printHRDocument("Device Accountability & Turnover Form",formFields(),ACCOUNTABILITY_TERMS,["Accountable Employee","Authorized Issuing Officer"]);
 const next=()=>{
  if(!asset||!process)return;
  if(process==="assign"){
   if(stage===0&&!employeeId){setMessage("Select a specific employee before continuing.");return}
   if(stage===0&&!assignmentDate){setMessage("Enter the assignment date.");return}
   setMessage("");setStage(s=>Math.min(s+1,2));return;
  }
  if(stage===2&&!reviewed){setMessage("Review the form or inspection findings before continuing.");return}
  setMessage("");setStage(s=>Math.min(s+1,3));
 };
 const recordAssignment=(complete:boolean)=>{
  if(!asset||!employeeId)return;
  if(complete&&(!handedOver||!officer.trim()||(signMethod==="onsite"&&!signatureDrawn)||(signMethod==="print"&&!signedCopy)||signMethod==="phone")){
   setMessage("To complete turnover, choose on-device or printed signing, record the acknowledgment, enter the issuing officer, and confirm physical handover. Phone/QR signing remains pending without a backend.");return;
  }
  const status:AssetStatus=complete?"Assigned":"Pending Turnover";
  editSelected({status,employeeId,condition,accessories,notes,date:today(),assignmentDate,signingMethod:signMethod,assignedBy:officer.trim(),signatureEvidence:complete?(signMethod==="print"?signedCopy?.name:"On-device signature (temporary)"):"",signed:complete,history:[`${today()}: ${complete?"Local turnover review completed":"Accountability form prepared; awaiting verified turnover"} — ${employee?.name||employeeId}. Method: ${methodName[signMethod]}; Officer: ${officer||"Pending"}`,...asset.history]});
  setFilter(status);setProcess(null);setSelected(null);setStage(0);
  setMessage(complete?"Turnover recorded for frontend review. Signature/file data is NOT saved or verified; do not use for real asset release.":"Saved as Pending Turnover. Device stays unavailable for reassignment until signature and handover are completed.");
 };
 const completeOther=()=>{
  if(!asset||!process)return;
  const status:AssetStatus=process==="retrieve"?"Inspection":outcome;
  editSelected({status,condition,accessories,notes,date:today(),employeeId:process==="inspect"&&outcome==="Free"?"":asset.employeeId,history:[`${today()}: ${process==="retrieve"?"Retrieved for inspection":"Inspection completed — "+outcome}. ${notes}`,...asset.history]});
  setFilter(status);setProcess(null);setSelected(null);setStage(0);setMessage("Record updated in this browser for review. Physical receipt and signatures require verification.");
 };
 const canConfirmAssignment=Boolean(employeeId&&officer.trim()&&handedOver&&(signMethod==="onsite"&&signatureDrawn||signMethod==="print"&&signedCopy));
 return <div className="rev-stack">
  <div className="rev-title mu-section-head"><div><h3>Device Inventory</h3><small className="mu-compact-sub">{assets.length} devices · {assets.filter(a=>a.status==="Pending Turnover").length} pending turnover</small></div><div className="rev-actions"><ModuleAlertButton module="assets" branch={branch} onOpen={a=>setSelected(a.id.replace("asset-",""))}/><HelpButton topic="asset" label="Info"/>{editable&&<button className="primary" type="button" onClick={()=>{setAdding(true);resetProcess()}}><Plus size={16}/> Add Device</button>}</div></div>
  {message&&<div className="rev-note" role="status">{message}</div>}
  {adding&&<section className="panel"><div className="rev-title"><h3>Add Device</h3><button className="secondary" onClick={()=>setAdding(false)}>Cancel</button></div><form className="rev-form" onSubmit={addDevice}><label>Device name<input required value={newDevice.name} onChange={e=>setNewDevice(x=>({...x,name:e.target.value}))}/></label><label>Unique serial number<input required value={newDevice.serial} onChange={e=>setNewDevice(x=>({...x,serial:e.target.value}))}/></label><label>Registered Branch<select value={newDevice.homeBranch} onChange={e=>setNewDevice(x=>({...x,homeBranch:e.target.value}))}>{(["UC Mandaluyong","UC Las Piñas","UC Quezon City","MM Mandaluyong"] as const).filter(x=>branch==="All Shops"||x===branch).map(x=><option key={x} value={x}>{x}</option>)}</select></label><label>Initial condition<select value={newDevice.condition} onChange={e=>setNewDevice(x=>({...x,condition:e.target.value}))}>{["New","Good","Used","Damaged"].map(x=><option key={x}>{x}</option>)}</select></label><label>Included accessories<input value={newDevice.accessories} onChange={e=>setNewDevice(x=>({...x,accessories:e.target.value}))}/></label><button className="primary" type="submit">Save Device</button></form></section>}
  {!process&&<>
   <div className="rev-pills">{(["Free","Pending Turnover","Assigned","For Return","Inspection","Maintenance","Retired","All"] as const).map(s=><button type="button" key={s} className={filter===s?"active":""} onClick={()=>{setFilter(filter===s?"All":s);setSelected(null)}} aria-pressed={filter===s}>{s==="Free"?"Available":s} ({s==="All"?scopedAssets.length:count(s)})</button>)}</div>
   <section className="panel"><div className="rev-filters mu-filterbar"><label>Find device<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Device, serial, employee..."/></label><label>Branch<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="All">All Branches</option>{(["UC Mandaluyong","UC Las Piñas","UC Quezon City","MM Mandaluyong"] as const).filter(x=>branch==="All Shops"||x===branch).map(x=><option key={x} value={x}>{x}</option>)}</select></label></div>
    <div className="table-wrap"><table><thead><tr><th>Device / Serial</th><th>Branch / Location</th><th>Accountable Employee</th><th>Condition</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visibleAssets.map(a=><tr key={a.id}><td><b>{a.name}</b><small className="pay-small">{a.id} · {a.serial}</small></td><td>{a.homeBranch||people.find(p=>p.id===a.employeeId)?.branch||"Not set"}</td><td>{a.employeeId?people.find(p=>p.id===a.employeeId)?.name||a.employeeId:"Not assigned"}</td><td>{a.condition}</td><td><span className="tag">{a.status==="Free"?"Available":a.status}</span></td><td><div className="rev-actions">
    {a.status==="Free"&&editable&&<button className="primary" type="button" onClick={()=>begin(a.id,"assign")}>Assign</button>}
    {a.status==="Pending Turnover"&&<><button className="secondary" onClick={()=>setSelected(a.id)}>View</button>{editable&&<button className="primary" onClick={()=>begin(a.id,"assign")}>Continue Turnover</button>}</>}
    {a.status==="Assigned"&&<><button className="secondary" onClick={()=>setSelected(a.id)}>View</button>{editable&&<button className="secondary" onClick={()=>begin(a.id,"retrieve")}>Retrieve</button>}</>}
    {a.status==="Inspection"&&editable&&<button className="primary" onClick={()=>begin(a.id,"inspect")}>Inspect</button>}
    {!(["Free","Pending Turnover","Assigned","Inspection"] as string[]).includes(a.status)&&<button className="secondary" onClick={()=>setSelected(a.id)}>View</button>}
    </div></td></tr>)}</tbody></table>{visibleAssets.length===0&&<div className="empty">No devices found. Try another status or search.</div>}</div></section>
   {asset&&<section className="panel"><div className="rev-title"><h3>{asset.name} · Assignment History</h3><button className="secondary" onClick={()=>setSelected(null)}>Close</button></div><p>Registered branch: {asset.homeBranch||people.find(x=>x.id===asset.employeeId)?.branch||"Not set"} · Accountable employee: {people.find(x=>x.id===asset.employeeId)?.name||"Unassigned"} · Status: {asset.status} · Signing: {asset.signingMethod?methodName[asset.signingMethod]:"Not recorded"}</p><p className="muted">Acknowledgment records in this frontend are review-only; no signed file is stored.</p>{asset.history.map((h,i)=><div className="rev-row" key={i}>{h}</div>)}</section>}
  </>}
  {asset&&process&&<section className="panel acc-process"><div className="rev-title"><div><h3>{process==="assign"?"Assign Device":process==="retrieve"?"Retrieve Device":"Inspect Returned Device"}</h3><p>{asset.name} · {asset.id} · {asset.serial}</p></div><HelpButton topic="asset" label="Procedure guide"/></div>
   <div className="rev-steps acc-steps" style={{gridTemplateColumns:`repeat(${processSteps[process].length},minmax(0,1fr))`}}>{processSteps[process].map((t,i)=><span key={t} className={i<=stage?"active":""}>{i+1}. {t}</span>)}</div>
   <p className="acc-step-title"><strong>Step {stage+1} of {processSteps[process].length}:</strong> {processSteps[process][stage]}</p>
   {process==="assign"&&stage===0&&<div className="acc-stack">
    <div className="acc-section-title"><h4>Accountable Employee</h4><small>Select one employee who will receive this device.</small></div>
    <label className="rev-field">Search employee<input value={employeeSearch} onChange={e=>setEmployeeSearch(e.target.value)} placeholder="Name or employee number"/></label>
    <div className="rev-employee-options">{employeeMatches.map(p=><button type="button" key={p.id} className={employeeId===p.id?"selected":""} onClick={()=>setEmployeeId(p.id)}><b>{p.name}</b><small>{p.id} · {p.branch}</small></button>)}</div>
    {employeeMatches.length===0&&<div className="empty">No matching employees in your authorized scope.</div>}
    <div className="acc-selection">Selected: <strong>{employee?.name||"No employee selected"}</strong> {employee&&<span>({employee.id})</span>}</div>
    <div className="acc-section-title"><h4>Equipment Details</h4><small>Confirm the condition and included accessories before preparing the form.</small></div>
    <div className="acc-two-col"><label>Assignment date<input type="date" value={assignmentDate} onChange={e=>setAssignmentDate(e.target.value)}/></label><label>Device condition<select value={condition} onChange={e=>setCondition(e.target.value)}>{["New","Good","Used","Damaged"].map(x=><option key={x}>{x}</option>)}</select></label></div>
    <label>Included accessories<input value={accessories} onChange={e=>setAccessories(e.target.value)} placeholder="Charger, carrying case, adapter..."/></label>
    <label>Notes (optional)<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Record any existing scratches or accessories to check during turnover."/></label>
   </div>}
   {process==="assign"&&stage===1&&<div className="acc-stack">
    <div className="acc-section-title"><h4><FileSignature size={18}/> Accountability Form</h4><small>Prepared from the employee and device information entered in Step 1. No need to encode it again.</small><HelpButton topic="asset" label="What is accountability?"/></div>
    <div className="acc-facts">{formFields().filter(([name])=>name!=="Issuing officer").map(([name,val])=><div key={name}><span>{name}</span><strong>{String(val||"—")}</strong></div>)}</div>
    <button type="button" className="secondary" onClick={()=>setDocumentPreview(p=>!p)}><FileText size={16}/> {documentPreview?"Hide Document Preview":"Preview Accountability Form"}</button>
    {documentPreview&&<div className="acc-paper"><header><strong>UNDERCHARGERS</strong><small>HR MANAGEMENT · DEVICE ACCOUNTABILITY</small><h4>Device Accountability & Turnover Form</h4></header><div className="acc-paper-facts">{formFields().filter(([name])=>name!=="Issuing officer").map(([name,val])=><div key={name}><b>{name}</b><span>{String(val||"—")}</span></div>)}</div><p>{ACCOUNTABILITY_TERMS}</p><div className="acc-signature-lines"><div>________________________<small>Accountable Employee · Signature / Date</small></div><div>________________________<small>Authorized Officer · Signature / Date</small></div></div><footer>Print-ready review copy. Identity, signature and release must be verified.</footer></div>}
    <button type="button" className="secondary" onClick={printForm}>Print / Save Accountability Form as PDF</button>
    <h4>How will the employee sign?</h4>
    <div className="acc-methods">
     <label className={signMethod==="phone"?"active":""}><input type="radio" name="assetSigning" checked={signMethod==="phone"} onChange={()=>{setSignMethod("phone");setSignatureDrawn(false);setSignedCopy(null)}}/><span><b>Phone / QR Code</b><small>One secure signing request for this employee and document. Available after backend integration.</small></span></label>
     <label className={signMethod==="onsite"?"active":""}><input type="radio" name="assetSigning" checked={signMethod==="onsite"} onChange={()=>{setSignMethod("onsite");setSignedCopy(null);setSignatureDrawn(false)}}/><span><b>Sign on This Device</b><small>Draw a signature for the browser-only workflow preview.</small></span></label>
     <label className={signMethod==="print"?"active":""}><input type="radio" name="assetSigning" checked={signMethod==="print"} onChange={()=>{setSignMethod("print");setSignatureDrawn(false)}}/><span><b>Print for Physical Signature</b><small>Print the form; record the signed copy when handing over the device.</small></span></label>
    </div>
    {signMethod==="phone"&&<div className="rev-note"><Info size={16}/> QR/signing links are not active yet. Continue to save this assignment as <strong>Pending Turnover</strong>.</div>}
    {signMethod==="onsite"&&<><p className="muted">Employee signature — for interaction testing only. A legally verifiable signature service requires backend identity checks and audit history.</p><SignaturePad key={employeeId} onChange={setSignatureDrawn}/></>}
    {signMethod==="print"&&<p className="muted">The printed form must be signed before equipment release. A signed-file selection is requested in the next step.</p>}
   </div>}
   {process==="assign"&&stage===2&&<div className="acc-stack">
    <div className="acc-section-title"><h4><ClipboardCheck size={18}/> Turnover Confirmation</h4><small>Review accountability and physical handover. If any requirement is missing, save the device as Pending Turnover.</small></div>
    <div className="acc-facts"><div><span>Employee</span><strong>{employee?.name||"—"} · {employee?.id||""}</strong></div><div><span>Device</span><strong>{asset.name} · {asset.serial}</strong></div><div><span>Condition</span><strong>{condition}</strong></div><div><span>Signing method</span><strong>{methodName[signMethod]}</strong></div></div>
    <label>Issuing / authorized officer *<input value={officer} onChange={e=>setOfficer(e.target.value)} placeholder="Name of staff confirming the handover"/></label>
    {signMethod==="print"&&<label>Signed accountability form (PDF, JPG or PNG) *<input className="acc-upload" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e=>{const f=e.target.files?.[0]||null;if(f&&f.size>10*1024*1024){setMessage("File must be 10 MB or smaller.");setSignedCopy(null)}else{setMessage("");setSignedCopy(f)}}}/><small className="muted">This frontend remembers only the selected filename. File bytes are NOT uploaded or permanently saved.</small></label>}
    {signMethod==="onsite"&&<div className="rev-note">{signatureDrawn?"A drawn signature is present for this browser session. It is not identity-verified or archived.":"No signature drawn yet. Return to Accountability Form to sign."}</div>}
    {signMethod==="phone"&&<div className="rev-note">Individual link/QR signing is pending backend implementation; this device cannot be marked Assigned through that route yet.</div>}
    <label className="rev-check"><input type="checkbox" checked={handedOver} onChange={e=>setHandedOver(e.target.checked)}/> I confirm physical handover to the selected employee has been reviewed. (Frontend record only)</label>
    <div className="acc-footer-note"><Info size={17}/><span>This preview does not transmit, store or verify signed forms. For a real company turnover, verify the signed document and physical handover outside this prototype.</span></div>
    <div className="rev-actions"><button className="secondary" type="button" onClick={()=>recordAssignment(false)}>Save Pending Turnover</button><button className="primary" type="button" disabled={!canConfirmAssignment} onClick={()=>recordAssignment(true)}>Complete Turnover (Local Preview)</button></div>
   </div>}
   {process!=="assign"&&<>
    {stage===0&&<p>Current accountable employee: <strong>{employee?.name||"Not recorded"}</strong> ({employee?.id||""})</p>}
    {(stage===1||stage===0&&process==="inspect")&&<div className="acc-two-col"><label>Device condition<select value={condition} onChange={e=>setCondition(e.target.value)}>{["New","Good","Used","For Inspection","Damaged"].map(x=><option key={x}>{x}</option>)}</select></label><label>Accessories returned<input value={accessories} onChange={e=>setAccessories(e.target.value)}/></label><label>Notes<textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)}/></label></div>}
    {stage===2&&process==="retrieve"&&<div className="rev-document"><h4>Device Return Acknowledgment</h4><p>Employee: {employee?.name||"—"} · Device: {asset.name} · Condition: {condition}</p><button className="secondary" type="button" onClick={()=>printHRDocument("Device Return Acknowledgment",formFields(),notes||"Employee has returned the described equipment and accessories for inspection.",["Returning Employee","Receiving Officer"])}>Preview / Print Return Document</button><label className="rev-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> Return form reviewed for preparation (not signed or verified)</label></div>}
    {stage===2&&process==="inspect"&&<div className="rev-document"><label>Inspection outcome<select value={outcome} onChange={e=>setOutcome(e.target.value as typeof outcome)}><option>Free</option><option>Maintenance</option><option>Retired</option></select></label><label className="rev-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I reviewed the inspection findings and status.</label></div>}
    {stage===3&&<div className="rev-document"><h4>Review & Confirm</h4><p>{asset.name} · Employee: {employee?.name||"—"}</p><p>Condition: {condition} · Next status: {process==="retrieve"?"Inspection":outcome}</p><button className="primary" onClick={completeOther}>Confirm {process==="retrieve"?"Retrieval":"Inspection"} (Local Preview)</button></div>}
   </>}
   <div className="rev-actions acc-nav"><button className="secondary" type="button" onClick={()=>{if(stage===0)resetProcess();else {if(process==="assign"&&stage===2&&signMethod==="onsite")setSignatureDrawn(false);setStage(x=>x-1);setMessage("")}}}><ArrowLeft size={15}/> Back</button>{!(process==="assign"&&stage===2)&&!(process!=="assign"&&stage===3)&&<button className="primary" type="button" onClick={next}>Continue <ArrowRight size={15}/></button>}<button className="secondary" type="button" onClick={resetProcess}>Cancel</button></div>
  </section>}
 </div>;
}
