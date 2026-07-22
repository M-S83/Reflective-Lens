import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { useMode } from "./lib/mode";
import { Loading } from "./components/ui";
import SignIn from "./screens/SignIn";
import Home from "./screens/Home";
import Teams from "./screens/Teams";
import TeamDetail from "./screens/TeamDetail";
import NewEvent from "./screens/NewEvent";
import EventDetail from "./screens/EventDetail";
import PlayerHome from "./screens/PlayerHome";
import LogGame from "./screens/LogGame";
import PlayerReflection from "./screens/PlayerReflection";
import PlayerSummaries from "./screens/PlayerSummaries";

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

export default function App() {
  const { session, loading } = useAuth();
  const { mode } = useMode();
  if (loading) return <Loading />;
  if (!session) return <SignIn />;

  if (mode === "player") {
    return (
      <>
        <Routes>
          <Route path="/player" element={<PlayerHome />} />
          <Route path="/player/log" element={<LogGame />} />
          <Route path="/player/game/:eventId" element={<PlayerReflection />} />
          <Route path="/player/summaries" element={<PlayerSummaries />} />
          <Route path="*" element={<Navigate to="/player" replace />} />
        </Routes>
        <TabBar tabs={PLAYER_TABS} />
      </>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/teams/:teamId" element={<TeamDetail />} />
        <Route path="/new" element={<NewEvent />} />
        <Route path="/events/:eventId" element={<EventDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar tabs={COACH_TABS} />
    </>
  );
}
