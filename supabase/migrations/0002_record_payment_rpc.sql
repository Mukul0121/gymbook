create or replace function public.record_payment_tx(
  p_membership_id uuid,
  p_amount integer,
  p_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership record;
  v_payment_id uuid;
begin
  -- Verify ownership and lock the membership row so double-taps cannot race
  select ms.id, ms.status
  into v_membership
  from public.memberships ms
  join public.members m on ms.member_id = m.id
  join public.gyms g on m.gym_id = g.id
  where ms.id = p_membership_id
    and g.owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Membership not found or access denied.';
  end if;

  if v_membership.status = 'paid' then
    raise exception 'This membership is already marked as paid.';
  end if;

  insert into public.payments (membership_id, amount, method)
  values (p_membership_id, p_amount, p_method)
  returning id into v_payment_id;

  update public.memberships
  set status = 'paid'
  where id = p_membership_id;

  return jsonb_build_object('payment_id', v_payment_id, 'status', 'paid');
end;
$$;

grant execute on function public.record_payment_tx(uuid, integer, text) to authenticated;