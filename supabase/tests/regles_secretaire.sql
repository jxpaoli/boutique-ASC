-- Test des règles du secrétaire et de l'historique des actions.
-- Une seule transaction, annulée à la fin (raise exception) : rien ne reste en base.

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000b001', 'test-admin@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b002', 'test-secretaire@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b003', 'test-lecteur@test.invalid', 'authenticated', 'authenticated');
insert into gestion_projets.roles_appli (user_id, email, role) values
  ('00000000-0000-0000-0000-00000000b001', 'test-admin@test.invalid', 'admin'),
  ('00000000-0000-0000-0000-00000000b002', 'test-secretaire@test.invalid', 'secretaire'),
  ('00000000-0000-0000-0000-00000000b003', 'test-lecteur@test.invalid', 'lecteur');

create function pg_temp.note(t text, ok boolean) returns void language sql as $$
  select set_config('test.res', coalesce(current_setting('test.res', true), '') || E'\n' || case when ok then 'OK    ' else 'ECHEC ' end || t, true);
$$;
create function pg_temp.en_tant_que(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', uid)::text, true);
$$;
-- Tente une commande ; OK si elle est refusée.
create function pg_temp.refuse(t text, cmd text) returns void language plpgsql as $$
begin
  execute cmd;
  perform pg_temp.note(t, false);
exception when others then
  perform pg_temp.note(t, true);
end $$;
grant execute on all functions in schema pg_temp to authenticated;

set local role authenticated;

-- ADMIN crée un projet et une action, puis la coche faite.
select pg_temp.en_tant_que('00000000-0000-0000-0000-00000000b001');
insert into gestion_projets.projets (acronyme) values ('TEST-SEC');
insert into gestion_projets.actions (projet_id, libelle, echeance)
  select id, 'Action de Joseph', '2026-10-10' from gestion_projets.projets where acronyme = 'TEST-SEC';
select pg_temp.note('admin : action marquée « saisie par Joseph »',
  (select origine = 'admin' and modifie_par_admin from gestion_projets.actions where libelle = 'Action de Joseph'));
update gestion_projets.actions set statut = 'fait' where libelle = 'Action de Joseph';
select pg_temp.note('admin coche : validateur = admin',
  (select valide_par = 'admin' and valide_le is not null from gestion_projets.actions where libelle = 'Action de Joseph'));
-- La validation de Joseph est datée d'aujourd'hui ; on la recule au 12/10/2026 pour tester la règle des dates.
reset role;
select set_config('request.jwt.claims', '{}', true);
update gestion_projets.actions set valide_le = '2026-10-12 10:00+02' where libelle = 'Action de Joseph';
set local role authenticated;

-- SECRÉTAIRE
select pg_temp.en_tant_que('00000000-0000-0000-0000-00000000b002');
select pg_temp.refuse('secrétaire : création sans mail source refusée',
  $q$insert into gestion_projets.actions (projet_id, libelle) select id, 'Sans source' from gestion_projets.projets where acronyme = 'TEST-SEC'$q$);
insert into gestion_projets.actions (projet_id, libelle, mail_ref, derniere_source, derniere_source_date)
  select id, 'Action du secrétaire', 'MAIL-001', 'Mail de Quilici du 01/10', '2026-10-01 09:00+02' from gestion_projets.projets where acronyme = 'TEST-SEC';
select pg_temp.note('secrétaire crée une action (origine secrétaire)',
  (select origine = 'secretaire' and not modifie_par_admin from gestion_projets.actions where mail_ref = 'MAIL-001'));
select pg_temp.refuse('secrétaire : doublon du même mail refusé',
  $q$insert into gestion_projets.actions (projet_id, libelle, mail_ref, derniere_source, derniere_source_date) select id, 'Doublon', 'MAIL-001', 'Mail', '2026-10-01' from gestion_projets.projets where acronyme = 'TEST-SEC'$q$);
select pg_temp.refuse('secrétaire : modifier le libellé d''une action de Joseph refusé',
  $q$update gestion_projets.actions set libelle = 'Piraté', derniere_source = 'Mail X', derniere_source_date = '2026-10-20' where libelle = 'Action de Joseph'$q$);
select pg_temp.refuse('secrétaire : modifier sans citer de nouveau mail refusé',
  $q$update gestion_projets.actions set statut = 'en_cours' where mail_ref = 'MAIL-001'$q$);
select pg_temp.refuse('secrétaire : rouvrir avec un mail ANTÉRIEUR à la validation refusé',
  $q$update gestion_projets.actions set statut = 'a_faire', derniere_source = 'Vieux mail du 10/10', derniere_source_date = '2026-10-10 08:00+02' where libelle = 'Action de Joseph'$q$);
update gestion_projets.actions set statut = 'a_faire', derniere_source = 'Mail de Quilici du 14/10 : annexe non reçue', derniere_source_date = '2026-10-14 08:00+02'
  where libelle = 'Action de Joseph';
select pg_temp.note('secrétaire rouvre avec un mail POSTÉRIEUR (ticket rouvert, validateur effacé)',
  (select statut = 'a_faire' and valide_par is null from gestion_projets.actions where libelle = 'Action de Joseph'));
update gestion_projets.actions set statut = 'fait', derniere_source = 'Mail du 02/10 : accusé de réception', derniere_source_date = '2026-10-02 11:00+02'
  where mail_ref = 'MAIL-001';
select pg_temp.note('secrétaire coche sur preuve d''un mail : validateur = secrétaire',
  (select valide_par = 'secretaire' and valide_source like 'Mail du 02/10%' from gestion_projets.actions where mail_ref = 'MAIL-001'));
select pg_temp.refuse('secrétaire : abandonner une action refusé',
  $q$update gestion_projets.actions set statut = 'abandonne', derniere_source = 'Mail Y', derniere_source_date = '2026-10-21' where libelle = 'Action de Joseph'$q$);
select pg_temp.refuse('secrétaire : supprimer une action refusé',
  $q$do $d$ begin delete from gestion_projets.actions where mail_ref = 'MAIL-001'; if not found then raise exception 'rien supprimé'; end if; end $d$$q$);
select pg_temp.refuse('secrétaire : modifier les finances refusé',
  $q$insert into gestion_projets.periodes (projet_id, numero) select id, 99 from gestion_projets.projets where acronyme = 'TEST-SEC'$q$);
select pg_temp.refuse('secrétaire : forger le validateur refusé',
  $q$do $d$ begin update gestion_projets.actions set valide_par = 'admin', derniere_source = 'Mail Z', derniere_source_date = '2026-10-22' where mail_ref = 'MAIL-001'; if (select valide_par from gestion_projets.actions where mail_ref = 'MAIL-001') = 'admin' then return; end if; raise exception 'forgé refusé'; end $d$$q$);
insert into gestion_projets.actions_evenements (action_id, type, message)
  select id, 'commentaire', 'Relance faite par téléphone' from gestion_projets.actions where libelle = 'Action de Joseph';
select pg_temp.note('secrétaire commente une action de Joseph (auteur imposé)',
  (select qui_role = 'secretaire' from gestion_projets.actions_evenements where message = 'Relance faite par téléphone'));
insert into gestion_projets.passages_secretaire (mails_lus, actions_creees, actions_faites, actions_rouvertes) values (42, 1, 1, 1);
select pg_temp.note('secrétaire enregistre son passage', (select count(*) = 1 from gestion_projets.passages_secretaire where mails_lus = 42));

-- HISTORIQUE (vu par l'admin)
select pg_temp.en_tant_que('00000000-0000-0000-0000-00000000b001');
select pg_temp.note('historique complet de l''action de Joseph (création, fait, rouverte, commentaire)',
  (select array_agg(type || coalesce(':' || statut_apres, '') || ':' || qui_role order by e.id)
   = array['creation:a_faire:admin', 'statut:fait:admin', 'statut:a_faire:secretaire', 'commentaire:secretaire']
   from gestion_projets.actions_evenements e join gestion_projets.actions a on a.id = e.action_id where a.libelle = 'Action de Joseph'));
update gestion_projets.actions set statut = 'fait' where libelle = 'Action de Joseph';
select pg_temp.note('admin recoche : validateur redevient admin',
  (select valide_par = 'admin' from gestion_projets.actions where libelle = 'Action de Joseph'));

-- LECTEUR
select pg_temp.en_tant_que('00000000-0000-0000-0000-00000000b003');
select pg_temp.note('lecteur voit l''historique', (select count(*) >= 4 from gestion_projets.actions_evenements e join gestion_projets.actions a on a.id = e.action_id where a.libelle = 'Action de Joseph'));
select pg_temp.refuse('lecteur : commentaire refusé',
  $q$insert into gestion_projets.actions_evenements (action_id, type, message) select id, 'commentaire', 'x' from gestion_projets.actions where libelle = 'Action de Joseph'$q$);
select pg_temp.refuse('lecteur : cocher une action refusé',
  $q$do $d$ begin update gestion_projets.actions set statut = 'a_faire' where libelle = 'Action de Joseph'; if not found then raise exception 'rien modifié'; end if; end $d$$q$);

reset role;
do $$ begin raise exception 'RESULTATS:%', current_setting('test.res', true); end $$;
