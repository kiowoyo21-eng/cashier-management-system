"use client";
import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from "react";
import {employees as samples,type Person} from "./people";
import {DEMO_ASSETS} from "./demoAssets";
import {initialPayrollConfig,normalizePayrollConfig,type PayrollConfig} from "./payrollConfig";
import {seedIllustrativePayslips,upgradeOriginalSamples} from "./demoPayslipSeed";
import {backfillHistoricalDemoPreviews} from "./demoAutoPayslip";
export type EmployeeAssignment={
 id:string;effectiveDate:string;kind:"Initial Assignment"|"Transfer"|"Promotion"|"Reassignment";
 branch:string;department:string;position:string;memoId?:string;memoType?:string;
};
export type HRDocument={name:string;status:"Missing"|"Submitted"|"Verified";fileName?:string};
export type HRPerson=Person & {
 email:string;phone:string;hire:string;probation:number;sil:number;vil:number;
 documents:HRDocument[];timeline:string[];assignmentHistory?:EmployeeAssignment[];
 // Optional profile fields allow older browser-stored employees to remain compatible.
 birthDate?:string;civilStatus?:string;address?:string;
 emergencyName?:string;emergencyRelationship?:string;emergencyPhone?:string;
};
export type PremiumProfile={ot:number;rdw:number;rdot:number;regular:number;special:number;effective:string;reason:string};
export type AssetStatus="Free"|"Pending Turnover"|"Assigned"|"For Return"|"Inspection"|"Maintenance"|"Retired";
export type AssetRecord={homeBranch?:string;id:string;name:string;serial:string;status:AssetStatus;employeeId:string;condition:string;accessories:string;notes?:string;history:string[];signed:boolean;date:string;signingMethod?:"phone"|"onsite"|"print";assignedBy?:string;signatureEvidence?:string;assignmentDate?:string};
export type PayrollRelease={
 id:string;employeeId:string;periodStart:string;periodEnd:string;paidAt:string;
 gross:number;deductions:number;net:number;kind:"Salary"|"13th-Month Pay"|"Bonus";
 status:"Released"|"Pending";source:"Sample"|"Browser Review";
};
export type Submission={id:string;employeeId:string;type:string;fileName:string;submittedBy:string;status:"Pending HR Review"|"Approved"|"Rejected";reason:string};
export type HRState={payrollConfig?:PayrollConfig;people:HRPerson[];rates:Record<string,PremiumProfile>;assets:AssetRecord[];submissions:Submission[];payrollReleases:PayrollRelease[];earnings:Record<string,{days:number;ot:number;bonus:number;adjustment:number}>;deductions:Record<string,{sss:number;philhealth:number;pagibig:number;tax:number;loan:number}>};
const requirements=["Resume","Medical Clearance","Employment Contract","NDA / Company Policies","Government IDs"];
export const defaultRate:PremiumProfile={ot:125,rdw:130,rdot:169,regular:200,special:130,effective:"2026-10-01",reason:"Company reference profile"};
export const deptRate:Record<string,Partial<PremiumProfile>>={Operations:{ot:200,rdw:200,rdot:260},Service:{ot:150}};
const demoSeed=seedIllustrativePayslips(samples);
export const initialState:HRState={
 payrollConfig:{...initialPayrollConfig,payslipDrafts:demoSeed.drafts},
 people:samples.map((p,i)=>({...p,email:"",phone:"",probation:p.status==="Probationary"?6:0,sil:5,vil:i%2?5:0,documents:requirements.map((name,j)=>({name,status:j===0?"Verified":j===1?"Missing":"Submitted"})),timeline:[`${p.hire} · Hired at ${p.branch}`],assignmentHistory:[{id:`initial-${p.id}`,effectiveDate:p.hire,kind:"Initial Assignment" as const,branch:p.branch,department:p.department,position:p.position}]})),
 rates:{}, // Demo compensation references only; no individually approved premiums.
 assets:DEMO_ASSETS,
 payrollReleases:demoSeed.releases,
 submissions:samples.slice(0,5).map((p,i)=>({id:`DEMO-SUB-${1001+i}`,employeeId:p.id,type:i%2?"Government IDs":"Medical Clearance",fileName:`mock-requirement-${i+1}.pdf`,submittedBy:"Demo Employee",status:"Pending HR Review" as const,reason:"Fictional verification sample; no actual file uploaded"})),
 earnings:Object.fromEntries(samples.slice(0,8).map((p,i)=>[p.id,{days:i%5===0?4:6,ot:i%4,bonus:0,adjustment:0}])),
 deductions:Object.fromEntries(samples.slice(0,8).map(p=>[p.id,{sss:0,philhealth:0,pagibig:0,tax:0,loan:0}])) // Actual contribution calculations require verified statutory tables.
};
const KEY="uc-hr-review-release-v2";
// Migrate only the untouched legacy sample identities. Custom browser edits are never auto-replaced.
const LEGACY_SAMPLE_IDENTITIES=["Juan Dela Cruz","Maria Santos","Paolo Reyes","Andrea Cruz","Carlo Mendoza","Mika Flores","Rafael Garcia","Lea Villanueva","Noel Ramos","Angela Bautista","Luis Navarro","Bianca Lim"];
const LEGACY_SAMPLE_IDS=["UC-0001","UC-0002","UC-0003","MM-0001","UC-0004","UC-0005","UC-0006","MM-0002","UC-0007","MM-0003","UC-0008","UC-0009"];
const LEGACY_SAMPLE_RATES=[700,25000,30000,850,1050,28500,750,820,900,760,28000,22000];
const LEGACY_SAMPLE_BRANCHES=["UC Mandaluyong","UC Las Piñas","UC Quezon City","MM Mandaluyong","UC Mandaluyong","UC Las Piñas","UC Quezon City","MM Mandaluyong","UC Las Piñas","MM Mandaluyong","UC Mandaluyong","UC Quezon City"];
const LEGACY_ASSET_SERIALS=["UC-MAC-1001","UC-CAM-2002","UC-LAP-1003","MM-TAB-1004"];
function isUntouchedLegacySample(value:Partial<HRState>):boolean{
 const stockStatuses=["Probationary","Regular","Regular","Probationary","Regular","Regular","Probationary","Regular","Regular","Probationary","Regular","Regular"];
 const stockGenders=["Male","Female","Male","Female","Male","Female","Male","Female","Male","Female","Male","Female"];
 const stockRates=value.rates?.["UC-0001"];
 return Array.isArray(value.people)&&value.people.length===12&&value.people.every((p,i)=>
  p.name===LEGACY_SAMPLE_IDENTITIES[i]&&p.id===LEGACY_SAMPLE_IDS[i]&&p.rate===LEGACY_SAMPLE_RATES[i]&&p.branch===LEGACY_SAMPLE_BRANCHES[i]
  &&p.status===stockStatuses[i]&&p.gender===stockGenders[i]&&p.probation===(p.status==="Probationary"?6:0)
  &&p.sil===5&&p.vil===(i%2?5:0)&&!p.email&&!p.phone&&!p.address&&!p.birthDate&&!p.emergencyName&&!p.emergencyPhone
  &&p.documents?.length===5&&p.documents[0]?.status==="Verified"&&p.documents[1]?.status==="Missing"
  &&p.documents.every(d=>!d.fileName)&&p.documents.slice(2).every(d=>d.status==="Submitted")
  &&p.timeline?.length===1&&p.assignmentHistory?.length===1
 )
 &&Array.isArray(value.assets)&&value.assets.length===4&&value.assets.every((a,i)=>
  a.id===`AST-${1001+i}`&&a.serial===LEGACY_ASSET_SERIALS[i]&&a.history?.length===1&&!a.notes
 )
 &&Array.isArray(value.payrollReleases)&&value.payrollReleases.length===24
 &&value.payrollReleases.every(r=>r.source==="Sample"&&r.status==="Released")
 &&Array.isArray(value.submissions)&&value.submissions.length===1&&value.submissions[0].id==="SUB-1001"
 &&value.submissions[0].status==="Pending HR Review"&&!value.submissions[0].reason
 &&Object.keys(value.earnings||{}).length===1&&value.earnings?.["UC-0001"]?.days===6&&value.earnings["UC-0001"].ot===2
 &&Object.keys(value.rates||{}).length===1&&stockRates?.ot===200&&stockRates?.rdw===200&&stockRates?.rdot===260
 &&Object.keys(value.deductions||{}).length===6
 &&JSON.stringify(normalizePayrollConfig(value.payrollConfig))===JSON.stringify(initialPayrollConfig);
}
type ContextValue={data:HRState;update:(fn:(state:HRState)=>HRState)=>void;reset:()=>void;ready:boolean};
const HRContext=createContext<ContextValue|null>(null);
export function HRProvider({children}:{children:ReactNode}){
 const [data,setData]=useState<HRState>(initialState);const [ready,setReady]=useState(false);
 useEffect(()=>{
  try{
   const raw=window.localStorage.getItem(KEY);
   if(!raw){setData(backfillHistoricalDemoPreviews(initialState))}
   else{
    const loaded=JSON.parse(raw) as Partial<HRState>;
    if(isUntouchedLegacySample(loaded)){setData(backfillHistoricalDemoPreviews(initialState))}
    else if(Array.isArray(loaded.people)&&Array.isArray(loaded.assets)){
     const hydrated:HRState={...initialState,...loaded,earnings:loaded.earnings||{},deductions:loaded.deductions||{},payrollReleases:loaded.payrollReleases||initialState.payrollReleases,payrollConfig:normalizePayrollConfig(loaded.payrollConfig)};
     setData(backfillHistoricalDemoPreviews(upgradeOriginalSamples(hydrated,samples)));
    }else{setData(backfillHistoricalDemoPreviews(initialState))}
   }
  }catch{setData(backfillHistoricalDemoPreviews(initialState))}
  setReady(true);
 },[]);
 useEffect(()=>{if(ready){try{window.localStorage.setItem(KEY,JSON.stringify(data))}catch{}}},[data,ready]);
 const value=useMemo<ContextValue>(()=>({data,update:(fn)=>setData(previous=>fn(previous)),reset:()=>setData(backfillHistoricalDemoPreviews(initialState)),ready}),[data,ready]);
 return <HRContext.Provider value={value}>{children}</HRContext.Provider>
}
export function useHR(){const context=useContext(HRContext);if(!context)throw Error("HRProvider missing");return context}
export function effectiveRate(person:Person,rates:Record<string,PremiumProfile>):PremiumProfile{return {...defaultRate,...(deptRate[person.department]||{}),...(rates[person.id]||{})}}
export const money=(n:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(n);
