/** Browser-only loan review ledger. Never use as an accounting ledger in production. */
import type {Branch} from "./mock";
export type LoanPayment={releaseId:string;periodEnd:string;amount:number;recordedAt:string};
export type LoanRecord={id:number;employee:string;employeeId?:string;branch:Branch;provider:string;amount:number;payment:number;frequency:string;start:string;balance:number;notes:string;status:string;soaName?:string;soaData?:string;soaType?:string;reference?:string;authorized?:boolean;authorizationNote?:string;payments?:LoanPayment[]};
export const demoLoans:LoanRecord[]=[
 {id:1,employee:"Gabriel Aquino",employeeId:"UC-0001",branch:"UC Mandaluyong",provider:"SSS Salary Loan",amount:20000,payment:1000,frequency:"Monthly",start:"2026-10-15",balance:12000,notes:"SOA received; awaiting verification",status:"For Review"},
 {id:2,employee:"Daphne Mercado",employeeId:"UC-0002",branch:"UC Las Piñas",provider:"Cash Advance",amount:5000,payment:500,frequency:"Every cutoff",start:"2026-10-15",balance:3500,notes:"DEMO authorized deduction schedule — fictional",status:"Active",authorized:true,authorizationNote:"Fictional payroll sample"},
 {id:3,employee:"Enzo Villanueva",employeeId:"UC-0003",branch:"UC Quezon City",provider:"Pag-IBIG MPL",amount:15000,payment:750,frequency:"Biweekly",start:"2026-10-15",balance:11000,notes:"Imported amortization pending",status:"For Review"}
];
export const roundLoan=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export function dueForCutoff(loan:LoanRecord,employeeId:string,personName:string,cutoffEnd:string){
 if(loan.status!=="Active"||!loan.authorized||!loan.start||loan.start>cutoffEnd||loan.payment<=0||loan.balance<=0)return 0;
 // Old browser records with no employeeId may be matched by exact name only.
 if(!loan.employeeId||loan.employeeId!==employeeId)return 0; // Legacy name-only loans require HR relinking.
 const firstEligibleEnd=new Date(`${loan.start}T12:00:00`);
 firstEligibleEnd.setDate(firstEligibleEnd.getDate()+(3-firstEligibleEnd.getDay()+7)%7);
 const first=firstEligibleEnd.toISOString().slice(0,10);
 if(new Date(`${cutoffEnd}T12:00:00`).getDay()!==3||cutoffEnd<first)return 0;
 if(loan.frequency==="Monthly"&&cutoffEnd.slice(0,7)===first.slice(0,7)&&cutoffEnd!==first)return 0;
 if(loan.frequency==="Monthly"&&cutoffEnd.slice(0,7)!==first.slice(0,7)&&Number(cutoffEnd.slice(8,10))>7)return 0;
 if(loan.frequency==="Biweekly"){
  const weeks=Math.round((new Date(`${cutoffEnd}T12:00:00`).getTime()-new Date(`${first}T12:00:00`).getTime())/(7*86400000));
  if(weeks%2!==0)return 0;
 }
 return roundLoan(Math.min(loan.payment,loan.balance));
}
export function loanInstallments(loans:readonly LoanRecord[],employeeId:string,personName:string,cutoffEnd:string){
 return loans.map(loan=>({loan,amount:dueForCutoff(loan,employeeId,personName,cutoffEnd)})).filter(row=>row.amount>0);
}
