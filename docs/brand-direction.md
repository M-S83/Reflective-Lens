# Brand direction: Chalk

**Built.** Chalk is the app's design, and the offset is its mark. This page is
the reasoning behind both, kept so nobody has to rediscover it and so the rules
that hold the design together are written down somewhere other than in CSS
comments.

It was deferred once, on the argument that the beta would teach us more than a
rebrand would. That call was reversed deliberately: shipping the old mark to the
first ten coaches meant handing them a crosshair on an app that promises never
to score them.

Full exploration and the applied system are in two published pages. If the links
have gone stale, everything load-bearing is repeated below.

---

## Why we are moving at all

The current identity is not broken. The warm off-white ground, the serif
headings and the general restraint are the reasons the app does not feel like
software, and any rebrand that throws them out goes backwards.

What is weak is narrower than it feels:

- Green is the most predictable colour in the category.
- Georgia and the system sans are defaults rather than choices.
- **The mark argues with the product.** Two concentric circles with a line
  through the middle is a crosshair: aiming, hitting, missing, scoring. The
  whole promise is that the app never scores you, so the first thing a coach
  sees contradicts the first thing we tell them, every time they open it.

That last one is the only urgent item on this page.

Two further things about the current mark, recorded so nobody talks themselves
back into keeping it. It is **generic**: concentric circles are among the most
used shapes in software, and nothing in it is specific to reflection, to
coaching, or to this product. And it **does not survive being small**: the inner
circle is filled at 18% opacity and the line through it is 1.3px at half
opacity, so at icon size both vanish and what is left is two plain rings, which
reads as a record button. It is not a good drawing that means the wrong thing.
It is an ordinary drawing that means the wrong thing, which makes it cheap to
lose.

Being equally honest about the replacement: the first attempt at it was worse
than what it replaced. See the mark section below.

---

## The one rule

**Chalk yellow is the coach. Nothing else is ever yellow.**

Everything else follows from this. Yellow marks the coach's own words: notes,
reflections, answers, anything they wrote or said. The app speaks in dust grey.
So the difference between what they said and what the software said is visible at
arm's length, before a word is read.

It matters because it makes "mirror, not verdict" structural rather than a
promise. An app that prints its own opinions in the same ink as the coach's is
asking to be taken on trust.

The rule is also the thing to defend the design with. Somebody will eventually
want yellow for a button. The day yellow means "tap here" as well as "you said
this", the system stops meaning anything.

---

## Colour, by job

Five colours, one job each. Anything that does not have a job does not get a
colour.

| Token | Hex | Job |
| --- | --- | --- |
| Chalk yellow | `#E3C567` | The coach's own words. Only ever this. |
| Chalk blue | `#8FB3CC` | Anything you can act on. Never text you only read. |
| Chalk | `#EDEBE4` | Structure. Headings and the app's own titles. |
| Dust | `#93A3AC` | The app talking. Labels, help text, dates. |
| Slate | `#2B3136` | The working surface. |
| Deep | `#22272B` | The board. Edges and wells. |
| Rule | `#3F474D` | A chalk line. |

Slate rather than grass: the tactics board, not the pitch. It solves the green
problem without pretending football is not the subject.

---

## Lines, not cards

**No shadows anywhere.** A chalk board has no depth. Things are divided by a line
drawn across it, not by rectangles hovering above it.

This one restriction is what stops Chalk collapsing into an ordinary dark theme,
because rounded cards with soft shadows are exactly what those look like.

- Hairline rules, full width. Space doing the grouping.
- Two surface values, never a third grey "just for this bit".
- Square corners, 2 to 3px at most.
- Controls are outlined, not filled, with one solid button per screen so the
  main action is never ambiguous.
- The record control turns from blue to yellow while running, because the moment
  it starts listening, what it holds becomes the coach's.

---

## The mark: the offset

**Chosen and shipped.** Two circles, slightly out of true. The filled one is the
coach, the drawn one is what came back, and the overlap is the part that belongs
to both. It is the only candidate whose meaning fits in one sentence a coach
would recognise.

```
coach   <circle cx="15" cy="20" r="11.5" fill="var(--yours)" />
back    <circle cx="25" cy="20" r="11.5" stroke="var(--ink)" stroke-width="2.6" />
```

Two circles have nothing to lose at small size, which is why it survives the
22 pixel test that killed the first attempt.

**The rejected first attempt, kept as a warning.** Rendered rather than described, its
spine ran past the arcs top and bottom and it read as the Greek letter phi, not
a folded page. Worse, at 22 pixels it had *less* presence than the target it was
meant to replace, which is the opposite of the argument for changing it. Recorded
here because it was written up as good before anyone had looked at it, and that
is the mistake worth not repeating: draw it, render it at 22 pixels, then decide.

The three that were weighed against each other:

| | Reads as | Strength | Weakness |
| --- | --- | --- | --- |
| **Half filled** | One side solid, one open | Best at 22px by a distance, unmistakable two halves | Reads as a moon phase |
| **The offset** | Two circles overlapping, out of true | Says "a thing and its reflection" better than anything else | Overlapping circles are Mastercard and Venn diagrams |
| **The crease** | A page turned back on itself | Perfectly legible at any size | Looks like an interface icon, not a mark |

The rule that keeps it working is the same as the palette's: **two halves, two
colours, always.** In one colour the offset is a Venn diagram, and every other
candidate collapses into a shape you have seen a thousand times.

Lives in `Brandmark` (`web/src/components/ui.tsx`), `web/public/favicon.svg` and
`web/public/pwa-icon.svg`. The two files are hand-written rather than generated,
so a change to the mark means editing all three.

---

## Type

Two voices, visibly different.

- **The coach:** a warm text serif. Human, unhurried, the thing you read.
  Freight Text or Lyon Text.
- **The app:** a condensed grotesque, small, spaced, upper case for labels. It
  looks written on the board and it never competes. Founders Grotesk Condensed
  or Roboto Condensed.

The coach's words are theirs because of the **colour**, not because of a script
face. A serif respects them; a marker font impersonates them.

---

## What would ruin it

Chalk is one bad afternoon from being a novelty, and novelty is what gets
redesigned again in a year. Every one of these will occur to somebody.

- **A chalk texture.** Grain on the background, dusty edges on the type. The
  first idea everybody has, and it dates within months.
- **A handwriting font.** See above on impersonation.
- **Tactics board decoration.** Dotted run lines, arrows, cones, a pitch diagram
  behind a heading. This is a reflection app, not a session planner.
- **Green creeping back.** Someone will want a green tick or a green "active"
  pill. Blue and yellow already carry every state needed.
- **Yellow on a button.** The unbreakable one.

---

## What was built, and what was not

All four steps landed together:

1. **The mark.** `Brandmark`, the favicon and the PWA icon.
2. **The tokens.** `web/src/index.css`, one theme, no light variant. See below.
3. **Yellow for the coach's words.** `.yours` on notes and thoughts, and
   `.md li` in a report, so every restated line is theirs and the frame is not.
4. **Shadows out, rules in.** `--shadow: none`, corners at 3 to 4px, outlined
   controls, pills and tags squared off.

**One theme, no light variant.** Chalk is a slate board, so the app is a slate
board whatever the phone is set to. A light version would be a different idea
wearing the same name, and half the users would never see the design at all.

The cost is real and should not be argued away: a dark screen is harder in
direct sunlight, which is exactly when a coach captures a note pitchside. **If a
tester says it is hard to read outside, that is the signal to build a paper
variant**, and every rule on this page survives the move, because the system is
"one colour means the coach", not "yellow means the coach".

The primary button uses `--grass-deep`, a step down from the outline blue.
Filled at full strength it was the brightest thing on the screen, louder than
the coach's own words, which inverts the whole point of the palette.

**Type is NOT done.** The Type section above is still an aspiration: headings
are Georgia and body is the system sans, both of which are defaults rather than
choices. Licensing and self-hosting two faces is a job of its own, and the
colour rule carries the idea without it. Do it when there is a reason to, not
because this page lists it.
