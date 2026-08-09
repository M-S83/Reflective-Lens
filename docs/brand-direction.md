# Brand direction: Chalk

**Decided, not built.** Nothing in the app has been changed. This is here so the
decision survives the conversation it was made in, and so whoever picks it up
does not start the exploration again from nothing.

Deferred deliberately until the beta has run. Ten coaches are about to say which
parts of the app they actually use, and a brand is easier to commit to once you
know that. Revisit after a fortnight of real use.

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

The replacement has a risk of its own, which is worth writing down while we are
being honest: in a single colour the fold's silhouette is a leaf, which is the
most tired shape in the category. It earns its place from the two halves being
different colours (the coach's side and the app's side), not from the outline.
If that ever gets flattened to one colour, reject it.

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

## The mark: the fold

A page creased down the middle, each half answering the other. A mirror, which is
the product, and it reads as an open notebook, which is the feeling.

Three strokes: a chalk spine, the coach's side in yellow, the app's side in grey.
One half is what you said, the other is what came back. Two arcs and a line, so
it survives at 20 pixels.

```
spine   M20 5v30                                    chalk  #EDEBE4
right   M20 11c5.4 0 8.6 2.9 8.6 9s-3.2 9-8.6 9     yellow #E3C567
left    M20 11c-5.4 0-8.6 2.9-8.6 9s3.2 9 8.6 9     dust   #93A3AC
```

**The cheapest real fix available:** if nothing else here ever happens, delete the
crosshair line from the current `Brandmark` in `web/src/components/ui.tsx`. It is
one line of SVG and it stops the app contradicting itself.

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

## The order to build it in

1. **The mark.** Standalone, self-contained, and it stops the contradiction
   whatever else happens. Touches `Brandmark`, the PWA icon and the favicon.
2. **The colour tokens.** `web/src/index.css` is already token driven, so Chalk
   is a rewrite of roughly twenty custom properties rather than a rebuild.
   Both themes need doing, and Chalk is dark first, so the light theme is the
   harder half and should not be an afterthought.
3. **Yellow for the coach's words.** The change that carries the whole idea. It
   touches only where notes, reflections and report bullets are rendered.
4. **Shadows out, rules in.** The largest job, and last, because it is the one no
   tester will ever ask for.

Steps 1 and 2 are independent. Step 3 is the one worth doing properly or not at
all: applied half way, it is just a yellow accent.
