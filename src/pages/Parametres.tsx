import { useState } from "react";
import { useConfig, patchConfig, setStockItem, useRoles, setUserRole, removeUserRole, creerCompte, exportBase, importBase, nouvelleSaison } from "../data";
import { calc } from "../calc";
import Icon from "../Icon";
import type { Config, Role, Joueur } from "../types";

function download(name: string, content: string, type: string) {
  const b = new Blob([content], { type }); const u = URL.createObjectURL(b);
  const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u);
}

const ROLE_LABEL: Record<Role, string> = { admin: "Admin (tout)", supervision: "Supervision (sauf réglages)", user: "Boutique (sans argent)" };

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
    if (!mail || newPwd.length < 6) { alert("Il faut un e-mail et un mot de passe d'au moins 6 caractères."); return; }
    try {
      await creerCompte(mail, newPwd, newRole);
      setNewMail(""); setNewPwd("");
      alert("Compte créé ✔ La personne peut se connecter avec cet e-mail et ce mot de passe.");
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
      alert(code.includes("email-already-in-use") ? "Cet e-mail a déjà un compte." :
        code.includes("invalid-email") ? "E-mail invalide." :
        code.includes("weak-password") ? "Mot de passe trop court (6 caractères min)." :
        "Création impossible.");
    }
  };

  if (cfg && draft === null) {
    setDraft(JSON.parse(JSON.stringify(cfg)));
    setPackCat(cfg.categories[0] || "");
  }
  if (!cfg || !draft) return <div className="muted" style={{ padding: 20 }}>Chargement…</div>;

  const upd = (patch: Partial<Config>) => setDraft({ ...draft, ...patch });
  const cat = packCat && draft.categories.includes(packCat) ? packCat : draft.categories[0] || "";
  const articles = draft.catalogue.map((c) => c.nom).filter((n) => n !== "SAC");

  const togglePack = (which: "packs" | "packsGardien", art: string) => {
    const map = which === "packs" ? draft.packs : draft.packsGardien;
    const set = new Set(map[cat] || []);
    set.has(art) ? set.delete(art) : set.add(art);
    const ordered = draft.catalogue.map((c) => c.nom).filter((n) => set.has(n));
    upd({ [which]: { ...map, [cat]: ordered } } as Partial<Config>);
  };

  // remises
  const setRemise = (i: number, k: "nom" | "montant", v: string) =>
    upd({ remises: draft.remises.map((r, j) => (j === i ? { ...r, [k]: k === "montant" ? (Number(v) || 0) : v } : r)) });
  const addRemise = () => upd({ remises: [...draft.remises, { nom: "", montant: 0 }] });
  const delRemise = (i: number) => upd({ remises: draft.remises.filter((_, j) => j !== i) });

  // catégories
  const setCat = (i: number, v: string) => upd({ categories: draft.categories.map((c, j) => (j === i ? v : c)) });
  const addCat = () => upd({ categories: [...draft.categories, ""] });
  const delCat = (i: number) => upd({ categories: draft.categories.filter((_, j) => j !== i) });

  // règlements
  const setReg = (i: number, v: string) => upd({ reglements: draft.reglements.map((c, j) => (j === i ? v : c)) });
  const addReg = () => upd({ reglements: [...draft.reglements, ""] });
  const delReg = (i: number) => upd({ reglements: draft.reglements.filter((_, j) => j !== i) });

  const enregistrer = async () => {
    await patchConfig({
      saison: draft.saison,
      tarifs: draft.tarifs,
      sacSiNouvelle: draft.sacSiNouvelle,
      remises: draft.remises.filter((r) => r.nom.trim()),
      categories: draft.categories.map((c) => c.trim()).filter(Boolean),
      reglements: draft.reglements.map((c) => c.trim()).filter(Boolean),
      packs: draft.packs,
      packsGardien: draft.packsGardien,
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
          <div className="grid2" style={{ marginTop: 10 }}>
            <div><label>NOUVEAU (€)</label><input type="number" value={draft.tarifs.NOUVEAU} onChange={(e) => upd({ tarifs: { ...draft.tarifs, NOUVEAU: +e.target.value } })} /></div>
            <div><label>RENOUV. (€)</label><input type="number" value={draft.tarifs["RENOUV."]} onChange={(e) => upd({ tarifs: { ...draft.tarifs, "RENOUV.": +e.target.value } })} /></div>
          </div>
          <label>LICENCE seule (€)</label>
          <input type="number" value={draft.tarifs.LICENCE} onChange={(e) => upd({ tarifs: { ...draft.tarifs, LICENCE: +e.target.value } })} />
          <label className="check"><input type="checkbox" checked={draft.sacSiNouvelle} onChange={(e) => upd({ sacSiNouvelle: e.target.checked })} /> <Icon name="bag" size={15} className="ico-svg" /> Sac pour les nouvelles licences</label>
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
        <summary><span className="icobtn"><Icon name="card" size={17} className="ico-svg" /> Modes de règlement</span></summary>
        <div className="pt-body">
          {draft.reglements.map((c, i) => (
            <div className="editrow" key={i}>
              <input value={c} onChange={(e) => setReg(i, e.target.value)} />
              <button className="x" onClick={() => delReg(i)}>✕</button>
            </div>
          ))}
          <button className="mini" onClick={addReg}>+ Ajouter un mode</button>
        </div>
      </details>

      <button className="btn-primary icobtn" onClick={() => void enregistrer()}><Icon name="save" size={17} className="ico-svg" /> Enregistrer les paramètres</button>

      <details className="param-tile">
        <summary><span className="icobtn"><Icon name="users" size={17} className="ico-svg" /> Utilisateurs & droits</span></summary>
        <div className="pt-body">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Donne un rôle à chaque e-mail (le compte doit exister dans Firebase → Authentication). Appliqué tout de suite.</p>
          {roles && roles.map((r) => (
            <div className="editrow" key={r.email}>
              <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.email}</span>
              <select value={r.role} style={{ flex: "none", width: 150 }} onChange={(e) => void setUserRole(r.email, e.target.value as Role)}>
                {(["admin", "supervision", "user"] as Role[]).map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
              </select>
              <button className="x" onClick={() => { if (confirm("Retirer les droits de " + r.email + " ?")) void removeUserRole(r.email); }}>✕</button>
            </div>
          ))}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--bord)" }}>
            <label>Créer un compte</label>
            <div className="editrow"><input placeholder="email@exemple.fr" value={newMail} onChange={(e) => setNewMail(e.target.value)} /></div>
            <div className="editrow">
              <input type="password" placeholder="mot de passe (≥ 6)" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
              <select value={newRole} style={{ flex: "none", width: 150 }} onChange={(e) => setNewRole(e.target.value as Role)}>
                {(["user", "supervision", "admin"] as Role[]).map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
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
