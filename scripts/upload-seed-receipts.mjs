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

// Seed files must live under the PB user's UUID folder so the normal private
// Storage RLS policy can create signed URLs for the logged-in PB account.
const {data:pb,error:pbError}=await client
  .from('profiles')
  .select('id,branch_id,display_name')
  .eq('role','PB')
  .eq('is_active',true)
  .not('branch_id','is',null)
  .order('created_at',{ascending:true})
  .limit(1)
  .maybeSingle();
if(pbError){
  console.error(`Unable to locate PB account: ${pbError.message}`);
  process.exit(1);
}
if(!pb?.id){
  console.error('No active PB account with an assigned branch was found. Create/assign a PB account first.');
  process.exit(1);
}

const here=dirname(fileURLToPath(import.meta.url));
const dir=join(here,'..','supabase','seed_receipts');
const files=(await readdir(dir)).filter(x=>x.toLowerCase().endsWith('.png'));
const base=`${pb.id}/seed-rfp`;

console.log(`Seeding receipt proofs for PB: ${pb.display_name||pb.id}`);
console.log(`Storage folder: ${base}`);

let failed=false;
for(const name of files){
  const bytes=await readFile(join(dir,name));
  const path=name==='demo-signature.png'
    ? `${base}/demo-signature.png`
    : `${base}/receipts/${name}`;
  const {error}=await client.storage.from('transaction-evidence').upload(path,bytes,{contentType:'image/png',upsert:true});
  if(error){
    failed=true;
    console.error(`Failed: ${path}: ${error.message}`);
  }else{
    console.log(`Uploaded: ${path}`);
  }
}

if(failed)process.exit(1);
console.log('All demo RFP proofs uploaded successfully.');
