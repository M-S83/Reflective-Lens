import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  answerQuestion, answerQuestionVoice, enrich, generatePlayerReport, generateQuestions, getEvent, getPlayerGame,
  getReflection, questions, reports, saveTextReflection, saveVoiceReflection,
} from "../lib/db";
import type { EventRow, FollowupQuestion, PlayerGameLog, Reflection, Report } from "../lib/types";
import { ErrorText, Loading, Markdown, Spinner, TopBar } from "../components/ui";
import { RecordButton } from "../components/RecordButton";

export default function PlayerReflection() {
  const { eventId } = useParams();
  const nav = useNavigate();
  const [ev, setEv] = useState<EventRow | null>(null);
  const [game, setGame] = useState<PlayerGameLog | null>(null);
  const [ref, setRef] = useState<Reflection | null>(null);
  const [text, setText] = useState("");
  const [qs, setQs] = useState<FollowupQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [voiced, setVoiced] = useState<Set<string>>(new Set());
  const [reportList, setReportList] = useState<Report[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const voiceAnswer = async (qid: string, blob: Blob) => {
    setErr("");
    try { await answerQuestionVoice(qid, blob); setVoiced((v) => new Set(v).add(qid)); }
    catch (e) { setErr((e as Error).message); }
  };

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const [e, g, r, rep] = await Promise.all([
        getEvent(eventId), getPlayerGame(eventId), getReflection(eventId), reports(eventId),
      ]);
      setEv(e); setGame(g); setRef(r); setReportList(rep);
      if (r) { setText(r.raw_transcript ?? ""); setQs(await questions(r.id)); }
    } catch (e) { setErr((e as Error).message); }
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  if (!eventId) return null;
  if (!ev) return err ? <div className="app"><div className="screen"><ErrorText>{err}</ErrorText></div></div> : <Loading />;

  const saveAccount = async () => {
    setBusy("save"); setErr("");
    try { setRef(await saveTextReflection(eventId, text.trim(), "player")); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  };
  const saveVoice = async (blob: Blob) => {
    setBusy("voice"); setErr("");
    try { setRef(await saveVoiceReflection(eventId, blob, "player")); setTimeout(load, 800); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  };
  const askQuestions = async () => {
    if (!ref) return;
    setBusy("q"); setErr("");
    try { await generateQuestions(ref.id); setQs(await questions(ref.id)); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  };
  const weave = async () => {
    if (!ref) return;
    setBusy("enrich"); setErr("");
    try {
      for (const q of qs) { const a = answers[q.id]?.trim(); if (a && !voiced.has(q.id)) await answerQuestion(q.id, a); }
      await enrich(ref.id); await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  };
  const makeReport = async () => {
    setBusy("report"); setErr("");
    try { await generatePlayerReport(eventId); setReportList(await reports(eventId)); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  };

  return (
    <div className="app">
      <TopBar title={ev.title} eyebrow="Your game"
        right={<button className="btn ghost sm" onClick={() => nav("/player")}>Done</button>} />
      <div className="screen stack">
        {game && (
          <div className="card">
            <div className="row wrap" style={{ gap: 8 }}>
              {game.result && <span className={`pill ${game.result === "win" ? "good" : game.result === "loss" ? "crit" : ""}`}>{game.result}</span>}
              {game.goals_for != null && game.goals_against != null && <span className="pill">{game.goals_for}-{game.goals_against}</span>}
              {game.positions?.length > 0 && <span className="pill">{game.positions.join(", ")}</span>}
              {game.role && <span className="pill">{game.role.replace("_", " ")}</span>}
              {game.minutes_played != null && <span className="pill">{game.minutes_played} min</span>}
              {game.my_goals > 0 && <span className="pill good">{game.my_goals} ⚽</span>}
              {game.my_assists > 0 && <span className="pill">{game.my_assists} assist{game.my_assists > 1 ? "s" : ""}</span>}
            </div>
          </div>
        )}

        <div className="card stack">
          <h2 className="serif">What was the game like for you?</h2>
          <p className="muted small">In your own words, written or spoken. This is just for you.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
            placeholder="How did it feel? What went well, what was hard?" />
          <button className="btn" onClick={saveAccount} disabled={busy === "save" || !text.trim()}>
            {busy === "save" ? <Spinner /> : ref ? "Update" : "Save"}
          </button>
          <div style={{ borderTop: "1px solid var(--faint)", paddingTop: 12 }}>
            <RecordButton onComplete={saveVoice} label="…or record your account" />
          </div>
          <ErrorText>{err}</ErrorText>
        </div>

        {ref?.enriched_summary && (
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 6 }}>Your reflection, with more</div>
            <p>{ref.enriched_summary}</p>
          </div>
        )}

        {ref && (
          <div className="card stack">
            <div className="row">
              <h2 className="serif">Reflect a little deeper</h2>
              <div className="spacer" />
              <button className="btn subtle sm" onClick={askQuestions} disabled={busy === "q"}>
                {busy === "q" ? <Spinner /> : qs.length ? "Refresh" : "Ask me"}
              </button>
            </div>
            <p className="muted small">Open questions from your own account, including anything your coach
              said to you, and what you made of it. Answer by voice or text, or skip.</p>
            {qs.map((q) => (
              <div key={q.id} className="field">
                <label>{q.question_text}</label>
                <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <input style={{ flex: 1 }}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    placeholder={voiced.has(q.id) ? "Saved by voice ✓" : "Type your answer…"} />
                  <RecordButton compact onComplete={(b) => voiceAnswer(q.id, b)} />
                </div>
              </div>
            ))}
            {qs.length > 0 && (
              <button className="btn" onClick={weave} disabled={busy === "enrich"}>
                {busy === "enrich" ? <Spinner /> : "Weave in my answers"}
              </button>
            )}
          </div>
        )}

        {ref && (
          <div className="card stack">
            <div className="row">
              <h2 className="serif">Your focus for next</h2>
              <div className="spacer" />
              <button className="btn subtle sm" onClick={makeReport} disabled={busy === "report"}>
                {busy === "report" ? <Spinner /> : reportList.length ? "Refresh" : "Draw it out"}
              </button>
            </div>
            <p className="muted small">Points drawn from your own answers. Never graded, never imposed.</p>
            {reportList.map((r) => (
              <div key={r.id}>{r.content_markdown && <Markdown text={r.content_markdown} />}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
