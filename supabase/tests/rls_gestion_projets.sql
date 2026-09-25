-- Test des droits RLS de gestion_projets.
-- Tout s'exécute dans une seule transaction, annulée volontairement à la fin (raise exception) :
-- rien ne reste en base. Le résultat est dans le message d'erreur final « RESULTATS ».

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000a001', 'test-admin@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a002', 'test-lecteur@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a003', 'test-inconnu@test.invalid', 'authenticated', 'authenticated');
insert into gestion_projets.roles_appli (user_id, email, role) values
  ('00000000-0000-0000-0000-00000000a001', 'test-admin@test.invalid', 'admin'),
  ('00000000-0000-0000-0000-00000000a002', 'test-lecteur@test.invalid', 'lecteur');

create function pg_temp.note(t text, ok boolean) returns void language sql as $$
  select set_config('test.res', coalesce(current_setting('test.res', true), '') || E'\n' || case when ok then 'OK    ' else 'ECHEC ' end || t, true);
$$;
create function pg_temp.en_tant_que(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', uid)::text, true);
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

set local role authenticated;

-- ADMIN
select pg_temp.en_tant_que('00000000-0000-0000-0000-00000000a001');
insert into gestion_projets.projets (acronyme) values ('TEST-RLS');
insert into gestion_projets.actions (projet_id, libelle)
  select id, 'Action test' from gestion_projets.projets where acronyme = 'TEST-RLS';
select pg_temp.note('admin crée un projet et une action', (select count(*) = 1 from gestion_projets.actions where libelle = 'Action test'));
update gestion_projets.actions set statut = 'fait' where libelle = 'Action test';
select pg_temp.note('admin coche une action faite', (select statut = 'fait' from gestion_projets.actions where libelle = 'Action test'));
select pg_temp.note('admin lit le journal', (select count(*) >= 3 from gestion_projets.journal where table_nom in ('projets', 'actions')));
select pg_temp.note('admin voit tous les rôles', (select count(*) >= 2 from gestion_projets.roles_appli));

-- LECTEUR
select pg_temp.en_tant_que('00000000-0000-0000-0000-00000000a002');
select pg_temp.note('lecteur voit le projet', (select count(*) = 1 from gestion_projets.projets where acronyme = 'TEST-RLS'));
select pg_temp.note('lecteur voit l''action', (select count(*) = 1 from gestion_projets.actions where libelle = 'Action test'));
do $$ begin
  insert into gestion_projets.projets (acronyme) values ('PIRATE');
  perform pg_temp.note('lecteur ne peut pas créer', false);
exception when others then perform pg_temp.note('lecteur ne peut pas créer', true);
end $$;
with m as (update gestion_projets.actions set statut = 'abandonne' where libelle = 'Action test' returning 1)
select pg_temp.note('lecteur ne peut pas modifier', (select count(*) = 0 from m));
with m as (delete from gestion_projets.projets where acronyme = 'TEST-RLS' returning 1)
select pg_temp.note('lecteur ne peut pas supprimer', (select count(*) = 0 from m));
do $$ begin
  update gestion_projets.roles_appli set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000a002';
  perform pg_temp.note('lecteur ne peut pas se promouvoir admin', false);
exception when others then perform pg_temp.note('lecteur ne peut pas se promouvoir admin', true);
end $$;
select pg_temp.note('lecteur ne lit pas le journal', (select count(*) = 0 from gestion_projets.journal));
select pg_temp.note('lecteur ne voit que son rôle', (select count(*) = 1 from gestion_projets.roles_appli));

-- COMPTE INCONNU (existe dans la base partagée, absent de roles_appli)
select pg_temp.en_tant_que('00000000-0000-0000-0000-00000000a003');
select pg_temp.note('inconnu ne voit aucun projet', (select count(*) = 0 from gestion_projets.projets));
select pg_temp.note('inconnu ne voit aucune action', (select count(*) = 0 from gestion_projets.actions));
do $$ begin
  insert into gestion_projets.projets (acronyme) values ('PIRATE2');
  perform pg_temp.note('inconnu ne peut pas créer', false);
exception when others then perform pg_temp.note('inconnu ne peut pas créer', true);
end $$;

-- ANONYME (sans connexion)
reset role;
set local role anon;
do $$ begin
  perform 1 from gestion_projets.projets;
  perform pg_temp.note('anonyme n''a aucun accès', false);
exception when others then perform pg_temp.note('anonyme n''a aucun accès', true);
end $$;

reset role;
do $$ begin raise exception 'RESULTATS:%', current_setting('test.res', true); end $$;
