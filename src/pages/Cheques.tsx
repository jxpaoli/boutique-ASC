import { useMemo, useState } from "react";
import { useConfig, useJoueurs, updateJoueur } from "../data";
import { calc, euro, chequeCount, chequeAmt } from "../calc";
import Icon from "../Icon";
import type { Cheque, Config, Joueur } from "../types";

const todayIso = () => {
  const d = new Date(); const z = (x: number) => String(x).padStart(2, "0");
  return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
};

function withMontants(j: Joueur, cfg: Config): Cheque[] {
  const total = calc(j, cfg).total;
  const n = chequeCount(j.reglement, cfg);
  return j.cheques.map((ch) => ({ ...ch, montant: chequeAmt(ch, total, n) }));
}

export default function Cheques() {
  const cfg = useConfig();
  const joueurs = useJoueurs();
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<"arecuperer" | "aencaisser" | "amettre" | "" | "encaisse">("aencaisser");

  const today = todayIso();

  const patchCheque = (j: Joueur, idx: number, patch: Partial<Cheque>) => {
    const cheques = j.cheques.map((ch, k) => (k === idx ? { ...ch, ...patch } : ch));
    void updateJoueur(j.id, { cheques });
  };
  const setMontant = (j: Joueur, idx: number, val: number) => {
    const cheques = withMontants(j, cfg!);
    cheques[idx] = { ...cheques[idx], montant: Math.max(0, Math.round(val || 0)) };
    void updateJoueur(j.id, { cheques });
  };
  const equilibrer = (j: Joueur, idx: number) => {
    const cheques = withMontants(j, cfg!);
    const total = calc(j, cfg!).total;
    let autres = 0;
    cheques.forEach((ch, k) => { if (k !== idx) autres += ch.montant || 0; });
    cheques[idx] = { ...cheques[idx], montant: Math.max(0, total - autres) };
    void updateJoueur(j.id, { cheques });
  };

  const { items, resume } = useMemo(() => {
    type Item = { j: Joueur; idx: number; montant: number; dateRecup: string; datePrev: string; recup: boolean; enc: boolean; ecart: number; n: number };
    const out: Item[] = [];
    if (!cfg || !joueurs) return { items: out, resume: { nb: 0, montant: 0, retard: 0 } };
    joueurs.forEach((j) => {
      const n = chequeCount(j.reglement, cfg);
      if (!n) return;
      const total = calc(j, cfg).total;
      const somme = j.cheques.reduce((s, ch) => s + chequeAmt(ch, total, n), 0);
      const ecart = total - somme;
      j.cheques.forEach((ch, idx) =>
        out.push({ j, idx, montant: chequeAmt(ch, total, n), dateRecup: ch.dateRecup || "", datePrev: ch.datePrev || "", recup: !!ch.recup, enc: !!ch.enc, ecart, n })
      );
    });
    const aenc = out.filter((it) => !it.enc);
    const resume = { nb: aenc.length, montant: aenc.reduce((s, it) => s + it.montant, 0), retard: aenc.filter((it) => it.datePrev && it.datePrev < today).length };
    const ql = q.trim().toLowerCase();
    const filtered = out
      .filter((it) => {
        if (filtre === "arecuperer" && it.recup) return false;
        if (filtre === "aencaisser" && (it.enc || !it.recup)) return false;
        if (filtre === "amettre" && (it.enc || !it.recup || !(it.datePrev && it.datePrev <= today))) return false;
        if (filtre === "encaisse" && !it.enc) return false;
        if (ql && !(it.j.nom + " " + it.j.prenom).toLowerCase().includes(ql)) return false;
        return true;
      })
      .sort((a, b) => (a.datePrev || "9999").localeCompare(b.datePrev || "9999"));
    return { items: filtered, resume };
  }, [cfg, joueurs, q, filtre, today]);

  if (!cfg || !joueurs) return <div className="muted" style={{ padding: 20 }}>Chargement…</div>;

  // encaissement groupé : tous les chèques affichés déjà récupérés (jour de remise en banque)
  const encaissables = items.filter((it) => it.recup && !it.enc);
  const encaisserAffiches = async () => {
    if (!confirm("Marquer " + encaissables.length + " chèque(s) récupéré(s) comme encaissés ?\n(montant : " + euro(encaissables.reduce((s, it) => s + it.montant, 0)) + ")")) return;
    const parJoueur = new Map<string, { j: Joueur; idxs: number[] }>();
    encaissables.forEach((it) => {
      const e = parJoueur.get(it.j.id) || { j: it.j, idxs: [] };
      e.idxs.push(it.idx); parJoueur.set(it.j.id, e);
    });
    for (const { j, idxs } of parJoueur.values()) {
      const cheques = j.cheques.map((ch, k) => (idxs.includes(k) ? { ...ch, enc: true } : ch));
      await updateJoueur(j.id, { cheques });
    }
  };

  return (
    <>
      <div className="totaux">
        <div className="t-item"><span>À encaisser</span><b>{resume.nb}</b></div>
        <div className="t-item hold"><span>Montant</span><b>{euro(resume.montant)}</b></div>
        <div className="t-item due"><span>En retard</span><b>{resume.retard}</b></div>
      </div>

      <input className="search" type="search" placeholder="Rechercher un joueur…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        <button className={"chip" + (filtre === "arecuperer" ? " on" : "")} onClick={() => setFiltre("arecuperer")}>À récupérer</button>
        <button className={"chip" + (filtre === "aencaisser" ? " on" : "")} onClick={() => setFiltre("aencaisser")}>À encaisser</button>
        <button className={"chip" + (filtre === "amettre" ? " on" : "")} onClick={() => setFiltre("amettre")}>À mettre à encaissement</button>
        <button className={"chip" + (filtre === "" ? " on" : "")} onClick={() => setFiltre("")}>Tous</button>
        <button className={"chip" + (filtre === "encaisse" ? " on" : "")} onClick={() => setFiltre("encaisse")}>Encaissés</button>
      </div>

      {filtre === "amettre" && encaissables.length > 0 && (
        <button className="mini icobtn" style={{ marginTop: 8 }} onClick={() => void encaisserAffiches()}>
          <Icon name="bank" size={15} className="ico-svg" /> Encaisser les {encaissables.length} chèque(s) arrivé(s) à échéance
        </button>
      )}

      <div className="muted" style={{ margin: "10px 0 6px", fontSize: 13 }}>{items.length} chèque(s)</div>
      {items.length === 0 && <div className="card muted">Aucun chèque.</div>}

      {items.map((it) => {
        const late = !it.enc && it.datePrev && it.datePrev < today;
        return (
          <div key={it.j.id + "-" + it.idx} className={"chq-card" + (it.enc ? " done" : "") + (late ? " late" : "")}>
            <div className="cc-top">
              <b>{it.j.nom}</b> {it.j.prenom} <span className="muted">· {it.j.gardien && <Icon name="shield" size={12} className="ico-svg" />}{it.j.categorie} · Chèque {it.idx + 1}/{it.n}</span>
              {it.ecart !== 0 && <span className="badge no" style={{ marginLeft: 6 }}><Icon name="alert" size={12} className="ico-svg" /> écart {euro(it.ecart)}</span>}
            </div>
            <div className="cc-row">
              <span className="dt">Récup. <input type="date" value={it.dateRecup} onChange={(e) => patchCheque(it.j, it.idx, { dateRecup: e.target.value })} /></span>
              <span className="dt">Dépôt <input type="date" value={it.datePrev} onChange={(e) => patchCheque(it.j, it.idx, { datePrev: e.target.value })} />{late && <span className="late-b"> RETARD</span>}</span>
            </div>
            <div className="cc-row">
              <span className="mt"><input type="number" value={it.montant} onChange={(e) => setMontant(it.j, it.idx, +e.target.value)} /> €</span>
              <button className="mini" onClick={() => equilibrer(it.j, it.idx)} title="= total − les autres">=</button>
              <label className="check"><input type="checkbox" checked={it.recup} onChange={(e) => patchCheque(it.j, it.idx, { recup: e.target.checked, dateRecup: e.target.checked && !it.dateRecup ? today : it.dateRecup, ...(e.target.checked ? {} : { enc: false }) })} /> Récupéré</label>
              <label className="check"><input type="checkbox" checked={it.enc} onChange={(e) => patchCheque(it.j, it.idx, { enc: e.target.checked, ...(e.target.checked && !it.recup ? { recup: true, dateRecup: it.dateRecup || today } : {}) })} /> Encaissé</label>
            </div>
          </div>
        );
      })}
    </>
  );
}
