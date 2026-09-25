-- Index des documents OneDrive des projets (noms, dossiers, dates ; jamais le contenu).
-- Les fichiers restent sur OneDrive : l'appli ne fait que des liens, les droits OneDrive s'appliquent.
-- Visibilité (option b validée par Joseph le 25/09/2026) : admin et secrétaire voient tout ;
-- un lecteur ne voit que les dossiers listés dans dossiers_lecteurs.
-- L'adresse de base OneDrive est stockée dans parametres (hors dépôt public).

alter table gestion_projets.projets add column dossier text;

create table gestion_projets.parametres (
  cle        text primary key,
  valeur     text,
  updated_at timestamptz not null default now()
);

create table gestion_projets.dossiers_lecteurs (
  dossier text primary key
);
insert into gestion_projets.dossiers_lecteurs (dossier) values ('03-gouvernance'), ('04-livrables');

create table gestion_projets.documents (
  id          uuid primary key default gen_random_uuid(),
  projet_id   uuid not null references gestion_projets.projets (id) on delete cascade,
  dossier     text not null,
  chemin      text not null unique,
  nom         text not null,
  extension   text,
  taille      bigint,
  modifie_le  timestamptz,
  present     boolean not null default true,
  indexe_le   timestamptz not null default now()
);
create index documents_projet_idx on gestion_projets.documents (projet_id, dossier);
create index documents_nom_idx on gestion_projets.documents (lower(nom));

grant select on gestion_projets.parametres, gestion_projets.dossiers_lecteurs, gestion_projets.documents to authenticated;
grant insert, update, delete on gestion_projets.parametres, gestion_projets.dossiers_lecteurs, gestion_projets.documents to authenticated;
grant all on gestion_projets.parametres, gestion_projets.dossiers_lecteurs, gestion_projets.documents to service_role;

alter table gestion_projets.parametres        enable row level security;
alter table gestion_projets.dossiers_lecteurs enable row level security;
alter table gestion_projets.documents         enable row level security;

create policy parametres_lecture on gestion_projets.parametres for select to authenticated
  using ((select gestion_projets_private.est_membre()));
create policy parametres_admin on gestion_projets.parametres for all to authenticated
  using ((select gestion_projets_private.est_admin())) with check ((select gestion_projets_private.est_admin()));

create policy dossiers_lecteurs_lecture on gestion_projets.dossiers_lecteurs for select to authenticated
  using ((select gestion_projets_private.est_membre()));
create policy dossiers_lecteurs_admin on gestion_projets.dossiers_lecteurs for all to authenticated
  using ((select gestion_projets_private.est_admin())) with check ((select gestion_projets_private.est_admin()));

create policy documents_lecture on gestion_projets.documents for select to authenticated
  using (
    (select gestion_projets_private.est_admin())
    or (select gestion_projets_private.est_secretaire())
    or ((select gestion_projets_private.est_membre())
        and dossier in (select d.dossier from gestion_projets.dossiers_lecteurs d))
  );
create policy documents_admin on gestion_projets.documents for all to authenticated
  using ((select gestion_projets_private.est_admin())) with check ((select gestion_projets_private.est_admin()));

notify pgrst, 'reload schema';
