# Putting the app online, so testers can use it

Until this is done, the app only exists on your own PC at `localhost:5173` and
only while `npm run dev` is running. The backend is already live on Supabase and
reachable from anywhere; it is the frontend that has never been hosted.

Free at this scale. About ten minutes, most of it waiting for a build.

---

## Before you start

You need two values from your Supabase dashboard, under **Project Settings**,
then **API**:

- the **Project URL**, `https://tigphbdcuyrjlkpnzppc.supabase.co`
- the **anon public** key (some dashboards call it **publishable**)

These are the same two already in your `web\.env`. They are designed to be
public and ship inside the app anyway, so putting them into a hosting dashboard
is expected. Never put the **service role** or **secret** key there.

## Vercel

1. Go to <https://vercel.com> and sign in with GitHub.
2. **Add New**, then **Project**, and pick `M-S83/Reflective-Lens`.
3. Set **Root Directory** to `web`. This is the one setting people miss: the
   app is not at the top of the repo, and without this the build fails looking
   for a `package.json` that is not there.
4. Framework should detect as **Vite**. Leave the build and output settings
   alone; `web/vercel.json` already sets them.
5. Under **Environment Variables**, add both:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your project URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon public key |

6. **Deploy**, and wait. You get a URL like `reflective-lens.vercel.app`.

## Netlify, if you prefer

Same idea. **Add new site**, **Import an existing project**, pick the repo. The
build settings come from `netlify.toml` at the repo root, so you only need to
add the same two environment variables under **Site configuration**, then
**Environment variables**.

## What the config files do

JSON cannot carry comments, so the reasoning lives here.

**The single page app rewrite** (`/(.*)` to `/index.html`) is the one that
matters. React Router handles paths in the browser, but the host knows nothing
about them. Without the rewrite, a tester who refreshes on `/account`, or opens
a link straight to it, gets a 404 from the host before the app ever loads. Both
Vercel and Netlify match real files first, so `/walkthrough.html` and the built
assets still serve normally.

**The service worker is told never to cache.** This app is an installable PWA,
so a coach can add it to their home screen. If `sw.js` is served from cache,
they keep running an old build after you deploy and have no way to force an
update. The hashed files under `/assets/` are the opposite: their names change
every build, so they are cached for a year.

## Tell Supabase where the app lives

**Do this before you try to sign in**, or the sign-in email will send testers to
your laptop.

Supabase builds every emailed link from one global **Site URL**, which is still
pointing at `localhost:5173` from development. In the Supabase dashboard, under
**Authentication**, then **URL Configuration**:

- Set **Site URL** to your Vercel address.
- Under **Redirect URLs**, add both `https://your-app.vercel.app/**` and
  `http://localhost:5173/**`, so hosted testers and your own dev server both
  work. The app asks to be sent back to whichever address it is running on
  (`emailRedirectTo`), but Supabase only honours addresses on this list.

## Sign-in: turn the password provider on

**Authentication**, then **Providers**, then **Email**. Two switches matter:

- **Enable email provider** must be on, with **password** sign-in allowed. The
  app calls `signInWithPassword`, and with this off every sign-in fails.
- **Confirm email** decides whether a new account gets one email before it can
  be used. Leave it on: it is one email per person, ever, and the sign-up screen
  promises exactly that. Turning it off means zero emails, but anyone can sign
  up with an address they do not own.

This is what keeps the email allowance out of the way. The app used to be
passwordless, which meant **every sign-in sent an email**: a coach signing in on
their phone at training and their laptop at home spent two before writing a
word, and ten testers exhausted the project's hourly allowance between them. Now
the only emails Auth sends are the one confirmation at sign-up and a reset link
if someone forgets, so the allowance stops being the thing that breaks.

Anyone who joined before this change has an account but no password. They
should use **Forgotten your password?** once, which signs them in and takes them
straight to a screen to choose one. A coach who is already signed in can set one
under **Account**, which sends nothing at all.

## Email: do this before you invite anyone

Supabase's built-in email sender is for development. It is **rate limited to a
handful of messages an hour**, and it is the same allowance for your whole
project. Passwords mean you are no longer anywhere near that ceiling for
sign-in, but sign-up confirmations still go through it, and a group joining on
the same evening is exactly the burst it refuses.

It also locks the email templates: the dashboard says "set up custom SMTP to
edit templates", so the confirmation email cannot be reworded while you are on
it.

Both are fixed by pointing Supabase at a real sending provider, and you need one
anyway for the trial reminder emails (`_shared/email.ts` uses Resend), so this is
one job rather than two:

1. Create an account at <https://resend.com> and verify a sending domain
   (`reflectivelens.co.uk`).
2. In Supabase, **Authentication**, then **Emails**, then **Set up SMTP**, and
   enter Resend's SMTP host, port and API key.
3. The templates unlock. The two that now matter are **Confirm signup** and
   **Reset password**. Both send a link, not a code, so keep
   `{{ .ConfirmationURL }}` in each and say plainly what tapping it does.

## Afterwards

**Point the app at itself.** In your `.env` at the repo root, set `APP_URL` to
the real address:

```
APP_URL=https://your-app.vercel.app
```

Then republish the backend so the trial reminder emails link somewhere real
rather than to your laptop:

```powershell
.\scripts\deploy.ps1
```

**Check it works before sending it to anyone.** Open the URL in a private
browser window and sign up as if you were a tester. You want: sign-up works, you
land on the coach home, you can create a team and a session, and the Feedback
button appears bottom right. If the page loads but nothing saves, the two
environment variables are missing or mistyped: press F12 and the console will
say so.

**Refreshing a page must work.** Go to `/account` and press refresh. If you get
a 404, the single page app rewrite is not being applied, which usually means the
Root Directory was not set to `web` on Vercel.

## Sending it to testers

They just need the link. It works in any browser, and on a phone they can add it
to the home screen from the browser menu, which is what makes it feel like an
app rather than a website.

Worth telling them: it is a beta, their reflections are private to them, and the
Feedback button is the fastest way to reach you. What confused them is as useful
as what broke.

## What updates automatically, and what does not

Pushing to `main` rebuilds and redeploys the frontend on its own. The backend
does not: migrations and edge functions still need `.\scripts\deploy.ps1` from
your PC. So a change to a screen is live within a couple of minutes of the push,
and a change to a report or the database is live when you publish it.
