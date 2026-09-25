-- Expose gestion_projets dans la Data API (ajout seul : les schémas existants restent exposés).
alter role authenticator
set pgrst.db_schemas = 'public, graphql_public, point_chaud, boutique_asc, gestion_projets';

notify pgrst, 'reload config';

-- Premier administrateur de l'appli : désigné le 25/09/2026 par Joseph, inséré directement en base.
-- L'adresse n'est pas écrite ici (dépôt public). Pour recréer :
--   insert into gestion_projets.roles_appli (user_id, email, role)
--   select id, email, 'admin' from auth.users where email = '<adresse admin>'
--   on conflict (user_id) do update set role = 'admin';
