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
  }
];
