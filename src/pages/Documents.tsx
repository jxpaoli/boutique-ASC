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
    const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
    return donnees.documents
      .filter((d) => (!filtre || d.projet_id === filtre) && (mots.length === 0 || mots.every((m) => normaliser(`${d.nom} ${d.dossier}`).includes(m))))
      .sort((a, b) => (b.modifie_le ?? "").localeCompare(a.modifie_le ?? ""));
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
                    <PastilleProjet projet={d.projet_id ? projet(d.projet_id) : undefined} />
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
