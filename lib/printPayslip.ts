"use client";
import type {PayrollRelease} from "./hrState";
import type {Person} from "./people";
import type {PayslipDraft} from "./payrollConfig";
import type {LoanRecord} from "./loanLedger";

export type PayslipFormat={
 companyAddress:string;
 title:string;
 layout:"single"|"two";
 showEmployeeId:boolean;
 showDepartment:boolean;
 showBranch:boolean;
};
export const defaultPayslipFormat:PayslipFormat={companyAddress:"",title:"EMPLOYEE PAYSLIP",layout:"single",showEmployeeId:true,showDepartment:true,showBranch:true};
export const payslipFormatStorageKey="ucmm:payslip:format:v1";
const esc=(value:unknown)=>String(value??"—").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]||char));
const money=(n:number)=>`₱${Number(n).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fixed=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const date=(v:string)=>v?new Date(`${v}T12:00:00`).toLocaleDateString("en-PH",{day:"numeric",month:"short",year:"numeric"}):"—";
/** Format only; never infer missing payslip line items from old gross-only releases. */
export function buildFormalPayslipHtml(release:PayrollRelease,person:Person|undefined,draft:PayslipDraft|undefined,paper:"A4"|"Letter"="A4",embedded=false,format:PayslipFormat=defaultPayslipFormat,loans:readonly LoanRecord[]=[]){
 const complete=Boolean(draft&&typeof draft.basicPay==="number"&&Array.isArray(draft.deductionBreakdown));
 const pendingPreview=release.status!=="Released";
 const amount=(n:number|undefined)=>typeof n==="number"&&Number.isFinite(n)?money(n):"—";
 const detail=(label:string,value:unknown)=>`<div class="detail"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
 const row=(label:string,value:string,extra="")=>`<tr><th>${esc(label)}</th><td>${extra}</td><td>${esc(value)}</td></tr>`;
 const total=(label:string,value:number)=>`<tr class="total"><th>${esc(label)}</th><td></td><td>${amount(value)}</td></tr>`;
 const type=draft?.salaryType||person?.salaryType||"—";
 const rate=complete&&draft?(typeof draft.rateAmount==="number"?draft.rateAmount:(type==="Monthly"?(typeof draft.dailyRate==="number"?fixed(draft.dailyRate*26):undefined):draft.dailyRate)):undefined;
 const rateLabel=typeof rate==="number"?`${type} — ${money(rate)}${type==="Daily"?" / day":" / month (26-day reference)"}`:`${type} — Not stored for this release`;
 const days=complete&&draft?String(draft.workedDays??draft.days):"—";
 const base=complete&&draft?draft.basicPay:undefined;
 const leaveDays=complete&&draft?(draft.paidLeaveDays??0):0;
 // A paid-leave component is split OUT of the saved basic-pay subtotal, never added twice.
 const leavePay=typeof base==="number"&&leaveDays>0&&typeof draft?.dailyRate==="number"?fixed(Math.min(base,leaveDays*draft.dailyRate)):undefined;
 const baseShown=typeof base==="number"?fixed(base-(leavePay??0)):undefined;
 const otMeta=complete&&draft?`${draft.otHours.toFixed(2)} hrs · ${amount(draft.hourlyRate)}/hr`:"—";
 const earnings=[
  row("Basic Pay",amount(baseShown)),
  row("ECOLA", amount(complete?draft?.ecolaPay:undefined)), // Only display recorded ECOLA; demo explicitly stores zero where not configured.
  row("Total Days Worked",days,"<small>days</small>"),
  row("Overtime",amount(complete?draft?.otPay:undefined),`<small>${esc(otMeta)}</small>`),
  row("Leave with Pay",amount(leavePay),leaveDays?`<small>${leaveDays} day(s) · included in basic</small>`:""),
  row("Rest Day Duty / Holiday Additional",amount(complete?draft?.holidayExtra:undefined)),
  row("Allowances / Bonus",amount(complete?draft?.allowances:undefined)),
  total("GROSS PAY",release.gross)
 ].join("");
 const findAgency=(agency:string)=>complete?draft?.deductionBreakdown?.find(x=>x.agency===agency)?.employee:undefined;
 // Separate SSS loans and cash advances ONLY when the saved loan ID resolves to a known ledger entry.
 let sssLoan: number|undefined, cashAdvance:number|undefined, otherLoan:number|undefined;
 if(complete&&draft){
  if((draft.loanEntries||[]).length){
   for(const entry of draft.loanEntries||[]){
    const record=loans.find(l=>l.id===entry.loanId);
    const group=record?.provider.toLowerCase().includes("sss")?"sss":record?.provider.toLowerCase().includes("cash advance")?"cash":"other";
    if(group==="sss")sssLoan=fixed((sssLoan||0)+entry.amount);
    else if(group==="cash")cashAdvance=fixed((cashAdvance||0)+entry.amount);
    else otherLoan=fixed((otherLoan||0)+entry.amount);
   }
   const allocated=(sssLoan||0)+(cashAdvance||0)+(otherLoan||0);
   const unclassified=fixed((draft.loanDeduction||0)-allocated);
   if(unclassified>0)otherLoan=fixed((otherLoan||0)+unclassified);
  }else if(draft.loanDeduction){otherLoan=draft.loanDeduction}
 }
 const deductions=[
  row("SSS",amount(findAgency("SSS"))),
  row("PhilHealth",amount(findAgency("PhilHealth"))),
  row("Pag-IBIG",amount(findAgency("Pag-IBIG"))),
  row("Withholding Tax / BIR",amount(findAgency("BIR"))),
  row("SSS Loan",amount(complete?(sssLoan??0):undefined)),
  row("Employee Loan",amount(complete?(otherLoan??0):undefined)),
  row("Cash Advance",amount(complete?(cashAdvance??0):undefined)),
  row("Late", amount(complete?draft?.lateDeduction:undefined), draft?.lateMinutes?`<small>${draft.lateMinutes} min${draft.lateDeduction===undefined?" · already reflected in Basic Pay":""}</small>`:""),
  row("Other Authorized Deductions",amount(complete?(draft?.manualDeduction??0):undefined)),
  total("TOTAL DEDUCTIONS",release.deductions)
 ].join("");
 const details=[
  detail("Period Covered",`${date(release.periodStart)} – ${date(release.periodEnd)}`),
  detail("Date",date(release.paidAt)),
  detail("Employee Name",person?.name||release.employeeId),
  ...(format.showEmployeeId?[detail("Employee ID",release.employeeId)]:[]),
  ...(format.showDepartment?[detail("Department",person?.department||"—")]:[]),
  ...(format.showBranch?[detail("Branch",person?.branch||"—")]:[]),
  detail("Salary Type / Rate",rateLabel),
  detail("Days Worked",days)
 ].join("");
 const grossOK=Math.abs(release.gross-release.deductions-release.net)<0.02;
 const earningsOK=!complete||!draft||Math.abs(fixed((draft.basicPay||0)+(draft.ecolaPay||0)+(draft.otPay||0)+(draft.holidayExtra||0)+(draft.allowances||0))-release.gross)<0.02;
 const deductOK=!complete||!draft||Math.abs(fixed((draft.deductionBreakdown||[]).reduce((sum,item)=>sum+item.employee,0)+(draft.loanDeduction||0)+(draft.manualDeduction||0)+(draft.lateDeduction||0))-release.deductions)<0.02;
 const warning=!grossOK||!earningsOK||!deductOK;
 const logo=(typeof window!=="undefined"?window.location.origin:"")+"/underchargers-document-logo.png";
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${esc(`${format.title} ${release.employeeId}`)}</title><style>
 @page{size:${paper};margin:13mm}*{box-sizing:border-box}html{background:white}body{margin:0 auto;max-width:180mm;padding:13px 0;font:10pt/1.45 Arial,Helvetica,sans-serif;color:#1c2635;background:#fff}
 .toolbar{display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px}.toolbar button{border:1px solid #d2d8e2;border-radius:5px;background:white;padding:8px 11px;cursor:pointer}
 .header{text-align:center;padding:5px 0 15px;border-bottom:2px solid #e2b12f}.header img{display:block;width:190px;height:auto;max-height:100px;object-fit:contain;margin:0 auto 7px}.header h1{font-size:14pt;letter-spacing:1px;margin:5px 0 3px}.address{font-size:8.8pt;white-space:pre-line;color:#546176;overflow-wrap:anywhere}.tag{font-size:7.8pt;letter-spacing:.6px;color:#776341;margin:3px auto 0}
 .heading{font-size:9pt;font-weight:800;letter-spacing:.6px;text-transform:uppercase;border-bottom:1px solid #dfe4eb;padding-bottom:5px;margin:17px 0 7px}.details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 18px}.detail{display:grid;gap:2px;padding:4px 0;border-bottom:1px solid #eef1f4;min-width:0}.detail span{font-size:8pt;color:#687585}.detail b{font-size:9.2pt;font-weight:650;overflow-wrap:anywhere}
 .sections{display:grid;grid-template-columns:1fr;gap:0}.sections.two{grid-template-columns:1fr 1fr;gap:20px;align-items:start}
 table{width:100%;border-collapse:collapse;font-size:9pt}th,td{padding:7px 4px;border-bottom:1px solid #e5e9ee;vertical-align:top}th{text-align:left;font-weight:500;width:50%}td{text-align:right}td:nth-child(2){text-align:right;color:#738094;font-size:8pt}td:last-child{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}small{font-size:7.5pt;color:#788495}.total{border-top:1px solid #9fa8b4;background:#f5f7f9}.total th,.total td{font-weight:800!important}
 .net{display:flex;justify-content:space-between;align-items:baseline;padding:12px 6px;margin-top:17px;border-top:2px solid #e0b22d;border-bottom:2px solid #e0b22d;font-weight:800}.net strong{font-size:11pt}.net b{font-size:16pt;white-space:nowrap}.receipt{margin-top:43px;display:grid;grid-template-columns:120px 1fr;gap:10px;align-items:end;font-size:9pt}.receipt .line{border-bottom:1px solid #404b5c;min-height:23px}.record-warning{font-size:8pt;color:#946a23;margin:7px 0 0}.reconcile{margin-top:10px;font-size:8.5pt;color:#a12626}
 @media(max-width:560px){body{padding:12px}.details{grid-template-columns:1fr 1fr;gap:6px 10px}.sections.two{grid-template-columns:1fr}.net b{font-size:13pt}}@media print{body{padding:0;max-width:none}.toolbar{display:none}.header,.details,.net,.receipt{break-inside:avoid}thead{display:table-header-group}}
 </style></head><body>${embedded?"":`<div class="toolbar"><button onclick="window.print()">Print / Save PDF</button><button onclick="window.close()">Close</button></div>`}
 <header class="header"><img src="${esc(logo)}" alt="Underchargers logo"/><h1>${esc(format.title||"EMPLOYEE PAYSLIP")}</h1><div class="address">${esc(format.companyAddress.trim()||"Address: —")}</div>${pendingPreview?`<div class="tag">UNAPPROVED PREVIEW · NOT RELEASED · NO PAYMENT</div>`:!complete?`<div class="tag">LEGACY RECORD · PARTIAL DETAILS</div>`:`<div class="tag">DEMO DATA · NOT PROOF OF PAYMENT</div>`}</header>
 <section><h2 class="heading">Employee & Payroll Details</h2><div class="details">${details}</div></section>
 <main class="sections ${format.layout==="two"?"two":"single"}"><section><h2 class="heading">Earnings</h2><table><tbody>${earnings}</tbody></table></section><section><h2 class="heading">Deductions</h2><table><tbody>${deductions}</tbody></table></section></main>
 <div class="net"><strong>NET PAY</strong><b>${money(release.net)}</b></div>
 ${warning?`<p class="reconcile">Payroll totals need reconciliation before issuing this document.</p>`:""}
 ${pendingPreview?"":`<div class="receipt"><span>Received By:</span><span class="line"></span></div>`}</body></html>`;
}
export function printFormalPayslip(release:PayrollRelease,person:Person|undefined,draft:PayslipDraft|undefined,paper:"A4"|"Letter"="A4",format:PayslipFormat=defaultPayslipFormat,loans:readonly LoanRecord[]=[]){
 const popup=window.open("","_blank");if(!popup){window.alert("Allow pop-ups to print the payslip.");return}
 popup.document.write(buildFormalPayslipHtml(release,person,draft,paper,false,format,loans));popup.document.close();popup.focus();
}
