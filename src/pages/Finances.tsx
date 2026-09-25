import { useDonnees } from "../donnees";
import { aujourdhui, date, montant, pourcent } from "../format";
import { PastilleProjet } from "../composants";
import type { Periode } from "../types";

const somme = (ps: Periode[], k: "prevu" | "declare" | "certifie" | "paye") => {
  const v = ps.map((p) => p[k]).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

// Consommation = déclaré / prévu sur les périodes échues. Sous 70 % : risque de désengagement.
function niveau(taux: number | null) {
  if (taux == null) return "";
  if (taux < 0.7) return "rouge";
  if (taux < 0.9) return "orange";
  return "";
}

export default function Finances() {
  const { donnees } = useDonnees();
  if (!donnees) return null;
  const auj = aujourdhui();

  return (
    <>
      <div className="titre">Finances – part EPCI de Corse</div>
      <div className="liste">
        {donnees.projets.filter((p) => p.actif).map((p) => {
          const ps = donnees.periodes.filter((x) => x.projet_id === p.id);
          const echues = ps.filter((x) => x.date_fin && x.date_fin < auj);
          const prevuEchu = somme(echues, "prevu");
          const declareEchu = somme(echues, "declare");
          const taux = prevuEchu ? (declareEchu ?? 0) / prevuEchu : null;
          const totalDeclare = somme(ps, "declare");
          const conso = p.budget_epci ? (totalDeclare ?? 0) / p.budget_epci : null;
          return (
            <div className="card fin-projet" key={p.id}>
              <div className="fin-tete">
                <PastilleProjet projet={p} />
                <span className="num" style={{ fontWeight: 800 }}>Budget : {montant(p.budget_epci)}</span>
              </div>

              <div>
                <div className="meta muted" style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between" }}>
                  <span>Déclaré / budget</span><b className="num">{pourcent(conso)}</b>
                </div>
                <div className="jauge"><i style={{ width: `${Math.min(100, (conso ?? 0) * 100)}%` }} /></div>
              </div>
              <div>
                <div className="meta muted" style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between" }}>
                  <span>Déclaré / prévu (périodes échues)</span><b className="num">{pourcent(taux)}</b>
                </div>
                <div className={`jauge ${niveau(taux)}`}><i style={{ width: `${Math.min(100, (taux ?? 0) * 100)}%` }} /></div>
                {niveau(taux) === "rouge" && <div className="badge rouge" style={{ marginTop: 6 }}>Risque de désengagement</div>}
              </div>

              <div className="fin-grille">
                <div><span className="muted">Prévu</span><b className="num">{montant(somme(ps, "prevu"))}</b></div>
                <div><span className="muted">Déclaré</span><b className="num">{montant(totalDeclare)}</b></div>
                <div><span className="muted">Certifié</span><b className="num">{montant(somme(ps, "certifie"))}</b></div>
                <div><span className="muted">Payé</span><b className="num">{montant(somme(ps, "paye"))}</b></div>
              </div>

              {ps.length > 0 ? (
                <div className="tableau-scroll">
                  <table className="periodes">
                    <thead><tr><th>Période</th><th>Prévu</th><th>Déclaré</th><th>Certifié</th><th>Payé</th></tr></thead>
                    <tbody>
                      {ps.map((x) => (
                        <tr key={x.id} title={x.observations ?? ""}>
                          <td>P{x.numero}<div className="muted" style={{ fontSize: 11 }}>{date(x.date_debut)} → {date(x.date_fin)}</div></td>
                          <td className="num">{montant(x.prevu)}</td>
                          <td className="num">{montant(x.declare)}</td>
                          <td className="num">{montant(x.certifie)}</td>
                          <td className="num">{montant(x.paye)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="muted" style={{ fontSize: 13 }}>Aucune période saisie.</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
