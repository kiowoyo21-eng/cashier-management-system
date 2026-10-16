'use client';
import {useEffect,useMemo,useState} from 'react';
import {CheckCircle2,Download,Eye,FileText,RefreshCw,ShieldCheck} from 'lucide-react';
import {supabase} from '../lib/supabase';
import * as backend from '../lib/backend';
import {LedgerEntry,peso,prettyDate} from '../lib/store';
import SignaturePad from './SignaturePad';
import {useNotify} from './Notifications';

type RequestStatus='Pending Verification'|'Verified'|'Approved'|'Released'|'Rejected';
type RequestRow={
 id:string;branch_id:string;requested_by:string;request_date:string;period_start:string;period_end:string;
 current_balance:number;beginning_balance?:number;remaining_balance?:number;check_deposit?:number;total_expenses:number;amount_requested:number;expense_count:number;
 pdf_path:string;receipts_pdf_path?:string|null;signature_path:string;status:RequestStatus;review_note?:string|null;created_at:string;
 verified_by?:string|null;verified_signature_path?:string|null;verified_at?:string|null;
 approved_by?:string|null;approved_signature_path?:string|null;approved_at?:string|null;released_at?:string|null;
};

type ReviewAction='verify'|'approve';
const ledgerDay=(t:LedgerEntry)=>t.transactionDate||t.createdAt.slice(0,10);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const pdfMoney=(n:number)=>`PHP ${Number(n||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const compactDate=(v:string)=>{try{return new Intl.DateTimeFormat('en-PH',{year:'numeric',month:'short',day:'2-digit',timeZone:'Asia/Manila'}).format(new Date(`${v}T00:00:00+08:00`))}catch{return v}};

async function toDataUrl(blob:Blob){return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})}
async function imageUrlToDataUrl(url:string){const resp=await fetch(url);if(!resp.ok)throw new Error('Image unavailable');return await toDataUrl(await resp.blob())}
async function downloadPdfUrl(url:string,filename:string){const resp=await fetch(url);if(!resp.ok)throw new Error('PDF download is unavailable');const blob=await resp.blob();const local=URL.createObjectURL(blob);const a=document.createElement('a');a.href=local;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(local),1500)}

function branchSummary(expenses:LedgerEntry[]){
 const map=new Map<string,{count:number;amount:number}>();
 for(const row of expenses){const name=row.branchName||'Unassigned';const prev=map.get(name)||{count:0,amount:0};prev.count++;prev.amount+=row.amount;map.set(name,prev)}
 return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
}

async function buildReportPdf(args:{
 id:string;expenses:LedgerEntry[];periodStart:string;periodEnd:string;preparedBy:string;preparedSignature?:string;
 beginningBalance:number;remainingBalance:number;checkDeposit:number;amountRequested:number;
}){
 const {jsPDF}=await import('jspdf');
 const {id,expenses:allExpenses,periodStart,periodEnd,preparedBy,preparedSignature,beginningBalance,remainingBalance,checkDeposit,amountRequested}=args;
 const total=allExpenses.reduce((n,x)=>n+x.amount,0),branches=branchSummary(allExpenses);
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
 const W=297,H=210,M=10,YELLOW=[246,201,54] as [number,number,number];
 const pageCount=Math.max(1,Math.ceil(allExpenses.length/30));
 for(let pageIndex=0;pageIndex<pageCount;pageIndex++){
 if(pageIndex>0)doc.addPage('a4','landscape');
 const expenses=allExpenses.slice(pageIndex*30,(pageIndex+1)*30);
 doc.setFillColor(...YELLOW);doc.rect(0,0,W,8,'F');
 doc.setFont('helvetica','bold');doc.setTextColor(22,22,22);doc.setFontSize(15);doc.text('UNDERCHARGERS',M,16);
 doc.setFontSize(12.5);doc.text('RFP DISBURSEMENT REPORT',M,24);
 doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(90,90,90);doc.text('Parts Only · Up to 30 transactions per report page',M,30);

 doc.setDrawColor(225,225,225);doc.setFillColor(250,250,248);doc.roundedRect(M,34,W-M*2,18,2,2,'FD');
 const meta=[['Request No.',id],['Period Covered',`${compactDate(periodStart)} - ${compactDate(periodEnd)}`],['Prepared By',preparedBy||'PB Account'],['Transactions',`${allExpenses.length} · Page ${pageIndex+1}/${pageCount}`]];
 meta.forEach(([k,v],i)=>{const x=M+4+i*68;doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setTextColor(115,110,100);doc.text(k.toUpperCase(),x,40);doc.setFontSize(8.8);doc.setTextColor(30,30,30);doc.text(doc.splitTextToSize(v,62),x,46)});

 const tableTop=58,summaryTop=135,signatureTop=177;
 const availableH=summaryTop-tableTop-11;
 if(expenses.length<=10){
  const cols=[
   {h:'Date',w:19},{h:'Transaction No.',w:39},{h:'Branch',w:37},{h:'Supplier / Part',w:72},
   {h:'Unit / Plate',w:49},{h:'Receipt No.',w:28},{h:'Amount',w:32}
  ];
  const tableWidth=cols.reduce((n,c)=>n+c.w,0);
  let y=tableTop;
  doc.setFillColor(35,35,35);doc.rect(M,y,tableWidth,8,'F');doc.setFont('helvetica','bold');doc.setFontSize(7.3);doc.setTextColor(255,255,255);
  let hx=M;for(const c of cols){doc.text(c.h,hx+1.5,y+5.2);hx+=c.w}y+=8;doc.setTextColor(20,20,20);
  const rowH=Math.min(8.2,availableH/Math.max(1,expenses.length));
  for(const r of expenses){
   const part=`${r.category}: ${r.description} · ${Number(r.quantity||1).toLocaleString('en-PH')} x ${pdfMoney(r.unitCost||r.amount)}`;
   const vals=[compactDate(ledgerDay(r)),r.id,r.branchName||'Unassigned',`${r.payee||'-'}\n${part}`,`${r.vehicleUnit||'-'}\n${r.plateNumber||'-'}`,r.receiptNo||'-',pdfMoney(r.amount)];
   let x=M;doc.setFont('helvetica','normal');doc.setFontSize(7.3);doc.setDrawColor(228,228,228);
   vals.forEach((v,i)=>{
    if(i%2===0){doc.setFillColor(253,253,251);doc.rect(x,y,cols[i].w,rowH,'F')}
    doc.rect(x,y,cols[i].w,rowH,'S');
    const lines=doc.splitTextToSize(String(v),cols[i].w-3).slice(0,rowH>=7?2:1);
    const ty=y+(rowH>=7?3.2:Math.min(rowH-1.1,3.6));
    if(i===6)doc.text(lines,x+cols[i].w-1.5,ty,{align:'right'});else doc.text(lines,x+1.5,ty);
    x+=cols[i].w;
   });
   y+=rowH;
  }
 }else{
  // When there are many transactions, use two concise columns so the formal report remains one page.
  // Supplier/item/unit details remain available in the separate Receipts PDF.
  const halves=[expenses.slice(0,Math.ceil(expenses.length/2)),expenses.slice(Math.ceil(expenses.length/2))];
  const gap=7,tableW=(W-M*2-gap)/2,cols=[{h:'Date',w:20},{h:'Transaction No.',w:42},{h:'Branch',w:46},{h:'Amount',w:tableW-108}];
  const maxRows=Math.max(...halves.map(h=>h.length)),rowH=Math.max(3.8,Math.min(7.2,availableH/Math.max(1,maxRows)));
  halves.forEach((rows,side)=>{
   let y=tableTop,x0=M+side*(tableW+gap);
   doc.setFillColor(35,35,35);doc.rect(x0,y,tableW,8,'F');doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setTextColor(255,255,255);
   let hx=x0;for(const c of cols){doc.text(c.h,hx+1.2,y+5.2);hx+=c.w}y+=8;doc.setTextColor(20,20,20);
   for(const r of rows){
    const vals=[compactDate(ledgerDay(r)),r.id,r.branchName||'Unassigned',pdfMoney(r.amount)];
    let x=x0;doc.setFont('helvetica','normal');doc.setFontSize(rowH>=5.5?6.8:5.8);doc.setDrawColor(228,228,228);
    vals.forEach((v,i)=>{doc.rect(x,y,cols[i].w,rowH,'S');const line=doc.splitTextToSize(String(v),cols[i].w-2).slice(0,1);if(i===3)doc.text(line,x+cols[i].w-1.2,y+Math.min(rowH-1,3.6),{align:'right'});else doc.text(line,x+1.2,y+Math.min(rowH-1,3.6));x+=cols[i].w});
    y+=rowH;
   }
  });
  doc.setFont('helvetica','italic');doc.setFontSize(6.3);doc.setTextColor(120,120,120);
  doc.text('Transaction details and receipt images are in the separate Receipts PDF.',M,summaryTop-1);
 }

 const bx=M,bw=127,fx=158,fw=129;
 let sy=summaryTop;
 doc.setTextColor(25,25,25);doc.setFont('helvetica','bold');doc.setFontSize(9.5);doc.text('Summary by Branch',bx,sy);doc.text('Fund Summary',fx,sy);sy+=4;
 doc.setFillColor(248,248,245);doc.setDrawColor(224,224,220);doc.rect(bx,sy,bw,7,'FD');doc.setFontSize(7.5);doc.text('Branch',bx+2,sy+4.7);doc.text('Txn',bx+84,sy+4.7);doc.text('Expenses',bx+bw-3,sy+4.7,{align:'right'});
 let by=sy+7;doc.setFont('helvetica','normal');
 for(const [name,v] of branches.slice(0,4)){doc.rect(bx,by,bw,7,'S');doc.setFontSize(7.4);doc.text(doc.splitTextToSize(name,78).slice(0,1),bx+2,by+4.7);doc.text(String(v.count),bx+86,by+4.7,{align:'center'});doc.text(pdfMoney(v.amount),bx+bw-3,by+4.7,{align:'right'});by+=7}
 doc.setFont('helvetica','bold');doc.rect(bx,by,bw,7,'S');doc.text('TOTAL',bx+2,by+4.7);doc.text(String(expenses.length),bx+86,by+4.7,{align:'center'});doc.text(pdfMoney(total),bx+bw-3,by+4.7,{align:'right'});

 const available=remainingBalance+checkDeposit;
 const fundRows:[string,number][]=[['Balance',beginningBalance],['Less: Expenses',-total],['Remaining',remainingBalance],['Add: Check Deposit',checkDeposit],['Available Balance',available],['AMOUNT REQUESTED',amountRequested]];
 let fy=sy;for(const [label,val] of fundRows){const final=label==='AMOUNT REQUESTED';doc.setFillColor(final?246:252,final?201:252,final?54:249);doc.rect(fx,fy,fw,6,'F');doc.setDrawColor(225,225,222);doc.rect(fx,fy,fw,6,'S');doc.setFont('helvetica',final?'bold':'normal');doc.setFontSize(final?8:7.4);doc.text(label,fx+3,fy+4.1);doc.text((val<0?'(':'')+pdfMoney(Math.abs(val))+(val<0?')':''),fx+fw-3,fy+4.1,{align:'right'});fy+=6}

 const blockW=84,gap=8,baseY=signatureTop;
 const signatureBlock=async(x:number,title:string,name:string,status:string,imageUrl?:string)=>{
  doc.setFont('helvetica','bold');doc.setFontSize(7.8);doc.setTextColor(30,30,30);doc.text(title,x,baseY);
  if(imageUrl){try{const data=await imageUrlToDataUrl(imageUrl);const props=doc.getImageProperties(data);const scale=Math.min(36/props.width,10/props.height);doc.addImage(data,props.fileType||'PNG',x,baseY+2,props.width*scale,props.height*scale)}catch{}}
  doc.setDrawColor(90,90,90);doc.line(x,baseY+14,x+blockW,baseY+14);doc.setFont('helvetica','bold');doc.setFontSize(7.8);doc.text(name||status,x,baseY+18.5);doc.setFont('helvetica','normal');doc.setFontSize(6.8);doc.setTextColor(110,110,110);doc.text(status,x,baseY+22.5);
 };
 await signatureBlock(M,'PREPARED BY',preparedBy||'PB Account','PB / Request Preparer',preparedSignature);
 await signatureBlock(M+blockW+gap,'VERIFIED BY','Accounting','Pending Accounting Verification');
 await signatureBlock(M+(blockW+gap)*2,'APPROVED BY','President','Pending President Approval');
 doc.setFont('helvetica','normal');doc.setFontSize(6.3);doc.setTextColor(120,120,120);doc.text(`Request ${id} · Receipts are provided in a separate PDF. Digital verification/approval is recorded in the audit trail.`,M,H-4);
 }
 return doc.output('blob');
}

async function buildReceiptsPdf(args:{id:string;expenses:LedgerEntry[];periodStart:string;periodEnd:string}){
 const {jsPDF}=await import('jspdf');
 const {id,expenses,periodStart,periodEnd}=args;
 const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
 const W=210,H=297,M=14,YELLOW=[246,201,54] as [number,number,number];
 for(let index=0;index<expenses.length;index++){
  if(index>0)doc.addPage('a4','portrait');
  const t=expenses[index];
  doc.setFillColor(...YELLOW);doc.rect(0,0,W,8,'F');
  doc.setFont('helvetica','bold');doc.setTextColor(20,20,20);doc.setFontSize(14);doc.text('RFP RECEIPT / SUPPORTING DOCUMENT',M,18);
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(100,100,100);doc.text(`${id} · ${compactDate(periodStart)} - ${compactDate(periodEnd)} · Receipt ${index+1} of ${expenses.length}`,M,24);
  doc.setTextColor(20,20,20);doc.setFontSize(9);
  const lines=[
   `Transaction No.: ${t.id}`,
   `Branch: ${t.branchName||'Unassigned'}`,
   `Supplier: ${t.payee||'-'}`,
   `Part: ${t.category} - ${t.description}`,
   `Quantity / Unit Cost: ${Number(t.quantity||1).toLocaleString('en-PH')} x ${pdfMoney(t.unitCost||t.amount)}`,
   `Unit / Plate: ${t.vehicleUnit||'-'} / ${t.plateNumber||'-'}`,
   `Receipt No.: ${t.receiptNo||'-'}`,
   `Amount: ${pdfMoney(t.amount)}`
  ];
  lines.forEach((line,i)=>doc.text(line,M,34+i*5));
  doc.setDrawColor(225,225,225);doc.line(M,76,W-M,76);
  if(t.proof){
   try{
    const resp=await fetch(t.proof);if(!resp.ok)throw Error('Receipt unavailable');
    const blob=await resp.blob();const dataUrl=await toDataUrl(blob);const props=doc.getImageProperties(dataUrl);
    const maxW=182,maxH=196,scale=Math.min(maxW/props.width,maxH/props.height);
    const iw=props.width*scale,ih=props.height*scale,ix=(W-iw)/2;
    doc.addImage(dataUrl,props.fileType||'JPEG',ix,84,iw,ih);
   }catch{
    doc.setTextColor(180,30,30);doc.setFont('helvetica','bold');doc.text('Receipt image could not be embedded. Verify the stored receipt attachment.',M,90);
   }
  }
  doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.setTextColor(120,120,120);doc.text(`RFP receipt packet · ${id} · ${t.id}`,M,H-5);
 }
 return doc.output('blob');
}

export function RfpDisbursementModal({open,transactions,currentBalance,onClose,onDone}:{open:boolean;transactions:LedgerEntry[];currentBalance:number;onClose:()=>void;onDone:()=>void}){
 const notify=useNotify();
 const [covered,setCovered]=useState<Set<string>>(new Set()),[loading,setLoading]=useState(false),[requestId,setRequestId]=useState(''),[pdfPath,setPdfPath]=useState(''),[pdfUrl,setPdfUrl]=useState(''),[receiptsPdfPath,setReceiptsPdfPath]=useState(''),[receiptsPdfUrl,setReceiptsPdfUrl]=useState(''),[signature,setSignature]=useState(''),[savedSignatureUrl,setSavedSignatureUrl]=useState(''),[usingSavedSignature,setUsingSavedSignature]=useState(false),[notes,setNotes]=useState(''),[checkDeposit,setCheckDeposit]=useState('0'),[preparedBy,setPreparedBy]=useState('PB Account'),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!open||!supabase)return;let alive=true;(async()=>{setLoading(true);setRequestId('');setPdfPath('');setPdfUrl('');setReceiptsPdfPath('');setReceiptsPdfUrl('');setSignature('');setUsingSavedSignature(false);setCheckDeposit('0');try{const {data:{user}}=await supabase!.auth.getUser();const [{data,error},{data:profile,error:profileError}]=await Promise.all([supabase!.from('rfp_disbursement_request_items').select('expense_id'),user?supabase!.from('profiles').select('display_name,saved_signature_path').eq('id',user.id).maybeSingle():Promise.resolve({data:null,error:null} as any)]);if(error)throw error;if(profileError)throw profileError;if(alive){setCovered(new Set((data||[]).map((x:any)=>String(x.expense_id))));const path=(profile as any)?.saved_signature_path||'';setPreparedBy((profile as any)?.display_name||'PB Account');setSavedSignatureUrl(path?(await backend.fileUrl(path,1800))||'':'' )}}catch(e){notify(e instanceof Error?e.message:'Unable to load RFP request coverage.','error')}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[open,notify]);
 const expenses=useMemo(()=>transactions.filter(t=>t.account==='Funds'&&t.kind==='Expense'&&!covered.has(t.id)).slice().sort((a,b)=>ledgerDay(a).localeCompare(ledgerDay(b))||new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()),[transactions,covered]);
 const total=expenses.reduce((n,x)=>n+x.amount,0),missingReceipts=expenses.filter(x=>!x.proof).length,periodStart=expenses[0]?ledgerDay(expenses[0]):today(),periodEnd=expenses.length?ledgerDay(expenses[expenses.length-1]):today();
 const deposit=Math.max(0,Number(checkDeposit||0)),beginningBalance=currentBalance+total,remainingBalance=currentBalance,amountRequested=Math.max(0,beginningBalance-(remainingBalance+deposit));
 const branches=branchSummary(expenses);
 async function ensureRequestId(){if(requestId)return requestId;const id=await backend.nextTransactionNumber('RFP-DR');setRequestId(id);return id}
 async function generatePdf(){if(busy||!expenses.length||missingReceipts||amountRequested<=0)return;setBusy(true);try{const id=await ensureRequestId();const [reportBlob,receiptsBlob]=await Promise.all([buildReportPdf({id,expenses,periodStart,periodEnd,preparedBy,preparedSignature:signature||savedSignatureUrl,beginningBalance,remainingBalance,checkDeposit:deposit,amountRequested}),buildReceiptsPdf({id,expenses,periodStart,periodEnd})]);const [reportPath,receiptsPath]=await Promise.all([backend.uploadFile(reportBlob,'rfp-disbursement',`${id}-report.pdf`,'application/pdf'),backend.uploadFile(receiptsBlob,'rfp-disbursement-receipts',`${id}-receipts.pdf`,'application/pdf')]);const [reportUrl,receiptsUrl]=await Promise.all([backend.fileUrl(reportPath,1800),backend.fileUrl(receiptsPath,1800)]);setPdfPath(reportPath);setPdfUrl(reportUrl||'');setReceiptsPdfPath(receiptsPath);setReceiptsPdfUrl(receiptsUrl||'');notify('Documents generated. Preview or download them before submitting to Accounting.','success')}catch(e){notify(e instanceof Error?e.message:'Unable to generate RFP PDFs.','error')}finally{setBusy(false)}}
 async function saveCurrentSignature(){if(!supabase||busy||!signature||usingSavedSignature)return;setBusy(true);try{const path=await backend.uploadImage(signature,'saved-signatures');const {error}=await supabase.rpc('save_my_signature',{p_path:path});if(error)throw error;const url=await backend.fileUrl(path,1800);setSavedSignatureUrl(url||signature);notify('PB signature saved for future requests.','success')}catch(e){notify(e instanceof Error?e.message:'Unable to save PB signature.','error')}finally{setBusy(false)}}
 async function submit(){if(!supabase||busy||!expenses.length||missingReceipts||!pdfPath||!receiptsPdfPath||!signature||amountRequested<=0)return;setBusy(true);try{const id=await ensureRequestId();const sign=usingSavedSignature?null:await backend.uploadImage(signature,'rfp-disbursement-signatures');let signPath=sign;if(usingSavedSignature){const {data:{user}}=await supabase.auth.getUser();const {data:profile}=await supabase.from('profiles').select('saved_signature_path').eq('id',user?.id||'').maybeSingle();signPath=profile?.saved_signature_path||null}if(!signPath)throw new Error('Signature path is required');const {error}=await supabase.rpc('submit_rfp_disbursement_request_v3',{p_id:id,p_expense_ids:expenses.map(x=>x.id),p_report_pdf_path:pdfPath,p_receipts_pdf_path:receiptsPdfPath,p_signature_path:signPath,p_check_deposit:deposit,p_notes:notes});if(error)throw error;notify('RFP Disbursement Request sent to Accounting with separate report and receipts PDFs.','success');onDone();onClose()}catch(e){notify(e instanceof Error?e.message:'Unable to submit RFP Disbursement Request.','error')}finally{setBusy(false)}}
 if(!open)return null;
 return <div className="modalback"><div className="modal wide rfp-request-modal"><div className="hrow between wrap"><div><div className="eyebrow">PB · RFP</div><h2>RFP Disbursement Request</h2><p className="muted small">Parts and Supplies only. Generate a Disbursement Report (30 transactions per page) plus a separate Receipts PDF for Accounting review.</p></div><button className="btn ghost" onClick={onClose}>Close</button></div>
 <div className="review-grid"><div><span>Request No.</span><strong>{requestId||'Generated with PDF'}</strong></div><div><span>Period Covered</span><strong>{periodStart} – {periodEnd}</strong></div><div><span>Balance</span><strong>{peso(beginningBalance)}</strong></div><div><span>Less: Expenses</span><strong>{peso(total)}</strong></div><div><span>Remaining</span><strong>{peso(remainingBalance)}</strong></div><div><span>Amount Requested</span><strong>{peso(amountRequested)}</strong></div></div>
 <label style={{maxWidth:320}}>Add: Check Deposit (₱)<input className="input" type="number" min="0" step="0.01" value={checkDeposit} onChange={e=>{setCheckDeposit(e.target.value);setPdfPath('');setPdfUrl('');setReceiptsPdfPath('');setReceiptsPdfUrl('')}} placeholder="0.00"/></label>
 {deposit>total&&<div className="notice">Check Deposit cannot exceed the expenses covered by this request.</div>}
 {missingReceipts>0&&<div className="notice" role="alert"><strong>{missingReceipts} expense{missingReceipts===1?' is':'s are'} missing receipt proof.</strong> Attach every receipt before generating the report and receipts PDFs.</div>}
 <div className="tablewrap rfp-covered-table"><table><thead><tr><th>Date</th><th>Transaction No.</th><th>Branch</th><th>Supplier</th><th>Part</th><th>Qty</th><th>Unit Cost</th><th>Amount</th><th>Unit / Plate</th><th>Receipt</th></tr></thead><tbody>{expenses.map(x=><tr key={x.id}><td>{ledgerDay(x)}</td><td><strong>{x.id}</strong></td><td>{x.branchName||'Unassigned'}</td><td>{x.payee||'—'}</td><td><strong>{x.category}</strong><br/><span className="small muted">{x.description}</span></td><td>{x.quantity||1}</td><td>{peso(x.unitCost||x.amount)}</td><td>{peso(x.amount)}</td><td>{x.vehicleUnit||'—'}<br/><span className="small muted">{x.plateNumber||'—'}</span></td><td>{x.proof?<><span className="badge approved">Attached</span><br/><span className="small muted">{x.receiptNo||'No. —'}</span></>:<span className="badge explain">Missing</span>}</td></tr>)}{!loading&&!expenses.length&&<tr><td colSpan={10}>No unreimbursed RFP expenses are available for a new request.</td></tr>}{loading&&<tr><td colSpan={10}>Loading covered expenses…</td></tr>}</tbody></table></div>
 {branches.length>0&&<div className="rfp-branch-summary"><h3>Branch Summary</h3>{branches.map(([name,v])=><div className="detail compact" key={name}><span>{name} · {v.count} transaction{v.count===1?'':'s'}</span><strong>{peso(v.amount)}</strong></div>)}<div className="detail"><strong>Total Expenses</strong><strong>{peso(total)}</strong></div></div>}
 <div className="rfp-pdf-actions"><button className="btn ghost" disabled={busy||!expenses.length||missingReceipts>0||amountRequested<=0||deposit>total} onClick={()=>void generatePdf()}><FileText size={16}/>{pdfPath&&receiptsPdfPath?'Regenerate Documents':'Generate Documents'}</button>{pdfPath&&receiptsPdfPath&&<span className="badge approved">Report + Receipts Ready</span>}{pdfUrl&&<button type="button" className="btn ghost" onClick={()=>window.open(pdfUrl,'_blank','noopener,noreferrer')}><Eye size={16}/>Preview Report</button>}{pdfUrl&&<button type="button" className="btn ghost" onClick={()=>void downloadPdfUrl(pdfUrl,`${requestId||'RFP-DR'}-report.pdf`).catch(e=>notify(e instanceof Error?e.message:'Unable to download report.','error'))}><Download size={16}/>Download Report</button>}{receiptsPdfUrl&&<button type="button" className="btn ghost" onClick={()=>window.open(receiptsPdfUrl,'_blank','noopener,noreferrer')}><Eye size={16}/>Preview Receipts</button>}{receiptsPdfUrl&&<button type="button" className="btn ghost" onClick={()=>void downloadPdfUrl(receiptsPdfUrl,`${requestId||'RFP-DR'}-receipts.pdf`).catch(e=>notify(e instanceof Error?e.message:'Unable to download receipts.','error'))}><Download size={16}/>Download Receipts</button>}</div>
 <label>Request Notes<textarea className="input" rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional disbursement request notes"/></label><div className="pos-section-card"><div className="pos-section-head"><div><h3>Prepared by: {preparedBy}</h3><p className="muted small">PB signature is required. Accounting will verify the request, then the President will approve with e-signature.</p></div>{savedSignatureUrl&&<button type="button" className="btn ghost" onClick={()=>{setSignature(savedSignatureUrl);setUsingSavedSignature(true)}}>Use Saved Signature</button>}</div>{usingSavedSignature&&signature?<div className="saved-signature-preview"><img src={signature} alt="Saved PB signature"/><div className="hrow between wrap"><span className="badge approved">Saved Signature Selected</span><button type="button" className="btn ghost" onClick={()=>{setSignature('');setUsingSavedSignature(false)}}>Sign Manually</button></div></div>:<><SignaturePad onChange={v=>{setSignature(v);setUsingSavedSignature(false)}}/>{signature&&<div className="hrow" style={{marginTop:8}}><button type="button" className="btn ghost" disabled={busy} onClick={()=>void saveCurrentSignature()}>Save This Signature</button>{savedSignatureUrl&&<span className="small muted">Saving replaces the PB saved signature for future requests.</span>}</div>}</>}</div>
 <div className="hrow between wrap" style={{marginTop:16}}><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy||!expenses.length||missingReceipts>0||!pdfPath||!receiptsPdfPath||!signature||amountRequested<=0||deposit>total} onClick={()=>void submit()}>{busy?'Processing…':'Submit to Accounting'}</button></div></div></div>
}

export function RfpDisbursementTask({onOpen}:{onOpen:()=>void}){const [row,setRow]=useState<RequestRow|null>(null),[loading,setLoading]=useState(true);async function refresh(){if(!supabase)return;setLoading(true);const {data}=await supabase.from('rfp_disbursement_requests').select('*').order('created_at',{ascending:false}).limit(1).maybeSingle();setRow((data||null) as RequestRow|null);setLoading(false)}useEffect(()=>{void refresh()},[]);const active=row&&['Pending Verification','Verified','Approved'].includes(row.status);return <div className="pb-task-status"><div className="pb-task-status-copy"><span className={'pb-task-status-dot '+(active?'active':row?.status==='Released'?'released':'ready')}></span><div><strong>{active?'Request in progress':row?.status==='Released'?'Ready for next request':'Disbursement request ready'}</strong><small>{loading?'Checking status…':active?`${row!.id} · ${row!.status}`:row?.status==='Released'?`Last released: ${row.id}`:'Prepare a disbursement request with report + receipts PDFs'}</small></div></div><button className="btn" onClick={onOpen}>{active?'Open Request':'Prepare Request'}</button></div>}

export function RfpDisbursementReview(){
 const notify=useNotify(),[rows,setRows]=useState<RequestRow[]>([]),[busy,setBusy]=useState(''),[role,setRole]=useState(''),[savedSignaturePath,setSavedSignaturePath]=useState(''),[savedSignatureUrl,setSavedSignatureUrl]=useState('');
 const [signing,setSigning]=useState<{row:RequestRow;action:ReviewAction}|null>(null),[signature,setSignature]=useState(''),[usingSaved,setUsingSaved]=useState(false),[saveForFuture,setSaveForFuture]=useState(false),[note,setNote]=useState('');
 async function refresh(){if(!supabase)return;const {data:{user}}=await supabase.auth.getUser();const [{data,error},{data:profile}]=await Promise.all([supabase.from('rfp_disbursement_requests').select('*').in('status',['Pending Verification','Verified','Approved']).order('created_at',{ascending:false}),user?supabase.from('profiles').select('role,saved_signature_path').eq('id',user.id).maybeSingle():Promise.resolve({data:null} as any)]);if(error)notify(error.message,'error');else setRows((data||[]) as RequestRow[]);setRole((profile as any)?.role||'');const path=(profile as any)?.saved_signature_path||'';setSavedSignaturePath(path);setSavedSignatureUrl(path?(await backend.fileUrl(path,1800))||'':'')}
 useEffect(()=>{void refresh()},[]);
 async function openDoc(path:string|undefined|null,label:string){const url=await backend.fileUrl(path||undefined,900);if(url)window.open(url,'_blank','noopener,noreferrer');else notify(`${label} PDF is unavailable.`,'error')}
 function openSign(row:RequestRow,action:ReviewAction){setSigning({row,action});setSignature('');setUsingSaved(false);setSaveForFuture(false);setNote('')}
 async function signedAction(){if(!supabase||!signing||busy||(!signature&&!usingSaved))return;setBusy(signing.row.id+signing.action);try{let path=usingSaved?savedSignaturePath:await backend.uploadImage(signature,signing.action==='verify'?'accounting-verification-signatures':'president-approval-signatures');if(!path)throw new Error('Signature is required');if(!usingSaved&&saveForFuture){const {error}=await supabase.rpc('save_my_signature',{p_path:path});if(error)throw error;setSavedSignaturePath(path);setSavedSignatureUrl((await backend.fileUrl(path,1800))||'')}const {error}=await supabase.rpc('review_rfp_disbursement_request_v2',{p_id:signing.row.id,p_action:signing.action,p_signature_path:path,p_note:note});if(error)throw error;notify(signing.action==='verify'?'RFP request verified and sent to the President.':'RFP request approved by the President.','success');setSigning(null);await refresh()}catch(e){notify(e instanceof Error?e.message:'Unable to update request.','error')}finally{setBusy('')}}
 async function simpleAction(row:RequestRow,action:'release'|'reject'){if(!supabase||busy)return;let why='';if(action==='reject'){why=prompt('Reason for rejection / return:','')||'';if(!why.trim())return}else if(!confirm('Release the approved RFP replenishment?'))return;setBusy(row.id+action);const {error}=await supabase.rpc('review_rfp_disbursement_request_v2',{p_id:row.id,p_action:action,p_signature_path:null,p_note:why});if(error)notify(error.message,'error');else{notify(action==='release'?'Approved RFP replenishment released and posted.':'RFP request rejected / returned.','success');await refresh()}setBusy('')}
 if(!rows.length)return null;
 const canVerify=role==='Accounting'||role==='Admin'||role==='Super Admin';const canApprove=role==='President'||role==='Admin'||role==='Super Admin';const canRelease=role==='Accounting'||role==='Admin'||role==='Super Admin';
 return <><div className="card" style={{marginBottom:18}}><div className="hrow between wrap"><div><h2>RFP Disbursement Requests</h2><p className="muted small">Workflow: PB prepares → Accounting verifies → President approves → Accounting releases.</p></div><button className="btn ghost" onClick={()=>void refresh()}><RefreshCw size={15}/>Refresh</button></div><div className="tablewrap"><table><thead><tr><th>Request</th><th>Period</th><th>Expenses</th><th>Check Deposit</th><th>Amount Requested</th><th>Status</th><th>Documents</th><th>Actions</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.id}</strong><br/><span className="small muted">{prettyDate(r.created_at)}</span></td><td>{r.period_start} – {r.period_end}</td><td>{r.expense_count}<br/><span className="small muted">{peso(Number(r.total_expenses||0))}</span></td><td>{peso(Number(r.check_deposit||0))}</td><td><strong>{peso(Number(r.amount_requested||0))}</strong></td><td><span className={'badge '+(r.status==='Approved'||r.status==='Verified'?'approved':'pending')}>{r.status}</span></td><td><div className="hrow wrap"><button className="btn ghost" onClick={()=>void openDoc(r.pdf_path,'Report')}>Report</button>{r.receipts_pdf_path&&<button className="btn ghost" onClick={()=>void openDoc(r.receipts_pdf_path,'Receipts')}>Receipts</button>}</div></td><td><div className="hrow wrap">{r.status==='Pending Verification'&&canVerify&&<button className="btn" disabled={!!busy} onClick={()=>openSign(r,'verify')}><ShieldCheck size={14}/>Verify & Sign</button>}{r.status==='Verified'&&canApprove&&<button className="btn" disabled={!!busy} onClick={()=>openSign(r,'approve')}><CheckCircle2 size={14}/>Approve & Sign</button>}{r.status==='Approved'&&canRelease&&<button className="btn" disabled={!!busy} onClick={()=>void simpleAction(r,'release')}>Release</button>}{(canVerify||canApprove)&&<button className="btn danger" disabled={!!busy} onClick={()=>void simpleAction(r,'reject')}>Reject / Return</button>}</div></td></tr>)}</tbody></table></div></div>
 {signing&&<div className="modalback"><div className="modal"><div className="hrow between"><div><div className="eyebrow">{signing.action==='verify'?'Accounting Verification':'President Approval'}</div><h2>{signing.row.id}</h2></div><button className="btn ghost" onClick={()=>setSigning(null)}>Close</button></div><p className="muted small">Your e-signature is stored as a snapshot on this request and is recorded in the audit trail.</p>{savedSignatureUrl&&<button className="btn ghost" onClick={()=>{setSignature(savedSignatureUrl);setUsingSaved(true)}}>Use Saved Signature</button>}{usingSaved&&signature?<div className="saved-signature-preview"><img src={signature} alt="Saved signature"/><button className="btn ghost" onClick={()=>{setSignature('');setUsingSaved(false)}}>Sign Manually</button></div>:<><SignaturePad onChange={v=>{setSignature(v);setUsingSaved(false)}}/><label className="hrow" style={{marginTop:8}}><input type="checkbox" checked={saveForFuture} onChange={e=>setSaveForFuture(e.target.checked)}/> Save this signature for future {signing.action==='verify'?'verifications':'approvals'}</label></>}<label style={{marginTop:12}}>Note<textarea className="input" rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional verification / approval note"/></label><div className="hrow between" style={{marginTop:16}}><button className="btn ghost" onClick={()=>setSigning(null)}>Cancel</button><button className="btn" disabled={!!busy||(!signature&&!usingSaved)} onClick={()=>void signedAction()}>{busy?'Processing…':signing.action==='verify'?'Verify & Sign':'Approve & Sign'}</button></div></div></div>}</>;
}
