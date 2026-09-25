import { useDonnees } from "../donnees";
import { aujourdhui, date, montant } from "../format";
import { LienDoc } from "../composants";

export default function Projets() {
  const { donnees } = useDonnees();
  if (!donnees) return null;
  const auj = aujourdhui();

  return (
    <>
      <div className="titre">Projets</div>
      <div className="projets">
        {donnees.projets.filter((p) => p.actif).map((p) => {
          const cdp = donnees.echeances.find((e) => e.projet_id === p.id && e.type === "cdp" && e.statut === "prevu" && e.date >= auj);
          return (
            <div className="card projet-carte" key={p.id} style={{ borderLeftColor: p.couleur || undefined }}>
              <h3>{p.acronyme}</h3>
              {p.titre && <div className="titre-long">{p.titre}</div>}
              <dl>
                <dt>Programme</dt><dd>{p.programme ?? "—"}{p.appel ? ` · ${p.appel}` : ""}</dd>
                <dt>ID Jems</dt><dd>{p.id_jems ?? "—"}</dd>
                <dt>Chef de file</dt><dd>{p.chef_de_file ?? "—"}</dd>
                <dt>Partenaire n°</dt><dd>{p.n_partenaire ?? "—"}</dd>
                <dt>Dates</dt><dd>{date(p.date_debut)} → {date(p.date_fin)}</dd>
                <dt>Budget projet</dt><dd className="num">{montant(p.budget_projet)}</dd>
                <dt>FEDER projet</dt><dd className="num">{montant(p.feder_projet)}</dd>
                <dt>Budget EPCI</dt><dd className="num">{montant(p.budget_epci)}</dd>
                <dt>Prochain CdP</dt><dd>{cdp ? `${date(cdp.date)}${cdp.lieu ? ` – ${cdp.lieu}` : ""}` : "—"}</dd>
              </dl>
              {p.dossier_onedrive && <div style={{ marginTop: 10 }}><LienDoc href={p.dossier_onedrive}>Dossier OneDrive du projet</LienDoc></div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
