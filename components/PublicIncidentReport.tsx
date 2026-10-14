"use client";

import {useState, type FormEvent} from "react";
import {AlertTriangle, ArrowRight, ClipboardCheck, Send, FileText, Info, LockKeyhole, ShieldCheck} from "lucide-react";
import {getIncidentRouting, type IncidentRespondentType} from "../lib/incidentRouting";

type IncidentForm = {
  branch: string;
  respondentType: "" | IncidentRespondentType;
  respondentName: string;
  category: string;
  incidentDate: string;
  incidentLocation: string;
  description: string;
  witnesses: string;
  reporterName: string;
  phone: string;
  email: string;
};

const INITIAL:IncidentForm = {
  branch:"", respondentType:"", respondentName:"", category:"", incidentDate:"",
  incidentLocation:"", description:"", witnesses:"", reporterName:"", phone:"", email:"",
};
const BRANCHES = ["UC Mandaluyong","UC Las Piñas","UC Quezon City","MM Mandaluyong"];
const CATEGORIES = ["Workplace conflict","Misconduct / policy violation","Harassment / discrimination","Safety / health concern","Other concern"];
const TARGETS:{value:IncidentRespondentType;label:string}[] = [
  {value:"other_staff",label:"Employee / Other Staff"},
  {value:"branch_manager",label:"Branch Manager"},
  {value:"unsure",label:"Not sure"},
];

function validPhone(phone:string){
  const digits=phone.replace(/\D/g,"");
  return digits.length>=7 && digits.length<=15 && /^[+\d\s().-]+$/.test(phone);
}
function validEmail(email:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);}

export default function PublicIncidentReport(){
  const [form,setForm]=useState<IncidentForm>(INITIAL);
  const [errors,setErrors]=useState<string[]>([]);
  const update=<K extends keyof IncidentForm>(field:K,value:IncidentForm[K])=>{
    setForm(previous=>({...previous,[field]:value}));
    if(errors.length)setErrors([]);
  };
  const routing=form.respondentType?getIncidentRouting(form.respondentType):null;
  const routingLabel=form.respondentType==="branch_manager"?"HR only — Branch Manager excluded":form.respondentType==="other_staff"?"Branch Manager handles; HR copied":"HR screens the report first";

  function handleSubmit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const next:string[]=[];
    if(!form.reporterName.trim() || form.reporterName.trim().length<2)next.push("Enter your full name.");
    if(!form.phone.trim() && !form.email.trim())next.push("Provide at least one contact method: phone number or email.");
    if(form.phone.trim() && !validPhone(form.phone.trim()))next.push("Enter a valid contact number (7–15 digits).");
    if(form.email.trim() && !validEmail(form.email.trim()))next.push("Enter a valid email address.");
    if(!form.branch)next.push("Select the branch involved.");
    if(!form.respondentType)next.push("Select who is being reported.");
    if(!form.category)next.push("Select an incident category.");
    if(form.description.trim().length<30)next.push("Describe what happened in at least 30 characters.");
    setErrors(next);
    if(next.length)return;
    const recipient=getIncidentRouting(form.respondentType as IncidentRespondentType);
    const intended=recipient.handler==="HR"?"HR screening only":"Branch Manager, with HR copied";
    window.alert(`Form validated. Intended recipient: ${intended}.\n\nThis is a frontend preview: your incident report was NOT sent, saved, or received. Do not use this page for real confidential reports until secure submission is activated.`);
  }

  return <main className="public-ir-page">
    <div className="public-ir-shell">
      <header className="public-ir-brand">
        <div className="brand-mark" aria-hidden="true">UC</div>
        <div><strong>UNDERCHARGERS</strong><span>Employee Relations · Workplace Reporting</span></div>
        <a className="public-ir-home" href="/">HR Portal <ArrowRight size={14}/></a>
      </header>

      <div className="public-ir-header">
        <span className="public-ir-eyebrow"><ShieldCheck size={15}/> Workplace Incident Report</span>
        <h1>Report a workplace concern</h1>
        <p>No login required. Complete the fields below so the appropriate HR personnel can review your concern when reporting is activated.</p>
      </div>

      <div className="public-ir-unavailable" role="note">
        <AlertTriangle size={20}/>
        <div><strong>Preview only — reports are not being received yet.</strong>
          <p>Do not enter real confidential case details. The Submit button shows a preview alert only. No report is sent, saved, or delivered to HR/BM.</p>
        </div>
      </div>

      <form className="public-ir-form" onSubmit={handleSubmit} noValidate>
        <section className="public-ir-card">
          <div className="public-ir-section-title">
            <span className="public-ir-section-icon"><FileText size={20}/></span>
            <div><h2>Incident details</h2><p>Fields marked * are required.</p></div>
          </div>
          <div className="public-ir-fields">
            <div className="public-ir-two">
              <label className="public-ir-field">Branch involved <em>*</em>
                <select required value={form.branch} onChange={e=>update("branch",e.target.value)}>
                  <option value="">Select branch</option>
                  {BRANCHES.map(branch=><option value={branch} key={branch}>{branch}</option>)}
                </select>
              </label>
              <label className="public-ir-field">Incident category <em>*</em>
                <select required value={form.category} onChange={e=>update("category",e.target.value)}>
                  <option value="">Select category</option>
                  {CATEGORIES.map(category=><option key={category} value={category}>{category}</option>)}
                </select>
              </label>
            </div>

            <fieldset className="public-ir-target">
              <legend>Who is being reported? <em>*</em></legend>
              <div className="public-ir-target-options">
                {TARGETS.map(target=><label className={`public-ir-option ${form.respondentType===target.value?"selected":""}`} key={target.value}>
                  <input type="radio" name="respondent-role" checked={form.respondentType===target.value} onChange={()=>update("respondentType",target.value)}/>
                  <span><strong>{target.label}</strong></span>
                </label>)}
              </div>
              {routing&&<div className={`public-ir-route ${routing.handler==="HR"?"private":""}`} role="status" aria-live="polite">
                <LockKeyhole size={16}/><span><b>Intended route:</b> {routingLabel}</span>
              </div>}
            </fieldset>

            <label className="public-ir-field">Person involved <span>Optional, if known</span>
              <input value={form.respondentName} onChange={e=>update("respondentName",e.target.value)} placeholder="Name or position" maxLength={140}/>
            </label>
            <div className="public-ir-two">
              <label className="public-ir-field">Date of incident <span>Optional</span>
                <input type="date" value={form.incidentDate} onChange={e=>update("incidentDate",e.target.value)}/>
              </label>
              <label className="public-ir-field">Location / work area <span>Optional</span>
                <input value={form.incidentLocation} onChange={e=>update("incidentLocation",e.target.value)} placeholder="Example: workshop, front desk" maxLength={180}/>
              </label>
            </div>
            <label className="public-ir-field">What happened? <em>*</em>
              <textarea rows={5} maxLength={5000} required value={form.description} onChange={e=>update("description",e.target.value)} placeholder="Explain what happened, including when, where, and who was involved if known."/>
              <small className="public-ir-hint">At least 30 characters. Please share factual details.</small>
            </label>
            <label className="public-ir-field">Witnesses / additional people <span>Optional</span>
              <input value={form.witnesses} onChange={e=>update("witnesses",e.target.value)} placeholder="Names or positions, if any" maxLength={500}/>
            </label>
          </div>
        </section>

        <section className="public-ir-card">
          <div className="public-ir-section-title public-ir-section-title-compact">
            <span className="public-ir-section-icon"><ClipboardCheck size={20}/></span>
            <div><h2>Reporter information</h2><p>Your name and at least one contact method are required.</p></div>
          </div>
          <div className="public-ir-fields">
            <label className="public-ir-field">Full name <em>*</em>
              <input required autoComplete="name" value={form.reporterName} onChange={e=>update("reporterName",e.target.value)} placeholder="Enter your full name" maxLength={160}/>
            </label>
            <div className="public-ir-two">
              <label className="public-ir-field">Contact number <span>Phone or email required</span>
                <input type="tel" autoComplete="tel" value={form.phone} onChange={e=>update("phone",e.target.value)} placeholder="09XX XXX XXXX" maxLength={30}/>
              </label>
              <label className="public-ir-field">Email address <span>Phone or email required</span>
                <input type="email" autoComplete="email" value={form.email} onChange={e=>update("email",e.target.value)} placeholder="name@example.com" maxLength={180}/>
              </label>
            </div>
            <div className="public-ir-help"><Info size={17}/><span>Use either your phone number or email, or both. Your identity is not verified by this frontend preview. In the live system, only authorized case handlers should receive reporter details.</span></div>
          </div>
        </section>

        {errors.length>0&&<div className="public-ir-errors" role="alert"><strong>Please complete the following:</strong><ul>{errors.map(error=><li key={error}>{error}</li>)}</ul></div>}
        <div className="public-ir-foot-actions">
          <span>Submit checks the required fields and displays an alert. No report will be delivered yet.</span>
          <button type="submit" className="primary"><Send size={17}/> Submit Report</button>
        </div>
      </form>
      <footer className="public-ir-footer"><span>Underchargers · Workplace Reporting</span><span>Public page · No login needed · No active submissions</span></footer>
    </div>
  </main>;
}
