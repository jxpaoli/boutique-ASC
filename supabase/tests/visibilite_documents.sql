-- Visibilité des documents : un lecteur ne voit ni les pièces jointes ni les dossiers non partagés.
-- Transaction annulée à la fin (raise exception) : rien ne reste en base.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000c001', 'test-lecteur@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c002', 'test-admin@test.invalid', 'authenticated', 'authenticated');
insert into gestion_projets.roles_appli (user_id, email, role) values
  ('00000000-0000-0000-0000-00000000c001', 'test-lecteur@test.invalid', 'lecteur'),
  ('00000000-0000-0000-0000-00000000c002', 'test-admin@test.invalid', 'admin');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}', true);
select set_config('test.admin_total', (select count(*)::text from gestion_projets.documents), true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);
select set_config('test.res', format(E'admin voit %s documents\nlecteur voit %s documents\nlecteur voit des pieces-jointes : %s\nlecteur voit hors liste : %s\nlecteur voit la boite a outils : %s',
  current_setting('test.admin_total'),
  (select count(*) from gestion_projets.documents),
  (select count(*) from gestion_projets.documents where dossier = 'pieces-jointes'),
  (select count(*) from gestion_projets.documents where dossier not in ('03-gouvernance', '04-livrables', 'identite') and dossier not like 'commun/%'),
  (select count(*) from gestion_projets.documents where dossier like 'commun/%')), true);
reset role;
do $$ begin raise exception 'RESULTATS:%', current_setting('test.res', true); end $$;
