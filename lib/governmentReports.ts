/**
 * Illustrative government reporting worksheets for UCMM HR UI review.
 * These are NOT agency-prescribed forms, compliance determinations, or live returns.
 * Sample financial and incident figures below are invented and MUST NOT be filed.
 */
import {employees,type Person} from "./people";

export type GovernmentAgency="DOLE"|"BIR"|"SSS"|"PhilHealth"|"Pag-IBIG";
export type GovernmentReportId="dole-13th"|"dole-aedr"|"dole-wair"|"dole-amr"|"bir-1601c"|"bir-1604c"|"bir-2316"|"sss-ecl"|"sss-loans"|"philhealth-eprs"|"pagibig-mcrf";
export type GovernmentReportTemplate={id:GovernmentReportId;agency:GovernmentAgency;title:string;short:string;reference:string;period:"Monthly"|"Annual"|"Event-based";source:string;sourceName:string;notes:string;requires:string[]};
export type GovernmentReportTable={columns:string[];rows:string[][];summary:{label:string;value:string}[];note:string};

export const governmentReportTemplates:GovernmentReportTemplate[]=[
 {id:"dole-13th",agency:"DOLE",title:"13th-Month Pay Compliance Worksheet",short:"Benefits register and amount-per-employee preparation",reference:"DOLE 13th-Month Pay Report",period:"Annual",source:"https://reports.dole.gov.ph/",sourceName:"DOLE Online Compliance Portal",notes:"Preparation worksheet only. The official report requires verified actual benefits granted, establishment details and the prescribed filing process.",requires:["Verified 13th-month releases","Employee beneficiary count","Approved establishment details"]},
 {id:"dole-aedr",agency:"DOLE",title:"OSH Annual Exposure Data",short:"Safety exposure and work-related injury preparation",reference:"Annual Exposure Data Report (AEDR)",period:"Annual",source:"https://bwc.dole.gov.ph/occupational-safety-and-health-forms/",sourceName:"DOLE Bureau of Working Conditions",notes:"Illustrative exposure figures, NOT a substitute for verified OSH logs. Check applicable reporting requirements.",requires:["Verified hours of exposure","OSH accident and illness logs","Responsible safety officer review"]},
 {id:"dole-wair",agency:"DOLE",title:"Work Accident / Injury Register",short:"Event-based incident reporting preparation",reference:"Work Accident/Injury Report (WAIR)",period:"Event-based",source:"https://ncr.dole.gov.ph/downloadable-forms/",sourceName:"DOLE NCR Downloadable Forms",notes:"Not every internal HR incident is a reportable occupational accident. Assess actual facts and applicability before filing.",requires:["Actual incident investigation","Medical/injury documentation if applicable","OSH classification review"]},
 {id:"dole-amr",agency:"DOLE",title:"Annual Medical & OSH Checklist",short:"Occupational health documentation readiness",reference:"Annual Medical Report / OSH Forms",period:"Annual",source:"https://ncr.dole.gov.ph/downloadable-forms/",sourceName:"DOLE NCR Downloadable Forms",notes:"A checklist example only. Medical information must be handled with strict confidentiality; actual report eligibility and format require verification.",requires:["Annual medical record summary","OSH officer verification","Approved establishment information"]},
 {id:"sss-ecl",agency:"SSS",title:"Contribution Collection List",short:"Employee and employer contribution reconciliation",reference:"SSS e-CL / R-3",period:"Monthly",source:"https://www.sss.gov.ph/pay-contribution/",sourceName:"SSS Employer Contribution Reporting",notes:"Sample contribution amounts are intentionally fictional. Use the My.SSS employer portal and applicable current contribution schedule for real payments.",requires:["Verified SSS identifiers","Actual salary and contribution computation","Employer e-CL / PRN"]},
 {id:"sss-loans",agency:"SSS",title:"Loan Collection Preparation",short:"Employee loan repayment and collection comparison",reference:"SSS Loan Collection List (ML2)",period:"Monthly",source:"https://www.sss.gov.ph/download-forms-and-electronic-applications/",sourceName:"SSS Forms & Electronic Applications",notes:"Illustrative loan deductions only. Include an employee only when a verified active SSS loan is present.",requires:["Verified loan statement","Employee loan account matching","Actual deducted vs remitted amounts"]},
 {id:"philhealth-eprs",agency:"PhilHealth",title:"Premium Remittance Worksheet",short:"Employee/employer monthly premium reconciliation",reference:"PhilHealth EPRS",period:"Monthly",source:"https://www.philhealth.gov.ph/partners/employers/pay_procedures.php",sourceName:"PhilHealth Employer Procedures",notes:"Reference worksheet, not a generated EPRS submission. Confirm premium basis, PIN, employer number, coverage and period.",requires:["Verified PhilHealth PINs","Employee and employer premium totals","EPRS submission/payment proof"]},
 {id:"pagibig-mcrf",agency:"Pag-IBIG",title:"Membership Savings Remittance",short:"Employee/employer contribution and covered period",reference:"Pag-IBIG MCRF / eSRS",period:"Monthly",source:"https://www.pagibigfund.gov.ph/document/pdf/dlforms/providentrelated/Instructions%20in%20Encoding%20of%20MCRF.pdf",sourceName:"Pag-IBIG Official MCRF Instructions",notes:"Not an official remittance file. Follow the current Pag-IBIG MCRF/eSRS file specification and validate IDs and amounts.",requires:["Verified employee MID/RTN","Actual membership savings shares","Remittance confirmation"]},
 {id:"bir-1601c",agency:"BIR",title:"Monthly Compensation Withholding",short:"Compensation and tax-withheld consolidation",reference:"BIR Form 1601-C",period:"Monthly",source:"https://www.bir.gov.ph/bir-forms?q=Bir",sourceName:"BIR Official Forms",notes:"Illustrative tax-withheld figures are not computed tax liabilities and must never be used as the 1601-C return.",requires:["Actual taxable compensation","Validated tax withholding ledger","Employer TIN and return details"]},
 {id:"bir-1604c",agency:"BIR",title:"Annual Withholding Alphalist",short:"Annual employee compensation and tax summary",reference:"BIR Form 1604-C / employee alphalist",period:"Annual",source:"https://www.bir.gov.ph/bir-forms?q=Bir",sourceName:"BIR Official Forms",notes:"Illustrative annual figures only. Validate actual year-to-date taxable pay, withholding, employee information and filing format.",requires:["Verified annual payroll ledger","TIN verification","Matching withholding remittances"]},
 {id:"bir-2316",agency:"BIR",title:"Employee Tax Certificate Register",short:"Annual preparation tracking for employee certificates",reference:"BIR Form 2316",period:"Annual",source:"https://www.bir.gov.ph/bir-forms?q=Bir",sourceName:"BIR Official Forms",notes:"This is a preparation register, not a BIR Form 2316 PDF. Generate certificates only from reconciled payroll and valid official form templates.",requires:["Verified employee details and TIN","Annual compensation/tax summary","Employee certification and release records"]}
];

export const governmentAgencies:GovernmentAgency[]=["DOLE","SSS","PhilHealth","Pag-IBIG","BIR"];
const pesos=(value:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",maximumFractionDigits:2}).format(value);
const personScope=(branch:string,year:number,month:number,period:"Monthly"|"Annual"|"Event-based")=>{
 const maxDay=new Date(Date.UTC(year,month,0)).getUTCDate();
 const lastDay=period==="Annual"?`${year}-12-31`:`${year}-${String(month).padStart(2,"0")}-${String(maxDay).padStart(2,"0")}`;
 return employees.filter(p=>(branch==="All Shops"||p.branch===branch)&&p.hire<=lastDay);
};
const fictionalMonthlyPay=(p:Person)=>p.salaryType==="Monthly"?p.rate:p.rate*24;
// These figures are invented solely to illustrate the shape of report data.
const sampleTax=(p:Person,i:number)=>Math.round((i%4===0?0:fictionalMonthlyPay(p)*(0.01+(i%3)*0.004))*100)/100;
const sampleSSS=(p:Person,i:number)=>({ee:200+(i%6)*80,er:410+(i%6)*160});
const samplePhilHealth=(p:Person,i:number)=>200+(i%4)*100;
const samplePagibig=(p:Person,i:number)=>100+(i%2)*100;
const sum=(values:number[])=>values.reduce((a,v)=>a+v,0);
const row=(...values:(string|number)[])=>values.map(String);
const baseSummary=(people:Person[])=>[{label:"Sample employees",value:String(people.length)},{label:"Sample branches",value:String(new Set(people.map(p=>p.branch)).size)}];

export function generateGovernmentReport(template:GovernmentReportTemplate,branch:string,year:number,month:number):GovernmentReportTable {
 const people=personScope(branch,year,month,template.period);
 const base=baseSummary(people);
 const entries=people.map((p,i)=>({p,i}));
 const noFiling="FICTIONAL DEMONSTRATION — NOT AN OFFICIAL REPORT OR GOVERNMENT FILING. All financial, accident and OSH quantities are illustrative and require replacement with verified source records.";
 if(template.id==="dole-13th"){
  const bases=entries.map(({p})=>{const employmentStartYear=Number(p.hire.slice(0,4));const startMonth=employmentStartYear<year?1:Number(p.hire.slice(5,7));return fictionalMonthlyPay(p)*Math.max(0,13-startMonth)});
  const amounts=bases.map(b=>Math.round(b/12));
  return {columns:["Employee ID","Employee","Branch","Illustrative basic earned (₱)","Illustrative 13th (₱)","Validation"],rows:entries.map(({p,i})=>row(p.id,p.name,p.branch,pesos(bases[i]),pesos(amounts[i]),"Not verified")),summary:[...base,{label:"Illustrative 13th total",value:pesos(sum(amounts))}],note:noFiling+" Amounts are fictional and are NOT recorded as benefits granted."};
 }
 if(template.id==="dole-aedr"){
  const branches=[...new Set(people.map(p=>p.branch))];
  return {columns:["Branch","Employees (sample)","Example exposure hours","Example injury reports","OSH records"],rows:branches.map((b,i)=>row(b,people.filter(p=>p.branch===b).length,1600+(i*360),i===0?1:0,"Needs actual OSH records")),summary:[...base,{label:"OSH validation",value:"Required"}],note:noFiling+" The example injury count is invented; it is not taken from confidential IR cases."};
 }
 if(template.id==="dole-wair"){
  return {columns:["Example event ref","Branch","Event date","Concern","Evidence","Reportability"],rows:people.length?[row("SAMPLE-OSH-001",people[0].branch,`${year}-${String(month).padStart(2,"0")}-10`,"Illustrative equipment-related injury","Missing","Unassessed")]:[],summary:[...base,{label:"Example events",value:people.length?"1":"0"}],note:noFiling+" No real Incident Reports are used. Reporting obligations depend on the incident and applicable rules."};
 }
 if(template.id==="dole-amr"){
  const bs=[...new Set(people.map(p=>p.branch))];
  return {columns:["Branch","Sample headcount","OSH staff review","Medical report source","Readiness"],rows:bs.map(b=>row(b,people.filter(p=>p.branch===b).length,"Pending","Not connected","Needs validation")),summary:[...base,{label:"Medical records",value:"Not connected"}],note:noFiling+" Do not export confidential employee medical details without authorized safeguards."};
 }
 if(template.id==="sss-ecl"){
  const ee=entries.map(({p,i})=>sampleSSS(p,i).ee),er=entries.map(({p,i})=>sampleSSS(p,i).er);
  return {columns:["Employee ID","Employee","Branch","Sample EE share","Sample ER share","ID check"],rows:entries.map(({p,i})=>row(p.id,p.name,p.branch,pesos(ee[i]),pesos(er[i]),"SSS ID not connected")),summary:[...base,{label:"Illustrative EE + ER",value:pesos(sum(ee)+sum(er))}],note:noFiling+" Sample contribution shares do not represent the official salary-bracket computation."};
 }
 if(template.id==="sss-loans"){
  const withLoan=entries.filter(({i})=>i%4===0);
  return {columns:["Employee ID","Employee","Branch","Example deduction","Source SOA","Status"],rows:withLoan.map(({p,i})=>row(p.id,p.name,p.branch,pesos(500+i*50),"Not attached","For reconciliation")),summary:[...base,{label:"Example loan records",value:String(withLoan.length)}],note:noFiling+" Entries are example loan deductions only and are not sourced from verified SSS statements."};
 }
 if(template.id==="philhealth-eprs"){
  const premium=entries.map(({p,i})=>samplePhilHealth(p,i));
  return {columns:["Employee ID","Employee","Branch","Sample EE share","Sample ER share","PIN check"],rows:entries.map(({p,i})=>row(p.id,p.name,p.branch,pesos(premium[i]),pesos(premium[i]),"PIN not connected")),summary:[...base,{label:"Illustrative total premium",value:pesos(sum(premium)*2)}],note:noFiling+" Official PhilHealth EPRS submission requires verified contribution records."};
 }
 if(template.id==="pagibig-mcrf"){
  const premium=entries.map(({p,i})=>samplePagibig(p,i));
  return {columns:["Employee ID","Employee","Branch","Sample EE share","Sample ER share","MID check"],rows:entries.map(({p,i})=>row(p.id,p.name,p.branch,pesos(premium[i]),pesos(premium[i]),"MID not connected")),summary:[...base,{label:"Illustrative savings total",value:pesos(sum(premium)*2)}],note:noFiling+" Official MCRF/eSRS uploads require the exact prescribed format, verified IDs and actual amounts."};
 }
 if(template.id==="bir-1601c"){
  const taxes=entries.map(({p,i})=>sampleTax(p,i));
  return {columns:["Employee ID","Employee","Branch","Illustrative gross","Illustrative withholding","TIN check"],rows:entries.map(({p,i})=>row(p.id,p.name,p.branch,pesos(fictionalMonthlyPay(p)),pesos(taxes[i]),"TIN not connected")),summary:[...base,{label:"Illustrative withholding",value:pesos(sum(taxes))}],note:noFiling+" Figures are NOT computed using an official withholding tax table."};
 }
 if(template.id==="bir-1604c"){
  const taxes=entries.map(({p,i})=>sampleTax(p,i)*12);
  return {columns:["Employee ID","Employee","Branch","Example annual compensation","Example annual tax","Reconciliation"],rows:entries.map(({p,i})=>row(p.id,p.name,p.branch,pesos(fictionalMonthlyPay(p)*12),pesos(taxes[i]),"Pending")),summary:[...base,{label:"Illustrative annual tax",value:pesos(sum(taxes))}],note:noFiling+" All amounts are hypothetical and are not derived from actual paid payroll or withholding remittances."};
 }
 const rows=entries.map(({p})=>row(p.id,p.name,p.branch,"Not generated","TIN not connected","For preparation"));
 return {columns:["Employee ID","Employee","Branch","BIR 2316","TIN check","Status"],rows,summary:[...base,{label:"Certificates to prepare",value:String(rows.length)}],note:noFiling+" No official BIR Form 2316 certificates were created or signed."};
}

export function exportGovernmentSampleCsv(template:GovernmentReportTemplate,report:GovernmentReportTable,year:number,month:number){
 const esc=(v:unknown)=>`"${String(v??"").replaceAll('"','""')}"`;
 const lines=[
  ["FICTIONAL SAMPLE — NOT FOR GOVERNMENT FILING"],
  ["Report",template.title],["Agency",template.agency],["Official reference",template.reference],["Year",year],["Month",template.period==="Annual"?"Year-wide":String(month).padStart(2,"0")],
  [],report.columns,...report.rows,["Review note",report.note]
 ];
 const csv=lines.map(r=>r.map(esc).join(",")).join("\r\n");
 const url=URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
 const link=document.createElement("a");link.href=url;link.download=`SAMPLE_NOT_FOR_FILING_${template.id}_${year}_${String(month).padStart(2,"0")}.csv`;link.click();URL.revokeObjectURL(url);
}
