# Boutique AS Casinca

Application mobile de suivi des packs, joueurs, chèques, stock et commandes du club.

Technologies : React, Vite, Supabase et Cloudflare Workers.

## Développement local

```bash
npm install
copy .env.example .env
npm run dev
```

Renseigner dans `.env` l’URL et la clé publique du projet Supabase. Une clé `service_role` ne doit jamais être placée dans l’application web.

## Supabase

- Schéma isolé : `boutique_asc`
- Migration : `supabase/migrations/202607130001_boutique_asc.sql`
- Gestion sécurisée des comptes : `supabase/functions/manage-boutique-user`
- Rôles applicatifs : `admin`, `supervision`, `user`

Le schéma `boutique_asc` doit être ajouté aux schémas exposés par la Data API du projet.

## Déploiement

Un push sur `main` lance GitHub Actions puis déploie le Worker Cloudflare.

Variables GitHub Actions requises :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Secret GitHub Actions requis :

- `CLOUDFLARE_API_TOKEN`
