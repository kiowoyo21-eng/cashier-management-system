import {createClient} from '@supabase/supabase-js';
import {readFile,readdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!serviceKey){
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const client=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const here=dirname(fileURLToPath(import.meta.url));
const dir=join(here,'..','supabase','seed_receipts');
const files=(await readdir(dir)).filter(x=>x.toLowerCase().endsWith('.png'));

for(const name of files){
  const bytes=await readFile(join(dir,name));
  const path=name==='demo-signature.png' ? 'seed/demo-signature.png' : `seed/rfp-receipts/${name}`;
  const {error}=await client.storage.from('transaction-evidence').upload(path,bytes,{contentType:'image/png',upsert:true});
  if(error){
    console.error(`Failed: ${path}: ${error.message}`);
    process.exitCode=1;
  }else{
    console.log(`Uploaded: ${path}`);
  }
}
