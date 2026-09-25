-- Projets européens – règles du secrétaire (session Claude qui scanne les mails), historique
-- des actions façon « ticket », validateur, journal des scans, étapes de déclaration par période.
-- Ne touche que les schémas gestion_projets et gestion_projets_private.
--
-- Règles (validées par Joseph le 25/09/2026) :
-- 1. Chaque action a un fil d'historique : qui, quand, source (mail ou saisie).
-- 2. Le validateur d'une action faite est toujours connu (admin ou secretaire).
-- 3. Le secrétaire peut cocher « fait » sur preuve d'un mail.
-- 4. Il ne peut rouvrir une action faite qu'avec un mail plus récent que la validation.
-- 5. Il ne modifie jamais libellé, échéance, responsable, priorité, notes ou projet
--    d'une action que Joseph a saisie ou modifiée ; il peut commenter.
-- 6. Pas de doublon : la référence du mail (mail_ref) est unique.
-- 7. Chaque scan est enregistré (passages_secretaire).

-- ---------------------------------------------------------------------------
-- Rôle secretaire
-- ---------------------------------------------------------------------------
alter table gestion_projets.roles_appli drop constraint roles_appli_role_check;
alter table gestion_projets.roles_appli add constraint roles_appli_role_check
  check (role in ('admin', 'lecteur', 'secretaire'));

create or replace function gestion_projets_private.est_membre()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(gestion_projets_private.role_courant() in ('admin', 'lecteur', 'secretaire'), false)
$$;

create or replace function gestion_projets_private.est_secretaire()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(gestion_projets_private.role_courant() = 'secretaire', false)
$$;
revoke all on function gestion_projets_private.est_secretaire() from public;
grant execute on function gestion_projets_private.est_secretaire() to authenticated;

-- ---------------------------------------------------------------------------
-- Actions : origine, validateur, source de la dernière modification, référence mail
-- ---------------------------------------------------------------------------
alter table gestion_projets.actions
  add column origine text not null default 'import' check (origine in ('admin', 'secretaire', 'import')),
  add column modifie_par_admin boolean not null default false,
  add column valide_par text check (valide_par in ('admin', 'secretaire')),
  add column valide_le timestamptz,
  add column valide_source text,
  add column derniere_source text,
  add column derniere_source_date timestamptz,
  add column mail_ref text;

create unique index actions_mail_ref_unique on gestion_projets.actions (mail_ref) where mail_ref is not null;

-- ---------------------------------------------------------------------------
-- Fil d'historique des actions
-- ---------------------------------------------------------------------------
create table gestion_projets.actions_evenements (
  id           bigint generated always as identity primary key,
  action_id    uuid not null references gestion_projets.actions (id) on delete cascade,
  quand        timestamptz not null default now(),
  qui          uuid,
  qui_email    text,
  qui_role     text,
  type         text not null check (type in ('creation', 'statut', 'modification', 'commentaire')),
  statut_avant text,
  statut_apres text,
  source       text,
  date_source  timestamptz,
  message      text
);
create index actions_evenements_action_idx on gestion_projets.actions_evenements (action_id, quand);

-- Règles d'écriture sur les actions, appliquées par la base quel que soit le client.
create or replace function gestion_projets_private.actions_regles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := gestion_projets_private.role_courant();
begin
  if v_role = 'admin' then
    new.derniere_source := 'saisie';
    new.derniere_source_date := now();
    new.modifie_par_admin := true;
    if tg_op = 'INSERT' then
      new.origine := 'admin';
    end if;
  elsif v_role = 'secretaire' then
    if new.derniere_source is null or new.derniere_source_date is null then
      raise exception 'Secrétaire : la source (mail) et sa date sont obligatoires';
    end if;
    if tg_op = 'INSERT' then
      new.origine := 'secretaire';
      new.modifie_par_admin := false;
      if new.mail_ref is null then
        raise exception 'Secrétaire : la référence du mail (mail_ref) est obligatoire pour créer une action';
      end if;
      if new.statut = 'abandonne' then
        raise exception 'Secrétaire : une action ne peut pas être créée abandonnée';
      end if;
    else
      if (new.derniere_source, new.derniere_source_date) is not distinct from (old.derniere_source, old.derniere_source_date) then
        raise exception 'Secrétaire : chaque modification doit citer son mail source';
      end if;
      new.origine := old.origine;
      new.modifie_par_admin := old.modifie_par_admin;
      new.mail_ref := old.mail_ref;
      if new.projet_id is distinct from old.projet_id then
        raise exception 'Secrétaire : changement de projet interdit';
      end if;
      if old.modifie_par_admin and (
           new.libelle is distinct from old.libelle or new.echeance is distinct from old.echeance
        or new.responsable is distinct from old.responsable or new.priorite is distinct from old.priorite
        or new.notes is distinct from old.notes or new.source is distinct from old.source) then
        raise exception 'Secrétaire : action saisie ou modifiée par Joseph, seul un commentaire est possible';
      end if;
      if new.statut = 'abandonne' and old.statut <> 'abandonne' then
        raise exception 'Secrétaire : seul Joseph peut abandonner une action';
      end if;
      if old.statut = 'fait' and new.statut <> 'fait' and new.derniere_source_date <= old.valide_le then
        raise exception 'Secrétaire : mail antérieur à la validation du %, l''action n''est pas rouverte', to_char(old.valide_le, 'DD/MM/YYYY');
      end if;
    end if;
  end if;

  -- Validateur : recalculé à chaque passage à « fait », effacé si l'action est rouverte.
  if new.statut = 'fait' and (tg_op = 'INSERT' or old.statut <> 'fait') then
    new.valide_par := case when v_role in ('admin', 'secretaire') then v_role else new.valide_par end;
    new.valide_le := case when v_role = 'secretaire' then new.derniere_source_date else now() end;
    new.valide_source := new.derniere_source;
  elsif new.statut <> 'fait' then
    new.valide_par := null;
    new.valide_le := null;
    new.valide_source := null;
  elsif v_role in ('admin', 'secretaire') then
    new.valide_par := old.valide_par;
    new.valide_le := old.valide_le;
    new.valide_source := old.valide_source;
  end if;
  return new;
end;
$$;
revoke all on function gestion_projets_private.actions_regles() from public;

create or replace function gestion_projets_private.actions_historique()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(gestion_projets_private.role_courant(), 'systeme');
  v_champs text[] := array[]::text[];
begin
  if tg_op = 'INSERT' then
    insert into gestion_projets.actions_evenements (action_id, qui, qui_email, qui_role, type, statut_apres, source, date_source)
    values (new.id, auth.uid(), auth.jwt() ->> 'email', v_role, 'creation', new.statut, new.derniere_source, new.derniere_source_date);
    return new;
  end if;

  if new.statut is distinct from old.statut then
    insert into gestion_projets.actions_evenements (action_id, qui, qui_email, qui_role, type, statut_avant, statut_apres, source, date_source)
    values (new.id, auth.uid(), auth.jwt() ->> 'email', v_role, 'statut', old.statut, new.statut, new.derniere_source, new.derniere_source_date);
  end if;

  if new.libelle is distinct from old.libelle then v_champs := v_champs || 'libellé'; end if;
  if new.echeance is distinct from old.echeance then v_champs := v_champs || 'échéance'; end if;
  if new.responsable is distinct from old.responsable then v_champs := v_champs || 'responsable'; end if;
  if new.priorite is distinct from old.priorite then v_champs := v_champs || 'priorité'; end if;
  if new.notes is distinct from old.notes then v_champs := v_champs || 'notes'; end if;
  if new.projet_id is distinct from old.projet_id then v_champs := v_champs || 'projet'; end if;
  if cardinality(v_champs) > 0 then
    insert into gestion_projets.actions_evenements (action_id, qui, qui_email, qui_role, type, source, date_source, message)
    values (new.id, auth.uid(), auth.jwt() ->> 'email', v_role, 'modification', new.derniere_source, new.derniere_source_date,
            'Modifié : ' || array_to_string(v_champs, ', '));
  end if;
  return new;
end;
$$;
revoke all on function gestion_projets_private.actions_historique() from public;

create trigger actions_regles before insert or update on gestion_projets.actions
  for each row execute function gestion_projets_private.actions_regles();
create trigger actions_historique after insert or update on gestion_projets.actions
  for each row execute function gestion_projets_private.actions_historique();

-- Commentaires saisis à la main : l'auteur est imposé par la base.
create or replace function gestion_projets_private.evenement_auteur()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := gestion_projets_private.role_courant();
begin
  if v_role is not null then
    new.qui := auth.uid();
    new.qui_email := auth.jwt() ->> 'email';
    new.qui_role := v_role;
    new.quand := now();
  end if;
  return new;
end;
$$;
revoke all on function gestion_projets_private.evenement_auteur() from public;
create trigger actions_evenements_auteur before insert on gestion_projets.actions_evenements
  for each row execute function gestion_projets_private.evenement_auteur();

-- Historique des actions déjà chargées : une ligne « création » (import depuis les mémoires).
insert into gestion_projets.actions_evenements (action_id, quand, qui_role, type, statut_apres, source, message)
select id, created_at, 'systeme', 'creation', statut, source, 'Chargée depuis la mémoire du projet'
from gestion_projets.actions;

-- ---------------------------------------------------------------------------
-- Journal des scans du secrétaire
-- ---------------------------------------------------------------------------
create table gestion_projets.passages_secretaire (
  id                bigint generated always as identity primary key,
  debut             timestamptz not null default now(),
  fin               timestamptz,
  qui               uuid default auth.uid(),
  mails_lus         integer,
  periode_du        date,
  periode_au        date,
  actions_creees    integer not null default 0,
  actions_faites    integer not null default 0,
  actions_rouvertes integer not null default 0,
  commentaires      integer not null default 0,
  notes             text
);

-- ---------------------------------------------------------------------------
-- Étapes de déclaration par période (suivi du travail de CDINNOV)
-- ---------------------------------------------------------------------------
create table gestion_projets.etapes_periode (
  id          uuid primary key default gen_random_uuid(),
  periode_id  uuid not null references gestion_projets.periodes (id) on delete cascade,
  etape       text not null check (etape in ('declaration', 'controle', 'rapport_cf', 'paiement')),
  responsable text,
  date_limite date,
  fait_le     date,
  montant     numeric(14, 2),
  lien        text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (periode_id, etape)
);
create index etapes_periode_limite_idx on gestion_projets.etapes_periode (date_limite);

create trigger etapes_periode_updated_at before update on gestion_projets.etapes_periode
  for each row execute function gestion_projets_private.maj_updated_at();
create trigger etapes_periode_journal after insert or update or delete on gestion_projets.etapes_periode
  for each row execute function gestion_projets_private.journaliser();

-- ---------------------------------------------------------------------------
-- Droits et RLS
-- ---------------------------------------------------------------------------
grant select, insert on gestion_projets.actions_evenements to authenticated;
grant select, insert, update on gestion_projets.passages_secretaire to authenticated;
grant select, insert, update, delete on gestion_projets.etapes_periode to authenticated;
grant all on gestion_projets.actions_evenements, gestion_projets.passages_secretaire, gestion_projets.etapes_periode to service_role;
grant usage, select on all sequences in schema gestion_projets to service_role;

alter table gestion_projets.actions_evenements  enable row level security;
alter table gestion_projets.passages_secretaire enable row level security;
alter table gestion_projets.etapes_periode      enable row level security;

-- Actions : le secrétaire crée et modifie (les règles fines sont dans le trigger), seul l'admin supprime.
drop policy actions_ajout on gestion_projets.actions;
drop policy actions_modif on gestion_projets.actions;
create policy actions_ajout on gestion_projets.actions for insert to authenticated
  with check ((select gestion_projets_private.est_admin()) or (select gestion_projets_private.est_secretaire()));
create policy actions_modif on gestion_projets.actions for update to authenticated
  using ((select gestion_projets_private.est_admin()) or (select gestion_projets_private.est_secretaire()))
  with check ((select gestion_projets_private.est_admin()) or (select gestion_projets_private.est_secretaire()));

create policy evenements_lecture on gestion_projets.actions_evenements for select to authenticated
  using ((select gestion_projets_private.est_membre()));
create policy evenements_commentaire on gestion_projets.actions_evenements for insert to authenticated
  with check (type = 'commentaire'
    and ((select gestion_projets_private.est_admin()) or (select gestion_projets_private.est_secretaire())));

create policy passages_lecture on gestion_projets.passages_secretaire for select to authenticated
  using ((select gestion_projets_private.est_membre()));
create policy passages_ajout on gestion_projets.passages_secretaire for insert to authenticated
  with check ((select gestion_projets_private.est_secretaire()) or (select gestion_projets_private.est_admin()));
create policy passages_modif on gestion_projets.passages_secretaire for update to authenticated
  using (qui = (select auth.uid()) or (select gestion_projets_private.est_admin()))
  with check (qui = (select auth.uid()) or (select gestion_projets_private.est_admin()));

create policy etapes_periode_lecture on gestion_projets.etapes_periode for select to authenticated
  using ((select gestion_projets_private.est_membre()));
create policy etapes_periode_ajout on gestion_projets.etapes_periode for insert to authenticated
  with check ((select gestion_projets_private.est_admin()));
create policy etapes_periode_modif on gestion_projets.etapes_periode for update to authenticated
  using ((select gestion_projets_private.est_admin())) with check ((select gestion_projets_private.est_admin()));
create policy etapes_periode_suppr on gestion_projets.etapes_periode for delete to authenticated
  using ((select gestion_projets_private.est_admin()));

notify pgrst, 'reload schema';
