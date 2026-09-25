-- Suppression de la Boutique AS Casinca (décision de Joseph du 25/09/2026 : ni archive ni export).
-- Vérifié avant : aucun objet d'un autre schéma ne dépend de boutique_asc / boutique_asc_private.
-- La liste des schémas exposés garde tout le reste (point_chaud, gestion_projets).

alter role authenticator
set pgrst.db_schemas = 'public, graphql_public, point_chaud, gestion_projets';

drop schema boutique_asc cascade;
drop schema boutique_asc_private cascade;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
