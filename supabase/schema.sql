-- Run in Supabase SQL Editor on a NEW project.
create extension if not exists pgcrypto;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default 'Staff',
 role text not null default 'Cashier' check (role in ('Cashier','Admin','Super Admin')),
 created_at timestamptz not null default now()
);
create table public.cash_transactions (
 id text primary key,
 account text not null check (account in ('Petty Cash','Funds')),
 kind text not null check (kind in ('Additional Funds','Expense')),
 amount numeric(14,2) not null check (amount > 0),
 category text not null check(length(trim(category))>0),
 description text not null check(length(trim(description))>0),
 actor_id uuid not null references public.profiles(id),
 signature_path text not null,
 proof_path text,
 status text not null default 'Pending for Approval' check(status in ('Pending for Approval','Approved','Submit Explanation')),
 explanation text,
 reviewer_note text,
 created_at timestamptz not null default now()
);
create table public.pos_accounts (
 id text primary key,
 actor_id uuid not null references public.profiles(id),
 client text not null, phone text not null default '', vehicle text not null,
 plate text not null default '', concern text not null default '',
 items jsonb not null, payments jsonb not null default '[]',
 costs numeric(14,2) not null default 0 check(costs>=0),
 status text not null default 'Pending' check(status in ('Pending','Closed')),
 created_at timestamptz not null default now(), closed_at timestamptz
);
create table public.audit_logs (
 id bigint generated always as identity primary key,
 actor_id uuid not null references public.profiles(id),
 entity_type text not null, entity_id text not null,
 action text not null, detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index on public.audit_logs(entity_type,entity_id,created_at);
create index on public.cash_transactions(created_at desc);
create index on public.pos_accounts(created_at desc);
create or replace function public.create_profile_on_signup() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,display_name) values(new.id,coalesce(nullif(split_part(new.email,'@',1),''),'Staff')); return new; end $$;
create trigger on_user_created after insert on auth.users for each row execute function public.create_profile_on_signup();
-- Historical users (if users already exist before running this script)
insert into public.profiles(id,display_name) select id,coalesce(split_part(email,'@',1),'Staff') from auth.users on conflict do nothing;
create schema if not exists private;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role in ('Admin','Super Admin')) $$;
create function private.is_super() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='Super Admin') $$;
create function private.my_role() returns text language sql stable security definer set search_path='' as $$ select role from public.profiles where id=auth.uid() $$;
revoke all on function private.is_admin(),private.is_super(),private.my_role() from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.is_admin(),private.is_super(),private.my_role() to authenticated;
alter table public.profiles enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.pos_accounts enable row level security;
alter table public.audit_logs enable row level security;
create policy profile_self on public.profiles for select to authenticated using(id=auth.uid());
create policy cash_read on public.cash_transactions for select to authenticated using(true);
create policy pos_read on public.pos_accounts for select to authenticated using(true);
create policy audit_super on public.audit_logs for select to authenticated using((select private.is_super()));
-- Client has SELECT only. All writes happen through validated RPCs.
revoke all on public.profiles, public.cash_transactions, public.pos_accounts, public.audit_logs from anon, authenticated;
grant select on public.profiles, public.cash_transactions, public.pos_accounts, public.audit_logs to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('transaction-evidence','transaction-evidence',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
-- Upload path must begin with logged-in user's UUID. No public reads or edits.
create policy evidence_insert on storage.objects for insert to authenticated with check(bucket_id='transaction-evidence' and (storage.foldername(name))[1]=auth.uid()::text and lower(storage.extension(name)) in ('jpg','jpeg','png','webp'));
create policy evidence_read on storage.objects for select to authenticated using(bucket_id='transaction-evidence' and ((storage.foldername(name))[1]=auth.uid()::text or (select private.is_admin())));
-- The service always uses user-scoped storage paths; paths are validated by RPC.
create function public.create_cash_transaction(p_id text,p_account text,p_kind text,p_amount numeric,p_category text,p_description text,p_signature text,p_proof text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_account not in ('Petty Cash','Funds') or p_kind not in ('Additional Funds','Expense') or p_amount<=0 or p_amount>100000000 or nullif(trim(p_category),'') is null or nullif(trim(p_description),'') is null then raise exception 'Invalid transaction details'; end if;
 if p_signature is null or split_part(p_signature,'/',1)<>auth.uid()::text then raise exception 'Invalid signature attachment'; end if;
 if p_kind='Additional Funds' and p_proof is null then raise exception 'Handover photo required'; end if;
 if p_proof is not null and split_part(p_proof,'/',1)<>auth.uid()::text then raise exception 'Invalid proof attachment'; end if;
 if not exists(select 1 from storage.objects where bucket_id='transaction-evidence' and name=p_signature) then raise exception 'Signature image not found'; end if;
 if p_proof is not null and not exists(select 1 from storage.objects where bucket_id='transaction-evidence' and name=p_proof) then raise exception 'Proof image not found'; end if;
 insert into public.cash_transactions(id,account,kind,amount,category,description,actor_id,signature_path,proof_path)
 values(p_id,p_account,p_kind,p_amount,p_category,p_description,auth.uid(),p_signature,p_proof);
 insert into public.audit_logs(actor_id,entity_type,entity_id,action) values(auth.uid(),'cash',p_id,'Created; balance adjusted; Pending for Approval');
end $$;
create function public.attach_cash_proof(p_id text,p_path text) returns void language plpgsql security definer set search_path='' as $$
declare v public.cash_transactions%rowtype;
begin
 select * into v from public.cash_transactions where id=p_id for update;
 if not found or v.actor_id<>auth.uid() or v.kind<>'Expense' or v.proof_path is not null then raise exception 'Proof cannot be attached'; end if;
 if split_part(p_path,'/',1)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='transaction-evidence' and name=p_path) then raise exception 'Invalid proof'; end if;
 update public.cash_transactions set proof_path=p_path where id=p_id;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action) values(auth.uid(),'cash',p_id,'Receipt proof attached');
end $$;
create function public.review_cash(p_id text,p_action text,p_note text default null) returns void language plpgsql security definer set search_path='' as $$
declare v public.cash_transactions%rowtype;
begin
 if not private.is_admin() then raise exception 'Admin access required'; end if;
 select * into v from public.cash_transactions where id=p_id for update;
 if not found or v.status<>'Pending for Approval' then raise exception 'Invalid review status'; end if;
 if v.actor_id=auth.uid() then raise exception 'Cannot approve or review own cash transaction'; end if;
 if p_action='approve' then
  if v.proof_path is null then raise exception 'Receipt proof required'; end if;
  update public.cash_transactions set status='Approved' where id=p_id;
 elsif p_action='request' then
  if nullif(trim(p_note),'') is null then raise exception 'Review reason required'; end if;
  update public.cash_transactions set status='Submit Explanation',reviewer_note=p_note where id=p_id;
 else raise exception 'Invalid action'; end if;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,detail) values(auth.uid(),'cash',p_id,p_action,jsonb_build_object('note',p_note));
end $$;
create function public.explain_cash(p_id text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare v public.cash_transactions%rowtype;
begin
 select * into v from public.cash_transactions where id=p_id for update;
 if not found or v.actor_id<>auth.uid() or v.status<>'Submit Explanation' or nullif(trim(p_note),'') is null then raise exception 'Explanation not allowed'; end if;
 update public.cash_transactions set status='Pending for Approval',explanation=p_note where id=p_id;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,detail) values(auth.uid(),'cash',p_id,'Explanation submitted',jsonb_build_object('explanation',p_note));
end $$;
create function public.create_pos(p_id text,p_client text,p_phone text,p_vehicle text,p_plate text,p_concern text,p_items jsonb,p_payments jsonb,p_costs numeric) returns void language plpgsql security definer set search_path='' as $$
declare j jsonb; v_total numeric:=0; v_paid numeric:=0;
begin
 if auth.uid() is null or nullif(trim(p_client),'') is null or nullif(trim(p_vehicle),'') is null or p_costs<0 or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_typeof(p_payments)<>'array' then raise exception 'Invalid POS data'; end if;
 for j in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(j->'name')<>'string' or (j->>'qty')::numeric<=0 or (j->>'price')::numeric<0 then raise exception 'Invalid POS item'; end if;
  v_total:=v_total+(j->>'qty')::numeric*(j->>'price')::numeric;
 end loop;
 for j in select value from jsonb_array_elements(p_payments) loop
  if (j->>'amount')::numeric<=0 or nullif(j->>'method','') is null then raise exception 'Invalid payment'; end if;
  v_paid:=v_paid+(j->>'amount')::numeric;
 end loop;
 if v_paid>v_total then raise exception 'Overpayment is not allowed'; end if;
 insert into public.pos_accounts(id,actor_id,client,phone,vehicle,plate,concern,items,payments,costs)
 values(p_id,auth.uid(),p_client,coalesce(p_phone,''),p_vehicle,coalesce(p_plate,''),coalesce(p_concern,''),p_items,p_payments,p_costs);
 insert into public.audit_logs(actor_id,entity_type,entity_id,action) values(auth.uid(),'pos',p_id,'POS created as Pending');
end $$;
create function public.close_pos(p_id text) returns void language plpgsql security definer set search_path='' as $$
declare v public.pos_accounts%rowtype; due numeric; paid numeric;
begin
 select * into v from public.pos_accounts where id=p_id for update;
 if not found or v.status<>'Pending' then raise exception 'Not a pending POS'; end if;
 select coalesce(sum((x->>'qty')::numeric*(x->>'price')::numeric),0) into due from jsonb_array_elements(v.items) x;
 select coalesce(sum((x->>'amount')::numeric),0) into paid from jsonb_array_elements(v.payments) x;
 if abs(due-paid)>0.005 then raise exception 'Full payment required to close'; end if;
 update public.pos_accounts set status='Closed',closed_at=now() where id=p_id;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action) values(auth.uid(),'pos',p_id,'Account closed; automatically visible in Sales');
end $$;
revoke execute on function public.create_cash_transaction(text,text,text,numeric,text,text,text,text), public.attach_cash_proof(text,text),public.review_cash(text,text,text),public.explain_cash(text,text),public.create_pos(text,text,text,text,text,text,jsonb,jsonb,numeric),public.close_pos(text) from public,anon;
grant execute on function public.create_cash_transaction(text,text,text,numeric,text,text,text,text), public.attach_cash_proof(text,text),public.review_cash(text,text,text),public.explain_cash(text,text),public.create_pos(text,text,text,text,text,text,jsonb,jsonb,numeric),public.close_pos(text) to authenticated;
-- IMPORTANT: Promote YOUR trusted admin only after creating a Supabase Auth user:
-- update public.profiles set role='Super Admin' where id=(select id from auth.users where email='YOUR_EMAIL');

-- Phase 2 migration: run this additional block in SQL Editor if Phase 1 schema is already installed.
create or replace function public.add_pos_payment(p_id text,p_amount numeric,p_method text)
returns void language plpgsql security definer set search_path='' as $$
declare v public.pos_accounts%rowtype; due numeric; paid numeric;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into v from public.pos_accounts where id=p_id for update;
 if not found or v.status<>'Pending' then raise exception 'POS account is not pending'; end if;
 if p_amount is null or p_amount<=0 or p_amount>100000000 or nullif(trim(p_method),'') is null then raise exception 'Invalid payment'; end if;
 select coalesce(sum((x->>'qty')::numeric*(x->>'price')::numeric),0) into due from jsonb_array_elements(v.items) x;
 select coalesce(sum((x->>'amount')::numeric),0) into paid from jsonb_array_elements(v.payments) x;
 if paid+p_amount>due+0.005 then raise exception 'Overpayment is not allowed'; end if;
 update public.pos_accounts set payments=payments||jsonb_build_array(jsonb_build_object('amount',p_amount,'method',p_method,'at',now())) where id=p_id;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,detail) values(auth.uid(),'pos',p_id,'Additional payment recorded',jsonb_build_object('amount',p_amount,'method',p_method));
end $$;
revoke all on function public.add_pos_payment(text,numeric,text) from public,anon;
grant execute on function public.add_pos_payment(text,numeric,text) to authenticated;
