import { useNavigate } from "react-router-dom";
import { usePreinscriptions, deletePreinscription, addJoueur, useJoueurs, useConfig } from "../data";
import Icon from "../Icon";
import type { Joueur, PackArticle, Preinscription } from "../types";

export default function Preinscriptions() {
  const list = usePreinscriptions();
  const joueurs = useJoueurs();
  const cfg = useConfig();
  const nav = useNavigate();
  if (!list || !cfg) return <div className="muted" style={{ padding: 20 }}>Chargement…</div>;

  const valider = async (p: Preinscription) => {
    const dbl = (joueurs || []).find((j) =>
      j.nom.trim().toLowerCase() === p.nom.trim().toLowerCase() &&
      j.prenom.trim().toLowerCase() === p.prenom.trim().toLowerCase());
    if (dbl && !confirm("Attention : " + dbl.nom + " " + dbl.prenom + " (" + (dbl.categorie || "?") + ") existe déjà dans les joueurs.\nCréer quand même un doublon ?")) return;
    // articles en « différé » : la remise réelle (et le décrément du stock) se fait sur la fiche
    const articles: PackArticle[] = (p.articles || []).map((a) => ({ article: a.article, taille: a.taille, statut: "differe" }));
    const joueur: Omit<Joueur, "id"> = {
      categorie: p.categorie, gardien: p.gardien, licence: cfg.licences.find((l) => l.defaut)?.code || cfg.licences[0]?.code || "",
      nom: p.nom, prenom: p.prenom, annee: p.annee, tel: p.tel,
      articles, remises: [], reglement: "", cheques: [], regOk: false, regDate: "", commentaires: "",
    };
    const ref = await addJoueur(joueur);
    await deletePreinscription(p.id);
    nav("/joueur/" + ref.id, { state: { deplie: true } });
  };

  return (
    <>
      <h2 style={{ margin: "4px 0 12px" }}>Pré-inscriptions à valider</h2>
      {list.length === 0 && <div className="card muted">Aucune pré-inscription en attente.</div>}
      {list
        .slice()
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        .map((p) => (
          <div key={p.id} className="card">
            <div style={{ fontSize: 16 }}><b>{p.nom}</b> {p.prenom} {p.gardien && <Icon name="shield" size={14} className="ico-svg" />}</div>
            <div className="muted" style={{ fontSize: 13, margin: "2px 0 8px" }}>
              {p.categorie || "—"} · né(e) {p.annee || "?"} · {p.tel || "sans tél."} · {(p.articles || []).length} article(s)
            </div>
            <div className="muted" style={{ fontSize: 12 }}>{(p.articles || []).map((a) => a.article + (a.taille ? " (" + a.taille + ")" : "")).join(", ")}</div>
            <div className="aa-foot" style={{ marginTop: 10 }}>
              <button className="btn-primary icobtn" style={{ width: "auto", marginTop: 0, padding: "10px 16px", flex: 1 }} onClick={() => void valider(p)}><Icon name="check" size={16} className="ico-svg" /> Valider</button>
              <button className="lnk-danger" onClick={() => { if (confirm("Ignorer cette demande ?")) void deletePreinscription(p.id); }}>Supprimer</button>
            </div>
          </div>
        ))}
    </>
  );
}
