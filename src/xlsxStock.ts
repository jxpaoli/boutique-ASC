import { stockId } from "./calc";
import type { Config, StockItem } from "./types";

// xlsx est lourd (~800 Ko) : chargé à la demande pour ne pas alourdir le démarrage de la PWA.
const loadXLSX = () => import("xlsx");

/* En-têtes du fichier d'inventaire (2 colonnes : base + réel). */
const COL = { article: "Article", taille: "Taille", base: "Qté base", reel: "Qté réelle (à remplir)" };

const norm = (s: string) => (s || "").toString().trim().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "");

const todayIso = () => { const z = (x: number) => String(x).padStart(2, "0"); const d = new Date(); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };

/** Exporte toutes les références du catalogue (article × taille) avec la quantité base et une colonne réelle vide. */
export async function exportInventaireXlsx(cfg: Config, stock: StockItem[]) {
  const XLSX = await loadXLSX();
  const map = new Map<string, number>();
  stock.forEach((s) => map.set(s.id, s.quantite));

  const rows: Record<string, string | number>[] = [];
  cfg.catalogue.forEach((art) => {
    art.tailles.forEach((t) => {
      rows.push({
        [COL.article]: art.nom,
        [COL.taille]: t,
        [COL.base]: map.get(stockId(art.nom, t)) ?? 0,
        [COL.reel]: "",
      });
    });
  });

  const ws = XLSX.utils.json_to_sheet(rows, { header: [COL.article, COL.taille, COL.base, COL.reel] });
  ws["!cols"] = [{ wch: 26 }, { wch: 12 }, { wch: 10 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventaire");
  XLSX.writeFile(wb, "inventaire_stock_" + todayIso() + ".xlsx");
}

export interface LigneImport { article: string; taille: string; base: number; reel: number; }

/**
 * Lit un fichier d'inventaire et renvoie uniquement les lignes dont la colonne « réelle » est remplie.
 * Une case vide = référence non comptée (on n'y touche pas). 0 est une valeur valide (rupture).
 */
export async function lireInventaireXlsx(file: File): Promise<LigneImport[]> {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("Fichier vide ou illisible.");
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, blankrows: false });
  if (!grid.length) return [];

  // repère la ligne d'en-tête et l'index des colonnes (tolérant aux accents / casse / réordonnancement)
  const headerRow = grid.findIndex((r) => r.some((c) => norm(String(c)).startsWith("article")));
  if (headerRow < 0) throw new Error("Colonne « Article » introuvable. Utilise le fichier exporté par l'appli.");
  const head = grid[headerRow].map((c) => norm(String(c)));
  const iArt = head.findIndex((h) => h.startsWith("article"));
  const iTaille = head.findIndex((h) => h.startsWith("taille"));
  const iBase = head.findIndex((h) => h.startsWith("qte base") || h === "base");
  const iReel = head.findIndex((h) => h.includes("reel"));
  if (iArt < 0 || iTaille < 0 || iReel < 0) throw new Error("Colonnes attendues : Article, Taille, Qté réelle.");

  const out: LigneImport[] = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    const article = String(row[iArt] ?? "").trim();
    const taille = String(row[iTaille] ?? "").trim();
    if (!article || !taille) continue;
    const raw = row[iReel];
    if (raw === undefined || raw === null || String(raw).trim() === "") continue; // non compté → ignoré
    const reel = Math.max(0, Math.round(Number(String(raw).replace(",", "."))));
    if (Number.isNaN(reel)) continue;
    const base = iBase >= 0 ? Math.round(Number(row[iBase]) || 0) : 0;
    out.push({ article, taille, base, reel });
  }
  return out;
}
