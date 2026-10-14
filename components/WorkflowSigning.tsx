"use client";
import {useEffect,useRef,useState} from "react";
import {CheckCircle2,FileText,Info,PenLine,QrCode,RotateCcw} from "lucide-react";

type WorkflowSigningProps={
 documentName:string;
 recipient:string;
 /** Actual PDF/image selected in the current browser session (no persistent upload). */
 documentFile?:File|null;
 /** Read-only rendered document content, e.g. the payable payslip summary. */
 documentText?:string;
};

/** Frontend-only document review and signing demonstration.
 * Never issues a live signing link or saves a legally verifiable signature.
 * An actual source document must be available before drawing is enabled.
 */
export default function WorkflowSigning({documentName,recipient,documentFile=null,documentText}:WorkflowSigningProps){
 const [method,setMethod]=useState<"device"|"remote">("device");
 const [drawn,setDrawn]=useState(false);
 const [previewed,setPreviewed]=useState(false);
 const [documentReviewed,setDocumentReviewed]=useState(false);
 const [fileUrl,setFileUrl]=useState("");
 const pad=useRef<HTMLCanvasElement>(null);
 const drawing=useRef(false);
 const hasDocument=Boolean(documentFile||documentText?.trim());
 const supportedFile=Boolean(documentFile&&(documentFile.type==="application/pdf"||documentFile.type.startsWith("image/")));

 useEffect(()=>{
  setDocumentReviewed(false);
  setDrawn(false);
  setPreviewed(false);
  drawing.current=false;
  const canvas=pad.current;
  canvas?.getContext("2d")?.clearRect(0,0,canvas.width,canvas.height);
 },[documentFile,documentText,documentName,recipient]);
 useEffect(()=>{
  if(!documentFile||!supportedFile){setFileUrl("");return;}
  const url=URL.createObjectURL(documentFile);
  setFileUrl(url);
  return ()=>URL.revokeObjectURL(url);
 },[documentFile,supportedFile]);

 function point(e:React.PointerEvent<HTMLCanvasElement>){const el=pad.current;if(!el)return {x:0,y:0};const r=el.getBoundingClientRect();return {x:(e.clientX-r.left)*el.width/r.width,y:(e.clientY-r.top)*el.height/r.height}}
 function start(e:React.PointerEvent<HTMLCanvasElement>){if(!documentReviewed||!hasDocument)return;const el=pad.current;if(!el)return;el.setPointerCapture(e.pointerId);const ctx=el.getContext("2d");if(!ctx)return;ctx.beginPath();const p=point(e);ctx.moveTo(p.x,p.y);ctx.lineWidth=3;ctx.lineCap="round";ctx.strokeStyle="#283449";drawing.current=true;setPreviewed(false)}
 function move(e:React.PointerEvent<HTMLCanvasElement>){if(!drawing.current)return;const ctx=pad.current?.getContext("2d");if(!ctx)return;const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();setDrawn(true)}
 function finish(){drawing.current=false}
 function reset(){const el=pad.current;el?.getContext("2d")?.clearRect(0,0,el.width,el.height);setDrawn(false);setPreviewed(false)}
 return <div className="wf-signing">
  <div className="wf-signing-heading"><strong>Individual Document Signing</strong><small>{documentName} · {recipient||"Select recipient"}</small></div>
  <div className="wf-signing-document" style={{margin:"12px 0",padding:12,border:"1px solid #dce2e9",borderRadius:10}}>
   <strong style={{display:"flex",alignItems:"center",gap:7}}><FileText size={16}/> Document for Review</strong>
   {supportedFile&&fileUrl&&documentFile?.type==="application/pdf"&&<iframe title={`Document preview: ${documentName}`} src={fileUrl} style={{display:"block",width:"100%",height:300,marginTop:10,border:"1px solid #e3e7eb",borderRadius:6}}/>}
   {supportedFile&&fileUrl&&documentFile?.type.startsWith("image/")&&<img alt={`Document preview: ${documentName}`} src={fileUrl} style={{display:"block",width:"100%",maxHeight:360,marginTop:10,objectFit:"contain"}}/>}
   {!documentFile&&documentText?.trim()&&<pre style={{margin:"10px 0 0",padding:12,whiteSpace:"pre-wrap",overflowWrap:"anywhere",font:"inherit",fontSize:13,background:"#f7f8fa",borderRadius:6}}>{documentText}</pre>}
   {!hasDocument&&<p style={{margin:"10px 0 0"}}>No source document is attached. Add the actual PDF or image before requesting a signature. Filename-only case attachments cannot be signed.</p>}
   {documentFile&&!supportedFile&&<p style={{margin:"10px 0 0"}}>Unsupported document type. A PDF or image is required for document preview.</p>}
   {hasDocument&&(!documentFile||supportedFile)&&<label style={{display:"flex",gap:8,alignItems:"center",marginTop:12,fontSize:13}}><input type="checkbox" checked={documentReviewed} onChange={e=>setDocumentReviewed(e.target.checked)}/> I have reviewed the document shown above.</label>}
  </div>
  <div className="wf-signing-choices" role="group" aria-label="Signing method">
   <button type="button" className={method==="device"?"selected":""} onClick={()=>{setMethod("device");setPreviewed(false)}}><PenLine size={17}/><span><b>Sign on Device</b><small>Touchscreen, mouse or trackpad</small></span></button>
   <button type="button" className={method==="remote"?"selected":""} onClick={()=>setMethod("remote")}><QrCode size={17}/><span><b>Link / QR Code</b><small>Recipient's own phone</small></span></button>
  </div>
  {method==="device"?<div className="wf-signing-pad">
   <p>{!documentReviewed?"Preview the source document and confirm review before using the demo signature pad.":"Demo signature is visible only in this browser; it is not stored or verified."}</p>
   <canvas ref={pad} width={700} height={160} aria-label="Demo signature drawing pad" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} style={{touchAction:documentReviewed?"none":"auto",opacity:documentReviewed?1:0.5}}/>
   <div className="wf-signing-footer"><button type="button" className="secondary" onClick={reset}><RotateCcw size={14}/> Clear</button><button type="button" className="secondary" disabled={!drawn||!documentReviewed} onClick={()=>setPreviewed(true)}><CheckCircle2 size={14}/> Preview Captured Signature</button></div>
   {previewed&&<p className="wf-signing-feedback"><Info size={14}/> Browser-only preview. No authenticated signing, tamper-evident PDF or stored approval was created.</p>}
  </div>:<div className="wf-signing-remote"><QrCode size={29}/><div><strong>Secure QR / Link — Backend Required</strong><p>Real document-bound signing requires an authenticated backend, recipient identity validation, an expiring link and an archived signed PDF. No fake live link is generated.</p></div></div>}
 </div>;
}
