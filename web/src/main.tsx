import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { EntitlementProvider } from "./lib/entitlements";
import App from "./App";
import { watchForInstallPrompt } from "./lib/install";
import "./index.css";

// Take an update the moment it is ready, rather than on the visit after next.
//
// The service worker is registered with autoUpdate, so a new one installs and
// claims the page by itself. What nothing did was RELOAD: the tab carried on
// showing the assets the old worker had already handed it, so a fix only became
// visible on the next visit. In practice that means "refresh twice", which
// nobody does, and which nobody should have to be told.
//
// It cost most of an evening here: a design that had shipped, a stuck note that
// had been fixed, and a button that was no longer black, all invisible on the
// phone in front of us while the code was right the whole time. Ten testers
// would have hit the same thing every time anything was pushed, and would have
// reported bugs that no longer existed.
//
// controllerchange fires when a new worker takes over. It also fires on the very
// first registration, when there is nothing to replace, so that case is skipped:
// reloading a page that has only just loaded looks like a fault.
// Before React renders. Chrome fires the install offer about a second after
// load, and a listener added later has already missed it.
watchForInstallPrompt();

if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <EntitlementProvider>
          <App />
        </EntitlementProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
