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
  },
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
  },
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
  },
  {
    name: 'race-date badge shows +Nd only when the race actually moves',
    now: '2026-09-15',
    // planStart set so migrateDates() (guarded on S.planStart) skips and leaves
    // pause.days live — otherwise migration folds the 10 days into raceDate and
    // pauseShiftDays() reads 0 by the time renderDash() runs.
    state: { raceAnchored: false, planStart: '2026-06-29', pause: { active: false, days: 10 } },
    fn: () => {
      renderDash();
      const t = document.getElementById('d-racedate').textContent;
      if (t.indexOf('+10d') < 0) return [false, 'unanchored should show the shift: ' + t];
      S.raceAnchored = true; renderDash();
      const t2 = document.getElementById('d-racedate').textContent;
      if (t2.indexOf('+10d') >= 0) return [false, 'anchored must not claim a shift: ' + t2];
      // Chromium's en-GB month abbreviation for September is 'Sept', not 'Sep' -
      // check day/month/year pieces rather than a hardcoded 'Sep' string.
      if (t2.indexOf('26') < 0 || t2.indexOf('Sep') < 0 || t2.indexOf('2026') < 0 || t2.indexOf('Oct') >= 0)
        return [false, 'anchored race date wrong: ' + t2];
      return [true, ''];
    }
  },
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
  },
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
  },
  {
    name: 'archiveRange freezes a deep copy — later live edits cannot reach it',
    now: '2026-09-15',
    state: { log: { w5s0x0: { sets: [{ w: '100', reps: '5' }] } } },
    fn: () => {
      const rec = archiveRange(5, 9, { block: 2 });
      S.log.w5s0x0.sets[0].w = '999';               // mutate the live object in place
      if (rec.log.w5s0x0.sets[0].w !== '100')
        return [false, 'archive was aliased, saw ' + rec.log.w5s0x0.sets[0].w];
      return [true, ''];
    }
  },
  {
    name: 'weekOfKey rejects anything that is not a plan key',
    now: '2026-09-15',
    fn: () => {
      for (const k of ['w5s0x2x3', 'w5sBOGUS0', 'w5', 'x5s0', '', 'nonsense', 'w5session0'])
        if (weekOfKey(k) !== null) return [false, k + ' -> ' + weekOfKey(k) + ', expected null'];
      for (const [k, w] of [['w5s0', 5], ['w12s3x2', 12], ['w1s0x0', 1]])
        if (weekOfKey(k) !== w) return [false, k + ' -> ' + weekOfKey(k) + ', expected ' + w];
      return [true, ''];
    }
  },
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
  },
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
];
