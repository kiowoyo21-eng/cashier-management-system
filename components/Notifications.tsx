'use client';
import {createContext,useCallback,useContext,useState} from 'react';

type Kind='success'|'error'|'warning'|'info';
type Toast={id:number;kind:Kind;message:string;duration:number};
const Ctx=createContext<(message:string,kind?:Kind)=>void>(()=>{});
let nextId=0;

const life:Record<Kind,number>={success:3000,info:3000,warning:4000,error:5000};

export function NotificationProvider({children}:{children:React.ReactNode}){
 const [items,setItems]=useState<Toast[]>([]);
 const dismiss=useCallback((id:number)=>setItems(s=>s.filter(x=>x.id!==id)),[]);
 const notify=useCallback((message:string,kind:Kind='info')=>{
  const id=++nextId,duration=life[kind];
  setItems(s=>[...s.slice(-3),{id,kind,message,duration}]);
  window.setTimeout(()=>dismiss(id),duration+250);
 },[dismiss]);
 return <Ctx.Provider value={notify}>{children}<div className="toast-stack" role="status" aria-live="polite">{items.map(t=><div className={'cms-toast '+t.kind} style={{'--toast-life':`${t.duration}ms`} as React.CSSProperties} key={t.id}><div><strong>{t.kind==='error'?'Action failed':t.kind==='success'?'Success':t.kind==='warning'?'Attention':'Notice'}</strong><p>{t.message}</p></div><button aria-label="Dismiss notification" onClick={()=>dismiss(t.id)}>×</button></div>)}</div></Ctx.Provider>
}

export const useNotify=()=>useContext(Ctx);
