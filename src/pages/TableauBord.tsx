import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useConfig, useJoueurs, useStock, useCommandes } from "../data";
import { calc, euro, chequeCount, besoinsCommande } from "../calc";
import Cheques from "./Cheques";
import Icon from "../Icon";
import type { Joueur } from "../types";

function csvDownload(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((v) => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(";")).join("\r\n");
  const b = new Blob(["﻿" + csv], { type: "text/csv" });
  const u = URL.createObjectURL(b);
  const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u);
}

export default function TableauBord() {
  const cfg = useConfig();
  const joueurs = useJoueurs();
  const stock = useStock();
  const commandes = useCommandes();
  const nav = useNavigate();

  const d = useMemo(() => {
    const fin = { total: 0, encaisse: 0, reste: 0, recup: 0, enc: 0 };
    const parMoyen = new Map<string, { n: number; total: number; encaisse: number; reste: number }>();
    let remis = 0, differe = 0, complets = 0, incomplets = 0;
    const partiels: Joueur[] = [];
    if (cfg && joueurs) {
      joueurs.forEach((p) => {
        const c = calc(p, cfg);
        fin.total += c.total; fin.encaisse += c.paye; fin.reste += c.reste; fin.recup += c.aRecuperer; fin.enc += c.aEncaisser;
        // tous les modes "N CHEQUES" comptent comme un seul moyen : CHÈQUES
        const m = chequeCount(p.reglement, cfg) > 0 ? "CHÈQUES" : (p.reglement || "—");
        const e = parMoyen.get(m) || { n: 0, total: 0, encaisse: 0, reste: 0 };
        e.n++; e.total += c.total; e.encaisse += c.paye; e.reste += c.reste; parMoyen.set(m, e);
        const arts = p.articles || [];
        const r = arts.filter((a) => a.statut === "remis").length;
        const df = arts.length - r;
        remis += r; differe += df;
        if (arts.length > 0 && df === 0) complets++;
        if (df > 0) { incomplets++; partiels.push(p); }
      });
    }
    const stockDispo = (stock || []).reduce((s, it) => s + (it.quantite || 0), 0);
    // même calcul que la page Stock → Commandes (différés + seuils − stock − déjà commandé)
    const aCommander = cfg && joueurs ? besoinsCommande(cfg, joueurs, stock || [], commandes || []).reduce((s, b) => s + b.manque, 0) : 0;
    return { fin, parMoyen: [...parMoyen.entries()], remis, differe, complets, incomplets, partiels, stockDispo, aCommander };
  }, [cfg, joueurs, stock, commandes]);

  if (!cfg || !joueurs || !stock) return <div className="muted" style={{ padding: 20 }}>Chargement…</div>;

  const exportFinances = () => {
    const rows: (string | number)[][] = [["Nom", "Prénom", "Catégorie", "Licence", "Règlement", "Total", "Encaissé", "Reste", "À récupérer", "À encaisser"]];
    joueurs.forEach((p) => { const c = calc(p, cfg); rows.push([p.nom, p.prenom, p.categorie, p.licence, p.reglement, c.total, c.paye, c.reste, c.aRecuperer, c.aEncaisser]); });
    csvDownload("finances_" + cfg.saison + ".csv", rows);
  };

  return (
    <>
      <h2 className="page-title icobtn"><Icon name="chart" size={22} className="ico-svg" /> Tableau de bord</h2>

      <div className="dashboard-grid">
      <details className="param-tile" open>
        <summary><span className="icobtn"><Icon name="euro" size={18} className="ico-svg" /> Finances</span></summary>
        <div className="pt-body">
          <div className="totaux">
            <div className="t-item"><span>Total à payer</span><b>{euro(d.fin.total)}</b></div>
            <div className="t-item paid"><span>Encaissé</span><b>{euro(d.fin.encaisse)}</b></div>
            <div className="t-item due"><span>À récupérer</span><b>{euro(d.fin.recup)}</b></div>
            <div className="t-item hold"><span>À encaisser</span><b>{euro(d.fin.enc)}</b></div>
          </div>
          <h4 style={{ margin: "14px 0 4px", fontSize: 13, color: "var(--muted)" }}>PAR MOYEN DE PAIEMENT</h4>
          {d.parMoyen.sort((a, b) => b[1].total - a[1].total).map(([m, v]) => (
            <div className="dash-line" key={m}>
              <span>{m} <span className="muted">({v.n})</span></span>
              <span>encaissé <b>{euro(v.encaisse)}</b> · reste <b style={{ color: v.reste > 0 ? "var(--rouge)" : "inherit" }}>{euro(v.reste)}</b></span>
            </div>
          ))}
          <button className="mini icobtn" style={{ marginTop: 12 }} onClick={exportFinances}><Icon name="chart" size={15} className="ico-svg" /> Export finances (CSV)</button>
        </div>
      </details>

      <details className="param-tile">
        <summary><span className="icobtn"><Icon name="receipt" size={18} className="ico-svg" /> Chèques / dépôts</span></summary>
        <div className="pt-body"><Cheques /></div>
      </details>

      <details className="param-tile" open>
        <summary><span className="icobtn"><Icon name="shirt" size={18} className="ico-svg" /> Équipements</span></summary>
        <div className="pt-body">
          <div className="totaux stock-kpi">
            <div className="t-item paid"><span>Remis</span><b>{d.remis}</b></div>
            <div className="t-item hold"><span>Différés</span><b>{d.differe}</b></div>
            <div className="t-item due"><span>À commander</span><b>{d.aCommander}</b></div>
          </div>
          <div className="dash-line"><span>Packs complets</span><b>{d.complets}</b></div>
          <div className="dash-line"><span>Packs incomplets</span><b>{d.incomplets}</b></div>
          <div className="dash-line"><span>Stock disponible (unités)</span><b>{d.stockDispo}</b></div>

          <h4 style={{ margin: "14px 0 4px", fontSize: 13, color: "var(--muted)" }}>JOUEURS AVEC PACK À PRÉPARER</h4>
          {d.partiels.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Aucun.</div>}
          {d.partiels.sort((a, b) => (a.nom || "").localeCompare(b.nom || "")).map((p) => {
            const df = (p.articles || []).filter((a) => a.statut !== "remis");
            return (
              <div className="manq" key={p.id} onClick={() => nav("/joueur/" + p.id)} style={{ cursor: "pointer" }}>
                <div><b>{p.nom}</b> {p.prenom} <span className="muted">· {p.gardien && <Icon name="shield" size={12} className="ico-svg" />}{p.categorie}</span></div>
                <div className="muted" style={{ fontSize: 12 }}>{df.map((a) => a.article + (a.taille ? " (" + a.taille + ")" : "")).join(", ")}</div>
              </div>
            );
          })}
        </div>
      </details>
      </div>
    </>
  );
}
