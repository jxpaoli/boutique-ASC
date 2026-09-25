import { useEffect, useState } from "react";
import type { Donnees } from "./donnees";
import { aujourdhui } from "./format";

// Anneau de progression. valeur entre 0 et 1 (null = pas de donnée) ; le centre affiche un texte libre.
export function Anneau({ valeur, centre, libelle, sous, ton = "vert", taille = 92 }: {
  valeur: number | null;
  centre: string;
  libelle: string;
  sous?: string;
  ton?: "vert" | "orange" | "rouge" | "bleu" | "neutre";
  taille?: number;
}) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const v = valeur == null ? 0 : Math.max(0, Math.min(1, valeur));
  return (
    <div className="anneau" style={{ width: taille + 24 }}>
      <svg viewBox="0 0 100 100" width={taille} height={taille} role="img" aria-label={`${libelle} : ${centre}`}>
        <circle cx="50" cy="50" r={r} className="anneau-fond" />
        {valeur != null && (
          <circle cx="50" cy="50" r={r} className={`anneau-val ${ton}`}
            strokeDasharray={`${v * c} ${c}`} transform="rotate(-90 50 50)" />
        )}
        <text x="50" y="50" className="anneau-centre" dominantBaseline="central" textAnchor="middle"
          style={{ fontSize: centre.length > 4 ? 17 : 22 }}>{centre}</text>
      </svg>
      <div className="anneau-lib">{libelle}</div>
      {sous && <div className="anneau-sous">{sous}</div>}
    </div>
  );
}

export function useEcranLarge(min = 1024) {
  const requete = `(min-width: ${min}px)`;
  const [large, setLarge] = useState(() => typeof window !== "undefined" && window.matchMedia(requete).matches);
  useEffect(() => {
    const m = window.matchMedia(requete);
    const f = () => setLarge(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [requete]);
  return large;
}

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);

export interface Indicateurs {
  actionsFaites: number; actionsTotal: number;
  retards: number; ouvertes: number;
  livrablesApprouves: number; livrablesTotal: number;
  declare: number | null; budget: number | null;
  tempsEcoule: number | null;
  joursCdp: number | null; cdpAcronyme: string | null;
  rouvertes: number;
}

// Indicateurs pour un projet (projetId) ou pour tous (null).
export function calculer(d: Donnees, projetId: string | null): Indicateurs {
  const auj = aujourdhui();
  const de = <T extends { projet_id: string }>(xs: T[]) => (projetId ? xs.filter((x) => x.projet_id === projetId) : xs);
  const actions = de(d.actions).filter((a) => a.statut !== "abandonne");
  const ouvertes = actions.filter((a) => a.statut === "a_faire" || a.statut === "en_cours");
  const livrables = de(d.livrables);
  const projets = projetId ? d.projets.filter((p) => p.id === projetId) : d.projets.filter((p) => p.actif);
  const periodes = de(d.periodes);

  const declares = periodes.map((p) => p.declare).filter((x): x is number => x != null);
  const budgets = projets.map((p) => p.budget_epci).filter((x): x is number => x != null);

  // Temps écoulé : moyenne sur les projets dont les dates sont connues.
  const temps = projets.filter((p) => p.date_debut && p.date_fin).map((p) => {
    const debut = Date.parse(p.date_debut!), fin = Date.parse(p.date_fin!), now = Date.parse(auj);
    return Math.max(0, Math.min(1, (now - debut) / (fin - debut)));
  });

  const cdp = de(d.echeances).find((e) => e.type === "cdp" && e.statut === "prevu" && e.date >= auj);
  const idsActions = new Set(actions.map((a) => a.id));
  const rouvertes = ouvertes.filter((a) => {
    const s = d.evenements.filter((e) => e.action_id === a.id && e.type === "statut");
    return s.length > 0 && s[s.length - 1].statut_avant === "fait" && idsActions.has(a.id);
  }).length;

  return {
    actionsFaites: actions.filter((a) => a.statut === "fait").length,
    actionsTotal: actions.length,
    retards: ouvertes.filter((a) => a.echeance && a.echeance < auj).length,
    ouvertes: ouvertes.length,
    livrablesApprouves: livrables.filter((l) => l.statut === "approuve").length,
    livrablesTotal: livrables.length,
    declare: declares.length ? declares.reduce((a, b) => a + b, 0) : null,
    budget: budgets.length ? budgets.reduce((a, b) => a + b, 0) : null,
    tempsEcoule: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
    joursCdp: cdp ? Math.round((Date.parse(cdp.date) - Date.parse(auj)) / 86400000) : null,
    cdpAcronyme: cdp ? d.projets.find((p) => p.id === cdp.projet_id)?.acronyme ?? null : null,
    rouvertes,
  };
}

// Jeu d'anneaux standard. compact = téléphone (3 anneaux essentiels).
export function Anneaux({ ind, compact }: { ind: Indicateurs; compact?: boolean }) {
  const conso = ind.budget ? (ind.declare ?? 0) / ind.budget : null;
  // Désengagement : le budget consommé doit suivre le temps écoulé.
  const tonConso = conso == null || ind.tempsEcoule == null ? "bleu"
    : conso < ind.tempsEcoule * 0.6 ? "rouge" : conso < ind.tempsEcoule * 0.85 ? "orange" : "vert";
  const taille = compact ? 74 : 92;
  const anneaux = [
    <Anneau key="ret" taille={taille} valeur={ind.ouvertes ? ind.retards / ind.ouvertes : 0} centre={String(ind.retards)}
      libelle="En retard" sous={`sur ${ind.ouvertes} ouvertes`} ton={ind.retards ? "rouge" : "vert"} />,
    <Anneau key="fait" taille={taille} valeur={ind.actionsTotal ? ind.actionsFaites / ind.actionsTotal : null}
      centre={pct(ind.actionsTotal ? ind.actionsFaites / ind.actionsTotal : null)} libelle="Actions réalisées"
      sous={`${ind.actionsFaites} / ${ind.actionsTotal}`} ton="vert" />,
    <Anneau key="cdp" taille={taille} valeur={ind.joursCdp == null ? null : Math.max(0, 1 - ind.joursCdp / 60)}
      centre={ind.joursCdp == null ? "—" : `J-${ind.joursCdp}`} libelle="Prochain CdP" sous={ind.cdpAcronyme ?? ""}
      ton={ind.joursCdp != null && ind.joursCdp <= 7 ? "orange" : "bleu"} />,
  ];
  if (!compact) {
    anneaux.push(
      <Anneau key="liv" taille={taille} valeur={ind.livrablesTotal ? ind.livrablesApprouves / ind.livrablesTotal : null}
        centre={`${ind.livrablesApprouves}/${ind.livrablesTotal}`} libelle="Livrables approuvés" ton="vert" />,
      <Anneau key="temps" taille={taille} valeur={ind.tempsEcoule} centre={pct(ind.tempsEcoule)} libelle="Temps écoulé" ton="neutre"
        sous={ind.tempsEcoule == null ? "dates à saisir" : undefined} />,
      <Anneau key="conso" taille={taille} valeur={conso} centre={pct(conso)} libelle="Budget déclaré" ton={tonConso}
        sous={conso == null ? "montants à saisir" : "à comparer au temps"} />,
    );
    if (ind.rouvertes) {
      anneaux.push(<Anneau key="rouv" taille={taille} valeur={1} centre={String(ind.rouvertes)} libelle="Rouvertes" sous="à reprendre" ton="rouge" />);
    }
  }
  return <div className={`anneaux${compact ? " compact" : ""}`}>{anneaux}</div>;
}
