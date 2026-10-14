"use client";
import {useEffect,useState,type ChangeEvent,type FormEvent} from "react";
import {AlertTriangle,ArrowRight,BriefcaseBusiness,FileCheck2,FileUp,Info,Send,UserRound} from "lucide-react";
import {useLocalRecords} from "../lib/useLocalRecords";
import {BRANCHES,DEFAULT_HIRING_FORMS,HIRING_FORMS_KEY,RECRUITMENT_KEY,candidateRequirements,initialApplicants,type ApplicantRecord} from "../lib/recruitmentCatalog";

type ApplicationFields={fullName:string;email:string;phone:string;position:string;preferredBranch:string;experienceYears:string;totalYears:string;education:string;introduction:string};
const BLANK:ApplicationFields={fullName:"",email:"",phone:"",position:"",preferredBranch:"",experienceYears:"",totalYears:"",education:"",introduction:""};
const MAX_RESUME_BYTES=10*1024*1024;
const ALLOWED_EXTENSIONS=/\.(pdf|doc|docx)$/i;
function validEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}
function validPhone(value:string){return /^[+\d\s().-]+$/.test(value)&&value.replace(/\D/g,"").length>=7&&value.replace(/\D/g,"").length<=15}
export default function PublicJobApplication(){
 const [forms]=useLocalRecords(HIRING_FORMS_KEY,DEFAULT_HIRING_FORMS);
 const [form,setForm]=useState<ApplicationFields>(BLANK);
 const [skills,setSkills]=useState<Record<string,"Yes"|"No"|"Not provided">>({});
 const [answers,setAnswers]=useState<Record<string,string>>({});
 const [resume,setResume]=useState<File|null>(null);
 const [fileError,setFileError]=useState("");
 const [errors,setErrors]=useState<string[]>([]);
 const [saved,setSaved]=useState("");
 const published=forms.filter(f=>f.status==="Published");
 const selected=forms.find(f=>f.id===form.position);
 useEffect(()=>{const requested=new URLSearchParams(window.location.search).get("position");if(requested)setForm(p=>({...p,position:requested}))},[]);
 const update=(field:keyof ApplicationFields,value:string)=>{setForm(p=>({...p,[field]:value}));setSaved("");if(errors.length)setErrors([])};
 function chooseResume(e:ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0]||null;setFileError("");setResume(null);if(!file)return;if(!ALLOWED_EXTENSIONS.test(file.name)){setFileError("Choose PDF, DOC, or DOCX.");e.target.value="";return}if(file.size===0||file.size>MAX_RESUME_BYTES){setFileError("Resume must be 10 MB or less.");e.target.value="";return}setResume(file)}
 function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const issues:string[]=[];
  if(form.fullName.trim().length<2)issues.push("Enter full name.");
  if(!validEmail(form.email.trim()))issues.push("Enter a valid email.");
  if(!validPhone(form.phone.trim()))issues.push("Enter a valid contact number.");
  if(!selected||selected.status!=="Published")issues.push("Choose an open position.");
  if(!form.preferredBranch)issues.push("Choose a branch.");
  if(form.experienceYears===""||Number(form.experienceYears)<0)issues.push("Enter years of job-related experience (0 is allowed).");
  if(!form.education.trim())issues.push("Enter your education or relevant training.");
  if(!resume||!ALLOWED_EXTENSIONS.test(resume.name)||resume.size===0||resume.size>MAX_RESUME_BYTES)issues.push("Attach a PDF/DOC/DOCX resume up to 10 MB.");
  if(selected?.qualifications.some(q=>!skills[q]||skills[q]==="Not provided"))issues.push("Answer all position qualification questions.");
  if(selected?.questions.some(q=>!answers[q]?.trim()))issues.push("Answer required position-specific questions.");
  setErrors(issues);if(issues.length){document.getElementById("application-errors")?.scrollIntoView({block:"center",behavior:"smooth"});return}
  if(!selected||!resume)return;
  if(!window.confirm("Save this as a TEST application on this browser only? No application or resume will be sent to HR on another device."))return;
  try{
   const key=`uc-hr-ui-${RECRUITMENT_KEY}`;
   const raw=window.localStorage.getItem(key);
   const records:ApplicantRecord[]=raw?JSON.parse(raw):initialApplicants;
   if(records.some(r=>r.role===selected.position&&r.email.toLowerCase()===form.email.trim().toLowerCase())){setErrors(["A test application with this email already exists for this position on this browser."]);return}
   const number=records.reduce((n,r)=>Math.max(n,Number(r.id.replace("APP-",""))||1000),1000)+1;
   const record:ApplicantRecord={id:`APP-${number}`,name:form.fullName.trim(),email:form.email.trim().toLowerCase(),phone:form.phone.trim(),role:selected.position,branch:form.preferredBranch,submitted:new Date().toLocaleDateString("en-CA"),stage:"New Applicant",notes:form.introduction.trim(),history:[`${new Date().toLocaleString("en-PH")} · Test application added in this browser`],relevantYears:Number(form.experienceYears),totalYears:form.totalYears===""?null:Number(form.totalYears),education:form.education.trim(),qualifications:skills,answers,requirements:candidateRequirements(selected),resumeName:resume.name};
   window.localStorage.setItem(key,JSON.stringify([record,...records]));
   setSaved(`Test application ${record.id} saved in this browser. Open Recruitment & Hiring → Hiring Cycle → ${selected.position} in the same browser to review it. No actual submission or file upload occurred.`);
   setForm(BLANK);setAnswers({});setSkills({});setResume(null);
  }catch{setErrors(["Could not save local test application. Browser storage may be disabled or full."])}
 }
 return <main className="public-ir-page"><div className="public-ir-shell">
  <header className="public-ir-brand"><div className="brand-mark" aria-hidden="true">UC</div><div><strong>UNDERCHARGERS</strong><span>Careers · Job Application</span></div><a className="public-ir-home" href="/">HR Portal <ArrowRight size={14}/></a></header>
  <div className="public-ir-header"><span className="public-ir-eyebrow"><BriefcaseBusiness size={15}/> Careers</span><h1>Position Application</h1><p>Select an available position and complete its specific application requirements.</p></div>
  <div className="public-ir-unavailable" role="note"><AlertTriangle size={20}/><div><strong>Frontend preview — test data only.</strong><p>Applications are saved on this browser only for workflow testing. They are NOT submitted to HR or visible on other devices. Resume contents are NOT uploaded or retained. Do not enter real personal information.</p></div></div>
  {saved&&<div className="public-ir-unavailable" role="status"><FileCheck2 size={20}/><div><strong>Test application recorded</strong><p>{saved}</p></div></div>}
  <form className="public-ir-form" noValidate onSubmit={submit}>
   <section className="public-ir-card"><div className="public-ir-section-title"><span className="public-ir-section-icon"><BriefcaseBusiness size={20}/></span><div><h2>Position & Requirements</h2></div></div><div className="public-ir-fields"><div className="public-ir-two"><label className="public-ir-field">Position Applied For <em>*</em><select required value={form.position} onChange={e=>{update("position",e.target.value);setSkills({});setAnswers({})}}><option value="">Select open position</option>{published.map(p=><option key={p.id} value={p.id}>{p.position}</option>)}</select></label><label className="public-ir-field">Preferred Branch <em>*</em><select required value={form.preferredBranch} onChange={e=>update("preferredBranch",e.target.value)}><option value="">Select branch</option>{BRANCHES.map(b=><option key={b}>{b}</option>)}</select></label></div>{selected&&selected.status!=="Published"&&<p className="public-application-file-error">This position is not currently accepting applications.</p>}{selected&&selected.status==="Published"&&<div className="hire-public-requirements"><strong>Position Screening Criteria</strong><small>{selected.minimumYears}+ years relevant experience preferred · {selected.education||"Education reviewed by HR"}</small>{selected.qualifications.map(q=><label key={q} className="public-ir-field">{q} <em>*</em><select required value={skills[q]||"Not provided"} onChange={e=>setSkills(p=>({...p,[q]:e.target.value as "Yes"|"No"|"Not provided"}))}><option value="Not provided">Select</option><option value="Yes">Yes</option><option value="No">No</option></select></label>)}</div>}</div></section>
   <section className="public-ir-card"><div className="public-ir-section-title"><span className="public-ir-section-icon"><UserRound size={20}/></span><div><h2>Applicant Information</h2></div></div><div className="public-ir-fields"><label className="public-ir-field">Full Name <em>*</em><input required maxLength={160} autoComplete="name" value={form.fullName} onChange={e=>update("fullName",e.target.value)}/></label><div className="public-ir-two"><label className="public-ir-field">Email <em>*</em><input required type="email" autoComplete="email" maxLength={180} value={form.email} onChange={e=>update("email",e.target.value)}/></label><label className="public-ir-field">Contact Number <em>*</em><input required type="tel" autoComplete="tel" value={form.phone} onChange={e=>update("phone",e.target.value)}/></label></div><div className="public-ir-two"><label className="public-ir-field">Years of Relevant Experience <em>*</em><input required type="number" min="0" max="60" value={form.experienceYears} onChange={e=>update("experienceYears",e.target.value)} placeholder="0 for no experience"/></label><label className="public-ir-field">Total Work Experience (years) <span>Optional</span><input type="number" min="0" max="60" value={form.totalYears} onChange={e=>update("totalYears",e.target.value)}/></label></div><label className="public-ir-field">Highest Education / Relevant Training <em>*</em><input required maxLength={180} value={form.education} onChange={e=>update("education",e.target.value)}/></label>{selected?.questions.map(q=><label key={q} className="public-ir-field">{q} <em>*</em><textarea required rows={2} maxLength={1200} value={answers[q]||""} onChange={e=>setAnswers(p=>({...p,[q]:e.target.value}))}/></label>)}<label className="public-ir-field">Resume / CV <em>*</em><div className="public-application-upload"><FileUp size={23}/><div><strong>{resume?.name||"Choose resume / CV"}</strong><small>{resume?`${(resume.size/1024/1024).toFixed(2)} MB · Test selection only`:"PDF, DOC, DOCX · Max 10 MB"}</small></div><input type="file" required accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={chooseResume}/></div>{fileError&&<small className="public-application-file-error">{fileError}</small>}</label><label className="public-ir-field">Short Introduction <span>Optional</span><textarea rows={3} value={form.introduction} onChange={e=>update("introduction",e.target.value)} maxLength={1200}/></label><div className="public-ir-help"><Info size={16}/><span>Years and skills are self-reported. HR will verify supporting documents and assess qualifications during screening.</span></div></div></section>
   {errors.length>0&&<div className="public-ir-errors" id="application-errors" role="alert"><strong>Please review:</strong><ul>{errors.map(x=><li key={x}>{x}</li>)}</ul></div>}
   <div className="public-ir-foot-actions"><span><FileCheck2 size={15}/> Local browser test only · No backend submission</span><button type="submit" className="primary"><Send size={17}/> Save Test Application</button></div>
  </form><footer className="public-ir-footer"><span>Underchargers · Careers</span><span>Test form · No secure applications enabled</span></footer>
 </div></main>
}
