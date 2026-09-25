import { useMemo, useState, type FormEvent } from "react";
import { useDonnees } from "./donnees";
import { date, LIB_PRIORITE, LIB_STATUT_ACTION } from "./format";
import { libQui } from "./composants";
import { MON_NOM } from "./preferences";
import type { Action, Evenement, Priorite, StatutAction } from "./types";

// Fiche d'une action en panneau (bas d'écran sur téléphone) : création rapide ou modification. Admin seulement.
export default function FicheAction() {
  const { donnees, editer, setEditer, enregistrerAction, supprimerAction } = useDonnees();
  if (!donnees || !editer) return null;
  return <Formulaire key={editer === "nouvelle" ? "nouvelle" : editer.id} action={editer === "nouvelle" ? null : editer}
    fermer={() => setEditer(null)} enregistrer={enregistrerAction} supprimer={supprimerAction} />;
}

function Formulaire({ action, fermer, enregistrer, supprimer }: {
  action: Action | null;
  fermer: () => void;
  enregistrer: ReturnType<typeof useDonnees>["enregistrerAction"];
  supprimer: ReturnType<typeof useDonnees>["supprimerAction"];
}) {
  const { donnees } = useDonnees();
  const projets = donnees!.projets.filter((p) => p.actif);
  const dernierProjet = (() => { try { return JSON.parse(localStorage.getItem("europa.agenda.projet") ?? '""') as string; } catch { return ""; } })();

  const [projetId, setProjetId] = useState(action?.projet_id ?? (projets.some((p) => p.id === dernierProjet) ? dernierProjet : projets[0]?.id ?? ""));
  const [libelle, setLibelle] = useState(action?.libelle ?? "");
  const [echeance, setEcheance] = useState(action?.echeance ?? "");
  const [responsable, setResponsable] = useState(action ? action.responsable ?? "" : MON_NOM);
  const [statut, setStatut] = useState<StatutAction>(action?.statut ?? "a_faire");
  const [priorite, setPriorite] = useState<Priorite>(action?.priorite ?? "normale");
  const [notes, setNotes] = useState(action?.notes ?? "");
  const [source, setSource] = useState(action?.source ?? "");
  const [plus, setPlus] = useState(!!action);
  const [err, setErr] = useState("");
  const [occupe, setOccupe] = useState(false);

  const responsables = useMemo(
    () => [...new Set([MON_NOM, ...donnees!.actions.map((a) => a.responsable).filter((r): r is string => !!r)])].sort((a, b) => a.localeCompare(b, "fr")),
    [donnees],
  );

  const valider = async (e: FormEvent) => {
    e.preventDefault();
    if (!libelle.trim() || !projetId) { setErr("Projet et libellé obligatoires."); return; }
    setOccupe(true);
    const message = await enregistrer({
      ...(action ? { id: action.id, updated_at: action.updated_at } : {}),
      projet_id: projetId,
      libelle: libelle.trim(),
      echeance: echeance || null,
      responsable: responsable.trim() || null,
      statut,
      priorite,
      notes: notes.trim() || null,
      source: source.trim() || null,
    });
    setOccupe(false);
    if (message) setErr(message); else fermer();
  };

  const effacer = async () => {
    if (!action || !confirm("Supprimer définitivement cette action ?")) return;
    setOccupe(true);
    const message = await supprimer(action.id);
    setOccupe(false);
    if (message) setErr(message); else fermer();
  };

  return (
    <div className="voile" onClick={fermer}>
      <form className="panneau" onClick={(e) => e.stopPropagation()} onSubmit={valider}>
        <div className="panneau-tete">
          <b>{action ? "Modifier l’action" : "Nouvelle action"}</b>
          <button type="button" className="btn-lien" onClick={fermer}>Fermer</button>
        </div>

        <label>Projet</label>
        <div className="chips">
          {projets.map((p) => (
            <button type="button" key={p.id} className={`chip${projetId === p.id ? " on" : ""}`} onClick={() => setProjetId(p.id)}>{p.acronyme}</button>
          ))}
        </div>

        <label htmlFor="fa-libelle">Action</label>
        <textarea id="fa-libelle" rows={2} value={libelle} onChange={(e) => setLibelle(e.target.value)} autoFocus={!action} placeholder="Ex. Relancer MFI pour le devis" />

        <div className="grille2">
          <div>
            <label htmlFor="fa-echeance">Échéance</label>
            <input id="fa-echeance" type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
          </div>
          <div>
            <label htmlFor="fa-statut">Statut</label>
            <select id="fa-statut" value={statut} onChange={(e) => setStatut(e.target.value as StatutAction)}>
              {Object.entries(LIB_STATUT_ACTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        {!plus && <button type="button" className="btn-lien" style={{ marginTop: 12 }} onClick={() => setPlus(true)}>+ Responsable, priorité, notes…</button>}
        {plus && (
          <>
            <label htmlFor="fa-resp">Responsable</label>
            <input id="fa-resp" list="fa-resp-liste" value={responsable} onChange={(e) => setResponsable(e.target.value)} />
            <datalist id="fa-resp-liste">{responsables.map((r) => <option key={r} value={r} />)}</datalist>

            <label>Priorité</label>
            <div className="chips">
              {(Object.keys(LIB_PRIORITE) as Priorite[]).map((k) => (
                <button type="button" key={k} className={`chip${priorite === k ? " on" : ""}`} onClick={() => setPriorite(k)}>{LIB_PRIORITE[k]}</button>
              ))}
            </div>

            <label htmlFor="fa-notes">Notes</label>
            <textarea id="fa-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

            <label htmlFor="fa-source">Source (mail, réunion…)</label>
            <input id="fa-source" value={source} onChange={(e) => setSource(e.target.value)} />
          </>
        )}

        {err && <div className="login-err">{err}</div>}
        <button type="submit" className="btn-primary" disabled={occupe}>{occupe ? "Enregistrement…" : "Enregistrer"}</button>
        {action && <Historique action={action} />}
        {action && <button type="button" className="btn danger" style={{ width: "100%", marginTop: 16 }} onClick={effacer} disabled={occupe}>Supprimer l’action</button>}
      </form>
    </div>
  );
}

// Fil de l'action, façon ticket : qui a fait quoi, quand, sur quelle source ; commentaire rapide.
function Historique({ action }: { action: Action }) {
  const { donnees, commenter } = useDonnees();
  const [texte, setTexte] = useState("");
  const [err, setErr] = useState("");
  const fil = donnees!.evenements.filter((e) => e.action_id === action.id);

  const envoyer = async () => {
    if (!texte.trim()) return;
    const message = await commenter(action.id, texte.trim());
    if (message) setErr(message); else { setTexte(""); setErr(""); }
  };

  const libelle = (e: Evenement) => {
    if (e.type === "creation") return "Créée";
    if (e.type === "commentaire") return "Commentaire";
    if (e.type === "modification") return e.message ?? "Modifiée";
    if (e.statut_apres === "fait") return "✓ Fait";
    if (e.statut_avant === "fait") return "🔄 Rouverte";
    return `→ ${LIB_STATUT_ACTION[e.statut_apres ?? "a_faire"]}`;
  };

  return (
    <div className="fil">
      <label>Historique</label>
      <ol>
        {fil.map((e) => (
          <li key={e.id} className={`fil-${e.type}${e.statut_avant === "fait" && e.statut_apres !== "fait" ? " rouv" : ""}`}>
            <div><b>{libelle(e)}</b> · {libQui(e.qui_role)} · <span className="muted">{date(e.quand)}</span></div>
            {e.type === "commentaire" && e.message && <div>{e.message}</div>}
            {e.source && e.source !== "saisie" && <div className="muted">Source : {e.source}{e.date_source ? ` (${date(e.date_source)})` : ""}</div>}
          </li>
        ))}
      </ol>
      <div className="fil-saisie">
        <input value={texte} onChange={(ev) => setTexte(ev.target.value)} placeholder="Ajouter un commentaire…"
          onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); void envoyer(); } }} />
        <button type="button" className="btn plein" onClick={() => void envoyer()}>Ajouter</button>
      </div>
      {err && <div className="login-err">{err}</div>}
    </div>
  );
}
