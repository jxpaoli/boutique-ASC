create schema boutique_asc;
create schema boutique_asc_private;

revoke all on schema boutique_asc_private from public;

create table boutique_asc.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email = lower(email)),
  role text not null check (role in ('admin', 'supervision', 'user')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table boutique_asc.config (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table boutique_asc.joueurs (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table boutique_asc.stock (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table boutique_asc.inventaires (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table boutique_asc.preinscriptions (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table boutique_asc.commandes (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function boutique_asc_private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from boutique_asc.memberships
    where user_id = (select auth.uid()) and active
  );
$$;

create or replace function boutique_asc_private.has_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from boutique_asc.memberships
    where user_id = (select auth.uid()) and active and role = any(required_roles)
  );
$$;

revoke all on function boutique_asc_private.is_member() from public;
revoke all on function boutique_asc_private.has_role(text[]) from public;
grant usage on schema boutique_asc_private to authenticated;
grant execute on function boutique_asc_private.is_member() to authenticated;
grant execute on function boutique_asc_private.has_role(text[]) to authenticated;

grant usage on schema boutique_asc to anon, authenticated, service_role;
grant select on boutique_asc.config to anon;
grant insert on boutique_asc.preinscriptions to anon;
grant select on boutique_asc.memberships to authenticated;
grant select, insert, update on boutique_asc.config to authenticated;
grant select, insert, update, delete on boutique_asc.joueurs to authenticated;
grant select, insert, update, delete on boutique_asc.stock to authenticated;
grant select, insert, delete on boutique_asc.inventaires to authenticated;
grant select, insert, delete on boutique_asc.preinscriptions to authenticated;
grant select, insert, update, delete on boutique_asc.commandes to authenticated;
grant all on all tables in schema boutique_asc to service_role;

alter table boutique_asc.memberships enable row level security;
alter table boutique_asc.config enable row level security;
alter table boutique_asc.joueurs enable row level security;
alter table boutique_asc.stock enable row level security;
alter table boutique_asc.inventaires enable row level security;
alter table boutique_asc.preinscriptions enable row level security;
alter table boutique_asc.commandes enable row level security;

create policy memberships_read on boutique_asc.memberships
for select to authenticated
using (user_id = (select auth.uid()) or (select boutique_asc_private.has_role(array['admin'])));

create policy config_public_read on boutique_asc.config for select to anon using (true);
create policy config_member_read on boutique_asc.config for select to authenticated using ((select boutique_asc_private.is_member()));
create policy config_admin_insert on boutique_asc.config for insert to authenticated with check ((select boutique_asc_private.has_role(array['admin'])));
create policy config_admin_update on boutique_asc.config for update to authenticated
using ((select boutique_asc_private.has_role(array['admin'])))
with check ((select boutique_asc_private.has_role(array['admin'])));

create policy joueurs_member_read on boutique_asc.joueurs for select to authenticated using ((select boutique_asc_private.is_member()));
create policy joueurs_member_insert on boutique_asc.joueurs for insert to authenticated with check ((select boutique_asc_private.is_member()));
create policy joueurs_member_update on boutique_asc.joueurs for update to authenticated
using ((select boutique_asc_private.is_member())) with check ((select boutique_asc_private.is_member()));
create policy joueurs_supervisor_delete on boutique_asc.joueurs for delete to authenticated
using ((select boutique_asc_private.has_role(array['admin', 'supervision'])));

create policy stock_member_read on boutique_asc.stock for select to authenticated using ((select boutique_asc_private.is_member()));
create policy stock_member_insert on boutique_asc.stock for insert to authenticated with check ((select boutique_asc_private.is_member()));
create policy stock_member_update on boutique_asc.stock for update to authenticated
using ((select boutique_asc_private.is_member())) with check ((select boutique_asc_private.is_member()));
create policy stock_supervisor_delete on boutique_asc.stock for delete to authenticated
using ((select boutique_asc_private.has_role(array['admin', 'supervision'])));

create policy inventaires_member_read on boutique_asc.inventaires for select to authenticated using ((select boutique_asc_private.is_member()));
create policy inventaires_member_insert on boutique_asc.inventaires for insert to authenticated with check ((select boutique_asc_private.is_member()));
create policy inventaires_supervisor_delete on boutique_asc.inventaires for delete to authenticated
using ((select boutique_asc_private.has_role(array['admin', 'supervision'])));

create policy preinscriptions_public_insert on boutique_asc.preinscriptions for insert to anon with check (true);
create policy preinscriptions_member_read on boutique_asc.preinscriptions for select to authenticated using ((select boutique_asc_private.is_member()));
create policy preinscriptions_member_insert on boutique_asc.preinscriptions for insert to authenticated with check ((select boutique_asc_private.is_member()));
create policy preinscriptions_member_delete on boutique_asc.preinscriptions for delete to authenticated using ((select boutique_asc_private.is_member()));

create policy commandes_member_read on boutique_asc.commandes for select to authenticated using ((select boutique_asc_private.is_member()));
create policy commandes_member_insert on boutique_asc.commandes for insert to authenticated with check ((select boutique_asc_private.is_member()));
create policy commandes_member_update on boutique_asc.commandes for update to authenticated
using ((select boutique_asc_private.is_member())) with check ((select boutique_asc_private.is_member()));
create policy commandes_supervisor_delete on boutique_asc.commandes for delete to authenticated
using ((select boutique_asc_private.has_role(array['admin', 'supervision'])));

alter publication supabase_realtime add table
  boutique_asc.memberships,
  boutique_asc.config,
  boutique_asc.joueurs,
  boutique_asc.stock,
  boutique_asc.inventaires,
  boutique_asc.preinscriptions,
  boutique_asc.commandes;
