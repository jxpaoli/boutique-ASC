import { createClient, type User } from "npm:@supabase/supabase-js@2.102.0";

type Role = "admin" | "supervision" | "user";
type Action = "create" | "set-role" | "remove-access" | "set-password";

const allowedOrigins = new Set([
  "https://packcasinca.master.corsica",
  "http://localhost:5173",
]);

function headers(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://packcasinca.master.corsica",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function response(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

async function findUser(admin: ReturnType<typeof createClient>, email: string): Promise<User | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 100) return null;
  }
  throw new Error("Trop de comptes pour effectuer la recherche.");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return response(req, { ok: false, error: "Méthode refusée" }, 405);

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return response(req, { ok: false, error: "Connexion requise" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return response(req, { ok: false, error: "Session invalide" }, 401);

    const { data: caller } = await admin.schema("boutique_asc").from("memberships")
      .select("role,active").eq("user_id", authData.user.id).maybeSingle();
    if (!caller?.active || caller.role !== "admin") {
      return response(req, { ok: false, error: "Droits administrateur requis" }, 403);
    }

    const body = await req.json() as { action?: Action; email?: string; password?: string; role?: Role };
    const email = body.email?.trim().toLowerCase() ?? "";
    if (!body.action || !email || !/^\S+@\S+\.\S+$/.test(email)) {
      return response(req, { ok: false, error: "Demande ou e-mail invalide" }, 400);
    }
    if (body.role && !["admin", "supervision", "user"].includes(body.role)) {
      return response(req, { ok: false, error: "Rôle invalide" }, 400);
    }

    let user = await findUser(admin, email);
    const existing = Boolean(user);

    if (body.action === "create") {
      if (!body.password || body.password.length < 8 || !body.role) {
        return response(req, { ok: false, error: "Mot de passe de 8 caractères minimum et rôle requis" }, 400);
      }
      if (!user) {
        const created = await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true });
        if (created.error) throw created.error;
        user = created.data.user;
      }
    }

    if (!user) return response(req, { ok: false, error: "Ce compte Supabase n’existe pas" }, 404);

    if (body.action === "remove-access") {
      if (user.id === authData.user.id) return response(req, { ok: false, error: "Tu ne peux pas retirer ton propre accès" }, 400);
      const removed = await admin.schema("boutique_asc").from("memberships").delete().eq("user_id", user.id);
      if (removed.error) throw removed.error;
      return response(req, { ok: true });
    }

    if (body.action === "set-password") {
      if (!body.password || body.password.length < 8) return response(req, { ok: false, error: "8 caractères minimum" }, 400);
      const updated = await admin.auth.admin.updateUserById(user.id, { password: body.password });
      if (updated.error) throw updated.error;
      return response(req, { ok: true });
    }

    if (!body.role) return response(req, { ok: false, error: "Rôle requis" }, 400);
    const saved = await admin.schema("boutique_asc").from("memberships").upsert({
      user_id: user.id,
      email,
      role: body.role,
      active: true,
      updated_at: new Date().toISOString(),
    });
    if (saved.error) throw saved.error;
    return response(req, { ok: true, existing });
  } catch (error) {
    console.error(error);
    return response(req, { ok: false, error: error instanceof Error ? error.message : "Erreur serveur" }, 500);
  }
});
