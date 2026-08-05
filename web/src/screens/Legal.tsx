import { Link } from "react-router-dom";
import { TopBar } from "../components/ui";

// Privacy, terms and refunds. Needed before taking payment, and worth having
// anyway given the app holds reflections about children.
//
// Written plainly and in the first person, because a coach reading these is the
// same person reading the reports. Placeholders in ALL CAPS are the things only
// the operator can fill in, and they are deliberately loud so they cannot be
// published by accident.

function Page({ title, eyebrow, children }: {
  title: string; eyebrow: string; children: React.ReactNode;
}) {
  return (
    <div className="app">
      <TopBar title={title} eyebrow={eyebrow} />
      <div className="screen stack">
        <div className="card stack md">{children}</div>
        <Link to="/" className="muted small">Back to the app</Link>
      </div>
    </div>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy" eyebrow="What we hold, and why">
      <p>
        Reflective Lens holds what you write and say into it: your notes, your
        reflections, your answers, and the reports built from them. It also holds
        your account details and, if you subscribe, a record of your payments.
      </p>

      <h3>Who can see your reflections</h3>
      <p>
        Only you. There is no sharing inside the app. Every reflection, note and
        report is readable by the person who created it and by nobody else, and
        that is enforced by the database rather than by the screens. If you want
        to show someone a report, you export it as a PDF and send it yourself.
      </p>

      <h3>Players and children</h3>
      <p>
        Where you record players, only first names are used in anything the app
        writes back to you. If you say a surname in a voice note, it is stripped
        before the text is stored. Players do not have accounts and are not
        contacted.
      </p>

      <h3>How your words are processed</h3>
      <p>
        To turn a voice note into text, and to organise your notes into a report,
        your words are sent to the companies that provide those services, used
        only to produce your result, and not used to train their models. The app
        organises what you said. It does not grade you and does not add opinions
        of its own.
      </p>

      <h3>Deleting everything</h3>
      <p>
        You can delete your account from the Account screen at any time. Deletion
        is scheduled 30 days ahead so you can change your mind, and you can cancel
        it yourself during that window. After that it is permanent and we cannot
        recover it.
      </p>

      <h3>Getting in touch</h3>
      <p>
        For anything about your data, including a copy of it, write to
        YOUR_CONTACT_EMAIL. The data controller is YOUR_LEGAL_ENTITY of
        YOUR_REGISTERED_ADDRESS.
      </p>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms" eyebrow="The agreement">
      <h3>What this is</h3>
      <p>
        Reflective Lens is a reflection tool. It organises and reflects back what
        you have said about your own sessions. It is not coaching advice, not an
        assessment of you, and not a qualification. Nothing it produces should be
        treated as a judgement of a coach or a player.
      </p>

      <h3>Your account</h3>
      <p>
        You are responsible for what you put into it, including having a proper
        basis for recording notes about the players you coach. Keep your sign-in
        details to yourself. One account is for one person.
      </p>

      <h3>Your content stays yours</h3>
      <p>
        You keep ownership of everything you write and record. We store and
        process it to run the service for you, and for nothing else.
      </p>

      <h3>Paying</h3>
      <p>
        Plans are billed in advance. You can cancel at any time and keep access
        until the end of the period you have paid for. If a plan lapses, your
        past work stays readable and exportable: you simply cannot add new
        reflections or reports until you renew.
      </p>

      <h3>Ending it</h3>
      <p>
        You can stop at any time by deleting your account. We may suspend an
        account that is being used to break the law or to harm someone.
      </p>

      <h3>The boring but necessary part</h3>
      <p>
        The service is provided as it is. We do not promise it will be
        uninterrupted or that an AI-written report will be free of mistakes,
        which is exactly why you should read what it produces rather than rely on
        it blindly. Nothing here removes rights you have as a consumer.
      </p>
      <p>These terms are governed by the law of YOUR_JURISDICTION.</p>
    </Page>
  );
}

export function Refunds() {
  return (
    <Page title="Refunds" eyebrow="If it is not for you">
      <h3>Changed your mind</h3>
      <p>
        If you subscribe and decide within 14 days that it is not for you, write
        to YOUR_CONTACT_EMAIL and we will refund that payment in full. You do not
        need to give a reason.
      </p>

      <h3>After 14 days</h3>
      <p>
        You can cancel whenever you like and you will not be charged again. We do
        not refund part of a period already under way, but you keep access until
        the end of it.
      </p>

      <h3>If something was wrong</h3>
      <p>
        If you were charged in error, or the service was not usable for a stretch
        you paid for, tell us and we will put it right. That is separate from the
        14 days above and has no time limit.
      </p>

      <h3>How to ask</h3>
      <p>
        Write to YOUR_CONTACT_EMAIL from the address on your account. Refunds go
        back to the card that paid, usually within five to ten working days once
        approved.
      </p>
    </Page>
  );
}
