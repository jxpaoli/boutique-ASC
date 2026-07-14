import type { Joueur, Config, Cheque, StockItem, Commande } from "./types";

export const stockId = (article: string, taille: string) => (article + "__" + taille).replace(/\//g, "-");

/* ---------- Chèques ---------- */
export function chequeCount(m: string, cfg: Config): number {
  return Math.max(0, Math.round(cfg.reglesMetier.chequesParReglement[m] || 0));
}
export function splitAmount(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const out = Array(n).fill(base);
  let r = total - base * n;
  for (let i = 0; i < r; i++) out[i] += 1;
  return out;
}
export function chequeAmt(c: Cheque | undefined, total: number, n: number): number {
  return c && c.montant != null ? Math.round(Number(c.montant)) : Math.round(total / n);
}

/* ---------- Prix / reste ---------- */
function remiseTotale(p: Joueur, cfg: Config): number {
  let r = 0;
  (p.remises || []).forEach((nom) => {
    const x = cfg.remises.find((y) => y.nom === nom);
    if (x) r += Number(x.montant) || 0;
  });
  return r;
}
function paidAmount(p: Joueur, total: number, cfg: Config): number {
  const m = p.reglement || "";
  const n = chequeCount(m, cfg);
  if (n > 0) {
    let s = 0;
    const cq = p.cheques || [];
    for (let i = 0; i < n; i++) if (cq[i] && cq[i].enc) s += chequeAmt(cq[i], total, n);
    return s;
  }
  if (m && m !== cfg.reglesMetier.reglementNonRegle) return p.regOk ? total : 0;
  return 0;
}
function recoveredAmount(p: Joueur, total: number, cfg: Config): number {
  const m = p.reglement || "";
  const n = chequeCount(m, cfg);
  if (n > 0) {
    let s = 0;
    const cq = p.cheques || [];
    // un chèque encaissé est forcément récupéré (évite un "à encaisser" négatif sur données incohérentes)
    for (let i = 0; i < n; i++) if (cq[i] && (cq[i].recup || cq[i].enc)) s += chequeAmt(cq[i], total, n);
    return s;
  }
  if (m && m !== cfg.reglesMetier.reglementNonRegle) return p.regOk ? total : 0;
  return 0;
}

export interface CalcResult {
  base: number; remise: number; total: number; paye: number; recupere: number;
  reste: number; aRecuperer: number; aEncaisser: number;
}
export function calc(p: Joueur, cfg: Config): CalcResult {
  const base = cfg.licences.find((l) => l.code === p.licence)?.tarif ?? cfg.tarifs[p.licence] ?? 0;
  const remise = remiseTotale(p, cfg);
  const total = Math.max(0, base - remise);
  const paye = paidAmount(p, total, cfg);
  const recupere = recoveredAmount(p, total, cfg);
  return { base, remise, total, paye, recupere, reste: total - paye, aRecuperer: total - recupere, aEncaisser: recupere - paye };
}

export const euro = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";

/* ---------- Catégorie d'âge (FFF) ---------- */
export function saisonStart(cfg: Config): number {
  return parseInt((cfg.saison.match(/\d{4}/) || [String(new Date().getFullYear())])[0], 10);
}
export function ageDe(annee: number, cfg: Config): number {
  return saisonStart(cfg) - annee;
}
export function autoCategorie(annee: number, cfg: Config): string {
  const age = ageDe(annee, cfg);
  return cfg.reglesMetier.categoriesAge.find((r) => age >= r.ageMin && age <= r.ageMax)?.categorie || "";
}

export function packPour(cfg: Config, categorie: string, gardien: boolean): string[] {
  if (gardien && cfg.packsGardien && cfg.packsGardien[categorie]) return cfg.packsGardien[categorie];
  return (cfg.packs && cfg.packs[categorie]) || [];
}

/* ---------- Tailles par âge ---------- */
export function defaultSize(cfg: Config, article: string, age: number | null): string {
  const c = cfg.catalogue.find((x) => x.nom === article);
  if (!c || !c.tailles.length) return "";
  if (c.tailles.length === 1) return c.tailles[0];
  if (age == null) return "";
  let best = "", bd = Infinity;
  c.tailles.forEach((t) => {
    const v = cfg.reglesMetier.taillesParAge[t];
    if (v == null) return;
    const d = Math.abs(v - age);
    if (d < bd) { bd = d; best = t; }
  });
  return best;
}

/* ---------- Adulte : tailles lettres, défaut L ---------- */
export function estAdulte(cfg: Config, age: number | null): boolean {
  return age == null || age >= cfg.reglesMetier.ageAdulte;
}
// Tailles utilisables pour un joueur : pour un adulte, on enlève les tailles "… ans" (jamais en dessous des tailles adultes).
export function taillesEligibles(cfg: Config, article: string, age: number | null): string[] {
  const c = cfg.catalogue.find((x) => x.nom === article);
  if (!c) return [];
  if (estAdulte(cfg, age)) {
    const lettres = c.tailles.filter((t) => !/ans/i.test(t));
    return lettres.length ? lettres : c.tailles;
  }
  return c.tailles;
}
// Taille auto : adulte -> L (ou équivalent) ; enfant -> la plus proche de l'âge.
export function tailleAuto(cfg: Config, article: string, age: number | null): string {
  const c = cfg.catalogue.find((x) => x.nom === article);
  if (!c || !c.tailles.length) return "";
  if (c.tailles.length === 1) return c.tailles[0];
  if (estAdulte(cfg, age)) {
    const elig = taillesEligibles(cfg, article, age);
    for (const p of cfg.reglesMetier.ordreTaillesAdultes) if (elig.includes(p)) return p;
    return elig[elig.length - 1] || "";
  }
  return defaultSize(cfg, article, age);
}

/* ---------- Besoins de commande ---------- */
// Tout ce qu'il faut commander : les articles différés des joueurs (quelle que soit la config de l'article)
// + le réassort des seuils mini pour les articles dont le stock est géré.
// manque = besoin joueurs + seuil mini − stock dispo − déjà commandé
export interface BesoinCommande { article: string; taille: string; key: string; dispo: number; seuil: number; bes: number; cmd: number; manque: number }
export function besoinsCommande(cfg: Config, joueurs: Joueur[], stock: StockItem[], commandes: Commande[]): BesoinCommande[] {
  const key2 = (a: string, t: string) => a + "__" + t;
  const besoin = new Map<string, number>();
  const cibles = new Map<string, { article: string; taille: string }>();
  joueurs.forEach((j) => (j.articles || []).forEach((a) => {
    if (a.statut === "remis" || !a.taille) return;
    const k = key2(a.article, a.taille);
    besoin.set(k, (besoin.get(k) || 0) + 1);
    cibles.set(k, { article: a.article, taille: a.taille });
  }));
  cfg.catalogue.forEach((art) => { if (art.gererStock) art.tailles.forEach((t) => cibles.set(key2(art.nom, t), { article: art.nom, taille: t })); });
  const enCommande = new Map<string, number>();
  commandes.forEach((c) => {
    if (c.statut === "recue") return;
    c.lignes.forEach((l) => { const k = key2(l.article, l.taille); enCommande.set(k, (enCommande.get(k) || 0) + l.quantite); });
  });
  const stockMap = new Map(stock.map((s) => [s.id, s]));
  return [...cibles.entries()]
    .map(([k, { article, taille }]) => {
      const s = stockMap.get(stockId(article, taille));
      const dispo = s?.quantite ?? 0, seuil = s?.seuilMini ?? 0;
      const bes = besoin.get(k) || 0, cmd = enCommande.get(k) || 0;
      return { article, taille, key: k, dispo, seuil, bes, cmd, manque: Math.max(0, bes + seuil - dispo - cmd) };
    })
    .filter((x) => x.manque > 0)
    .sort((a, b) => a.article.localeCompare(b.article) || a.taille.localeCompare(b.taille));
}

/* ---------- Dates de chèques par défaut ---------- */
function isoDate(d: Date): string {
  const z = (x: number) => String(x).padStart(2, "0");
  return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
}
export function defaultChequeDates(n: number, cfg: Config): string[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out = [isoDate(today)];
  if (n > 1) {
    const jour = Math.max(1, Math.min(28, Math.round(cfg.reglesMetier.jourEncaissementCheques)));
    const delai = Math.max(0, Math.round(cfg.reglesMetier.delaiPremierChequeJours));
    let first = new Date(today.getFullYear(), today.getMonth() + 1, jour);
    if ((+first - +today) / 86400000 < delai) first = new Date(today.getFullYear(), today.getMonth() + 2, jour);
    for (let i = 1; i < n; i++) out.push(isoDate(new Date(first.getFullYear(), first.getMonth() + (i - 1), jour)));
  }
  return out;
}
