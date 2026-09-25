# Projets européens – EPCI de Corse – Ports HC (europa.master.corsica)

Appli de pilotage des projets européens de Joseph X. Paoli (EASY2LOG, JASON, BLUE HUB…) :
agenda, actions façon « ticket », réunions (fiche pratique + mode séance), documents OneDrive,
finances, livrables, rapport pour la direction. Elle a remplacé la Boutique AS Casinca (supprimée
le 25/09/2026 : code, schéma, Edge Function, Worker).

## Règles de sécurité
- Ne jamais afficher une valeur de `.env`, `.env.project.local` ni d'un fichier `jeton*` : noms de
  variables et « rempli / vide » seulement. La clé `service_role` n'est jamais dans l'appli web.
- **Dépôt GitHub public** : aucune adresse mail, adresse OneDrive ni clé dans le code ou les
  migrations (les valeurs propres à Joseph sont en base : `gestion_projets.parametres`, `roles_appli`).
- **Base Supabase partagée** (`lrittnexagnqcnnxbzrx`, eu-west-2) avec d'autres applis (point_chaud,
  bastia-escales…) : ne toucher qu'au schéma `gestion_projets` (+ `gestion_projets_private`).
  Toute modification de la base, de la liste des schémas exposés ou des comptes Auth demande
  l'accord explicite de Joseph. Ne pas confondre avec la base dédiée de `Projects\easy2log`.
- Cloudflare (compte partagé) : ne toucher qu'au Worker `gestion-projets-europeens`.

## Architecture
- React + Vite (PWA), `src/`. Téléphone : Agenda / Actions / Réunions / Docs / Plus.
  PC (≥ 1024 px) : cockpit à anneaux, mode séance des réunions.
- Supabase, schéma `gestion_projets` : migrations dans `supabase/migrations/` (appliquées par
  `scripts/sql.ps1`), tests RLS dans `supabase/tests/` (transaction annulée, résultats dans
  l'erreur finale « RESULTATS »).
- Rôles (`roles_appli`) : `admin` (Joseph), `lecteur` (direction, CDINNOV), `secretaire` (session
  Claude `secretaire-mails`, règles appliquées par triggers : sources mail, pas de doublon,
  jamais modifier une action de Joseph, réouverture seulement sur mail plus récent).
- Dépôt : `github.com/jxpaoli/gestion-projets-europeens` (ex `boutique-ASC`, renommé le 25/09/2026) ;
  dossier local `C:\Users\jxpao\Claude\Projects\gestion-projets-europeens`.
- Déploiement : push sur `main` → GitHub Actions → Worker Cloudflare `gestion-projets-europeens`
  (europa.master.corsica). Vérifier que le run est `success` après chaque push.
- Documents : restent sur OneDrive pro (`OneDrive - EPCI DE CORSE\Projets européens\`) ; l'appli
  n'indexe que les noms (`scripts/indexer-documents.ps1`). Pièces jointes : admin seul.
- Environnement projet (mémoires .md, data/ CSV) : même dossier OneDrive, relié par liens.

## Scripts (PowerShell 5.1 : enregistrer en UTF-8 **avec BOM**)
- `scripts/sql.ps1 -File x.sql | -Query "…" [-ReadOnly]` : SQL via l'API Management (jeton admin).
- `scripts/indexer-documents.ps1` : réindexe les documents OneDrive.
- `scripts/exporter-csv.ps1` : exporte actions / échéances / livrables / finances vers `<projet>\data\`.
- `scripts/charger-projet.ps1` : charge un projet depuis un JSON extrait des mémoires.
- `scripts/secretaire.ps1` : outils du secrétaire (son compte, jamais le jeton admin).

## Conventions
Interface en français ; dates JJ/MM/AAAA ; montants 1 234,56 € ; « EPCI de Corse » (jamais
EPCIC ni CCIC hors citation). Mobile d'abord pour la consultation, PC pour la séance et la saisie.

## Reste à faire (au 25/09/2026)
- Étapes de déclaration CDINNOV par période (table `etapes_periode` prête, écran de saisie à faire).
- Écran de gestion des lecteurs + déploiement de l'Edge Function `manage-gestion-user`
  (secret `ALLOWED_ORIGINS=https://europa.master.corsica`).
- Données manquantes : budgets, dates des projets, montants par période.
- Chantier séparé : désactiver les anciennes clés JWT Supabase après bascule des Edge Functions
  sur la nouvelle clé secrète (le « JWT secret » a été affiché par erreur le 25/09/2026).
