import { useEffect, useMemo, useState } from "react";
import { allFeedback, setFeedbackStatus, type FeedbackRow } from "../lib/feedback";
import {
  listAccounts, grantPlan, revokePlan, lastSeen, copyText, emailList,
  PLAN_BETA, PLAN_COMP, type AccountRow,
} from "../lib/accounts";
import { TopBar, Loading, ErrorText } from "../components/ui";
import {
  getOverview, getMrr, getFeatureUsage, getUserCosts, getCostDaily,
  getFeatureAdoption, type FeatureAdoption,
  getModelConfig, setModel, MODEL_CHOICES, getBudgetFlags,
  USD_TO_GBP, type Overview, type Mrr, type FeatureUsage, type UserCost, type CostDay, type ModelRow, type BudgetFlag,
} from "../lib/analytics";

const gbp = (n: number) => "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gbp0 = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="card" style={{ padding: "12px 14px", margin: 0 }}>
      <div className="muted small" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontSize: 11 }}>{label}</div>
      <div className="serif" style={{ fontSize: 24, color: warn ? "#c0492b" : "var(--pitch)", lineHeight: 1.15, marginTop: 4 }}>{value}</div>
      {sub && <div className="muted small" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [mrr, setMrr] = useState<Mrr | null>(null);
  const [feat, setFeat] = useState<FeatureUsage[]>([]);
  const [users, setUsers] = useState<UserCost[]>([]);
  const [days, setDays] = useState<CostDay[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [o, m, f, u, d] = await Promise.all([
          getOverview(), getMrr(), getFeatureUsage(), getUserCosts(), getCostDaily(),
        ]);
        setOv(o); setMrr(m); setFeat(f); setUsers(u); setDays(d);
      } catch (e) { setErr((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, []);

  const revenue = mrr?.mrr_gbp ?? 0;
  const costGbp = (ov?.cost_30d_usd ?? 0) * USD_TO_GBP;
  const margin = revenue > 0 ? (revenue - costGbp) / revenue * 100 : null;

  // Top cost users for the most recent month present.
  const topUsers = useMemo(() => {
    if (!users.length) return [];
    const latest = users[0].month;
    return users.filter((u) => u.month === latest).slice(0, 8);
  }, [users]);

  if (loading) return <Loading />;

  return (
    <div className="app">
      <TopBar title="Owner" eyebrow="Operating dashboard" />
      <div className="screen stack" style={{ gap: 16 }}>
        <ErrorText>{err}</ErrorText>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Tile label="MRR" value={gbp0(revenue)} sub={`${mrr?.active_subscriptions ?? 0} active subs`} />
          <Tile label="Margin (30d)" value={margin === null ? "n/a" : Math.round(margin) + "%"}
            sub={`rev ${gbp0(revenue)} · cost ${gbp0(costGbp)}`} warn={margin !== null && margin < 55} />
          <Tile label="Active users (30d)" value={String(ov?.active_30d ?? 0)} sub={`${ov?.active_7d ?? 0} in last 7d`} />
          <Tile label="Paying / trialing" value={String(ov?.paying_or_trialing ?? 0)} sub={`${ov?.total_users ?? 0} total users`} />
        </div>

        <AccountsPanel />
        <FeedbackPanel />
        <AdoptionPanel />

        {/* Cost by feature */}
        <div className="card stack" style={{ gap: 8 }}>
          <div className="frow" style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>Cost by feature (all time)</strong>
            <span className="muted small">30d provider cost: {gbp(costGbp)} ({"$" + (ov?.cost_30d_usd ?? 0).toFixed(2)})</span>
          </div>
          {feat.length === 0 ? <p className="muted small">No usage recorded yet.</p> : (
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead><tr style={{ textAlign: "left", color: "#889" }}>
                <th style={{ padding: "4px 0" }}>Feature</th><th>Uses</th><th>Users</th><th style={{ textAlign: "right" }}>Cost</th>
              </tr></thead>
              <tbody>
                {feat.slice(0, 12).map((f) => (
                  <tr key={f.feature} style={{ borderTop: "1px solid #eee" }}>
                    <td style={{ padding: "5px 0" }}>{f.feature}</td>
                    <td>{f.uses}</td><td>{f.users}</td>
                    <td style={{ textAlign: "right" }} className="mono">{gbp(f.cost_usd * USD_TO_GBP)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Cost trend */}
        <div className="card stack" style={{ gap: 8 }}>
          <strong>Daily provider cost (last {days.length})</strong>
          {days.length === 0 ? <p className="muted small">No cost yet.</p> : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 70 }}>
              {[...days].reverse().map((d) => {
                const max = Math.max(...days.map((x) => x.total_cost_usd), 0.0001);
                const h = Math.max(3, (d.total_cost_usd / max) * 64);
                return <div key={d.day} title={`${d.day}: ${gbp(d.total_cost_usd * USD_TO_GBP)}`}
                  style={{ flex: 1, height: h, background: "#5aa79b", borderRadius: "3px 3px 0 0" }} />;
              })}
            </div>
          )}
        </div>

        {/* Top-cost users this month */}
        <div className="card stack" style={{ gap: 8 }}>
          <strong>Top users by cost this month</strong>
          {topUsers.length === 0 ? <p className="muted small">No user costs yet.</p> : (
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead><tr style={{ textAlign: "left", color: "#889" }}>
                <th style={{ padding: "4px 0" }}>User</th><th>AI calls</th><th>Audio (min)</th><th style={{ textAlign: "right" }}>Cost</th>
              </tr></thead>
              <tbody>
                {topUsers.map((u) => (
                  <tr key={u.user_id} style={{ borderTop: "1px solid #eee" }}>
                    <td style={{ padding: "5px 0" }} className="mono">{u.user_id.slice(0, 8)}…</td>
                    <td>{u.ai_calls}</td><td>{u.audio_minutes}</td>
                    <td style={{ textAlign: "right" }} className="mono">{gbp(u.cost_usd * USD_TO_GBP)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small">Per-plan budget flags and automatic model guard arrive with the cost-governor stage.</p>
        </div>

        <BudgetPanel />
        <ModelPanel />
        <ClubQuote />
      </div>
    </div>
  );
}

// ---- Cost guard: over-budget users -----------------------------------------
function BudgetPanel() {
  const [rows, setRows] = useState<BudgetFlag[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => { getBudgetFlags().then(setRows).catch((e) => setErr((e as Error).message)); }, []);
  const over = rows.filter((r) => r.over_budget);
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <strong>Cost guard {over.length > 0 && <span style={{ color: "#c0492b" }}>· {over.length} over budget</span>}</strong>
      <p className="muted small" style={{ marginTop: -2 }}>Users past their plan's AI budget this month. Their guarded features run on the cheaper model automatically; reports stay on the quality model.</p>
      <ErrorText>{err}</ErrorText>
      {rows.length === 0 ? <p className="muted small">No user spend yet this month.</p> : (
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead><tr style={{ textAlign: "left", color: "#889" }}>
            <th style={{ padding: "4px 0" }}>User</th><th>Spent</th><th>Budget</th><th style={{ textAlign: "right" }}>State</th>
          </tr></thead>
          <tbody>
            {rows.slice(0, 10).map((r) => (
              <tr key={r.user_id} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "5px 0" }} className="mono">{r.user_id.slice(0, 8)}…</td>
                <td className="mono">{gbp(r.cost_this_month_usd * USD_TO_GBP)}</td>
                <td className="mono">{r.budget_usd >= 1e8 ? "none" : gbp(r.budget_usd * USD_TO_GBP)}</td>
                <td style={{ textAlign: "right" }}>
                  {r.over_budget
                    ? <span style={{ color: "#c0492b", fontWeight: 600 }}>guarded</span>
                    : <span className="muted">ok</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---- Owner model tiering ----------------------------------------------------
function ModelPanel() {
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [savingKey, setSaving] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { getModelConfig().then(setRows).catch((e) => setErr((e as Error).message)); }, []);

  const change = async (feature: string, model: string) => {
    setErr(""); setSaving(feature);
    setRows((rs) => rs.map((r) => (r.feature === feature ? { ...r, model } : r)));
    try { await setModel(feature, model); }
    catch (e) { setErr((e as Error).message); }
    finally { setSaving(""); }
  };

  return (
    <div className="card stack" style={{ gap: 6 }}>
      <strong>AI models</strong>
      <p className="muted small" style={{ marginTop: -2 }}>Set the tier each feature uses. Changes apply within a minute, no redeploy. Reader-facing reports are best left on Sonnet.</p>
      <ErrorText>{err}</ErrorText>
      {rows.map((r) => (
        <div key={r.feature} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #eee", padding: "6px 0" }}>
          <span className="small">{r.feature}{savingKey === r.feature ? " …" : ""}
            <em className="muted" style={{ fontSize: 11, display: "block", fontStyle: "normal" }}>
              {r.over_budget_model ? "guards to Haiku when over budget" : "protected (never downgraded)"}
            </em>
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {MODEL_CHOICES.map((c) => (
              <button key={c.id} onClick={() => change(r.feature, c.id)} className="btn ghost sm"
                style={r.model === c.id ? { background: "#dff1ee", color: "#2a7d70", borderColor: "#9fd3c9" } : {}}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Who is on what, and giving access -------------------------------------
// Three kinds of account, all of them ordinary subscription rows (0022):
// beta is a trial with a date on it, complimentary is active with no end date,
// and paid is what Stripe will set. So this panel writes nothing special, it
// just calls the two admin functions and lists the view.
function AccountsPanel() {
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<string>(PLAN_BETA);
  const [days, setDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");

  const load = () => listAccounts().then(setRows).catch((e) => setErr(e.message ?? "Could not load accounts."));
  useEffect(() => { load(); }, []);

  // Copying is silent, so without the flash back there is no way to tell it
  // worked from a tap that missed.
  const copy = async (text: string, what: string) => {
    setErr("");
    try {
      await copyText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      setErr("Could not copy. Your browser blocked it, so select the address by hand.");
    }
  };

  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setErr(""); setSaid("");
    try { setSaid(await fn()); await load(); }
    catch (e) { setErr((e as Error).message ?? "That did not work."); }
    finally { setBusy(false); }
  };

  // Beta is time-boxed, complimentary is not. Passing days for a comp would give
  // a coach you meant to gift the app to a countdown, so the form follows the
  // plan rather than leaving both boxes live.
  const timed = plan === PLAN_BETA;
  // The people you would be writing to: everyone who currently has access. Not
  // everyone who ever signed up, because a note confirming a place on the beta
  // makes no sense to someone who has not been given one.
  const withAccess = (rows ?? []).filter((r) => r.usable && r.email);
  const counts = (rows ?? []).reduce((acc, r) => {
    const key = !r.plan_id ? "none" : !r.usable ? "lapsed" : r.kind;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="row">
        <strong>Accounts</strong>
        <div className="spacer" />
        <span className="muted small">
          {(["beta", "comp", "paid", "lapsed"] as const)
            .filter((k) => counts[k])
            .map((k) => `${counts[k]} ${k === "comp" ? "complimentary" : k}`)
            .join(" · ") || "nobody yet"}
        </span>
      </div>
      <p className="muted small" style={{ marginTop: -4 }}>
        Give someone beta access for a set number of days, or complimentary
        access with no end date. They must have signed up first, and the email
        must be the one they signed up with.
      </p>

      <div className="field">
        <label htmlFor="acc-email">Their email</label>
        <input id="acc-email" type="email" value={email} placeholder="coach@example.com"
          onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn ghost sm" onClick={() => setPlan(PLAN_BETA)}
          style={{ flex: 1, ...(plan === PLAN_BETA ? { background: "#dff1ee", color: "#2a7d70", borderColor: "#9fd3c9" } : {}) }}>
          Beta, on a timer
        </button>
        <button className="btn ghost sm" onClick={() => setPlan(PLAN_COMP)}
          style={{ flex: 1, ...(plan === PLAN_COMP ? { background: "#dff1ee", color: "#2a7d70", borderColor: "#9fd3c9" } : {}) }}>
          Complimentary, no end
        </button>
      </div>

      {timed && (
        <div className="field">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="small">Days</span>
            <span className="mono small" style={{ color: "#2a7d70" }}>{days}</span>
          </div>
          <input type="range" min={7} max={365} step={7} value={days}
            onChange={(e) => setDays(+e.target.value)} style={{ width: "100%", accentColor: "#2a7d70" }} />
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn" style={{ flex: 1 }} disabled={busy || !email.trim()}
          onClick={() => run(() => grantPlan(email, plan, timed ? days : null))}>
          {busy ? "Working" : "Give access"}
        </button>
        <button className="btn ghost" disabled={busy || !email.trim()}
          onClick={() => run(() => revokePlan(email, plan))}>
          Take it back
        </button>
      </div>

      {said && <div className="banner">{said}</div>}
      <ErrorText>{err}</ErrorText>

      {rows === null ? <Loading /> : rows.length === 0 ? (
        <div className="muted small">No accounts yet.</div>
      ) : (
        <>
        {/* Granting someone access is only half of it: they do not know it
            happened until you tell them. One tap gets every address with access
            into the clipboard, ready to paste into a Bcc box. */}
        <div className="row" style={{ gap: 6, marginTop: 4 }}>
          <span className="muted small">
            {copied === "all"
              ? `${withAccess.length} ${withAccess.length === 1 ? "address" : "addresses"} copied`
              : "Tap an address to copy it"}
          </span>
          <div className="spacer" />
          <button className="btn ghost sm" disabled={!withAccess.length}
            onClick={() => copy(emailList(withAccess), "all")}>
            Copy all with access
          </button>
        </div>
        <div className="list">
          {rows.map((r) => (
            <div key={r.user_id} className="row" style={{ gap: 8, borderTop: "1px solid #eee", padding: "6px 0" }}>
              <span className="small" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                <button
                  onClick={() => r.email && copy(r.email, r.user_id)}
                  disabled={!r.email}
                  title="Copy this address"
                  style={{
                    background: "none", border: 0, padding: 0, font: "inherit",
                    color: copied === r.user_id ? "#2a7d70" : "inherit",
                    cursor: r.email ? "pointer" : "default", textAlign: "left",
                  }}
                >
                  {copied === r.user_id ? "Copied" : (r.email ?? "(no email)")}
                </button>
                <em className="muted" style={{ fontSize: 11, display: "block", fontStyle: "normal" }}>
                  {!r.plan_id ? "no plan"
                    : `${r.plan_name}${r.days_left !== null ? `, ${r.days_left} ${r.days_left === 1 ? "day" : "days"} left` : ""}`}
                </em>
                {/* The line the beta decision is actually made on. Counts and a
                    date, never content: 0026 can say a coach wrote four
                    sessions and cannot say what was in them. */}
                <em className="muted" style={{ fontSize: 11, display: "block", fontStyle: "normal" }}>
                  {r.sessions === 0 && r.notes === 0
                    ? "nothing written yet"
                    : `${r.sessions} ${r.sessions === 1 ? "session" : "sessions"}, ${r.notes} ${r.notes === 1 ? "note" : "notes"}, ${r.reflections} reflected on`}
                  {" · "}
                  {lastSeen(r.last_active)}
                </em>
              </span>
              <div className="spacer" />
              <span className={`pill ${r.usable ? "good" : ""}`}>{r.usable ? "active" : "read-only"}</span>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}

// ---- Beta: feedback inbox --------------------------------------------------
// The point of a beta is what testers tell you, so this is a working inbox
// rather than a chart: read it, mark it, move on. Newest first, and unread
// ("new") first within that, so the pile you have not looked at is at the top.
function FeedbackPanel() {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const load = () => allFeedback().then(setRows).catch((e) => setErr(e.message ?? "Could not load feedback."));
  useEffect(() => { load(); }, []);

  const mark = async (id: string, status: string) => {
    setBusy(id);
    try { await setFeedbackStatus(id, status); await load(); }
    catch (e) { setErr((e as Error).message ?? "Could not update that."); }
    finally { setBusy(""); }
  };

  const sorted = (rows ?? []).slice().sort((a, b) => {
    if ((a.status === "new") !== (b.status === "new")) return a.status === "new" ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });
  const newCount = (rows ?? []).filter((r) => r.status === "new").length;

  return (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="row">
        <strong>Feedback</strong>
        <div className="spacer" />
        <span className={`pill ${newCount ? "" : "good"}`}>
          {newCount ? `${newCount} new` : "all read"}
        </span>
      </div>
      <ErrorText>{err}</ErrorText>
      {rows === null ? (
        <Loading />
      ) : sorted.length === 0 ? (
        <div className="muted small">Nothing yet. The form is on every screen and on Account.</div>
      ) : (
        <div className="list">
          {sorted.map((f) => (
            <div key={f.id} className="card stack" style={{ gap: 6 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="tag">{f.kind}</span>
                <span className="muted small">{new Date(f.created_at).toLocaleDateString("en-GB")}</span>
                <div className="spacer" />
                {f.status !== "new" && <span className="pill good">{f.status}</span>}
              </div>
              <div>{f.message}</div>
              {typeof f.context?.path === "string" && (
                <div className="muted small mono">on {String(f.context.path)}</div>
              )}
              {f.status === "new" && (
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn small" disabled={busy === f.id}
                    onClick={() => mark(f.id, "seen")}>Mark read</button>
                  <button className="btn small" disabled={busy === f.id}
                    onClick={() => mark(f.id, "actioned")}>Actioned</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Beta: what gets used --------------------------------------------------
// Users, not uses, is the column to read first: one enthusiast can make a
// feature look adopted when nobody else has touched it.
function AdoptionPanel() {
  const [rows, setRows] = useState<FeatureAdoption[] | null>(null);
  useEffect(() => { getFeatureAdoption().then(setRows).catch(() => setRows([])); }, []);

  return (
    <div className="card stack" style={{ gap: 8 }}>
      <strong>What testers actually use</strong>
      <div className="muted small">
        From in-app activity, so this counts screens opened as well as work that
        cost money. The cost table above only sees the latter.
      </div>
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="muted small">No activity recorded yet.</div>
      ) : (
        <div className="list">
          {rows.map((r) => (
            <div key={`${r.feature}-${r.action}`} className="row" style={{ gap: 8 }}>
              <span>{r.feature.replace(/_/g, " ")}</span>
              <div className="spacer" />
              <span className="muted small">{r.users} {r.users === 1 ? "person" : "people"}</span>
              <span className="pill">{r.uses}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Club quote tool (embedded) --------------------------------------------
const PERIODS = [1, 3, 6, 12];

function ClubQuote() {
  const [coaches, setCoaches] = useState(8);
  const [players, setPlayers] = useState(120);
  const [cbase, setCbase] = useState(29.99);
  const [prate, setPrate] = useState(0.5);
  const [disc, setDisc] = useState(25);
  const [period, setPeriod] = useState(12);

  // No take-up percentage. It asked what fraction of a club's players would
  // sign up, and no player signs up: the player journey was withdrawn in 0021,
  // and a "player" is now a row on a coach's squad list, not an account. There
  // is nothing for them to take up, so the slider was quietly modelling a
  // product that does not exist and every quote built on it was fiction.
  //
  // A club is billed for the roster it actually has. That is also the honest
  // thing to sell: what the club buys is its coaches' reflection, across a
  // named squad, and the squad size is known on day one rather than guessed.
  const std = cbase + players * prate;
  const promo = std * (1 - disc / 100);
  const termTotal = promo * period;
  const saving = (std - promo) * period;
  // Cost to serve follows COACHES, not players. Every AI call in the app is
  // made by a coach writing a note or generating a report; a player on a roster
  // never signs in and never triggers one. The old line charged 30p a head
  // against players who cost nothing, which made the margin read low and would
  // have had you turning down business you could afford.
  const cost = coaches * 1.0;
  const margin = promo > 0 ? (promo - cost) / promo * 100 : 0;

  const Range = ({ label, val, set, min, max, step, fmt }: {
    label: string; val: number; set: (n: number) => void; min: number; max: number; step: number; fmt: (n: number) => string;
  }) => (
    <div className="field" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span className="small">{label}</span><span className="mono small" style={{ color: "#2a7d70" }}>{fmt(val)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={(e) => set(+e.target.value)} style={{ width: "100%", accentColor: "#2a7d70" }} />
    </div>
  );

  return (
    <div className="card stack" style={{ gap: 6 }}>
      <strong>Club quote tool</strong>
      <p className="muted small" style={{ marginTop: -2 }}>Flat base for up to 10 coaches, plus players on the roster. Offer a discount over a set term.</p>
      <Range label="Coaches" val={coaches} set={setCoaches} min={1} max={20} step={1} fmt={(n) => String(n)} />
      <Range label="Players (roster)" val={players} set={setPlayers} min={0} max={400} step={10} fmt={(n) => String(n)} />
      <Range label="Coach base (up to 10)" val={cbase} set={setCbase} min={9.99} max={49.99} step={1} fmt={gbp} />
      {/* Starts at 10p, not 99p. The old floor assumed you were only charging
          for the quarter of players who had signed up; billing the whole roster
          at the same rate quadruples a club's bill overnight. */}
      <Range label="Per player on the roster" val={prate} set={setPrate} min={0.1} max={2.99} step={0.05} fmt={gbp} />
      <Range label="Discount" val={disc} set={setDisc} min={0} max={50} step={5} fmt={(n) => n + "%"} />

      <div style={{ display: "flex", gap: 6, margin: "2px 0 10px" }}>
        {PERIODS.map((m) => (
          <button key={m} onClick={() => setPeriod(m)}
            className={"btn ghost sm"}
            style={{ flex: 1, ...(period === m ? { background: "#dff1ee", color: "#2a7d70", borderColor: "#9fd3c9" } : {}) }}>
            {m} mo
          </button>
        ))}
      </div>

      <div className="card" style={{ background: "#f4f8f7", margin: 0 }}>
        <div className="serif" style={{ fontSize: 26, color: "var(--pitch)" }}>
          {gbp(promo)}<span className="muted" style={{ fontSize: 15 }}> /month</span>
          {disc > 0 && <span className="muted small" style={{ textDecoration: "line-through", marginLeft: 8 }}>{gbp(std)}</span>}
        </div>
        <div className="small" style={{ color: "#2a7d70" }}>
          {gbp(termTotal)} over {period} {period === 1 ? "month" : "months"}{disc > 0 ? ` · saves ${gbp(saving)}` : ""}
        </div>
        <div className="muted small" style={{ marginTop: 6 }}>
          {coaches > 10 ? "Over 10 coaches: enquiry / custom quote · " : ""}
          margin at promo <b style={{ color: margin < 55 ? "#c0492b" : "#2a7d70" }}>{Math.round(margin)}%</b>
        </div>
      </div>
    </div>
  );
}
