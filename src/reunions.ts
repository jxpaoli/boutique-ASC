import type { DocumentProjet, Echeance } from "./types";

// Numéro d'un CdP à partir de son libellé : « CdP7 », « 7e comité », « Comité de pilotage n°3 », « CdP n°2 ».
export function numeroReunion(libelle: string): number | null {
  const l = libelle.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const m = l.match(/(?:cdp|copil|comite de pilotage)\s*(?:n\s*[°o.]?\s*)?(\d+)/)
    ?? l.match(/(\d+)\s*(?:e|er|eme|°|o)?\s*(?:cdp|copil|comite)/);
  return m ? Number(m[1]) : null;
}

export type GenreDoc = "preparation" | "ordre_du_jour" | "pv" | "autre";

function genre(nom: string): GenreDoc {
  const n = nom.toLowerCase();
  if (n.includes("preparation")) return "preparation";
  if (/agenda|ordre[ _-]du[ _-]jour|odj/.test(n)) return "ordre_du_jour";
  if (/verbal|verbale|compte[ _-]rendu|proces/.test(n)) return "pv";
  return "autre";
}

// Documents d'une réunion : même projet, et le numéro du CdP dans le nom ou le dossier (CdP7/, 7cdp, cdp n.2, 1ocdp…).
export function documentsDeReunion(e: Echeance, docs: DocumentProjet[]): { doc: DocumentProjet; genre: GenreDoc }[] {
  const num = e.type === "cdp" ? numeroReunion(e.libelle) : null;
  if (num == null) return [];
  const motif = new RegExp(`(cdp|copil)[\\s._/-]*(n[\\s.°o]*)?0*${num}(?!\\d)|(^|\\D)${num}[\\s._-]*(e|er|o|°)?[\\s._-]*(cdp|copil)`);
  return docs
    .filter((d) => d.present && d.projet_id === e.projet_id && motif.test(d.chemin.toLowerCase()) && !/\.dotx?$/.test(d.nom))
    .map((doc) => ({ doc, genre: genre(doc.nom) }))
    .sort((a, b) => (b.doc.modifie_le ?? "").localeCompare(a.doc.modifie_le ?? ""));
}

export const lienGps = (adresse: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;

export const heure = (h: string | null) => (h ? h.slice(0, 5).replace(":", "h") : "");

// Réunions : CdP et événements, plus toute échéance qui a une fiche (lieu, infos ou ordre du jour).
export function estReunion(e: Echeance, idsAvecFiche: Set<string>) {
  return e.type === "cdp" || e.type === "evenement" || !!e.adresse || !!e.lien_visio || idsAvecFiche.has(e.id);
}
