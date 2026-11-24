-- 1. Gyms
create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_id uuid not null references auth.users(id),
  name text not null,
  owner_phone text not null,
  reminder_days integer not null default 3,
  reminders_on boolean not null default true,
  message_channel text not null default 'whatsapp' check (message_channel in ('whatsapp', 'sms'))
);

-- 2. Plans
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  gym_id uuid not null references public.gyms(id),
  name text not null,
  duration_days integer not null,
  price integer not null,
  is_active boolean not null default true
);

-- 3. Members
create table public.members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  gym_id uuid not null references public.gyms(id),
  name text not null,
  phone text not null,
  notes text,
  is_archived boolean not null default false
);

-- 4. Memberships
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  member_id uuid not null references public.members(id),
  plan_id uuid not null references public.plans(id),
  start_date date not null,
  expiry_date date not null,
  amount_due integer not null,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  reminder_sent_at timestamptz
);

-- Index for daily expiry reminder job
create index idx_memberships_expiry_date on public.memberships(expiry_date);

-- 5. Payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  membership_id uuid not null references public.memberships(id),
  amount integer not null,
  method text not null check (method in ('cash', 'upi_manual', 'upi_auto')),
  paid_at timestamptz not null default now(),
  gateway_reference text
);

-- 6. Message Log
create table public.message_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  gym_id uuid not null references public.gyms(id),
  member_id uuid not null references public.members(id),
  kind text not null check (kind in ('receipt', 'reminder')),
  channel text not null check (channel in ('whatsapp', 'sms')),
  status text not null check (status in ('queued', 'sent', 'failed')),
  error text
);

-- Enable Row-Level Security (RLS) on all 6 tables
alter table public.gyms enable row level security;
alter table public.plans enable row level security;
alter table public.members enable row level security;
alter table public.memberships enable row level security;
alter table public.payments enable row level security;
alter table public.message_log enable row level security;

-- RLS Policies: Owners can only access their own gym's data
create policy "Owners manage own gym" on public.gyms
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "Owners manage own plans" on public.plans
  for all using (
    gym_id in (select id from public.gyms where owner_id = auth.uid())
  ) with check (
    gym_id in (select id from public.gyms where owner_id = auth.uid())
  );

create policy "Owners manage own members" on public.members
  for all using (
    gym_id in (select id from public.gyms where owner_id = auth.uid())
  ) with check (
    gym_id in (select id from public.gyms where owner_id = auth.uid())
  );

create policy "Owners manage own memberships" on public.memberships
  for all using (
    member_id in (
      select m.id from public.members m
      join public.gyms g on m.gym_id = g.id
      where g.owner_id = auth.uid()
    )
  ) with check (
    member_id in (
      select m.id from public.members m
      join public.gyms g on m.gym_id = g.id
      where g.owner_id = auth.uid()
    )
  );

create policy "Owners manage own payments" on public.payments
  for all using (
    membership_id in (
      select ms.id from public.memberships ms
      join public.members m on ms.member_id = m.id
      join public.gyms g on m.gym_id = g.id
      where g.owner_id = auth.uid()
    )
  ) with check (
    membership_id in (
      select ms.id from public.memberships ms
      join public.members m on ms.member_id = m.id
      join public.gyms g on m.gym_id = g.id
      where g.owner_id = auth.uid()
    )
  );

create policy "Owners manage own message logs" on public.message_log
  for all using (
    gym_id in (select id from public.gyms where owner_id = auth.uid())
  ) with check (
    gym_id in (select id from public.gyms where owner_id = auth.uid())
  );

-- Temporary table for Milestone 1 phone connection test (removed in Milestone 2)
create table public.connection_test (
  id uuid primary key default gen_random_uuid(),
  message text not null
);
alter table public.connection_test enable row level security;
create policy "Public read for milestone 1 test" on public.connection_test
  for select using (true);
insert into public.connection_test (message) values ('GymBook is connected to Supabase!');

-- Grant API access to tables
grant usage on schema public to anon, authenticated;

grant select on table public.connection_test to anon, authenticated;

grant select, insert, update, delete on table
  public.gyms,
  public.plans,
  public.members,
  public.memberships,
  public.payments,
  public.message_log
to authenticated;