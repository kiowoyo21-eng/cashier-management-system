"use client";
import {useState} from "react";
import {ArrowLeft,ArrowRight,Folders,Files,FileCheck2} from "lucide-react";
import DocumentWorkspace from "./DocumentWorkspace";
import TemplateLibraryWorkspace from "./TemplateLibraryWorkspace";
import DocumentIntake from "./DocumentIntake";
import type {Branch,Role} from "../lib/mock";

type Section="library"|"templates"|"verification";
const spaces=[
 {id:"library" as Section,label:"Document Library",hint:"Browse employee files and organized document folders",Icon:Folders,tone:"gold"},
 {id:"templates" as Section,label:"Document Templates",hint:"Upload existing templates or create new HR documents",Icon:Files,tone:"blue"},
 {id:"verification" as Section,label:"Document Verification",hint:"Review pending submissions and supporting evidence",Icon:FileCheck2,tone:"green"}
];
export default function DocumentOperationsHub({role,branch}:{role:Role;branch:Branch}){
 const [section,setSection]=useState<Section|null>(null);
 const selected=spaces.find(s=>s.id===section);
 return <div className="docops-root">
  {section===null?<><div className="docops-intro"><p>Select a workspace to manage HR records and templates.</p></div><div className="docops-cards">{spaces.map(({id,label,hint,Icon,tone})=><button key={id} type="button" className="docops-card" onClick={()=>setSection(id)}><span className={`docops-visual ${tone}`}><Icon size={34} strokeWidth={1.7}/></span><span className="docops-card-body"><strong>{label}</strong><small>{hint}</small><ArrowRight size={16}/></span></button>)}</div><p className="docops-hint">Employee signing is initiated inside Onboarding, Incident Reports, Asset Accountability, and Payslips—not through a separate signing module.</p></>:
  <><div className="docops-backbar"><button className="secondary" type="button" onClick={()=>setSection(null)}><ArrowLeft size={15}/> All Document Workspaces</button><strong>{selected?.label}</strong></div>{section==="library"&&<DocumentWorkspace branch={branch} role={role}/>}{section==="templates"&&<TemplateLibraryWorkspace role={role}/>}{section==="verification"&&<DocumentIntake branch={branch} role={role}/>}</>}
 </div>
}
