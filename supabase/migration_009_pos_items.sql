-- CMS v9: itemized COGS + auditable post-submission additional transactions.
-- Run AFTER migration 008; no existing data is cleared.
alter table public.pos_accounts add column if not exists cogs_items jsonb not null default '[]'::jsonb;
create table if not exists public.pos_additional_transactions (
 id bigint generated always as identity primary key,
 pos_id text not null references public.pos_accounts(id),
 actor_id uuid not null references public.profiles(id),
 items jsonb not null,
 cogs_items jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.pos_additional_transactions enable row level security;
revoke all on public.pos_additional_transactions from anon, authenticated;
grant select on public.pos_additional_transactions to authenticated;
-- Read access is limited by the underlying account visibility.
drop policy if exists pos_additional_select on public.pos_additional_transactions;
create policy pos_additional_select on public.pos_additional_transactions for select to authenticated using(
 exists(select 1 from public.pos_accounts p where p.id=pos_id)
);
create or replace function public.set_pos_cogs_items(p_id text,p_items jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v public.pos_accounts%rowtype; j jsonb; cost numeric:=0;
begin
 if auth.uid() is null then raise exception 'Not signed in'; end if;
 select * into v from public.pos_accounts where id=p_id for update;
 if not found or v.actor_id<>auth.uid() or v.status<>'Pending' then raise exception 'Cannot record these costs'; end if;
 if jsonb_typeof(p_items)<>'array' then raise exception 'Invalid COGS'; end if;
 for j in select value from jsonb_array_elements(p_items) loop
  if nullif(trim(j->>'name'),'') is null or nullif(trim(j->>'supplier'),'') is null or
  (j->>'qty')::numeric<=0 or (j->>'unitCost')::numeric<0 then raise exception 'Invalid cost item'; end if;
  cost:=cost+(j->>'qty')::numeric*(j->>'unitCost')::numeric;
 end loop;
 update public.pos_accounts set cogs_items=p_items,costs=cost where id=p_id;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 values(auth.uid(),'pos',p_id,'COGS items recorded',jsonb_build_object('total',cost));
end $$;
create or replace function public.add_pos_additional(p_id text,p_items jsonb,p_cogs jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v public.pos_accounts%rowtype; j jsonb; extra numeric:=0; cost numeric:=0;
begin
 if auth.uid() is null then raise exception 'Not signed in'; end if;
 select * into v from public.pos_accounts where id=p_id for update;
 if not found or v.status<>'Pending' then raise exception 'POS is closed or unavailable'; end if;
 if v.actor_id<>auth.uid() and not exists(select 1 from public.profiles where id=auth.uid() and role in ('Admin','Super Admin')) then raise exception 'Not authorized for this POS'; end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active=true) then raise exception 'Account disabled'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_typeof(p_cogs)<>'array' then raise exception 'Invalid additional transaction'; end if;
 for j in select value from jsonb_array_elements(p_items) loop
  if nullif(trim(j->>'name'),'') is null or (j->>'qty')::numeric<=0 or (j->>'price')::numeric<0 then raise exception 'Invalid quotation item'; end if;
  extra:=extra+(j->>'qty')::numeric*(j->>'price')::numeric;
 end loop;
 for j in select value from jsonb_array_elements(p_cogs) loop
  if nullif(trim(j->>'name'),'') is null or nullif(trim(j->>'supplier'),'') is null or (j->>'qty')::numeric<=0 or (j->>'unitCost')::numeric<0 then raise exception 'Invalid cost item'; end if;
  cost:=cost+(j->>'qty')::numeric*(j->>'unitCost')::numeric;
 end loop;
 insert into public.pos_additional_transactions(pos_id,actor_id,items,cogs_items) values(p_id,auth.uid(),p_items,p_cogs);
 update public.pos_accounts set items=items||p_items,cogs_items=cogs_items||p_cogs,costs=costs+cost where id=p_id;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,detail) values(auth.uid(),'pos',p_id,'Additional transaction recorded',jsonb_build_object('sale_amount',extra,'cost_amount',cost));
end $$;
revoke execute on function public.set_pos_cogs_items(text,jsonb), public.add_pos_additional(text,jsonb,jsonb) from public,anon;
grant execute on function public.set_pos_cogs_items(text,jsonb), public.add_pos_additional(text,jsonb,jsonb) to authenticated;
