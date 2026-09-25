import { useMemo, useState } from "react";
import { useDonnees } from "../donnees";
import { aujourdhui, date, LIB_STATUT_ACTION } from "../format";
import { BadgesTicket, BlocDate, CaseFait, FiltreProjets, PastilleProjet } from "../composants";
import type { Action } from "../types";

export default function Actions() {
  const { donnees, projet, estAdmin, cocherAction, setEditer } = useDonnees();
  const [filtre, setFiltre] = useState("");
  const [responsable, setResponsable] = useState("");
  const [voirFaites, setVoirFaites] = useState(false);
  // Une action cochée reste visible à sa place jusqu'au prochain changement d'écran : on peut la décocher.
  const [cocheesIci, setCocheesIci] = useState<Set<string>>(new Set());
  const auj = aujourdhui();

  const responsables = useMemo(
    () => [...new Set((donnees?.actions ?? []).map((a) => a.responsable).filter((r): r is string => !!r))].sort((a, b) => a.localeCompare(b, "fr")),
    [donnees],
  );

  if (!donnees) return null;
  const selection = donnees.actions.filter((a) =>
    (!filtre || a.projet_id === filtre) && (!responsable || a.responsable === responsable));
  const ouverte = (a: Action) => a.statut === "a_faire" || a.statut === "en_cours" || cocheesIci.has(a.id);
  const ouvertes = selection.filter(ouverte);
  const enRetard = ouvertes.filter((a) => a.echeance && a.echeance < auj);
  const aVenir = ouvertes.filter((a) => !a.echeance || a.echeance >= auj);
  const faites = selection.filter((a) => !ouverte(a));

  const cocher = (a: Action) => {
    if (a.statut !== "fait") setCocheesIci((s) => new Set(s).add(a.id));
    void cocherAction(a);
  };

  const ligne = (a: Action, retard = false) => (
    <div className={`item${a.statut === "fait" ? " fait" : ""}`} key={a.id}>
      {estAdmin && a.statut !== "abandonne" && <CaseFait fait={a.statut === "fait"} onClick={() => cocher(a)} />}
      <BlocDate iso={a.echeance} retard={retard && a.statut !== "fait"} />
      <div className="corps">
        {estAdmin
          ? <div className="libelle cliquable" onClick={() => setEditer(a)}>{a.libelle}</div>
          : <div className="libelle">{a.libelle}</div>}
        <div className="meta">
          <PastilleProjet projet={projet(a.projet_id)} />
          {a.priorite === "haute" && a.statut !== "fait" && <span className="badge rouge">Priorité haute</span>}
          {a.statut !== "fait" && <span className={`badge${a.statut === "en_cours" ? " orange" : ""}`}>{LIB_STATUT_ACTION[a.statut]}</span>}
          <BadgesTicket a={a} />
          {a.responsable && <span>{a.responsable}</span>}
          {a.source && <span>· {a.source}</span>}
        </div>
        {a.notes && <div className="meta">{a.notes}</div>}
      </div>
    </div>
  );

  return (
    <>
      <div className="titre">Actions</div>
      <FiltreProjets projets={donnees.projets.filter((p) => p.actif)} valeur={filtre} onChange={setFiltre} />
      <div className="filtres">
        <select value={responsable} onChange={(e) => setResponsable(e.target.value)} aria-label="Responsable">
          <option value="">Tous les responsables</option>
          {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="sec">En retard ({enRetard.filter((a) => a.statut !== "fait").length})</div>
      {enRetard.length ? <div className="liste">{enRetard.map((a) => ligne(a, true))}</div> : <div className="vide">Aucune action en retard.</div>}

      <div className="sec">À venir ({aVenir.filter((a) => a.statut !== "fait").length})</div>
      {aVenir.length ? <div className="liste">{aVenir.map((a) => ligne(a))}</div> : <div className="vide">Aucune action à venir.</div>}

      <div className="sec">Terminées ({faites.length})</div>
      {voirFaites
        ? <div className="liste">{faites.map((a) => ligne(a))}</div>
        : <button className="btn-lien" onClick={() => setVoirFaites(true)}>Afficher les actions terminées</button>}
      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>Au {date(auj)}.</p>
    </>
  );
}
