import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 if(process.env.ENABLE_TEST_RESET!=='true'||process.env.NODE_ENV==='production'&&process.env.ALLOW_PRODUCTION_TEST_RESET!=='true')return NextResponse.json({error:'Test reset is disabled on this deployment'},{status:403});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!secret)return NextResponse.json({error:'Missing server-side configuration'},{status:503});
 try{const token=request.headers.get('authorization')?.replace(/^Bearer /i,'');if(!token)return NextResponse.json({error:'Unauthorized'},{status:401});
 const userClient=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
 const {data:{user},error}=await userClient.auth.getUser(token);if(error||!user?.email)return NextResponse.json({error:'Unauthorized'},{status:401});
 const {data:profile}=await userClient.from('profiles').select('role,is_active').eq('id',user.id).single();if(profile?.role!=='Super Admin'||!profile.is_active)return NextResponse.json({error:'Super Admin required'},{status:403});
 const body=await request.json();if(body.phrase!=='RESET TEST DATA'||typeof body.password!=='string'||!body.password)return NextResponse.json({error:'Confirmation missing'},{status:400});
 const {error:pwdError}=await createClient(url,anon,{auth:{persistSession:false}}).auth.signInWithPassword({email:user.email,password:body.password});if(pwdError)return NextResponse.json({error:'Password verification failed'},{status:403});
 const admin=createClient(url,secret,{auth:{persistSession:false}});
 const {error:resetError}=await admin.rpc('reset_test_financial_data',{p_actor:user.id});if(resetError)throw resetError;
 // Storage cleanup deliberately kept separate: do not claim a complete physical deletion when objects may remain.
 return NextResponse.json({ok:true,warning:'Database records cleared; Storage evidence files require separate cleanup.'});
 }catch(e:unknown){return NextResponse.json({error:e instanceof Error?e.message:'Reset failed'},{status:500})}
}
