'use client';
import {useState} from 'react';
import Link from 'next/link';
import {supabase} from '../../../lib/supabase';
export default function ForgotPassword(){
 const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent){e.preventDefault();setError('');if(!supabase){setError('Supabase is not configured.');return}setBusy(true);try{const redirectTo=`${window.location.origin}/auth/callback`;const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo});if(error)throw error;setSent(true)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 return <main className="auth-shell"><div className="card auth-card"><h1>Forgot Password</h1><p className="muted">Request a secure password reset link.</p>{sent?<div className="notice">If an account exists for that email, a reset link has been sent. Check your inbox and spam folder.</div>:<form onSubmit={submit}><label>Email Address<input className="input" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>{error&&<div className="notice">{error}</div>}<button className="btn" disabled={busy} type="submit">{busy?'Sending...':'Send Reset Link'}</button></form>}<p><Link href="/">Back to Login</Link></p></div></main>;
}
