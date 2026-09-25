import { useMemo, useState } from "react";
import { useDonnees } from "../donnees";
import { ajouterJours, aujourdhui, date, LIB_STATUT_ACTION, LIB_STATUT_LIVRABLE, LIB_TYPE_ECHEANCE } from "../format";
import { BadgesTicket, BlocDate, CaseFait, ChoixHorizon, FiltreProjets, HORIZONS, LienDoc, PastilleProjet } from "../composants";
import { MON_NOM, usePreference } from "../preferences";
import { Anneau } from "../indicateurs";
import type { Action } from "../types";

interface Ligne {
  cle: string;
  date: string;
  projetId: string;
  genre: string;
  libelle: string;
  detail: string;
  lien: string | null;
  action?: Action;
}

const ouverte = (s: string) => s === "a_faire" || s === "en_cours";

// Échéances, actions ouvertes et livrables non envoyés sur une période réglable, retards en tête.
export default function Agenda({ sansIndicateurs = false }: { sansIndicateurs?: boolean }) {
  const { donnees, projet, estAdmin, cocherAction, setEditer } = useDonnees();
  const [filtre, setFiltre] = usePreference("agenda.projet", "");
  const [horizon, setHorizon] = usePreference<number | null>("agenda.horizon", 30);
  const [mesActions, setMesActions] = usePreference("agenda.mes", estAdmin);
  // Une action cochée ici reste affichée (barrée) pour pouvoir la décocher.
  const [cocheesIci, setCocheesIci] = useState<Set<string>>(new Set());
  const auj = aujourdhui();
  const fin = horizon == null ? null : ajouterJours(auj, horizon);
  const moi = estAdmin && mesActions;

  const { aVenir, retards } = useMemo(() => {
    const vide = { aVenir: [] as Ligne[], retards: [] as Ligne[] };
    if (!donnees) return vide;
    const duProjet = (id: string) => !filtre || id === filtre;
    const pourMoi = (r: string | null) => !moi || !r || r === MON_NOM;
    const tout: Ligne[] = [];
    for (const e of donnees.echeances) {
      if (e.statut !== "prevu" || !duProjet(e.projet_id)) continue;
      tout.push({ cle: `e${e.id}`, date: e.date, projetId: e.projet_id, genre: LIB_TYPE_ECHEANCE[e.type], libelle: e.libelle, detail: e.lieu ?? "", lien: e.lien });
    }
    for (const a of donnees.actions) {
      const visible = ouverte(a.statut) || (a.statut === "fait" && cocheesIci.has(a.id));
      if (!visible || !a.echeance || !duProjet(a.projet_id) || !pourMoi(a.responsable)) continue;
      tout.push({ cle: `a${a.id}`, date: a.echeance, projetId: a.projet_id, genre: "Action", libelle: a.libelle, detail: [moi ? null : a.responsable, LIB_STATUT_ACTION[a.statut]].filter(Boolean).join(" · "), lien: null, action: a });
    }
    for (const v of donnees.livrables) {
      if (!ouverte(v.statut) || !v.echeance || !duProjet(v.projet_id) || !pourMoi(v.responsable)) continue;
      tout.push({ cle: `l${v.id}`, date: v.echeance, projetId: v.projet_id, genre: "Livrable", libelle: [v.code, v.titre].filter(Boolean).join(" – "), detail: [moi ? null : v.responsable, LIB_STATUT_LIVRABLE[v.statut]].filter(Boolean).join(" · "), lien: v.lien });
    }
    tout.sort((x, y) => x.date.localeCompare(y.date));
    return {
      // Les échéances passées ne sont pas des retards (réunion tenue, date échue) : seuls actions et livrables le sont.
      retards: tout.filter((l) => l.date < auj && (l.action || l.genre === "Livrable")),
      aVenir: tout.filter((l) => l.date >= auj && (fin == null || l.date <= fin)),
    };
  }, [donnees, auj, fin, filtre, moi, cocheesIci]);

  if (!donnees) return null;
  const prochainCdp = donnees.echeances.find((e) => e.type === "cdp" && e.statut === "prevu" && e.date >= auj && (!filtre || e.projet_id === filtre));
  const libHorizon = HORIZONS.find((h) => h.jours === horizon)?.libelle ?? "";
  const nonFaites = (ls: Ligne[]) => ls.filter((l) => l.action?.statut !== "fait").length;

  const ligne = (l: Ligne, retard = false) => (
    <div className={`item${l.action?.statut === "fait" ? " fait" : ""}`} key={l.cle}>
      {estAdmin && l.action && (
        <CaseFait fait={l.action.statut === "fait"} onClick={() => {
          const a = l.action!;
          if (a.statut !== "fait") setCocheesIci((s) => new Set(s).add(a.id));
          void cocherAction(a);
        }} />
      )}
      <BlocDate iso={l.date} retard={retard && l.action?.statut !== "fait"} />
      <div className="corps">
        {estAdmin && l.action
          ? <div className="libelle cliquable" onClick={() => setEditer(l.action!)}>{l.libelle}</div>
          : <div className="libelle">{l.libelle}</div>}
        <div className="meta">
          <PastilleProjet projet={projet(l.projetId)} />
          <span className="badge">{l.genre}</span>
          {l.detail && <span>{l.detail}</span>}
          {l.action && <BadgesTicket a={l.action} />}
          <LienDoc href={l.lien} />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {estAdmin && (
        <div className="chips">
          <button className={`chip${mesActions ? " on" : ""}`} onClick={() => setMesActions(true)}>Mon travail</button>
          <button className={`chip${!mesActions ? " on" : ""}`} onClick={() => setMesActions(false)}>Tout le monde</button>
        </div>
      )}
      <FiltreProjets projets={donnees.projets.filter((p) => p.actif)} valeur={filtre} onChange={setFiltre} />
      <ChoixHorizon valeur={horizon} onChange={setHorizon} />

      {!sansIndicateurs && (() => {
        const ouvertes = nonFaites(aVenir) + nonFaites(retards);
        const jours = prochainCdp ? Math.round((Date.parse(prochainCdp.date) - Date.parse(auj)) / 86400000) : null;
        return (
          <div className="anneaux compact">
            <Anneau taille={74} valeur={ouvertes ? nonFaites(aVenir) / ouvertes : null} centre={String(nonFaites(aVenir))}
              libelle="À venir" sous={horizon == null ? "tout" : libHorizon} ton="bleu" />
            <Anneau taille={74} valeur={ouvertes ? nonFaites(retards) / ouvertes : 0} centre={String(nonFaites(retards))}
              libelle="En retard" ton={nonFaites(retards) ? "rouge" : "vert"} />
            <Anneau taille={74} valeur={jours == null ? null : Math.max(0, 1 - jours / 60)} centre={jours == null ? "—" : `J-${jours}`}
              libelle="Prochain CdP" sous={prochainCdp ? `${projet(prochainCdp.projet_id)?.acronyme} · ${date(prochainCdp.date).slice(0, 5)}` : ""}
              ton={jours != null && jours <= 7 ? "orange" : "bleu"} />
          </div>
        );
      })()}

      {retards.length > 0 && (
        <>
          <div className="sec">En retard ({nonFaites(retards)})</div>
          <div className="liste">{retards.map((l) => ligne(l, true))}</div>
        </>
      )}

      <div className="sec">{horizon == null ? "À venir" : `Les ${libHorizon} à venir`}</div>
      {aVenir.length === 0
        ? <div className="vide">Rien de prévu{fin ? ` d’ici le ${date(fin)}` : ""}.</div>
        : <div className="liste">{aVenir.map((l) => ligne(l))}</div>}
    </>
  );
}
