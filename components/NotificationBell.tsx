'use client';
import {useEffect,useState} from 'react';
import {Bell} from 'lucide-react';
import {supabase} from '../lib/supabase';
type Notice={title:string;detail:string};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const hour=()=>Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',hour12:false,hour:'2-digit'}).format(new Date()));
export default function NotificationBell({role}:{role:string}){
 const [items,setItems]=useState<Notice[]>([]),[open,setOpen]=useState(false),[loading,setLoading]=useState(true);
 useEffect(()=>{let alive=true;async function load(){if(!supabase)return;try{
 const {data:{user}}=await supabase.auth.getUser();if(!user)return;const notices:Notice[]=[];
 const {data:p}=await supabase.from('profiles').select('branch_id').eq('id',user.id).maybeSingle();
 if(role==='Cashier'&&p?.branch_id){const {data}=await supabase.from('daily_cash_counts').select('cash_account,count_type').eq('branch_id',p.branch_id).eq('business_date',today());const has=(account:string,type:string)=>(data||[]).some(x=>x.cash_account===account&&x.count_type===type);
 for(const account of ['Petty Cash','Funds']){if(!has(account,'BOD'))notices.push({title:hour()>=9?'Opening Cash Count Required':'Opening Cash Count',detail:`${account} — ${hour()>=9?'Deadline 9:30 AM':'Due 9:30 AM'}`});if(hour()>=18&&!has(account,'EOD'))notices.push({title:'Closing Cash Count Overdue',detail:`${account} — Submit the required incident report at next login`});}
 }
 if(['Branch Manager','Admin','Super Admin'].includes(role)){const {data}=await supabase.from('cash_incident_reports').select('incident_type,cash_account,status').eq('status','Pending BM Review').limit(20);for(const n of data||[])notices.push({title:String(n.incident_type).replace('Missed EOD','Missed Closing Cash Count').replace('Late BOD','Late Opening Cash Count').replace('BOD Discrepancy','Opening Cash Count Discrepancy').replace('Missed Turnover','Missed Friday Fund Handover'),detail:`${n.cash_account} · Pending BM Review`});}
 if(alive)setItems(notices);
 }catch{}finally{if(alive)setLoading(false)}}void load();const id=setInterval(()=>void load(),60000);return()=>{alive=false;clearInterval(id)}},[role]);
 return <div style={{position:'relative'}}><button className="btn ghost" aria-label="Notifications" title="Notifications" onClick={()=>setOpen(v=>!v)} style={{padding:'9px 12px',position:'relative'}}><Bell size={17}/>{items.length>0&&<span className="bell-count">{items.length>9?'9+':items.length}</span>}</button>{open&&<div className="bell-panel"><strong>Notifications</strong>{loading?<p className="small muted">Loading…</p>:items.length===0?<p className="small muted">No current alerts</p>:items.map((n,i)=><div className="task-row" key={i}><div><strong>{n.title}</strong><div className="small muted">{n.detail}</div></div></div>)}<button className="btn ghost" style={{marginTop:8}} onClick={()=>setOpen(false)}>Close</button></div>}</div>
}
