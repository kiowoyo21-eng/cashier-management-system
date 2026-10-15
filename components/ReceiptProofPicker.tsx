'use client';
import {useRef,useState} from 'react';
import {Camera,ImageUp,Smartphone} from 'lucide-react';
import CameraProof from './CameraProof';
import PhoneCameraLink from './PhoneCameraLink';
import * as backend from '../lib/backend';
import {useNotify} from './Notifications';

type Props={transactionId:string;onAttached:()=>void};
export default function ReceiptProofPicker({transactionId,onAttached}:Props){
 const notify=useNotify();
 const inputRef=useRef<HTMLInputElement>(null);
 const [mode,setMode]=useState<'menu'|'device'|'phone'>('menu');
 const [busy,setBusy]=useState(false);
 async function attach(value:string){
  if(busy)return;setBusy(true);
  try{await backend.attachProof(transactionId,value);notify('Receipt proof attached.','success');onAttached();setMode('menu')}
  catch(e){notify(e instanceof Error?e.message:'Unable to attach receipt proof.','error')}
  finally{setBusy(false)}
 }
 async function filePicked(file?:File){
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){notify('Upload a JPG, PNG or WEBP receipt image.','warning');return}
  if(file.size>5*1024*1024){notify('Maximum receipt image size is 5MB.','warning');return}
  const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(file)});
  await attach(data);
 }
 if(mode==='device')return <div className="receipt-proof-panel"><div className="hrow between"><strong>Use Device Camera</strong><button className="btn ghost" onClick={()=>setMode('menu')}>Back</button></div><CameraProof submitLabel={busy?'Saving…':'Use Receipt Photo'} onCapture={v=>void attach(v)} onBack={()=>setMode('menu')}/></div>;
 if(mode==='phone')return <div className="receipt-proof-panel"><div className="hrow between"><strong>Use Phone Camera</strong><button className="btn ghost" onClick={()=>setMode('menu')}>Back</button></div><PhoneCameraLink purpose="expense-receipt" transactionId={transactionId} onCaptured={path=>void attach(path)} onBack={()=>setMode('menu')}/></div>;
 return <div className="receipt-proof-panel"><div className="receipt-proof-options"><button className="receipt-proof-option" onClick={()=>setMode('device')}><Camera size={19}/><span><strong>Use Device Camera</strong><small>Take the receipt photo using this device.</small></span></button><button className="receipt-proof-option" onClick={()=>inputRef.current?.click()} disabled={busy}><ImageUp size={19}/><span><strong>Upload Receipt</strong><small>Choose a JPG, PNG or WEBP image.</small></span></button><button className="receipt-proof-option" onClick={()=>setMode('phone')}><Smartphone size={19}/><span><strong>Use Phone Camera</strong><small>Generate a QR/link and capture using a phone.</small></span></button></div><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{void filePicked(e.target.files?.[0]);e.currentTarget.value=''}}/></div>;
}
