/** Shared public/admin hiring-form configuration. UI-review records only, no secure backend. */
export type HiringFormStatus = "Draft" | "Published" | "Paused" | "Closed";
export type HiringForm = {
  id:string;
  position:string;
  status:HiringFormStatus;
  minimumYears:number;
  education:string;
  qualifications:string[];
  questions:string[];
  onboardingDocuments?:string[];
  createdAt:string;
};
export type ApplicantStage = "New Applicant" | "Shortlisted" | "Phone Interview" | "Initial Interview" | "Final Interview" | "Passed" | "Hired" | "Rejected" | "On Hold";
export type ApplicantRequirement = {name:string;status:"Missing"|"Submitted"|"Verified"|"Not Required"|"Rejected";fileName?:string;required?:boolean;custom?:boolean;process?:"applicant-upload"|"company-signature";reviewNotes?:string};
export type HiringInterview = {id:string;round:string;at:string;interviewer:string;result:"Pending"|"Passed"|"Failed"|"Needs Follow-up"|"Did Not Attend";notes:string;ratings?:Record<string,number>;checklist?:Record<string,boolean>;evaluator?:string;assessedAt?:string};
export type ApplicantRecord = {
  id:string; name:string;email:string;phone:string;role:string;branch:string;submitted:string;
  stage:ApplicantStage;notes:string;history?:string[];
  interviewAt?:string;interviewOutcome?:string;
  requirements:ApplicantRequirement[];
  relevantYears?:number|null;totalYears?:number|null;education?:string;
  qualifications?:Record<string,"Yes"|"No"|"Not provided">;
  answers?:Record<string,string>;
  resumeName?:string;
  interviews?:HiringInterview[];
  offerStatus?:"Not sent"|"Sent"|"Accepted"|"Declined";
  hireDate?:string;
  signingStatus?:"Pending"|"Completed";
  employeeId?:string;
  uploadToken?:string;uploadExpiresAt?:string;
};
export const RECRUITMENT_KEY="recruitment";
export const HIRING_FORMS_KEY="hiring-forms";
export const BRANCHES=["UC Mandaluyong","UC Las Piñas","UC Quezon City","MM Mandaluyong"] as const;
export const DEFAULT_ONBOARDING_DOCUMENTS=["Resume / CV","Medical Clearance","Employment Contract","Non-Disclosure Agreement (NDA)","General Policies"];
/** Example options for HR configuration, not legal certification requirements. */
export function positionDocumentSuggestions(position:string):string[]{
  if(/automotive|technician|mechanic/i.test(position))return ["Automotive NC II / relevant certification","Technical training certificates","Certificate of Employment / related experience","Driver's license (if role requires driving)"];
  if(/advisor/i.test(position))return ["Customer service training certificate","Certificate of Employment / relevant experience"];
  return ["Relevant training certificates","Certificate of Employment / related experience"];
}
export const DEFAULT_HIRING_FORMS:HiringForm[]=[
  {id:"automotive-technician",position:"Automotive Technician",status:"Published",minimumYears:2,education:"Technical/vocational training preferred",qualifications:["Automotive diagnostics","Preventive maintenance","Engine or transmission repair"],questions:["Which vehicle systems have you worked on?","Do you have any automotive certificates?"],onboardingDocuments:[...DEFAULT_ONBOARDING_DOCUMENTS,"Automotive NC II / relevant certification","Technical training certificates"],createdAt:"2026-10-01"},
  {id:"service-advisor",position:"Service Advisor",status:"Published",minimumYears:1,education:"High school, vocational or college graduate",qualifications:["Customer service","Vehicle service knowledge","Job orders and estimates"],questions:["Describe your experience explaining repairs to customers."],onboardingDocuments:[...DEFAULT_ONBOARDING_DOCUMENTS],createdAt:"2026-10-01"},
  {id:"hr-assistant",position:"HR Assistant",status:"Published",minimumYears:0,education:"Relevant HR/business education preferred",qualifications:["Records management","Scheduling","Office software"],questions:["Which HR tools or systems have you used?"],onboardingDocuments:[...DEFAULT_ONBOARDING_DOCUMENTS],createdAt:"2026-10-01"},
  {id:"branch-supervisor",position:"Branch Supervisor",status:"Published",minimumYears:3,education:"Relevant management or operational experience",qualifications:["Team supervision","Branch operations","Customer issue resolution"],questions:["How would you handle a customer complaint?"],onboardingDocuments:[...DEFAULT_ONBOARDING_DOCUMENTS],createdAt:"2026-10-01"},
];
export const makeFormId=(position:string)=>position.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
export const canonicalDocumentName=(name:string):string=>/^(resume|c\.?v\.?|resume\s*\/\s*c\.?v\.?|curriculum vitae)$/i.test(name.trim())?"Resume / CV":name.trim();
export function mergeRequirements(requirements:ApplicantRequirement[]):ApplicantRequirement[]{
 const result:ApplicantRequirement[]=[];
 for(const current of requirements){const name=canonicalDocumentName(current.name);if(!name)continue;
  const original={...current,name};const existing=result.find(r=>r.name.toLowerCase()===name.toLowerCase());
  if(!existing){result.push(original);continue}
  // Retain any attachment, verified status, and mandatory status when merging legacy duplicates.
  existing.required=existing.required!==false||current.required!==false;
  if(!existing.fileName&&current.fileName)existing.fileName=current.fileName;
  const ranks={"Not Required":0,"Rejected":1,"Missing":2,"Submitted":3,"Verified":4};
  if(ranks[current.status]>ranks[existing.status])existing.status=current.status;
 }
 return result;
}
export const candidateRequirements=(form?:HiringForm):ApplicantRequirement[]=>mergeRequirements(
 (form?.onboardingDocuments?.length?form.onboardingDocuments:DEFAULT_ONBOARDING_DOCUMENTS).map(name=>({name,status:"Missing" as const,required:true})));

export const originalSampleApplicants:ApplicantRecord[]=[
 {id:"APP-1001",name:"Rafael Mendoza",email:"rafael@example.com",phone:"09•• ••• 1001",role:"Automotive Technician",branch:"UC Mandaluyong",submitted:"2026-10-08",stage:"New Applicant",notes:"Sample application for layout review",relevantYears:5,totalYears:6,education:"Automotive servicing NC II",qualifications:{"Automotive diagnostics":"Yes","Preventive maintenance":"Yes","Engine or transmission repair":"Yes"},resumeName:"rafael_resume.pdf",requirements:[{name:"Resume / CV",status:"Submitted"},{name:"Medical Clearance",status:"Missing"},{name:"Employment Contract",status:"Missing"}]},
 {id:"APP-1002",name:"Kyla Ramos",email:"kyla@example.com",phone:"09•• ••• 1002",role:"Service Advisor",branch:"MM Mandaluyong",submitted:"2026-10-09",stage:"Shortlisted",notes:"Sample candidate awaiting interview schedule",relevantYears:2,totalYears:4,education:"College undergraduate",qualifications:{"Customer service":"Yes","Vehicle service knowledge":"Yes","Job orders and estimates":"No"},resumeName:"kyla_cv.pdf",requirements:[{name:"Resume / CV",status:"Verified"},{name:"Medical Clearance",status:"Missing"},{name:"Employment Contract",status:"Missing"}]},
 {id:"APP-1003",name:"Marco Bautista",email:"marco@example.com",phone:"09•• ••• 1003",role:"HR Assistant",branch:"UC Las Piñas",submitted:"2026-10-07",stage:"Initial Interview",interviewAt:"2026-10-14T10:00",notes:"Sample scheduled interview",relevantYears:1,totalYears:3,education:"BS Business Administration",resumeName:"marco_cv.pdf",qualifications:{"Records management":"Yes","Scheduling":"Yes","Office software":"Yes"},requirements:[{name:"Resume / CV",status:"Verified"},{name:"Medical Clearance",status:"Submitted"},{name:"Employment Contract",status:"Missing"}]},
 {id:"APP-1004",name:"Aira Castillo",email:"aira@example.com",phone:"09•• ••• 1004",role:"Branch Supervisor",branch:"UC Quezon City",submitted:"2026-10-06",stage:"Passed",notes:"Sample candidate selected for onboarding",relevantYears:4,totalYears:6,education:"BS Management",resumeName:"aira_resume.pdf",qualifications:{"Team supervision":"Yes","Branch operations":"Yes","Customer issue resolution":"Yes"},offerStatus:"Accepted",requirements:[{name:"Resume / CV",status:"Verified"},{name:"Medical Clearance",status:"Verified"},{name:"Employment Contract",status:"Submitted"}]}
];

/** Fictional QA applicants: all contact details are example-only and no files are stored. */
type SampleCandidate={id:number;name:string;position:string;branch:(typeof BRANCHES)[number];date:string;stage:ApplicantStage;years:number;interviewAt?:string;result?:HiringInterview["result"]};
const extraSampleCandidates:SampleCandidate[]=[
 {id:1005,name:"Janelle Aquino",position:"Service Advisor",branch:"UC Las Piñas",date:"2026-09-04",stage:"New Applicant",years:2},
 {id:1006,name:"Christian Villanueva",position:"Automotive Technician",branch:"UC Mandaluyong",date:"2026-09-08",stage:"Shortlisted",years:3},
 {id:1007,name:"Nicole Ferrer",position:"HR Assistant",branch:"MM Mandaluyong",date:"2026-09-11",stage:"Rejected",years:1},
 {id:1008,name:"Joshua Navarro",position:"Automotive Technician",branch:"UC Quezon City",date:"2026-09-15",stage:"Phone Interview",years:4,interviewAt:"2026-10-16T09:30",result:"Pending"},
 {id:1009,name:"Trisha Garcia",position:"Service Advisor",branch:"UC Mandaluyong",date:"2026-09-19",stage:"Final Interview",years:5,interviewAt:"2026-10-15T14:00",result:"Pending"},
 {id:1010,name:"Francis Dizon",position:"Branch Supervisor",branch:"UC Las Piñas",date:"2026-09-20",stage:"Passed",years:7,interviewAt:"2026-10-07T10:00",result:"Passed"},
 {id:1011,name:"Rhea Salazar",position:"HR Assistant",branch:"UC Mandaluyong",date:"2026-09-23",stage:"New Applicant",years:1},
 {id:1012,name:"Patrick Mendoza",position:"Automotive Technician",branch:"MM Mandaluyong",date:"2026-09-25",stage:"On Hold",years:2},
 {id:1013,name:"Mae Villanueva",position:"Service Advisor",branch:"UC Las Piñas",date:"2026-09-28",stage:"Initial Interview",years:3,interviewAt:"2026-10-09T13:00",result:"Pending"},
 {id:1014,name:"Aaron Lim",position:"Automotive Technician",branch:"UC Quezon City",date:"2026-10-01",stage:"New Applicant",years:3},
 {id:1015,name:"Camille Flores",position:"HR Assistant",branch:"UC Las Piñas",date:"2026-10-03",stage:"Shortlisted",years:2},
 {id:1016,name:"Dylan Cruz",position:"Branch Supervisor",branch:"MM Mandaluyong",date:"2026-10-04",stage:"Phone Interview",years:5,interviewAt:"2026-10-17T11:00",result:"Pending"},
 {id:1017,name:"Sofia Bautista",position:"Service Advisor",branch:"UC Quezon City",date:"2026-10-05",stage:"New Applicant",years:2},
 {id:1018,name:"Eric Ramos",position:"Automotive Technician",branch:"UC Las Piñas",date:"2026-10-06",stage:"Shortlisted",years:4},
 {id:1019,name:"Gloria Santos",position:"Branch Supervisor",branch:"UC Mandaluyong",date:"2026-10-10",stage:"Initial Interview",years:6,interviewAt:"2026-10-14T15:30",result:"Pending"},
 {id:1020,name:"Ivan Castillo",position:"HR Assistant",branch:"MM Mandaluyong",date:"2026-10-12",stage:"New Applicant",years:0}
];
const mockHiringRequirements=(role:string,progress:string):ApplicantRequirement[]=>{
 const form=DEFAULT_HIRING_FORMS.find(item=>item.position===role);
 const requirements=candidateRequirements(form);
 return requirements.map((r,i)=>({...r,
  status:(i===0?"Submitted":progress==="Passed"&&i===1?"Submitted":"Missing") as ApplicantRequirement["status"],
  fileName:i===0?"demo-resume-reference.pdf":undefined
 }));
};
export const extraApplicants:ApplicantRecord[]=extraSampleCandidates.map(c=>{
 const form=DEFAULT_HIRING_FORMS.find(f=>f.position===c.position);
 const interviews:HiringInterview[]=c.interviewAt?[{
  id:`INT-DEMO-${c.id}`,round:c.stage.includes("Interview")?c.stage:"Final Interview",at:c.interviewAt,
  interviewer:"Sample HR Reviewer",result:c.result||"Pending",notes:"Demo interview for workflow testing",
  ...(c.result==="Passed"?{ratings:{"Role-specific knowledge":4,"Communication":4,"Reliability":5},checklist:{"Minimum requirements checked":true,"Interview documents reviewed":true},evaluator:"Sample HR Reviewer",assessedAt:"2026-10-08"}:{}),
 }]:[];
 return {
  id:`APP-${c.id}`,name:c.name,email:`applicant${c.id}@example.com`,phone:`09•• ••• ${c.id}`,
  role:c.position,branch:c.branch,submitted:c.date,stage:c.stage,
  notes:c.stage==="Rejected"?"Demo rejection after qualifications review":c.stage==="On Hold"?"Demo candidate awaiting additional details":"Fictional test application — no real applicant data",
  history:[`${c.date} · DEMO application created`,...(c.stage==="New Applicant"?[]:[`2026-10-10 · DEMO status: ${c.stage}`])],
  relevantYears:c.years,totalYears:c.years+1,
  education:c.position==="Automotive Technician"?"Automotive technical / vocational":c.position==="HR Assistant"?"Business administration":"Relevant work training",
  qualifications:Object.fromEntries((form?.qualifications||[]).map((q,i)=>[q,i===2&&c.years<2?"No":"Yes"])) as ApplicantRecord["qualifications"],
  answers:Object.fromEntries((form?.questions||[]).map(q=>[q,"Sample response for UI testing"])),
  resumeName:`demo-app-${c.id}-resume.pdf`,requirements:mockHiringRequirements(c.position,c.stage),
  interviews,offerStatus:c.stage==="Passed"?"Sent":"Not sent",
 };
});

/** Seed used by new browsers; existing review records can opt-in to additions. */
export const initialApplicants:ApplicantRecord[]=[...originalSampleApplicants,...extraApplicants];
