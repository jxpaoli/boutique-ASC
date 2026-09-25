import { useState } from "react";
import { Link } from "react-router-dom";
import { useDonnees } from "../donnees";
import { ajouterJours, aujourdhui, date, LIB_STATUT_LIVRABLE, LIB_TYPE_ECHEANCE, montant, pourcent } from "../format";
import { calculer } from "../indicateurs";
import type { Periode } from "../types";

const somme = (ps: Periode[], k: "prevu" | "declare" | "certifie" | "paye") => {
  const v = ps.map((p) => p[k]).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

// Rapport pour la direction, à la demande : une page propre à imprimer ou enregistrer en PDF.
export default function Rapport() {
  const { donnees } = useDonnees();
  const auj = aujourdhui();
  const [depuis, setDepuis] = useState(ajouterJours(auj, -30));
  const [horizon, setHorizon] = useState(30);
  const [choix, setChoix] = useState<string[]>([]);
  if (!donnees) return null;

  const projets = donnees.projets.filter((p) => p.actif && (choix.length === 0 || choix.includes(p.id)));
  const fin = ajouterJours(auj, horizon);
  const basculer = (id: string) => setChoix((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <div className="rapport">
      <div className="rapport-reglages no-print">
        <Link to="/" className="btn-lien">← Retour</Link>
        <div className="titre">Rapport pour la direction</div>
        <div className="grille2">
          <div><label htmlFor="r-depuis">Réalisations depuis le</label><input id="r-depuis" type="date" value={depuis} onChange={(e) => setDepuis(e.target.value)} /></div>
          <div>
            <label htmlFor="r-horizon">Échéances à venir</label>
            <select id="r-horizon" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              <option value={30}>1 mois</option><option value={60}>2 mois</option><option value={90}>3 mois</option>
            </select>
          </div>
        </div>
        <label>Projets</label>
        <div className="chips">
          <button className={`chip${choix.length === 0 ? " on" : ""}`} onClick={() => setChoix([])}>Tous</button>
          {donnees.projets.filter((p) => p.actif).map((p) => (
            <button key={p.id} className={`chip${choix.includes(p.id) ? " on" : ""}`} onClick={() => basculer(p.id)}>{p.acronyme}</button>
          ))}
        </div>
        <button className="btn-primary" onClick={() => window.print()}>🖨️ Imprimer / enregistrer en PDF</button>
      </div>

      <article className="feuille">
        <header className="feuille-tete">
          <img src="/logo-192.png" alt="" />
          <div>
            <h1>Projets européens – point d’avancement</h1>
            <div>EPCI de Corse – Ports de Haute-Corse · au {date(auj)}</div>
          </div>
        </header>

        <section>
          <h2>Synthèse</h2>
          <table className="tab">
            <thead><tr><th>Projet</th><th>Actions ouvertes</th><th>En retard</th><th>Réalisées depuis le {date(depuis)}</th><th>Livrables approuvés</th><th>Prochain CdP</th></tr></thead>
            <tbody>
              {projets.map((p) => {
                const ind = calculer(donnees, p.id);
                const realisees = donnees.actions.filter((a) => a.projet_id === p.id && a.statut === "fait" && a.valide_le && a.valide_le.slice(0, 10) >= depuis).length;
                const cdp = donnees.echeances.find((e) => e.projet_id === p.id && e.type === "cdp" && e.statut === "prevu" && e.date >= auj);
                return (
                  <tr key={p.id}>
                    <td><b>{p.acronyme}</b></td>
                    <td>{ind.ouvertes}</td>
                    <td className={ind.retards ? "alerte" : ""}>{ind.retards}</td>
                    <td>{realisees}</td>
                    <td>{ind.livrablesApprouves} / {ind.livrablesTotal}</td>
                    <td>{cdp ? date(cdp.date) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {projets.map((p) => {
          const ps = donnees.periodes.filter((x) => x.projet_id === p.id);
          const faites = donnees.actions.filter((a) => a.projet_id === p.id && a.statut === "fait" && a.valide_le && a.valide_le.slice(0, 10) >= depuis);
          const retards = donnees.actions.filter((a) => a.projet_id === p.id && (a.statut === "a_faire" || a.statut === "en_cours") && a.echeance && a.echeance < auj)
            .sort((a, b) => (a.echeance ?? "").localeCompare(b.echeance ?? ""));
          const aVenir = donnees.echeances.filter((e) => e.projet_id === p.id && e.statut === "prevu" && e.date >= auj && e.date <= fin);
          const livrables = donnees.livrables.filter((l) => l.projet_id === p.id);
          const declare = somme(ps, "declare");
          return (
            <section key={p.id} className="projet-rapport">
              <h2>{p.acronyme}{p.titre ? <span className="sous"> – {p.titre}</span> : null}</h2>
              <div className="fiche-ligne">
                {p.programme && <span>{p.programme}</span>}
                {p.chef_de_file && <span>Chef de file : {p.chef_de_file}</span>}
                <span>{date(p.date_debut)} → {date(p.date_fin)}</span>
                <span>Budget EPCI de Corse : {montant(p.budget_epci)}</span>
                <span>Déclaré : {montant(declare)}{p.budget_epci && declare != null ? ` (${pourcent(declare / p.budget_epci)})` : ""}</span>
              </div>

              <h3>Réalisé depuis le {date(depuis)} ({faites.length})</h3>
              {faites.length ? <ul>{faites.map((a) => <li key={a.id}>{a.libelle}</li>)}</ul> : <p className="muted">Rien d’enregistré sur la période.</p>}

              <h3>Points d’attention : actions en retard ({retards.length})</h3>
              {retards.length ? <ul>{retards.slice(0, 10).map((a) => <li key={a.id}>{a.libelle} <span className="muted">(prévu le {date(a.echeance)}{a.responsable ? `, ${a.responsable}` : ""})</span></li>)}</ul> : <p className="muted">Aucune.</p>}
              {retards.length > 10 && <p className="muted">… et {retards.length - 10} autre(s).</p>}

              <h3>Échéances à venir</h3>
              {aVenir.length ? (
                <ul>{aVenir.map((e) => <li key={e.id}><b>{date(e.date)}</b> – {LIB_TYPE_ECHEANCE[e.type]} : {e.libelle}{e.lieu_nom || e.lieu ? ` (${e.lieu_nom || e.lieu})` : ""}</li>)}</ul>
              ) : <p className="muted">Aucune sur la période.</p>}

              {livrables.length > 0 && (
                <>
                  <h3>Livrables</h3>
                  <table className="tab">
                    <thead><tr><th>Code</th><th>Livrable</th><th>Échéance</th><th>État</th></tr></thead>
                    <tbody>{livrables.map((l) => <tr key={l.id}><td>{l.code ?? ""}</td><td>{l.titre}</td><td>{date(l.echeance)}</td><td>{LIB_STATUT_LIVRABLE[l.statut]}</td></tr>)}</tbody>
                  </table>
                </>
              )}

              {ps.some((x) => x.prevu != null || x.declare != null) && (
                <>
                  <h3>Finances par période (part EPCI de Corse)</h3>
                  <table className="tab">
                    <thead><tr><th>Période</th><th>Prévu</th><th>Déclaré</th><th>Certifié</th><th>Payé</th></tr></thead>
                    <tbody>{ps.map((x) => <tr key={x.id}><td>P{x.numero}</td><td>{montant(x.prevu)}</td><td>{montant(x.declare)}</td><td>{montant(x.certifie)}</td><td>{montant(x.paye)}</td></tr>)}</tbody>
                  </table>
                </>
              )}
            </section>
          );
        })}
        <footer className="feuille-pied">Source : appli Projets européens (europa.master.corsica), données au {date(auj)}.</footer>
      </article>
    </div>
  );
}
