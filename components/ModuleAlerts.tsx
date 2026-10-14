"use client";
import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from "react";
import {Bell,ChevronRight,X} from "lucide-react";
import type {Branch,ModuleId} from "../lib/mock";
export type ModuleAlert={id:string;title:string;detail:string;branch?:Branch|string;level?:"urgent"|"normal";action?:string};
type Registry=Partial<Record<ModuleId,ModuleAlert[]>>;
type ModuleNoticeAPI={registry:Registry;publish:(module:ModuleId,entries:ModuleAlert[])=>void;clear:()=>void};
const C=createContext<ModuleNoticeAPI|null>(null);
export function ModuleAlertsProvider({children}:{children:ReactNode}){
 const [registry,setRegistry]=useState<Registry>({});
 const value=useMemo<ModuleNoticeAPI>(()=>({registry,publish:(module,entries)=>setRegistry(old=>JSON.stringify(old[module]||[])===JSON.stringify(entries)?old:{...old,[module]:entries}),clear:()=>setRegistry({})}),[registry]);
 return <C.Provider value={value}>{children}</C.Provider>;
}
/** Loan alerts retain their legacy local key but display under Payroll Management. */
const groupedAlerts=(registry:Registry,module:ModuleId):ModuleAlert[]=>module==="payroll"?[...(registry.payroll||[]),...(registry.loans||[])]:registry[module]||[];
export function useModuleAlerts(){const context=useContext(C);if(!context)throw new Error("ModuleAlertsProvider required");return context}
export function usePublishModuleAlerts(module:ModuleId,alerts:ModuleAlert[]){
 const {publish}=useModuleAlerts();const serialized=JSON.stringify(alerts);
 useEffect(()=>{publish(module,JSON.parse(serialized) as ModuleAlert[])},[module,serialized,publish]);
}
export function ModuleAlertButton({module,branch,onOpen}:{module:ModuleId;branch:Branch;onOpen?:(alert:ModuleAlert)=>void}){
 const {registry}=useModuleAlerts();const [open,setOpen]=useState(false);
 const alerts=groupedAlerts(registry,module).filter(x=>!x.branch||branch==="All Shops"||x.branch==="All Shops"||x.branch===branch);
 return <div className="mu-bell-wrap"><button type="button" className="mu-bell" aria-label={`${alerts.length} module notifications`} aria-expanded={open} onClick={()=>setOpen(p=>!p)}><Bell size={17}/>{alerts.length>0&&<span>{alerts.length}</span>}</button>{open&&<div className="mu-notice-popover" role="region" aria-label="Module notifications"><div className="mu-notice-head"><b>Module Notifications</b><button type="button" aria-label="Close" onClick={()=>setOpen(false)}><X size={15}/></button></div>{alerts.length===0?<p className="mu-notice-empty">No pending actions in the loaded records.</p>:alerts.map(item=><button key={item.id} type="button" className="mu-notice-item" onClick={()=>{onOpen?.(item);if(module==="payroll"&&typeof window!=="undefined"){if(item.id.startsWith("loan-"))window.dispatchEvent(new CustomEvent("ucmm-payroll-open",{detail:{area:"loans"}}));else if(item.action?.startsWith("payroll:"))window.dispatchEvent(new CustomEvent("ucmm-payroll-open",{detail:{area:item.action.slice(8)}}));}setOpen(false)}}><span className={item.level==="urgent"?"mu-notice-dot is-urgent":"mu-notice-dot"}/><span><b>{item.title}</b><small>{item.detail}</small></span><ChevronRight size={14}/></button>)}</div>}</div>
}
export function ModuleAlertSummary({module,branch}:{module:ModuleId;branch:Branch}){const {registry}=useModuleAlerts();const alerts=groupedAlerts(registry,module).filter(x=>!x.branch||branch==="All Shops"||x.branch==="All Shops"||x.branch===branch);if(!alerts.length)return <span>No pending actions in loaded records</span>;return <span>{alerts.length} requiring action · {alerts.filter(a=>a.level==="urgent").length} high priority</span>}
export function DashboardModuleAlerts({branch,onNavigate,allowed}:{branch:Branch;onNavigate:(id:ModuleId)=>void;allowed:ModuleId[]}){
 const {registry}=useModuleAlerts();const items=allowed.filter(id=>id!=="loans").map(id=>({id,items:groupedAlerts(registry,id).filter(x=>!x.branch||branch==="All Shops"||x.branch==="All Shops"||x.branch===branch)})).filter(x=>x.items.length>0);
 return <section className="panel mu-dashboard-alerts"><div className="panel-head"><h3>Pending Actions by Module</h3></div>{items.length===0?<p className="muted">Open each module to review its records and current action items.</p>:<div className="mu-dashboard-grid">{items.map(x=><button type="button" key={x.id} onClick={()=>onNavigate(x.id)}><span><b>{x.id==="lifecycle"?"Recruitment & Hiring":x.id==="ir"?"Incident Reports":x.id==="compliance"?"Government Compliance":x.id==="employees"?"Employee 201":x.id==="assets"?"Assets & Devices":x.id==="leave"?"Leave Management":x.id==="documents"?"Documents":x.id==="payroll"?"Payroll Management":x.id}</b><small>{x.items.filter(y=>y.level==="urgent").length} urgent</small></span><strong>{x.items.length}</strong></button>)}</div>}</section>;
}
