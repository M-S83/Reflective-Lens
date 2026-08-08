# Beta, free and paid accounts

Three kinds of account, one mechanism. Written for you rather than for a
developer: the last section is the only bit you need day to day.

## How access is decided

A coach can use the app when they have a subscription that is either **active**,
or a **trial that has not run out**. That is the whole rule, and it has been in
the app since long before beta. It never asks *why* someone is active, which is
what lets one mechanism cover all three cases:

| Kind | Plan | State | Ends |
| --- | --- | --- | --- |
| Free month | `coach_monthly` | trial | 30 days after first sign-in |
| Beta | `coach_beta` | trial | the date you set |
| Complimentary | `coach_comp` | active | never, until you take it back |
| Paid | `coach_monthly` or `coach_season` | active | when they stop paying |

Two things follow from that table and are worth knowing:

- **Beta and complimentary are free and cannot be bought.** They are priced at
  zero, so a comped coach never appears as revenue and never distorts MRR, and
  they are off the catalogue, so nobody can select one at checkout.
- **Beta ends by itself.** It is a trial with a date on it, so you do not have to
  remember to switch anyone off. When the date passes they become read-only:
  everything they have written stays there, still readable and still
  exportable, and they are asked to choose a plan to write anything new.

## One clock

Everyone gets their free month automatically the first time they sign in, before
you have had a chance to grant them anything. So when you give someone beta or
complimentary access, the app **cancels that free month**. Otherwise their
Account screen would count down a trial that is not the one governing them, and
you would get support questions about a number that means nothing.

The cancelled row is kept rather than deleted. That is deliberate: the app
decides "has this person had their free month?" by whether the row exists, so
deleting it would hand out a second one.

## What each person sees

The Account screen says something different for each kind, and each is true.

- **Free month**: how many days are left, and that their work is theirs either way.
- **Beta**: free until a named date, and that you will tell them before anything changes.
- **Complimentary**: no end date, nothing to pay, nothing to renew. **They are
  never shown a countdown and never asked to choose a plan.**
- **Paid**: active, thank you.
- **Ended**: read and export still work, choose a plan to write.

## Giving someone access

Owner tab, **Accounts** panel.

1. They have to **sign up first**. You are granting access to an account that
   exists, so there is nothing to grant until they have one. Use the email
   address they signed up with.
2. Type their email.
3. Choose **Beta, on a timer** and set the days, or **Complimentary, no end**.
4. **Give access.** The panel tells you exactly what it did, for example
   `coach@example.com is on Beta until 06 Nov 2026`. Read it: granting the wrong
   plan to the wrong person is easy and otherwise silent.

**Take it back** cancels it. Their work is untouched and still readable; they
just cannot add anything new.

To extend someone, grant the same plan again with a new number of days. It moves
the date rather than failing or creating a second row.

The list underneath shows everyone, what they are on, how long is left, and
whether they can currently write. Only you can see it: the check is in the
database, not in the screen, so it holds even if someone calls it directly.

## Suggested shape for the beta

Nothing here is enforced, it is just what the numbers point at.

- **Your ten testers**: beta, 90 days. Long enough to run most of a season block
  and short enough that it ends on its own if the beta stalls.
- **Coaches you want to give it to permanently**: complimentary. No end date, no
  countdown, no nagging.
- **Everyone else, later**: the free month they already get, then £3.99 a month
  or £35.91 a year.

## What is not built yet

Taking money. Paid accounts work in every respect except that nothing collects
the payment: `coach_monthly` and `coach_season` exist, are priced, and grant
access when a subscription is marked active, but Stripe is not wired in, so
today the only way onto a paid plan is by hand. That is the right order for
beta, where nobody is paying yet.
