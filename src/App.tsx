import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEcranLarge } from "./indicateurs";
import Cockpit from "./pages/Cockpit";
import { AuthProvider, useAuth } from "./auth";
import { DonneesProvider, useDonnees, useRole } from "./donnees";
import type { Role } from "./types";
import Icon from "./Icon";
import FicheAction from "./FicheAction";
import Login from "./pages/Login";
import Agenda from "./pages/Agenda";
import Actions from "./pages/Actions";
import Finances from "./pages/Finances";
import Livrables from "./pages/Livrables";
import Projets from "./pages/Projets";

function Layout({ role }: { role: Role }) {
  const { user, logout } = useAuth();
  const { donnees, erreur, setEditer } = useDonnees();
  const ecranLarge = useEcranLarge();
  const { pathname } = useLocation();
  const large = ecranLarge && pathname === "/";
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="logo"><img src="/icon.svg" alt="" /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>Projets européens</h1>
          <div className="sub">EPCI de Corse – Ports HC{role === "lecteur" ? " · lecture" : ""}</div>
        </div>
        <button className="header-logout" onClick={() => void logout()} title={user?.email ?? ""}>Quitter</button>
      </header>

      <main className={`app-main${large ? " large" : ""}`}>
        {erreur ? <div className="vide">Chargement impossible : {erreur}</div>
          : !donnees ? <div className="vide">Chargement…</div>
          : <Outlet />}
      </main>

      {role === "admin" && donnees && (
        <>
          <button className="fab" aria-label="Nouvelle action" title="Nouvelle action" onClick={() => setEditer("nouvelle")}>
            <Icon name="plus" size={28} />
          </button>
          <FicheAction />
        </>
      )}

      <nav className="tabbar">
        <NavLink to="/" end><Icon name="calendar" size={21} />Agenda</NavLink>
        <NavLink to="/actions"><Icon name="list" size={21} />Actions</NavLink>
        <NavLink to="/finances"><Icon name="euro" size={21} />Finances</NavLink>
        <NavLink to="/livrables"><Icon name="inbox" size={21} />Livrables</NavLink>
        <NavLink to="/projets"><Icon name="folder" size={21} />Projets</NavLink>
      </nav>
    </div>
  );
}

// Accueil : cockpit complet sur PC, agenda « agir vite » sur téléphone.
function Accueil() {
  return useEcranLarge() ? <Cockpit /> : <Agenda />;
}

function AuthedApp() {
  const { user, loading, logout } = useAuth();
  const role = useRole(user?.id);
  if (loading) return <div className="full-center muted">Chargement…</div>;
  if (!user) return <Login />;
  if (role === null) return <div className="full-center muted">Chargement…</div>;
  if (role === "aucun") return (
    <div className="full-center muted" style={{ flexDirection: "column", gap: 12 }}>
      <div>Ce compte n’a pas accès aux Projets européens.</div>
      <button className="btn" onClick={() => void logout()}>Changer de compte</button>
    </div>
  );
  return (
    <DonneesProvider estAdmin={role === "admin"}>
      <Routes>
        <Route element={<Layout role={role} />}>
          <Route index element={<Accueil />} />
          <Route path="actions" element={<Actions />} />
          <Route path="finances" element={<Finances />} />
          <Route path="livrables" element={<Livrables />} />
          <Route path="projets" element={<Projets />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DonneesProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AuthedApp />
      </BrowserRouter>
    </AuthProvider>
  );
}
