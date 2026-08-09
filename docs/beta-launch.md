# Sending it out: the checklist

Everything that has to be true before the first tester gets a link, in order.
Each step says how to tell it worked, because "I think I did that" is how a
group of ten people all hit the same wall on the same evening.

## 1. Deploy the backend

From the repo root on your PC:

```powershell
.\scripts\deploy.ps1
```

Re-runnable and safe to repeat. It pushes any migrations the project has not
seen and redeploys all 16 functions.

**Worked when:** the last line reads `Done. 22 migrations and 16 functions are
live.`

## 2. Frontend

If Vercel is connected to the GitHub repo it rebuilds on every push, so this is
already done. **Check the newest deployment names the newest commit.** If you
deployed by hand, deploy again.

**Worked when:** open the live URL, and the sign-in screen asks for a **password**
rather than offering to send a code.

## 3. Turn on password sign-in

**Authentication, then Providers, then Email.**

- The email provider must be **enabled**, with **password** sign-in allowed. The
  app calls `signInWithPassword`. With this off, nobody can sign in, including
  you.
- Leave **Confirm email** on. That is one email per person, ever, which is what
  the sign-up screen promises.

**Authentication, then URL Configuration.** Site URL is your live address, and
Redirect URLs contains it with `/**` on the end. Get this wrong and the
confirmation link sends your testers to a laptop that is not theirs.

**Worked when:** you can create a test account, get the confirmation email, tap
the link, and sign in with the password. Then close the tab, come back, and sign
in again **with no email arriving**. That second half is the whole point.

## 4. Make yourself admin

You need this to see the Owner tab and to give anyone access.

Sign up in the app first. Then in the Supabase SQL editor, run step 1 of
`supabase/go-live.sql` with your email.

**Worked when:** an **Owner** tab appears in the app.

## 5. Email sending

Supabase's built-in sender is rate limited to a handful of messages an hour for
the whole project. Sign-in no longer sends anything, so this is no longer the
ceiling on how many people can use the app, but **sign-up confirmations still go
through it**, and ten people joining on the same evening is exactly the burst it
refuses.

Set up Resend against `reflectivelens.co.uk` and point Supabase at it:
**Authentication, then Emails, then Set up SMTP**. Details in `hosting.md`.

While you are there: **`hello@reflectivelens.co.uk` has to actually receive
mail.** It is the address in the privacy notice, so it is where a coach writes
to ask for their data or to complain. A privacy notice giving an address that
bounces is worse than one giving a Gmail account that works.

## 6. Give your testers access

Owner tab, **Accounts** panel. They sign up first, then you grant.

For ten testers: **Beta, 90 days**. It ends by itself, so there is nothing to
remember. Coaches you want to keep on it permanently get **Complimentary**,
which has no end date and never shows them a countdown.

Full detail in `accounts.md`.

## Getting to the microphone fast

The reason a coach loses a thought is the number of taps between having it and
recording it. Worth telling your testers, because none of it is discoverable.

**Everyone: add the app to the home screen.** The app offers this on the home
screen the first few times. On iOS it is Share, then "Add to Home Screen"; on
Android the browser offers to install it. Until they do this it is a website in
a tab, and it will get lost among their tabs.

**Android: long press the icon.** A "Capture a thought" shortcut is in the
manifest, so a long press on the installed icon jumps straight to the recorder
with the microphone already up. Icon, press, tap, speak.

**iPhone: add a second icon.** iOS ignores manifest shortcuts, so do it by hand.
Open `reflectivelens.co.uk/capture` in Safari, Share, "Add to Home Screen", and
name it "Thought". That icon now opens straight into recording. Two icons, one
for the app and one for the thing they do at the roadside.

**iPhone 15 Pro and later: the action button.** Settings, Action Button, choose
Shortcut, and pick a shortcut that opens `reflectivelens.co.uk/capture`. That is
one physical press from a pocket to the microphone, which is as close to the
lock screen as any web app can get.

**What is not possible, so nobody wastes time looking for it:** a record button
on the lock screen itself. Neither iOS nor Android will let a website open a
microphone from a locked phone, and no setting changes that. It needs a native
app, which is a different build and a different conversation.

## Before you press send

- Read `/privacy` on the live site while **signed out**. It should load, and it
  should name Michael Smith and `hello@reflectivelens.co.uk`.
- Sign in, write one session, and generate one report. That exercises
  transcription, the model tiering and the report writer in one go.
- Check the Owner tab shows your own account.

## What is deliberately not done

**Taking money.** Stripe is not wired in. The plans exist and are priced, but
nothing collects a payment, and the Terms and Refunds pages say plainly that
nothing is being charged. That is the right order: get the reflecting right
while nobody is paying for it.
