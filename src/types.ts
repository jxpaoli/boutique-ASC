export type Role = "admin" | "lecteur" | "secretaire";

export interface Projet {
  id: string;
  acronyme: string;
  titre: string | null;
  programme: string | null;
  id_jems: string | null;
  appel: string | null;
  chef_de_file: string | null;
  n_partenaire: string | null;
  date_debut: string | null;
  date_fin: string | null;
  budget_projet: number | null;
  feder_projet: number | null;
  budget_epci: number | null;
  couleur: string | null;
  dossier_onedrive: string | null;
  dossier: string | null;
  actif: boolean;
}

export type StatutAction = "a_faire" | "en_cours" | "fait" | "abandonne";
export type Priorite = "haute" | "normale" | "basse";

export interface Action {
  id: string;
  projet_id: string;
  libelle: string;
  responsable: string | null;
  echeance: string | null;
  statut: StatutAction;
  priorite: Priorite;
  source: string | null;
  notes: string | null;
  origine: "admin" | "secretaire" | "import";
  modifie_par_admin: boolean;
  valide_par: "admin" | "secretaire" | null;
  valide_le: string | null;
  valide_source: string | null;
  mail_ref: string | null;
  echeance_id: string | null;
  updated_at: string;
}

export interface Evenement {
  id: number;
  action_id: string;
  quand: string;
  qui_email: string | null;
  qui_role: "admin" | "secretaire" | "lecteur" | "systeme" | null;
  type: "creation" | "statut" | "modification" | "commentaire";
  statut_avant: StatutAction | null;
  statut_apres: StatutAction | null;
  source: string | null;
  date_source: string | null;
  message: string | null;
}

export type Etape = "declaration" | "controle" | "rapport_cf" | "paiement";

export interface EtapePeriode {
  id: string;
  periode_id: string;
  etape: Etape;
  responsable: string | null;
  date_limite: string | null;
  fait_le: string | null;
  montant: number | null;
  lien: string | null;
  notes: string | null;
}

export interface Passage {
  id: number;
  debut: string;
  fin: string | null;
  mails_lus: number | null;
  actions_creees: number;
  actions_faites: number;
  actions_rouvertes: number;
  commentaires: number;
}

export type TypeEcheance = "cdp" | "rapport" | "livrable" | "evenement" | "autre";
export type StatutEcheance = "prevu" | "fait" | "annule";

export interface Echeance {
  id: string;
  projet_id: string;
  type: TypeEcheance;
  libelle: string;
  date: string;
  lieu: string | null;
  statut: StatutEcheance;
  lien: string | null;
  notes: string | null;
  heure_debut: string | null;
  heure_fin: string | null;
  lieu_nom: string | null;
  adresse: string | null;
  format: "presentiel" | "hybride" | "distanciel" | "ecrit" | null;
  lien_visio: string | null;
}

export type CategorieInfo = "transport" | "hebergement" | "repas" | "contact" | "acces" | "autre";

export interface ReunionInfo {
  id: string;
  echeance_id: string;
  categorie: CategorieInfo;
  titre: string;
  detail: string | null;
  adresse: string | null;
  telephone: string | null;
  lien: string | null;
  quand: string | null;
  ordre: number;
}

export interface ReunionPoint {
  id: string;
  echeance_id: string;
  ordre: number;
  titre: string;
  intervenant: string | null;
  statut: "a_venir" | "en_cours" | "traite";
  notes: string | null;
}

export type StatutLivrable = "a_faire" | "en_cours" | "envoye" | "approuve";

export interface Livrable {
  id: string;
  projet_id: string;
  code: string | null;
  titre: string;
  responsable: string | null;
  echeance: string | null;
  statut: StatutLivrable;
  lien: string | null;
  notes: string | null;
}

export interface Periode {
  id: string;
  projet_id: string;
  numero: number;
  date_debut: string | null;
  date_fin: string | null;
  prevu: number | null;
  declare: number | null;
  certifie: number | null;
  paye: number | null;
  observations: string | null;
}

export interface DocumentProjet {
  id: string;
  projet_id: string | null;
  dossier: string;
  chemin: string;
  nom: string;
  extension: string | null;
  taille: number | null;
  modifie_le: string | null;
  present: boolean;
}