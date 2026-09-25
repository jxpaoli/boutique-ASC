import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useDonnees } from "../donnees";
import { date, LIB_TYPE_ECHEANCE } from "../format";
import { BadgesTicket, BlocDate, CaseFait, LienDoc, PastilleProjet } from "../composants";
import { lienFichier } from "../onedrive";
import { documentsDeReunion, heure, lienGps } from "../reunions";
import { useEcranLarge } from "../indicateurs";
import type { Action, CategorieInfo, Echeance, ReunionPoint } from "../types";

const CATEGORIES: { code: CategorieInfo; libelle: string; icone: string }[] = [
  { code: "transport", libelle: "Transport", icone: "✈️" },
  { code: "hebergement", libelle: "Hébergement", icone: "🏨" },
  { code: "repas", libelle: "Repas", icone: "🍽️" },
  { code: "acces", libelle: "Accès", icone: "🚪" },
  { code: "contact", libelle: "Contacts sur place", icone: "📞" },
  { code: "autre", libelle: "Autres rendez-vous", icone: "📌" },
];

const LIB_GENRE = { preparation: "📋 Dossier de préparation", ordre_du_jour: "🗓 Ordre du jour", pv: "📝 PV / compte rendu", autre: "📎 Document" } as const;
const FORMAT = { presentiel: "Présentiel", hybride: "Hybride", distanciel: "À distance", ecrit: "Procédure écrite" } as const;

export default function FicheReunion({ seance = false }: { seance?: boolean }) {
  const { id } = useParams();
  const { donnees, projet } = useDonnees();
  const large = useEcranLarge();
  const e = donnees?.echeances.find((x) => x.id === id);
  if (!donnees) return null;
  if (!e) return <div className="vide">Réunion introuvable. <Link to="/reunions">Retour</Link></div>;

  const p = projet(e.projet_id);
  const infos = donnees.infos.filter((i) => i.echeance_id === e.id);
  const points = donnees.points.filter((x) => x.echeance_id === e.id);
  const docs = documentsDeReunion(e, donnees.documents);
  const base = donnees.parametres.onedrive_base;

  const entete = (
    <div className="reunion-tete">
      <Link to="/reunions" className="btn-lien">← Réunions</Link>
      <div className="reunion-titre">
        <BlocDate iso={e.date} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{e.libelle}</div>
          <div className="meta">
            <PastilleProjet projet={p} />
            <span className="badge">{LIB_TYPE_ECHEANCE[e.type]}</span>
            <span>{date(e.date)}{e.heure_debut ? ` · ${heure(e.heure_debut)}` : ""}{e.heure_fin ? `–${heure(e.heure_fin)}` : ""}</span>
            {e.format && <span className="badge bleu">{FORMAT[e.format]}</span>}
          </div>
        </div>
      </div>
      {large && !seance && <Link to={`/reunions/${e.id}/seance`} className="btn plein" style={{ textDecoration: "none" }}>▶ Mode séance</Link>}
      {seance && <Link to={`/reunions/${e.id}`} className="btn" style={{ textDecoration: "none" }}>Quitter la séance</Link>}
    </div>
  );

  const lieu = (e.lieu_nom || e.lieu || e.adresse || e.lien_visio) && (
    <div className="card lieu">
      {(e.lieu_nom || e.lieu) && <div><b>📍 {e.lieu_nom || e.lieu}</b></div>}
      {e.adresse && <a href={lienGps(e.adresse)} target="_blank" rel="noreferrer">{e.adresse} · <b>Itinéraire</b></a>}
      {e.lien_visio && <div><a href={e.lien_visio} target="_blank" rel="noreferrer">💻 Rejoindre la visio</a></div>}
    </div>
  );

  const documents = (
    <>
      <div className="sec">Documents</div>
      {docs.length === 0 ? <div className="vide">Aucun document rattaché (dossier de préparation, ordre du jour, PV).</div> : (
        <div className="liste">
          {docs.map(({ doc, genre }) => (
            <div className="item" key={doc.id}>
              <div className="corps">
                <div className="libelle">{LIB_GENRE[genre]}</div>
                <div className="meta"><LienDoc href={lienFichier(base, doc.chemin, doc.extension)}>{doc.nom}</LienDoc></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (seance) {
    return (
      <div className="seance">
        {entete}
        <div className="seance-colonnes">
          <OrdreDuJour points={points} />
          <div>
            <ActionsReunion e={e} />
            {documents}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fiche-reunion">
      {entete}
      {lieu}
      {CATEGORIES.map((c) => {
        const liste = infos.filter((i) => i.categorie === c.code);
        if (!liste.length) return null;
        return (
          <div key={c.code}>
            <div className="sec">{c.icone} {c.libelle}</div>
            <div className="liste">
              {liste.map((i) => (
                <div className="item info" key={i.id}>
                  <div className="corps">
                    <div className="libelle">{i.titre}</div>
                    {i.quand && <div className="quand">{i.quand}</div>}
                    {i.detail && <div className="meta" style={{ whiteSpace: "pre-line" }}>{i.detail}</div>}
                    <div className="meta">
                      {i.adresse && <a href={lienGps(i.adresse)} target="_blank" rel="noreferrer">📍 {i.adresse}</a>}
                      {i.telephone && <a href={`tel:${i.telephone.replace(/[^\d+]/g, "")}`}>📞 {i.telephone}</a>}
                      {i.lien && <a href={i.lien} target="_blank" rel="noreferrer">🔗 Lien</a>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {points.length > 0 && (
        <>
          <div className="sec">🗓 Ordre du jour</div>
          <ol className="odj">
            {points.map((pt) => <li key={pt.id}>{pt.titre}{pt.intervenant ? <span className="muted"> – {pt.intervenant}</span> : null}</li>)}
          </ol>
        </>
      )}
      <ActionsReunion e={e} />
      {documents}
    </div>
  );
}

// Actions rattachées à la réunion : préparation et décisions ; cochables, ajout rapide.
function ActionsReunion({ e }: { e: Echeance }) {
  const { donnees, estAdmin, cocherAction, enregistrerAction, setEditer } = useDonnees();
  const [texte, setTexte] = useState("");
  const [echeance, setEcheance] = useState("");
  const [err, setErr] = useState("");
  const actions = donnees!.actions.filter((a) => a.echeance_id === e.id && a.statut !== "abandonne");

  const ajouter = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!texte.trim()) return;
    const m = await enregistrerAction({ projet_id: e.projet_id, libelle: texte.trim(), echeance_id: e.id, echeance: echeance || null, source: e.libelle });
    if (m) setErr(m); else { setTexte(""); setEcheance(""); setErr(""); }
  };

  const ligne = (a: Action) => (
    <div className={`item${a.statut === "fait" ? " fait" : ""}`} key={a.id}>
      {estAdmin && <CaseFait fait={a.statut === "fait"} onClick={() => void cocherAction(a)} />}
      <div className="corps">
        <div className={`libelle${estAdmin ? " cliquable" : ""}`} onClick={() => estAdmin && setEditer(a)}>{a.libelle}</div>
        <div className="meta">
          {a.echeance && <span>avant le {date(a.echeance)}</span>}
          {a.responsable && <span>{a.responsable}</span>}
          <BadgesTicket a={a} />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="sec">☑️ À faire ({actions.filter((a) => a.statut !== "fait").length})</div>
      {actions.length ? <div className="liste">{actions.map(ligne)}</div> : <div className="vide">Aucune action liée à cette réunion.</div>}
      {estAdmin && (
        <form className="ajout-rapide" onSubmit={ajouter}>
          <input value={texte} onChange={(ev) => setTexte(ev.target.value)} placeholder="Nouvelle action ou décision…" />
          <input type="date" value={echeance} onChange={(ev) => setEcheance(ev.target.value)} aria-label="Échéance" />
          <button className="btn plein" type="submit">Ajouter</button>
        </form>
      )}
      {err && <div className="login-err">{err}</div>}
    </>
  );
}

// Mode séance : points de l'ordre du jour, point en cours, notes enregistrées au fil de la frappe.
function OrdreDuJour({ points }: { points: ReunionPoint[] }) {
  const { estAdmin, majPoint } = useDonnees();
  const enCours = points.find((p) => p.statut === "en_cours");

  const activer = async (pt: ReunionPoint) => {
    if (!estAdmin) return;
    if (enCours && enCours.id !== pt.id) await majPoint(enCours.id, { statut: "traite" });
    await majPoint(pt.id, { statut: "en_cours" });
  };
  const suivant = async () => {
    const i = points.findIndex((p) => p.id === enCours?.id);
    const prochain = points[i + 1] ?? null;
    if (enCours) await majPoint(enCours.id, { statut: "traite" });
    if (prochain) await majPoint(prochain.id, { statut: "en_cours" });
  };

  if (!points.length) return <div className="vide">Pas d’ordre du jour saisi pour cette réunion.</div>;
  return (
    <div>
      <div className="sec" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Ordre du jour</span>
        {estAdmin && <button className="btn plein" onClick={() => void suivant()}>{enCours ? "Point suivant ▶" : "Commencer ▶"}</button>}
      </div>
      <div className="liste">
        {points.map((pt, i) => (
          <div key={pt.id} className={`point ${pt.statut}`}>
            <div className="point-tete" onClick={() => void activer(pt)}>
              <span className="point-num">{pt.statut === "traite" ? "✓" : i + 1}</span>
              <b>{pt.titre}</b>
              {pt.intervenant && <span className="muted"> – {pt.intervenant}</span>}
            </div>
            {(pt.statut === "en_cours" || pt.notes) && <Notes point={pt} lectureSeule={!estAdmin} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function Notes({ point, lectureSeule }: { point: ReunionPoint; lectureSeule: boolean }) {
  const { majPoint } = useDonnees();
  const [texte, setTexte] = useState(point.notes ?? "");
  const [etat, setEtat] = useState<"" | "…" | "✓ enregistré" | "⚠ non enregistré">("");
  const minuterie = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(minuterie.current), []);

  const changer = (v: string) => {
    setTexte(v);
    setEtat("…");
    window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(async () => {
      const m = await majPoint(point.id, { notes: v });
      setEtat(m ? "⚠ non enregistré" : "✓ enregistré");
    }, 800);
  };

  if (lectureSeule) return point.notes ? <div className="notes-lecture">{point.notes}</div> : null;
  return (
    <div className="notes">
      <textarea rows={point.statut === "en_cours" ? 6 : 3} value={texte} onChange={(ev) => changer(ev.target.value)}
        placeholder="Notes, décisions, qui a dit quoi…" autoFocus={point.statut === "en_cours"} />
      <span className="muted notes-etat">{etat}</span>
    </div>
  );
}
