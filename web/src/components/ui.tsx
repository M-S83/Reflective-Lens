import { useEffect, useState, type ReactNode } from "react";

export function Brandmark({ size = 26 }: { size?: number }) {
  return (
    <svg className="brandmark" width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="17" stroke="var(--grass)" strokeWidth="2.6" />
      <circle cx="20" cy="20" r="8" fill="var(--grass)" fillOpacity="0.18" />
      <circle cx="20" cy="20" r="8" stroke="var(--grass)" strokeWidth="2.6" />
      <line x1="20" y1="3" x2="20" y2="37" stroke="var(--grass)" strokeWidth="1.3" strokeOpacity="0.5" />
    </svg>
  );
}

export function TopBar({ title, eyebrow, right }: { title: string; eyebrow?: string; right?: ReactNode }) {
  return (
    <header className="topbar">
      <Brandmark />
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

// beforeinstallprompt → an "Add to home screen" affordance (Android/desktop).
// iOS has no event; the UI shows a Share→Add hint there instead.
interface BIPEvent extends Event { prompt: () => Promise<void>; }
export function useInstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  const promptInstall = async () => {
    if (!evt) return;
    await evt.prompt();
    setEvt(null);
  };
  return { canInstall: !!evt, promptInstall };
}

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
