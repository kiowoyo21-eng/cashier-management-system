"use client";
import {createContext,useCallback,useContext,useState} from 'react';
type Kind='success'|'error'|'warning'|'info';
type Toast={id:number;kind:Kind;message:string};
const Ctx=createContext<(message:string,kind?:Kind)=>void>(()=>{});
let nextId=0;
export function NotificationProvider({children}:{children:React.ReactNode}){
 const [items,setItems]=useState<Toast[]>([]);
 const notify=useCallback((message:string,kind:Kind='info')=>{const id=++nextId;setItems(s=>[...s.slice(-3),{id,kind,message}]);},[]);
 return <Ctx.Provider value={notify}>{children}<div className="toast-stack" role="status" aria-live="polite">{items.map(t=><div className={'cms-toast '+t.kind} key={t.id}><div><strong>{t.kind==='error'?'Action failed':t.kind==='success'?'Success':t.kind==='warning'?'Attention':'Notice'}</strong><p>{t.message}</p></div><button aria-label="Dismiss notification" onClick={()=>setItems(s=>s.filter(x=>x.id!==t.id))}>×</button></div>)}</div></Ctx.Provider>
}
export const useNotify=()=>useContext(Ctx);
