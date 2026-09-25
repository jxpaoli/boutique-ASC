import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { db } from "./supabase";
import type { Action, DocumentProjet, Echeance, EtapePeriode, Evenement, Livrable, Passage, Periode, Projet, Role, StatutAction } from "./types";

export interface Donnees {
  projets: Projet[];
  actions: Action[];
  echeances: Echeance[];
  livrables: Livrable[];
  periodes: Periode[];
  etapes: EtapePeriode[];
  evenements: Evenement[];
  dernierPassage: Passage | null;
  documents: DocumentProjet[];
  parametres: Record<string, string>;
}

interface DonneesCtx {
  donnees: Donnees | null;
  erreur: string;
  estAdmin: boolean;
  recharger: () => Promise<void>;
  projet: (id: string) => Projet | undefined;
  cocherAction: (a: Action) => Promise<void>;
  enregistrerAction: (a: Partial<Action> & Pick<Action, "projet_id" | "libelle">) => Promise<string>;
  supprimerAction: (id: string) => Promise<string>;
  commenter: (actionId: string, message: string) => Promise<string>;
  // Action ouverte dans la fiche d'édition : une action existante, "nouvelle", ou null (fermée).
  editer: Action | "nouvelle" | null;
  setEditer: (a: Action | "nouvelle" | null) => void;
}

const Ctx = createContext<DonneesCtx>(null as unknown as DonneesCtx);
export const useDonnees = () => useContext(Ctx);

async function lire<T>(table: string, ordre: string): Promise<T[]> {
  const { data, error } = await db.from(table).select("*").order(ordre, { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as T[];
}

export function DonneesProvider({ estAdmin, children }: { estAdmin: boolean; children: ReactNode }) {
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState("");
  const [editer, setEditer] = useState<Action | "nouvelle" | null>(null);

  const recharger = useCallback(async () => {
    try {
      const [projets, actions, echeances, livrables, periodes, etapes, evenements, passages, documents, parametres] = await Promise.all([
        lire<Projet>("projets", "acronyme"),
        lire<Action>("actions", "echeance"),
        lire<Echeance>("echeances", "date"),
        lire<Livrable>("livrables", "echeance"),
        lire<Periode>("periodes", "numero"),
        lire<EtapePeriode>("etapes_periode", "date_limite"),
        lire<Evenement>("actions_evenements", "id"),
        db.from("passages_secretaire").select("*").order("debut", { ascending: false }).limit(1)
          .then(({ data, error }) => { if (error) throw error; return (data ?? []) as Passage[]; }),
        lire<DocumentProjet>("documents", "nom"),
        lire<{ cle: string; valeur: string }>("parametres", "cle"),
      ]);
      setDonnees({ projets, actions, echeances, livrables, periodes, etapes, evenements, dernierPassage: passages[0] ?? null,
        documents, parametres: Object.fromEntries(parametres.map((p) => [p.cle, p.valeur])) });
      setErreur("");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Chargement impossible");
    }
  }, []);

  useEffect(() => { void recharger(); }, [recharger]);

  const projet = (id: string) => donnees?.projets.find((p) => p.id === id);

  // Coche / décoche une action : affichage immédiat, puis enregistrement ; retour arrière si la base refuse.
  const cocherAction = async (a: Action) => {
    const statut: StatutAction = a.statut === "fait" ? "a_faire" : "fait";
    const remplacer = (s: StatutAction) => setDonnees((d) => d && ({
      ...d, actions: d.actions.map((x) => (x.id === a.id ? { ...x, statut: s } : x)),
    }));
    remplacer(statut);
    const { error } = await db.from("actions").update({ statut }).eq("id", a.id);
    if (error) {
      remplacer(a.statut);
      alert(`Modification impossible : ${error.message}`);
      return;
    }
    await recharger();
  };

  // Création (sans id) ou modification d'une action ; renvoie un message d'erreur, ou "" si c'est enregistré.
  const enregistrerAction = async (a: Partial<Action> & Pick<Action, "projet_id" | "libelle">) => {
    const { id, updated_at, ...champs } = a;
    if (id) {
      // Refusé si quelqu'un (le secrétaire) a modifié l'action depuis son ouverture : pas d'écrasement silencieux.
      const { data, error } = await db.from("actions").update(champs).eq("id", id).eq("updated_at", updated_at!).select("id");
      if (error) return error.message;
      if (!data?.length) { await recharger(); return "Cette action vient d'être modifiée par ailleurs. Elle a été rechargée : vérifie et réessaie."; }
    } else {
      const { error } = await db.from("actions").insert(champs);
      if (error) return error.message;
    }
    await recharger();
    return "";
  };

  const commenter = async (actionId: string, message: string) => {
    const { error } = await db.from("actions_evenements").insert({ action_id: actionId, type: "commentaire", message });
    if (error) return error.message;
    await recharger();
    return "";
  };

  const supprimerAction = async (id: string) => {
    const { error } = await db.from("actions").delete().eq("id", id);
    if (error) return error.message;
    await recharger();
    return "";
  };

  return (
    <Ctx.Provider value={{ donnees, erreur, estAdmin, recharger, projet, cocherAction, enregistrerAction, supprimerAction, commenter, editer, setEditer }}>
      {children}
    </Ctx.Provider>
  );
}

// Rôle du compte connecté dans l'appli ; "aucun" si le compte n'est pas inscrit.
export function useRole(userId: string | undefined): Role | "aucun" | null {
  const [role, setRole] = useState<Role | "aucun" | null>(null);
  useEffect(() => {
    if (!userId) return;
    let actif = true;
    void db.from("roles_appli").select("role").eq("user_id", userId).maybeSingle().then(({ data, error }) => {
      if (!actif) return;
      setRole(error || !data ? "aucun" : (data.role as Role));
    });
    return () => { actif = false; };
  }, [userId]);
  return role;
}
