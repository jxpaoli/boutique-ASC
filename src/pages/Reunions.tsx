import { useState } from "react";
import { Link } from "react-router-dom";
import { useDonnees } from "../donnees";
import { aujourdhui, date, LIB_TYPE_ECHEANCE } from "../format";
import { BlocDate, FiltreProjets, PastilleProjet } from "../composants";
import { usePreference } from "../preferences";
import { estReunion, heure } from "../reunions";

// Liste des réunions : à venir en premier ; les passées sur demande.
export default function Reunions() {
  const { donnees, projet } = useDonnees();
  const [filtre, setFiltre] = usePreference("reunions.projet", "");
  const [voirPassees, setVoirPassees] = useState(false);
  if (!donnees) return null;
  const auj = aujourdhui();
  const avecFiche = new Set([...donnees.infos.map((i) => i.echeance_id), ...donnees.points.map((p) => p.echeance_id)]);
  const reunions = donnees.echeances.filter((e) => estReunion(e, avecFiche) && e.statut !== "annule" && (!filtre || e.projet_id === filtre));
  const aVenir = reunions.filter((e) => e.date >= auj);
  const passees = reunions.filter((e) => e.date < auj).reverse();

  const carte = (e: (typeof reunions)[number]) => {
    const nbActions = donnees.actions.filter((a) => a.echeance_id === e.id && (a.statut === "a_faire" || a.statut === "en_cours")).length;
    return (
      <Link to={`/reunions/${e.id}`} className="item lien-carte" key={e.id}>
        <BlocDate iso={e.date} />
        <div className="corps">
          <div className="libelle">{e.libelle}</div>
          <div className="meta">
            <PastilleProjet projet={projet(e.projet_id)} />
            <span className="badge">{LIB_TYPE_ECHEANCE[e.type]}</span>
            {e.heure_debut && <span>{heure(e.heure_debut)}{e.heure_fin ? `–${heure(e.heure_fin)}` : ""}</span>}
            {(e.lieu_nom || e.lieu) && <span>📍 {e.lieu_nom || e.lieu}</span>}
            {nbActions > 0 && <span className="badge orange">{nbActions} à faire</span>}
            {avecFiche.has(e.id) && <span className="badge vert">fiche</span>}
          </div>
        </div>
      </Link>
    );
  };

  return (
    <>
      <div className="titre">Réunions</div>
      <FiltreProjets projets={donnees.projets.filter((p) => p.actif)} valeur={filtre} onChange={setFiltre} />
      <div className="sec">À venir ({aVenir.length})</div>
      {aVenir.length ? <div className="liste">{aVenir.map(carte)}</div> : <div className="vide">Aucune réunion prévue.</div>}
      <div className="sec">Passées ({passees.length})</div>
      {voirPassees
        ? <div className="liste">{passees.map(carte)}</div>
        : <button className="btn-lien" onClick={() => setVoirPassees(true)}>Afficher les réunions passées</button>}
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>Au {date(auj)}.</p>
    </>
  );
}
