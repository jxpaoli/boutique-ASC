# Projets européens – EPCI de Corse – Ports HC

Application de pilotage des projets européens (EASY2LOG, JASON, BLUE HUB…) : échéances, actions, livrables, finances par période.

> En cours de construction. Remplace l'ancienne Boutique AS Casinca (supprimée le 25/09/2026).

## Rôles
- `admin` : tout voir, tout créer, tout modifier.
- `lecteur` : tableau de bord seul, en lecture, sur tous les projets.

Les droits sont appliqués dans la base (RLS), pas seulement dans l'interface.

## Architecture
- React + Vite (PWA), déployé par GitHub Actions sur un Worker Cloudflare.
- Supabase multiprojet (`lrittnexagnqcnnxbzrx`), schéma isolé `gestion_projets`.
- Gestion des comptes : Edge Function `supabase/functions/manage-gestion-user` (clé `service_role` uniquement côté fonction).
- Documents : OneDrive professionnel de l'EPCI de Corse, `Projets européens\<projet>\`. L'appli ne stocke que des liens.

## Développement

```bash
npm install
npm run dev
```

Variables publiques dans `.env` (voir `.env.example`). Aucune clé secrète dans l'appli web.
