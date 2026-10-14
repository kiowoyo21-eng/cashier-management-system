import {roundMoney,type DeductionVersion,type Agency} from "./payrollConfig";

/** Reference-only payroll calculations; final rules require HR/finance statutory review. */
export type ContributionItem={agency:Agency;employee:number;employer:number;basis:number;note:string;version:string};
export type DeductionPreview={items:ContributionItem[];employeeTotal:number;employerTotal:number;monthlyApplicable:boolean;weeklyTaxable:number;basisEstimated:boolean};
const findVersion=(versions:DeductionVersion[],agency:Agency,end:string)=>versions.filter(v=>v.agency===agency&&v.effective<=end&&v.status!=="Draft Update").sort((a,b)=>b.effective.localeCompare(a.effective))[0];
export const firstWednesdayOfMonth=(isoEnd:string)=>{const d=new Date(`${isoEnd.slice(0,7)}-01T12:00:00`);return 1+(3-d.getDay()+7)%7};
export function cutoffSlot(isoEnd:string){
 const day=Number(isoEnd.slice(8,10));
 const date=new Date(`${isoEnd}T12:00:00`);
 if(date.getDay()!==3)return 0;
 const first=firstWednesdayOfMonth(isoEnd);
 return Math.floor((day-first)/7)+1;
}
/** Four employer-configured collection slots per calendar month. A fifth weekly cutoff receives no extra mandatory installment. */
export function allocateMonthlyReference(fullMonthly:number,isoEnd:string){
 const slot=cutoffSlot(isoEnd);
 if(!slot||slot>4)return 0;
 const one=roundMoney(fullMonthly/4);
 return slot===4?roundMoney(fullMonthly-one*3):one;
}
export function estimateMonthlyBasis(rate:number,type:"Daily"|"Monthly",daysPerMonth:number=26){return type==="Daily"?roundMoney(rate*daysPerMonth):rate}
export function computeGovernmentDeductions({monthlyBasis,weeklyGross,periodEnd,versions,basisEstimated=false,applyMonthly,birExempt=false}:{monthlyBasis:number;weeklyGross:number;periodEnd:string;versions:DeductionVersion[];basisEstimated?:boolean;applyMonthly?:boolean;birExempt?:boolean}):DeductionPreview{
 const fullReference=applyMonthly===true;
 const excludeMonthly=applyMonthly===false;
 const monthlyApplicable=fullReference||(!excludeMonthly&&cutoffSlot(periodEnd)>=1&&cutoffSlot(periodEnd)<=4);
 const portion=(amount:number)=>fullReference?roundMoney(amount):excludeMonthly?0:allocateMonthlyReference(amount,periodEnd);
 const items:ContributionItem[]=[];
 const add=(agency:Agency,employee:number,employer:number,basis:number,note:string)=>{const v=findVersion(versions,agency,periodEnd);items.push({agency,employee:roundMoney(employee),employer:roundMoney(employer),basis:roundMoney(basis),note,version:v?.id||"No current version"})};
 const sss=findVersion(versions,"SSS",periodEnd);
 const sssRow=sss?.rows.find(r=>monthlyBasis>=r.min&&monthlyBasis<=r.max);
 add("SSS",portion(sssRow?.employee||0),portion(sssRow?.employer||0),monthlyBasis,fullReference?"Full monthly SSS reference":`Monthly SSS reference allocated across four pay cutoffs (slot ${cutoffSlot(periodEnd)||"none"})`);
 const phil=findVersion(versions,"PhilHealth",periodEnd);
 const philBasis=Math.min(100000,Math.max(10000,monthlyBasis));
 const philRate=phil?.rows[0]?.rate??0;
 const philHalf=phil?roundMoney(philBasis*philRate/200):0;
 add("PhilHealth",portion(philHalf),portion(philHalf),philBasis,fullReference?"Monthly PhilHealth employee / employer reference":"Four-cutoff PhilHealth employee / employer allocation");
 const pag=findVersion(versions,"Pag-IBIG",periodEnd);
 const pagBase=Math.min(10000,Math.max(0,monthlyBasis));
 const pagEmployee=pag?pagBase*(monthlyBasis<=1500?.01:.02):0,pagEmployer=pag?pagBase*.02:0;
 add("Pag-IBIG",portion(pagEmployee),portion(pagEmployer),pagBase,fullReference?"Monthly Pag-IBIG reference":"Four-cutoff Pag-IBIG allocation");
 const contributionSum=items.reduce((s,r)=>s+r.employee,0);
 const taxable=Math.max(0,roundMoney(weeklyGross-contributionSum));
 const bir=findVersion(versions,"BIR",periodEnd);
 const taxRow=bir?.rows.find(r=>taxable>=r.min&&taxable<=r.max);
 const tax=birExempt?0:taxRow?Math.max(0,(taxRow.fixed||0)+(taxable-taxRow.min)*(taxRow.rate||0)/100):0;
 // BIR is a weekly taxable-compensation estimate; it is not a monthly contribution to divide by four.
 add("BIR",roundMoney(tax),0,taxable,birExempt?"HR-flagged exemption — verify eligibility":"Weekly BIR withholding reference (not divided by four)");
 return {items,employeeTotal:roundMoney(items.reduce((s,x)=>s+x.employee,0)),employerTotal:roundMoney(items.reduce((s,x)=>s+x.employer,0)),monthlyApplicable,weeklyTaxable:taxable,basisEstimated};
}
