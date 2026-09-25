-- Onglet Réunions (validé par Joseph le 25/09/2026) : fiche pratique (téléphone) et mode séance (PC).
-- - échéances : horaires, lieu, adresse, format, lien visio ;
-- - reunion_infos : logistique (transport, hébergement, repas, contacts, accès) ;
-- - reunion_points : ordre du jour avec les notes de séance de Joseph ;
-- - actions.echeance_id : actions rattachées à une réunion (préparation, décisions prises en séance).
-- Le secrétaire peut compléter une fiche (infos, points) en citant sa source ; seules les notes de séance
-- sont réservées à Joseph.

alter table gestion_projets.echeances
  add column heure_debut time,
  add column heure_fin   time,
  add column lieu_nom    text,
  add column adresse     text,
  add column format      text check (format in ('presentiel', 'hybride', 'distanciel', 'ecrit')),
  add column lien_visio  text;

alter table gestion_projets.actions
  add column echeance_id uuid references gestion_projets.echeances (id) on delete set null;
create index actions_echeance_id_idx on gestion_projets.actions (echeance_id);

create table gestion_projets.reunion_infos (
  id          uuid primary key default gen_random_uuid(),
  echeance_id uuid not null references gestion_projets.echeances (id) on delete cascade,
  categorie   text not null default 'autre' check (categorie in ('transport', 'hebergement', 'repas', 'contact', 'acces', 'autre')),
  titre       text not null,
  detail      text,
  adresse     text,
  telephone   text,
  lien        text,
  quand       text,
  ordre       integer not null default 0,
  source      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index reunion_infos_echeance_idx on gestion_projets.reunion_infos (echeance_id, ordre);

create table gestion_projets.reunion_points (
  id          uuid primary key default gen_random_uuid(),
  echeance_id uuid not null references gestion_projets.echeances (id) on delete cascade,
  ordre       integer not null default 0,
  titre       text not null,
  intervenant text,
  statut      text not null default 'a_venir' check (statut in ('a_venir', 'en_cours', 'traite')),
  notes       text,
  source      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index reunion_points_echeance_idx on gestion_projets.reunion_points (echeance_id, ordre);

create trigger reunion_infos_updated_at before update on gestion_projets.reunion_infos
  for each row execute function gestion_projets_private.maj_updated_at();
create trigger reunion_points_updated_at before update on gestion_projets.reunion_points
  for each row execute function gestion_projets_private.maj_updated_at();

-- Le secrétaire ne touche jamais aux notes de séance ni au statut des points.
create or replace function gestion_projets_private.points_regles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if gestion_projets_private.role_courant() = 'secretaire' then
    if tg_op = 'INSERT' then
      new.notes := null;
      new.statut := 'a_venir';
    elsif new.notes is distinct from old.notes or new.statut is distinct from old.statut then
      raise exception 'Secrétaire : les notes de séance sont réservées à Joseph';
    end if;
    if new.source is null then
      raise exception 'Secrétaire : la source est obligatoire';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function gestion_projets_private.points_regles() from public;
create trigger reunion_points_regles before insert or update on gestion_projets.reunion_points
  for each row execute function gestion_projets_private.points_regles();

create or replace function gestion_projets_private.infos_regles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if gestion_projets_private.role_courant() = 'secretaire' and new.source is null then
    raise exception 'Secrétaire : la source est obligatoire';
  end if;
  return new;
end;
$$;
revoke all on function gestion_projets_private.infos_regles() from public;
create trigger reunion_infos_regles before insert or update on gestion_projets.reunion_infos
  for each row execute function gestion_projets_private.infos_regles();

grant select, insert, update, delete on gestion_projets.reunion_infos, gestion_projets.reunion_points to authenticated;
grant all on gestion_projets.reunion_infos, gestion_projets.reunion_points to service_role;

alter table gestion_projets.reunion_infos  enable row level security;
alter table gestion_projets.reunion_points enable row level security;

create policy reunion_infos_lecture on gestion_projets.reunion_infos for select to authenticated
  using ((select gestion_projets_private.est_membre()));
create policy reunion_infos_ecriture on gestion_projets.reunion_infos for insert to authenticated
  with check ((select gestion_projets_private.est_admin()) or (select gestion_projets_private.est_secretaire()));
create policy reunion_infos_modif on gestion_projets.reunion_infos for update to authenticated
  using ((select gestion_projets_private.est_admin()) or (select gestion_projets_private.est_secretaire()))
  with check ((select gestion_projets_private.est_admin()) or (select gestion_projets_private.est_secretaire()));
create policy reunion_infos_suppr on gestion_projets.reunion_infos for delete to authenticated
  using ((select gestion_projets_private.est_admin()));

create policy reunion_points_lecture on gestion_projets.reunion_points for select to authenticated
  using ((select gestion_projets_private.est_membre()));
create policy reunion_points_ecriture on gestion_projets.reunion_points for insert to authenticated
  with check ((select gestion_projets_private.est_admin()) or (select gestion_projets_private.est_secretaire()));
create policy reunion_points_modif on gestion_projets.reunion_points for update to authenticated
  using ((select gestion_projets_private.est_admin()) or (select gestion_projets_private.est_secretaire()))
  with check ((select gestion_projets_private.est_admin()) or (select gestion_projets_private.est_secretaire()));
create policy reunion_points_suppr on gestion_projets.reunion_points for delete to authenticated
  using ((select gestion_projets_private.est_admin()));

notify pgrst, 'reload schema';
