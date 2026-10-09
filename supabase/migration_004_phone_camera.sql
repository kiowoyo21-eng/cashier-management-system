-- Run once in Supabase SQL Editor after previous migrations.
-- Mobile capture tokens are SHA-256 hashed. Tokens must never be stored in plaintext.
create table if not exists public.camera_sessions (
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique,
 actor_id uuid not null references public.profiles(id),
 purpose text not null check (purpose in ('fund-handover','expense-receipt')),
 transaction_id text,
 status text not null default 'waiting' check(status in ('waiting','uploading','captured')),
 proof_path text,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 captured_at timestamptz
);
create index if not exists camera_sessions_actor_idx on public.camera_sessions(actor_id,created_at desc);
alter table public.camera_sessions enable row level security;
-- All session operations are performed from authenticated server routes.
revoke all on public.camera_sessions from anon, authenticated;
