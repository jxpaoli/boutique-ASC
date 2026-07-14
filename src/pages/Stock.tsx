import { useMemo, useRef, useState } from "react";
import { useConfig, useJoueurs, useStock, useCommandes, setStockItem, stockId, patchConfig, addCommande, updateCommande, deleteCommande, adjustStock, logInventaire, useInventaires, deleteInventaire } from "../data";
import { useAuth } from "../auth";
import { besoinsCommande } from "../calc";
import { exportInventaireXlsx, lireInventaireXlsx } from "../xlsxStock";
import Icon from "../Icon";
import { type CatalogueItem, type Commande, type CommandeLigne, type StockItem } from "../types";

const todayIso = () => { const z = (x: number) => String(x).padStart(2, "0"); const d = new Date(); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };
const key2 = (a: string, t: string) => a + "__" + t;

export default function Stock() {
  const cfg = useConfig();
  const joueurs = useJoueurs();
  const stock = useStock();
  const commandes = useCommandes();
  const inventaires = useInventaires();
  const email = useAuth().user?.email || "?";
  const fileRef = useRef<HTMLInputElement>(null);
  const [vue, setVue] = useState<"manquants" | "articles" | "commandes">("articles");
  const [alertesSeules, setAlertesSeules] = useState(false);
  const [newSize, setNewSize] = useState<Record<string, string>>({});
  const [newArt, setNewArt] = useState("");
  const [artQ, setArtQ] = useState("");
  const [sugQty, setSugQty] = useState<Record<string, number>>({});
  const [fournisseur, setFournisseur] = useState("");

  const stockMap = useMemo(() => {
    const m = new Map<string, StockItem>();
    (stock || []).forEach((s) => m.set(s.id, s));
    return m;
  }, [stock]);

  // Quantités déjà en commande (à passer + en cours), par article+taille
  const enCommande = useMemo(() => {
    const m = new Map<string, number>();
    (commandes || []).forEach((c) => {
      if (c.statut === "recue") return;
      c.lignes.forEach((l) => m.set(key2(l.article, l.taille), (m.get(key2(l.article, l.taille)) || 0) + l.quantite));
    });
    return m;
  }, [commandes]);

  // Tout ce qui est différé (non remis), regroupé par article + taille
  const manquants = useMemo(() => {
    const map = new Map<string, { article: string; taille: string; qte: number; qui: string[] }>();
    (joueurs || []).forEach((j) => {
      (j.articles || []).forEach((a) => {
        if (a.statut === "remis") return;
        const key = a.article + "__" + (a.taille || "?");
        const e = map.get(key) || { article: a.article, taille: a.taille || "?", qte: 0, qui: [] };
        e.qte++; e.qui.push(j.nom + (j.prenom ? " " + j.prenom : ""));
        map.set(key, e);
      });
    });
    return [...map.values()].sort((a, b) => a.article.localeCompare(b.article));
  }, [joueurs]);

  if (!cfg || !joueurs || !stock || !commandes) return <div className="muted" style={{ padding: 20 }}>Chargement…</div>;

  /* ----- suggestions à commander : différés des joueurs + réassort des seuils mini ----- */
  const suggestions = besoinsCommande(cfg, joueurs, stock, commandes);

  const creerCommande = async () => {
    const lignes: CommandeLigne[] = suggestions
      .map((s) => ({ article: s.article, taille: s.taille, quantite: sugQty[s.key] ?? s.manque }))
      .filter((l) => l.quantite > 0);
    if (!lignes.length) { alert("Rien à commander."); return; }
    await addCommande({ statut: "apasser", lignes, fournisseur: fournisseur.trim() || undefined });
    setSugQty({}); setFournisseur("");
    alert("Commande créée (à passer) ✔");
  };
  const marquerCommandee = (c: Commande) => void updateCommande(c.id, { statut: "encours", dateCommande: todayIso() });
  const receptionner = async (c: Commande) => {
    if (!confirm("Valider la réception ? Le stock sera incrémenté.")) return;
    for (const l of c.lignes) await adjustStock(l.article, l.taille, l.quantite);
    await updateCommande(c.id, { statut: "recue", dateReception: todayIso() });
    alert("Réception validée, stock mis à jour ✔");
  };

  /* ----- gestion du catalogue (articles + tailles) ----- */
  const saveCatalogue = (next: CatalogueItem[]) => void patchConfig({ catalogue: next });
  const ajouterArticle = () => {
    const nom = newArt.trim();
    if (!nom) return;
    if (cfg.catalogue.some((c) => c.nom.toLowerCase() === nom.toLowerCase())) { alert("Cet article existe déjà."); return; }
    saveCatalogue([...cfg.catalogue, { nom, tailles: [] }]);
    setNewArt("");
  };
  const supprimerArticle = (nom: string) => {
    if (confirm("Supprimer l'article « " + nom + " » ?")) saveCatalogue(cfg.catalogue.filter((c) => c.nom !== nom));
  };
  const ajouterTaille = (nom: string) => {
    const t = (newSize[nom] || "").trim();
    if (!t) return;
    saveCatalogue(cfg.catalogue.map((c) => (c.nom === nom && !c.tailles.includes(t) ? { ...c, tailles: [...c.tailles, t] } : c)));
    setNewSize({ ...newSize, [nom]: "" });
  };
  const supprimerTaille = (nom: string, t: string) =>
    saveCatalogue(cfg.catalogue.map((c) => (c.nom === nom ? { ...c, tailles: c.tailles.filter((x) => x !== t) } : c)));
  const toggleGererStock = (nom: string, v: boolean) =>
    saveCatalogue(cfg.catalogue.map((c) => (c.nom === nom ? { ...c, gererStock: v } : c)));

  /* ----- inventaire : export Excel → correction terrain → réimport dans la base ----- */
  const importInventaire = async (file: File) => {
    try {
      const lignes = await lireInventaireXlsx(file);
      if (!lignes.length) { alert("Aucune quantité réelle renseignée dans le fichier. Rien à importer."); return; }
      // base actuelle (peut avoir changé depuis l'export : remise / réception entre-temps)
      const now = (l: { article: string; taille: string }) => stockMap.get(stockId(l.article, l.taille))?.quantite ?? 0;
      const ecarts = lignes.filter((l) => l.reel !== now(l));
      // dérive : la base a bougé entre l'export (l.base) et maintenant → un changement a eu lieu
      const bouges = lignes.filter((l) => now(l) !== l.base);
      const apercu = ecarts.slice(0, 8).map((l) => "• " + l.article + " (" + l.taille + ") : " + now(l) + " → " + l.reel).join("\n");
      let msg = lignes.length + " référence(s) comptée(s), dont " + ecarts.length + " écart(s) avec la base actuelle."
        + (ecarts.length ? "\n\n" + apercu + (ecarts.length > 8 ? "\n… et " + (ecarts.length - 8) + " autre(s)" : "") : "");
      if (bouges.length) {
        const bApercu = bouges.slice(0, 6).map((l) => "• " + l.article + " (" + l.taille + ") : export " + l.base + " → base actuelle " + now(l)).join("\n");
        msg += "\n\n⚠️ " + bouges.length + " référence(s) ont CHANGÉ en base depuis l'export (remise ou réception entre-temps) :\n"
          + bApercu + (bouges.length > 6 ? "\n… et " + (bouges.length - 6) + " autre(s)" : "")
          + "\nLe compte de ton fichier sera quand même appliqué et écrasera ces changements.";
      }
      msg += "\n\nÉcraser la base avec les quantités réelles ?";
      if (!confirm(msg)) return;
      // trace des modifications réellement appliquées (avant → après), avant d'écraser
      const modifs = ecarts.map((l) => ({ article: l.article, taille: l.taille, avant: now(l), apres: l.reel }));
      for (const l of lignes) await setStockItem(l.article, l.taille, { quantite: l.reel });
      await logInventaire({ date: new Date().toISOString(), user: email, comptees: lignes.length, lignes: modifs });
      alert(lignes.length + " référence(s) mise(s) à jour ✔" + (ecarts.length ? " (" + ecarts.length + " modifiée(s))" : "") + "\nInventaire enregistré dans l'historique.");
    } catch (e) {
      alert("Import impossible : " + (e instanceof Error ? e.message : "fichier illisible"));
    }
  };

  return (
    <>
      <div className="chips">
        <button className={"chip icobtn" + (vue === "articles" ? " on" : "")} onClick={() => setVue("articles")}><Icon name="box" size={15} className="ico-svg" /> Articles & stock</button>
        <button className={"chip icobtn" + (vue === "commandes" ? " on" : "")} onClick={() => setVue("commandes")}><Icon name="cart" size={15} className="ico-svg" /> Commandes</button>
        <button className={"chip icobtn" + (vue === "manquants" ? " on" : "")} onClick={() => setVue("manquants")}><Icon name="list" size={15} className="ico-svg" /> Manquants</button>
      </div>

      {vue === "commandes" && (
        <>
          <h3 className="sec">À commander ({suggestions.length})</h3>
          {suggestions.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Rien à commander : aucun article différé chez les joueurs, stock et commandes en cours couvrent tout.</div>}
          {suggestions.map((s) => (
            <div className="manq" key={s.key}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span><b>{s.article}</b> <span className="muted">({s.taille})</span></span>
                <span className="stepper">
                  <button onClick={() => setSugQty({ ...sugQty, [s.key]: Math.max(0, (sugQty[s.key] ?? s.manque) - 1) })}>−</button>
                  <input type="number" value={sugQty[s.key] ?? s.manque} onChange={(e) => setSugQty({ ...sugQty, [s.key]: Math.max(0, Math.round(+e.target.value || 0)) })} />
                  <button onClick={() => setSugQty({ ...sugQty, [s.key]: (sugQty[s.key] ?? s.manque) + 1 })}>+</button>
                </span>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>besoin {s.bes} · stock {s.dispo} · déjà commandé {s.cmd} · seuil {s.seuil}</div>
            </div>
          ))}
          {suggestions.length > 0 && (
            <div className="addrow" style={{ marginTop: 10 }}>
              <input placeholder="Fournisseur (optionnel)" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} />
              <button className="btn-primary" style={{ width: "auto", marginTop: 0, padding: "11px 16px" }} onClick={() => void creerCommande()}>Créer la commande</button>
            </div>
          )}

          <h3 className="sec">Commandes</h3>
          {commandes.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Aucune commande.</div>}
          {[...commandes].sort((a, b) => (b.dateCreation || 0) - (a.dateCreation || 0)).map((c) => (
            <div className="card" key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className={"badge " + (c.statut === "recue" ? "ok" : c.statut === "encours" ? "part" : "no")}>{cfg.reglesMetier.libellesCommandes[c.statut] || c.statut}</span>
                {c.fournisseur && <span className="muted" style={{ fontSize: 12 }}>{c.fournisseur}</span>}
              </div>
              <div style={{ fontSize: 13, margin: "6px 0" }}>{c.lignes.map((l) => l.quantite + "× " + l.article + " (" + l.taille + ")").join(" · ")}</div>
              {(c.dateCommande || c.dateReception) && <div className="muted" style={{ fontSize: 11 }}>{c.dateCommande ? "commandée le " + c.dateCommande : ""}{c.dateReception ? " · reçue le " + c.dateReception : ""}</div>}
              <div className="aa-foot" style={{ marginTop: 8 }}>
                {c.statut === "apasser" && <button className="mini icobtn" onClick={() => marquerCommandee(c)}><Icon name="truck" size={15} className="ico-svg" /> Marquer commandée</button>}
                {c.statut === "encours" && <button className="btn-primary icobtn" style={{ width: "auto", marginTop: 0, padding: "9px 14px", flex: 1 }} onClick={() => void receptionner(c)}><Icon name="check" size={16} className="ico-svg" /> Valider réception (+ stock)</button>}
                <button className="lnk-danger" onClick={() => { if (confirm("Supprimer cette commande ?")) void deleteCommande(c.id); }}>Supprimer</button>
              </div>
            </div>
          ))}
        </>
      )}

      {vue === "manquants" && (
        <>
          <h3 className="sec">À fournir / différés ({manquants.reduce((s, e) => s + e.qte, 0)})</h3>
          {manquants.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Rien à fournir.</div>}
          {manquants.map((e) => {
            const cmd = enCommande.get(key2(e.article, e.taille)) || 0;
            const dispo = stockMap.get(stockId(e.article, e.taille))?.quantite ?? 0;
            return (
              <div key={e.article + e.taille} className="manq">
                <div><b>{e.qte}×</b> {e.article} <span className="muted">({e.taille})</span>
                  {dispo >= e.qte ? <span className="badge ok" style={{ marginLeft: 6 }}><Icon name="check" size={12} className="ico-svg" /> en stock, à remettre</span>
                    : dispo > 0 ? <span className="badge ok" style={{ marginLeft: 6 }}><Icon name="check" size={12} className="ico-svg" /> {dispo} en stock</span> : null}
                  {dispo < e.qte && (cmd > 0 ? <span className="badge part" style={{ marginLeft: 6 }}><Icon name="truck" size={12} className="ico-svg" /> {cmd} commandé(s)</span> : <span className="badge no" style={{ marginLeft: 6 }}>à commander</span>)}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>{e.qui.join(", ")}</div>
              </div>
            );
          })}
        </>
      )}

      {vue === "articles" && (() => {
        let refs = 0, rupt = 0, bas = 0;
        cfg.catalogue.forEach((a) => a.tailles.forEach((t) => {
          refs++;
          const s = stockMap.get(stockId(a.nom, t));
          if (s) { if (s.quantite <= 0) rupt++; else if (s.seuilMini > 0 && s.quantite <= s.seuilMini) bas++; }
        }));
        const liste = cfg.catalogue.filter((a) => a.nom.toLowerCase().includes(artQ.trim().toLowerCase()));
        return (
          <>
            <div className="totaux stock-kpi">
              <div className="t-item"><span>Références</span><b>{refs}</b></div>
              <div className="t-item due"><span>Ruptures</span><b>{rupt}</b></div>
              <div className="t-item hold"><span>Stock bas</span><b>{bas}</b></div>
            </div>

            <div className="stock-tools">
              <input className="search" type="search" placeholder="Rechercher un article…" value={artQ} onChange={(e) => setArtQ(e.target.value)} />
              <button className="mini icobtn" onClick={() => void exportInventaireXlsx(cfg, stock)}><Icon name="box" size={15} className="ico-svg" /> Exporter Excel</button>
              <button className="mini icobtn" onClick={() => fileRef.current?.click()}><Icon name="list" size={15} className="ico-svg" /> Importer Excel</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void importInventaire(f); e.target.value = ""; }} />
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Inventaire : exporte le stock, corrige la colonne « Qté réelle » dans Excel, puis réimporte le fichier.</div>
            <label className="check" style={{ marginBottom: 6 }}><input type="checkbox" checked={alertesSeules} onChange={(e) => setAlertesSeules(e.target.checked)} /> Seulement les alertes</label>

            {liste.map((art) => {
              const rows = art.tailles.map((t) => {
                const s = stockMap.get(stockId(art.nom, t));
                const tracked = !!s, q = s?.quantite ?? 0, seuil = s?.seuilMini ?? 0;
                return { t, q, seuil, tracked, rupture: tracked && q <= 0, bas: tracked && seuil > 0 && q > 0 && q <= seuil };
              });
              const shown = alertesSeules ? rows.filter((r) => r.rupture || r.bas) : rows;
              if (alertesSeules && shown.length === 0) return null;
              const dotCls = rows.some((r) => r.rupture) ? "rupture" : rows.some((r) => r.bas) ? "bas" : "";
              return (
                <details key={art.nom} className="art-acc">
                  <summary>
                    <span className="aa-name">{art.nom}</span>
                    <span className="aa-meta">{dotCls && <span className={"dot " + dotCls} />} {art.tailles.length} taille{art.tailles.length > 1 ? "s" : ""}</span>
                  </summary>
                  <div className="aa-body">
                    <label className="check" style={{ marginTop: 0, marginBottom: 8 }}>
                      <input type="checkbox" checked={!!art.gererStock} onChange={(e) => toggleGererStock(art.nom, e.target.checked)} />
                      Gérer le stock de cet article (la remise décrémente la quantité)
                    </label>
                    <table className="stk">
                      <thead><tr><th>Taille</th><th>Quantité</th><th>Seuil</th><th>État</th><th></th></tr></thead>
                      <tbody>
                        {shown.map((r) => (
                          <tr key={r.t}>
                            <td className="stk-t">{r.t}</td>
                            <td>
                              <div className="stepper">
                                <button onClick={() => void setStockItem(art.nom, r.t, { quantite: Math.max(0, r.q - 1) })}>−</button>
                                <input type="number" value={r.q} onChange={(e) => void setStockItem(art.nom, r.t, { quantite: Math.max(0, Math.round(+e.target.value || 0)) })} />
                                <button onClick={() => void setStockItem(art.nom, r.t, { quantite: r.q + 1 })}>+</button>
                              </div>
                            </td>
                            <td><span className="mlab">seuil</span><input className="seuil" type="number" value={r.seuil} onChange={(e) => void setStockItem(art.nom, r.t, { seuilMini: Math.max(0, Math.round(+e.target.value || 0)) })} /></td>
                            <td>{!r.tracked ? <span className="badge neutre">—</span> : r.rupture ? <span className="badge no">rupture</span> : r.bas ? <span className="badge part">bas</span> : <span className="badge ok">ok</span>}</td>
                            <td><button className="x" onClick={() => supprimerTaille(art.nom, r.t)}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="aa-foot">
                      <div className="addrow" style={{ flex: 1 }}>
                        <input placeholder="ajouter une taille" value={newSize[art.nom] || ""} onChange={(e) => setNewSize({ ...newSize, [art.nom]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") ajouterTaille(art.nom); }} />
                        <button className="mini" onClick={() => ajouterTaille(art.nom)}>+ taille</button>
                      </div>
                      <button className="lnk-danger" onClick={() => supprimerArticle(art.nom)}>Supprimer l'article</button>
                    </div>
                  </div>
                </details>
              );
            })}

            <div className="addrow" style={{ marginTop: 14 }}>
              <input placeholder="Nouvel article" value={newArt} onChange={(e) => setNewArt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ajouterArticle(); }} />
              <button className="btn-primary" style={{ width: "auto", marginTop: 0, padding: "11px 16px" }} onClick={ajouterArticle}>+ Ajouter</button>
            </div>

            {(inventaires || []).length > 0 && (
              <>
                <h3 className="sec">Historique des inventaires</h3>
                {[...(inventaires || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((inv) => (
                  <details key={inv.id} className="art-acc">
                    <summary>
                      <span className="aa-name icobtn"><Icon name="list" size={15} className="ico-svg" /> {new Date(inv.date).toLocaleDateString("fr-FR")} <span className="muted">{new Date(inv.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span></span>
                      <span className="aa-meta">{inv.comptees} comptée{inv.comptees > 1 ? "s" : ""} · {inv.lignes.length} modif.</span>
                    </summary>
                    <div className="aa-body">
                      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Par {inv.user}</div>
                      {inv.lignes.length === 0 ? (
                        <div className="muted" style={{ fontSize: 13 }}>Aucun écart : le stock compté correspondait déjà à la base.</div>
                      ) : (
                        <table className="stk">
                          <thead><tr><th>Référence</th><th>Avant</th><th>Après</th></tr></thead>
                          <tbody>
                            {[...inv.lignes].sort((a, b) => a.article.localeCompare(b.article) || a.taille.localeCompare(b.taille)).map((l, i) => (
                              <tr key={i}>
                                <td className="stk-t">{l.article} <span className="muted" style={{ fontWeight: 400 }}>· {l.taille}</span></td>
                                <td><span className="mlab">avant</span><span className="muted">{l.avant}</span></td>
                                <td><span className="mlab">après</span><b>{l.apres}</b></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <div className="aa-foot">
                        <button className="lnk-danger" onClick={() => { if (confirm("Supprimer cette entrée d'historique ? (le stock n'est pas modifié)")) void deleteInventaire(inv.id); }}>Supprimer l'entrée</button>
                      </div>
                    </div>
                  </details>
                ))}
              </>
            )}
          </>
        );
      })()}

    </>
  );
}
