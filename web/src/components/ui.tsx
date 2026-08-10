import { useSyncExternalStore, type ReactNode } from "react";
import { canInstall as installAvailable, promptInstall, subscribeToInstall } from "../lib/install";

// The offset: a thing and its reflection, not quite in line. The filled circle
// is the coach, the drawn one is what came back, and the overlap is the part
// that belongs to both.
//
// It replaces two concentric circles with a line through them, which is a
// crosshair. Aiming, hitting, missing, scoring. This app does not score anyone,
// so the first thing a coach saw contradicted the first thing we told them,
// every time they opened it.
//
// The first replacement drawn for this was worse: a spine running past two
// arcs, which read as the Greek letter phi and lost all its presence at 22
// pixels. Two circles have nothing to lose. See docs/brand-direction.md.
//
// TWO HALVES, TWO COLOURS, ALWAYS. In one colour this is a Venn diagram.
export function Brandmark({ size = 26 }: { size?: number }) {
  return (
    <svg className="brandmark" width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="15" cy="20" r="11.5" fill="var(--yours)" />
      <circle cx="25" cy="20" r="11.5" stroke="var(--ink)" strokeWidth="2.6" />
    </svg>
  );
}

export function TopBar({ title, eyebrow, right, left }: {
  title: string; eyebrow?: string; right?: ReactNode; left?: ReactNode;
}) {
  return (
    <header className="topbar">
      {left ?? <Brandmark />}
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="serif">{title}</h1>
      </div>
      <div className="spacer" />
      {right}
    </header>
  );
}

export function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className="spin"
      style={dark ? { borderColor: "rgba(47,138,87,.3)", borderTopColor: "var(--grass)" } : undefined}
    />
  );
}

export function Loading() {
  return (
    <div className="center-screen">
      <Spinner dark />
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="error">{children}</p>;
}

// Tiny, safe-enough markdown renderer for report content (headings, emphasis,
// bullet lists). Reports are our own generated markdown, but we still escape.
export function Markdown({ text }: { text: string }) {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/_(.+?)_/g, "<em>$1</em>");
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = (key: number) => {
    if (list.length) {
      out.push(<ul key={`ul${key}`} dangerouslySetInnerHTML={{ __html: list.map((l) => `<li>${esc(l)}</li>`).join("") }} />);
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) { list.push(line.slice(2)); return; }
    flush(i);
    if (line.startsWith("## ")) out.push(<h2 key={i} dangerouslySetInnerHTML={{ __html: esc(line.slice(3)) }} />);
    else if (line.startsWith("# ")) out.push(<h1 key={i} className="serif" dangerouslySetInnerHTML={{ __html: esc(line.slice(2)) }} />);
    else if (line.trim()) out.push(<p key={i} dangerouslySetInnerHTML={{ __html: esc(line) }} />);
  });
  flush(lines.length);
  return <div className="md">{out}</div>;
}

// beforeinstallprompt gives an "Add to home screen" button on Android and
// desktop. iOS has no such event at all, so there the UI shows the Share then
// Add steps instead, which is the only route Apple offers.
export function useInstallPrompt() {
  // Subscribes to the module that has been listening since load, rather than
  // adding a listener now: `beforeinstallprompt` fires once, seconds after the
  // page opens, and a hook that starts listening when a card mounts has already
  // missed it. See lib/install.ts.
  const canInstall = useSyncExternalStore(subscribeToInstall, installAvailable, () => false);
  return { canInstall, promptInstall };
}

// Already added to the home screen and opened from it. Matters because the two
// platforms need opposite advice, and because iOS cannot add a home screen icon
// from INSIDE an installed app: there is no Share button in that chrome. The
// setup has to happen in Safari or not at all.
export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  // iOS predates display-mode and still reports it here.
  (navigator as unknown as { standalone?: boolean }).standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
