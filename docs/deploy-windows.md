# Publishing the app, on Windows, start to finish

This is the non-technical version. Follow it top to bottom. Every command is
meant to be copied and pasted exactly as written.

**What you are doing:** the code for the new version is finished and saved on
GitHub, but your Supabase project is still running the old version. This
publishes the new one. It takes about 20 minutes the first time, and roughly a
minute every time after that.

**Two things worth knowing before you start:**

- You cannot break anything permanently. Every step here can be run again.
- If a command fails, stop and copy the error message. Do not carry on to the
  next step, because later steps assume earlier ones worked.

---

## Step 1: Open PowerShell and get the code

Press the Windows key, type `powershell`, and open **Windows PowerShell**.

If you have never put the code on this PC before, paste this:

```powershell
cd ~
git clone https://github.com/M-S83/Reflective-Lens.git
cd Reflective-Lens
```

If you already have the folder, go into it and fetch the newest code instead:

```powershell
cd ~\Reflective-Lens
git checkout main
git pull origin main
```

> If Windows says `git` is not recognised, install Git first from
> <https://git-scm.com/download/win>, click through the installer with the
> default options, then close and reopen PowerShell and try again.

> **If your folder came from a downloaded ZIP** rather than `git clone`, `git
> pull` will fail with "not a git repository". A ZIP is a frozen snapshot, so it
> cannot fetch new code. Check with `git status`. If that is your situation,
> clone fresh using the first block above, then copy your existing `.env` across
> into the new folder.

To confirm you have the new version, run `ls supabase\migrations`. You should
see files numbered up to `0019_feedback_beta_analytics.sql`. If the highest
number you see is `0007`, `0015` or `0017`, you are still on older code and the publish would achieve
nothing. Stop here and sort that first.

## Step 2: Install the Supabase CLI

This is the tool that does the publishing. Paste these one at a time:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

The first command asks you to confirm, type `Y` and press Enter. The second
installs Scoop, which is just an installer for developer tools.

Check it worked:

```powershell
supabase --version
```

A version number means you are fine. "Not recognised" means it did not install,
so close PowerShell, reopen it, and run `supabase --version` again before
retrying the install.

## Step 3: Connect to your Supabase project

**Do not skip this one.** Without it the publish stops immediately, with either
"Cannot find project ref" or "Unauthorized". Logging in comes first, and linking
only works once you have.

```powershell
supabase login
```

This opens your browser to confirm. Then you need your project's reference ID.
Go to <https://supabase.com/dashboard>, click your project, and look at the
address bar. It looks like:

```
https://supabase.com/dashboard/project/abcdefghijklmnop
                                       ^^^^^^^^^^^^^^^^
                                       this is your reference ID
```

Then, with your own reference ID in place of the example:

```powershell
supabase link --project-ref abcdefghijklmnop
```

It may ask for your database password. That is the one you set when you first
created the project. If you have lost it, you can reset it in the dashboard
under **Settings**, then **Database**, then **Reset database password**.

The reference ID is twenty lowercase letters and nothing else. If you get
"Invalid project ref format", you have probably grabbed an API key or the
project name by mistake. Take it from the dashboard address bar.

## Step 4: Your secrets file

### If you already have a `.env`

Keep it. You do not need to make a new one. It only has to be sitting in the
repo folder, right next to `.env.example`, and the publish script will pick it
up on its own.

Two things to know:

- **Spaces after the `=` are fine.** `KEY= sk-ant-...` and `KEY=sk-ant-...` both
  work, because `deploy.ps1` trims them.
- **All five required keys must be present.** Older `.env` files are often
  missing `PURGE_CRON_SECRET` (added for the account deletion sweep) and
  `TRIAL_CRON_SECRET` (added for the trial reminder sweep). Open yours and
  check.

```powershell
notepad .env
```

For each of `PURGE_CRON_SECRET` and `TRIAL_CRON_SECRET` that is not in there,
generate a value and add it as a new line:

```powershell
-join ((1..24) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

Then skip to step 5. If any of the five are missing, `deploy.ps1` will tell you
all of them at once, before it changes anything.

### If you are starting from scratch

```powershell
copy .env.example .env
notepad .env
```

Notepad opens. You need to fill in five things. Delete the placeholder after
each `=` and put the real value there, keeping everything on one line.

**`ANTHROPIC_API_KEY`** is what writes the reflections and reports. Get it from
<https://console.anthropic.com>, under **API keys**, then **Create key**. It
starts with `sk-ant-`. Copy it immediately, as it is only shown once.

**`OPENAI_API_KEY`** is what turns voice notes into text. Get it from
<https://platform.openai.com/api-keys>. It starts with `sk-`.

**`LEARNING_CRON_SECRET`**, **`PURGE_CRON_SECRET`** and **`TRIAL_CRON_SECRET`**
are just passwords the app uses to talk to itself. They are not accounts, so you
can invent them. To generate proper random ones, run this in PowerShell three
times and paste one result into each:

```powershell
-join ((1..24) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

**`APP_URL`** should be your app's web address if you have one. If you do not
have one yet, leave it as it is.

You can ignore both `STRIPE_` lines (only for taking payments) and both
`RESEND_`/`EMAIL_FROM` lines (only for trial reminder emails). Nothing you are
about to test needs them, and the trial sweep runs and cleanly does nothing
until they are filled in.

Save the file in Notepad (Ctrl+S) and close it.

> Your `.env` file is deliberately excluded from GitHub, so your keys stay on
> your PC and are never uploaded. Do not paste these keys into a chat, an email,
> or a screenshot.

## Step 5: Publish

```powershell
.\scripts\deploy.ps1
```

This is the actual publish. It takes a minute or two and prints what it is
doing. You will see it push the database changes, set your secrets, then deploy
seventeen functions one by one.

When it finishes you should see:

```
==> Done. 19 migrations and 17 functions are live.
```

If it stops early with a red ERROR line, that is the script protecting you: it
stops rather than half-publishing. Copy the message.

## Step 6: Make yourself an admin

Open your app in a browser and **sign up** with your normal email. This creates
your account.

Then go back to the Supabase dashboard, open **SQL Editor** in the left sidebar,
and click **New query**. Open the file `supabase\go-live.sql` from the repo
folder, copy everything in it, paste it into the editor, replace the placeholder
email with the one you just signed up with, and press **Run**.

## Step 7: Check it actually works

Follow `docs/staging-run.md`. It sets up a realistic under-12 team with a
training session and a match, then walks you through generating two reports and
tells you exactly what a good one looks like.

It is worth using that rather than clicking about at random, because it contains
deliberate traps. One coaching aim is left with no notes against it, to check
the report keeps it and marks it as not recorded rather than quietly dropping
it. Two players are both called Jack, to check the under-18 first-name rule
tells them apart without ever showing a surname.

---

## Two things that are meant to be missing

Neither of these is a fault, so do not spend time chasing them:

- **The player side is unfinished.** This round of work covered the coach
  journey only. Judge the coach experience, not the player one.
- **Insights and linked follow-up questions are switched off.** They were
  deliberately disabled pending a rebuild, so their absence is expected.

## If something goes wrong

Copy the exact error text and bring it back to a Claude Code session in this
repo. The most common ones:

| What you see | What it means |
|---|---|
| `git` / `supabase` is not recognised | The tool is not installed, or PowerShell needs reopening after installing it. |
| `Missing .env` | Step 4 did not happen, or the file got saved as `.env.txt`. In Notepad use Save As, and set "Save as type" to "All Files". |
| `failed to connect` on `db push` | Wrong project reference or database password. Redo step 3. |
| `connection timeout` or `SUPABASE_DB_PASSWORD` on `db push` | Linked and logged in fine, but it could not reach the database. Run `$env:SUPABASE_DB_PASSWORD = "your-database-password"` then publish again. Check the project is not paused. |
| Migration errors mentioning a table that already exists | The database is part-way through an older publish. Bring the message back rather than guessing. |
| Reports come back empty or error | Usually a missing or mistyped `ANTHROPIC_API_KEY`. Check step 4. |
