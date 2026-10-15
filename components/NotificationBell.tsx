'use client';
import {useEffect,useState} from 'react';
import {Bell} from 'lucide-react';
import {supabase} from '../lib/supabase';

type Notice={title:string;detail:string};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const minuteOfDay=()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',hour12:false,hour:'2-digit',minute:'2-digit'}).formatToParts(new Date());const h=Number(parts.find(x=>x.type==='hour')?.value||0),m=Number(parts.find(x=>x.type==='minute')?.value||0);return h*60+m};

export default function NotificationBell({role}:{role:string}){
 const [items,setItems]=useState<Notice[]>([]),[open,setOpen]=useState(false),[loading,setLoading]=useState(true);
 useEffect(()=>{let alive=true;async function load(){if(!supabase)return;try{
  const {data:{user}}=await supabase.auth.getUser();if(!user)return;const notices:Notice[]=[];const clock=minuteOfDay();
  const {data:p}=await supabase.from('profiles').select('branch_id').eq('id',user.id).maybeSingle();
  if(role==='Cashier'&&p?.branch_id){
   const [{data:counts},{data:turnovers}]=await Promise.all([
    supabase.from('daily_cash_counts').select('cash_account,count_type').eq('branch_id',p.branch_id).eq('business_date',today()),
    supabase.from('daily_sales_handovers').select('id').eq('branch_id',p.branch_id).eq('business_date',today()).limit(1)
   ]);
   const has=(account:string,type:string)=>(counts||[]).some(x=>x.cash_account===account&&x.count_type===type);
   for(const account of ['Sales','Petty Cash']){
    const label=account==='Petty Cash'?'Revolving Fund':'Sales';
    if(!has(account,'BOD'))notices.push({title:'Opening Cash Count Required',detail:`${label} — complete before using protected cashier operations`});
   }
   if(clock>=1010&&clock<1020&&!has('Petty Cash','EOD'))notices.push({title:'Revolving Fund Closing Cash Count Required Soon',detail:'Complete the Revolving Fund Closing Cash Count before 5:00 PM.'});
   if(clock>=1010&&clock<1020&&!(turnovers||[]).length)notices.push({title:'Sales Turnover Required Soon',detail:'Complete today’s Sales Turnover before 5:00 PM.'});
   if(clock>=1020&&!has('Petty Cash','EOD'))notices.push({title:'Revolving Fund Closing Cash Count Required',detail:'Complete the required Revolving Fund closing cash count.'});
   if(clock>=1020&&!(turnovers||[]).length)notices.push({title:'Sales Turnover Required',detail:'Count and turn over today’s Sales collections.'});
   if(has('Petty Cash','EOD')&&(turnovers||[]).length)notices.push({title:'Closing Tasks Complete',detail:'Revolving Fund Closing Cash Count and Sales Turnover are complete for today.'});
  }
  if(['Branch Manager','Admin','Super Admin'].includes(role)){
   const {data}=await supabase.from('cash_incident_reports').select('incident_type,cash_account,status').eq('status','Pending BM Review').limit(20);
   for(const n of data||[])notices.push({title:String(n.incident_type).replace('Missed EOD','Missed Closing Cash Count').replace('Late BOD','Late Opening Cash Count').replace('BOD Discrepancy','Opening Cash Count Discrepancy').replace('Missed Turnover','Missed Friday RFP Handover'),detail:`${n.cash_account==='Petty Cash'?'Revolving Fund':n.cash_account==='Funds'?'RFP':n.cash_account} · Pending BM Review`});
  }
  if(alive)setItems(notices);
 }catch{}finally{if(alive)setLoading(false)}}void load();const id=setInterval(()=>void load(),60000);return()=>{alive=false;clearInterval(id)}},[role]);
 return <div style={{position:'relative'}}><button className="btn ghost" aria-label="Notifications" title="Notifications" onClick={()=>setOpen(v=>!v)} style={{padding:'9px 12px',position:'relative'}}><Bell size={17}/>{items.length>0&&<span className="bell-count">{items.length>9?'9+':items.length}</span>}</button>{open&&<div className="bell-panel"><strong>Notifications</strong>{loading?<p className="small muted">Loading…</p>:items.length===0?<p className="small muted">No current alerts</p>:items.map((n,i)=><div className="task-row" key={i}><div><strong>{n.title}</strong><div className="small muted">{n.detail}</div></div></div>)}<button className="btn ghost" style={{marginTop:8}} onClick={()=>setOpen(false)}>Close</button></div>}</div>
}
