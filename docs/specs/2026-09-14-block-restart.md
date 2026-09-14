# Block Restart — design spec

*Date: 2026-09-14 · Status: approved, not yet implemented · Applies to: `hyrox-app/index.html`*

## What this is

Lets the athlete rewind the plan to the start of a training block after an unplanned
break, re-run that block, and keep the record of the first attempt. Approved through
brainstorming on 2026-09-14; this is the agreed design, not a proposal.

## Why it isn't just "resume"

The app already has pause/resume (Model A): pausing shifts the race date and all downstream
dates forward by the paused days, so you resume exactly where you stopped. That's right for
a two-week holiday. It's wrong after a long layoff, where picking up mid-Block-2 at
Block-2 loads is both demoralising and a poor training decision. Restart lets you drop back
to the block's first week and rebuild through it.

## Decisions taken

| Question | Decision |
|---|---|
| When is it used? | Mid-cycle recovery, any time — not a post-race "new cycle" feature |
| Old logged data? | Keep both attempts |
| Race day? | Ask for it, warn if the plan no longer fits |
| Loads after a layoff? | Apply a comeback discount to prescriptions |
| How to keep both attempts? | **Approach A — archive on restart** |

### Why Approach A

Two alternatives were considered and rejected:

- **Attempt-suffixed keys** (`w5s0` / `w5s0@2`) keep both attempts live and editable, but
  every one of the ~20 call sites that touch `S.done` / `S.log` / `S.notes` / `S.result`
  would have to route through a resolver. Any site missed reads the wrong attempt — a
  silent data corruption, the worst failure mode available here.
- **Cycle-scoped state** (`S.cycles[]`) is the fully general model, and it already exists:
  `Training Hub/` is a working prototype of exactly that. Rebuilding it inside the
  single-race app is duplicated effort in the wrong repo.

Approach A leaves live keys untouched, so no existing read or write path changes. The cost
is that archived attempts are read-only, which is acceptable — you look at a finished
block, you don't edit it.

## Data model

Four additions to `S`. Nothing existing changes shape.

```js
S.planStart  // ISO date, or null = use the built-in PLAN_START
S.raceDate   // ISO date, or null = use the built-in RACE_DATE
S.history    // [] of archived block attempts
S.discount   // {pct: 10, throughWeek: 9} or null
```

All four default to null/empty, so existing saved state loads unchanged with no migration.

### Rewinding is a date operation

`currentWeek()` is derived from today's date against `effStart()`. The app stores no
"current week" and this design does not add one. To restart a block whose first plan week
is `W`, set `S.planStart` such that today is day 0 of week `W`:

```
planStart = today − (W − 1) × 7 days
```

`currentWeek()` then returns `W` with no change to its logic.

`effStart()` and `effRace()` gain a single fallback each:

```js
function effStart(){ const b = S.planStart ? parseISO(S.planStart) : PLAN_START;
                     return addDays(b, pauseShiftDays()); }
function effRace(){  const b = S.raceDate  ? parseISO(S.raceDate)  : RACE_DATE;
                     return addDays(b, pauseShiftDays()); }
```

**A rewind consumes the pause.** Confirming sets `S.planStart` and resets
`S.pause = {active:false, days:0}`. The lost days are now expressed by the rewind itself;
leaving both active would double-count them.

Pausing *after* a rewind behaves exactly as pause does today: `pauseShiftDays()` shifts both
`effStart()` and `effRace()` on top of the stored `planStart` / `raceDate`. Model A is
unchanged; the rewind only moves the baseline it operates on.

### Archive record

One entry per attempt, written before the live maps are cleared:

```js
{ block: 2, attempt: 1, weeks: [5, 9],
  archivedOn: '2026-09-14',
  reason: 'illness — 3 weeks off',        // optional, free text
  done: {...}, log: {...}, notes: {...}, result: {...},
  bestE1RM: { squat: 142.5, push_press: 82.1 } }
```

`bestE1RM` is computed at archive time by running `exerciseE1RM()` over every log key in
the block and keeping the best per detected lift. It is a convenience summary for the
comparison line and for a future history view — the raw sets are archived alongside it, so
nothing depends on it being complete.

Attempt number is derived, never stored as a counter:
`history.filter(h => h.block === n).length + 1`. Derived values can't drift.

## Flow

Entry point is the timeline card on the Dashboard that `renderPause()` already owns — the
existing "my schedule has gone wrong" surface. Opens a bottom sheet via the existing
`sheetIn`/`sheetOut` pattern; no new UI machinery.

Sheet order:

1. **Pick a block** — each row shows what's in it: "Block 2 · 14 of 25 sessions · last
   logged 22 Aug". Blocks ahead of the current week are disabled with a reason shown
   (restarting is for repeating work done, not skipping forward).
2. **Race date** — pre-filled from `effRace()`, editable.
3. **Fit verdict** — recomputed live as the date changes. See below.
4. **Comeback discount** — defaults to 10%, editable, "none" allowed.
5. **Reason** — optional single line, stored on the archive record.
6. **Confirm.**

### Fit check

```
weeksNeeded    = 13 − (blockFirstWeek − 1)
weeksAvailable = floor((raceDate − today) / 7)
```

If `available >= needed` the block fits. Otherwise show both real options:

```
Restarting Block 2 needs 9 weeks (W5 → race).
You have 6 before Sat 14 Nov.

→ Move race day to Sat 5 Dec to fit the full block, or
→ Rewind to Week 8 instead — the furthest back that still fits
```

The fallback target may be **mid-block** — in the example above, Week 8 sits inside Block 2
rather than at its start. That is intentional: the option is "as far back as still fits",
not "a different block". The sheet labels it as a partial restart so the athlete knows they
are not getting the whole block.

**The fit check constrains how far back you can rewind; it never mutates the plan.** An
earlier idea — trimming weeks out of the rewound block — was rejected: `WEEKS` is a fixed
13-entry array and plan-week maps directly to array index throughout the app. Skipping
weeks breaks that identity in `currentWeek()`, the week nav, `weekDates()` and every
`w<N>s<I>` key, for a rare case. Constraining the rewind target achieves the same goal and
guarantees Block 3 — race-specific work and taper — is never shortened.

### Confirm is atomic

One `save()` performs all of: archive to `S.history`; clear the matching keys from `done`,
`log`, `notes` and `result`; set `S.planStart`; set `S.raceDate`; reset `S.pause`; set
`S.discount`. No partially-applied rewind is possible.

"Matching keys" means exactly those whose week number falls inside the block's range —
`/^w(\d+)s/` with `first <= w <= last`. Keys outside the range are never touched.

Explicitly **not** cleared and **not** archived:

- `S.swap` / `S.swapGlobal` — an exercise substitution reflects equipment or an injury,
  neither of which a rewind changes. Carrying them forward is the useful behaviour.
- `S.oneRM` — the discount handles load adjustment; the stored maxes stay.
- `S.e1rmHist` — long-run progression, see Known limitation below.
- `S.bench`, `S.check`, `S.videos`, `S.prefs` — not week-keyed, unaffected.

The safety net is the archive, not the undo. Nothing is destroyed — the attempt moves to
`S.history` and stays there. The existing `toastUndo` is wired for the 5-second "oops", but
recovery does not depend on catching it.

## Comeback discount

Applied inside `prescWeight()` only, and only while `currentWeek() <= discount.throughWeek`:

```js
weight = round2_5(oneRM × pct × (1 − discount.pct/100))
```

Stored 1RMs are never modified — the haircut is presentation-layer, so real numbers are
intact when it expires. `throughWeek` is set to the rewound block's last week.

Shown as a banner with a one-tap "back to full loads" which clears `S.discount`.

Deliberately **not** applied to: the percentage reference table in the Lifts tab (that's a
reference for your actual 1RM), or `exerciseE1RM` / `recordE1RM` (those derive from sets
you actually lifted).

## Comparison surface

Minimal by design. On any exercise in a re-run week, one muted line under the target:

```
Last time: 100kg × 6 @ RPE 8
```

Read from the most recent matching archive entry. One line to render, and it's the
comparison that's useful mid-session. A full attempt-browser is deferred.

## Edge cases

| Case | Behaviour |
|---|---|
| Restart Block 1 | Restarts the whole plan. Allowed. |
| Restart the block you're currently in | Allowed — the common case (W6 → back to W5). |
| Restart a block ahead of current week | Disabled in the picker, with the reason shown. |
| Restart while a pause is active | Allowed. The rewind consumes the pause. |
| Same block restarted repeatedly | Attempts 3, 4… derived from `history`; each archived separately. |
| Race date in the past | Rejected with a message; fit check needs a future date. |
| `currentWeek()` > 13 after a rewind | Existing clamp to 14 still applies; countdown shows race passed. |
| Existing saved state, no new fields | All four fields default null/empty — loads and behaves exactly as today. |

### Known limitation — e1RM chart collision

`e1rmHist` entries record `w: currentWeek()` at log time, and `e1rmWeekly()` takes the max
per week. After a rewind, attempt 1 and attempt 2 both write entries at (say) week 5, so
the chart shows the better of the two rather than both.

`e1rmHist` is intentionally **not** cleared by a rewind — it's keyed by lift, not by week,
and represents long-run progression. A comeback should show as a dip, which is honest.

Cheap forward fix, not required for this build: stamp new entries with the attempt number
so the chart can split series later.

## Testing

**Unit, in node** (slice pure functions out of `index.html`, as the project already does):

- rewind anchor math — "week N starts today" produces the correct `planStart`, for every
  block and across a month boundary
- `weeksNeeded` / `weeksAvailable` / earliest-fitting-week
- attempt numbering derived from `history`, including repeated restarts
- discount applied in `prescWeight()`, including expiry at `throughWeek` and `null`

**Browser, via playwright-core + cached Chromium** (see CLAUDE.md → Verification notes):

- a real rewind: archive written, live maps cleared for exactly those weeks and no others,
  `currentWeek()` lands on the block's first week
- race date and countdown update
- "Last time:" line appears on a re-run exercise
- fit check renders both options when the plan doesn't fit
- saved state from before the change still loads (paste a pre-change `localStorage` blob)

## Out of scope

- Full attempt-browser / history UI beyond the one-line comparison
- Multi-cycle or multi-program support — that's `Training Hub/`
- Editing an archived attempt
- Trimming or reordering plan weeks
- Auto-suggesting which block to restart based on time off
