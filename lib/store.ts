export type Status = 'Pending for Approval' | 'Approved' | 'Submit Explanation';
export type CashAccount='Petty Cash'|'Funds';
export type LedgerEntry = { id: string; account:CashAccount; kind:'Additional Funds'|'Expense'; amount:number; category:string; description:string; actor:string; createdAt:string; signature:string; status:Status; proof?:string; explanation?:string; reviewerNote?:string; transactionDate?:string; payee?:string; vatType?:'VAT'|'Non-VAT'|''; cashVoucherNo?:string; receiptNo?:string; tinNo?:string; notes?:string; vehicleUnit?:string; plateNumber?:string; quantity?:number; unitCost?:number; branchId?:string; branchName?:string; events:{at:string;by:string;action:string}[] };
export type QuoteItem={type:'Service'|'Part';name:string;qty:number;price:number};
export type PosPayment={amount:number;method:string;at:string;reference?:string;cardType?:string;terminalFee?:number};
export type PosEntry = {
 id:string; branchId?:string; client:string; phone:string; vehicle:string; vehicleYear?:string; vehicleBrand?:string; vehicleModel?:string; plate:string; concern:string;
 items:QuoteItem[]; payments:PosPayment[]; costs:number; cogsItems?:{name:string;supplier:string;qty:number;unitCost:number}[]; status:string; createdAt:string; closedAt?:string;
 bsSi?:string; customerTin?:string; address?:string; mileage?:string; platform?:string; serviceAdvisor?:string; bookedBy?:string; mechanic?:string; remarks?:string;
 onlineExpense?:number; rfExpense?:number;
};
export type Data = { transactions:LedgerEntry[]; pos:PosEntry[]; manualSales:{id:string;amount:number;description:string;createdAt:string}[] };
export const emptyData:Data={transactions:[],pos:[],manualSales:[]};
export function load():Data {try { const v=localStorage.getItem('cms-demo-v1'); return v?{...emptyData,...JSON.parse(v)}:emptyData } catch{return emptyData} }
export function save(data:Data){try{localStorage.setItem('cms-demo-v1',JSON.stringify(data))}catch{alert('Browser storage is full; changes cannot be saved.')}}
export const peso=(value:number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(value);
export const now=()=>new Date().toISOString();
export const prettyDate=(date:string)=>new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(date));
export const createId=(p:string)=>`${p}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
export const accountLabel=(account:CashAccount)=>account==='Petty Cash'?'Revolving Fund':'RFP';
