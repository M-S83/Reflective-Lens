import { Link, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { useEntitlements } from "./lib/entitlements";
import { Loading } from "./components/ui";
import SignIn from "./screens/SignIn";
import { SetPasswordForm } from "./components/SetPassword";
import { Brandmark } from "./components/ui";
import Home from "./screens/Home";
import Teams from "./screens/Teams";
import TeamDetail from "./screens/TeamDetail";
import NewEvent from "./screens/NewEvent";
import EventDetail from "./screens/EventDetail";
import Dashboard from "./screens/Dashboard";
import Account from "./screens/Account";
import Reports from "./screens/Reports";
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
const REPORTS_TAB: Tab = { to: "/reports", label: "Reports", path: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" };
const ACCOUNT_TAB: Tab = { to: "/account", label: "Account", path: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" };

// What a coach sees when their access runs out.
//
// This used to say "renew", which is a door that does not open: Stripe is not
// wired in, there is no plan chooser, and nothing in the app can take money. So
// the most engaged tester, on the day their free month ends, was told to do the
// one thing that is impossible, and would reasonably conclude the beta was over
// and stop. Say what is true instead, and give them the one action that works.
//
// When paying does exist this becomes a real renew prompt. Until then it does
// not pretend to be one.
function LapsedBanner() {
  return (
    <div className="banner warn" style={{ margin: "8px 12px 0" }}>
      Your free access has ended, so nothing new can be added for now. Everything
      you have written is still here to read. Nothing is being charged while the
      app is in beta, so ask on the <Link to="/account">Account</Link> tab and we
      will turn it back on.
    </div>
  );
}

function LapsedWall() {
  return (
    <div className="app">
      <div className="screen stack" style={{ maxWidth: 460, margin: "0 auto", paddingTop: "10vh" }}>
        <div className="card stack center">
          <h2 className="serif" style={{ margin: 0 }}>Your access has ended</h2>
          <p className="muted">
            Everything you have already written is still here, and you can read
            and export all of it. Starting something new is off for the moment.
          </p>
          <p className="muted">
            Nothing is being charged while the app is in beta. If you would like
            to carry on, say so on the Account tab and we will switch it back on.
          </p>
          <Link className="btn block" to="/account">Go to Account</Link>
        </div>
      </div>
    </div>
  );
}

// Arriving on a reset link. The link has already signed them in, so without
// this they would land on Home with the same password that did not work, and
// the only way back next time is another email.
//
// Reached by PATH (/set-password), which is what resetPasswordForEmail asks
// Supabase to redirect to. The recovery FLAG is kept as a second route in, for
// a link made before this change or a template pointed at the root, but the
// path is the one that can be relied on.
function ChooseNewPassword() {
  const { passwordSet } = useAuth();
  const navigate = useNavigate();
  const done = () => {
    passwordSet();
    // Off the reset path, so a refresh does not put them back on a screen
    // asking for a password they have just set.
    navigate("/", { replace: true });
  };
  return (
    <div className="app">
      <div className="screen stack" style={{ maxWidth: 420, margin: "0 auto", paddingTop: "8vh" }}>
        <div className="center stack" style={{ gap: 8, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "center" }}><Brandmark size={54} /></div>
          <h1 className="serif" style={{ fontSize: 24, color: "var(--pitch)" }}>Choose a password</h1>
          <p className="muted">Set one now and you can sign in with it from any device, with no more emails.</p>
        </div>
        <div className="card stack">
          <SetPasswordForm cta="Save and continue" onDone={done} />
        </div>
      </div>
    </div>
  );
}

// A reset link is one-shot and time-limited. Opened twice, or opened after it
// expired, it lands here with no session. Falling through to the sign-in form
// would leave someone certain they had done as they were told, staring at the
// screen they were trying to get past.
function ResetLinkExpired() {
  return (
    <div className="app">
      <div className="screen stack" style={{ maxWidth: 420, margin: "0 auto", paddingTop: "8vh" }}>
        <div className="center stack" style={{ gap: 8, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "center" }}><Brandmark size={54} /></div>
          <h1 className="serif" style={{ fontSize: 24, color: "var(--pitch)" }}>That link has expired</h1>
        </div>
        <div className="card stack">
          <p className="muted">
            Reset links only work once, and not for long. Ask for a fresh one and
            it will bring you straight to a screen to choose a password.
          </p>
          <Link className="btn block" to="/">Back to signing in</Link>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { session, loading, recovery } = useAuth();
  const ent = useEntitlements();

  if (loading || ent.loading) return <Loading />;

  // The legal pages are PUBLIC, and sit above the sign-in gate deliberately.
  // They were inside it, which meant the one moment a coach most needs to read
  // what happens to their notes about children, before handing any over, was
  // the one moment they could not: the link bounced them to a sign-in screen.
  // Nothing on these pages is personal to anyone, so there is nothing to gate.
  if (!session) {
    return (
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/refunds" element={<Refunds />} />
        {/* A reset link that has expired, or was opened twice, arrives here
            with no session. Landing silently on a sign-in form leaves someone
            certain they followed the instructions and none the wiser. */}
        <Route path="/set-password" element={<ResetLinkExpired />} />
        <Route path="*" element={<SignIn />} />
      </Routes>
    );
  }
  if (recovery) return <ChooseNewPassword />;

  // One journey. There is no mode to resolve, no role to choose, and nothing to
  // switch between: everyone who signs in is a coach. A coach whose free month
  // has lapsed keeps read access and loses the ability to add.
  const readOnly = !ent.activeRoles.includes("coach");

  const tabs = ent.isAdmin
    ? [...COACH_TABS, REPORTS_TAB, ACCOUNT_TAB, OWNER_TAB]
    : [...COACH_TABS, REPORTS_TAB, ACCOUNT_TAB];

  return (
    <>
      {readOnly && <LapsedBanner />}
      <Routes>
        <Route path="/" element={<Home />} />
        {/* The home screen shortcut lands here. Same screen, but the thought
            recorder is already open with the microphone first, so it is one tap
            from the icon to speaking rather than four. */}
        <Route path="/capture" element={<Home capture />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/teams/:teamId" element={<TeamDetail />} />
        <Route path="/new" element={readOnly ? <LapsedWall /> : <NewEvent />} />
        <Route path="/events/:eventId" element={<EventDetail />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/account" element={<Account />} />
        <Route path="/set-password" element={<ChooseNewPassword />} />
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
