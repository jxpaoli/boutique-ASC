import { useMemo, useState } from "react";
import { useDonnees } from "../donnees";
import { date } from "../format";
import { FiltreProjets, PastilleProjet } from "../composants";
import { lienDossier, lienFichier } from "../onedrive";
import { usePreference } from "../preferences";
import type { DocumentProjet } from "../types";

const DOSSIERS: { code: string; libelle: string; icone: string }[] = [
  { code: "01-administratif", libelle: "Administratif", icone: "📁" },
  { code: "02-finances", libelle: "Finances", icone: "💶" },
  { code: "03-gouvernance", libelle: "Gouvernance", icone: "🏛️" },
  { code: "04-livrables", libelle: "Livrables", icone: "📦" },
  { code: "05-communication", libelle: "Communication", icone: "📣" },
  { code: "06-technique", libelle: "Technique", icone: "⚙️" },
  { code: "identite", libelle: "Identité", icone: "🎨" },
  { code: "pieces-jointes", libelle: "Pièces jointes", icone: "📎" },
];

const BOITE: { code: string; libelle: string; icone: string }[] = [
  { code: "commun/modeles", libelle: "Modèles", icone: "📝" },
  { code: "commun/logos", libelle: "Logos", icone: "🏷️" },
  { code: "commun/kit-programme", libelle: "Kit programme", icone: "🇪🇺" },
];

const ICONE_EXT: Record<string, string> = { pdf: "📕", doc: "📘", docx: "📘", xls: "📗", xlsx: "📗", ppt: "📙", pptx: "📙", png: "🖼️", jpg: "🖼️", jpeg: "🖼️", zip: "🗜️", msg: "✉️", eml: "✉️" };

function taille(o: number | null) {
  if (o == null) return "";
  if (o < 1024 * 1024) return `${Math.max(1, Math.round(o / 1024))} Ko`;
  return `${(o / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

// Recherche tolérante : sans accents, sans casse, tous les mots doivent apparaître.
const normaliser = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Documents() {
  const { donnees, projet, estAdmin } = useDonnees();
  const [filtre, setFiltre] = usePreference("docs.projet", "");
  const [recherche, setRecherche] = useState("");
  const base = donnees?.parametres.onedrive_base;

  const resultats = useMemo(() => {
    if (!donnees) return [] as DocumentProjet[];
    // Un nombre seul (« 3 ») doit être un nombre entier du nom : « CdP3 » oui, « CdP13 » ou « 03-gouvernance » non.
    const tests = normaliser(recherche).split(/\s+/).filter(Boolean).map((m) => /^\d+$/.test(m)
      ? (d: DocumentProjet) => new RegExp(`(^|\\D)0*${m}(\\D|$)`).test(normaliser(d.nom))
      : (d: DocumentProjet) => normaliser(`${d.nom} ${d.dossier}`).includes(m));
    // Pertinence : les mots collés dans le nom (« cdp 3 » → « CdP3 », « CdP-3 ») passent devant, puis le plus récent.
    const colle = normaliser(recherche).replace(/[^a-z0-9]/g, "");
    const score = (d: DocumentProjet) => (colle && normaliser(d.nom).replace(/[^a-z0-9]/g, "").includes(colle) ? 1 : 0);
    return donnees.documents
      .filter((d) => (!filtre || d.projet_id === filtre) && tests.every((t) => t(d)))
      .sort((a, b) => score(b) - score(a) || (b.modifie_le ?? "").localeCompare(a.modifie_le ?? ""));
  }, [donnees, filtre, recherche]);

  if (!donnees) return null;
  const projets = donnees.projets.filter((p) => p.actif && p.dossier);
  const affiches = recherche ? resultats : resultats.slice(0, 15);
  const indexeLe = donnees.parametres.documents_indexe_le;

  return (
    <>
      <div className="titre">Documents</div>
      <input className="recherche" type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un document (ex. annexe 4, PV CdP, D4.1.1)" aria-label="Rechercher un document" />
      <FiltreProjets projets={projets} valeur={filtre} onChange={setFiltre} />

      {!recherche && (filtre ? projets.filter((p) => p.id === filtre) : projets).map((p) => (
        <div key={p.id}>
          <div className="sec" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <PastilleProjet projet={p} />
            <a href={lienDossier(base, p.dossier!) ?? undefined} target="_blank" rel="noreferrer" style={{ textTransform: "none", letterSpacing: 0 }}>Ouvrir le dossier du projet</a>
          </div>
          <div className="tuiles-dossiers">
            {DOSSIERS.filter((d) => estAdmin || donnees.documents.some((x) => x.projet_id === p.id && x.dossier === d.code)).map((d) => {
              const n = donnees.documents.filter((x) => x.projet_id === p.id && x.dossier === d.code && x.present).length;
              return (
                <a key={d.code} className="tuile-dossier" href={lienDossier(base, `${p.dossier}/${d.code}`) ?? undefined} target="_blank" rel="noreferrer">
                  <span className="ico">{d.icone}</span>
                  <b>{d.libelle}</b>
                  <span className="muted">{n} doc{n > 1 ? "s" : ""}</span>
                </a>
              );
            })}
          </div>
        </div>
      ))}

      {!recherche && !filtre && (
        <>
          <div className="sec">Boîte à outils (commune)</div>
          <div className="tuiles-dossiers">
            {BOITE.map((d) => {
              const n = donnees.documents.filter((x) => x.dossier === d.code && x.present).length;
              return (
                <a key={d.code} className="tuile-dossier" href={lienDossier(base, `_commun/${d.code.slice(7)}`) ?? undefined} target="_blank" rel="noreferrer">
                  <span className="ico">{d.icone}</span>
                  <b>{d.libelle}</b>
                  <span className="muted">{n} doc{n > 1 ? "s" : ""}</span>
                </a>
              );
            })}
          </div>
        </>
      )}

      <div className="sec">{recherche ? `Résultats (${resultats.length})` : "Modifiés récemment"}</div>
      {affiches.length === 0 ? <div className="vide">Aucun document{recherche ? " ne correspond" : ""}.</div> : (
        <div className="liste">
          {affiches.map((d) => {
            const lien = d.present ? lienFichier(base, d.chemin, d.extension) : null;
            return (
              <a key={d.id} className={`item doc-item${d.present ? "" : " absent"}`} href={lien ?? undefined} target="_blank" rel="noreferrer">
                <span className="doc-ico">{ICONE_EXT[d.extension ?? ""] ?? "📄"}</span>
                <div className="corps">
                  <div className="libelle">{d.nom}</div>
                  <div className="meta">
                    {d.projet_id ? <PastilleProjet projet={projet(d.projet_id)} /> : <span className="badge bleu">Commun</span>}
                    <span>{d.dossier}</span>
                    {d.modifie_le && <span>· {date(d.modifie_le)}</span>}
                    {d.taille != null && <span>· {taille(d.taille)}</span>}
                    {!d.present && <span className="badge rouge">introuvable (déplacé ou supprimé)</span>}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Index du {indexeLe ? date(indexeLe) + " à " + indexeLe.slice(11, 16) : "—"}. Les fichiers restent dans OneDrive : l’ouverture dépend de tes droits OneDrive.
      </p>
    </>
  );
}
