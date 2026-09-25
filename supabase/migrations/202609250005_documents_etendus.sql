-- Index étendu (validé par Joseph le 25/09/2026) :
-- - pieces-jointes de chaque projet : indexées, visibles par l'admin (et le secrétaire) seulement ;
-- - identite de chaque projet et boîte à outils commune (_commun : modèles, logos, kit programme) : visibles par tous.
-- Un document de la boîte à outils n'appartient à aucun projet (projet_id vide).

alter table gestion_projets.documents alter column projet_id drop not null;

insert into gestion_projets.dossiers_lecteurs (dossier) values
  ('identite'), ('commun/modeles'), ('commun/logos'), ('commun/kit-programme')
on conflict (dossier) do nothing;
