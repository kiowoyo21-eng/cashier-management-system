"use client";
import {useEffect,useRef,useState} from "react";
import {CalendarDays,ChevronLeft,ChevronRight} from "lucide-react";

type Props={value:string;onChange:(value:string)=>void;min?:string;max?:string;label?:string;disabled?:boolean;onlyThursday?:boolean};
const pad=(v:number)=>String(v).padStart(2,"0");
const iso=(year:number,month:number,day:number)=>`${year}-${pad(month+1)}-${pad(day)}`;
const startView=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(`${value}T12:00:00`):new Date();
export default function CalendarDatePicker({value,onChange,min,max,label,disabled,onlyThursday}:Props){
 const [open,setOpen]=useState(false),[view,setView]=useState(()=>startView(value));
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false)};const onOutside=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)};window.addEventListener("keydown",onKey);document.addEventListener("mousedown",onOutside);return()=>{window.removeEventListener("keydown",onKey);document.removeEventListener("mousedown",onOutside)}},[open]);
 const y=view.getFullYear(),m=view.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate();
 const changeMonth=(n:number)=>setView(new Date(y,m+n,1,12));
 const format=value?startView(value).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}):"Choose date";
 return <div className="uc-date-picker" ref={ref}>
  <button type="button" className="uc-date-trigger" aria-label={label||"Choose date"} aria-expanded={open} disabled={disabled} onClick={()=>{setView(startView(value));setOpen(v=>!v)}}><span>{format}</span><CalendarDays size={16}/></button>
  {open&&<div className="uc-date-popover" role="dialog" aria-label={label||"Date calendar"}>
   <div className="uc-date-head"><button type="button" aria-label="Previous month" onClick={()=>changeMonth(-1)}><ChevronLeft size={16}/></button><b>{view.toLocaleDateString("en-PH",{month:"long",year:"numeric"})}</b><button type="button" aria-label="Next month" onClick={()=>changeMonth(1)}><ChevronRight size={16}/></button></div>
   <div className="uc-date-grid">{["S","M","T","W","T","F","S"].map((d,i)=><span className="uc-date-weekday" key={i}>{d}</span>)}{Array.from({length:first},(_,i)=><span key={`empty-${i}`}/>)}{Array.from({length:days},(_,i)=>{const day=i+1,date=iso(y,m,day),invalid=Boolean(min&&date<min||max&&date>max||onlyThursday&&new Date(`${date}T12:00:00`).getDay()!==4);return <button type="button" key={date} className={date===value?"picked":""} disabled={invalid} onClick={()=>{onChange(date);setOpen(false)}}>{day}</button>})}</div>
   {onlyThursday&&<p className="uc-date-footnote">Select a Thursday; Wednesday cutoff end is automatic.</p>}
   <button type="button" className="uc-date-today" onClick={()=>{const now=new Date(),date=iso(now.getFullYear(),now.getMonth(),now.getDate());if(!onlyThursday&&(!min||date>=min)&&(!max||date<=max)){onChange(date);setOpen(false)}else setView(now)}}>{onlyThursday?"Jump to current month":"Today"}</button>
  </div>}
 </div>;
}
