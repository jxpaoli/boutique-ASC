import { useEffect, useState } from "react";
import { boutiqueDb, supabase } from "./supabase";
import { stockId } from "./calc";
import { DEFAULT_CONFIG } from "./defaultConfig";
import type { Config, Joueur, StockItem, Preinscription, Role, Commande, Inventaire } from "./types";

type DataRow = { id: string; data: Record<string, unknown> };

function realtimeChannelName(scope: string) {
  return `boutique_asc:${scope}:${crypto.randomUUID()}`;
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function fromRow<T extends { id: string }>(row: DataRow): T {
  return { id: row.id, ...row.data } as T;
}

function useRows<T extends { id: string }>(table: string): T[] | null {
  const [rows, setRows] = useState<T[] | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await boutiqueDb.from(table).select("id,data");
      if (!active) return;
      if (error) {
        console.error(`Chargement ${table}:`, error.message);
        setRows([]);
        return;
      }
      setRows(((data ?? []) as DataRow[]).map(fromRow<T>));
    };

    void load();
    const channel = supabase
      .channel(realtimeChannelName(table))
      .on("postgres_changes", { event: "*", schema: "boutique_asc", table }, () => void load())
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [table]);

  return rows;
}

async function put(table: string, id: string, data: Record<string, unknown>) {
  const result = await boutiqueDb.from(table).upsert({ id, data, updated_at: new Date().toISOString() });
  fail(result.error);
}

async function patch(table: string, id: string, partial: Record<string, unknown>) {
  const current = await boutiqueDb.from(table).select("data").eq("id", id).maybeSingle();
  fail(current.error);
  const fallback = table === "config" ? (DEFAULT_CONFIG as unknown as Record<string, unknown>) : {};
  await put(table, id, { ...fallback, ...((current.data?.data as Record<string, unknown>) ?? {}), ...partial });
}

async function remove(table: string, id: string) {
  const result = await boutiqueDb.from(table).delete().eq("id", id);
  fail(result.error);
}

export function useConfig(): Config | null {
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await boutiqueDb.from("config").select("data").eq("id", "main").maybeSingle();
      if (!active) return;
      if (error) {
        console.error("Chargement de la configuration:", error.message);
        setConfig(DEFAULT_CONFIG);
        return;
      }
      const c = data?.data ? ({ ...(data.data as Config) }) : DEFAULT_CONFIG;
      if (c.reglements && !c.reglements.includes("2 CHEQUES")) {
        const i = c.reglements.indexOf("1 CHEQUE");
        c.reglements = i >= 0
          ? [...c.reglements.slice(0, i + 1), "2 CHEQUES", ...c.reglements.slice(i + 1)]
          : [...c.reglements, "2 CHEQUES"];
      }
      setConfig(c);
    };
    void load();
    const channel = supabase.channel(realtimeChannelName("config"))
      .on("postgres_changes", { event: "*", schema: "boutique_asc", table: "config" }, () => void load())
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, []);
  return config;
}

export async function saveConfig(cfg: Config) { await put("config", "main", cfg as unknown as Record<string, unknown>); }
export async function patchConfig(partial: Partial<Config>) { await patch("config", "main", partial as Record<string, unknown>); }

export function useJoueurs(): Joueur[] | null { return useRows<Joueur>("joueurs"); }
export async function addJoueur(j: Omit<Joueur, "id">) {
  const id = crypto.randomUUID();
  await put("joueurs", id, { ...j, createdAt: Date.now(), updatedAt: Date.now() });
  return { id };
}
export async function updateJoueur(id: string, j: Partial<Joueur>) { await patch("joueurs", id, { ...j, updatedAt: Date.now() }); }
export async function deleteJoueur(id: string) { await remove("joueurs", id); }
export async function demanderSuppression(id: string, email: string) { await patch("joueurs", id, { supprDemandee: true, supprPar: email, supprLe: Date.now() }); }
export async function annulerSuppression(id: string) { await patch("joueurs", id, { supprDemandee: false, supprPar: "", supprLe: 0 }); }

export { stockId } from "./calc";
export function useStock(): StockItem[] | null { return useRows<StockItem>("stock"); }
export async function setStockItem(article: string, taille: string, values: Partial<StockItem>) {
  const id = stockId(article, taille);
  const current = await boutiqueDb.from("stock").select("data").eq("id", id).maybeSingle();
  fail(current.error);
  await put("stock", id, {
    article, taille, quantite: 0, seuilMini: 0,
    ...((current.data?.data as Record<string, unknown>) ?? {}), ...values, id,
  });
}

export async function logInventaire(inv: Omit<Inventaire, "id">) { await put("inventaires", crypto.randomUUID(), inv as unknown as Record<string, unknown>); }
export function useInventaires(): Inventaire[] | null { return useRows<Inventaire>("inventaires"); }
export async function deleteInventaire(id: string) { await remove("inventaires", id); }

export function usePreinscriptions(): Preinscription[] | null { return useRows<Preinscription>("preinscriptions"); }
export async function addPreinscription(p: Omit<Preinscription, "id">) {
  const id = crypto.randomUUID();
  const result = await boutiqueDb.from("preinscriptions").insert({
    id,
    data: { ...p, createdAt: Date.now() },
  });
  fail(result.error);
  return { id };
}
export async function deletePreinscription(id: string) { await remove("preinscriptions", id); }

export function useRole(email: string | null | undefined): Role | "denied" | null {
  const [role, setRole] = useState<Role | "denied" | null>(null);
  useEffect(() => {
    if (!email) { setRole(null); return; }
    let active = true;
    const load = async () => {
      const { data, error } = await boutiqueDb.from("memberships").select("role").eq("email", email.toLowerCase()).maybeSingle();
      if (!active) return;
      setRole(error || !data ? "denied" : data.role as Role);
    };
    void load();
    const channel = supabase.channel(realtimeChannelName(`role:${email}`))
      .on("postgres_changes", { event: "*", schema: "boutique_asc", table: "memberships" }, () => void load())
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [email]);
  return role;
}

export function useRoles(): { email: string; role: Role }[] | null {
  const [rows, setRows] = useState<{ email: string; role: Role }[] | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await boutiqueDb.from("memberships").select("email,role").order("email");
      if (active) setRows(error ? [] : (data as { email: string; role: Role }[]));
    };
    void load();
    const channel = supabase.channel(realtimeChannelName("memberships"))
      .on("postgres_changes", { event: "*", schema: "boutique_asc", table: "memberships" }, () => void load())
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, []);
  return rows;
}

async function manageUser(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("manage-boutique-user", { body });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Gestion utilisateur impossible");
  return data as { ok: true; existing?: boolean };
}

export async function setUserRole(email: string, role: Role) { await manageUser({ action: "set-role", email: email.trim(), role }); }
export async function removeUserRole(email: string) { await manageUser({ action: "remove-access", email: email.trim() }); }
export async function creerCompte(email: string, password: string, role: Role) { return manageUser({ action: "create", email: email.trim(), password, role }); }
export async function resetUserPassword(email: string, password: string) { await manageUser({ action: "set-password", email: email.trim(), password }); }

export function useCommandes(): Commande[] | null { return useRows<Commande>("commandes"); }
export async function addCommande(c: Omit<Commande, "id">) { await put("commandes", crypto.randomUUID(), { ...c, dateCreation: Date.now() }); }
export async function updateCommande(id: string, values: Partial<Commande>) { await patch("commandes", id, values as Record<string, unknown>); }
export async function deleteCommande(id: string) { await remove("commandes", id); }

async function dump(table: string) {
  const { data, error } = await boutiqueDb.from(table).select("id,data");
  fail(error);
  return ((data ?? []) as DataRow[]).map((row) => ({ __id: row.id, ...row.data }));
}

export async function exportBase() {
  const cfg = await boutiqueDb.from("config").select("data").eq("id", "main").maybeSingle();
  fail(cfg.error);
  const [joueurs, stock, commandes, inventaires, preinscriptions] = await Promise.all([
    dump("joueurs"), dump("stock"), dump("commandes"), dump("inventaires"), dump("preinscriptions"),
  ]);
  const roleResult = await boutiqueDb.from("memberships").select("email,role");
  fail(roleResult.error);
  const roles = (roleResult.data ?? []).map((r) => ({ __id: String(r.email), role: r.role }));
  return { version: 2, date: new Date().toISOString(), config: cfg.data?.data ?? null, joueurs, stock, commandes, inventaires, preinscriptions, roles };
}

interface DumpDoc { __id: string; [key: string]: unknown }
export async function importBase(data: { config?: unknown; joueurs?: DumpDoc[]; stock?: DumpDoc[]; commandes?: DumpDoc[]; inventaires?: DumpDoc[]; preinscriptions?: DumpDoc[]; roles?: DumpDoc[] }) {
  if (data.config) await put("config", "main", data.config as Record<string, unknown>);
  const putAll = async (table: string, rows?: DumpDoc[]) => {
    for (const row of rows ?? []) {
      const { __id, ...value } = row;
      await put(table, __id || crypto.randomUUID(), value);
    }
  };
  await Promise.all([
    putAll("joueurs", data.joueurs), putAll("stock", data.stock), putAll("commandes", data.commandes),
    putAll("inventaires", data.inventaires), putAll("preinscriptions", data.preinscriptions),
  ]);
  for (const row of data.roles ?? []) await setUserRole(row.__id, (row.role as Role) || "user");
}

export async function nouvelleSaison(saison: string) {
  for (const table of ["joueurs", "commandes", "preinscriptions"]) {
    const result = await boutiqueDb.from(table).delete().neq("id", "");
    fail(result.error);
  }
  await patchConfig({ saison });
}

export async function adjustStock(article: string, taille: string, delta: number) {
  const id = stockId(article, taille);
  const current = await boutiqueDb.from("stock").select("data").eq("id", id).maybeSingle();
  fail(current.error);
  const value = (current.data?.data as Record<string, unknown>) ?? {};
  const quantite = Number(value.quantite) || 0;
  const seuilMini = Number(value.seuilMini) || 0;
  await put("stock", id, { ...value, article, taille, quantite: Math.max(0, quantite + delta), seuilMini, id });
}
