/**
 * Pure rules for the Student Champion Training app.
 * Nothing in this file calls a Google service, so it can be unit-tested in Node (see ../tests/logic.test.js).
 * Code.gs reads the Sheet into a plain `db` object and passes it in here. Wording lives in Config.gs.
 */

// Files can be loaded in any order in Apps Script, so nothing at the top level of any file may use another file's constants
// (PROGRAMME is in Config.gs, SEED in SeedData.gs). Everything that does is a function or a getter, evaluated when called.
const statusLabel_ = k => PROGRAMME.statusLabels[k];
const statusKey_ = label => Object.keys(PROGRAMME.statusLabels).find(k => PROGRAMME.statusLabels[k] === label) || 'not';

// Credit toward "Training completion". Only an assessor's decision earns credit.
const CREDIT = { not: 0, progress: 0, submitted: 0, complete: 1, partial: 0.5, rework: 0, exempt: 1 };
const DONE_STATES = ['complete', 'exempt', 'submitted'];          // counts as "moved on" for the current cycle
const EDITABLE_STATES = ['not', 'progress', 'partial', 'rework']; // trainee may still change these
const LEVELS = ['notcertified', 'certified'];
const AI_KEYS = ['ask', 'no', 'yes'];
const STUDENT_CODE = /^G\d{1,2}-S\d{1,3}$/;

const norm_ = e => String(e || '').trim().toLowerCase();
const num_ = (v, d) => { const n = Number(v); return isFinite(n) && String(v).trim() !== '' ? n : (d === undefined ? 0 : d); };

/* ---------------- Calendar: working days per cycle (Sundays skipped), and the end date ---------------- */

const utcToIso_ = d => d.toISOString().slice(0, 10);
const nextDay_ = d => new Date(d.getTime() + 86400000);

/** Reads a yyyy-MM-dd string as a UTC date. Returns null if it is not a real date. */
function isoToUtc_(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Turns whatever is in a date cell into yyyy-MM-dd, or '' if it cannot be understood.
 * Accepts ISO text, day-first d/m/y (as used in India) and Sheets serial numbers.
 */
function normaliseDate_(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (!s) return '';
  if (/^\d{5}$/.test(s)) {                       // a Sheets date serial such as 46300
    const n = Number(s);
    return n > 20000 && n < 80000 ? utcToIso_(new Date(Math.round((n - 25569) * 86400000))) : '';
  }
  let y, mo, da, m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T ])/.exec(s);
  if (m) { y = +m[1]; mo = +m[2]; da = +m[3]; }
  else if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s))) { da = +m[1]; mo = +m[2]; y = +m[3]; }
  else return '';
  const dt = new Date(Date.UTC(y, mo - 1, da));
  if (isNaN(dt.getTime()) || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da) return '';
  return utcToIso_(dt);
}

/** The same day some calendar months later: 1 June + 3 months = 1 September. A day that does not exist (31 Nov) becomes the month's last day. */
function addMonths_(startIso, months) {
  const d = isoToUtc_(startIso);
  if (!d) return '';
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + months, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return utcToIso_(new Date(Date.UTC(y, m, Math.min(day, last))));
}

function buildCalendar_(startIso, cycles, perCycle) {
  let d = isoToUtc_(startIso);
  if (!d) return [];
  const out = [];
  for (let c = 1; c <= cycles; c++) {
    let first = null, last = null;
    for (let i = 0; i < perCycle; i++) {
      while (d.getUTCDay() === 0) d = nextDay_(d);
      if (i === 0) first = d;
      last = d;
      d = nextDay_(d);
    }
    out.push({ cycle: c, start: utcToIso_(first), end: utcToIso_(last) });
  }
  return out;
}

/** Working days (Sundays excluded) from the start date through today, counting both. 0 before the start. */
function workingDaysElapsed_(startIso, todayIso) {
  const s = isoToUtc_(startIso), t = isoToUtc_(todayIso);
  if (!s || !t || t < s) return 0;
  let n = 0;
  for (let d = s; d <= t; d = nextDay_(d)) if (d.getUTCDay() !== 0) n++;
  return n;
}

/** Which cycle the calendar says the trainee should be in today. */
function expectedCycle_(cal, todayIso) {
  if (!cal.length) return { cycle: 0, state: 'unknown' };
  if (todayIso < cal[0].start) return { cycle: 0, state: 'notstarted' };
  for (let i = 0; i < cal.length; i++) {
    if (todayIso <= cal[i].end) return { cycle: todayIso >= cal[i].start ? cal[i].cycle : Math.max(1, cal[i].cycle - 1), state: 'active' };
  }
  return { cycle: cal.length, state: 'past' };
}

/* ---------------- Phases belong to modules; a cycle takes the phase of its first task ---------------- */

/** [{name, from, to}] for the cycle path. A cycle that mixes two phases shows the phase of its first task. */
function phaseRanges_(topics, tasks, phaseNames, cycles) {
  const phaseOfTopic = {};
  topics.forEach(t => { phaseOfTopic[t.id] = t.phase; });
  const per = [];
  let prev = phaseNames[0] || '';
  for (let c = 1; c <= cycles; c++) {
    const first = tasks.filter(t => t.cycle === c).sort((a, b) => a.order - b.order)[0];
    const ph = first && phaseOfTopic[first.topic] ? phaseOfTopic[first.topic] : prev;
    per.push(ph); prev = ph;
  }
  const out = [];
  per.forEach((ph, i) => {
    const last = out[out.length - 1];
    if (last && last.name === ph) last.to = i + 1; else out.push({ name: ph, from: i + 1, to: i + 1 });
  });
  return out;
}

/* ---------------- Weights and gates ---------------- */

/** Topic weight (Training Overview) shared across that topic's active tasks in proportion to task weight. */
function effectiveWeights_(topics, activeTasks) {
  const eff = {};
  topics.forEach(tp => {
    const ts = activeTasks.filter(t => t.topic === tp.id);
    const sum = ts.reduce((a, t) => a + t.weight, 0);
    ts.forEach(t => { eff[t.id] = sum > 0 ? tp.weight * t.weight / sum : (ts.length ? tp.weight / ts.length : 0); });
  });
  return eff;
}

function gateState_(task, prog, passScore) {
  if (!task.gate) return null;
  const st = prog.status;
  if (st === 'complete' && prog.score >= passScore) return 'pass';
  if (st === 'complete' || st === 'partial' || st === 'rework') return 'attention';
  return 'open';
}

/** Share of a task's weight that counts toward its module's percentage. Only a decision earns it: score out of 4, or full for Exempt. */
function moduleShare_(p) {
  if (p.status === 'exempt') return 1;
  if ((p.status === 'complete' || p.status === 'partial') && p.score) return p.score / 4;
  return 0;
}

const aiOf_ = (task, p) => (p && AI_KEYS.indexOf(p.ai) > -1) ? p.ai : (AI_KEYS.indexOf(task.ai) > -1 ? task.ai : 'ask');
const failedAllowed_ = (settings, p) => 1 + settings.reattempts + (p.extra || 0);

/* ---------------- Per-trainee statistics ---------------- */

function computeStats_(tr, ctx) {
  const tasks = ctx.tasks, eff = ctx.eff, s = ctx.settings;
  const P = id => tr.p[id] || { status: 'not' };
  let comp = 0, totalW = 0, cw = 0, cs = 0, pending = 0;
  tasks.forEach(t => {
    const w = eff[t.id] || 0, p = P(t.id);
    totalW += w; comp += w * CREDIT[p.status];
    if ((p.status === 'complete' || p.status === 'partial') && p.score) { cw += w; cs += w * p.score / 4; }
    if (p.status === 'submitted') pending++;
  });

  const gates = tasks.filter(t => t.gate).map(t => ({ id: t.id, name: t.name, cycle: t.cycle, state: gateState_(t, P(t.id), s.passScore) }));

  // module percentages against each module's pass mark
  const modules = ctx.topics.map(tp => {
    const ts = tasks.filter(t => t.topic === tp.id);
    let W = 0, got = 0;
    ts.forEach(t => { const w = eff[t.id] || 0; W += w; got += w * moduleShare_(P(t.id)); });
    const pct = W ? Math.round(got / W * 100) : 0;
    return { id: tp.id, name: tp.name, pct: pct, need: tp.threshold, met: pct >= tp.threshold };
  });

  // open critical errors and the consent checklists real-student tasks need before they can be signed off
  const openCritical = tasks.filter(t => P(t.id).critical && ['rework', 'partial'].indexOf(P(t.id).status) > -1).map(t => t.id);
  const done = id => ['complete', 'partial', 'exempt'].indexOf(P(id).status) > -1;
  const lists = tr.checklists || [];
  const missingChecklist = tasks.filter(t => t.real && done(t.id) && P(t.id).status !== 'exempt' &&
    lists.filter(c => c.task === t.id).length < Math.max(1, t.students || 1)).map(t => t.id);

  const blockers = [];
  gates.filter(g => g.state !== 'pass').forEach(g => blockers.push('Critical gate ' + g.id + ' ' + g.name + ' is not passed yet.'));
  modules.filter(m => !m.met).forEach(m => blockers.push('Module ' + m.id + ' is at ' + m.pct + '%; it needs ' + m.need + '%.'));
  openCritical.forEach(id => blockers.push('A critical error on ' + id + ' still needs a reattempt.'));
  missingChecklist.forEach(id => blockers.push('The consent checklist for ' + id + ' is missing.'));
  const eligible = blockers.length ? 'notcertified' : 'certified';
  const confirmed = LEVELS.indexOf(tr.confirmed) > -1 ? tr.confirmed : 'notcertified';
  const needsReview = confirmed === 'certified' && eligible !== 'certified';
  const effective = needsReview ? 'notcertified' : confirmed;

  const fractions = [];
  let current = null;
  for (let c = 1; c <= s.cycles; c++) {
    const ts = tasks.filter(t => t.cycle === c);
    const sum = ts.reduce((a, t) => {
      const st = P(t.id).status;
      return a + (st === 'complete' || st === 'exempt' || st === 'submitted' ? 1 : st === 'partial' ? 0.5 : 0);
    }, 0);
    fractions.push(ts.length ? sum / ts.length : 0);
    if (current === null && ts.some(t => DONE_STATES.indexOf(P(t.id).status) < 0)) current = c;
  }
  const finished = current === null;
  if (finished) current = s.cycles;

  const exp = expectedCycle_(ctx.cal, ctx.todayIso);
  // Where the calendar says the work should be by today: earlier cycles in full, the current one in proportion to the days gone.
  const elapsed = workingDaysElapsed_(tr.start, ctx.todayIso);
  let expW = 0;
  tasks.forEach(t => { expW += (eff[t.id] || 0) * Math.max(0, Math.min(1, (elapsed - (t.cycle - 1) * s.daysPerCycle) / s.daysPerCycle)); });
  const overdue = tasks.filter(t => P(t.id).due && P(t.id).due < ctx.todayIso && DONE_STATES.indexOf(P(t.id).status) < 0).length;
  return {
    expectedPct: totalW && ctx.cal.length ? Math.round(expW / totalW * 100) : 0,
    completion: totalW ? Math.round(comp / totalW * 100) : 0,
    competency: cw ? Math.round(cs / cw * 100) : null,
    gates, gatesPassed: gates.filter(g => g.state === 'pass').length, gatesTotal: gates.length,
    modules, modulesMet: modules.filter(m => m.met).length, openCritical, missingChecklist, blockers,
    eligible, confirmed, effective, needsReview,
    current, finished, expected: exp.cycle, calendarState: exp.state,
    behind: finished ? 0 : (exp.cycle > 0 ? exp.cycle - current : 0),
    pending, overdue, fractions
  };
}

/* ---------------- Who can see whom ---------------- */

/** Everyone assigned to a trainee: mentors, TL and certifying mentor. */
const peopleOf_ = tr => (tr.assessors || []).concat([tr.tl, tr.certifier]).filter(Boolean);

function visibleTo_(me, tr) {
  if (me.role === 'Admin') return true;
  if (me.role === 'Assessor') { const p = peopleOf_(tr); return !p.length || p.indexOf(me.email) > -1; }
  return me.role === 'Trainee' && tr.email === me.email;
}

/* ---------------- What the page receives ---------------- */

function publicConfig_(db, appConfig, todayIso, phases) {
  const s = db.settings;
  return Object.assign({}, appConfig, {
    cycles: s.cycles, daysPerCycle: s.daysPerCycle, programmeMonths: s.programmeMonths, passScore: s.passScore, reattempts: s.reattempts,
    maxUploadMb: s.maxUploadMb, phases: phases, phaseNames: db.phases, today: todayIso
  });
}

function buildBootstrap_(db, me, todayIso, appConfig) {
  const activeTasks0 = db.tasks.filter(t => t.active);
  const phases = phaseRanges_(db.topics, activeTasks0, db.phases, db.settings.cycles);
  const config = publicConfig_(db, appConfig, todayIso, phases);
  if (me.role === 'None') return { me: me, config: config };

  const s = db.settings, staff = me.role !== 'Trainee';
  const allTasks = db.tasks.slice().sort((a, b) => a.order - b.order);
  const activeTasks = allTasks.filter(t => t.active);
  const eff = effectiveWeights_(db.topics, activeTasks);
  const names = {}; db.staff.forEach(x => { names[x.email] = x.name || x.email; });
  const topicPhase = {}; db.topics.forEach(t => { topicPhase[t.id] = t.phase; });

  const byTrainee = {}, listsBy = {};
  db.progress.forEach(r => { (byTrainee[r.trainee] = byTrainee[r.trainee] || []).push(r); });
  db.checklists.forEach(r => { (listsBy[r.trainee] = listsBy[r.trainee] || []).push(r); });

  const trainees = db.trainees.filter(tr => visibleTo_(me, tr)).map(tr => {
    const p = {};
    (byTrainee[tr.email] || []).forEach(r => {
      p[r.task] = { status: r.status, evidence: r.evidence, files: r.files, reflection: r.reflection, score: r.score,
                    feedback: r.feedback, assessor: r.assessor, date: r.date, submitted: r.submitted, updated: r.updated,
                    criteria: r.criteria, critical: r.critical, failed: r.failed, extra: r.extra, due: r.due, ai: r.ai };
    });
    const t = { id: tr.email, name: tr.name, start: tr.start, end: addMonths_(tr.start, s.programmeMonths), active: tr.active,
                assessors: tr.assessors, tl: tr.tl, certifier: tr.certifier,
                assessorNames: tr.assessors.map(e => names[e] || e), tlName: tr.tl ? (names[tr.tl] || tr.tl) : '', certifierName: tr.certifier ? (names[tr.certifier] || tr.certifier) : '',
                confirmedBy: tr.confirmedBy, confirmedAt: tr.confirmedAt, confirmNote: tr.confirmNote, p: p,
                lists: (listsBy[tr.email] || []).map(c => ({ task: c.task, code: c.code, at: c.at })) };
    const cal = buildCalendar_(tr.start, s.cycles, s.daysPerCycle);
    t.cal = cal;
    t.stats = computeStats_(Object.assign({}, tr, { p: p, checklists: listsBy[tr.email] || [] }),
      { tasks: activeTasks, topics: db.topics, eff: eff, settings: s, cal: cal, todayIso: todayIso });
    return t;
  });

  // A long group text (a case-study scenario) is repeated on every row of its group, so send each text once and refer to it by number.
  const rubricGroups = { list: [], rows: [] };
  db.rubrics.forEach(r => {
    let g = rubricGroups.list.indexOf(r.group);
    if (g < 0) { rubricGroups.list.push(r.group); g = rubricGroups.list.length - 1; }
    rubricGroups.rows.push({ task: r.task, order: r.order, use: r.use, g: g, criterion: r.criterion, evaluated: r.evaluated, levels: r.levels });
  });
  const out = {
    me: me, config: config,
    topics: db.topics.map(t => ({ id: t.id, name: t.name, w: t.weight, phase: t.phase, need: t.threshold, doc: t.doc, note: staff ? t.note : '' })),
    tasks: (staff ? allTasks : activeTasks).map(t => ({
      id: t.id, topic: t.topic, cycle: t.cycle, name: t.name, type: t.type, what: t.what, evidence: t.evidence,
      standard: t.standard, weight: t.weight, gate: t.gate, active: t.active, order: t.order, ai: t.ai, real: t.real, students: t.students, doc: t.doc,
      phase: topicPhase[t.topic] || '', w: Math.round((eff[t.id] || 0) * 10) / 10
    })),
    rubricGroups: rubricGroups.list, rubrics: rubricGroups.rows, res: db.resources,
    trainees: trainees
  };
  if (me.role === 'Admin') out.staff = db.staff; else if (staff) out.staff = db.staff.map(x => ({ email: x.email, name: x.name, role: x.role, certifies: x.certifies }));
  return out;
}

/* ---------------- Validation of writes ---------------- */

/** Rounds half up: 2.5 becomes 3. */
const roundHalfUp_ = x => Math.floor(x + 0.5);

/**
 * Works out an assessor's decision. `rows` are the scored rubric rows of the task (may be empty).
 * input: { exempt, criteria: {order: 1..4}, score, feedback, critical: {type, note} }
 * Returns the cleaned values to store. Throws a readable Error if it is not allowed.
 */
function validateAssessment_(task, rows, input, settings) {
  const feedback = String(input.feedback || '').trim().slice(0, 5000);
  if (input.exempt) {
    if (task.gate) throw new Error('A critical-gate task cannot be exempted. Assess it instead.');
    if (!feedback) throw new Error('Say why this task is exempt, for example prior experience.');
    return { status: 'exempt', score: '', feedback: feedback, criteria: {}, critical: '' };
  }
  let score, criteria = {};
  if (rows.length) {
    const given = input.criteria || {};
    rows.forEach(r => {
      const v = Number(given[r.order]);
      if ([1, 2, 3, 4].indexOf(v) < 0) throw new Error('Score every criterion from 1 to 4 (missing: ' + String(r.criterion).slice(0, 60) + ').');
      criteria[r.order] = v;
    });
    score = roundHalfUp_(rows.reduce((a, r) => a + criteria[r.order], 0) / rows.length);
  } else {
    score = Number(input.score);
    if ([1, 2, 3, 4].indexOf(score) < 0) throw new Error('Choose a score from 1 to 4.');
  }
  let critical = '';
  const c = input.critical;
  if (c && c.type !== undefined && c.type !== '') {
    const list = PROGRAMME.criticalErrors.map(x => x[0]);
    if (list.indexOf(String(c.type)) < 0) throw new Error('Choose one of the listed critical errors.');
    if (!feedback) throw new Error('Describe what happened and the remediation conversation to hold.');
    critical = String(c.type);
    score = 1;                                       // a critical error is "not yet met", whatever the criteria say
  }
  const meets = score >= 3 && score >= settings.passScore;
  const status = critical ? 'rework' : meets ? 'complete' : score >= 2 ? 'partial' : 'rework';
  if ((status === 'partial' || status === 'rework') && !feedback) throw new Error('Tell the trainee what needs to change.');
  return { status: status, score: score, feedback: feedback, criteria: criteria, critical: critical };
}

/** Who may confirm certification, and whether the computed eligibility allows it. */
function validateCertification_(level, stats, me) {
  if (LEVELS.indexOf(level) < 0) throw new Error('Unknown level.');
  if (level === 'notcertified') {
    if (me.role !== 'Admin' && !me.certifier) throw new Error('Only a Certifying Mentor or an admin can withdraw certification.');
    return;
  }
  if (!me.certifier) throw new Error('Only a ' + PROGRAMME.words.certifier + ' can confirm certification.');
  if (stats.eligible !== 'certified') throw new Error('This trainee is not eligible yet: ' + stats.blockers[0]);
}

/** A due date is optional; an empty value clears it. */
function validateDue_(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const d = normaliseDate_(s);
  if (!d) throw new Error('Enter the due date as a valid date.');
  return d;
}

function validateChecklist_(taskId, code, ticked, task) {
  if (!task.real) throw new Error('This task does not need a consent checklist.');
  const c = String(code || '').trim().toUpperCase();
  if (!STUDENT_CODE.test(c)) throw new Error('Use a student code such as ' + PROGRAMME.checklist.codeExample + ' (grade, then student number). Never a name.');
  const total = PROGRAMME.checklist.groups.reduce((a, g) => a + g[1].length, 0);
  if (!Array.isArray(ticked) || ticked.length !== total || !ticked.every(x => x === true)) throw new Error('Tick every item before saving the checklist.');
  return c;
}

function safeFileName_(name) {
  return String(name || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120);
}
const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'mp3', 'm4a', 'mp4'];
function extOk_(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name));
  return !!m && ALLOWED_EXT.indexOf(m[1].toLowerCase()) > -1;
}

/** Stats for one trainee straight from the db. Used to check a certification decision on the server. */
function statsForTrainee_(db, email, todayIso) {
  const tr = db.trainees.find(t => t.email === email);
  const activeTasks = db.tasks.filter(t => t.active);
  const p = {};
  db.progress.filter(r => r.trainee === email).forEach(r => { p[r.task] = r; });
  return computeStats_(Object.assign({}, tr, { p: p, checklists: db.checklists.filter(c => c.trainee === email) }), {
    tasks: activeTasks, topics: db.topics, eff: effectiveWeights_(db.topics, activeTasks), settings: db.settings,
    cal: buildCalendar_(tr.start, db.settings.cycles, db.settings.daysPerCycle), todayIso: todayIso
  });
}
