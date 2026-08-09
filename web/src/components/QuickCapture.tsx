import { useState } from "react";
import { isIOS, isStandalone, useInstallPrompt } from "./ui";

// Setting up one tap from a phone to the microphone.
//
// The thing a coach loses is the thought on the drive home, and what loses it is
// the taps. /capture removes the ones inside the app. This removes the ones
// before it, by explaining the bit that is not discoverable on either platform.
//
// It has to be told differently in three situations, which is why this is a
// component rather than a paragraph:
//
//   iOS in Safari      Share, then Add to Home Screen. Only possible HERE: an
//                      installed iOS app has no Share button in its chrome, so
//                      an instruction shown inside the app is an instruction
//                      nobody can follow.
//   iOS installed      Cannot be done from in here. Says so, and gives the
//                      address to open in Safari instead.
//   Android            A long press on the icon already offers it, from the
//                      manifest shortcut. Nothing to set up, just to be told.
//
// Written to be dismissible and quiet. A coach who does not want a second icon
// should not be asked twice.
export function QuickCapture({ onCapturePage = false }: { onCapturePage?: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const { canInstall, promptInstall } = useInstallPrompt();
  const url = `${window.location.origin}/capture`;
  const [copied, setCopied] = useState(false);

  if (dismissed) return null;

  const ios = isIOS();
  const installed = isStandalone();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* a phone that refuses the clipboard still shows the address */ }
  };

  return (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="row">
        <strong>One tap to record</strong>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={() => setDismissed(true)}>Not now</button>
      </div>

      {ios && !installed && (
        <>
          <div className="muted small">
            {onCapturePage
              ? "Add this page to your home screen and you can record a thought in one tap, without opening the app first."
              : "You can put a second icon on your home screen that opens straight into recording."}
          </div>
          <ol className="muted small" style={{ margin: 0, paddingLeft: 18 }}>
            {!onCapturePage && <li>Open <span className="mono">{url}</span> in Safari</li>}
            <li>Tap the Share button, the square with the arrow out of it</li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
            <li>Name it <strong>Thought</strong> and tap Add</li>
          </ol>
          {!onCapturePage && (
            <a className="btn block" href="/capture">Take me there</a>
          )}
        </>
      )}

      {ios && installed && (
        <>
          <div className="muted small">
            A second icon that opens straight into recording is worth having, but
            it has to be added from Safari: there is no Share button in here.
            Open this address in Safari and follow the steps it shows you.
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="mono small" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{url}</span>
            <div className="spacer" />
            <button className="btn sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <div className="muted small">
            On an iPhone 15 Pro or later you can also set the action button to open
            it, which is one press from your pocket. Settings, then Action Button,
            then Shortcut.
          </div>
        </>
      )}

      {/* The route that works on every phone, offered first. The long press
          below is better when a launcher supports it, and plenty do not, so
          leading with it left people pressing an icon and getting nothing. */}
      {!ios && installed && (
        <div className="muted small">
          Add <strong>{url}</strong> to your home screen as a second icon and
          name it Thought. It opens straight into recording, so a thought
          on the drive home is one tap.
          <br /><br />
          Some Android phones also offer this from a long press on the Reflective
          Lens icon, as <strong>Capture a thought</strong>. Worth a try, but the
          second icon works either way.
        </div>
      )}

      {!ios && !installed && (
        <>
          <div className="muted small">
            Add Reflective Lens to your home screen first, then add
            <strong> {url}</strong> as a second icon called Thought.
            That one opens straight into recording.
          </div>
          {canInstall && <button className="btn block" onClick={promptInstall}>Add to home screen</button>}
        </>
      )}
    </div>
  );
}
