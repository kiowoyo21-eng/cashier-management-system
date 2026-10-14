/** Browser-local attendance import. A valid CSV is NOT proof that punches are authentic.
 * Only an authorized backend/app integration can provide a trusted attendance source.
 */
import type {Person} from './people';
import type {ImportedAttendanceRow} from './payrollConfig';

const ISO=/^\d{4}-\d{2}-\d{2}$/;
export const addCutoffDays=(iso:string,n:number)=>{const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const localToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export function cutoffForDate(day:string){const d=new Date(`${day}T12:00:00`);return addCutoffDays(day,-((d.getDay()+3)%7))};
export const csvTemplateHeaders=['Employee ID','Date','Time In','Time Out','Status','Approved OT Hours','OT Approved','Notes'];
export const attendanceTemplate=[csvTemplateHeaders,['UC-0001','2026-10-08','08:00','17:00','Present','0','No',''],['UC-0001','2026-10-09','','','Rest Day','0','No','']];
/** RFC 4180 basic CSV scanner: quoted commas, escaped quotes and line breaks. */
export function parseCsv(text:string):string[][]{
 const result:string[][]=[];let row:string[]=[],cell='',quoted=false;
 const input=text.replace(/^\uFEFF/,'');
 for(let i=0;i<input.length;i++){
  const c=input[i];
  if(quoted){if(c==='"'&&input[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}
  else if(c==='"'){if(cell.length)throw new Error('Unexpected quote in attendance CSV');quoted=true}
  else if(c===','){row.push(cell.trim());cell=''}
  else if(c==='\r'||c==='\n'){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell.trim());if(row.some(x=>x!==''))result.push(row);row=[];cell=''}
  else cell+=c;
 }
 if(quoted)throw new Error('Unclosed CSV quote');
 row.push(cell.trim());if(row.some(x=>x!==''))result.push(row);
 return result;
}
const key=(s:string)=>s.toLowerCase().replace(/[\s_\-./()]+/g,'');
const alias:Record<string,string>={
 employeeid:'id',empid:'id',employeeno:'id',employee:'id',
 date:'date',workdate:'date',attendancedate:'date',
 timein:'in',clockin:'in',in:'in',timeout:'out',clockout:'out',out:'out',
 status:'status',attendancestatus:'status',
 approvedothours:'ot',othours:'ot',overtimehours:'ot',
 otapproved:'otApproved',overtimeapproved:'otApproved',
 notes:'notes',remarks:'notes'
};
function clock(raw:string){const value=raw.trim();if(!value)return '';
 const m=/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i.exec(value);
 if(!m)return null;let hour=Number(m[1]),minute=Number(m[2]);if(minute>59)return null;
 if(m[3]){if(hour<1||hour>12)return null;hour=hour%12+(m[3].toUpperCase()==='PM'?12:0)}
 if(hour>23)return null;return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}
const allowed:Record<string,ImportedAttendanceRow['status']>={present:'Present',late:'Present',overtime:'Present',absent:'Absent',restday:'Rest Day',dayoff:'Rest Day',off:'Rest Day',onleave:'On Leave',leave:'On Leave',incomplete:'Incomplete'};
const yes=(v:string)=>['yes','true','1','approved','y'].includes(v.trim().toLowerCase());
export function parseAttendanceImport(text:string,employees:readonly Person[],branch:string,start:string){
 const lines=parseCsv(text);if(lines.length<2)throw new Error('CSV has no attendance rows');if(lines.length>6001)throw new Error('Limit: 6,000 attendance rows per upload');
 const headers=lines[0].map(c=>alias[key(c)]||'');
 const column=(name:string)=>headers.indexOf(name);
 if(['id','date','in','out','status'].some(c=>column(c)<0))throw new Error('Required CSV columns: Employee ID, Date, Time In, Time Out, Status');
 const personMap=new Map(employees.filter(p=>p.branch===branch).map(p=>[p.id.toUpperCase(),p]));
 const result:ImportedAttendanceRow[]=[],issues:string[]=[],seen=new Set<string>();const end=addCutoffDays(start,6);
 for(let i=1;i<lines.length;i++){
  const row=lines[i],get=(c:string)=>column(c)<0?'':(row[column(c)]||'').trim();
  const employeeId=get('id').toUpperCase(),employee=personMap.get(employeeId),day=get('date');
  if(!employee){issues.push(`Row ${i+1}: Employee ID ${employeeId||'(blank)'} is not in ${branch}`);continue}
  if(!ISO.test(day)||new Date(`${day}T12:00:00`).toISOString().slice(0,10)!==day||day<start||day>end){issues.push(`Row ${i+1}: Date must be within ${start}–${end}`);continue}
  if(day<employee.hire){issues.push(`Row ${i+1}: Attendance predates this employee's hire date`);continue}
  const pair=`${employeeId}:${day}`;if(seen.has(pair)){issues.push(`Row ${i+1}: Duplicate employee/date ${pair}`);continue}seen.add(pair);
  const status=allowed[key(get('status'))];if(!status){issues.push(`Row ${i+1}: Invalid attendance status`);continue}
  const ti=clock(get('in')),to=clock(get('out'));
  if(ti===null||to===null){issues.push(`Row ${i+1}: Invalid time (HH:MM or h:mm AM/PM required)`);continue}
  let hours=0,late=0;
  if(status==='Present'){
   if(!ti||!to){issues.push(`Row ${i+1}: Present must have both Time In and Time Out`);continue}
   const startMin=Number(ti.slice(0,2))*60+Number(ti.slice(3)),endMin=Number(to.slice(0,2))*60+Number(to.slice(3));
   if(endMin<=startMin||endMin-startMin>16*60){issues.push(`Row ${i+1}: Time Out must be after Time In on the same day (max 16 hours)`);continue}
   hours=Math.round(Math.max(0,(endMin-startMin-60)/60)*100)/100;late=Math.max(0,startMin-8*60);
  }else if(status==='Incomplete'){
   if(!ti&&!to){issues.push(`Row ${i+1}: Incomplete status requires a partial punch`);continue}
  }else if(ti||to){issues.push(`Row ${i+1}: ${status} should not include time punches`);continue}
  const otString=get('ot'),ot=otString?Number(otString):0;
  if(!Number.isFinite(ot)||ot<0||ot>8){issues.push(`Row ${i+1}: Approved OT Hours must be between 0 and 8`);continue}
  const approved=yes(get('otApproved'));
  if(ot>0&&!approved){issues.push(`Row ${i+1}: OT hours require OT Approved = Yes; set to 0 otherwise`);continue}
  if(ot>0&&status!=='Present'){issues.push(`Row ${i+1}: OT requires a complete present punch`);continue}
  result.push({employeeId:employee.id,branch,date:day,timeIn:ti||'',timeOut:to||'',status,workedHours:hours,lateMinutes:late,approvedOtHours:ot,otApproved:approved,notes:get('notes').slice(0,240)});
 }
 return {rows:result,issues,start,end};
}
export function employeeCoverage(rows:readonly ImportedAttendanceRow[],employeeId:string,start:string,hire:string){
 const days=Array.from({length:7},(_,n)=>addCutoffDays(start,n)).filter(day=>day>=hire);
 const selected=rows.filter(x=>x.employeeId===employeeId&&days.includes(x.date));
 const missing=days.filter(day=>!selected.some(x=>x.date===day));
 const incomplete=selected.filter(x=>x.status==='Incomplete');
 return {days,selected,missing,incomplete,ready:days.length>0&&missing.length===0&&incomplete.length===0};
}
export function reminderState(today:string,cutoffEnd:string,uploaded:boolean,reminderDays=2):'upcoming'|'due'|'overdue'|null{
 if(uploaded)return null;if(today===cutoffEnd)return 'due';
 if(today>cutoffEnd)return 'overdue';
 return today>=addCutoffDays(cutoffEnd,-Math.max(0,Math.min(7,reminderDays)))?'upcoming':null;
}
