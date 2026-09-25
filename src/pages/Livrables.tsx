import { useState } from "react";
import { useDonnees } from "../donnees";
import { aujourdhui, COULEUR_STATUT_LIVRABLE, LIB_STATUT_LIVRABLE } from "../format";
import { BlocDate, FiltreProjets, LienDoc, PastilleProjet } from "../composants";
import type { StatutLivrable } from "../types";

const ORDRE: StatutLivrable[] = ["a_faire", "en_cours", "envoye", "approuve"];

export default function Livrables() {
  const { donnees, projet } = useDonnees();
  const [filtre, setFiltre] = useState("");
  if (!donnees) return null;
  const auj = aujourdhui();
  const selection = donnees.livrables.filter((v) => !filtre || v.projet_id === filtre);

  return (
    <>
      <div className="titre">Livrables</div>
      <FiltreProjets projets={donnees.projets.filter((p) => p.actif)} valeur={filtre} onChange={setFiltre} />
      <div className="kpis" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {ORDRE.map((s) => (
          <div className="kpi" key={s}><b>{selection.filter((v) => v.statut === s).length}</b><span>{LIB_STATUT_LIVRABLE[s]}</span></div>
        ))}
      </div>
      {ORDRE.map((s) => {
        const liste = selection.filter((v) => v.statut === s);
        if (!liste.length) return null;
        return (
          <div key={s}>
            <div className="sec">{LIB_STATUT_LIVRABLE[s]} ({liste.length})</div>
            <div className="liste">
              {liste.map((v) => {
                const retard = (s === "a_faire" || s === "en_cours") && !!v.echeance && v.echeance < auj;
                return (
                  <div className="item" key={v.id}>
                    <BlocDate iso={v.echeance} retard={retard} />
                    <div className="corps">
                      <div className="libelle">{v.code && <b>{v.code} – </b>}{v.titre}</div>
                      <div className="meta">
                        <PastilleProjet projet={projet(v.projet_id)} />
                        <span className={`badge ${COULEUR_STATUT_LIVRABLE[v.statut]}`}>{LIB_STATUT_LIVRABLE[v.statut]}</span>
                        {retard && <span className="badge rouge">En retard</span>}
                        {v.responsable && <span>{v.responsable}</span>}
                        <LienDoc href={v.lien} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {selection.length === 0 && <div className="vide" style={{ marginTop: 12 }}>Aucun livrable.</div>}
    </>
  );
}
