import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { useEntitlements } from "./lib/entitlements";
import { Loading } from "./components/ui";
import SignIn from "./screens/SignIn";
import Home from "./screens/Home";
import Teams from "./screens/Teams";
import TeamDetail from "./screens/TeamDetail";
import NewEvent from "./screens/NewEvent";
import EventDetail from "./screens/EventDetail";
import Dashboard from "./screens/Dashboard";
import Account from "./screens/Account";
import { Privacy, Terms, Refunds } from "./screens/Legal";
import { FeedbackButton } from "./components/Feedback";

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

  if (loading || ent.loading) return <Loading />;
  if (!session) return <SignIn />;

  // One journey. There is no mode to resolve, no role to choose, and nothing to
  // switch between: everyone who signs in is a coach. A coach whose free month
  // has lapsed keeps read access and loses the ability to add.
  const readOnly = !ent.activeRoles.includes("coach");

  const tabs = ent.isAdmin
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
      <FeedbackButton />
      <TabBar tabs={tabs} />
    </>
  );
}
