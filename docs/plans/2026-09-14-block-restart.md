# Block Restart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the athlete rewind the plan to an earlier week after a break, re-run that work, and keep the first attempt as read-only history — with the offer gated on how long they were actually away.

**Architecture:** Rewinding is a *date* operation. `currentWeek()` derives from today against `effStart()`; setting `S.planStart` so that today is day 0 of week W makes `currentWeek()` return W with no change to its logic. The block's live `done`/`log`/`notes`/`result` entries are copied into `S.history` and cleared, so existing read/write paths never change shape. Race day is fixed by default: an anchored pause moves nothing and the calendar absorbs the break on its own.

**Tech Stack:** Vanilla HTML/CSS/JS in one file (`index.html`, ~1600 lines). No runtime dependencies and none are to be added. Tests run the real page in Chromium via `playwright-core` (dev-only).

**Spec:** `docs/specs/2026-09-14-block-restart.md` (rev 2) — read it before starting; this plan argues from it.

## Global Constraints

- **No runtime dependencies.** The app ships as a single file plus static assets. `playwright-core` is dev-only and must live in `tests/package.json`, never in a repo-root `package.json` (Netlify auto-detects one at the root and would start running builds).
- **Never reformat or re-indent untouched code.** The file uses dense single-line functions; match that style exactly.
- **`WEEKS` is a fixed 13-entry array** and plan-week maps directly to array index. Never add, remove, or reorder weeks.
- **Dates are local-midnight**, never UTC. Existing code uses `new Date(y,m,d)` and `setHours(0,0,0,0)`; `parseISO` must produce local midnight (`new Date(s+'T00:00:00')`), matching `pauseShiftDays()`.
- **ISO date strings are `YYYY-MM-DD`** throughout, matching `e1rmHist` and `S.bench`.
- **Every `S` field added defaults to null/empty** so pre-existing saved state loads unchanged.
- **Bump `CACHE` in `sw.js`** before the final commit — required for installed apps to refresh.
- Copy tone: plain, second person, no exclamation marks. Match existing strings like `Timeline reset to original dates`.

---

### Task 1: Test harness

No test framework exists. This task builds the smallest one that can drive the real page, because every later task depends on it. Tests run the actual `index.html` in Chromium rather than slicing functions out of it — the app's functions are top-level script bindings and are reachable from `page.evaluate`.

**Files:**
- Create: `tests/package.json`
- Create: `tests/run.js`
- Create: `tests/cases.js`
- Modify: `.gitignore` (add `tests/node_modules/`)
- Modify: `netlify.toml` (explicit empty build command)

**Interfaces:**
- Consumes: nothing.
- Produces: `tests/cases.js` exports `module.exports = [ {name, now, state, fn} ]` where `now` is an optional `'YYYY-MM-DD'` that stubs the page clock, `state` is an optional object merged into `localStorage` under `hyrox_dash_raha_v1` before load, and `fn` is a self-contained function evaluated in page context returning `[ok, detail]`. Every later task appends cases to this array. Run with `node tests/run.js` from `tests/`.

- [ ] **Step 1: Create `tests/package.json`**

```json
{
  "name": "hyrox-app-tests",
  "private": true,
  "version": "1.0.0",
  "scripts": { "test": "node run.js" },
  "devDependencies": { "playwright-core": "^1.47.0" }
}
```

- [ ] **Step 2: Install**

Run: `cd tests && npm install`
Expected: `playwright-core` in `tests/node_modules`, no errors.

- [ ] **Step 3: Create `tests/run.js`**

```js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const PORT = 8791;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.png':'image/png', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json' };

// Chromium: env override, else the playwright cache this machine already has.
const EXE = process.env.CHROMIUM || path.join(process.env.HOME,
  'Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64',
  'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(b);
  });
});

// Freezes the page clock so date maths is deterministic. Must still allow new Date(y,m,d).
function clockStub() {
  if (!window.__NOW) return;
  const R = Date, N = new R(window.__NOW + 'T12:00:00');
  window.Date = class extends R {
    constructor(...a) { if (a.length === 0) super(N.getTime()); else super(...a); }
    static now() { return N.getTime(); }
  };
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  if (!fs.existsSync(EXE)) {
    console.error('Chromium not found at:\n  ' + EXE + '\nSet CHROMIUM=/path/to/chromium');
    process.exit(2);
  }
  const browser = await chromium.launch({ executablePath: EXE });
  const cases = require('./cases.js');
  let pass = 0, fail = 0;

  for (const c of cases) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(`window.__NOW = ${JSON.stringify(c.now || null)};`);
    await ctx.addInitScript(clockStub);
    if (c.state) {
      await ctx.addInitScript(
        `try{ localStorage.setItem('hyrox_dash_raha_v1', ${JSON.stringify(JSON.stringify(c.state))}); }catch(e){}`);
    }
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });

    let ok = false, detail = '';
    try { [ok, detail] = await pg.evaluate(c.fn); }
    catch (e) { ok = false; detail = 'threw: ' + e.message; }
    if (errs.length) { ok = false; detail += ' | page errors: ' + errs.join('; '); }

    console.log((ok ? '  PASS  ' : '  FAIL  ') + c.name + (detail ? '   ' + detail : ''));
    ok ? pass++ : fail++;
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Create `tests/cases.js` with one self-check**

This first case proves the harness works — the page loads, app globals are reachable, and the clock stub bites.

```js
module.exports = [
  {
    name: 'harness: page loads, globals reachable, clock stubbed',
    now: '2026-07-06',
    fn: () => {
      if (typeof WEEKS === 'undefined') return [false, 'WEEKS not reachable'];
      if (WEEKS.length !== 13) return [false, 'WEEKS length ' + WEEKS.length];
      const today = new Date();
      if (today.getFullYear() !== 2026 || today.getMonth() !== 6 || today.getDate() !== 6)
        return [false, 'clock not stubbed: ' + today.toDateString()];
      // 6 Jul 2026 is the Monday of plan week 2
      if (currentWeek() !== 2) return [false, 'currentWeek ' + currentWeek() + ', expected 2'];
      return [true, ''];
    }
  }
];
```

- [ ] **Step 5: Run it**

Run: `cd tests && node run.js`
Expected: `PASS  harness: page loads, globals reachable, clock stubbed` and `1 passed, 0 failed`.

- [ ] **Step 6: Keep dev files out of git and out of Netlify's way**

Append to `.gitignore`:

```
# Test harness deps
tests/node_modules/
```

In `netlify.toml`, change the `[build]` block to state there is no build step, so a future `tests/package.json` can never trigger one:

```toml
[build]
  publish = "."
  command = ""
```

- [ ] **Step 7: Verify the app still serves**

Run: `cd tests && node run.js`
Expected: still `1 passed, 0 failed`.

- [ ] **Step 8: Commit**

```bash
git add tests/package.json tests/run.js tests/cases.js .gitignore netlify.toml
git commit -m "test: add browser test harness for the real page

Runs index.html in Chromium via playwright-core and evaluates assertions in
page context, so tests exercise the shipped code rather than sliced copies.
Clock is stubbable per case for deterministic date maths.

playwright-core lives in tests/package.json, never at the repo root, because
Netlify auto-detects a root package.json and would start running builds."
```

---

### Task 2: Break length — `S.lastActive`, `breakDays()`, `breakAdvice()`

The app cannot currently tell how long someone has been away: `S.done[id]` is a bare boolean with no timestamp. This task adds that, and the classification the gate needs.

**Files:**
- Modify: `index.html` — `S` initialiser (line ~761), helpers after `save()` (line ~763), and ten training-write handlers
- Modify: `tests/cases.js`

**Interfaces:**
- Consumes: `save()`, `S`.
- Produces:
  - `todayISO() -> 'YYYY-MM-DD'`
  - `parseISO(s) -> Date` (local midnight)
  - `addDays(d, n) -> Date` (new Date, does not mutate)
  - `daysBetween(isoA, isoB) -> number` (whole days, b − a)
  - `lastActiveISO() -> string|null` — newest of `S.lastActive`, `S.pause.since`, latest `e1rmHist` date, latest `S.bench` date
  - `breakDays() -> number` — days since `lastActiveISO()`, `0` if unknown
  - `breakAdvice(days) -> {tier, discountPct}` where tier ∈ `'none'|'week'|'block'|'plan'`
  - `saveTrained()` — stamps `S.lastActive` then calls `save()`
  - `S.lastActive` on state

- [ ] **Step 1: Write the failing tests**

Append to the array in `tests/cases.js`:

```js
{
  name: 'breakAdvice: tier boundaries at 14/15, 28/29, 56/57',
  now: '2026-09-14',
  fn: () => {
    const want = [[0,'none',0],[14,'none',0],[15,'week',5],[28,'week',5],
                  [29,'block',10],[56,'block',10],[57,'plan',15],[400,'plan',15]];
    for (const [d, tier, pct] of want) {
      const a = breakAdvice(d);
      if (a.tier !== tier) return [false, `${d}d -> ${a.tier}, expected ${tier}`];
      if (a.discountPct !== pct) return [false, `${d}d -> ${a.discountPct}%, expected ${pct}%`];
    }
    return [true, ''];
  }
},
{
  name: 'daysBetween / addDays cross a month boundary',
  now: '2026-09-14',
  fn: () => {
    if (daysBetween('2026-08-28', '2026-09-03') !== 6) return [false, 'daysBetween wrong'];
    if (daysBetween('2026-09-03', '2026-08-28') !== -6) return [false, 'negative wrong'];
    const d = addDays(parseISO('2026-08-30'), 3);
    if (d.getMonth() !== 8 || d.getDate() !== 2) return [false, 'addDays -> ' + d.toDateString()];
    return [true, ''];
  }
},
{
  name: 'breakDays: uses S.lastActive when present',
  now: '2026-09-14',
  state: { lastActive: '2026-08-15' },
  fn: () => breakDays() === 30 ? [true, ''] : [false, 'got ' + breakDays()]
},
{
  name: 'breakDays: falls back to newest of pause.since / e1rmHist / bench',
  now: '2026-09-14',
  state: { pause: { active: false, days: 0, since: '2026-08-01' },
           e1rmHist: { squat: [{ date: '2026-08-20', v: 140, w: 8 }] },
           bench: { row1k: [{ date: '2026-08-10', v: 222 }] } },
  fn: () => breakDays() === 25 ? [true, ''] : [false, 'got ' + breakDays() + ', expected 25 (from 2026-08-20)']
},
{
  name: 'breakDays: 0 when nothing is known',
  now: '2026-09-14',
  fn: () => breakDays() === 0 ? [true, ''] : [false, 'got ' + breakDays()]
},
{
  name: 'saveTrained stamps lastActive; save() alone does not',
  now: '2026-09-14',
  fn: () => {
    delete S.lastActive; save();
    if (S.lastActive) return [false, 'save() stamped lastActive'];
    saveTrained();
    if (S.lastActive !== '2026-09-14') return [false, 'saveTrained -> ' + S.lastActive];
    const raw = JSON.parse(localStorage.getItem('hyrox_dash_raha_v1'));
    if (raw.lastActive !== '2026-09-14') return [false, 'not persisted'];
    return [true, ''];
  }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd tests && node run.js`
Expected: the harness case passes; all six new cases FAIL with `breakAdvice is not defined` and similar.

- [ ] **Step 3: Add `lastActive` to the state initialiser**

In `index.html` line ~761, add the field to the `let S = {...}` literal (keep it on one line, matching style):

```js
let S = {done:{}, bench:{}, check:{}, oneRM:{}, log:{}, videos:{}, notes:{}, e1rmHist:{}, prefs:{}, result:{}, swap:{}, swapGlobal:{}, e1rmNames:{}, pause:{active:false,days:0}, lastActive:null, planStart:null, raceDate:null, raceAnchored:true, history:[], discount:null};
```

All six new fields go in now so later tasks don't re-touch this line. `planStart`, `raceDate`, `raceAnchored`, `history` and `discount` are unused until Task 3.

- [ ] **Step 4: Add the date helpers and the gate**

Insert immediately after `function save(){...}` (line ~763):

```js
/* =================== DATES + BREAK GATE =================== */
function todayISO(){ const d=new Date(); d.setHours(0,0,0,0); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function parseISO(s){ const d=new Date(s+'T00:00:00'); d.setHours(0,0,0,0); return d; }
function addDays(d,n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function daysBetween(a,b){ return Math.round((parseISO(b)-parseISO(a))/864e5); }
function lastActiveISO(){ const c=[]; if(S.lastActive) c.push(S.lastActive); if(S.pause&&S.pause.since) c.push(S.pause.since);
  Object.keys(S.e1rmHist||{}).forEach(k=>(S.e1rmHist[k]||[]).forEach(e=>e.date&&c.push(e.date)));
  Object.keys(S.bench||{}).forEach(k=>(S.bench[k]||[]).forEach(e=>e.date&&c.push(e.date)));
  return c.length? c.sort()[c.length-1] : null; }
function breakDays(){ const l=lastActiveISO(); if(!l) return 0; return Math.max(0,daysBetween(l,todayISO())); }
function breakAdvice(days){ if(days<=14) return {tier:'none',discountPct:0}; if(days<=28) return {tier:'week',discountPct:5}; if(days<=56) return {tier:'block',discountPct:10}; return {tier:'plan',discountPct:15}; }
function saveTrained(){ S.lastActive=todayISO(); save(); }
```

- [ ] **Step 5: Run tests — expect five of six passing**

Run: `cd tests && node run.js`
Expected: all cases PASS except possibly none. If `saveTrained stamps lastActive` fails, check `todayISO()` is using the stubbed clock.

- [ ] **Step 6: Swap `save()` for `saveTrained()` at the ten training-write handlers**

These are the only sites that mean "the athlete trained". Change **only** the `save()` call inside each; leave everything else alone. Settings, swaps, pause and 1RM edits keep plain `save()`.

| Line (approx) | Handler |
|---|---|
| 1213 | `toggleWorkoutDone()` |
| 1239 | `wireWorkout` — `.setgrid input` change |
| 1251 | `wireWorkout` — `[data-add]` click |
| 1252 | `wireWorkout` — `[data-del]` click |
| 1258 | `wireWorkout` — result field change |
| 1319 | `wireWeekView` — session done checkbox |
| 1323 | `wireWeekView` — `.setgrid input` change |
| 1339 | `wireWeekView` — add-set click |
| 1345 | `wireWeekView` — remove-set click |
| 1355 | `wireWeekView` — result field change |
| 1465 | `addBench()` |

Verify the count afterwards:

Run: `grep -o "saveTrained()" index.html | wc -l`
Expected: `12` — eleven call sites plus the function definition. Use `grep -o`, not
`grep -c`: two of these handlers sit on one line and `-c` counts lines, not occurrences.

- [ ] **Step 7: Run the full suite**

Run: `cd tests && node run.js`
Expected: `7 passed, 0 failed`.

- [ ] **Step 8: Commit**

```bash
git add index.html tests/cases.js
git commit -m "feat: track last training date and classify break length

S.done[id] is a bare boolean, so the app could not tell how long someone had
been away unless they formally pressed pause -- and the people who need the
restart feature most are those who stopped without pressing anything.

saveTrained() stamps S.lastActive and is swapped in at the ten handlers that
mean 'the athlete trained'. Plain save() stays everywhere else, so changing a
setting is not mistaken for training.

breakAdvice thresholds (14/28/56 days) are inference calibrated against the
detraining literature; see the spec."
```

---

### Task 3: Date anchoring and migration

Makes `effStart()`/`effRace()` read the new anchors, stops an anchored pause moving race day, and folds any existing accumulated `pause.days` into the new fields so visible dates do not jump.

**Files:**
- Modify: `index.html` — `effStart()`, `effRace()` (lines ~768-769), plus a migration call after the state load (line ~762)
- Modify: `tests/cases.js`

**Interfaces:**
- Consumes: `parseISO`, `addDays`, `todayISO` (Task 2), `PLAN_START`, `RACE_DATE`, `pauseShiftDays()`.
- Produces:
  - `effStart()` / `effRace()` honouring `S.planStart` / `S.raceDate` / `S.raceAnchored`
  - `migrateDates()` — runs once at load, idempotent

- [ ] **Step 1: Write the failing tests**

Append to `tests/cases.js`:

```js
{
  name: 'effStart/effRace fall back to the built-ins when unset',
  now: '2026-09-14',
  fn: () => {
    const s = effStart(), r = effRace();
    if (s.getFullYear() !== 2026 || s.getMonth() !== 5 || s.getDate() !== 29)
      return [false, 'effStart ' + s.toDateString()];
    if (r.getFullYear() !== 2026 || r.getMonth() !== 8 || r.getDate() !== 26)
      return [false, 'effRace ' + r.toDateString()];
    return [true, ''];
  }
},
{
  name: 'anchored pause does not move race day',
  now: '2026-09-14',
  state: { raceAnchored: true, pause: { active: true, days: 0, since: '2026-08-31' } },
  fn: () => {
    const r = effRace();
    if (r.getMonth() !== 8 || r.getDate() !== 26) return [false, 'race moved to ' + r.toDateString()];
    // plan start still slides, so the athlete is shown an earlier week
    const s = effStart();
    if (s.getDate() === 29 && s.getMonth() === 5) return [false, 'effStart did not shift'];
    return [true, ''];
  }
},
{
  name: 'unanchored pause moves race day (legacy Model A)',
  now: '2026-09-14',
  state: { raceAnchored: false, pause: { active: false, days: 10 } },
  fn: () => {
    const r = effRace();
    if (r.getMonth() !== 9 || r.getDate() !== 6) return [false, 'expected 6 Oct, got ' + r.toDateString()];
    return [true, ''];
  }
},
{
  name: 'migration: accumulated pause.days folds in, effective dates unchanged',
  now: '2026-09-14',
  state: { pause: { active: false, days: 10 } },
  fn: () => {
    // migrateDates ran at load. Dates must look exactly as legacy Model A showed them.
    if (S.pause.days !== 0) return [false, 'pause.days not cleared: ' + S.pause.days];
    if (S.planStart !== '2026-07-09') return [false, 'planStart ' + S.planStart];
    if (S.raceDate !== '2026-10-06') return [false, 'raceDate ' + S.raceDate];
    const s = effStart(), r = effRace();
    if (s.getMonth() !== 6 || s.getDate() !== 9) return [false, 'effStart ' + s.toDateString()];
    if (r.getMonth() !== 9 || r.getDate() !== 6) return [false, 'effRace ' + r.toDateString()];
    return [true, ''];
  }
},
{
  name: 'migration is idempotent and skips when planStart already set',
  now: '2026-09-14',
  state: { pause: { active: false, days: 10 }, planStart: '2026-07-01', raceDate: '2026-09-30' },
  fn: () => {
    if (S.planStart !== '2026-07-01') return [false, 'planStart overwritten: ' + S.planStart];
    migrateDates(); migrateDates();
    if (S.planStart !== '2026-07-01') return [false, 'not idempotent'];
    return [true, ''];
  }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd tests && node run.js`
Expected: the three anchoring/migration cases FAIL (`migrateDates is not defined`, race day moves when it should not). The first case PASSES already — that is the existing behaviour and is the regression guard.

- [ ] **Step 3: Rewrite `effStart` and `effRace`**

Replace lines ~768-769 exactly:

```js
function effStart(){ const b=S.planStart?parseISO(S.planStart):new Date(PLAN_START); return addDays(b,pauseShiftDays()); }
function effRace(){ const b=S.raceDate?parseISO(S.raceDate):new Date(RACE_DATE); return S.raceAnchored===false?addDays(b,pauseShiftDays()):new Date(b); }
```

`S.raceAnchored===false` rather than `!S.raceAnchored` so that state saved before this field existed (where it is `undefined`) gets the new anchored behaviour, which is the default.

- [ ] **Step 4: Add the migration and call it at load**

Insert immediately after the `try{ ... localStorage.getItem(STORE_KEY) ... }catch(e){}` line (~762):

```js
function migrateDates(){ if(S.planStart) return; const d=(S.pause&&S.pause.days)||0; if(d<=0) return;
  const iso=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
  S.planStart=iso(addDays(new Date(PLAN_START),d)); S.raceDate=iso(addDays(new Date(RACE_DATE),d)); S.pause.days=0; save(); }
```

Then call it. It must run after the state load and after `parseISO`/`addDays` are defined — function declarations hoist, so place the call directly under the load line:

```js
migrateDates();
```

Guarded by `S.planStart` being set, so it runs exactly once and is safe to call again.

- [ ] **Step 5: Run tests**

Run: `cd tests && node run.js`
Expected: `12 passed, 0 failed`.

- [ ] **Step 6: Confirm nothing else regressed**

Run: `node -e "const s=require('fs').readFileSync('index.html','utf8'); const o=(s.match(/<div\b/g)||[]).length, c=(s.match(/<\/div>/g)||[]).length; console.log(o===c?'divs balanced '+o:'MISMATCH '+o+'/'+c);"`
Expected: `divs balanced 192`

- [ ] **Step 7: Commit**

```bash
git add index.html tests/cases.js
git commit -m "feat: anchor the plan to race day by default

26 Sep 2026 is a registered event that does not move, and the taper is the
part you least want to slide. An anchored pause now moves nothing: real time
passes, currentWeek() advances on its own and the athlete has simply missed
those weeks, so no compression logic is needed. Legacy Model A stays available
behind S.raceAnchored=false for an unregistered goal date.

migrateDates() folds any accumulated pause.days into planStart/raceDate once,
so effective dates are visibly identical before and after the change."
```

---

### Task 4: Rewind and fit maths

Pure functions. No state is written here — Task 6 composes these into the transaction.

**Files:**
- Modify: `index.html` — insert after `currentWeek()` (line ~771)
- Modify: `tests/cases.js`

**Interfaces:**
- Consumes: `parseISO`, `addDays`, `todayISO`, `daysBetween` (Task 2), `effRace()` (Task 3), `BLOCKS`, `WEEKS`.
- Produces:
  - `blockRange(n) -> [firstWeek, lastWeek]`
  - `blockOfWeek(w) -> number`
  - `rewindAnchorISO(targetWeek) -> 'YYYY-MM-DD'` — the `S.planStart` that makes today day 0 of `targetWeek`
  - `weeksNeeded(targetWeek) -> number`
  - `weeksAvailable(raceISO) -> number`
  - `earliestFittingWeek(raceISO) -> number`
  - `raceISOForWeek(targetWeek) -> 'YYYY-MM-DD'` — earliest race date that fits a full rewind to `targetWeek`

- [ ] **Step 1: Write the failing tests**

Append to `tests/cases.js`:

```js
{
  name: 'blockRange / blockOfWeek match the BLOCKS table',
  now: '2026-09-14',
  fn: () => {
    const want = [[1,[1,4]],[2,[5,9]],[3,[10,13]]];
    for (const [n, r] of want) {
      const g = blockRange(n);
      if (g[0] !== r[0] || g[1] !== r[1]) return [false, 'block ' + n + ' -> ' + JSON.stringify(g)];
    }
    for (const [w, b] of [[1,1],[4,1],[5,2],[9,2],[10,3],[13,3]])
      if (blockOfWeek(w) !== b) return [false, 'week ' + w + ' -> block ' + blockOfWeek(w)];
    return [true, ''];
  }
},
{
  name: 'rewindAnchorISO makes currentWeek() return the target',
  now: '2026-09-14',
  fn: () => {
    for (let w = 1; w <= 13; w++) {
      S.planStart = rewindAnchorISO(w);
      if (currentWeek() !== w) return [false, 'week ' + w + ' -> anchor ' + S.planStart + ' gives ' + currentWeek()];
    }
    return [true, ''];
  }
},
{
  name: 'rewindAnchorISO crosses a month boundary correctly',
  now: '2026-10-02',
  fn: () => {
    // week 3 starting today means planStart is 14 days back: 18 Sep
    if (rewindAnchorISO(3) !== '2026-09-18') return [false, 'got ' + rewindAnchorISO(3)];
    return [true, ''];
  }
},
{
  name: 'weeksNeeded counts target week through end of plan',
  now: '2026-09-14',
  fn: () => {
    for (const [w, n] of [[1,13],[5,9],[8,6],[10,4],[13,1]])
      if (weeksNeeded(w) !== n) return [false, 'week ' + w + ' -> ' + weeksNeeded(w) + ', expected ' + n];
    return [true, ''];
  }
},
{
  name: 'weeksAvailable and earliestFittingWeek against a near race date',
  now: '2026-09-14',
  fn: () => {
    // 14 Nov 2026 is 61 days out -> 8 whole weeks
    if (weeksAvailable('2026-11-14') !== 8) return [false, 'weeksAvailable ' + weeksAvailable('2026-11-14')];
    // needs <= 8 weeks means targetWeek >= 6
    if (earliestFittingWeek('2026-11-14') !== 6) return [false, 'earliest ' + earliestFittingWeek('2026-11-14')];
    return [true, ''];
  }
},
{
  name: 'raceISOForWeek returns a date that makes the rewind fit exactly',
  now: '2026-09-14',
  fn: () => {
    const iso = raceISOForWeek(5);              // needs 9 weeks from today
    if (weeksAvailable(iso) < weeksNeeded(5)) return [false, iso + ' does not fit'];
    if (earliestFittingWeek(iso) > 5) return [false, 'earliest at ' + iso + ' is ' + earliestFittingWeek(iso)];
    return [true, ''];
  }
},
{
  name: 'earliestFittingWeek clamps to 13 when the race is imminent',
  now: '2026-09-14',
  fn: () => {
    const e = earliestFittingWeek('2026-09-20');
    if (e !== 13) return [false, 'got ' + e];
    return [true, ''];
  }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd tests && node run.js`
Expected: seven FAILs, `blockRange is not defined`.

- [ ] **Step 3: Implement**

Insert after `function currentWeek(){...}` (line ~771):

```js
/* =================== REWIND + FIT MATHS =================== */
function blockRange(n){ const b=BLOCKS.find(x=>x.n===n); return b?[b.weeks[0],b.weeks[1]]:[1,13]; }
function blockOfWeek(w){ const b=BLOCKS.find(x=>w>=x.weeks[0]&&w<=x.weeks[1]); return b?b.n:1; }
function rewindAnchorISO(w){ const d=addDays(parseISO(todayISO()),-(w-1)*7); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function weeksNeeded(w){ return WEEKS.length-(w-1); }
function weeksAvailable(raceISO){ return Math.floor(daysBetween(todayISO(),raceISO)/7); }
function earliestFittingWeek(raceISO){ const a=weeksAvailable(raceISO); return Math.max(1,Math.min(WEEKS.length,WEEKS.length-a+1)); }
function raceISOForWeek(w){ const d=addDays(parseISO(todayISO()),weeksNeeded(w)*7); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
```

- [ ] **Step 4: Run tests**

Run: `cd tests && node run.js`
Expected: `19 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/cases.js
git commit -m "feat: rewind anchor and race-fit maths

Pure functions, no state writes. rewindAnchorISO(w) returns the planStart that
makes today day 0 of week w, so currentWeek() returns w with no change to its
logic -- verified for all 13 weeks and across a month boundary.

The fit check constrains how far back a rewind may go rather than mutating the
fixed 13-entry WEEKS array, which guarantees the taper is never shortened."
```

---

### Task 5: Archive and clear

Moves a week range's live entries into `S.history` and removes them from the live maps. Still no UI — Task 6 wires the transaction.

**Files:**
- Modify: `index.html` — insert after the rewind maths from Task 4
- Modify: `tests/cases.js`

**Interfaces:**
- Consumes: `todayISO` (Task 2), `blockOfWeek` (Task 4), `exerciseE1RM(key)`, `detectLift`, `loggableItems`, `itemForKey`, `WEEKS`, `S`.
- Produces:
  - `weekOfKey(key) -> number|null` — parses the leading `w<N>` from `w5s0` / `w5s0x2`
  - `keysInRange(map, first, last) -> string[]`
  - `attemptNumber(blockN) -> number`
  - `bestE1RMFor(first, last) -> {liftKey: number}`
  - `archiveRange(first, last, meta) -> object` — pushes onto `S.history` and returns the record; does **not** save
  - `clearRange(first, last)` — deletes matching keys from `done`/`log`/`notes`/`result`; does **not** save

- [ ] **Step 1: Write the failing tests**

Append to `tests/cases.js`:

```js
{
  name: 'weekOfKey parses session and exercise keys',
  now: '2026-09-14',
  fn: () => {
    for (const [k, w] of [['w5s0',5],['w12s3x2',12],['w1s0x0',1],['nonsense',null],['',null]])
      if (weekOfKey(k) !== w) return [false, k + ' -> ' + weekOfKey(k)];
    return [true, ''];
  }
},
{
  name: 'clearRange removes only keys inside the range',
  now: '2026-09-14',
  state: { done: { w4s0: true, w5s0: true, w9s1: true, w10s0: true },
           log: { w4s0x0: { sets: [{ w: '100' }] }, w5s0x0: { sets: [{ w: '110' }] },
                  w9s2x1: { sets: [{ w: '90' }] }, w10s0x0: { sets: [{ w: '120' }] } },
           notes: { w5s1: 'felt ok', w11s0: 'keep' },
           result: { w6s3: { t: '31:20' }, w13s3: { t: '29:00' } } },
  fn: () => {
    clearRange(5, 9);
    const left = Object.keys(S.done).concat(Object.keys(S.log), Object.keys(S.notes), Object.keys(S.result)).sort();
    const want = ['w10s0', 'w10s0x0', 'w11s0', 'w13s3', 'w4s0', 'w4s0x0'].sort();
    if (JSON.stringify(left) !== JSON.stringify(want))
      return [false, 'left ' + JSON.stringify(left) + ' want ' + JSON.stringify(want)];
    return [true, ''];
  }
},
{
  name: 'archiveRange captures the range and numbers the attempt',
  now: '2026-09-14',
  state: { done: { w5s0: true, w6s0: true, w10s0: true },
           log: { w5s0x0: { sets: [{ w: '100', reps: '5' }] } },
           notes: { w5s1: 'heavy' }, result: { w6s3: { t: '31:20' } } },
  fn: () => {
    const rec = archiveRange(5, 9, { block: 2, breakDays: 34, reason: 'illness' });
    if (S.history.length !== 1) return [false, 'history len ' + S.history.length];
    if (rec.attempt !== 1) return [false, 'attempt ' + rec.attempt];
    if (rec.block !== 2 || rec.breakDays !== 34 || rec.reason !== 'illness') return [false, 'meta wrong'];
    if (rec.archivedOn !== '2026-09-14') return [false, 'archivedOn ' + rec.archivedOn];
    if (!rec.done.w5s0 || !rec.done.w6s0) return [false, 'done not captured'];
    if (rec.done.w10s0) return [false, 'captured outside range'];
    if (!rec.log.w5s0x0) return [false, 'log not captured'];
    if (rec.notes.w5s1 !== 'heavy') return [false, 'notes not captured'];
    if (!rec.result.w6s3) return [false, 'result not captured'];
    // live maps untouched by archive alone
    if (!S.done.w5s0) return [false, 'archive cleared live state'];
    return [true, ''];
  }
},
{
  name: 'attemptNumber increments per block from history',
  now: '2026-09-14',
  state: { history: [ { block: 2, attempt: 1, weeks: [5,9] }, { block: 2, attempt: 2, weeks: [5,9] },
                      { block: 1, attempt: 1, weeks: [1,4] } ] },
  fn: () => {
    if (attemptNumber(2) !== 3) return [false, 'block 2 -> ' + attemptNumber(2)];
    if (attemptNumber(1) !== 2) return [false, 'block 1 -> ' + attemptNumber(1)];
    if (attemptNumber(3) !== 1) return [false, 'block 3 -> ' + attemptNumber(3)];
    return [true, ''];
  }
},
{
  name: 'bestE1RMFor picks the best Epley estimate per lift in range',
  now: '2026-09-14',
  fn: () => {
    // w1s0x0 is "Back squat 4x6 @ 70-75%" in the shipped plan
    S.log = { w1s0x0: { sets: [{ w: '100', reps: '5' }, { w: '110', reps: '3' }] } };
    const best = bestE1RMFor(1, 4);
    const vals = Object.values(best);
    if (!vals.length) return [false, 'nothing detected: ' + JSON.stringify(best)];
    // Epley: 110*(1+3/30)=121 beats 100*(1+5/30)=116.7
    if (Math.abs(vals[0] - 121) > 0.2) return [false, 'got ' + JSON.stringify(best)];
    return [true, ''];
  }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd tests && node run.js`
Expected: five FAILs, `weekOfKey is not defined`.

- [ ] **Step 3: Implement**

Insert after `raceISOForWeek` from Task 4:

```js
/* =================== ARCHIVE =================== */
function weekOfKey(k){ const m=String(k).match(/^w(\d+)s\d+/); return m?+m[1]:null; }
function keysInRange(map,first,last){ return Object.keys(map||{}).filter(k=>{ const w=weekOfKey(k); return w!==null&&w>=first&&w<=last; }); }
function attemptNumber(n){ return (S.history||[]).filter(h=>h.block===n).length+1; }
function bestE1RMFor(first,last){ const out={};
  keysInRange(S.log,first,last).forEach(k=>{ const e=exerciseE1RM(k); if(!e) return; const it=itemForKey(k); const L=it?detectLift(it):null; const id=L?L.k:(it?movementKey(movementName(it)):k);
    if(!out[id]||e>out[id]) out[id]=Math.round(e*10)/10; });
  return out; }
function archiveRange(first,last,meta){ meta=meta||{};
  const pick=m=>{ const o={}; keysInRange(m,first,last).forEach(k=>o[k]=m[k]); return o; };
  const rec={weeks:[first,last], block:(meta.block===undefined?null:meta.block), attempt:attemptNumber(meta.block===undefined?null:meta.block),
    archivedOn:todayISO(), breakDays:meta.breakDays||0, reason:meta.reason||'',
    done:pick(S.done), log:pick(S.log), notes:pick(S.notes), result:pick(S.result), bestE1RM:bestE1RMFor(first,last)};
  if(!Array.isArray(S.history)) S.history=[]; S.history.push(rec); return rec; }
function clearRange(first,last){ [['done',S.done],['log',S.log],['notes',S.notes],['result',S.result]].forEach(([,m])=>{ keysInRange(m,first,last).forEach(k=>delete m[k]); }); }
```

- [ ] **Step 4: Run tests**

Run: `cd tests && node run.js`
Expected: `24 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/cases.js
git commit -m "feat: archive a week range to S.history and clear it

Archiving copies exactly the keys whose week falls in range into a dated
record and leaves the live maps alone; clearing is a separate call so Task 6
can order them. Attempt number is derived from history rather than stored, so
it cannot drift.

Swaps, 1RMs, benchmarks and e1rmHist are deliberately untouched -- see spec."
```

---

### Task 6: The rewind transaction

Composes Tasks 3-5 into one atomic operation.

**Files:**
- Modify: `index.html` — insert after `clearRange`
- Modify: `tests/cases.js`

**Interfaces:**
- Consumes: everything from Tasks 2-5, plus `save()`, `renderAll()`, `toastUndo`.
- Produces: `doRewind(opts) -> object` where `opts = {targetWeek, raceISO, discountPct, reason, blockN}`. Returns the archive record. Performs one `save()`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/cases.js`:

```js
{
  name: 'doRewind archives, clears, re-anchors and sets the discount in one go',
  now: '2026-09-14',
  state: { lastActive: '2026-08-11',
           done: { w5s0: true, w6s0: true, w4s0: true },
           log: { w5s0x0: { sets: [{ w: '100', reps: '5' }] } },
           pause: { active: false, days: 3 } },
  fn: () => {
    const rec = doRewind({ targetWeek: 5, raceISO: '2026-12-05', discountPct: 10, reason: 'illness', blockN: 2 });
    if (currentWeek() !== 5) return [false, 'currentWeek ' + currentWeek()];
    if (S.done.w5s0 || S.done.w6s0) return [false, 'in-range done not cleared'];
    if (!S.done.w4s0) return [false, 'out-of-range done was cleared'];
    if (S.log.w5s0x0) return [false, 'in-range log not cleared'];
    if (S.history.length !== 1 || !S.history[0].done.w5s0) return [false, 'not archived'];
    if (S.raceDate !== '2026-12-05') return [false, 'raceDate ' + S.raceDate];
    if (!S.discount || S.discount.pct !== 10 || S.discount.throughWeek !== 9)
      return [false, 'discount ' + JSON.stringify(S.discount)];
    if (S.pause.active !== false || S.pause.days !== 0) return [false, 'pause not consumed'];
    if (S.history[0].breakDays !== 34) return [false, 'breakDays ' + S.history[0].breakDays];
    const raw = JSON.parse(localStorage.getItem('hyrox_dash_raha_v1'));
    if (!raw.history || raw.history.length !== 1) return [false, 'not persisted'];
    return [true, ''];
  }
},
{
  name: 'doRewind with discountPct 0 stores no discount',
  now: '2026-09-14',
  fn: () => {
    doRewind({ targetWeek: 8, raceISO: '2026-11-21', discountPct: 0, reason: '', blockN: 2 });
    if (S.discount !== null) return [false, 'discount ' + JSON.stringify(S.discount)];
    if (currentWeek() !== 8) return [false, 'currentWeek ' + currentWeek()];
    return [true, ''];
  }
},
{
  name: 'doRewind to a single week uses that week as its own range',
  now: '2026-09-14',
  state: { done: { w7s0: true, w8s0: true } },
  fn: () => {
    doRewind({ targetWeek: 8, raceISO: '2026-11-21', discountPct: 5, reason: '', blockN: null, single: true });
    if (S.done.w8s0) return [false, 'week 8 not cleared'];
    if (!S.done.w7s0) return [false, 'week 7 wrongly cleared'];
    if (S.history[0].weeks[0] !== 8 || S.history[0].weeks[1] !== 8)
      return [false, 'range ' + JSON.stringify(S.history[0].weeks)];
    return [true, ''];
  }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd tests && node run.js`
Expected: three FAILs, `doRewind is not defined`.

- [ ] **Step 3: Implement**

Insert after `clearRange`:

```js
function doRewind(o){ const t=Math.max(1,Math.min(WEEKS.length,+o.targetWeek||1));
  const single=!!o.single, bn=single?null:(o.blockN||blockOfWeek(t));
  const range=single?[t,t]:blockRange(bn); const first=single?t:Math.min(range[0],t), last=range[1];
  const rec=archiveRange(first,last,{block:bn,breakDays:breakDays(),reason:o.reason||''});
  clearRange(first,last);
  S.planStart=rewindAnchorISO(t);
  if(o.raceISO) S.raceDate=o.raceISO;
  S.pause={active:false,days:0};
  const pct=+o.discountPct||0;
  S.discount=pct>0?{pct:pct,throughWeek:last}:null;
  S.lastActive=todayISO();
  save(); return rec; }
```

- [ ] **Step 4: Run tests**

Run: `cd tests && node run.js`
Expected: `27 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/cases.js
git commit -m "feat: doRewind -- one atomic rewind transaction

Archives the range, clears it, re-anchors planStart so currentWeek() lands on
the target, sets the race date and comeback discount, and consumes the pause.
Single save() at the end, so no partially-applied rewind is possible."
```

---

### Task 7: Comeback discount and stale e1RM

**Files:**
- Modify: `index.html` — `prescWeight()` (line ~970), plus two helpers
- Modify: `tests/cases.js`

**Interfaces:**
- Consumes: `S.discount`, `currentWeek()`, `breakDays()`, `round2_5`, `detectLift`, `S.oneRM`.
- Produces:
  - `discountFactor() -> number` — `1` or `1 − pct/100`
  - `e1rmStale() -> boolean` — true when the break exceeded 28 days
  - `prescWeight()` applying `discountFactor()`

- [ ] **Step 1: Write the failing tests**

Append to `tests/cases.js`:

```js
{
  name: 'discountFactor applies only while inside throughWeek',
  now: '2026-09-14',
  fn: () => {
    S.discount = null;
    if (discountFactor() !== 1) return [false, 'null -> ' + discountFactor()];
    S.planStart = rewindAnchorISO(5);
    S.discount = { pct: 10, throughWeek: 9 };
    if (Math.abs(discountFactor() - 0.9) > 1e-9) return [false, 'week 5 -> ' + discountFactor()];
    S.planStart = rewindAnchorISO(10);
    if (discountFactor() !== 1) return [false, 'week 10 -> ' + discountFactor()];
    return [true, ''];
  }
},
{
  name: 'prescWeight applies the discount without touching stored 1RM',
  now: '2026-09-14',
  fn: () => {
    S.oneRM = { squat: '140' };
    S.discount = null; S.planStart = rewindAnchorISO(5);
    const full = prescWeight('Back squat 4×6 @ 70%');
    if (full !== 97.5) return [false, 'undiscounted ' + full]; // 140*0.70=98 -> 97.5
    S.discount = { pct: 10, throughWeek: 9 };
    const cut = prescWeight('Back squat 4×6 @ 70%');
    if (cut !== 87.5) return [false, 'discounted ' + cut];     // 98*0.9=88.2 -> 87.5
    if (S.oneRM.squat !== '140') return [false, 'stored 1RM mutated'];
    return [true, ''];
  }
},
{
  name: 'prescWeight returns empty when no 1RM is set, discount or not',
  now: '2026-09-14',
  fn: () => {
    S.oneRM = {}; S.discount = { pct: 10, throughWeek: 13 };
    if (prescWeight('Back squat 4×6 @ 70%') !== '') return [false, 'expected empty'];
    return [true, ''];
  }
},
{
  name: 'e1rmStale flips above 28 days off',
  now: '2026-09-14',
  state: { lastActive: '2026-08-20' },   // 25 days
  fn: () => e1rmStale() ? [false, '25 days should not be stale'] : [true, '']
},
{
  name: 'e1rmStale true after a long break',
  now: '2026-09-14',
  state: { lastActive: '2026-07-20' },   // 56 days
  fn: () => e1rmStale() ? [true, ''] : [false, '56 days should be stale']
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd tests && node run.js`
Expected: five FAILs, `discountFactor is not defined`.

- [ ] **Step 3: Implement the helpers**

Insert directly above `function prescWeight(item){...}` (line ~970):

```js
function discountFactor(){ const d=S.discount; if(!d||!d.pct) return 1; return currentWeek()<=d.throughWeek?1-d.pct/100:1; }
function e1rmStale(){ return breakDays()>28; }
```

- [ ] **Step 4: Apply it in `prescWeight`**

Replace the single line at ~970 exactly:

```js
function prescWeight(item){ const L=detectLift(item); const m=item.match(/@\s*(\d+(?:\.\d+)?)/); if(L&&m&&S.oneRM[L.k]&&parseFloat(S.oneRM[L.k])>0) return round2_5(parseFloat(S.oneRM[L.k])*parseFloat(m[1])/100*discountFactor()); return ''; }
```

Only `*discountFactor()` is added. Do not touch the percentage reference table in the Lifts tab or `exerciseE1RM`/`recordE1RM` — those read real lifted numbers and must stay undiscounted.

- [ ] **Step 5: Run tests**

Run: `cd tests && node run.js`
Expected: `32 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/cases.js
git commit -m "feat: comeback discount on prescribed loads, stale e1RM flag

The haircut is presentation-layer only -- stored 1RMs are never modified, so
real numbers survive its expiry at throughWeek. Not applied to the Lifts
percentage table or to e1RM derivation, which read sets actually lifted."
```

---

### Task 8: "Last time" comparison line

One muted line under the target on any exercise whose week has an archived attempt.

**Files:**
- Modify: `index.html` — insert a helper near `archiveRange`; modify the `tgtLine` construction (line ~1313)
- Modify: `tests/cases.js`

**Interfaces:**
- Consumes: `S.history`, `weekOfKey` (Task 5), `escapeHtml`.
- Produces: `lastAttemptLine(key) -> string` — HTML fragment, or `''` when there is no archived attempt for that key.

- [ ] **Step 1: Write the failing tests**

Append to `tests/cases.js`:

```js
{
  name: 'lastAttemptLine formats the best archived set',
  now: '2026-09-14',
  state: { history: [ { weeks: [5,9], block: 2, attempt: 1, archivedOn: '2026-08-01',
    log: { w5s0x0: { sets: [{ w: '100', reps: '6', rpe: '8' }, { w: '95', reps: '6', rpe: '7' }] } },
    done: {}, notes: {}, result: {}, bestE1RM: {} } ] },
  fn: () => {
    const h = lastAttemptLine('w5s0x0');
    if (!h) return [false, 'empty'];
    if (h.indexOf('100') < 0 || h.indexOf('6') < 0 || h.indexOf('8') < 0)
      return [false, 'missing values: ' + h];
    if (h.indexOf('Last time') < 0) return [false, 'missing label: ' + h];
    return [true, ''];
  }
},
{
  name: 'lastAttemptLine is empty with no archive, and for keys outside it',
  now: '2026-09-14',
  state: { history: [ { weeks: [5,9], block: 2, attempt: 1, archivedOn: '2026-08-01',
    log: { w5s0x0: { sets: [{ w: '100', reps: '6' }] } }, done: {}, notes: {}, result: {}, bestE1RM: {} } ] },
  fn: () => {
    if (lastAttemptLine('w9s2x1') !== '') return [false, 'unarchived key returned a line'];
    S.history = [];
    if (lastAttemptLine('w5s0x0') !== '') return [false, 'empty history returned a line'];
    return [true, ''];
  }
},
{
  name: 'lastAttemptLine reads the most recent archive when a block was redone twice',
  now: '2026-09-14',
  state: { history: [
    { weeks: [5,9], block: 2, attempt: 1, archivedOn: '2026-06-01',
      log: { w5s0x0: { sets: [{ w: '90', reps: '6' }] } }, done: {}, notes: {}, result: {}, bestE1RM: {} },
    { weeks: [5,9], block: 2, attempt: 2, archivedOn: '2026-08-01',
      log: { w5s0x0: { sets: [{ w: '105', reps: '6' }] } }, done: {}, notes: {}, result: {}, bestE1RM: {} } ] },
  fn: () => {
    const h = lastAttemptLine('w5s0x0');
    if (h.indexOf('105') < 0) return [false, 'did not use the latest attempt: ' + h];
    return [true, ''];
  }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd tests && node run.js`
Expected: three FAILs, `lastAttemptLine is not defined`.

- [ ] **Step 3: Implement the helper**

Insert after `clearRange` (Task 5):

```js
function lastAttemptLine(key){ const h=(S.history||[]).filter(x=>x.log&&x.log[key]); if(!h.length) return '';
  const sets=h[h.length-1].log[key].sets||[]; let best=null,bv=-1;
  sets.forEach(s=>{ const w=parseFloat(s.w)||0, r=parseFloat(s.reps)||0; const v=w>0?w*(1+r/30):r; if(v>bv){bv=v;best=s;} });
  if(!best) return '';
  const bits=[]; if(best.w) bits.push(best.w+'kg'); if(best.reps) bits.push('× '+best.reps); if(best.rpe) bits.push('@ RPE '+best.rpe);
  if(!bits.length) return '';
  return '<div class="lasttime">Last time: '+escapeHtml(bits.join(' '))+'</div>'; }
```

- [ ] **Step 4: Render it under the target line**

At line ~1313, append the helper's output to `tgtLine`:

```js
  const tgtLine='<div class="setrow-target">Target: '+measTxt+(dom.type==='wr'&&pw!==''?' @ ~'+fmtKg(pw)+' kg':'')+' · <span class="rpe-tgt">RPE '+rpeT+'</span></div>'+lastAttemptLine(key);
```

- [ ] **Step 5: Add the style**

Append to the Task 7 progressive-disclosure block at the end of the stylesheet, just before `</style>`:

```css
.lasttime{font-size:11.5px;color:var(--muted);opacity:.85;margin:-2px 0 6px}
```

- [ ] **Step 6: Run tests**

Run: `cd tests && node run.js`
Expected: `35 passed, 0 failed`.

- [ ] **Step 7: Commit**

```bash
git add index.html tests/cases.js
git commit -m "feat: show the previous attempt's best set under the target

One muted line, read from the most recent archive entry holding that key. The
comparison you want mid-session; a full attempt browser stays deferred."
```

---

### Task 9: The rewind sheet

The only UI task. Entry point is the timeline card `renderPause()` already owns.

**Files:**
- Modify: `index.html` — `renderPause()` (line ~1374 region), new sheet markup near `#swapModal` (line ~620), new render/confirm functions, stylesheet
- Modify: `tests/cases.js`

**Interfaces:**
- Consumes: everything from Tasks 2-7.
- Produces:
  - `openRewind()` / `closeRewind()` — sheet open/close via `sheetIn`/`sheetOut`
  - `renderRewindSheet()` — rebuilds sheet body from current inputs
  - `confirmRewind()` — reads inputs, calls `doRewind`, closes, re-renders, toasts
  - `rewindOptions() -> [{targetWeek, blockN, single, label, sub, recommended}]`

- [ ] **Step 1: Write the failing tests**

Append to `tests/cases.js`:

```js
{
  name: 'rewindOptions: 12 days off recommends nothing',
  now: '2026-09-14',
  state: { lastActive: '2026-09-02' },
  fn: () => {
    const o = rewindOptions();
    if (o.some(x => x.recommended)) return [false, 'recommended something at 12 days'];
    return [true, ''];
  }
},
{
  name: 'rewindOptions: 40 days off recommends the current block',
  now: '2026-09-14',
  state: { lastActive: '2026-08-05' },
  fn: () => {
    const rec = rewindOptions().filter(x => x.recommended);
    if (rec.length !== 1) return [false, rec.length + ' recommended'];
    if (rec[0].single) return [false, 'recommended a single week, expected a block'];
    if (rec[0].targetWeek !== blockRange(blockOfWeek(currentWeek()))[0])
      return [false, 'target ' + rec[0].targetWeek];
    return [true, ''];
  }
},
{
  name: 'rewindOptions: 20 days off recommends repeating the current week',
  now: '2026-09-14',
  state: { lastActive: '2026-08-25' },
  fn: () => {
    const rec = rewindOptions().filter(x => x.recommended);
    if (rec.length !== 1 || !rec[0].single) return [false, JSON.stringify(rec)];
    if (rec[0].targetWeek !== currentWeek()) return [false, 'target ' + rec[0].targetWeek];
    return [true, ''];
  }
},
{
  name: 'rewindOptions never offers a week ahead of the current one',
  now: '2026-09-14',
  state: { lastActive: '2026-06-01' },
  fn: () => {
    const cw = currentWeek();
    const bad = rewindOptions().filter(o => o.targetWeek > cw);
    if (bad.length) return [false, 'offered ' + JSON.stringify(bad.map(b => b.targetWeek)) + ' ahead of ' + cw];
    return [true, ''];
  }
},
{
  name: 'the sheet opens from the dashboard and lists options',
  now: '2026-09-14',
  state: { lastActive: '2026-08-05' },
  fn: () => {
    openRewind();
    const m = document.getElementById('rewindModal');
    if (!m || !m.classList.contains('open')) return [false, 'sheet did not open'];
    if (!document.querySelectorAll('#rw-options .rw-opt').length) return [false, 'no options rendered'];
    if (!document.getElementById('rw-race')) return [false, 'no race date input'];
    if (!document.getElementById('rw-fit')) return [false, 'no fit verdict'];
    return [true, ''];
  }
},
{
  name: 'confirming the sheet performs the rewind end to end',
  now: '2026-09-14',
  // 40 days off -> the recommended option is the current block (week 12 sits in Block 3, weeks 10-13)
  state: { lastActive: '2026-08-05', done: { w9s0: true, w10s0: true, w11s0: true } },
  fn: () => {
    openRewind();
    const opt = document.querySelector('#rw-options .rw-opt.on');
    if (!opt) return [false, 'no option preselected'];
    if (opt.dataset.single !== '0') return [false, 'recommended option was a single week'];
    document.getElementById('rw-race').value = '2026-12-19';
    confirmRewind();
    if (!S.history.length) return [false, 'nothing archived'];
    if (S.raceDate !== '2026-12-19') return [false, 'raceDate ' + S.raceDate];
    if (S.done.w10s0 || S.done.w11s0) return [false, 'in-range done not cleared'];
    if (!S.done.w9s0) return [false, 'week 9 is outside Block 3 and must survive'];
    if (currentWeek() !== 10) return [false, 'currentWeek ' + currentWeek()];
    return [true, ''];
  }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd tests && node run.js`
Expected: six FAILs, `rewindOptions is not defined`.

- [ ] **Step 3: Add the sheet markup**

Insert immediately after the closing `</div>` of `#swapModal` (around line 630), matching the existing modal pattern exactly:

```html
<div class="modal" id="rewindModal" onclick="if(event.target===this)closeRewind()">
  <div class="modalbox">
    <div class="sheet-grab"></div>
    <h3>Restart from an earlier week</h3>
    <div id="rw-advice" class="muted" style="font-size:12.5px;margin-bottom:10px"></div>
    <div id="rw-options"></div>
    <label class="rlab" style="display:block;margin-top:14px">Race date</label>
    <input type="date" id="rw-race" style="width:100%;margin-top:4px" onchange="renderRewindFit()">
    <div id="rw-fit" style="font-size:12.5px;margin-top:8px"></div>
    <label class="rlab" style="display:block;margin-top:14px">Comeback discount on prescribed loads</label>
    <div class="row" style="margin-top:4px"><input type="number" id="rw-disc" min="0" max="30" step="5" style="width:90px"><span class="muted" style="font-size:12.5px">% off your stored 1RMs, until the block ends</span></div>
    <label class="rlab" style="display:block;margin-top:14px">Why (optional)</label>
    <input type="text" id="rw-reason" placeholder="e.g. illness — 3 weeks off" style="width:100%;margin-top:4px">
    <div class="modal-actions"><button class="btn" onclick="confirmRewind()">Restart</button><button class="btn ghost" onclick="closeRewind()">Cancel</button></div>
  </div>
</div>
```

- [ ] **Step 4: Add the styles**

Append before `</style>`:

```css
.rw-opt{display:block;width:100%;text-align:left;background:var(--card2);border:1px solid var(--line);border-radius:var(--radius-sm);padding:11px 13px;margin-bottom:8px;cursor:pointer;color:var(--text)}
.rw-opt.on{border-color:var(--accent);background:var(--accent-tint)}
.rw-opt .rw-t{font-family:var(--font-display);font-weight:800;text-transform:uppercase;letter-spacing:.03em;font-size:14px}
.rw-opt .rw-s{color:var(--muted);font-size:12px;margin-top:2px}
.rw-opt .rw-rec{color:var(--accent);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-left:6px}
.rw-fit-ok{color:var(--green)} .rw-fit-no{color:var(--accent2)}
```

- [ ] **Step 5: Implement the logic**

Insert after `resetPause()` (line ~1388):

```js
let rewindPick=null;
function rewindOptions(){ const cw=currentWeek()||1, days=breakDays(), tier=breakAdvice(days).tier, out=[];
  out.push({targetWeek:cw, blockN:null, single:true, label:'Repeat Week '+cw, sub:'Redo this week only', recommended:tier==='week'});
  BLOCKS.forEach(b=>{ const first=b.weeks[0]; if(first>cw) return;
    const sess=WEEKS.filter(w=>w.w>=first&&w.w<=b.weeks[1]).reduce((n,w)=>n+w.sess.length,0);
    const doneN=Object.keys(S.done||{}).filter(k=>{const w=weekOfKey(k); return w!==null&&w>=first&&w<=b.weeks[1];}).length;
    const isCur=blockOfWeek(cw)===b.n;
    out.push({targetWeek:first, blockN:b.n, single:false, label:'Restart Block '+b.n+' — '+b.name,
      sub:'Week '+first+' onward · '+doneN+' of '+sess+' sessions logged',
      recommended:(tier==='block'&&isCur)||(tier==='plan'&&b.n===1)}); });
  return out.filter(o=>o.targetWeek<=cw); }
function openRewind(){ rewindPick=null; const m=document.getElementById('rewindModal');
  const r=effRace(); document.getElementById('rw-race').value=r.getFullYear()+'-'+String(r.getMonth()+1).padStart(2,'0')+'-'+String(r.getDate()).padStart(2,'0');
  document.getElementById('rw-disc').value=breakAdvice(breakDays()).discountPct;
  document.getElementById('rw-reason').value='';
  renderRewindSheet(); sheetIn(m); }
function closeRewind(){ sheetOut(document.getElementById('rewindModal')); }
function renderRewindSheet(){ const days=breakDays(), tier=breakAdvice(days).tier, opts=rewindOptions();
  const adv=document.getElementById('rw-advice');
  adv.innerHTML = days===0 ? 'No training history yet — pick any starting point.'
    : tier==='none' ? '<b>'+days+' days off won\'t have cost you.</b> Picking up where you left off is the better call. Restart anyway if you want to.'
    : days+' days since your last logged session. '+(tier==='week'?'Repeating this week is usually enough.':tier==='block'?'Restarting the current block is the sensible reset.':'After this long, starting again from Block 1 is the honest option.');
  if(rewindPick===null){ const r=opts.findIndex(o=>o.recommended); rewindPick=r>=0?r:0; }
  document.getElementById('rw-options').innerHTML=opts.map((o,i)=>
    '<button class="rw-opt'+(i===rewindPick?' on':'')+'" data-i="'+i+'" data-single="'+(o.single?1:0)+'" onclick="pickRewind('+i+')">'+
    '<div class="rw-t">'+escapeHtml(o.label)+(o.recommended?'<span class="rw-rec">Recommended</span>':'')+'</div>'+
    '<div class="rw-s">'+escapeHtml(o.sub)+'</div></button>').join('');
  renderRewindFit(); }
function pickRewind(i){ rewindPick=i; renderRewindSheet(); }
function renderRewindFit(){ const o=rewindOptions()[rewindPick]; const el=document.getElementById('rw-fit'); if(!o||!el) return;
  const race=document.getElementById('rw-race').value; if(!race){ el.innerHTML=''; return; }
  if(daysBetween(todayISO(),race)<=0){ el.innerHTML='<span class="rw-fit-no">Pick a race date in the future.</span>'; return; }
  const need=weeksNeeded(o.targetWeek), have=weeksAvailable(race);
  if(have>=need){ el.innerHTML='<span class="rw-fit-ok">Fits — '+need+' week'+(need===1?'':'s')+' of plan, '+have+' available.</span>'; return; }
  const e=earliestFittingWeek(race), fix=raceISOForWeek(o.targetWeek);
  el.innerHTML='<span class="rw-fit-no">Needs '+need+' weeks, you have '+have+'.</span><br>→ Move race day to <b>'+fmtDate(parseISO(fix))+'</b> to fit, or<br>→ Rewind to <b>Week '+e+'</b> instead — the furthest back that still fits.'; }
function confirmRewind(){ const o=rewindOptions()[rewindPick]; if(!o) return;
  const race=document.getElementById('rw-race').value;
  if(!race||daysBetween(todayISO(),race)<=0){ toast('Pick a race date in the future','err'); return; }
  doRewind({targetWeek:o.targetWeek, raceISO:race, discountPct:+document.getElementById('rw-disc').value||0,
    reason:document.getElementById('rw-reason').value.trim(), blockN:o.blockN, single:o.single});
  closeRewind(); renderAll(); toast(o.single?'Repeating Week '+o.targetWeek:'Block '+o.blockN+' restarted'); }
```

- [ ] **Step 6: Add the entry point to the timeline card**

In `renderPause()`, append the restart link to the `else` branch (the idle state), so it reads:

```js
    el.innerHTML='<div class="pausenote"><button class="lnk" onclick="pauseProgram()">⏸ Pause program</button> — freezes the plan and countdown while you travel or take time off. <button class="lnk" onclick="openRewind()">↺ Restart from an earlier week</button></div>';
```

Add the same `openRewind()` link to the `p.active` and `(p.days||0)>0` branches, appended inside their existing `.pausenote` / `.pauseban` markup.

- [ ] **Step 7: Run tests**

Run: `cd tests && node run.js`
Expected: `41 passed, 0 failed`.

- [ ] **Step 8: Visual check**

```bash
cd tests && node -e "
const {chromium}=require('playwright-core'); const path=require('path');
const EXE=process.env.CHROMIUM||path.join(process.env.HOME,'Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64','Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const http=require('http'),fs=require('fs');
const srv=http.createServer((q,s)=>{const f=path.join(__dirname,'..',q.url.split('?')[0]);fs.readFile(f,(e,b)=>{if(e){s.writeHead(404);s.end();return;}s.writeHead(200);s.end(b);});});
srv.listen(8792,async()=>{const b=await chromium.launch({executablePath:EXE});
const c=await b.newContext({viewport:{width:390,height:844}});
await c.addInitScript(\"localStorage.setItem('hyrox_dash_raha_v1',JSON.stringify({lastActive:'2026-08-05'}))\");
const p=await c.newPage(); await p.goto('http://localhost:8792/index.html',{waitUntil:'networkidle'});
await p.evaluate(()=>openRewind()); await p.waitForTimeout(600);
await p.screenshot({path:'/tmp/rewind-sheet.png'}); await b.close(); srv.close(); console.log('/tmp/rewind-sheet.png');});
"
```

Open the screenshot. Confirm: the sheet reads as a bottom sheet matching the swap/demo sheets, the recommended option is highlighted, the fit verdict is legible, and nothing overflows horizontally.

- [ ] **Step 9: Commit**

```bash
git add index.html tests/cases.js
git commit -m "feat: rewind sheet on the dashboard timeline card

Guides rather than forbids: under 15 days the advice line says the break
won't have cost you and no option is marked recommended, but every option
stays selectable. Above that the recommended row is pre-selected per the
break-length tiers.

The fit check offers the two real choices -- move race day, or rewind less
far -- and never mutates the plan."
```

---

### Task 10: Ship it

**Files:**
- Modify: `sw.js`, `CLAUDE.md`, `00_STATUS.md`
- Rebuild: `../Hybrid-Training-App-update.zip`

- [ ] **Step 1: Full suite green**

Run: `cd tests && node run.js`
Expected: `41 passed, 0 failed`.

- [ ] **Step 2: Structural checks**

```bash
node -e "
const fs=require('fs'),vm=require('vm'); const s=fs.readFileSync('index.html','utf8');
let m,re=/<script>([\s\S]*?)<\/script>/g,i=0,bad=0;
while((m=re.exec(s))){i++; try{new vm.Script(m[1]);}catch(e){console.log('script #'+i+' PARSE ERROR: '+e.message);bad++;}}
const o=(s.match(/<div\b/g)||[]).length,c=(s.match(/<\/div>/g)||[]).length;
console.log('scripts parsed: '+(i-bad)+'/'+i+'   divs: '+o+'/'+c+(o===c?' balanced':' MISMATCH'));
process.exit(bad||o!==c?1:0);"
```
Expected: `scripts parsed: 2/2` and `balanced`. The div total rises by the eight the rewind sheet adds; the check is that open and close match, not a fixed number.

- [ ] **Step 3: Bump the service worker**

In `sw.js`, change `const CACHE = 'hyrox-prep-v17';` to `'hyrox-prep-v18';`

- [ ] **Step 4: Rebuild the sideload zip**

```bash
rm -f ../Hybrid-Training-App-update.zip
zip -qX ../Hybrid-Training-App-update.zip index.html sw.js manifest.webmanifest \
  icon-192.png icon-512.png icon-512-maskable.png apple-touch-icon.png \
  favicon-64.png display.woff2 netlify.toml README.md INSTALL.md
unzip -l ../Hybrid-Training-App-update.zip | tail -3
```
Expected: `12 files`

- [ ] **Step 5: Update the docs**

In `CLAUDE.md`:
- Layout block: `cache version = 'hyrox-prep-v18'`, zip `v18`
- Architecture section: add a bullet describing `S.planStart` / `S.raceDate` / `S.raceAnchored` / `S.history` / `S.discount` / `S.lastActive`, and state that **an anchored pause no longer moves race day**
- Verification notes: replace the ad-hoc recipe with `cd tests && node run.js`
- Current state: v18, what it carries

In `00_STATUS.md`:
- Where things stand → v18
- Recent history → add the v18 entry
- Open items → remove "block restart" if listed; keep the real-device swipe check

- [ ] **Step 6: Commit and push**

```bash
git add -A
git commit -m "feat: block restart -- rewind the plan after a break

Rewind to any earlier week, keep the first attempt as read-only history, and
gate the offer on how long you were actually away. Race day is now fixed by
default: an anchored pause moves nothing and the calendar absorbs the break.

Service worker v17 -> v18.

Spec:  docs/specs/2026-09-14-block-restart.md
Plan:  docs/plans/2026-09-14-block-restart.md
Tests: 41 browser assertions, cd tests && node run.js"
git push origin main
```

- [ ] **Step 7: Confirm the deploy**

```bash
git fetch -q origin && git rev-list --left-right --count main...origin/main
grep -o "hyrox-prep-v[0-9]*" sw.js
```
Expected: `0	0` and `hyrox-prep-v18`

---

## Notes for the executor

- **The app is the test fixture.** Tests load the real `index.html`; there are no mocks. If a test needs particular state, use the `state` field — it is written to `localStorage` before the page loads, exactly as a returning user's data would be.
- **The clock is stubbable per case.** Any test touching dates must set `now`, or it will pass today and fail tomorrow.
- **Do not add a repo-root `package.json`.** Netlify auto-detects one and would start running builds on a site that has no build step.
- **Style.** Dense single-line functions, no semicolon-free lines, `var(--token)` for every colour. Read ten lines either side of any insertion point and match them.
- **If a task's tests pass but you changed something not in that task's Files list, stop** — the plan is wrong and should be corrected before continuing.
