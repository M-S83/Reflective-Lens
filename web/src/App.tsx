import { useEffect } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { useMode } from "./lib/mode";
import { useEntitlements } from "./lib/entitlements";
import { Loading } from "./components/ui";
import SignIn from "./screens/SignIn";
import ChooseRole from "./screens/ChooseRole";
import Home from "./screens/Home";
import Teams from "./screens/Teams";
import TeamDetail from "./screens/TeamDetail";
import NewEvent from "./screens/NewEvent";
import EventDetail from "./screens/EventDetail";
import PlayerHome from "./screens/PlayerHome";
import LogGame from "./screens/LogGame";
import PlayerReflection from "./screens/PlayerReflection";
import PlayerSummaries from "./screens/PlayerSummaries";
import Dashboard from "./screens/Dashboard";
import Account from "./screens/Account";
import { Privacy, Terms, Refunds } from "./screens/Legal";

type Tab = { to: string; label: string; path: string };
function TabBar({ tabs }: { tabs: Tab[] }) {
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end className={({ isActive }) => (isActive ? "active" : "")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={t.path} />
          </svg>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

const COACH_TABS: Tab[] = [
  { to: "/", label: "Home", path: "M3 11l9-8 9 8M5 10v10h14V10" },
  { to: "/teams", label: "Teams", path: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M23 21v-2a4 4 0 0 0-3-3.87" },
  { to: "/new", label: "New", path: "M12 5v14M5 12h14" },
];
const PLAYER_TABS: Tab[] = [
  { to: "/player", label: "Home", path: "M3 11l9-8 9 8M5 10v10h14V10" },
  { to: "/player/log", label: "Log game", path: "M12 5v14M5 12h14" },
  { to: "/player/summaries", label: "My story", path: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" },
];
const OWNER_TAB: Tab = { to: "/admin", label: "Owner", path: "M3 3v18h18M8 17V9M13 17V5M18 17v-6" };
const ACCOUNT_TAB: Tab = { to: "/account", label: "Account", path: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" };

function RenewBanner({ label }: { label: string }) {
  return (
    <div className="banner warn" style={{ margin: "8px 12px 0" }}>
      Your {label} plan has ended. You can still read what you saved; renew to add new reflections and reports.
    </div>
  );
}

function RenewWall({ label }: { label: string }) {
  return (
    <div className="app">
      <div className="screen stack" style={{ maxWidth: 460, margin: "0 auto", paddingTop: "10vh" }}>
        <div className="card stack center">
          <h2 className="serif" style={{ margin: 0 }}>Renew to continue</h2>
          <p className="muted">Your {label} plan has ended. Renew it to create new reflections and reports. Everything you have already saved is still here to read.</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { session, loading } = useAuth();
  const ent = useEntitlements();
  const { mode, setMode } = useMode();

  // Modes the user holds: usable now, plus lapsed (read-only) ones.
  const held = session ? [...ent.activeRoles, ...ent.lapsedRoles] : [];
  const effective = held.includes(mode) ? mode : (held[0] ?? mode);

  // Keep the stored mode within what the user is entitled to. Modes are isolated:
  // a one-role user is always in that role; only a two-role user can switch.
  useEffect(() => {
    if (held.length && effective !== mode) setMode(effective);
  }, [held.length, effective, mode, setMode]);

  if (loading || ent.loading) return <Loading />;
  if (!session) return <SignIn />;
  if (held.length === 0) return <ChooseRole />;

  const readOnly = !ent.activeRoles.includes(effective);

  if (effective === "player") {
    return (
      <>
        {readOnly && <RenewBanner label="player" />}
        <Routes>
          <Route path="/player" element={<PlayerHome />} />
          <Route path="/player/log" element={readOnly ? <RenewWall label="player" /> : <LogGame />} />
          <Route path="/player/game/:eventId" element={<PlayerReflection />} />
          <Route path="/player/summaries" element={<PlayerSummaries />} />
        <Route path="/account" element={<Account />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/refunds" element={<Refunds />} />

          <Route path="*" element={<Navigate to="/player" replace />} />
        </Routes>
        <TabBar tabs={[...PLAYER_TABS, ACCOUNT_TAB]} />
      </>
    );
  }

  const coachTabs = ent.isAdmin
    ? [...COACH_TABS, ACCOUNT_TAB, OWNER_TAB]
    : [...COACH_TABS, ACCOUNT_TAB];

  return (
    <>
      {readOnly && <RenewBanner label="coach" />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/teams/:teamId" element={<TeamDetail />} />
        <Route path="/new" element={readOnly ? <RenewWall label="coach" /> : <NewEvent />} />
        <Route path="/events/:eventId" element={<EventDetail />} />
        <Route path="/account" element={<Account />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/refunds" element={<Refunds />} />
        <Route path="/admin" element={ent.isAdmin ? <Dashboard /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar tabs={coachTabs} />
    </>
  );
}
