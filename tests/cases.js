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
    // planStart set so migrateDates() (guarded on S.planStart) skips — otherwise
    // an active pause with no planStart now migrates on load (F-4) and this test
    // would be checking post-migration dates instead of the anchored formula.
    state: { planStart: '2026-06-29', raceAnchored: true, pause: { active: true, days: 0, since: '2026-08-31' } },
    fn: () => {
      const r = effRace();
      if (r.getMonth() !== 8 || r.getDate() !== 26) return [false, 'race moved to ' + r.toDateString()];
      // anchored pause is informational only — the calendar keeps running, so
      // plan start must NOT slide either (real time simply passes, and
      // currentWeek() advances on its own instead of freezing).
      const s = effStart();
      if (s.getDate() !== 29 || s.getMonth() !== 5) return [false, 'effStart shifted to ' + s.toDateString()];
      return [true, ''];
    }
  },
  {
    name: 'unanchored pause moves race day (legacy Model A)',
    now: '2026-09-14',
    // planStart set so migrateDates() skips (see note above) — this test is
    // about the live pauseShiftDays() formula, not the one-shot migration.
    state: { planStart: '2026-06-29', raceAnchored: false, pause: { active: false, days: 10 } },
    fn: () => {
      const r = effRace();
      if (r.getMonth() !== 9 || r.getDate() !== 6) return [false, 'expected 6 Oct, got ' + r.toDateString()];
      return [true, ''];
    }
  },
  {
    name: 'effStart: unaffected by an anchored pause, shifted by an unanchored one',
    now: '2026-09-14',
    state: { planStart: '2026-06-29', raceAnchored: true, pause: { active: false, days: 10 } },
    fn: () => {
      let s = effStart();
      if (s.getMonth() !== 5 || s.getDate() !== 29) return [false, 'anchored: effStart moved to ' + s.toDateString()];
      S.raceAnchored = false; save();
      s = effStart();
      if (s.getMonth() !== 6 || s.getDate() !== 9) return [false, 'unanchored: expected 9 Jul, got ' + s.toDateString()];
      return [true, ''];
    }
  },
  {
    name: 'renderPause (active, anchored) does not claim the countdown is frozen',
    now: '2026-09-14',
    state: { raceAnchored: true, pause: { active: true, days: 0, since: '2026-08-31' } },
    fn: () => {
      renderPause();
      const txt = document.getElementById('set-pause').textContent;
      if (/frozen/i.test(txt)) return [false, 'still claims the countdown is frozen: ' + txt];
      if (/held/i.test(txt)) return [false, 'still claims the week is held: ' + txt];
      if (!/race day/i.test(txt)) return [false, 'does not mention race day: ' + txt];
      return [true, ''];
    }
  },
  {
    name: 'resumeProgram toast omits "race now" when anchored, keeps it when not',
    now: '2026-09-14',
    state: { raceAnchored: true, planStart: '2026-06-29', pause: { active: true, days: 0, since: '2026-08-31' } },
    fn: () => {
      resumeProgram();
      let t = document.querySelector('#toastWrap .toast:last-child').textContent;
      if (/race now/i.test(t)) return [false, 'anchored toast still says race now: ' + t];
      if (!/\+\d+ day/.test(t)) return [false, 'anchored toast lost the +N days: ' + t];
      S.raceAnchored = false; S.pause = { active: true, days: 0, since: '2026-08-31' }; save();
      resumeProgram();
      t = document.querySelector('#toastWrap .toast:last-child').textContent;
      if (!/race now/i.test(t)) return [false, 'unanchored toast dropped race now: ' + t];
      return [true, ''];
    }
  },
  {
    name: 'pauseProgram toast does not claim frozen when anchored, does when not',
    now: '2026-09-14',
    state: { raceAnchored: true, pause: { active: false, days: 0 } },
    fn: () => {
      pauseProgram();
      let t = document.querySelector('#toastWrap .toast:last-child').textContent;
      if (/frozen|freezes/i.test(t)) return [false, 'anchored toast still claims frozen: ' + t];
      S.raceAnchored = false; S.pause = { active: false, days: 0 }; save();
      pauseProgram();
      t = document.querySelector('#toastWrap .toast:last-child').textContent;
      if (!/frozen|freezes/i.test(t)) return [false, 'unanchored toast dropped frozen wording: ' + t];
      return [true, ''];
    }
  },
  {
    name: 'renderPause idle line does not promise freezing when anchored, does when not',
    now: '2026-09-14',
    state: { raceAnchored: true, pause: { active: false, days: 0 } },
    fn: () => {
      renderPause();
      let t = document.getElementById('set-pause').textContent;
      if (/frozen|freezes/i.test(t)) return [false, 'anchored idle line still claims freezing: ' + t];
      S.raceAnchored = false; save();
      renderPause();
      t = document.getElementById('set-pause').textContent;
      if (!/frozen|freezes/i.test(t)) return [false, 'unanchored idle line dropped freezing wording: ' + t];
      return [true, ''];
    }
  },
  {
    name: 'how-to starts collapsed and toggles open',
    now: '2026-09-16',
    fn: () => {
      // the Plan tab must be active, or offsetHeight is 0 for reasons unrelated to the disclosure
      document.querySelector('[data-tab="plan"]').click();
      const b = document.getElementById('howto-b'), t = document.getElementById('howto-t');
      if (!b || !t) return [false, 'disclosure missing'];
      if (document.getElementById('tab-plan').offsetHeight === 0) return [false, 'plan tab not visible; test is meaningless'];
      if (b.offsetHeight > 0) return [false, 'how-to is expanded on load'];
      if (t.getAttribute('aria-expanded') !== 'false') return [false, 'aria-expanded wrong when closed'];
      t.click();
      if (document.getElementById('howto-b').offsetHeight === 0) return [false, 'did not expand'];
      if (t.getAttribute('aria-expanded') !== 'true') return [false, 'aria-expanded wrong when open'];
      t.click();
      if (document.getElementById('howto-b').offsetHeight > 0) return [false, 'did not collapse again'];
      return [true, ''];
    }
  },
  {
    name: 'block nav is one segmented control with the active block named',
    now: '2026-09-16',
    fn: () => {
      document.querySelector('[data-tab="plan"]').click();
      const segs = document.querySelectorAll('#block-nav .segbar .seg');
      if (segs.length !== 3) return [false, 'expected 3 segments, got ' + segs.length];
      const on = document.querySelectorAll('#block-nav .seg.on');
      if (on.length !== 1) return [false, 'expected exactly one active segment, got ' + on.length];
      const name = document.querySelector('#block-nav .seg-name');
      if (!name || !name.textContent.trim()) return [false, 'active block name missing'];
      segs[0].click();
      if (!document.querySelectorAll('#block-nav .seg')[0].classList.contains('on'))
        return [false, 'clicking a segment did not select it'];
      if (document.querySelector('#block-nav .seg-name').textContent.indexOf('Base') < 0)
        return [false, 'name did not follow the selection'];
      return [true, ''];
    }
  },
  {
    name: 'restart-this-block targets the block on screen without a week choice',
    now: '2026-09-16',
    state: { lastActive: '2026-08-05' },
    fn: () => {
      document.querySelector('[data-tab="plan"]').click();
      const btn = document.querySelector('.wv-restart');
      if (!btn) return [false, 'no restart action in the week view'];
      const shownBlock = +btn.getAttribute('onclick').match(/restartThisBlock\((\d+)\)/)[1];
      btn.click();
      if (!document.getElementById('rewindModal').classList.contains('open'))
        return [false, 'restart did not open the sheet'];
      const on = document.querySelector('#rw-options .rw-opt.on');
      if (!on) return [false, 'sheet opened with nothing targeted'];
      if (on.textContent.indexOf('Block ' + shownBlock) < 0)
        return [false, 'targeted the wrong block: ' + on.textContent];
      return [true, ''];
    }
  },
  {
    name: 'dashboard shows pause status only, never the controls',
    now: '2026-09-16',
    // planStart seeded so migrateDates() skips -- an unmigrated active pause is consumed at load (F-4)
    state: { raceAnchored: true, planStart: '2026-06-29', pause: { active: true, days: 0, since: '2026-09-01' } },
    fn: () => {
      renderPause();
      const d = document.getElementById('d-pause');
      if (!/paused/i.test(d.textContent)) return [false, 'no status shown while paused: ' + d.textContent];
      if (d.querySelector('[onclick*="pauseProgram"],[onclick*="resumeProgram"],[onclick*="resetPause"]'))
        return [false, 'dashboard still carries pause controls'];
      S.pause = { active: false, days: 0 }; renderPause();
      if (document.getElementById('d-pause').innerHTML.trim() !== '')
        return [false, 'dashboard shows something when not paused: ' + document.getElementById('d-pause').innerHTML];
      return [true, ''];
    }
  },
  {
    name: 'settings sheet opens and holds the programme controls',
    now: '2026-09-16',
    fn: () => {
      openSettings();
      const m = document.getElementById('settingsModal');
      if (!m || !m.classList.contains('open')) return [false, 'settings sheet did not open'];
      if (!document.getElementById('set-race').value) return [false, 'race date not prefilled'];
      const t = document.getElementById('set-pause').textContent;
      if (!/pause/i.test(t)) return [false, 'no pause control in settings: ' + t];
      const html = m.innerHTML;
      for (const need of ['downloadICS', 'exportData', 'importfile', 'openRewind'])
        if (html.indexOf(need) < 0) return [false, 'settings is missing ' + need];
      return [true, ''];
    }
  },
  {
    name: 'saveRaceDate rejects a past date and accepts a future one',
    now: '2026-09-16',
    fn: () => {
      openSettings();
      document.getElementById('set-race').value = '2026-01-01';
      saveRaceDate();
      if (S.raceDate === '2026-01-01') return [false, 'accepted a past race date'];
      document.getElementById('set-race').value = '2026-11-07';
      saveRaceDate();
      if (S.raceDate !== '2026-11-07') return [false, 'rejected a valid future date: ' + S.raceDate];
      return [true, ''];
    }
  },
  {
    name: 'migration: accumulated pause.days folds into planStart only, race day stays real (F-4)',
    now: '2026-09-14',
    state: { pause: { active: false, days: 10 } },
    fn: () => {
      // migrateDates ran at load. F-4 deliberately deviates from a literal reading
      // of the spec: it bakes the shift into planStart (so the athlete stays on
      // the week she was on) but must NOT touch raceDate — race day is a fixed
      // real event, and shifting it would leave the countdown silently wrong.
      if (S.pause.days !== 0) return [false, 'pause.days not cleared: ' + S.pause.days];
      if (S.planStart !== '2026-07-09') return [false, 'planStart ' + S.planStart];
      if (S.raceDate !== null) return [false, 'raceDate should stay null, got ' + S.raceDate];
      const s = effStart(), r = effRace();
      if (s.getMonth() !== 6 || s.getDate() !== 9) return [false, 'effStart ' + s.toDateString()];
      if (r.getMonth() !== 8 || r.getDate() !== 26) return [false, 'effRace should be the real race day, got ' + r.toDateString()];
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
    name: 'prescWeight returns empty when no 1RM is set',
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
  },
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
  },
  {
    name: 'stale 1RM marker shows only when a prescribed weight is displayed',
    now: '2026-09-15',
    state: { lastActive: '2026-06-01', oneRM: { squat: '140' } },
    fn: () => {
      if (!e1rmStale()) return [false, 'precondition: should be stale after ~3 months'];
      if (staleMark().indexOf('stale 1RM') < 0) return [false, 'marker missing when stale'];
      S.lastActive = todayISO();
      if (staleMark() !== '') return [false, 'marker shown when not stale: ' + staleMark()];
      return [true, ''];
    }
  },
  {
    name: 'earliestFittingWeek clamps to 1 when the race is far away',
    now: '2026-09-15',
    fn: () => {
      const e = earliestFittingWeek('2027-09-15');
      if (e !== 1) return [false, 'got ' + e + ', expected 1'];
      return [true, ''];
    }
  },
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
  },
  {
    name: 'short break hides the options behind a disclosure and preselects nothing',
    now: '2026-09-15',
    state: { lastActive: '2026-09-03' },
    fn: () => {
      openRewind();
      const wrap = document.getElementById('rw-options');
      if (!wrap) return [false, 'options container missing'];
      if (wrap.offsetHeight > 0) return [false, 'options visible before disclosure at 12 days off'];
      if (document.querySelector('#rw-options .rw-opt.on')) return [false, 'an option was preselected at 12 days off'];
      const btn = [...document.querySelectorAll('button')].find(b => /restart anyway/i.test(b.textContent));
      if (!btn) return [false, 'no "Restart anyway" disclosure'];
      btn.click();
      if (document.getElementById('rw-options').offsetHeight === 0) return [false, 'options still hidden after disclosure'];
      return [true, ''];
    }
  },
  {
    name: 'long break shows options immediately with the recommendation preselected',
    now: '2026-09-15',
    state: { lastActive: '2026-08-05' },
    fn: () => {
      openRewind();
      if (document.getElementById('rw-options').offsetHeight === 0) return [false, 'options hidden at 41 days off'];
      const on = document.querySelector('#rw-options .rw-opt.on');
      if (!on) return [false, 'nothing preselected at 41 days off'];
      if (!/recommended/i.test(on.textContent)) return [false, 'preselected option is not the recommended one'];
      return [true, ''];
    }
  },
  {
    name: 'collapsed state shows no fit verdict, even after a prior selection',
    now: '2026-09-15',
    state: { lastActive: '2026-08-05' },
    fn: () => {
      openRewind();                                  // 41 days: auto-selects, renders a verdict
      if (!document.getElementById('rw-fit').innerHTML) return [false, 'precondition: expected a verdict at 41 days'];
      closeRewind();
      S.lastActive = '2026-09-03';                   // now 12 days off -> collapsed tier
      openRewind();
      const fit = document.getElementById('rw-fit').innerHTML;
      if (fit) return [false, 'stale verdict survived into the collapsed state: ' + fit];
      return [true, ''];
    }
  },
  {
    name: 'F-1: pausing does not launder a long break down to 0 days off',
    now: '2026-09-14',
    state: { lastActive: '2026-07-16' },   // 60 days off
    fn: () => {
      pauseProgram();
      const d = breakDays();
      if (d < 55) return [false, 'breakDays dropped to ' + d + ' after tapping pause'];
      if (breakAdvice(d).tier !== 'plan') return [false, 'tier ' + breakAdvice(d).tier + ', expected plan'];
      return [true, ''];
    }
  },
  {
    name: 'F-2: stale 1RM marker survives a doRewind for the length of the comeback block',
    now: '2026-09-14',
    state: { lastActive: '2026-06-16' },   // 90 days off, well past the 28-day threshold
    fn: () => {
      if (!e1rmStale()) return [false, 'precondition: should be stale before the rewind'];
      const rec = doRewind({ targetWeek: 5, raceISO: '2026-12-05', discountPct: 10, reason: 'illness' });
      // doRewind stamps S.lastActive = today, so breakDays() alone would now read 0 -
      // e1rmStale() must still hold via S.discount.stale for the rest of this block.
      if (!e1rmStale()) return [false, 'e1rmStale flipped off immediately after the rewind'];
      if (!staleMark()) return [false, 'staleMark() empty right after the rewind'];
      S.planStart = rewindAnchorISO(rec.weeks[1] + 1);  // now one week past the comeback block
      if (e1rmStale()) return [false, 'stale marker should end once the comeback block is over'];
      return [true, ''];
    }
  },
  {
    name: 'F-4: migration bakes a currently-active pause into planStart, never raceDate',
    now: '2026-09-14',
    state: { pause: { active: true, since: '2026-09-04' } },   // 10 days elapsed, no planStart yet
    fn: () => {
      if (!S.planStart) return [false, 'planStart not set by migration'];
      if (S.raceDate !== null) return [false, 'raceDate should stay null, got ' + S.raceDate];
      const r = effRace();
      if (r.getFullYear() !== 2026 || r.getMonth() !== 8 || r.getDate() !== 26)
        return [false, 'effRace is not the true race date: ' + r.toDateString()];
      if (S.pause.days !== 0) return [false, 'pause.days not zeroed: ' + S.pause.days];
      if (S.pause.active) return [false, 'pause still marked active after migration'];
      return [true, ''];
    }
  },
  {
    name: 'F-3: a tampered comeback discount input is clamped, not trusted',
    now: '2026-09-14',
    state: { lastActive: '2026-08-05', oneRM: { squat: '140' } },   // 40 days off -> block recommended
    fn: () => {
      openRewind();
      const opt = document.querySelector('#rw-options .rw-opt.on');
      if (!opt) return [false, 'no option preselected'];
      document.getElementById('rw-disc').value = '100';   // way past the advisory max
      document.getElementById('rw-race').value = '2026-12-19';
      confirmRewind();
      if (!S.discount) return [false, 'no discount stored'];
      if (S.discount.pct > 30 || S.discount.pct < 0) return [false, 'discount not clamped: ' + S.discount.pct];
      const f = discountFactor();
      if (!(f >= 0 && f <= 1)) return [false, 'discountFactor out of bounds: ' + f];
      const w = prescWeight('Back squat 4×6 @ 70%');
      if (!(w > 0)) return [false, 'prescWeight not positive: ' + w];
      return [true, ''];
    }
  },
  {
    name: 'F-5: importData re-derives dates from a pre-branch backup',
    now: '2026-09-14',
    fn: () => {
      // A backup exported before this branch: none of the six new date/history
      // fields exist, and pause.days is banked the old (Model A) way.
      const legacy = JSON.stringify({
        done: {}, bench: {}, check: {}, oneRM: {}, log: {}, videos: {}, notes: {},
        e1rmHist: {}, prefs: {}, result: {}, swap: {}, swapGlobal: {}, e1rmNames: {},
        pause: { active: false, days: 10 }
      });
      const file = new File([legacy], 'backup.json', { type: 'application/json' });
      importData({ target: { files: [file] } });
      return new Promise(resolve => {
        const check = () => {
          if (!S.planStart) { setTimeout(check, 20); return; }  // FileReader is async
          const need = ['lastActive', 'planStart', 'raceDate', 'raceAnchored', 'history', 'discount'];
          const missing = need.filter(k => !(k in S));
          if (missing.length) return resolve([false, 'missing fields: ' + missing.join(',')]);
          if (S.planStart !== '2026-07-09') return resolve([false, 'planStart ' + S.planStart]);
          if (S.raceDate !== null) return resolve([false, 'raceDate should stay null, got ' + S.raceDate]);
          resolve([true, '']);
        };
        check();
      });
    }
  }
];
