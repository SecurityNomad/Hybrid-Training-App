# Block Restart — design spec

*Date: 2026-09-14 · Status: approved, not yet implemented · Applies to: `hyrox-app/index.html`*
*Rev 2 — revised after research (`Full Training App/Research — Training App Features & Scaling.md`)*

## What this is

Lets the athlete rewind the plan after a break, re-run the work, and keep the record of the
first attempt. Agreed through brainstorming on 2026-09-14; revised the same day when
research contradicted two decisions.

## What changed in rev 2, and why

**1. The restart is now gated on how long you were actually away.** Rev 1 offered a block
restart after any break. The evidence says that is worse than saying nothing. Fourteen
trained men doing three cycles of 6-weeks-on / 3-weeks-off matched 24 weeks of continuous
training on both strength and muscle CSA, with the *second* retrain cycle producing
significantly larger gains than the continuous group
([Ogasawara 2013](https://pubmed.ncbi.nlm.nih.gov/23053130/)); strength decline under four
weeks is "limited" ([Mujika & Padilla I](https://pubmed.ncbi.nlm.nih.gov/10966148/)).
Offering to rewind Block 2 after ten days off is bad coaching dressed as a feature.

**2. Pause no longer moves race day by default.** Rev 1 kept Model A, where
`pauseShiftDays()` shifts `effRace()`. But 26 Sep 2026 is a registered event that does not
move, and the taper is the part you least want to slide
([Mujika & Padilla 2003](https://pubmed.ncbi.nlm.nih.gov/12840640/)). TrainingPeaks models
this case by anchoring a plan to its **end** date
([TrainingPeaks](https://help.trainingpeaks.com/hc/en-us/articles/204072414-Dynamic-Training-Plans)).

**3. Falling out of (1): the core operation is "rewind to week W", not "restart a block".**
The 2–4 week recommendation is *repeat the current week*, which rev 1 could not express.
Generalising to any week makes block restart the special case where W is a block's first
week — and makes the code smaller, not larger.

## Decisions

| Question | Decision |
|---|---|
| When is it used? | Mid-cycle recovery, any time |
| Old logged data? | Keep both attempts |
| How to keep both? | **Archive on restart** — live keys never change shape |
| Race day? | **Fixed by default.** Pause doesn't move it; a rewind asks |
| Loads after a layoff? | Comeback discount, **sized by break length**, e1RM marked stale |
| Granularity | **Rewind to any week**; block starts are the promoted choices |

### Why archive-on-restart

Two alternatives were rejected. **Attempt-suffixed keys** (`w5s0` / `w5s0@2`) keep both
attempts editable, but every one of ~20 call sites touching `S.done` / `S.log` / `S.notes` /
`S.result` must route through a resolver; any site missed reads the wrong attempt, a silent
data corruption. **Cycle-scoped state** (`S.cycles[]`) is the general model and already
exists as the `Training Hub/` prototype — rebuilding it here is duplicated effort in the
wrong repo.

Archiving leaves live keys untouched, so no existing read or write path changes. Archived
attempts are read-only, which is fine: you look at a finished block, you don't edit it.

## Data model

Six additions to `S`. Nothing existing changes shape.

```js
S.planStart    // ISO date, or null = built-in PLAN_START
S.raceDate     // ISO date, or null = built-in RACE_DATE
S.raceAnchored // bool, default true — "my race date is fixed"
S.history      // [] of archived attempts
S.discount     // {pct: 10, throughWeek: 9} or null
S.lastActive   // ISO date of the last training write
```

### `S.lastActive` is new capability, not bookkeeping

`S.done[id]` is a bare boolean. The app currently **cannot tell how long you have been
away** unless you formally pressed pause — and the people who need this feature most are
exactly the ones who stopped without pressing anything.

`S.lastActive` is stamped with today's date at the four places training data is written:
the set-input `change` handler, the session done toggle, the result logger, and
`addBench()`. Not in `save()` — changing a setting is not training.

Break length is then `today − max(S.lastActive, S.pause.since)`, falling back to the latest
`e1rmHist` or `S.bench` date for state saved before this field existed.

### Rewinding is a date operation

`currentWeek()` derives from today against `effStart()`. The app stores no "current week"
and this design does not add one. To rewind to plan week `W`:

```
planStart = today − (W − 1) × 7 days
```

`currentWeek()` then returns `W` with no change to its logic.

```js
function effStart(){ const b = S.planStart ? parseISO(S.planStart) : PLAN_START;
                     return addDays(b, pauseShiftDays()); }
function effRace(){  const b = S.raceDate  ? parseISO(S.raceDate)  : RACE_DATE;
                     return S.raceAnchored ? b : addDays(b, pauseShiftDays()); }
```

### Race anchoring

**`S.raceAnchored = true` (default): a pause moves nothing.** This is simpler than it
sounds. If race day is fixed and you stop training for three weeks, real time passes,
`currentWeek()` advances on its own, and you have simply missed those weeks. No compression
logic is required — the calendar does it. Pause becomes *informational*: it records the
break for the gate and for honest history, and the countdown stays true.

On resume the app states plainly what happened: *"You're now in Week 8. You missed Weeks
6–7."* Then it offers the gated rewind options below.

**`S.raceAnchored = false`: legacy Model A**, where a pause shifts both dates. Correct when
the goal date is notional rather than a booked event. Toggle lives in the timeline card.

### Migration

Existing saved state has accumulated `S.pause.days` that currently shifts both dates.
Defaulting `raceAnchored` to true would make those dates jump. On first load after the
change, when `S.pause.days > 0` and `S.planStart` is null:

```
S.planStart = ISO(PLAN_START + pause.days)
S.raceDate  = ISO(RACE_DATE  + pause.days)
S.pause.days = 0
```

This preserves the exact effective dates the athlete sees today and moves them onto the new
model. Runs once; guarded by `S.planStart` being null.

### Archive record

```js
{ weeks: [5, 9], block: 2,            // block is null for a single-week rewind
  attempt: 1,
  archivedOn: '2026-09-14',
  breakDays: 34,                       // what the gate measured
  reason: 'illness — 3 weeks off',     // optional, free text
  done: {...}, log: {...}, notes: {...}, result: {...},
  bestE1RM: { squat: 142.5, push_press: 82.1 } }
```

Attempt number is derived, never stored: `history.filter(h => h.block === n).length + 1`.

`bestE1RM` is computed at archive time by running `exerciseE1RM()` over every log key in
range, keeping the best per detected lift. A convenience summary — raw sets are archived
alongside, so nothing depends on it being complete.

## The break-length gate

Thresholds calibrated against the detraining literature. The mapping from evidence to
thresholds is **inference** — no published protocol says where to resume — and the spec
should not pretend otherwise.

| Break | Recommended | Rationale |
|---|---|---|
| ≤ 14 days | **Nothing. Carry on.** | Strength intact ([Mujika I](https://pubmed.ncbi.nlm.nih.gov/10966148/)); 3-week gaps cost nothing ([Ogasawara](https://pubmed.ncbi.nlm.nih.gov/23053130/)) |
| 15–28 days | Repeat the current week | VO2max ≈ −7% by day 21 ([Coyle](https://pubmed.ncbi.nlm.nih.gov/6511559/)); conditioning targets only |
| 29–56 days | Restart the current block | Recently acquired aerobic gains treated as lost ([Mujika II](https://pubmed.ncbi.nlm.nih.gov/10999420/)) |
| > 56 days | Restart from Block 1 | ACSM's own novice-tiering language applies |

**Guide, don't forbid.** At ≤ 14 days the sheet leads with a one-line reassurance — *"12
days off won't have cost you. Pick up where you left off."* — and the rewind options sit
behind a "restart anyway" disclosure. The athlete is an adult and the evidence is about
averages; the default carries the recommendation, the choice stays theirs.

Above 14 days the recommended row is pre-selected and labelled *Recommended*, with the
other options listed plainly.

## Flow

Entry point: the timeline card the Dashboard's `renderPause()` already owns. Opens a bottom
sheet via the existing `sheetIn`/`sheetOut` — no new UI machinery.

1. **Break summary + recommendation** — days away, what was missed, the gated recommendation.
2. **Pick a target week** — "Repeat Week 8" and each block start, each showing what's logged
   ("Block 2 · 14 of 25 sessions · last logged 22 Aug"). Weeks ahead of the current week are
   disabled with the reason shown.
3. **Race date** — pre-filled from `effRace()`, editable. Changing it here is the only way
   race day moves while anchored.
4. **Fit verdict** — recomputed live.
5. **Comeback discount** — defaulted from break length (see below), editable, "none" allowed.
6. **Reason** — optional single line, stored on the archive.
7. **Confirm.**

### Fit check

```
weeksNeeded    = 13 − (targetWeek − 1)
weeksAvailable = floor((raceDate − today) / 7)
```

If `available >= needed` it fits. Otherwise show both real options:

```
Restarting Block 2 needs 9 weeks (W5 → race).
You have 6 before Sat 14 Nov.

→ Move race day to Sat 5 Dec to fit the full block, or
→ Rewind to Week 8 instead — the furthest back that still fits
```

The fallback target may be **mid-block** — Week 8 sits inside Block 2. Intentional: the
option is "as far back as still fits", labelled as a partial restart.

**The fit check constrains how far back you can rewind; it never mutates the plan.**
Trimming weeks out of the plan was rejected: `WEEKS` is a fixed 13-entry array and plan-week
maps directly to array index throughout — skipping weeks breaks that identity in
`currentWeek()`, the week nav, `weekDates()` and every `w<N>s<I>` key. Constraining the
target achieves the same end and guarantees Block 3, the taper, is never shortened.

### Confirm is atomic

One `save()`: archive to `S.history`; clear matching keys from `done`, `log`, `notes`,
`result`; set `S.planStart`, `S.raceDate`, `S.discount`; reset `S.pause`; stamp
`S.lastActive`. No partially-applied rewind is possible.

"Matching keys" means exactly those whose week falls in range — `/^w(\d+)s/` with
`first <= w <= last`. Nothing outside is touched.

Explicitly **not** cleared or archived:

- `S.swap` / `S.swapGlobal` — a substitution reflects equipment or an injury, neither of
  which a rewind changes.
- `S.oneRM` — the discount handles load adjustment.
- `S.e1rmHist` — long-run progression; see below.
- `S.bench`, `S.check`, `S.videos`, `S.prefs` — not week-keyed.

The safety net is the archive, not the undo: the attempt moves to `S.history` and stays
there. `toastUndo` is wired for the 5-second "oops", but recovery does not depend on it.

## Comeback discount

Applied in `prescWeight()` only, while `currentWeek() <= discount.throughWeek`:

```js
weight = round2_5(oneRM × pct × (1 − discount.pct/100))
```

Stored 1RMs are never modified — the haircut is presentation-layer, so real numbers survive
its expiry. `throughWeek` is the target block's last week.

**Default sized by break length**, not a flat 10%: 0% under 15 days, 5% at 15–28, 10% at
29–56, 15% beyond. Editable in all cases.

**e1RM marked stale, not deleted.** Above 28 days off, flag the latest `e1rmHist` entry
stale and show it as such next to prescribed loads. Strength loss is real and
dose-dependent on break duration
([Bosquet 2013, 103 studies](https://pubmed.ncbi.nlm.nih.gov/23347054/)), so the number is
suspect rather than wrong. The re-ramp is ACSM's rule — add 2–10% when you can beat the
target by one or two reps ([ACSM 2009](https://pubmed.ncbi.nlm.nih.gov/19204579/)) — already
expressible with per-set logging.

Deliberately **not** applied to the Lifts percentage reference table, or to `exerciseE1RM` /
`recordE1RM`, which derive from sets actually lifted.

## Comparison surface

One muted line under the target on any re-run exercise:

```
Last time: 100kg × 6 @ RPE 8
```

Read from the most recent matching archive entry. A full attempt-browser is deferred.

## Edge cases

| Case | Behaviour |
|---|---|
| Break ≤ 14 days | Reassurance shown; rewind behind a disclosure, not blocked |
| No `lastActive` (pre-existing state) | Fall back to latest `e1rmHist` / `S.bench` date; if none, skip the gate and show all options unranked |
| Rewind to Week 1 | Restarts the whole plan. Allowed. |
| Rewind to the current week | Allowed — the 15–28 day recommendation. |
| Target ahead of current week | Disabled in the picker, reason shown. |
| Rewind while paused | Allowed; the rewind consumes the pause. |
| Same block restarted repeatedly | Attempts derived from `history`; each archived separately. |
| Race date in the past | Rejected with a message. |
| `currentWeek()` > 13 after rewind | Existing clamp to 14 applies. |
| Pre-change saved state | Migration above runs once; effective dates unchanged. |
| `raceAnchored = false` | Legacy Model A restored in full. |

### Known limitation — e1RM chart collision

`e1rmHist` entries record `w: currentWeek()` at log time and `e1rmWeekly()` takes the max
per week, so after a rewind both attempts write at week 5 and the chart shows the better of
the two.

`e1rmHist` is deliberately not cleared — it is keyed by lift, not week, and a comeback
*should* read as a dip. Cheap forward fix, not required here: stamp new entries with the
attempt number so the chart can split series later.

## Testing

**Unit, in node** (slice pure functions out of `index.html`, as the project already does):

- rewind anchor math — "week N starts today" → correct `planStart`, every week, across a
  month boundary
- break-length classification at each boundary: 14/15, 28/29, 56/57 days
- `weeksNeeded` / `weeksAvailable` / earliest-fitting-week
- attempt numbering from `history`, including repeated restarts
- discount in `prescWeight()`: each break-length default, expiry at `throughWeek`, `null`
- migration: `pause.days > 0` produces identical `effStart()` / `effRace()` before and after

**Browser, via playwright-core + cached Chromium** (CLAUDE.md → Verification notes):

- a real rewind: archive written, live maps cleared for exactly those weeks and no others,
  `currentWeek()` lands on target
- race date fixed across a pause when anchored; shifts when not
- gate shows reassurance at 12 days, recommends a block restart at 40
- "Last time:" appears on a re-run exercise
- fit check renders both options when the plan doesn't fit
- pre-change `localStorage` blob loads with dates unchanged

## Out of scope

- Full attempt-browser beyond the one-line comparison
- Multi-cycle / multi-program — that's `Training Hub/`
- Editing an archived attempt
- Trimming or reordering plan weeks
- Division/scale levels, stimulus targets, phase tags — separate work, see the research doc
