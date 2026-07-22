-- =============================================================================
-- 0006_coaching_knowledge.sql
-- Grounds the app's reflection in real coaching pedagogy.
--
-- A curated knowledge base distilled from England Football's *Coachcast* series
-- (paraphrased / non-verbatim, so safe to embed): ~50 coaching frameworks, a
-- grouped bank of open reflective prompts (incl. a 10-10-10 cadence), and a
-- canonical tag taxonomy. This is REFERENCE data (not user-owned): every coach
-- reads it, only an admin edits it.
--
-- How it's used:
--   • generate-reflection-questions draws on the prompt bank, so the nudges are
--     grounded in real coach-reflection questions — still open, still "mirror not
--     verdict", still re-voiced into the coach's own words.
--   • clean-observation snaps note tags to the canonical taxonomy, so the
--     self-learning loop (insights, trends) speaks one consistent coaching
--     language instead of drifting synonyms.
-- =============================================================================

create table public.coaching_frameworks (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text not null,
  created_at  timestamptz not null default now()
);

create table public.reflection_prompts (
  id         uuid primary key default gen_random_uuid(),
  group_name text not null,      -- 'Self-awareness', 'Communication & language', ...
  prompt     text not null unique,
  cadence    text,               -- '10m' | '10h' | '10d' for the 10-10-10 prompts, else null
  created_at timestamptz not null default now()
);
create index reflection_prompts_group_idx on public.reflection_prompts (group_name);

create table public.coaching_tags (
  tag text primary key
);

alter table public.coaching_frameworks enable row level security;
alter table public.reflection_prompts  enable row level security;
alter table public.coaching_tags        enable row level security;

-- Reference data: readable by any signed-in user, editable only by an admin.
create policy "frameworks: read all"  on public.coaching_frameworks for select using (true);
create policy "frameworks: admin write" on public.coaching_frameworks for all
  using (public.is_admin()) with check (public.is_admin());
create policy "prompts: read all"     on public.reflection_prompts for select using (true);
create policy "prompts: admin write"  on public.reflection_prompts for all
  using (public.is_admin()) with check (public.is_admin());
create policy "tags: read all"        on public.coaching_tags for select using (true);
create policy "tags: admin write"     on public.coaching_tags for all
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.coaching_frameworks to authenticated;
grant select, insert, update, delete on public.reflection_prompts  to authenticated;
grant select, insert, update, delete on public.coaching_tags       to authenticated;

-- =============================================================================
-- SEED — via dollar-quoted JSONB so apostrophes/quotes need no escaping.
-- Source: England Football Coachcast (paraphrased, non-verbatim).
-- =============================================================================

insert into public.coaching_frameworks (name, description)
select f.name, f.description
from jsonb_to_recordset($kb$[
{"name":"The Four Corners","description":"Plan and review across Technical/Tactical, Physical, Psychological, Social. A reflection is weak if it only judges tech/tact; also ask what did I do for the other three corners?"},
{"name":"Start point & challenge point","description":"Per corner — every player has a different entry level and stretch level in each corner, including the psychological/social ones. Differentiate so everyone can access the session."},
{"name":"The Six Player Capabilities","description":"Scanning, timing, positioning, movement, disguise, decision-making. Used as an observation lens; test a practice by how many of the six it actually lets players rehearse (a passing square or mannequin drill trains almost none)."},
{"name":"Plan then Do then Review then Reflect","description":"Review = what happened; reflection = why, and what next. Don't stop at review."},
{"name":"Reflection-in-action / reflection-on-action","description":"After Schon — thinking during delivery vs after. Most coaches start by only doing the after."},
{"name":"10-10-10 reflection","description":"Capture thoughts 10 minutes, 10 hours, and 10 days after a session; different insights surface at each distance."},
{"name":"What? / So what? / Now what?","description":"Rolfe — describe, interpret, decide the change. Pair with a feelings question (how did that session feel?) for a deeper layer."},
{"name":"Mehrabian split (~55/38/7)","description":"Most of a message lands through body language, then tone, then words. Coaching is human-connection behaviour, not just words."},
{"name":"Six-phase game model","description":"Build/create/finish the attack; high press, mid block, low block. Useful for spotting which part of the game a coach is biased toward. The final third is the hardest, most underloaded, most exciting part — check how much time is spent there."},
{"name":"Ball-rolling target (~70%, England DNA)","description":"A rough check on whether players are playing enough vs standing listening."},
{"name":"STEP","description":"Space, Task, Equipment, People: the levers for differentiating and adapting a practice (and for additional-needs inclusion)."},
{"name":"Whole-Part-Whole / scaffolding / carousel","description":"Session structures; starting with a game (whole) gets kids arriving early and engaged."},
{"name":"1-2-3 pattern rule","description":"Once is a one-off, twice a coincidence, three times a pattern. Use it for behaviour and to spot recurring strengths worth celebrating."},
{"name":"RESPECT (behaviour framework, Vinny Halsall)","description":"R: relationships, rapport, role model; E: enjoyable experience; S: sportsmanship surpasses scorelines; P: positive parental participation. A mnemonic for matchday conduct."},
{"name":"GOOD session design (Halsall)","description":"Goals, Opposition, Orientation, Direction. Test any practice against these four."},
{"name":"Self-determination theory / ABC","description":"Autonomy, Belonging, Competence: the three human needs behind ownership, relationships, and feeling good at something."},
{"name":"Support/challenge matrix","description":"Aim for high-support + high-challenge (top-right quadrant)."},
{"name":"The £10 / coins challenge (Emily Senior; Ben Hardaker)","description":"Imaginary coins (or a £10); each intervention/shout/question spends one. Forces observation over constant talking."},
{"name":"Behaviour-response sequence (Hardaker, after Paul Dix / Murphy Roberts)","description":"Notice positives, then tactical ignore (unless safety), then non-verbal cue, then delay confrontation, then choice + consequence, then a reset button, then closure (draw a line, don't carry it over)."},
{"name":"Emoji mood board","description":"An anonymous arrival tally of how players are feeling, so you clock who needs a lighter touch before the session starts."},
{"name":"Three-mendous (Halsall)","description":"On receiving the ball a player has three options: run, dribble, or send (pass/shoot/cross). Don't steal the decision from the sideline."},
{"name":"FAIL = First/Further Attempt In Learning","description":"Reframes a flopped session as a learning rep."},
{"name":"The 5 Ps","description":"Proper Preparation Promotes Positive Performance (prep is not a rigid session plan)."},
{"name":"Welcome cards","description":"10 non-football questions for a new player (favourite team/player, school, food) so you can greet them personally on day one and dissolve first-day nerves."},
{"name":"Concentration-span rule of thumb","description":"Roughly one minute per year of age (a 10-year-old ~10 min) before you rotate/change something."},
{"name":"The 3-minute cycle","description":"Run a practice ~3 minutes; if it's not landing, adjust fast (time limit, scoring, change it); if it is, can you beat your score?"},
{"name":"Too easy / too hard / don't understand","description":"The three root causes of an engagement or behaviour dip; diagnose which before intervening."},
{"name":"Freedom within a framework (Craig Lawrence, via Darren Grover)","description":"Set clear parameters, then let players explore and solve problems inside them; don't spoon-feed."},
{"name":"Creating safety — three dimensions","description":"Physical, safeguarding, and psychological. The psychological layer (it's safe to make mistakes) is the foundation for risk-taking and learning."},
{"name":"Praise the intention, not the mistake (Greenslade)","description":"Reward the idea/intent behind a failed attempt (I can see what you were trying — next time try), and praise the reaction after a mistake (win-it-back) over the mistake itself. Co-create the team's when-mistakes-happen culture with the players."},
{"name":"Ask them how they like feedback","description":"Direct / via a teammate / during / at the end; players usually know themselves best, so deliver feedback their way."},
{"name":"Reflect on interactions, not just Xs and Os (Miles)","description":"After a stoppage/drive-by, ask did they apply it? did I talk too long? did I show the visual learner or just tell them? Film yourself; ask players how they'd describe you."},
{"name":"The Five Cs (FA / Loughborough, via Fenner)","description":"Confidence, Commitment, Control, Concentration, Communication — a frame for developing players and briefing parents."},
{"name":"Listen to understand, not to respond (Steve Smithies, via Fenner)","description":"Pause before responding to conflict; a hands-up-to-speak mechanism builds empathy over time."},
{"name":"Steps of success (Lok)","description":"Break an emotional goal (e.g. finishing) into escalating, player-owned wins: five chances, then connection, then on target, then score. Redefines winning individually."},
{"name":"Scenario cards (Lok)","description":"6 minutes left, win = promotion; 30 seconds to set your tactic — rehearse emotional pressure safely in training; manipulate scorelines/overloads and referee it properly."},
{"name":"The 30-second stopwatch (Lok)","description":"Start a timer when you begin talking; if it beeps you've talked too long — get players back to playing."},
{"name":"All / some / few (Leigh)","description":"Everyone gets some information, some get more, a few get extra; differentiate without overloading."},
{"name":"Three levels of any decision (Leigh)","description":"What's best for the individual, the group, and the club; the latter two can eventually supersede the first."},
{"name":"Lead/assistant role clarity (Leigh)","description":"The lead coach controls and stops the group; the assistant coaches only their brief, only when the practice is stopped — avoids the drawn-out he-said-she-said."},
{"name":"Wants vs needs (Matt Jones)","description":"Players want the ball, games, their mates; they need the less glamorous work (fitness). Weave the needs into the wants rather than choosing between them."},
{"name":"The football cocktail / camouflaged S&C (Jones)","description":"Sandwich fitness between small-sided games so the hard yards are disguised by a ball at their feet. Would you take part in your own session?"},
{"name":"Confidence, comfort, creativity, competence (Jones)","description":"The developmental chain for individual players: confidence breeds comfort, which frees creativity, which builds competence."},
{"name":"Connect / collaborate / provide clarity (Jones)","description":"The three aims of a pre-season staff reconnection meeting."},
{"name":"Three stars and a wish","description":"Three things done well + one to improve; a lightweight reflection/feedback frame (adult equivalent: an IDP / player profile)."},
{"name":"Coaching-your-own-child toolkit (Jones)","description":"Agree a contract (coach or dad? what do you call me?); let another coach support your child in emotional moments; lean on the other parent-coaches."},
{"name":"Reframe trials as an open session","description":"An assessment of someone's offering, but lower-guard framing gets a truer, better version of players (you can still talent-ID)."},
{"name":"Fun + development = success (winning in brackets) (Matt Jones)","description":"The word-sum for framing matchday success beyond the scoreline; highlight the small wins all over the pitch."},
{"name":"The three Ts — timing, tone, terminology (Jones)","description":"The things to get right in any matchday intervention; I can see what's happening — what do you need from me? beats a blunt judgement."},
{"name":"Next moment (Federer, via Jones)","description":"Don't relive the last moment; carry the lesson, drop the failure, commit fully to the next action."},
{"name":"The supermarket test (Jones)","description":"Imagine meeting a player in 10 years: the warmth (or not) of that hello is decided by how you conduct yourself now."}
]$kb$::jsonb) as f(name text, description text)
on conflict (name) do nothing;

insert into public.reflection_prompts (group_name, prompt)
select p."group", p.prompt
from jsonb_to_recordset($kb$[
{"group":"Self-awareness","prompt":"Where did my eyes go most today — my team or the opposition? On, around, or away from the ball? Attack or defence?"},
{"group":"Self-awareness","prompt":"Was I the same coach today as I am in training? If not, what changed and why?"},
{"group":"Self-awareness","prompt":"What did I think I was teaching, and what do I think players actually received?"},
{"group":"Self-awareness","prompt":"Which of my values got tested today, and did I live up to them?"},
{"group":"Self-awareness","prompt":"Was this a genuinely new session, or last week repeated?"},
{"group":"Communication & language","prompt":"Who did I speak to most, and who did I barely speak to?"},
{"group":"Communication & language","prompt":"Was my language age- and stage-appropriate, or full of terms that meant nothing to them?"},
{"group":"Communication & language","prompt":"Did I talk through the game (commentary) or leave space for players to decide?"},
{"group":"Communication & language","prompt":"What did my body language and tone say when players arrived? At the moment of a mistake?"},
{"group":"Communication & language","prompt":"Did I listen — to words and to body language — or just transmit?"},
{"group":"Intervention & delivery","prompt":"How many times did I stop the session, and was each stop worth the interruption?"},
{"group":"Intervention & delivery","prompt":"Did I use drive-by/1:1 interventions or default to stop, stand still?"},
{"group":"Intervention & delivery","prompt":"Where did I use silence deliberately?"},
{"group":"Intervention & delivery","prompt":"Did I give the debrief with time left to act on it, or at the final scramble?"},
{"group":"Intervention & delivery","prompt":"If I'd had only 10 coins to spend on talking today, would I have run out early?"},
{"group":"Intervention & delivery","prompt":"Did I observe against my intended outcomes, or drift to an unrelated thing I happened to see?"},
{"group":"Intervention & delivery","prompt":"Was my coaching position chosen for what I needed to see, or just habit?"},
{"group":"Relationships & behaviour","prompt":"What's one new thing I learned about a player today?"},
{"group":"Relationships & behaviour","prompt":"Did I connect before I corrected?"},
{"group":"Relationships & behaviour","prompt":"Any stages of agitation I spotted early — and did I act?"},
{"group":"Relationships & behaviour","prompt":"Any behaviour I saw for the third time (pattern) — positive or negative — that needs a response?"},
{"group":"Relationships & behaviour","prompt":"Did my touchline behaviour model what I ask of players and parents?"},
{"group":"Relationships & behaviour","prompt":"When behaviour dipped today, did I ask is it me / my session? before blaming the player?"},
{"group":"Relationships & behaviour","prompt":"Did I separate the behaviour from the person, or make it personal?"},
{"group":"Relationships & behaviour","prompt":"Did I close the loop — or am I carrying last session's incident into this one?"},
{"group":"Practice design","prompt":"How many of the six capabilities could players actually rehearse in my main practice?"},
{"group":"Practice design","prompt":"Roughly what % of the session was the ball rolling?"},
{"group":"Practice design","prompt":"Was it realistic and relevant to these players? Differentiated for start/challenge points?"},
{"group":"Impact & feelings","prompt":"How did this session feel — for me and (as far as I could tell) for the players?"},
{"group":"Impact & feelings","prompt":"What's the one thing I'll change next session, and why (the now what)?"},
{"group":"Impact & feelings","prompt":"What would players say if I asked them to score me 1-6 tonight?"},
{"group":"Impact & feelings","prompt":"Did I coach what was in front of me, or defend the plan I'd written?"},
{"group":"Impact & feelings","prompt":"One action point from today: what do I keep the same, and what do I do differently?"},
{"group":"Impact & feelings","prompt":"Did I consider the impact on players, or just how the session looked on paper?"},
{"group":"Impact & feelings","prompt":"Have I sought feedback on my coaching recently — and how many times this season so far?"},
{"group":"Cadence","prompt":"10 minutes after: quickest honest note or voice memo."},
{"group":"Cadence","prompt":"10 hours after: what stands out the next day?"},
{"group":"Cadence","prompt":"10 days after: what pattern is emerging across sessions?"}
]$kb$::jsonb) as p("group" text, prompt text)
on conflict (prompt) do nothing;

update public.reflection_prompts set cadence = '10m' where prompt like '10 minutes after%';
update public.reflection_prompts set cadence = '10h' where prompt like '10 hours after%';
update public.reflection_prompts set cadence = '10d' where prompt like '10 days after%';

insert into public.coaching_tags (tag)
select value
from jsonb_array_elements_text($kb$[
"self-awareness","bias/blind-spots","values","communication-verbal","communication-non-verbal",
"tone-tempo","silence","listening","questioning","intervention-discipline","coins-challenge",
"observation","coaching-position","drive-by-feedback","relationships","person-first",
"connect-before-correct","start-point-challenge-point","stages-of-agitation","age-and-stage",
"practice-design","GOOD-session-design","six-capabilities","four-corners","STEP","ball-rolling",
"wave-practice","whole-part-whole","ownership/voice-and-choice","self-determination-ABC",
"support-challenge","three-mendous","match-day-behaviour","respect","parents",
"behaviour-as-communication","safeguarding","mentoring","coach-development","reflection-in-action",
"reflection-on-action","plan-do-review-reflect","10-10-10","what-so-what-now-what","lens-approach",
"FA-diamond-model","once-twice-three-times","player-voice","inclusion/additional-needs",
"neurodiversity","wellbeing/burnout","FAIL-first-attempt","5-Ps"
]$kb$::jsonb) as value
on conflict (tag) do nothing;
