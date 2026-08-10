// Catching the one chance the browser gives you to offer "add to home screen".
//
// Chrome fires `beforeinstallprompt` once, about a second after the page loads,
// and if nothing is listening at that exact moment the offer is gone for the
// rest of the visit. The listener used to live in a useEffect inside the card on
// the Account tab, so it only started listening if a coach happened to open
// that tab, which is minutes too late. The button was there in the code and
// almost nobody ever saw it.
//
// So this module listens at load, from main.tsx, before React renders anything,
// and holds the event until something asks for it.
//
// It matters more than it sounds. Until the app is on the home screen it is a
// tab among fifty tabs, and a thought in a car park does not survive being
// looked for.
type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function watchForInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    // Without this Chrome shows its own banner on its own schedule, which is
    // usually the wrong moment and cannot be placed next to an explanation.
    e.preventDefault();
    deferred = e as BIPEvent;
    notify();
  });
  // Installed by any route, including Chrome's own menu. The offer is spent.
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export const canInstall = (): boolean => deferred !== null;

export function subscribeToInstall(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// Resolves true when they actually added it, so the caller can say something
// useful either way rather than guessing.
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    return outcome === "accepted";
  } catch {
    return false;
  } finally {
    // One shot. The event cannot be reused, and leaving it in place would give
    // a button that silently does nothing the second time.
    deferred = null;
    notify();
  }
}
