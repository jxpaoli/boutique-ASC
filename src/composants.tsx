import type { ReactNode } from "react";
import { useDonnees } from "./donnees";
import { date, jourMois } from "./format";
import type { Action, Evenement, Projet } from "./types";

export function PastilleProjet({ projet }: { projet: Projet | undefined }) {
  if (!projet) return null;
  return <span className="pastille" style={{ background: projet.couleur || "var(--marine)" }}>{projet.acronyme}</span>;
}

export function BlocDate({ iso, retard }: { iso: string | null; retard?: boolean }) {
  if (!iso) return <div className="date"><b>—</b><span>sans date</span></div>;
  const { jour, mois } = jourMois(iso);
  return <div className={`date${retard ? " retard" : ""}`}><b>{jour}</b><span>{mois}</span></div>;
}

// Case ronde « réalisé » devant une action (admin seulement).
export function CaseFait({ fait, onClick }: { fait: boolean; onClick: () => void }) {
  return (
    <button
      className={`case-fait${fait ? " on" : ""}`}
      onClick={onClick}
      role="checkbox"
      aria-checked={fait}
      aria-label={fait ? "Réalisée – décocher" : "Marquer comme réalisée"}
      title={fait ? "Réalisée – décocher" : "Marquer comme réalisée"}
    >
      {fait && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>}
    </button>
  );
}

export function LienDoc({ href, children = "Ouvrir le document" }: { href: string | null; children?: ReactNode }) {
  if (!href) return null;
  return <a className="doc" href={href} target="_blank" rel="noreferrer">{children}</a>;
}

const QUI: Record<string, string> = { admin: "Joseph", secretaire: "le secrétaire", systeme: "import", lecteur: "lecteur" };
export const libQui = (r: string | null) => QUI[r ?? ""] ?? "—";

// Une action est « rouverte » si son dernier changement de statut l'a fait sortir de « fait ».
export function derniereRouverture(a: Action, evenements: Evenement[]): Evenement | null {
  if (a.statut === "fait") return null;
  const statuts = evenements.filter((e) => e.action_id === a.id && e.type === "statut");
  const dernier = statuts[statuts.length - 1];
  return dernier && dernier.statut_avant === "fait" ? dernier : null;
}

// Badges « ticket » : validateur d'une action faite, ou réouverture.
export function BadgesTicket({ a }: { a: Action }) {
  const { donnees } = useDonnees();
  const rouv = donnees ? derniereRouverture(a, donnees.evenements) : null;
  if (rouv) return <span className="badge rouge" title={rouv.source ?? ""}>🔄 Rouverte par {libQui(rouv.qui_role)}</span>;
  if (a.statut === "fait" && a.valide_par) {
    return <span className={`badge ${a.valide_par === "secretaire" ? "bleu" : "vert"}`} title={a.valide_source ?? ""}>
      ✓ validé par {libQui(a.valide_par)}{a.valide_le ? ` · ${date(a.valide_le)}` : ""}
    </span>;
  }
  if (a.origine === "secretaire" && !a.modifie_par_admin) return <span className="badge bleu">✉ proposé par le secrétaire</span>;
  return null;
}

export const HORIZONS: { jours: number | null; libelle: string }[] = [
  { jours: 7, libelle: "7 jours" },
  { jours: 15, libelle: "15 jours" },
  { jours: 30, libelle: "1 mois" },
  { jours: 90, libelle: "3 mois" },
  { jours: null, libelle: "Tout" },
];

export function ChoixHorizon({ valeur, onChange }: { valeur: number | null; onChange: (j: number | null) => void }) {
  return (
    <div className="chips">
      {HORIZONS.map((h) => (
        <button key={h.libelle} className={`chip${valeur === h.jours ? " on" : ""}`} onClick={() => onChange(h.jours)}>{h.libelle}</button>
      ))}
    </div>
  );
}

export function FiltreProjets({ projets, valeur, onChange }: {
  projets: Projet[]; valeur: string; onChange: (id: string) => void;
}) {
  return (
    <div className="chips">
      <button className={`chip${valeur === "" ? " on" : ""}`} onClick={() => onChange("")}>Tous</button>
      {projets.map((p) => (
        <button key={p.id} className={`chip${valeur === p.id ? " on" : ""}`} onClick={() => onChange(p.id)}>{p.acronyme}</button>
      ))}
    </div>
  );
}
