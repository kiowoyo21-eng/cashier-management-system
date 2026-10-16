'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {supabase} from '../lib/supabase';

type Target={type:'cash'|'pos';id:string};
type DbRow=Record<string,unknown>;
const cashFields:readonly [string,string,'text'|'number'|'date'|'branch'|'category'][]=[
 ['transaction_date','Transaction Date','date'],['category','Category','category'],['description','Description','text'],
 ['amount','Amount (₱)','number'],['payee','Supplier / Payee','text'],['vat_type','VAT classification','text'],
 ['cash_voucher_no','Cash Voucher Number','text'],['receipt_no','Receipt Number','text'],['tin_no','TIN','text'],
 ['notes','Notes','text'],['vehicle_unit','Vehicle / Unit','text'],['plate_number','Plate Number','text'],
 ['quantity','Quantity','number'],['unit_cost','Unit Cost (₱)','number'],['branch_id','Branch','branch']
];
const posFields:readonly [string,string,'text'|'number'|'json'][]=[
 ['client','Customer','text'],['phone','Phone','text'],['vehicle','Vehicle','text'],['plate','Plate Number','text'],
 ['concern','Concern','text'],['bs_si','BS / SI','text'],['customer_tin','Customer TIN','text'],
 ['customer_address','Customer Address','text'],['mileage','Mileage','text'],['platform','Platform','text'],
 ['service_advisor','Service Advisor','text'],['booked_by','Booked By','text'],['mechanic','Mechanic','text'],
 ['remarks','Remarks','text'],['costs','COGS total (₱)','number'],['online_expense','Online Expense (₱)','number'],
 ['rf_expense','RF Expense (₱)','number'],['items','Quotation items (JSON)','json'],
 ['payments','Payments (JSON)','json'],['cogs_items','Itemized COGS (JSON)','json']
];
const numericFields=new Set(['amount','quantity','unit_cost','costs','online_expense','rf_expense']);
const jsonFields=new Set(['items','payments','cogs_items']);
const stringify=(v:unknown)=>v==null?'':String(v);

export default function AdminTransactionEditor({target,onClose,onSaved}:{target:Target;onClose:()=>void;onSaved:()=>void}){
 const [row,setRow]=useState<DbRow|null>(null);
 const [form,setForm]=useState<Record<string,string>>({});
 const [branches,setBranches]=useState<{id:string;name:string}[]>([]);
 const [reason,setReason]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [initialLoading,setInitialLoading]=useState(true);
 const fields=target.type==='cash'?cashFields:posFields;
 const isRfpPart=row?.account==='Funds'&&row?.kind==='Expense';
 const isRfpRelease=row?.account==='Funds'&&row?.kind==='Additional Funds';

 const load=useCallback(async()=>{
  if(!supabase)return;
  setInitialLoading(true);setError('');
  const [result,branchResult]=await Promise.all([
   supabase.from(target.type==='cash'?'cash_transactions':'pos_accounts').select('*').eq('id',target.id).single(),
   supabase.from('branches').select('id,name').order('name')
  ]);
  if(result.error)setError(result.error.message);
  else {
   const rec=result.data as DbRow;
   setRow(rec);
   const next:Record<string,string>={};
   for(const [key] of target.type==='cash'?cashFields:posFields){
    next[key]=jsonFields.has(key)?JSON.stringify(rec[key]??[],null,2):stringify(rec[key]);
   }
   setForm(next);
  }
  if(branchResult.error)setError(previous=>previous||branchResult.error!.message);
  else setBranches((branchResult.data||[]) as {id:string;name:string}[]);
  setInitialLoading(false);
 },[target.id,target.type]);
 useEffect(()=>{void load()},[load]);

 const estimatedTotal=useMemo(()=>isRfpPart?(Number(form.quantity||0)*Number(form.unit_cost||0)):null,[isRfpPart,form.quantity,form.unit_cost]);
 const set=(key:string,value:string)=>setForm(v=>({...v,[key]:value}));
 async function save(){
  if(!supabase||!row||busy)return;
  setError('');
  if(reason.trim().length<5){setError('Please enter a reason with at least 5 characters.');return;}
  const patch:Record<string,unknown>={};
  try {
   for(const [key] of fields){
    if(key==='category'&&isRfpPart)continue;
    if(key==='amount'&&(isRfpPart||isRfpRelease))continue;
    const value=form[key]??'';
    const original=jsonFields.has(key)?JSON.stringify(row[key]??[]):stringify(row[key]);
    if(jsonFields.has(key)){
     const parsed=JSON.parse(value);
     if(!Array.isArray(parsed))throw Error(`${key} must be a JSON array.`);
     if(JSON.stringify(parsed)!==JSON.stringify(row[key]??[]))patch[key]=parsed;
    }else if(numericFields.has(key)){
     if(value.trim()==='')throw Error(`${key} is required.`);
     const number=Number(value);
     if(!Number.isFinite(number))throw Error(`${key} must be a valid number.`);
     if(number!==Number(row[key]??0))patch[key]=number;
    }else if(value!==original){
     patch[key]=value.trim()||null;
    }
   }
   if(!Object.keys(patch).length){setError('There are no changed fields to save.');return;}
   setBusy(true);
   const {error:rpcError}=await supabase.rpc(target.type==='cash'?'admin_edit_cash':'admin_edit_pos',{
    p_id:target.id,p_patch:patch,p_reason:reason.trim()
   });
   if(rpcError)throw rpcError;
   onSaved();onClose();
  }catch(e:unknown){setError(e instanceof Error?e.message:'Unable to save changes.');}
  finally{setBusy(false);}
 }
 return <div className="modalback" onMouseDown={e=>{if(e.currentTarget===e.target)onClose()}}>
  <div className="modal wide" role="dialog" aria-modal="true" aria-label="Admin Edit Transaction" style={{maxWidth:880,maxHeight:'92vh',overflowY:'auto'}}>
   <div className="hrow between wrap"><div><div className="eyebrow">Admin / Super Admin only</div><h2>Edit {target.type==='cash'?'Fund Transaction':'POS / Sales Transaction'}</h2><p className="small muted">{target.id} · Original records are preserved in the audit log.</p></div><button className="btn ghost" onClick={onClose}>Close</button></div>
   {error&&<div className="notice" role="alert">{error}</div>}
   {initialLoading&&<p className="muted">Loading original transaction…</p>}
   {row&&<>
    <p className="notice">Testing mode: no Submit Report. Every successful edit requires a reason and records old/new values, the editing Admin, and timestamp. Changes are saved atomically.</p>
    {(isRfpPart||isRfpRelease)&&<p className="small muted">{isRfpPart?'RFP category stays Parts only. Amount is calculated from quantity × unit cost.':'Released replenishment amount is tied to an approved disbursement and cannot be changed directly.'} Amount changes already covered by an RFP disbursement are protected from inconsistent totals.</p>}
    <div className="grid2">
     {fields.map(([key,label,type])=>{
      const locked=(key==='category'&&isRfpPart)||(key==='amount'&&(isRfpPart||isRfpRelease));
      if(locked&&key==='category')return <label key={key}>{label}<div className="input">Parts Only</div></label>;
      if(locked&&key==='amount')return <label key={key}>{label}<div className="input">₱{Number(isRfpPart?estimatedTotal:row.amount).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}</div></label>;
      if(type==='branch')return <label key={key}>{label}<select className="input" value={form[key]||''} onChange={e=>set(key,e.target.value)}><option value="">Select branch</option>{branches.filter(b=>!isRfpPart||['Mastermind Mandaluyong','Underchargers Mandaluyong','Underchargers Las Piñas','Underchargers Quezon City'].includes(b.name)).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>;
      if(type==='json')return <label key={key} style={{gridColumn:'1 / -1'}}>{label}<textarea className="input" spellCheck={false} rows={7} style={{fontFamily:'monospace',fontSize:12}} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></label>;
      if(key==='description'||key==='notes'||key==='remarks')return <label key={key}>{label}<textarea className="input" rows={3} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></label>;
      return <label key={key}>{label}<input className="input" type={type==='number'?'number':type==='date'?'date':'text'} step={type==='number'?'any':undefined} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></label>;
     })}
    </div>
    <label style={{marginTop:12}}>Reason for Edit (required)<textarea className="input" rows={3} placeholder="Explain why this transaction needs correcting…" value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <div className="hrow wrap" style={{justifyContent:'flex-end',marginTop:14}}><button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="btn" disabled={busy||reason.trim().length<5} onClick={()=>void save()}>{busy?'Saving…':'Save Edit & Audit Log'}</button></div>
   </>}
  </div>
 </div>;
}
