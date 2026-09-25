-- Projets européens – EPCI de Corse – Ports HC
-- Schéma isolé gestion_projets dans la base Supabase partagée (multi-applis).
-- Ne crée rien hors des schémas gestion_projets et gestion_projets_private.
-- Droits : un compte absent de roles_appli ne voit rien ; lecteur = lecture seule ; admin = tout.

create schema gestion_projets;
create schema gestion_projets_private;
revoke all on schema gestion_projets from public;
revoke all on schema gestion_projets_private from public;

-- ---------------------------------------------------------------------------
-- Rôles de l'appli (écrits uniquement par l'Edge Function manage-gestion-user)
-- ---------------------------------------------------------------------------
create table gestion_projets.roles_appli (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  role       text not null check (role in ('admin', 'lecteur')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function gestion_projets_private.role_courant()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from gestion_projets.roles_appli where user_id = auth.uid()
$$;

create or replace function gestion_projets_private.est_membre()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(gestion_projets_private.role_courant() in ('admin', 'lecteur'), false)
$$;

create or replace function gestion_projets_private.est_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(gestion_projets_private.role_courant() = 'admin', false)
$$;

revoke all on function gestion_projets_private.role_courant() from public;
revoke all on function gestion_projets_private.est_membre() from public;
revoke all on function gestion_projets_private.est_admin() from public;
grant usage on schema gestion_projets_private to authenticated;
grant execute on function gestion_projets_private.est_membre() to authenticated;
grant execute on function gestion_projets_private.est_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Données métier
-- ---------------------------------------------------------------------------
create table gestion_projets.projets (
  id               uuid primary key default gen_random_uuid(),
  acronyme         text not null unique,
  titre            text,
  programme        text,
  id_jems          text,
  appel            text,
  chef_de_file     text,
  n_partenaire     text,
  date_debut       date,
  date_fin         date,
  budget_projet    numeric(14, 2),
  feder_projet     numeric(14, 2),
  budget_epci      numeric(14, 2),
  couleur          text,
  dossier_onedrive text,
  actif            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table gestion_projets.actions (
  id          uuid primary key default gen_random_uuid(),
  projet_id   uuid not null references gestion_projets.projets (id) on delete cascade,
  libelle     text not null,
  responsable text,
  echeance    date,
  statut      text not null default 'a_faire' check (statut in ('a_faire', 'en_cours', 'fait', 'abandonne')),
  priorite    text not null default 'normale' check (priorite in ('haute', 'normale', 'basse')),
  source      text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table gestion_projets.echeances (
  id         uuid primary key default gen_random_uuid(),
  projet_id  uuid not null references gestion_projets.projets (id) on delete cascade,
  type       text not null default 'autre' check (type in ('cdp', 'rapport', 'livrable', 'evenement', 'autre')),
  libelle    text not null,
  date       date not null,
  lieu       text,
  statut     text not null default 'prevu' check (statut in ('prevu', 'fait', 'annule')),
  lien       text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table gestion_projets.livrables (
  id          uuid primary key default gen_random_uuid(),
  projet_id   uuid not null references gestion_projets.projets (id) on delete cascade,
  code        text,
  titre       text not null,
  responsable text,
  echeance    date,
  statut      text not null default 'a_faire' check (statut in ('a_faire', 'en_cours', 'envoye', 'approuve')),
  lien        text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table gestion_projets.periodes (
  id           uuid primary key default gen_random_uuid(),
  projet_id    uuid not null references gestion_projets.projets (id) on delete cascade,
  numero       integer not null,
  date_debut   date,
  date_fin     date,
  prevu        numeric(14, 2),
  declare      numeric(14, 2),
  certifie     numeric(14, 2),
  paye         numeric(14, 2),
  observations text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (projet_id, numero)
);

create index actions_projet_idx on gestion_projets.actions (projet_id);
create index actions_echeance_idx on gestion_projets.actions (echeance);
create index echeances_projet_idx on gestion_projets.echeances (projet_id);
create index echeances_date_idx on gestion_projets.echeances (date);
create index livrables_projet_idx on gestion_projets.livrables (projet_id);
create index livrables_echeance_idx on gestion_projets.livrables (echeance);
create index periodes_projet_idx on gestion_projets.periodes (projet_id);

-- ---------------------------------------------------------------------------
-- Journal des modifications (rempli par trigger, lisible par l'admin seul)
-- ---------------------------------------------------------------------------
create table gestion_projets.journal (
  id        bigint generated always as identity primary key,
  quand     timestamptz not null default now(),
  qui       uuid,
  qui_email text,
  table_nom text not null,
  operation text not null,
  ligne_id  uuid,
  avant     jsonb,
  apres     jsonb
);
create index journal_quand_idx on gestion_projets.journal (quand desc);

create or replace function gestion_projets_private.journaliser()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_avant jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_apres jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  insert into gestion_projets.journal (qui, qui_email, table_nom, operation, ligne_id, avant, apres)
  values (
    auth.uid(),
    auth.jwt() ->> 'email',
    tg_table_name,
    tg_op,
    coalesce((v_apres ->> 'id')::uuid, (v_avant ->> 'id')::uuid, (v_apres ->> 'user_id')::uuid, (v_avant ->> 'user_id')::uuid),
    v_avant,
    v_apres
  );
  return coalesce(new, old);
end;
$$;
revoke all on function gestion_projets_private.journaliser() from public;

create or replace function gestion_projets_private.maj_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function gestion_projets_private.maj_updated_at() from public;

do $$
declare
  t text;
begin
  foreach t in array array['roles_appli', 'projets', 'actions', 'echeances', 'livrables', 'periodes'] loop
    execute format('create trigger %I_updated_at before update on gestion_projets.%I for each row execute function gestion_projets_private.maj_updated_at()', t, t);
    execute format('create trigger %I_journal after insert or update or delete on gestion_projets.%I for each row execute function gestion_projets_private.journaliser()', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Droits et RLS
-- ---------------------------------------------------------------------------
grant usage on schema gestion_projets to authenticated, service_role;

grant select on gestion_projets.roles_appli to authenticated;
grant select on gestion_projets.journal to authenticated;
grant select, insert, update, delete on
  gestion_projets.projets,
  gestion_projets.actions,
  gestion_projets.echeances,
  gestion_projets.livrables,
  gestion_projets.periodes
to authenticated;
grant all on all tables in schema gestion_projets to service_role;
grant usage, select on all sequences in schema gestion_projets to service_role;

alter table gestion_projets.roles_appli enable row level security;
alter table gestion_projets.projets     enable row level security;
alter table gestion_projets.actions     enable row level security;
alter table gestion_projets.echeances   enable row level security;
alter table gestion_projets.livrables   enable row level security;
alter table gestion_projets.periodes    enable row level security;
alter table gestion_projets.journal     enable row level security;

-- Chacun voit sa propre ligne de rôle ; l'admin voit toutes les lignes.
create policy roles_lecture on gestion_projets.roles_appli for select to authenticated
  using (user_id = (select auth.uid()) or (select gestion_projets_private.est_admin()));

create policy journal_lecture_admin on gestion_projets.journal for select to authenticated
  using ((select gestion_projets_private.est_admin()));

do $$
declare
  t text;
begin
  foreach t in array array['projets', 'actions', 'echeances', 'livrables', 'periodes'] loop
    execute format('create policy %I_lecture on gestion_projets.%I for select to authenticated using ((select gestion_projets_private.est_membre()))', t, t);
    execute format('create policy %I_ajout on gestion_projets.%I for insert to authenticated with check ((select gestion_projets_private.est_admin()))', t, t);
    execute format('create policy %I_modif on gestion_projets.%I for update to authenticated using ((select gestion_projets_private.est_admin())) with check ((select gestion_projets_private.est_admin()))', t, t);
    execute format('create policy %I_suppr on gestion_projets.%I for delete to authenticated using ((select gestion_projets_private.est_admin()))', t, t);
  end loop;
end;
$$;
