alter role authenticator
set pgrst.db_schemas = 'public, graphql_public, point_chaud, boutique_asc';

notify pgrst, 'reload config';
