import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const runtime='nodejs';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
const secret=process.env.SUPABASE_SERVICE_ROLE_KEY!;
function response(error:string,status=400){return NextResponse.json({error},{status});}
async function authorize(req:NextRequest){
 if(!url||!secret)throw new Error('Missing server-side Supabase configuration');
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!token)throw new Error('Missing authentication');
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
 const {data:{user},error}=await auth.auth.getUser(token);
 if(error||!user)throw new Error('Invalid session');
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile,error:roleError}=await admin.from('profiles').select('role').eq('id',user.id).single();
 if(roleError||profile?.role!=='Super Admin')throw new Error('Super Admin access required');
 return {admin,actor:user.id};
}
export async function GET(req:NextRequest){try{const {admin}=await authorize(req);const {data:profiles,error}=await admin.from('profiles').select('id,display_name,role,created_at,is_active').order('created_at',{ascending:false});if(error)throw error;const {data:users,error:authError}=await admin.auth.admin.listUsers({page:1,perPage:1000});if(authError)throw authError;const emails=new Map(users.users.map(u=>[u.id,u.email]));return NextResponse.json({users:(profiles||[]).map(p=>({...p,email:emails.get(p.id)||''}))});}catch(e:any){return response(e.message, e.message?.includes('access')?403:400)}}
export async function POST(req:NextRequest){try{const {admin,actor}=await authorize(req);const body=await req.json();const email=String(body.email||'').trim().toLowerCase(),name=String(body.name||'').trim(),role=String(body.role||'');if(!/^\S+@\S+\.\S+$/.test(email)||!name||name.length>120||!['Cashier','Admin'].includes(role))return response('Valid employee name, email and role required');
 // Invite users to set their own passwords; never email or expose a permanent password.
 const siteUrl=(process.env.NEXT_PUBLIC_SITE_URL|| (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : req.nextUrl.origin)).replace(/\/$/,'');
 const redirectTo=new URL('/auth/callback',siteUrl).toString();
 const {data,error}=await admin.auth.admin.inviteUserByEmail(email,{data:{display_name:name},redirectTo});if(error)throw error;
 const id=data.user.id;const {error:profileError}=await admin.from('profiles').upsert({id,display_name:name,role,is_active:true},{onConflict:'id'});if(profileError)throw profileError;
 await admin.from('audit_logs').insert({actor_id:actor,entity_type:'user',entity_id:id,action:'User invited',detail:{role}});
 return NextResponse.json({ok:true,message:'Invitation email sent. User sets password from the link.'});
 }catch(e:any){return response(e.message)}}
export async function PATCH(req:NextRequest){try{const {admin,actor}=await authorize(req);const body=await req.json();const id=String(body.id||''),role=body.role,is_active=body.is_active;if(!/^[0-9a-f-]{36}$/i.test(id)||id===actor)return response('Invalid target account or cannot edit own account');const updates:Record<string,unknown>={};if(role!==undefined){if(!['Cashier','Admin'].includes(role))return response('Only Cashier or Admin roles can be assigned');updates.role=role;}if(is_active!==undefined){if(typeof is_active!=='boolean')return response('Invalid account status');updates.is_active=is_active;}if(!Object.keys(updates).length)return response('No changes provided');const {data:target,error:readError}=await admin.from('profiles').select('role').eq('id',id).single();if(readError)throw readError;if(target.role==='Super Admin')return response('Cannot modify another Super Admin from this screen');const {error}=await admin.from('profiles').update(updates).eq('id',id);if(error)throw error;await admin.from('audit_logs').insert({actor_id:actor,entity_type:'user',entity_id:id,action:'User settings updated',detail:updates});return NextResponse.json({ok:true});}catch(e:any){return response(e.message,e.message?.includes('access')?403:400)}}
