'use client';

type Props={
 page:number;
 total:number;
 pageSize:number;
 onPageChange:(page:number)=>void;
 onPageSizeChange?:(size:number)=>void;
};

export default function Pagination({page,total,pageSize,onPageChange,onPageSizeChange}:Props){
 const pages=Math.max(1,Math.ceil(total/pageSize));
 const safe=Math.min(Math.max(1,page),pages);
 const start=total===0?0:(safe-1)*pageSize+1;
 const end=Math.min(total,safe*pageSize);
 const nearby=Array.from({length:pages},(_,i)=>i+1).filter(p=>p===1||p===pages||Math.abs(p-safe)<=1);
 const display:number[]=[];
 for(const p of nearby){if(display.length&&p-display[display.length-1]>1)display.push(0);display.push(p)}
 return <div className="pagination-bar">
  <div className="small muted">Showing {start}–{end} of {total}</div>
  <div className="hrow wrap">
   {onPageSizeChange&&<select className="input pagination-size" value={pageSize} onChange={e=>onPageSizeChange(Number(e.target.value))}>{[20,50,100].map(n=><option key={n} value={n}>{n} / page</option>)}</select>}
   <button className="btn ghost" disabled={safe<=1} onClick={()=>onPageChange(safe-1)}>Previous</button>
   {display.map((p,i)=>p===0?<span className="pagination-gap" key={`gap-${i}`}>…</span>:<button key={p} className={'btn '+(p===safe?'':'ghost')} onClick={()=>onPageChange(p)}>{p}</button>)}
   <button className="btn ghost" disabled={safe>=pages} onClick={()=>onPageChange(safe+1)}>Next</button>
  </div>
 </div>
}
