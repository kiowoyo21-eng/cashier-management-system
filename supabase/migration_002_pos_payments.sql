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
