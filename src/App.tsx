import { BrowserRouter, Routes, Route, NavLink, Outlet, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { useConfig, useRole } from "./data";
import type { Role } from "./types";
import Icon from "./Icon";
import Login from "./pages/Login";
import Joueurs from "./pages/Joueurs";
import FicheJoueur from "./pages/FicheJoueur";
import TableauBord from "./pages/TableauBord";
import Stock from "./pages/Stock";
import Parametres from "./pages/Parametres";
import Inscription from "./pages/Inscription";
import Preinscriptions from "./pages/Preinscriptions";

function Layout({ role }: { role: Role }) {
  const { user, logout } = useAuth();
  const cfg = useConfig();
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="logo"><img src="/icon.svg" alt="AS Casinca" /></div>
        <div style={{ flex: 1 }}>
          <h1>Boutique AS Casinca</h1>
          <div className="sub">{cfg?.reglesMetier.libellesRoles[role] || role}</div>
        </div>
        <button className="header-logout" onClick={logout} title={user?.email ?? ""}>Quitter</button>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <nav className="tabbar">
        <NavLink to="/" end><Icon name="list" size={21} className="ico" />Joueurs</NavLink>
        {role !== "user" && <NavLink to="/dashboard"><Icon name="chart" size={21} className="ico" />Tableau</NavLink>}
        <NavLink to="/stock"><Icon name="box" size={21} className="ico" />Stock</NavLink>
        {role === "admin" && <NavLink to="/parametres"><Icon name="gear" size={21} className="ico" />Réglages</NavLink>}
      </nav>
    </div>
  );
}

function AuthedApp() {
  const { user, loading, logout } = useAuth();
  const role = useRole(user?.email);
  if (loading) return <div className="full-center muted">Chargement…</div>;
  if (!user) return <Login />;
  if (role === null) return <div className="full-center muted">Chargement…</div>;
  if (role === "denied") return (
    <div className="full-center muted" style={{ flexDirection: "column", gap: 12 }}>
      <div>Ce compte n’a pas accès à Boutique ASC.</div>
      <button className="mini" onClick={() => void logout()}>Changer de compte</button>
    </div>
  );
  return (
    <Routes>
      <Route element={<Layout role={role} />}>
        <Route index element={<Joueurs role={role} />} />
        <Route path="joueur/:id" element={<FicheJoueur role={role} />} />
        <Route path="preinscriptions" element={<Preinscriptions />} />
        {role !== "user" && <Route path="dashboard" element={<TableauBord />} />}
        <Route path="stock" element={<Stock />} />
        {role === "admin" && <Route path="parametres" element={<Parametres />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/inscription" element={<Inscription />} />
          <Route path="/*" element={<AuthedApp />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
