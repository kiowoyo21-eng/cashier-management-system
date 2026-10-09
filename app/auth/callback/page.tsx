'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '../../../lib/supabase';

export default function AuthCallback(){
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  async function handle(){
   if(!supabase)throw Error('Supabase environment variables are missing.');
   const url=new URL(window.location.href);
   const serverError=url.searchParams.get('error_description')||url.searchParams.get('error');
   if(serverError)throw Error(serverError);
   const code=url.searchParams.get('code');
   const tokenHash=url.searchParams.get('token_hash');
   const type=url.searchParams.get('type');
   if(code){const {error}=await supabase.auth.exchangeCodeForSession(code);if(error)throw error;}
   else if(tokenHash && (type==='invite'||type==='recovery'||type==='email')){
    const {error}=await supabase.auth.verifyOtp({token_hash:tokenHash,type:type as 'invite'|'recovery'|'email'});if(error)throw error;
   }else if(window.location.hash.includes('access_token=')){
    const hash=new URLSearchParams(window.location.hash.substring(1));
    const access_token=hash.get('access_token');const refresh_token=hash.get('refresh_token');
    if(!access_token||!refresh_token)throw Error('Invalid authentication link.');
    const {error}=await supabase.auth.setSession({access_token,refresh_token});if(error)throw error;
   }
   const {data:{session}}=await supabase.auth.getSession();
   if(!session)throw Error('Invitation or recovery link expired or already used. Request a new email.');
   if(active)window.location.replace('/auth/set-password');
  }
  handle().catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))});
  return ()=>{active=false};
 },[]);
 return <main className="auth-shell"><div className="card auth-card"><h1>Verifying your link</h1>{error?<><div className="notice">{error}</div><p className="muted">You may need a new invitation or password reset email.</p><Link href="/" className="btn ghost">Back to Login</Link></>:<p className="muted">Please wait while we securely verify your invitation or password reset.</p>}</div></main>;
}
