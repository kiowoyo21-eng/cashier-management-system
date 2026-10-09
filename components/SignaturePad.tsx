'use client';
import {useEffect,useRef,useState} from 'react';
export default function SignaturePad({onChange}:{onChange:(image:string)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null); const active=useRef(false); const [drawn,setDrawn]=useState(false);
 useEffect(()=>{const c=canvas.current;if(!c)return;const ctx=c.getContext('2d');if(ctx){ctx.lineWidth=2.5;ctx.lineCap='round';ctx.strokeStyle='#172033';}},[]);
 function position(e:React.PointerEvent<HTMLCanvasElement>){const r=e.currentTarget.getBoundingClientRect();return {x:(e.clientX-r.left)*(e.currentTarget.width/r.width),y:(e.clientY-r.top)*(e.currentTarget.height/r.height)}}
 function down(e:React.PointerEvent<HTMLCanvasElement>){const c=canvas.current;if(!c)return;active.current=true;c.setPointerCapture(e.pointerId);const p=position(e);const ctx=c.getContext('2d');ctx?.beginPath();ctx?.moveTo(p.x,p.y);ctx?.lineTo(p.x+.1,p.y+.1);ctx?.stroke();setDrawn(true)}
 function move(e:React.PointerEvent<HTMLCanvasElement>){if(!active.current)return;const ctx=canvas.current?.getContext('2d');const p=position(e);ctx?.lineTo(p.x,p.y);ctx?.stroke()}
 function up(){if(!active.current)return;active.current=false;const c=canvas.current;if(c)onChange(c.toDataURL('image/png'))}
 function clear(){canvas.current?.getContext('2d')?.clearRect(0,0,700,200);setDrawn(false);onChange('')}
 return <div><canvas aria-label="Draw your signature" className="signature" ref={canvas} width={700} height={200} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}/><div className="hrow between"><span className="muted small">Sign with mouse, trackpad, or touch.</span><button type="button" className="btn ghost" disabled={!drawn} onClick={clear}>Clear signature</button></div></div>
}
