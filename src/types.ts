// Modèle de données — Boutique AS Casinca

export type Licence = "" | "NOUVEAU" | "RENOUV." | "LICENCE";

// Remise d'un article : remis ou différé (le reste — à commander / récupérer — se gère dans le Stock)
export type ArticleStatut = "remis" | "differe";

export type Role = "admin" | "supervision" | "user";

export interface PackArticle {
  article: string;
  taille: string;
  statut: ArticleStatut;
  motif?: string;
}

export interface Cheque {
  montant?: number;
  dateRecup?: string; // date de récupération (chèque en main)
  datePrev: string;   // date d'encaissement prévu
  recup: boolean;
  enc: boolean;
}

export interface Joueur {
  id: string;
  categorie: string;
  gardien: boolean;
  licence: Licence;
  nom: string;
  prenom: string;
  annee: string;
  tel: string;
  articles: PackArticle[];
  remises: string[];
  reglement: string;
  cheques: Cheque[];
  regOk: boolean;
  regDate: string;
  commentaires: string;
  supprDemandee?: boolean; // suppression demandée (à valider par un superviseur)
  supprPar?: string;
  supprLe?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface Remise { nom: string; montant: number; }
export interface CatalogueItem { nom: string; tailles: string[]; gererStock?: boolean }

export interface Config {
  saison: string;
  tarifs: Record<string, number>; // NOUVEAU / RENOUV. / LICENCE
  sacSiNouvelle: boolean;
  remises: Remise[];
  categories: string[];
  reglements: string[];
  catalogue: CatalogueItem[];
  packs: Record<string, string[]>;
  packsGardien: Record<string, string[]>;
}

// Pré-inscription déposée par la personne via le QR (formulaire public)
export interface Preinscription {
  id: string;
  nom: string;
  prenom: string;
  annee: string; // date de naissance (ISO)
  tel: string;
  gardien: boolean;
  categorie: string;
  articles: { article: string; taille: string }[];
  createdAt?: number;
}

// Commandes fournisseur
export type CommandeStatut = "apasser" | "encours" | "recue";
export const COMMANDE_LABEL: Record<CommandeStatut, string> = {
  apasser: "🛒 À passer",
  encours: "🚚 Commandée",
  recue: "✅ Reçue",
};
export interface CommandeLigne { article: string; taille: string; quantite: number }
export interface Commande {
  id: string;
  statut: CommandeStatut;
  lignes: CommandeLigne[];
  fournisseur?: string;
  dateCreation?: number;
  dateCommande?: string;
  dateReception?: string;
}

// Stock : une entrée par article + taille
export interface StockItem {
  id: string; // `${article}__${taille}`
  article: string;
  taille: string;
  quantite: number;
  seuilMini: number;
}

// Journal d'inventaire : trace d'un import Excel (horodatage, auteur, ce qui a changé)
export interface Inventaire {
  id: string;
  date: string;    // ISO (horodaté)
  user: string;    // email de l'auteur
  comptees: number; // nb de références comptées (case « réelle » remplie)
  lignes: { article: string; taille: string; avant: number; apres: number }[]; // uniquement les modifications
}
