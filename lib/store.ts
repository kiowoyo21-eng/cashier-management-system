export type Status = 'Pending for Approval' | 'Approved' | 'Submit Explanation';
export type LedgerEntry = { id: string; account:'Petty Cash'|'Funds'; kind:'Additional Funds'|'Expense'; amount:number; category:string; description:string; actor:string; createdAt:string; signature:string; status:Status; proof?:string; explanation?:string; reviewerNote?:string; events:{at:string;by:string;action:string}[] };
export type PosEntry = {id:string; client:string; phone:string; vehicle:string; plate:string; concern:string; items:{name:string;qty:number;price:number}[]; payments:{amount:number;method:string;at:string}[]; costs:number; status:string; createdAt:string};
export type Data = { transactions:LedgerEntry[]; pos:PosEntry[]; manualSales:{id:string;amount:number;description:string;createdAt:string}[] };
export const emptyData:Data={transactions:[],pos:[],manualSales:[]};
export function load():Data {try { const v=localStorage.getItem('cms-demo-v1'); return v?{...emptyData,...JSON.parse(v)}:emptyData } catch{return emptyData} }
export function save(data:Data){try{localStorage.setItem('cms-demo-v1',JSON.stringify(data))}catch{alert('Browser storage is full; changes cannot be saved.')}}
export const peso=(value:number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(value);
export const now=()=>new Date().toISOString();
export const prettyDate=(date:string)=>new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(date));
export const createId=(p:string)=>`${p}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
