const ones=['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function underThousand(n:number):string {const parts:string[]=[];if(n>=100){parts.push(ones[Math.floor(n/100)]+' Hundred');n%=100;}if(n>=20){parts.push(tens[Math.floor(n/10)]);n%=10;}if(n>0)parts.push(ones[n]);return parts.join(' ');}
export function pesoInWords(value:number):string {
 if(!Number.isFinite(value)||value<0||value>999999999999.99)return 'Invalid amount';
 const cents=Math.round(value*100);let whole=Math.floor(cents/100),fraction=cents%100;
 if(!whole&&!fraction)return 'Zero Pesos';
 const words:string[]=[];
 for(const [unit,scale] of [['Billion',1e9],['Million',1e6],['Thousand',1e3],['',1]] as const){const chunk=Math.floor(whole/scale);if(chunk){words.push(underThousand(chunk)+(unit?' '+unit:''));whole%=scale;}}
 let result=(words.join(' ')||'Zero')+' Pesos';
 if(fraction)result+=' and '+String(fraction).padStart(2,'0')+'/100';
 return result;
}
