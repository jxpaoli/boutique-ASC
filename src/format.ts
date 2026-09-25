import type { Priorite, StatutAction, StatutEcheance, StatutLivrable, TypeEcheance } from "./types";

// Dates stockées en AAAA-MM-JJ ; affichées en JJ/MM/AAAA.
export function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ajouterJours(iso: string, jours: number): string {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(a, m - 1, j + jours);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function date(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export function jourMois(iso: string): { jour: string; mois: string } {
  const [, m, j] = iso.split("-");
  return { jour: String(Number(j)), mois: MOIS[Number(m) - 1] };
}

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
export function montant(n: number | null | undefined): string {
  return n == null ? "—" : euros.format(n);
}

export function pourcent(n: number | null): string {
  return n == null ? "—" : `${Math.round(n * 100)} %`;
}

export const LIB_STATUT_ACTION: Record<StatutAction, string> = {
  a_faire: "À faire", en_cours: "En cours", fait: "Fait", abandonne: "Abandonné",
};
export const LIB_PRIORITE: Record<Priorite, string> = { haute: "Haute", normale: "Normale", basse: "Basse" };
export const LIB_TYPE_ECHEANCE: Record<TypeEcheance, string> = {
  cdp: "CdP", rapport: "Rapport", livrable: "Livrable", evenement: "Événement", autre: "Échéance",
};
export const LIB_STATUT_ECHEANCE: Record<StatutEcheance, string> = { prevu: "Prévu", fait: "Fait", annule: "Annulé" };
export const LIB_STATUT_LIVRABLE: Record<StatutLivrable, string> = {
  a_faire: "À faire", en_cours: "En cours", envoye: "Envoyé", approuve: "Approuvé",
};

export const COULEUR_STATUT_LIVRABLE: Record<StatutLivrable, string> = {
  a_faire: "", en_cours: "orange", envoye: "bleu", approuve: "vert",
};
