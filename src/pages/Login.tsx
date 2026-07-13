import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";

function messageErreur(code: string): string {
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "E-mail ou mot de passe incorrect.";
  if (code.includes("invalid-email")) return "Adresse e-mail invalide.";
  if (code.includes("too-many-requests")) return "Trop de tentatives, réessaie plus tard.";
  if (code.includes("network")) return "Pas de connexion internet.";
  return "Connexion impossible. Réessaie.";
}

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(email, pwd);
    } catch (ex: unknown) {
      const code = ex && typeof ex === "object" && "code" in ex ? String((ex as { code: string }).code) : "";
      setErr(messageErreur(code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><img src="/icon.svg" alt="AS Casinca" /></div>
        <h1>Boutique AS Casinca</h1>
        <p className="muted">Connecte-toi pour continuer</p>

        <label>E-mail</label>
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label>Mot de passe</label>
        <input type="password" autoComplete="current-password" value={pwd} onChange={(e) => setPwd(e.target.value)} required />

        {err && <div className="login-err">{err}</div>}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
