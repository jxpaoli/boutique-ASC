import { useState } from "react";
import { useConfig, patchConfig, setStockItem, useRoles, setUserRole, removeUserRole, creerCompte, resetUserPassword, exportBase, importBase, nouvelleSaison } from "../data";
import { calc } from "../calc";
import Icon from "../Icon";
import type { Config, Role, Joueur } from "../types";

function download(name: string, content: string, type: string) {
  const b = new Blob([content], { type }); const u = URL.createObjectURL(b);
  const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u);
}

export default function Parametres() {
  const cfg = useConfig();
  const roles = useRoles();
  const [draft, setDraft] = useState<Config | null>(null);
  const [packCat, setPackCat] = useState("");
  const [newMail, setNewMail] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newRole, setNewRole] = useState<Role>("user");
  const [saisonSuivante, setSaisonSuivante] = useState("");
  const [seuilTout, setSeuilTout] = useState(5);
  const [busy, setBusy] = useState("");

  const exporterJSON = async () => {
    setBusy("Export…"); const d = await exportBase();
    download("boutique-sauvegarde-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(d, null, 2), "application/json");
    setBusy("");
  };
  const exporterCSV = async () => {
    if (!draft) return;
    setBusy("Export…"); const d = await exportBase();
    const cf = (d.config || draft) as Config;
    const head = ["Nom", "Prénom", "Catégorie", "Gardien", "Licence", "Règlement", "Total", "Payé", "Reste", "Articles remis", "Articles différés"];
    const rows = (d.joueurs as unknown as Joueur[]).map((p) => { const c = calc(p, cf); const remis = (p.articles || []).filter((a) => a.statut === "remis").length; const diff = (p.articles || []).length - remis; return [p.nom, p.prenom, p.categorie, p.gardien ? "OUI" : "NON", p.licence, p.reglement, c.total, c.paye, c.reste, remis, diff]; });
    const csv = [head, ...rows].map((r) => r.map((v) => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(";")).join("\r\n");
    download("joueurs-" + draft.saison + ".csv", "﻿" + csv, "text/csv"); setBusy("");
  };
  const importer = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!confirm("Importer cette sauvegarde ?\nLes données du fichier écrasent/complètent la base actuelle.")) return;
      setBusy("Import…"); await importBase(data); setBusy(""); alert("Sauvegarde importée ✔");
    } catch { setBusy(""); alert("Fichier invalide."); }
  };
  const resetSaison = async () => {
    const s = saisonSuivante.trim();
    if (!s) { alert("Indique le nom de la nouvelle saison (ex. 2026-2027)."); return; }
    if (prompt("IRRÉVERSIBLE : efface tous les joueurs, chèques, commandes.\nUne sauvegarde JSON sera téléchargée automatiquement avant.\n\nTape NOUVELLE SAISON pour confirmer :") !== "NOUVELLE SAISON") return;
    // filet de sécurité : on télécharge la sauvegarde complète AVANT d'effacer
    setBusy("Sauvegarde…");
    const d = await exportBase();
    download("boutique-sauvegarde-avant-" + s + "-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(d, null, 2), "application/json");
    setBusy("Nouvelle saison…"); await nouvelleSaison(s); setBusy(""); alert("Nouvelle saison « " + s + " » — base repartie propre ✔\n(La sauvegarde de l'ancienne saison est dans tes téléchargements.)");
  };

  const creer = async () => {
    const mail = newMail.trim();
    if (!mail || newPwd.length < 8) { alert("Il faut un e-mail et un mot de passe d'au moins 8 caractères."); return; }
    try {
      const result = await creerCompte(mail, newPwd, newRole);
      setNewMail(""); setNewPwd("");
      alert(result.existing
        ? "Ce compte existait déjà dans Supabase : l’accès à Boutique ASC a été ajouté sans modifier son mot de passe."
        : "Compte créé ✔ La personne peut se connecter avec cet e-mail et ce mot de passe.");
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
      const message = e instanceof Error ? e.message : "Création impossible.";
      alert(code.includes("email-already-in-use") ? "Cet e-mail a déjà un compte." :
        code.includes("invalid-email") ? "E-mail invalide." :
        code.includes("weak-password") ? "Mot de passe trop court (6 caractères min)." :
        message);
    }
  };

  const changerMotDePasse = async (email: string) => {
    const password = prompt("Nouveau mot de passe pour " + email + " (8 caractères minimum) :");
    if (!password) return;
    if (password.length < 8) { alert("8 caractères minimum."); return; }
    if (!confirm("Ce compte Supabase peut servir dans plusieurs applications. Le nouveau mot de passe sera valable partout. Continuer ?")) return;
    try {
      await resetUserPassword(email, password);
      alert("Mot de passe modifié ✔");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Modification impossible.");
    }
  };

  if (cfg && draft === null) {
    setDraft(JSON.parse(JSON.stringify(cfg)));
    setPackCat(cfg.categories[0] || "");
  }
  if (!cfg || !draft) return <div className="muted" style={{ padding: 20 }}>Chargement…</div>;

  const upd = (patch: Partial<Config>) => setDraft({ ...draft, ...patch });
  const cat = packCat && draft.categories.includes(packCat) ? packCat : draft.categories[0] || "";
  const articles = draft.catalogue.map((c) => c.nom).filter((n) => n !== draft.reglesMetier.articleSac);
  const taillesCatalogue = [...new Set(draft.catalogue.flatMap((c) => c.tailles))];
  const roleLabel = (role: Role) => draft.reglesMetier.libellesRoles[role] || role;

  const togglePack = (which: "packs" | "packsGardien", art: string) => {
    const map = which === "packs" ? draft.packs : draft.packsGardien;
    const set = new Set(map[cat] || []);
    if (set.has(art)) set.delete(art);
    else set.add(art);
    const ordered = draft.catalogue.map((c) => c.nom).filter((n) => set.has(n));
    upd({ [which]: { ...map, [cat]: ordered } } as Partial<Config>);
  };

  // remises
  const setRemise = (i: number, k: "nom" | "montant", v: string) =>
    upd({ remises: draft.remises.map((r, j) => (j === i ? { ...r, [k]: k === "montant" ? (Number(v) || 0) : v } : r)) });
  const addRemise = () => upd({ remises: [...draft.remises, { nom: "", montant: 0 }] });
  const delRemise = (i: number) => upd({ remises: draft.remises.filter((_, j) => j !== i) });

  // catégories
  const setCat = (i: number, v: string) => {
    const ancien = draft.categories[i];
    const renommeCle = (map: Record<string, string[]>) => { const next = { ...map }; if (ancien !== v && ancien in next) { next[v] = next[ancien]; delete next[ancien]; } return next; };
    upd({
      categories: draft.categories.map((c, j) => (j === i ? v : c)),
      packs: renommeCle(draft.packs), packsGardien: renommeCle(draft.packsGardien),
      licences: draft.licences.map((l) => ({ ...l, categoriesAutorisees: l.categoriesAutorisees.map((c) => c === ancien ? v : c) })),
      reglesMetier: { ...draft.reglesMetier, categoriesAge: draft.reglesMetier.categoriesAge.map((r) => r.categorie === ancien ? { ...r, categorie: v } : r) },
    });
  };
  const addCat = () => upd({ categories: [...draft.categories, ""] });
  const delCat = (i: number) => {
    const nom = draft.categories[i]; const packs = { ...draft.packs }; const packsGardien = { ...draft.packsGardien }; delete packs[nom]; delete packsGardien[nom];
    upd({
      categories: draft.categories.filter((_, j) => j !== i), packs, packsGardien,
      licences: draft.licences.map((l) => ({ ...l, categoriesAutorisees: l.categoriesAutorisees.filter((c) => c !== nom) })),
      reglesMetier: { ...draft.reglesMetier, categoriesAge: draft.reglesMetier.categoriesAge.filter((r) => r.categorie !== nom) },
    });
  };

  // catalogue
  const setArticleNom = (i: number, nom: string) => {
    const ancien = draft.catalogue[i].nom;
    const remplace = (map: Record<string, string[]>) => Object.fromEntries(Object.entries(map).map(([categorie, liste]) => [categorie, liste.map((a) => a === ancien ? nom : a)]));
    upd({
      catalogue: draft.catalogue.map((a, j) => j === i ? { ...a, nom } : a),
      packs: remplace(draft.packs), packsGardien: remplace(draft.packsGardien),
      reglesMetier: { ...draft.reglesMetier, articleSac: draft.reglesMetier.articleSac === ancien ? nom : draft.reglesMetier.articleSac },
    });
  };
  const delArticle = (i: number) => {
    const nom = draft.catalogue[i].nom;
    const catalogue = draft.catalogue.filter((_, j) => j !== i);
    const retire = (map: Record<string, string[]>) => Object.fromEntries(Object.entries(map).map(([categorie, liste]) => [categorie, liste.filter((a) => a !== nom)]));
    const reglesMetier = draft.reglesMetier.articleSac === nom
      ? { ...draft.reglesMetier, articleSac: catalogue[0]?.nom || "", tailleSac: catalogue[0]?.tailles[0] || "" }
      : draft.reglesMetier;
    upd({ catalogue, packs: retire(draft.packs), packsGardien: retire(draft.packsGardien), reglesMetier });
  };

  // règlements
  const setReg = (i: number, v: string) => {
    const ancien = draft.reglements[i];
    const cheques = { ...draft.reglesMetier.chequesParReglement };
    if (ancien !== v) { cheques[v] = cheques[ancien] || 0; delete cheques[ancien]; }
    upd({
      reglements: draft.reglements.map((c, j) => (j === i ? v : c)),
      reglesMetier: { ...draft.reglesMetier, chequesParReglement: cheques, reglementNonRegle: draft.reglesMetier.reglementNonRegle === ancien ? v : draft.reglesMetier.reglementNonRegle },
    });
  };
  const addReg = () => upd({ reglements: [...draft.reglements, ""] });
  const delReg = (i: number) => {
    const nom = draft.reglements[i]; const cheques = { ...draft.reglesMetier.chequesParReglement }; delete cheques[nom];
    upd({ reglements: draft.reglements.filter((_, j) => j !== i), reglesMetier: { ...draft.reglesMetier, chequesParReglement: cheques } });
  };

  const enregistrer = async () => {
    await patchConfig({
      saison: draft.saison,
      remises: draft.remises.filter((r) => r.nom.trim()),
      categories: draft.categories.map((c) => c.trim()).filter(Boolean),
      reglements: draft.reglements.map((c) => c.trim()).filter(Boolean),
      catalogue: draft.catalogue.filter((a) => a.nom.trim()).map((a) => ({ ...a, nom: a.nom.trim(), tailles: a.tailles.map((t) => t.trim()).filter(Boolean) })),
      packs: draft.packs,
      packsGardien: draft.packsGardien,
      licences: draft.licences.filter((l) => l.code.trim()).map((l) => ({ ...l, code: l.code.trim(), label: l.label.trim() || l.code.trim() })),
      reglesMetier: draft.reglesMetier,
      tarifs: Object.fromEntries(draft.licences.filter((l) => l.code.trim()).map((l) => [l.code.trim(), l.tarif])),
      sacSiNouvelle: draft.licences.some((l) => l.ajouteSac),
    });
    alert("Paramètres enregistrés ✔");
  };

  /* ----- maintenance stock : gestion sur tous les articles + seuil unique sur toutes les références ----- */
  const nbRefs = (cfg?.catalogue || []).reduce((s, a) => s + a.tailles.length, 0);
  const toutEnGestion = async () => {
    if (!cfg) return;
    if (!confirm("Activer la gestion du stock sur les " + cfg.catalogue.length + " article(s) ?\n(la remise décrémentera désormais la quantité)")) return;
    await patchConfig({ catalogue: cfg.catalogue.map((a) => ({ ...a, gererStock: true })) });
    setDraft(cfg ? { ...draft!, catalogue: cfg.catalogue.map((a) => ({ ...a, gererStock: true })) } : draft);
    alert(cfg.catalogue.length + " article(s) mis en gestion ✔");
  };
  const seuilPartout = async () => {
    if (!cfg) return;
    const n = Math.max(0, Math.round(seuilTout));
    if (!confirm("Mettre le seuil mini à " + n + " sur les " + nbRefs + " référence(s) (article × taille) ?")) return;
    let done = 0;
    for (const a of cfg.catalogue) for (const t of a.tailles) {
      await setStockItem(a.nom, t, { seuilMini: n });
      setBusy("Seuils… " + (++done) + "/" + nbRefs);
    }
    setBusy("");
    alert(nbRefs + " référence(s) : seuil mini réglé à " + n + " ✔");
  };

  return (
    <div className="params-tiles">
      <details className="param-tile" open>
        <summary><span className="icobtn"><Icon name="calendar" size={17} className="ico-svg" /> Saison & tarifs</span></summary>
        <div className="pt-body">
          <label>Saison</label>
          <input value={draft.saison} onChange={(e) => upd({ saison: e.target.value })} />
          <h3 className="sec">Types de licence</h3>
          <p className="muted" style={{ fontSize: 12 }}>Catégories autorisées : sépare les noms par des virgules. Laisse vide pour toutes les catégories.</p>
          {draft.licences.map((lic, i) => (
            <div className="card" key={i}>
              <div className="grid2">
                <div><label>Code</label><input value={lic.code} onChange={(e) => upd({ licences: draft.licences.map((l, j) => j === i ? { ...l, code: e.target.value } : l) })} /></div>
                <div><label>Libellé</label><input value={lic.label} onChange={(e) => upd({ licences: draft.licences.map((l, j) => j === i ? { ...l, label: e.target.value } : l) })} /></div>
              </div>
              <label>Tarif (€)</label>
              <input type="number" value={lic.tarif} onChange={(e) => upd({ licences: draft.licences.map((l, j) => j === i ? { ...l, tarif: +e.target.value || 0 } : l) })} />
              <label>Catégories autorisées</label>
              <input value={lic.categoriesAutorisees.join(", ")} onChange={(e) => upd({ licences: draft.licences.map((l, j) => j === i ? { ...l, categoriesAutorisees: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) } : l) })} />
              <label className="check"><input type="checkbox" checked={lic.ajouteSac} onChange={(e) => upd({ licences: draft.licences.map((l, j) => j === i ? { ...l, ajouteSac: e.target.checked } : l) })} /> Ajouter le sac</label>
              <label className="check"><input type="radio" name="licence-defaut" checked={!!lic.defaut} onChange={() => upd({ licences: draft.licences.map((l, j) => ({ ...l, defaut: j === i })) })} /> Licence par défaut</label>
              <button className="lnk-danger" onClick={() => upd({ licences: draft.licences.filter((_, j) => j !== i) })}>Supprimer ce type</button>
            </div>
          ))}
          <button className="mini" onClick={() => upd({ licences: [...draft.licences, { code: "", label: "", tarif: 0, categoriesAutorisees: [], ajouteSac: false }] })}>+ Ajouter un type de licence</button>
        </div>
      </details>

      <details className="param-tile">
        <summary><span className="icobtn"><Icon name="tag" size={17} className="ico-svg" /> Remises</span></summary>
        <div className="pt-body">
          {draft.remises.map((r, i) => (
            <div className="editrow" key={i}>
              <input placeholder="Nom (ex. Fratrie)" value={r.nom} onChange={(e) => setRemise(i, "nom", e.target.value)} />
              <input className="w90" type="number" value={r.montant} onChange={(e) => setRemise(i, "montant", e.target.value)} />
              <span className="unit">€</span>
              <button className="x" onClick={() => delRemise(i)}>✕</button>
            </div>
          ))}
          <button className="mini" onClick={addRemise}>+ Ajouter une remise</button>
        </div>
      </details>

      <details className="param-tile">
        <summary><span className="icobtn"><Icon name="shirt" size={17} className="ico-svg" /> Composition des packs</span></summary>
        <div className="pt-body">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Choisis une catégorie, coche les articles du pack joueur / gardien. (Articles & tailles → onglet Stock.)</p>
          <select value={cat} onChange={(e) => setPackCat(e.target.value)}>
            {draft.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {articles.length > 0 && (
            <div className="pktable">
              <div className="pkhead"><span>Article</span><span>Joueur</span><span>Gardien</span></div>
              {articles.map((art) => (
                <div className="pkrow" key={art}>
                  <span className="pkname">{art}</span>
                  <input type="checkbox" checked={(draft.packs[cat] || []).includes(art)} onChange={() => togglePack("packs", art)} />
                  <input type="checkbox" checked={(draft.packsGardien[cat] || []).includes(art)} onChange={() => togglePack("packsGardien", art)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      <details className="param-tile">
        <summary><span className="icobtn"><Icon name="box" size={17} className="ico-svg" /> Maintenance stock</span></summary>
        <div className="pt-body">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Réglages en masse sur tout le stock ({cfg.catalogue.length} article{cfg.catalogue.length > 1 ? "s" : ""}, {nbRefs} référence{nbRefs > 1 ? "s" : ""}).</p>
          <button className="mini" onClick={() => void toutEnGestion()}>Activer la gestion sur tous les articles</button>
          <div className="editrow" style={{ marginTop: 12 }}>
            <label style={{ margin: 0 }}>Seuil mini pour toutes les références</label>
            <input className="w90" type="number" min={0} value={seuilTout} onChange={(e) => setSeuilTout(Math.max(0, Math.round(+e.target.value || 0)))} />
            <button className="mini" onClick={() => void seuilPartout()}>Appliquer</button>
          </div>
          {busy && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{busy}</div>}
        </div>
      </details>

      <details className="param-tile">
        <summary><span className="icobtn"><Icon name="folder" size={17} className="ico-svg" /> Catégories</span></summary>
        <div className="pt-body">
          {draft.categories.map((c, i) => (
            <div className="editrow" key={i}>
              <input value={c} onChange={(e) => setCat(i, e.target.value)} />
              <button className="x" onClick={() => delCat(i)}>✕</button>
            </div>
          ))}
          <button className="mini" onClick={addCat}>+ Ajouter une catégorie</button>
        </div>
      </details>

      <details className="param-tile">
        <summary><span className="icobtn"><Icon name="box" size={17} className="ico-svg" /> Catalogue & tailles</span></summary>
        <div className="pt-body">
          <p className="muted" style={{ fontSize: 12 }}>Les tailles sont séparées par des virgules. Renommer un article met aussi à jour les packs.</p>
          {draft.catalogue.map((article, i) => (
            <div className="card" key={i}>
              <label>Article</label>
              <input value={article.nom} onChange={(e) => setArticleNom(i, e.target.value)} />
              <label>Tailles</label>
              <input value={article.tailles.join(", ")} onChange={(e) => upd({ catalogue: draft.catalogue.map((a, j) => j === i ? { ...a, tailles: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) } : a) })} />
              <label className="check"><input type="checkbox" checked={!!article.gererStock} onChange={(e) => upd({ catalogue: draft.catalogue.map((a, j) => j === i ? { ...a, gererStock: e.target.checked } : a) })} /> Gérer les quantités en stock</label>
              <button className="lnk-danger" onClick={() => delArticle(i)}>Supprimer l’article</button>
            </div>
          ))}
          <button className="mini" onClick={() => upd({ catalogue: [...draft.catalogue, { nom: "", tailles: [], gererStock: false }] })}>+ Ajouter un article</button>
        </div>
      </details>

      <details className="param-tile">
        <summary><span className="icobtn"><Icon name="gear" size={17} className="ico-svg" /> Règles automatiques</span></summary>
        <div className="pt-body">
          <div className="grid2">
            <div><label>Âge adulte</label><input type="number" value={draft.reglesMetier.ageAdulte} onChange={(e) => upd({ reglesMetier: { ...draft.reglesMetier, ageAdulte: Math.max(0, +e.target.value || 0) } })} /></div>
            <div><label>Règlement « non réglé »</label><select value={draft.reglesMetier.reglementNonRegle} onChange={(e) => upd({ reglesMetier: { ...draft.reglesMetier, reglementNonRegle: e.target.value } })}>{draft.reglements.map((r) => <option key={r}>{r}</option>)}</select></div>
          </div>

          <h3 className="sec">Sac automatique</h3>
          <div className="grid2">
            <div><label>Article</label><select value={draft.reglesMetier.articleSac} onChange={(e) => { const article = e.target.value; upd({ reglesMetier: { ...draft.reglesMetier, articleSac: article, tailleSac: draft.catalogue.find((c) => c.nom === article)?.tailles[0] || "" } }); }}>{draft.catalogue.map((c) => <option key={c.nom}>{c.nom}</option>)}</select></div>
            <div><label>Taille</label><select value={draft.reglesMetier.tailleSac} onChange={(e) => upd({ reglesMetier: { ...draft.reglesMetier, tailleSac: e.target.value } })}>{(draft.catalogue.find((c) => c.nom === draft.reglesMetier.articleSac)?.tailles || []).map((t) => <option key={t}>{t}</option>)}</select></div>
          </div>

          <h3 className="sec">Catégorie selon l’âge</h3>
          {draft.reglesMetier.categoriesAge.map((r, i) => (
            <div className="editrow" key={i}>
              <select value={r.categorie} onChange={(e) => upd({ reglesMetier: { ...draft.reglesMetier, categoriesAge: draft.reglesMetier.categoriesAge.map((x, j) => j === i ? { ...x, categorie: e.target.value } : x) } })}>{draft.categories.map((c) => <option key={c}>{c}</option>)}</select>
              <input className="w90" type="number" title="Âge minimum" value={r.ageMin} onChange={(e) => upd({ reglesMetier: { ...draft.reglesMetier, categoriesAge: draft.reglesMetier.categoriesAge.map((x, j) => j === i ? { ...x, ageMin: +e.target.value || 0 } : x) } })} />
              <span>à</span>
              <input className="w90" type="number" title="Âge maximum" value={r.ageMax} onChange={(e) => upd({ reglesMetier: { ...draft.reglesMetier, categoriesAge: draft.reglesMetier.categoriesAge.map((x, j) => j === i ? { ...x, ageMax: +e.target.value || 0 } : x) } })} />
              <button className="x" onClick={() => upd({ reglesMetier: { ...draft.reglesMetier, categoriesAge: draft.reglesMetier.categoriesAge.filter((_, j) => j !== i) } })}>✕</button>
            </div>
          ))}
          <button className="mini" onClick={() => upd({ reglesMetier: { ...draft.reglesMetier, categoriesAge: [...draft.reglesMetier.categoriesAge, { categorie: draft.categories[0] || "", ageMin: 0, ageMax: 0 }] } })}>+ Ajouter une tranche</button>

          <h3 className="sec">Correspondance taille / âge</h3>
          {Object.entries(draft.reglesMetier.taillesParAge).map(([taille, age]) => (
            <div className="editrow" key={taille}>
              <select value={taille} onChange={(e) => { const next = { ...draft.reglesMetier.taillesParAge }; delete next[taille]; next[e.target.value] = age; upd({ reglesMetier: { ...draft.reglesMetier, taillesParAge: next } }); }}>{taillesCatalogue.map((t) => <option key={t}>{t}</option>)}</select>
              <input className="w90" type="number" value={age} onChange={(e) => upd({ reglesMetier: { ...draft.reglesMetier, taillesParAge: { ...draft.reglesMetier.taillesParAge, [taille]: +e.target.value || 0 } } })} />
              <span className="unit">ans</span>
              <button className="x" onClick={() => { const next = { ...draft.reglesMetier.taillesParAge }; delete next[taille]; upd({ reglesMetier: { ...draft.reglesMetier, taillesParAge: next } }); }}>✕</button>
            </div>
          ))}
          <button className="mini" onClick={() => { const taille = taillesCatalogue.find((t) => draft.reglesMetier.taillesParAge[t] == null); if (taille) upd({ reglesMetier: { ...draft.reglesMetier, taillesParAge: { ...draft.reglesMetier.taillesParAge, [taille]: 0 } } }); }}>+ Ajouter une taille</button>
          <label>Ordre préféré des tailles adultes (séparées par des virgules)</label>
          <input value={draft.reglesMetier.ordreTaillesAdultes.join(", ")} onChange={(e) => upd({ reglesMetier: { ...draft.reglesMetier, ordreTaillesAdultes: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) } })} />
        </div>
      </details>

      <details className="param-tile">
        <summary><span className="icobtn"><Icon name="card" size={17} className="ico-svg" /> Modes de règlement</span></summary>
        <div className="pt-body">
          {draft.reglements.map((c, i) => (
            <div className="editrow" key={i}>
              <input value={c} onChange={(e) => setReg(i, e.target.value)} />
              <input className="w90" type="number" min={0} title="Nombre de chèques" value={draft.reglesMetier.chequesParReglement[c] || 0} onChange={(e) => upd({ reglesMetier: { ...draft.reglesMetier, chequesParReglement: { ...draft.reglesMetier.chequesParReglement, [c]: Math.max(0, Math.round(+e.target.value || 0)) } } })} />
              <span className="unit">chq.</span>
              <button className="x" onClick={() => delReg(i)}>✕</button>
            </div>
          ))}
          <button className="mini" onClick={addReg}>+ Ajouter un mode</button>
          <div className="grid2" style={{ marginTop: 12 }}>
            <div><label>Jour mensuel d’encaissement</label><input type="number" min={1} max={28} value={draft.reglesMetier.jourEncaissementCheques} onChange={(e) => upd({ reglesMetier: { ...draft.reglesMetier, jourEncaissementCheques: Math.max(1, Math.min(28, Math.round(+e.target.value || 1))) } })} /></div>
            <div><label>Délai minimum du 1er chèque (jours)</label><input type="number" min={0} value={draft.reglesMetier.delaiPremierChequeJours} onChange={(e) => upd({ reglesMetier: { ...draft.reglesMetier, delaiPremierChequeJours: Math.max(0, Math.round(+e.target.value || 0)) } })} /></div>
          </div>
        </div>
      </details>

      <details className="param-tile">
        <summary><span className="icobtn"><Icon name="tag" size={17} className="ico-svg" /> Libellés de l’application</span></summary>
        <div className="pt-body">
          <h3 className="sec">Rôles</h3>
          {(["admin", "supervision", "user"] as Role[]).map((role) => (
            <div className="editrow" key={role}><span className="w90">{role}</span><input value={draft.reglesMetier.libellesRoles[role] || ""} onChange={(e) => upd({ reglesMetier: { ...draft.reglesMetier, libellesRoles: { ...draft.reglesMetier.libellesRoles, [role]: e.target.value } } })} /></div>
          ))}
          <h3 className="sec">Commandes</h3>
          {(["apasser", "encours", "recue"] as const).map((statut) => (
            <div className="editrow" key={statut}><span className="w90">{statut}</span><input value={draft.reglesMetier.libellesCommandes[statut] || ""} onChange={(e) => upd({ reglesMetier: { ...draft.reglesMetier, libellesCommandes: { ...draft.reglesMetier.libellesCommandes, [statut]: e.target.value } } })} /></div>
          ))}
        </div>
      </details>

      <button className="btn-primary icobtn" onClick={() => void enregistrer()}><Icon name="save" size={17} className="ico-svg" /> Enregistrer les paramètres</button>

      <details className="param-tile">
        <summary><span className="icobtn"><Icon name="users" size={17} className="ico-svg" /> Utilisateurs & droits</span></summary>
        <div className="pt-body">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Crée un compte Supabase ou donne l’accès à un compte existant. Les droits sont propres à Boutique ASC.</p>
          {roles && roles.map((r) => (
            <div className="editrow" key={r.email}>
              <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.email}</span>
              <select value={r.role} style={{ flex: "none", width: 150 }} onChange={(e) => void setUserRole(r.email, e.target.value as Role)}>
                {(["admin", "supervision", "user"] as Role[]).map((x) => <option key={x} value={x}>{roleLabel(x)}</option>)}
              </select>
              <button className="mini" onClick={() => void changerMotDePasse(r.email)}>Mot de passe</button>
              <button className="x" onClick={() => { if (confirm("Retirer les droits de " + r.email + " ?")) void removeUserRole(r.email); }}>✕</button>
            </div>
          ))}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--bord)" }}>
            <label>Créer un compte</label>
            <div className="editrow"><input placeholder="email@exemple.fr" value={newMail} onChange={(e) => setNewMail(e.target.value)} /></div>
            <div className="editrow">
              <input type="password" placeholder="mot de passe (≥ 8)" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
              <select value={newRole} style={{ flex: "none", width: 150 }} onChange={(e) => setNewRole(e.target.value as Role)}>
                {(["user", "supervision", "admin"] as Role[]).map((x) => <option key={x} value={x}>{roleLabel(x)}</option>)}
              </select>
            </div>
            <button className="btn-primary" onClick={() => void creer()}>+ Créer le compte</button>
            <button className="mini" style={{ marginTop: 8 }} onClick={() => { if (newMail.trim()) { void setUserRole(newMail, newRole); setNewMail(""); } }}>Définir le rôle seulement (compte déjà existant)</button>
          </div>
        </div>
      </details>

      <details className="param-tile">
        <summary><span className="icobtn"><Icon name="save" size={17} className="ico-svg" /> Sauvegarde & fin de saison</span></summary>
        <div className="pt-body">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Exporte une sauvegarde complète, puis (nouvelle saison) repars propre en gardant tout ton paramétrage.</p>
          {busy && <div className="hint vert">{busy}</div>}
          <button className="btn-primary icobtn" onClick={() => void exporterJSON()}><Icon name="save" size={17} className="ico-svg" /> Exporter la base (sauvegarde .json)</button>
          <button className="mini icobtn" style={{ marginTop: 8 }} onClick={() => void exporterCSV()}><Icon name="chart" size={15} className="ico-svg" /> Exporter les joueurs (Excel/CSV)</button>

          <h3 className="sec" style={{ marginTop: 18 }}>Restaurer</h3>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Recharge une sauvegarde .json (les données du fichier reprennent leur place).</p>
          <input type="file" accept=".json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importer(f); e.target.value = ""; }} />

          <h3 className="sec" style={{ marginTop: 18 }}>Nouvelle saison (repartir propre)</h3>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Efface les joueurs, chèques et commandes. Garde tarifs, catégories, packs, catalogue et stock. <b>Exporte d'abord !</b></p>
          <label>Nom de la nouvelle saison</label>
          <input placeholder="ex. 2026-2027" value={saisonSuivante} onChange={(e) => setSaisonSuivante(e.target.value)} />
          <button className="btn-danger icobtn" style={{ marginTop: 10 }} onClick={() => void resetSaison()}><Icon name="calendar" size={16} className="ico-svg" /> Démarrer la nouvelle saison</button>
        </div>
      </details>

      <div style={{ height: 30 }} />
    </div>
  );
}
