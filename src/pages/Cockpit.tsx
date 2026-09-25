import { useDonnees } from "../donnees";
import { aujourdhui, date } from "../format";
import { Anneau, Anneaux, calculer } from "../indicateurs";
import { BadgesTicket, derniereRouverture, PastilleProjet } from "../composants";
import Agenda from "./Agenda";

const LIB_ETAPE = { declaration: "Déclaration Jems", controle: "Contrôle 1er niveau", rapport_cf: "Rapport au chef de file", paiement: "Paiement FEDER" } as const;

// Écran d'accueil sur PC : tous les indicateurs, l'agenda et ce qui demande une reprise.
export default function Cockpit() {
  const { donnees, projet, estAdmin, setEditer } = useDonnees();
  if (!donnees) return null;
  const auj = aujourdhui();
  const global = calculer(donnees, null);
  const rouvertes = donnees.actions.filter((a) => derniereRouverture(a, donnees.evenements));
  const proposees = donnees.actions.filter((a) => a.origine === "secretaire" && !a.modifie_par_admin && a.statut !== "fait");
  const etapes = donnees.etapes
    .filter((e) => !e.fait_le && e.date_limite)
    .sort((a, b) => a.date_limite!.localeCompare(b.date_limite!))
    .slice(0, 8);
  const passage = donnees.dernierPassage;

  return (
    <div className="cockpit">
      <Anneaux ind={global} />

      <div className="cockpit-projets">
        {donnees.projets.filter((p) => p.actif).map((p) => {
          const ind = calculer(donnees, p.id);
          const conso = ind.budget ? (ind.declare ?? 0) / ind.budget : null;
          return (
            <div className="card" key={p.id}>
              <h3><PastilleProjet projet={p} />{p.titre ? <span className="muted" style={{ fontWeight: 600, fontSize: 12.5 }}>{p.titre.slice(0, 50)}</span> : null}</h3>
              <div className="anneaux">
                <Anneau taille={64} valeur={ind.ouvertes ? ind.retards / ind.ouvertes : 0} centre={String(ind.retards)} libelle="En retard" ton={ind.retards ? "rouge" : "vert"} />
                <Anneau taille={64} valeur={ind.actionsTotal ? ind.actionsFaites / ind.actionsTotal : null}
                  centre={`${ind.actionsTotal ? Math.round((ind.actionsFaites / ind.actionsTotal) * 100) : 0}%`} libelle="Réalisées" />
                <Anneau taille={64} valeur={ind.tempsEcoule} centre={ind.tempsEcoule == null ? "—" : `${Math.round(ind.tempsEcoule * 100)}%`} libelle="Temps" ton="neutre" />
                <Anneau taille={64} valeur={conso} centre={conso == null ? "—" : `${Math.round(conso * 100)}%`} libelle="Budget" ton="bleu" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="cockpit-colonnes">
        <div><Agenda sansIndicateurs /></div>

        <div>
          <div className="sec">À reprendre ({rouvertes.length + proposees.length})</div>
          {rouvertes.length + proposees.length === 0 ? <div className="vide">Rien à reprendre.</div> : (
            <div className="liste">
              {[...rouvertes, ...proposees].map((a) => (
                <div className="item" key={a.id}>
                  <div className="corps">
                    <div className={`libelle${estAdmin ? " cliquable" : ""}`} onClick={() => estAdmin && setEditer(a)}>{a.libelle}</div>
                    <div className="meta"><PastilleProjet projet={projet(a.projet_id)} /><BadgesTicket a={a} /></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="sec">Déclarations CDINNOV</div>
          {etapes.length === 0 ? (
            <div className="vide">Aucune étape datée. Les dates limites se saisissent dans Finances, période par période.</div>
          ) : (
            <div className="liste">
              {etapes.map((e) => {
                const per = donnees.periodes.find((p) => p.id === e.periode_id);
                return (
                  <div className="item" key={e.id}>
                    <div className="corps">
                      <div className="libelle">{LIB_ETAPE[e.etape]} – P{per?.numero}</div>
                      <div className="meta">
                        <PastilleProjet projet={per ? projet(per.projet_id) : undefined} />
                        <span className={`badge${e.date_limite! < auj ? " rouge" : ""}`}>avant le {date(e.date_limite)}</span>
                        {e.responsable && <span>{e.responsable}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="sec">Secrétaire (scan des mails)</div>
          <div className="card" style={{ fontSize: 13.5 }}>
            {passage ? (
              <>Dernier scan le <b>{date(passage.debut)}</b>{passage.mails_lus != null ? ` · ${passage.mails_lus} mails lus` : ""}<br />
                {passage.actions_creees} créée(s) · {passage.actions_faites} cochée(s) · {passage.actions_rouvertes} rouverte(s)</>
            ) : <span className="muted">Aucun scan enregistré pour l’instant.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
