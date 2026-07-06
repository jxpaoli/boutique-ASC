import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, getDoc, getDocs } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { db, app } from "./firebase";
import { stockId } from "./calc";
import { DEFAULT_CONFIG } from "./defaultConfig";
import type { Config, Joueur, StockItem, Preinscription, Role, Commande, Inventaire } from "./types";

const configRef = doc(db, "config", "main");

export function useConfig(): Config | null {
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => {
    return onSnapshot(configRef, (snap) => {
      if (snap.exists()) {
        const c = snap.data() as Config & { systemes?: unknown; gabarits?: unknown };
        // champs hérités (grille de tailles abandonnée) : retirés — la prochaine sauvegarde des réglages purge le document
        delete c.systemes; delete c.gabarits;
        // assure la présence du mode "2 CHEQUES" (ajouté après coup)
        if (c.reglements && !c.reglements.includes("2 CHEQUES")) {
          const i = c.reglements.indexOf("1 CHEQUE");
          c.reglements = i >= 0
            ? [...c.reglements.slice(0, i + 1), "2 CHEQUES", ...c.reglements.slice(i + 1)]
            : [...c.reglements, "2 CHEQUES"];
        }
        setConfig(c);
      } else void setDoc(configRef, DEFAULT_CONFIG); // 1ère fois : on sème la config par défaut
    });
  }, []);
  return config;
}
export async function saveConfig(cfg: Config) {
  await setDoc(configRef, cfg);
}
// Met à jour seulement certains champs de la config (évite d'écraser le reste)
export async function patchConfig(partial: Partial<Config>) {
  await updateDoc(configRef, partial as Record<string, unknown>);
}

export function useJoueurs(): Joueur[] | null {
  const [joueurs, setJoueurs] = useState<Joueur[] | null>(null);
  useEffect(() => {
    return onSnapshot(collection(db, "joueurs"), (snap) => {
      setJoueurs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Joueur, "id">) })));
    });
  }, []);
  return joueurs;
}
export async function addJoueur(j: Omit<Joueur, "id">) {
  return addDoc(collection(db, "joueurs"), { ...j, createdAt: Date.now(), updatedAt: Date.now() });
}
export async function updateJoueur(id: string, j: Partial<Joueur>) {
  await updateDoc(doc(db, "joueurs", id), { ...j, updatedAt: Date.now() });
}
export async function deleteJoueur(id: string) {
  await deleteDoc(doc(db, "joueurs", id));
}
export async function demanderSuppression(id: string, email: string) {
  await updateDoc(doc(db, "joueurs", id), { supprDemandee: true, supprPar: email, supprLe: Date.now() });
}
export async function annulerSuppression(id: string) {
  await updateDoc(doc(db, "joueurs", id), { supprDemandee: false, supprPar: "", supprLe: 0 });
}

/* ---------- Stock ---------- */
export { stockId } from "./calc";

export function useStock(): StockItem[] | null {
  const [stock, setStock] = useState<StockItem[] | null>(null);
  useEffect(() => {
    return onSnapshot(collection(db, "stock"), (snap) => {
      setStock(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StockItem, "id">) })));
    });
  }, []);
  return stock;
}
export async function setStockItem(article: string, taille: string, patch: Partial<StockItem>) {
  const id = stockId(article, taille);
  await setDoc(doc(db, "stock", id), { article, taille, quantite: 0, seuilMini: 0, ...patch, id }, { merge: true });
}

/* ---------- Journal des inventaires (trace des imports Excel) ---------- */
export async function logInventaire(inv: Omit<Inventaire, "id">) {
  await addDoc(collection(db, "inventaires"), inv);
}
export function useInventaires(): Inventaire[] | null {
  const [list, setList] = useState<Inventaire[] | null>(null);
  useEffect(() => {
    return onSnapshot(collection(db, "inventaires"), (snap) => {
      setList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Inventaire, "id">) })));
    });
  }, []);
  return list;
}
export async function deleteInventaire(id: string) {
  await deleteDoc(doc(db, "inventaires", id));
}

/* ---------- Pré-inscriptions (formulaire public via QR) ---------- */
export function usePreinscriptions(): Preinscription[] | null {
  const [list, setList] = useState<Preinscription[] | null>(null);
  useEffect(() => {
    return onSnapshot(collection(db, "preinscriptions"), (snap) => {
      setList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Preinscription, "id">) })));
    });
  }, []);
  return list;
}
export async function addPreinscription(p: Omit<Preinscription, "id">) {
  return addDoc(collection(db, "preinscriptions"), { ...p, createdAt: Date.now() });
}
export async function deletePreinscription(id: string) {
  await deleteDoc(doc(db, "preinscriptions", id));
}

/* ---------- Rôles utilisateurs ---------- */
export function useRole(email: string | null | undefined): Role | null {
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    if (!email) { setRole(null); return; }
    const e = email.toLowerCase();
    const ref = doc(db, "roles", e);
    return onSnapshot(ref, async (snap) => {
      if (snap.exists()) { setRole(((snap.data().role as Role) || "user")); return; }
      // pas de rôle pour cet e-mail : si AUCUN rôle n'existe encore, le 1er connecté devient admin
      const all = await getDocs(collection(db, "roles"));
      if (all.empty) { await setDoc(ref, { role: "admin" }); setRole("admin"); }
      else setRole("user");
    });
  }, [email]);
  return role;
}
export function useRoles(): { email: string; role: Role }[] | null {
  const [list, setList] = useState<{ email: string; role: Role }[] | null>(null);
  useEffect(() => {
    return onSnapshot(collection(db, "roles"), (snap) => {
      setList(snap.docs.map((d) => ({ email: d.id, role: (d.data().role as Role) || "user" })));
    });
  }, []);
  return list;
}
export async function setUserRole(email: string, role: Role) {
  await setDoc(doc(db, "roles", email.toLowerCase().trim()), { role });
}
export async function removeUserRole(email: string) {
  await deleteDoc(doc(db, "roles", email.toLowerCase().trim()));
}
// Crée un compte Firebase Auth sans déconnecter l'admin (2ᵉ instance) + attribue le rôle.
export async function creerCompte(email: string, password: string, role: Role) {
  const secondary = initializeApp(app.options, "secondaire-" + Date.now());
  try {
    await createUserWithEmailAndPassword(getAuth(secondary), email.trim(), password);
    await signOut(getAuth(secondary));
    await setUserRole(email, role);
  } finally {
    await deleteApp(secondary);
  }
}

/* ---------- Commandes fournisseur ---------- */
export function useCommandes(): Commande[] | null {
  const [list, setList] = useState<Commande[] | null>(null);
  useEffect(() => {
    return onSnapshot(collection(db, "commandes"), (snap) => {
      setList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Commande, "id">) })));
    });
  }, []);
  return list;
}
export async function addCommande(c: Omit<Commande, "id">) {
  return addDoc(collection(db, "commandes"), { ...c, dateCreation: Date.now() });
}
export async function updateCommande(id: string, patch: Partial<Commande>) {
  await updateDoc(doc(db, "commandes", id), patch as Record<string, unknown>);
}
export async function deleteCommande(id: string) {
  await deleteDoc(doc(db, "commandes", id));
}

/* ---------- Sauvegarde / saisons ---------- */
export async function exportBase() {
  const dump = (s: { docs: { id: string; data: () => Record<string, unknown> }[] }) => s.docs.map((d) => ({ __id: d.id, ...d.data() }));
  const [cfgSnap, joueurs, stock, commandes, inventaires, preinscriptions, roles] = await Promise.all([
    getDoc(configRef),
    getDocs(collection(db, "joueurs")), getDocs(collection(db, "stock")), getDocs(collection(db, "commandes")),
    getDocs(collection(db, "inventaires")), getDocs(collection(db, "preinscriptions")), getDocs(collection(db, "roles")),
  ]);
  return {
    version: 1, date: new Date().toISOString(),
    config: cfgSnap.exists() ? cfgSnap.data() : null,
    joueurs: dump(joueurs), stock: dump(stock), commandes: dump(commandes),
    inventaires: dump(inventaires), preinscriptions: dump(preinscriptions), roles: dump(roles),
  };
}
interface DumpDoc { __id: string; [k: string]: unknown }
export async function importBase(data: { config?: unknown; joueurs?: DumpDoc[]; stock?: DumpDoc[]; commandes?: DumpDoc[]; inventaires?: DumpDoc[]; preinscriptions?: DumpDoc[]; roles?: DumpDoc[] }) {
  const tasks: Promise<unknown>[] = [];
  if (data.config) tasks.push(setDoc(configRef, data.config as Record<string, unknown>));
  const putAll = (col: string, arr?: DumpDoc[]) => (arr || []).forEach((d) => { const { __id, ...rest } = d; tasks.push(setDoc(doc(db, col, __id), rest as Record<string, unknown>)); });
  putAll("joueurs", data.joueurs); putAll("stock", data.stock); putAll("commandes", data.commandes);
  putAll("inventaires", data.inventaires); putAll("preinscriptions", data.preinscriptions); putAll("roles", data.roles);
  await Promise.all(tasks);
}
// Nouvelle saison : efface joueurs / commandes / pré-inscriptions ; garde config (nouvelle saison), stock, inventaires, rôles.
export async function nouvelleSaison(saison: string) {
  const [joueurs, commandes, preinscriptions] = await Promise.all([
    getDocs(collection(db, "joueurs")), getDocs(collection(db, "commandes")), getDocs(collection(db, "preinscriptions")),
  ]);
  const dels: Promise<unknown>[] = [];
  ([["joueurs", joueurs], ["commandes", commandes], ["preinscriptions", preinscriptions]] as const)
    .forEach(([col, snap]) => snap.docs.forEach((d) => dels.push(deleteDoc(doc(db, col, d.id)))));
  await Promise.all(dels);
  await updateDoc(configRef, { saison });
}

/* ---------- Ajustement du stock (à la remise) ---------- */
export async function adjustStock(article: string, taille: string, delta: number) {
  const id = stockId(article, taille);
  const ref = doc(db, "stock", id);
  const snap = await getDoc(ref);
  const cur = snap.exists() ? Number(snap.data().quantite) || 0 : 0;
  const seuil = snap.exists() ? Number(snap.data().seuilMini) || 0 : 0;
  await setDoc(ref, { article, taille, quantite: Math.max(0, cur + delta), seuilMini: seuil, id }, { merge: true });
}
