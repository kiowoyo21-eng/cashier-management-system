'use client';
import {useMemo,useState} from 'react';
import {LedgerEntry,PosEntry} from '../lib/store';
import {supabase} from '../lib/supabase';

const plate=(s?:string)=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export default function RfpPartPosLink({expense,allPos,role,onChanged}:{expense:LedgerEntry;allPos:PosEntry[];role:string;onChanged:()=>void}){
 const [selected,setSelected]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const matches=useMemo(()=>allPos.filter(p=>p.status==='Pending'&&p.branchId===expense.branchId&&plate(p.plate)===plate(expense.plateNumber)&&!!plate(p.plate)&&!['NA','NONE','SHOP'].includes(plate(p.plate))),[allPos,expense]);
 if(expense.kind!=='Expense'||expense.category!=='Part')return <span>—</span>;
 if(expense.linkedPosId)return <span title="This parts expense can only be pinned to one POS" className="badge">Pinned: {expense.linkedPosId}</span>;
 if(role!=='PB')return <span className="muted small">Not linked</span>;
 async function link(){if(!supabase||!selected)return;setBusy(true);setError('');try{const {error:e}=await supabase.rpc('link_rfp_part_to_pos',{p_cash_id:expense.id,p_pos_id:selected});if(e)throw e;onChanged()}catch(e:any){setError(e.message||'Linking failed')}finally{setBusy(false)}}
 return <div style={{minWidth:195}}>
  {matches.length?<div className="hrow wrap" style={{gap:4}}><select className="input" aria-label="Select matching POS" value={selected} onChange={e=>setSelected(e.target.value)} style={{maxWidth:165}}><option value="">Select matching POS</option>{matches.map(p=><option key={p.id} value={p.id}>{p.id} · {p.client}</option>)}</select><button className="btn ghost" disabled={busy||!selected} onClick={e=>{e.stopPropagation();void link()}}>{busy?'Pinning…':'Pin once'}</button></div>:<span className="muted small">No matching Pending POS</span>}
  {error&&<div role="alert" style={{fontSize:12,color:'#b92e2e'}}>{error}</div>}
 </div>
}
