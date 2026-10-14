-- CMS v7: controlled correction requests. Run after migrations 001-006.
-- No records are deleted. Cash amount corrections change only the difference.
create table if not exists public.correction_requests (
 id uuid primary key default gen_random_uuid(),
 target_type text not null check(target_type in ('cash','pos')),
 target_id text not null,
 reason text not null check(length(trim(reason))>=10),
 proposed_changes jsonb not null,
 status text not null default 'Pending Approval' check(status in ('Pending Approval','Approved for Editing','Rejected','Applied')),
 requested_by uuid not null references public.profiles(id),
 reviewed_by uuid references public.profiles(id),
 review_note text,
 requested_at timestamptz not null default now(),
 reviewed_at timestamptz,
 applied_at timestamptz,
 expires_at timestamptz
);
create index if not exists correction_target_idx on public.correction_requests(target_type,target_id,requested_at desc);
create unique index if not exists correction_one_open_idx on public.correction_requests(target_type,target_id) where status in ('Pending Approval','Approved for Editing');
alter table public.correction_requests enable row level security;
revoke all on public.correction_requests from public,anon,authenticated;
grant select on public.correction_requests to authenticated;
drop policy if exists correction_read on public.correction_requests;
create policy correction_read on public.correction_requests for select to authenticated using (
 requested_by=auth.uid() or (select private.is_admin())
);
create or replace function public.request_correction(p_type text,p_id text,p_reason text,p_changes jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_owner uuid; v_role text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_type not in ('cash','pos') or length(trim(coalesce(p_reason,'')))<10 or jsonb_typeof(p_changes)<>'object' then raise exception 'Invalid correction request'; end if;
 if p_type='cash' then
  select actor_id into v_owner from public.cash_transactions where id=p_id;
  if not found then raise exception 'Transaction not found'; end if;
  if not (p_changes ? 'amount') or jsonb_typeof(p_changes->'amount') <> 'number' or (p_changes->>'amount')::numeric<=0 then raise exception 'Valid corrected amount required'; end if;
 else
  select actor_id into v_owner from public.pos_accounts where id=p_id;
  if not found then raise exception 'POS not found'; end if;
  if jsonb_typeof(p_changes->'items') <> 'array' or jsonb_array_length(p_changes->'items')=0 then raise exception 'Revised quotation items required'; end if;
 end if;
 select role into v_role from public.profiles where id=auth.uid();
 if v_owner<>auth.uid() and v_role not in ('Admin','Super Admin') then raise exception 'Only owner or authorized staff can request correction'; end if;
 insert into public.correction_requests(target_type,target_id,reason,proposed_changes,requested_by)
 values(p_type,p_id,p_reason,p_changes,auth.uid()) returning id into v_id;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 values(auth.uid(),'correction',v_id::text,'Correction requested',jsonb_build_object('target_type',p_type,'target_id',p_id,'reason',p_reason,'proposed_changes',p_changes));
 return v_id;
end $$;
create or replace function public.review_correction(p_request uuid,p_approve boolean,p_note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare v public.correction_requests%rowtype;
begin
 if not (select private.is_admin()) then raise exception 'Admin or Super Admin required'; end if;
 select * into v from public.correction_requests where id=p_request for update;
 if not found or v.status<>'Pending Approval' then raise exception 'Request is not pending'; end if;
 if v.requested_by=auth.uid() then raise exception 'You cannot approve your own correction'; end if;
 if not p_approve and length(trim(coalesce(p_note,'')))<3 then raise exception 'Rejection reason required'; end if;
 update public.correction_requests set status=case when p_approve then 'Approved for Editing' else 'Rejected' end,
 reviewed_by=auth.uid(),review_note=p_note,reviewed_at=now(),expires_at=case when p_approve then now()+interval '30 minutes' else null end where id=p_request;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 values(auth.uid(),'correction',p_request::text,case when p_approve then 'Correction approved' else 'Correction rejected' end,jsonb_build_object('note',p_note));
end $$;
create or replace function public.apply_correction(p_request uuid,p_signature text)
returns void language plpgsql security definer set search_path='' as $$
declare v public.correction_requests%rowtype; c public.cash_transactions%rowtype; p public.pos_accounts%rowtype;
 new_amount numeric; new_items jsonb; total numeric:=0; paid numeric:=0; elem jsonb; old_total numeric:=0;
begin
 select * into v from public.correction_requests where id=p_request for update;
 if not found or v.status<>'Approved for Editing' or now()>v.expires_at then raise exception 'Correction approval expired or invalid'; end if;
 if v.requested_by<>auth.uid() then raise exception 'Only requesting employee can apply approved correction'; end if;
 if p_signature is null or split_part(p_signature,'/',1)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='transaction-evidence' and name=p_signature) then raise exception 'Fresh signature required'; end if;
 if v.target_type='cash' then
  select * into c from public.cash_transactions where id=v.target_id for update;
  if not found then raise exception 'Cash transaction not found'; end if;
  new_amount:=(v.proposed_changes->>'amount')::numeric;
  if new_amount<=0 or new_amount>100000000 then raise exception 'Invalid corrected amount'; end if;
  if v.proposed_changes ? 'category' and length(trim(v.proposed_changes->>'category'))=0 then raise exception 'Category cannot be blank'; end if;
  if v.proposed_changes ? 'description' and length(trim(v.proposed_changes->>'description'))=0 then raise exception 'Purpose cannot be blank'; end if;
  update public.cash_transactions set amount=new_amount,category=coalesce(nullif(trim(v.proposed_changes->>'category'),''),c.category),description=coalesce(nullif(trim(v.proposed_changes->>'description'),''),c.description),signature_path=p_signature,status='Pending for Approval' where id=c.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,detail) values(auth.uid(),'cash',c.id,'Correction applied; net difference only',jsonb_build_object('old_amount',c.amount,'new_amount',new_amount,'old_category',c.category,'new_category',coalesce(v.proposed_changes->>'category',c.category),'old_description',c.description,'new_description',coalesce(v.proposed_changes->>'description',c.description),'delta',case when c.kind='Additional Funds' then new_amount-c.amount else c.amount-new_amount end,'correction_request',v.id));
 else
  select * into p from public.pos_accounts where id=v.target_id for update;
  if not found or p.status<>'Pending' then raise exception 'Only pending POS quotation can be re-edited; closed sales require a separate adjustment workflow'; end if;
  new_items:=v.proposed_changes->'items';
  if jsonb_typeof(new_items)<>'array' or jsonb_array_length(new_items)=0 then raise exception 'Quotation items required'; end if;
  for elem in select value from jsonb_array_elements(new_items) loop
   if nullif(trim(elem->>'name'),'') is null or (elem->>'qty')::numeric<=0 or (elem->>'price')::numeric<0 then raise exception 'Invalid quotation item'; end if;
   total:=total+(elem->>'qty')::numeric*(elem->>'price')::numeric;
  end loop;
  select coalesce(sum((x->>'amount')::numeric),0) into paid from jsonb_array_elements(p.payments) x;
  if total<paid then raise exception 'Revised quote is below payments already collected; resolve refund/credit first'; end if;
  select coalesce(sum((x->>'qty')::numeric*(x->>'price')::numeric),0) into old_total from jsonb_array_elements(p.items) x;
  update public.pos_accounts set items=new_items where id=p.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,detail) values(auth.uid(),'pos',p.id,'Quotation revised',jsonb_build_object('old_items',p.items,'new_items',new_items,'old_total',old_total,'new_total',total,'correction_request',v.id,'signature',p_signature));
 end if;
 update public.correction_requests set status='Applied',applied_at=now() where id=v.id;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,detail) values(auth.uid(),'correction',v.id::text,'Correction applied',jsonb_build_object('target_id',v.target_id));
end $$;
revoke all on function public.request_correction(text,text,text,jsonb),public.review_correction(uuid,boolean,text),public.apply_correction(uuid,text) from public,anon;
grant execute on function public.request_correction(text,text,text,jsonb),public.review_correction(uuid,boolean,text),public.apply_correction(uuid,text) to authenticated;
