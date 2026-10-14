"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {ArrowLeft,ArrowRight,ChevronLeft,ChevronRight,FileText,FolderOpen,Maximize2,Upload,X} from "lucide-react";
import type {HRPerson,PayrollRelease,Submission} from "../lib/hrState";
import {money} from "../lib/hrState";

export type LocalEmployeeFile={id:string;name:string;folder:FolderName;file:File;memoId?:string};
type FolderName="Onboarding Files"|"Compliance & Other Forms"|"NOV / NTE"|"Employment Memos"|"Payslips";
const folders:FolderName[]=["Onboarding Files","Compliance & Other Forms","NOV / NTE","Employment Memos","Payslips"];
type PreviewItem={key:string;name:string;status:string;kind:"metadata"|"upload"|"payslip";file?:File;release?:PayrollRelease};
const datePH=(s:string)=>new Date(`${s}T00:00:00`).toLocaleDateString("en-PH",{year:"numeric",month:"short",day:"numeric"});
const folderFor=(name:string):FolderName=>/memo|promotion|transfer|reassignment/i.test(name)?"Employment Memos":/\b(NTE|NOV|notice|disciplin|explanation|decision)\b/i.test(name)?"NOV / NTE":/government|sss|philhealth|pag-ibig|bir|compliance|form/i.test(name)?"Compliance & Other Forms":"Onboarding Files";
const isSupported=(file:File)=>file.type==="application/pdf"||file.type.startsWith("image/");

function DocumentPreview({item,page}:{item:PreviewItem;page:number}){
 const [url,setUrl]=useState("");
 useEffect(()=>{if(!item.file||!isSupported(item.file)){setUrl("");return}const nextUrl=URL.createObjectURL(item.file);setUrl(nextUrl);return ()=>URL.revokeObjectURL(nextUrl)},[item.file]);
 if(item.kind==="payslip"&&item.release){
  const p=item.release;
  return <div className="empdoc-paper"><div className="empdoc-paper-brand">UNDERCHARGERS <small>PAYSLIP · SAMPLE RECORD</small></div>
   {page===1?<><h4>Payroll Earnings</h4><div className="empdoc-paper-line"><span>Employee ID</span><b>{p.employeeId}</b></div><div className="empdoc-paper-line"><span>Payroll period</span><b>{datePH(p.periodStart)} – {datePH(p.periodEnd)}</b></div><div className="empdoc-paper-line"><span>Release date</span><b>{datePH(p.paidAt)}</b></div><div className="empdoc-paper-line"><span>Gross earnings</span><b>{money(p.gross)}</b></div><div className="empdoc-paper-line"><span>Payment category</span><b>{p.kind}</b></div></>:<><h4>Payroll Deductions & Net Pay</h4><div className="empdoc-paper-line"><span>Gross earnings</span><b>{money(p.gross)}</b></div><div className="empdoc-paper-line"><span>Total deductions</span><b>{money(p.deductions)}</b></div><div className="empdoc-paper-line empdoc-net"><span>Net salary released</span><b>{money(p.net)}</b></div><p className="empdoc-footnote">Individual deduction breakdown is not available in this fictional release ledger. Do not treat the sample amount as an official issued payslip.</p></>}
   <div className="empdoc-paper-footer">FRONTEND SAMPLE · Not an official issued payslip</div>
  </div>;
 }
 if(item.file&&url){return item.file.type==="application/pdf"?<iframe key={`${url}-${page}`} className="empdoc-pdf" title={item.name} src={`${url}#page=${page}&view=FitH`}/>:<img className="empdoc-image" alt={item.name} src={url}/>}
 if(item.file)return <div className="empdoc-unavailable"><FileText size={30}/><strong>Preview not available</strong><span>Open the file using a compatible application.</span></div>;
 return <div className="empdoc-unavailable"><FileText size={32}/><strong>No document file attached</strong><span>“{item.name}” is an employee checklist record, not an uploaded file. Upload a PDF or image to preview it.</span></div>;
}

export default function EmployeeDocumentLibrary({person,releases,submissions,uploads,onUpload,requestedMemo,onMemoHandled,requestedFolder,onFolderHandled}:{person:HRPerson;releases:PayrollRelease[];submissions:Submission[];uploads:LocalEmployeeFile[];onUpload:(folder:FolderName,file:File,memoId?:string)=>string;requestedMemo?:string|null;onMemoHandled?:()=>void;requestedFolder?:"Onboarding Files"|"Payslips"|null;onFolderHandled?:()=>void}){
 const [folder,setFolder]=useState<FolderName>("Onboarding Files"),[selectedKey,setSelectedKey]=useState(""),[page,setPage]=useState(1),[full,setFull]=useState(false),[error,setError]=useState("");
 const [uploadFolder,setUploadFolder]=useState<FolderName>("Onboarding Files");
 const [paperSize,setPaperSize]=useState<"A4"|"Letter">("A4");
 const [pdfPages,setPdfPages]=useState<number|null>(null);
 const [uploadMemoId,setUploadMemoId]=useState("");
 const fullCloseRef=useRef<HTMLButtonElement>(null);
 const memoRefs=[...new Set((person.assignmentHistory||[]).map(h=>h.memoId).filter((m):m is string=>Boolean(m)))];
 useEffect(()=>{if(!requestedMemo)return;setFolder("Employment Memos");setUploadFolder("Employment Memos");setSelectedKey(`memo-${requestedMemo}`);setUploadMemoId(requestedMemo);setPage(1);setFull(false);onMemoHandled?.()},[requestedMemo,onMemoHandled]);
 useEffect(()=>{if(!requestedFolder)return;setFolder(requestedFolder);setUploadFolder(requestedFolder);setSelectedKey("");setPage(1);setFull(false);onFolderHandled?.()},[requestedFolder,onFolderHandled]);
 useEffect(()=>{if(!full)return;const before=document.body.style.overflow;document.body.style.overflow="hidden";fullCloseRef.current?.focus();const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")setFull(false)};window.addEventListener("keydown",onKey);return ()=>{document.body.style.overflow=before;window.removeEventListener("keydown",onKey)}},[full]);
 const allItems=useMemo(()=>{
  const files:Record<FolderName,PreviewItem[]>={"Onboarding Files":[],"Compliance & Other Forms":[],"NOV / NTE":[],"Employment Memos":[],"Payslips":[]};
  person.documents.forEach((d,i)=>files[folderFor(d.name)].push({key:`required-${i}-${d.name}`,name:d.fileName?`${d.name} · ${d.fileName}`:d.name,status:d.status,kind:"metadata"}));
  submissions.filter(s=>s.employeeId===person.id).forEach(s=>files[folderFor(s.type)].push({key:`submitted-${s.id}`,name:`${s.type} · ${s.fileName}`,status:s.status,kind:"metadata"}));
  const assignedMemoFiles=new Set<string>();
  (person.assignmentHistory||[]).filter(h=>Boolean(h.memoId)).forEach(h=>{
   const matching=[...uploads].reverse().find(f=>f.folder==="Employment Memos"&&f.memoId?.toUpperCase()===h.memoId?.toUpperCase());
   if(matching)assignedMemoFiles.add(matching.id);
   files["Employment Memos"].push({key:`memo-${h.memoId}`,name:`${h.memoId} · ${h.memoType||"Employment Memo"}`,status:matching?"Attached file (session only)":"No file attached",kind:matching?"upload":"metadata",file:matching?.file});
  });
  uploads.forEach(f=>{if(!assignedMemoFiles.has(f.id))files[f.folder].push({key:`upload-${f.id}`,name:f.name,status:"Session file",kind:"upload",file:f.file})});
  releases.filter(r=>r.employeeId===person.id&&r.status==="Released").sort((a,b)=>b.paidAt.localeCompare(a.paidAt)).forEach(r=>files.Payslips.push({key:`payslip-${r.id}`,name:`${r.kind} · ${datePH(r.periodEnd)}`,status:r.source==="Sample"?"Sample Release":"Browser Review",kind:"payslip",release:r}));
  return files;
 },[person,submissions,uploads,releases]);
 const items=allItems[folder];
 const current=items.find(x=>x.key===selectedKey)||items[0];
 const itemIndex=current?items.findIndex(x=>x.key===current.key):-1;
 useEffect(()=>{const file=current?.file;if(!file||file.type!=="application/pdf"){setPdfPages(null);return}let ignore=false;
  void file.arrayBuffer().then(buf=>{if(ignore)return;const text=new TextDecoder("iso-8859-1").decode(buf);const pageCount=(text.match(/\/Type\s*\/Page\b/g)||[]).length;setPdfPages(pageCount>0&&pageCount<2000?pageCount:null)}).catch(()=>{if(!ignore)setPdfPages(null)});
  return ()=>{ignore=true};
 },[current?.key,current?.file]);
 const maxPage=current?.kind==="payslip"?2:current?.file?.type==="application/pdf"?pdfPages||undefined:1;
 const choose=(name:FolderName)=>{setFolder(name);setUploadFolder(name);setSelectedKey("");setPage(1);setFull(false);setError("")};
 const previousFile=()=>{const i=Math.max(0,itemIndex-1);setSelectedKey(items[i].key);setPage(1)};
 const nextFile=()=>{const i=Math.min(items.length-1,itemIndex+1);setSelectedKey(items[i].key);setPage(1)};
 const ingest=(file?:File)=>{
  if(!file)return;
  if(file.size>10*1024*1024){setError("Maximum file size is 10 MB.");return}
  if(!/\.(pdf|png|jpg|jpeg|webp|docx?)$/i.test(file.name)){setError("Supported files: PDF, images, DOC, or DOCX.");return}
  const memoId=uploadFolder==="Employment Memos"?uploadMemoId||undefined:undefined;
  const id=onUpload(uploadFolder,file,memoId);setFolder(uploadFolder);setSelectedKey(memoId?`memo-${memoId}`:`upload-${id}`);setPage(1);setFull(false);
  setError("File preview is temporary while Employee 201 stays open. It is not stored on a server.");
 };
 const previewView=(
   <div className={`empdoc-preview ${full?"full":""}`} role={full?"dialog":undefined} aria-modal={full?true:undefined} aria-label={full?"Enlarged document preview":"Document preview"}>
    {current?<><div className="empdoc-previewhead"><div><strong title={current.name}>{current.name}</strong><small>{current.status}</small></div><div className="empdoc-previewtools"><label className="empdoc-paperselector"><span className="empdoc-sr-only">Preview paper size</span><select aria-label="Preview paper size" title="Changes the preview page frame, not the original uploaded PDF" value={paperSize} onChange={e=>setPaperSize(e.target.value as "A4"|"Letter")}><option value="A4">A4</option><option value="Letter">Letter</option></select></label>{full?<button ref={fullCloseRef} className="empdoc-fullclose" type="button" aria-label="Close enlarged document preview" onClick={()=>setFull(false)}><X size={17}/> Close Preview <small>Esc</small></button>:<button className="secondary" type="button" aria-label="Enlarge document preview" onClick={()=>setFull(true)}><Maximize2 size={15}/><span className="empdoc-expandlabel">Expand</span></button>}</div></div>
     <div className="empdoc-previewbody"><div className={`empdoc-pageframe ${paperSize==="A4"?"empdoc-page-a4":"empdoc-page-letter"}`} aria-label={`${paperSize} page preview`}><DocumentPreview item={current} page={page}/></div></div>
     <div className="empdoc-pager"><button type="button" className="secondary" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}><ChevronLeft size={15}/> Prev Page</button><small>Page {page}{maxPage?` / ${maxPage}`:" · PDF toolbar shows total"}</small><button className="secondary" type="button" onClick={()=>setPage(p=>Math.min(200,p+1))} disabled={maxPage!==undefined&&page>=maxPage}>Next <ChevronRight size={15}/></button></div>
     <div className="empdoc-pager"><button type="button" className="secondary" disabled={itemIndex<=0} onClick={previousFile}><ArrowLeft size={14}/> Previous File</button><small>{itemIndex+1} of {items.length}</small><button type="button" className="secondary" disabled={itemIndex>=items.length-1} onClick={nextFile}>Next File <ArrowRight size={14}/></button></div>
    </>:<div className="empdoc-empty">Select a folder with files to preview a record.</div>}
   </div>
 );
 return <div className="empdoc-root">
  <div className="empdoc-folderbar" aria-label="Employee document folders">{folders.map(name=><button type="button" key={name} className={`empdoc-folder ${folder===name?"active":""}`} aria-pressed={folder===name} onClick={()=>choose(name)}><FolderOpen size={17}/><span>{name}</span><small>{allItems[name].length}</small></button>)}</div>
  {folder==="Employment Memos"&&memoRefs.length>0&&<div className="empdoc-memoattach"><label>Attach uploaded file to memo <select value={uploadMemoId} onChange={e=>setUploadMemoId(e.target.value)}><option value="">Unlinked memo file</option>{memoRefs.map(id=><option key={id} value={id}>{id}</option>)}</select></label><small>Select the memo reference before uploading its PDF or image.</small></div>}
  <div className="empdoc-toolbar"><div><h4>{folder}</h4><span className="muted">{items.length} file record{items.length===1?"":"s"}</span></div><label className="secondary empdoc-upload"><Upload size={14}/> Add File<input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={e=>{ingest(e.target.files?.[0]);e.target.value=""}}/></label></div>
  {error&&<div className="rev-note" role="status">{error}</div>}
  <div className="empdoc-columns">
   <div className="empdoc-filelist" aria-label={`${folder} files`}>
    {items.length===0&&<div className="empdoc-empty">No records in this folder.</div>}
    {items.map((d,i)=><button key={d.key} type="button" className={`empdoc-file ${current?.key===d.key?"active":""}`} aria-pressed={current?.key===d.key} onClick={()=>{setSelectedKey(d.key);setPage(1)}}><FileText size={17}/><span><strong>{d.name}</strong><small>{d.status}</small></span><ChevronRight size={15}/></button>)}
   </div>
   {!full&&previewView}
   {full&&createPortal(<div className="empdoc-fullscreen-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setFull(false)}}>{previewView}</div>,document.body)}
  </div>
  <p className="muted empdoc-disclaimer">Paper size changes the preview frame only; uploaded PDF page sizes are unchanged. Checklist records and past filenames contain no attached file bytes. New uploads are temporary until secure storage is connected.</p>
 </div>;
}
