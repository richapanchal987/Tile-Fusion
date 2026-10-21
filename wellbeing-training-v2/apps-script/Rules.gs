/**
 * The rules of the training (App Rules R4-R24 in the workbook, as amended by the Team Leaders' reply of 21 October 2026).
 * Pure functions: no Google services, so they are unit-tested in Node (tests/rules.test.js).
 *
 *   attempt  = { id, trainee, task, no, status: Draft|Submitted|Rated, released, score, flag, rubric, processConfirmed, ... }
 *   task     = the normalised task from normTask_()
 */

/* ---------------- tasks ---------------- */

function methodOf_(s) {
  s = String(s || '').toLowerCase();
  if (/not pass/.test(s)) return 'none';        // SYS-02: a placement check, no score
  if (/complete/.test(s)) return 'complete';    // Complete / Not complete
  if (/%|percent/.test(s)) return 'percent';    // % correct
  return 'score';                               // 1-4
}

/** "3" -> 3; "80%" -> 80; "90% + questions 1, 2, 3, 6 correct" -> 90 and items [1,2,3,6]. */
function passSpec_(method, passMark, defaultScore) {
  const pm = String(passMark || '');
  if (method === 'percent') {
    const p = /(\d+)\s*%/.exec(pm), q = /questions?\s*([\d,\s]+?)\s*(?:and\s*([\d]+)\s*)?correct/i.exec(pm);
    const items = q ? ((q[1] || '') + ',' + (q[2] || '')).split(',').map(x => parseInt(x, 10)).filter(isFinite) : [];
    return { score: 0, pct: p ? +p[1] : 80, items: items };
  }
  return { score: method === 'score' ? num_(pm, defaultScore) : 0, pct: 0, items: [] };
}

function normTask_(r, s) {
  const method = methodOf_(r.ratingMethod), spec = passSpec_(method, r.passMark, s.passScore), cs = str_(r.contentStatus);
  return {
    id: str_(r.id), active: yes_(r.active), strand: str_(r.strand), area: str_(r.area),
    milestone: num_(String(r.milestone || '').replace(/\D/g, ''), 0), title: str_(r.title), stage: str_(r.stage), ageBand: str_(r.ageBand),
    gate: yes_(r.gate), keySkills: (String(r.keySkill || '').match(/\d+/g) || []).map(Number), obsType: str_(r.obsType),
    dueOverride: blank_(r.dueOverride) ? null : num_(r.dueOverride, null), requiresSupervised: yes_(r.requiresSupervised),
    prereq: idList_(r.prereq), toolkit: (String(r.toolkit || '').match(/Tool\s*\d+/gi) || []).map(x => Number(x.replace(/\D/g, ''))),
    effort: num_(r.effort, 0), method: method, passScore: spec.score, pct: spec.pct, requiredItems: spec.items,
    joint: /coordinator/i.test(r.assessorRole || ''), principalSignoff: /principal/i.test(r.assessorRole || ''),
    maxReworks: blank_(r.maxReworks) ? 2 : num_(r.maxReworks, 2),
    fastTrack: yes_(r.fastTrack), entryArea: str_(r.entryArea), contentStatus: cs, soon: /needs school input/i.test(cs),
    raw: r
  };
}

/* ---------------- one attempt ---------------- */

/** Does the Team Leader's rating meet the pass mark (R12), ignoring release and joint confirmation? A Safety Flag always fails it (R13). */
function ratingMeets_(t, a) {
  if (a.status !== 'Rated' || a.flag) return false;
  if (t.method === 'score') return num_(a.score, 0) >= t.passScore;
  if (t.method === 'complete') return /^complete$/i.test(String(a.score).trim());
  if (t.method === 'percent') {
    return num_(a.score, -1) >= t.pct && t.requiredItems.every(q => a.rubric && a.rubric['q' + q] === true);
  }
  return false;
}
/** Passed attempt: rating meets the mark and, on joint tasks, the Coordinator confirmed (R16). */
function attemptPasses_(t, a) {
  if (!ratingMeets_(t, a)) return false;
  return t.joint ? a.processConfirmed === 'Yes' : true;
}
/** Still waiting on someone: a rating, its release (R15), or the Coordinator's confirmation (R16). */
function attemptPending_(t, a) {
  if (a.status === 'Submitted') return true;
  if (a.status !== 'Rated') return false;
  if (!a.released) return true;
  return t.joint && ratingMeets_(t, a) && blank_(a.processConfirmed);
}
function bestScore_(t, released) {
  if (t.method === 'complete') return released.some(a => /^complete$/i.test(String(a.score).trim())) ? 'Complete' : null;
  const nums = released.map(a => num_(a.score, null)).filter(x => x !== null);
  return nums.length ? Math.max.apply(null, nums) : null;
}

/** Everything about one task for one trainee, before locks are applied. */
function attemptState_(t, list, entryDone) {
  const real = list.filter(a => a.status !== 'Draft'), draft = list.find(a => a.status === 'Draft') || null;
  const rated = real.filter(a => a.status === 'Rated'), released = rated.filter(a => a.released);
  const passedAttempt = released.find(a => attemptPasses_(t, a)) || null;
  const pending = real.some(a => attemptPending_(t, a)), used = real.length;
  let status;
  if (t.method === 'none') status = entryDone ? 'passed' : 'notstarted';
  else if (passedAttempt) status = 'passed';
  else if (pending) status = 'submitted';
  else if (used > 0 && used >= 1 + t.maxReworks) status = 'failed';
  else if (used > 0) status = 'rework';
  else status = draft ? 'progress' : 'notstarted';
  return {
    used: used, draft: draft, pending: pending, underReview: pending && rated.length > 0, passed: status === 'passed',
    best: bestScore_(t, released), flagEver: rated.some(a => a.flag), flagEverReleased: released.some(a => a.flag),
    status: status, nextVersion: used % 2 === 0 ? 'A' : 'B', needsConfirm: rated.some(a => t.joint && ratingMeets_(t, a) && blank_(a.processConfirmed))
  };
}

/* ---------------- one trainee ---------------- */

/**
 * ctx  = { tasks: [normalised, all], milestones: {1: {deadline}}, keySkills: [{n, name, linked: [ids]}], settings, holidays: [iso] }
 * tr   = the trainee record (start, caseReadiness, ...)
 * data = { attempts: [], taskDates: {id: {planned, dueOverride}}, entry: {area: {pathway, rating}}, behaviour: [{cycle, items:[6], released}] }
 * Returns the state of every active task plus progress, eligibility and the clearance checks.
 */
function computeTrainee_(ctx, tr, data, todayIso) {
  const s = ctx.settings, hol = ctx.holidays || [], tasks = ctx.tasks.filter(t => t.active);
  const cal = buildCalendar_(tr.start, s.cycles, s.daysPerCycle, hol), today = todayIso;
  const byTask = {};
  (data.attempts || []).forEach(a => { (byTask[a.task] = byTask[a.task] || []).push(a); });
  Object.keys(byTask).forEach(k => byTask[k].sort((x, y) => (x.no || 9999) - (y.no || 9999)));
  const entry = data.entry || {}, entryDone = AREAS.every(a => entry[a] && entry[a].pathway);
  const dates = data.taskDates || {};

  const base = {};
  tasks.forEach(t => { base[t.id] = attemptState_(t, byTask[t.id] || [], entryDone); });
  const passed = id => !!(base[id] && base[id].passed);
  const earlyLeft = tasks.filter(t => t.milestone >= 1 && t.milestone <= 3 && !passed(t.id)).length;

  const states = {};
  tasks.forEach(t => {
    const b = base[t.id], reasons = [];
    const pathway = t.fastTrack && !t.gate && t.entryArea ? ((entry[t.entryArea] || {}).pathway || 'Focus') : null;
    if (b.used === 0 && t.method !== 'none') {                     // locks matter only before the first attempt
      if (pathway !== 'Show quickly') {                            // R10: "Show quickly" goes straight to a rated attempt
        const miss = t.prereq.filter(id => base[id] && !base[id].passed);
        if (miss.length) reasons.push({ kind: 'prereq', ids: miss });                         // R4
      }
      if (t.milestone === 4 && earlyLeft > 0) reasons.push({ kind: 'milestone', left: earlyLeft });   // R5
      if (t.requiresSupervised && tr.caseReadiness === 'Not Cleared') reasons.push({ kind: 'supervised' });   // R6
    }
    const cyc = t.dueOverride || (ctx.milestones[t.milestone] || {}).deadline || s.cycles;
    const own = dates[t.id] || {};
    const due = own.dueOverride || (cal[cyc - 1] ? cal[cyc - 1].end : '');
    const locked = reasons.length > 0, soon = t.soon;
    let status = b.status;
    if (soon && b.used === 0) status = 'soon';
    else if (locked && (b.status === 'notstarted' || b.status === 'progress')) status = 'locked';
    const open = !b.passed && b.status !== 'failed';
    const dueIn = due ? workingDaysBetween_(today, due, hol) : null;
    states[t.id] = {
      id: t.id, status: status, rawStatus: b.status, reasons: reasons, due: due, dueCycle: cyc, planned: own.planned || '', pathway: pathway,
      used: b.used, maxAttempts: 1 + t.maxReworks, best: b.best, flagEver: b.flagEver, flagEverReleased: b.flagEverReleased,
      underReview: b.underReview, pending: b.pending, needsConfirm: b.needsConfirm, passed: b.passed, nextVersion: b.nextVersion,
      canSubmit: !locked && !soon && t.method !== 'none' && ['notstarted', 'progress', 'rework'].indexOf(b.status) > -1,
      overdue: open && !!due && due < today, dueSoon: open && dueIn !== null && dueIn >= 0 && dueIn <= s.dueSoonDays
    };
  });

  /* progress (R24): tasks passed / active tasks, no weights */
  const passedCount = tasks.filter(t => passed(t.id)).length;
  const strands = [];
  tasks.forEach(t => { if (strands.indexOf(t.strand) < 0) strands.push(t.strand); });
  const byStrand = strands.map(name => {
    const ts = tasks.filter(t => t.strand === name), scored = ts.filter(t => t.method === 'score');
    const bests = scored.map(t => base[t.id].best).filter(x => typeof x === 'number');
    const avg = bests.length ? bests.reduce((a, b) => a + b, 0) / bests.length : null;
    const all = ts.every(t => passed(t.id));
    return { strand: name, passed: ts.filter(t => passed(t.id)).length, total: ts.length, avg: avg === null ? null : Math.round(avg * 100) / 100,
             allPassed: all, ok: all && (avg === null ? scored.length === 0 : avg >= s.strandAverageMin) };   // R18
  });
  const byMilestone = [1, 2, 3, 4].map(m => {
    const ts = tasks.filter(t => t.milestone === m), dl = (ctx.milestones[m] || {}).deadline || 0;
    return { milestone: m, passed: ts.filter(t => passed(t.id)).length, total: ts.length, deadline: dl, due: cal[dl - 1] ? cal[dl - 1].end : '' };
  });

  /* Supervised Practice (R7): every prerequisite of the supervised-practice task is Passed, and cycle 4 has begun */
  const gateTask = tasks.find(t => t.id === s.supervisedTask);
  const prereqDone = !!gateTask && gateTask.prereq.every(id => !base[id] || base[id].passed);
  const earliest = cal[s.supervisedEarliestCycle - 1] ? cal[s.supervisedEarliestCycle - 1].start : '';
  const reached = !earliest || today >= earliest;
  const eligibleSupervised = tr.caseReadiness === 'Not Cleared' && prereqDone && reached;

  /* Key Skills (R19): at least 2 passed occasions on the linked tasks; Key Skills 1-5 need one Real */
  const keySkills = (ctx.keySkills || []).map(k => {
    const occ = [];
    k.linked.forEach(id => {
      const t = tasks.find(x => x.id === id);
      (byTask[id] || []).forEach(a => { if (t && a.released && attemptPasses_(t, a)) occ.push(a); });
    });
    const real = occ.filter(a => a.obsType === 'Real').length;
    return { n: k.n, name: k.name, occasions: occ.length, real: real,
             ok: occ.length >= s.keySkillOccasions && (k.n > s.keySkillRealUpTo || real >= 1) };
  });

  /* Professional behaviour (R20): Overall = the lowest of six items, 3+ in the most recent released cycles */
  const beh = (data.behaviour || []).filter(b => b.released).sort((a, b) => b.cycle - a.cycle);
  const overall = b => b.items.length === 6 && b.items.every(x => typeof x === 'number') ? Math.min.apply(null, b.items) : null;
  const recent = beh.slice(0, s.behaviourCycles);
  const behaviourOk = recent.length >= s.behaviourCycles && recent.every(b => (overall(b) || 0) >= 3);

  const openFlags = tasks.filter(t => base[t.id].flagEver && !base[t.id].passed).map(t => t.id);
  const allPassed = passedCount === tasks.length && tasks.length > 0;
  const strandsOk = byStrand.every(x => x.ok), keySkillsOk = keySkills.every(k => k.ok);
  const eligible = allPassed && strandsOk && keySkillsOk && behaviourOk && openFlags.length === 0;      // R21

  const ready = tasks.filter(t => states[t.id].status === 'notstarted' || states[t.id].status === 'rework')
    .sort((a, b) => (states[a.id].due || '9').localeCompare(states[b.id].due || '9') || a.milestone - b.milestone || cmpId_(a.id, b.id)).map(t => t.id);   // R23

  return {
    cal: cal, today: today, cycle: cycleOf_(cal, today), tasks: states,
    progress: { passed: passedCount, total: tasks.length, pct: tasks.length ? Math.round(passedCount / tasks.length * 100) : 0, byStrand: byStrand, byMilestone: byMilestone },
    supervised: { eligible: eligibleSupervised, prereqDone: prereqDone, reached: reached, earliest: earliest },
    clearance: { allPassed: allPassed, strandsOk: strandsOk, keySkills: keySkills, keySkillsOk: keySkillsOk, behaviourOk: behaviourOk, openFlags: openFlags, eligible: eligible },
    ready: ready, overdue: tasks.filter(t => states[t.id].overdue).map(t => t.id), dueSoon: tasks.filter(t => states[t.id].dueSoon).map(t => t.id),
    entryDone: entryDone
  };
}

/** The lowest of the six behaviour items, or null until all six are rated. */
function behaviourOverall_(items) {
  return items && items.length === 6 && items.every(x => typeof x === 'number') ? Math.min.apply(null, items) : null;
}
