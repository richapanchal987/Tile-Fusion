/**
 * Pure logic for the Well-being Counsellor Onboarding app.
 * Nothing in this file calls a Google service, so it can be unit-tested in Node
 * (see ../tests/logic.test.js). Code.gs reads the Sheet into a plain `db` object
 * and passes it in here.
 */

const STATUS_LABEL = {
  not: 'Not started', progress: 'In progress', submitted: 'Awaiting review',
  complete: 'Complete', partial: 'Partial', rework: 'Rework', exempt: 'Exempt'
};
const STATUS_KEY = Object.keys(STATUS_LABEL).reduce((o, k) => { o[STATUS_LABEL[k]] = k; return o; }, {});

// Credit toward "Training completion". Only an assessor's decision earns credit.
const CREDIT = { not: 0, progress: 0, submitted: 0, complete: 1, partial: 0.5, rework: 0, exempt: 1 };
const DONE_STATES = ['complete', 'exempt', 'submitted'];          // counts as "moved on" for the current cycle
const EDITABLE_STATES = ['not', 'progress', 'partial', 'rework']; // trainee may still change these
const OUTCOMES = ['complete', 'partial', 'rework', 'exempt'];
const LEVELS = ['notcleared', 'supervised', 'independent'];
const PATHWAYS = ['Standard', 'Experienced', 'Urgent'];

const levelRank_ = l => Math.max(0, LEVELS.indexOf(l));
const norm_ = e => String(e || '').trim().toLowerCase();

/* ---------------- Calendar: 6 working days a cycle, Sundays skipped ---------------- */

function isoToUtc_(iso) {
  const p = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
}
const utcToIso_ = d => d.toISOString().slice(0, 10);
const nextDay_ = d => new Date(d.getTime() + 86400000);

function buildCalendar_(startIso, cycles, perCycle) {
  if (!startIso) return [];
  let d = isoToUtc_(startIso);
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

/** Which cycle the calendar says the trainee should be in today. */
function expectedCycle_(cal, todayIso) {
  if (!cal.length) return { cycle: 0, state: 'unknown' };
  if (todayIso < cal[0].start) return { cycle: 0, state: 'notstarted' };
  for (let i = 0; i < cal.length; i++) {
    if (todayIso <= cal[i].end) return { cycle: todayIso >= cal[i].start ? cal[i].cycle : Math.max(1, cal[i].cycle - 1), state: 'active' };
  }
  return { cycle: cal.length, state: 'past' };
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
  const supLast = tr.pathway === 'Urgent' ? s.urgentGateCycle : s.supervisedGateCycle;
  const eligSup = gates.filter(g => g.cycle <= supLast).every(g => g.state === 'pass');
  const eligInd = gates.every(g => g.state === 'pass');
  const eligible = eligInd ? 'independent' : eligSup ? 'supervised' : 'notcleared';
  const confirmed = LEVELS.indexOf(tr.confirmed) > -1 ? tr.confirmed : 'notcleared';
  const needsReview = levelRank_(confirmed) > levelRank_(eligible);
  const effective = needsReview ? eligible : confirmed;

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
  return {
    completion: totalW ? Math.round(comp / totalW * 100) : 0,
    competency: cw ? Math.round(cs / cw * 100) : null,
    gates, gatesPassed: gates.filter(g => g.state === 'pass').length, gatesTotal: gates.length,
    eligible, confirmed, effective, needsReview,
    current, finished, expected: exp.cycle, calendarState: exp.state,
    behind: finished ? 0 : (exp.cycle > 0 ? exp.cycle - current : 0),
    pending, fractions
  };
}

/* ---------------- Who can see whom ---------------- */

function visibleTo_(me, tr) {
  if (me.role === 'Admin') return true;
  if (me.role === 'Assessor') return !tr.assessors.length || tr.assessors.indexOf(me.email) > -1;
  return me.role === 'Trainee' && tr.email === me.email;
}

/* ---------------- What the page receives ---------------- */

function buildBootstrap_(db, me, todayIso, appConfig) {
  const s = db.settings;
  const config = Object.assign({}, appConfig, {
    cycles: s.cycles, daysPerCycle: s.daysPerCycle, passScore: s.passScore,
    supervisedGateCycle: s.supervisedGateCycle, urgentGateCycle: s.urgentGateCycle,
    maxUploadMb: s.maxUploadMb, phases: db.phases, today: todayIso
  });
  if (me.role === 'None') return { me: me, config: config };

  const staff = me.role !== 'Trainee';
  const allTasks = db.tasks.slice().sort((a, b) => a.order - b.order);
  const activeTasks = allTasks.filter(t => t.active);
  const eff = effectiveWeights_(db.topics, activeTasks);
  const names = {}; db.staff.forEach(x => { names[x.email] = x.name || x.email; });

  const byTrainee = {};
  db.progress.forEach(r => { (byTrainee[r.trainee] = byTrainee[r.trainee] || []).push(r); });

  const trainees = db.trainees.filter(tr => visibleTo_(me, tr)).map(tr => {
    const p = {};
    (byTrainee[tr.email] || []).forEach(r => {
      p[r.task] = { status: r.status, evidence: r.evidence, files: r.files, reflection: r.reflection, score: r.score,
                    feedback: r.feedback, assessor: r.assessor, date: r.date, submitted: r.submitted, updated: r.updated };
    });
    const t = { id: tr.email, name: tr.name, start: tr.start, pathway: tr.pathway, active: tr.active,
                assessors: tr.assessors, assessorNames: tr.assessors.map(e => names[e] || e),
                confirmedBy: tr.confirmedBy, confirmedAt: tr.confirmedAt, confirmNote: tr.confirmNote, p: p };
    const cal = buildCalendar_(tr.start, s.cycles, s.daysPerCycle);
    t.cal = cal;
    t.stats = computeStats_(Object.assign({}, tr, { p: p }), { tasks: activeTasks, eff: eff, settings: s, cal: cal, todayIso: todayIso });
    return t;
  });

  const out = {
    me: me, config: config,
    topics: db.topics.map(t => ({ id: t.id, name: t.name, w: t.weight, note: staff ? t.note : '' })),
    tasks: (staff ? allTasks : activeTasks).map(t => ({
      id: t.id, topic: t.topic, cycle: t.cycle, name: t.name, type: t.type, what: t.what, evidence: t.evidence,
      standard: t.standard, weight: t.weight, gate: t.gate, mandatory: t.mandatory, active: t.active, order: t.order,
      w: Math.round((eff[t.id] || 0) * 10) / 10
    })),
    res: db.resources,
    trainees: trainees
  };
  if (me.role === 'Admin') out.staff = db.staff;
  return out;
}

/* ---------------- Validation of writes ---------------- */

/** Checks an assessor's decision and returns the cleaned values to store. Throws a readable Error if it is not allowed. */
function validateAssessment_(task, input, settings) {
  const outcome = String(input.outcome || '');
  if (OUTCOMES.indexOf(outcome) < 0) throw new Error('Choose Complete, Partial, Rework or Exempt.');
  const feedback = String(input.feedback || '').trim().slice(0, 5000);
  if (outcome === 'exempt') {
    if (task.gate) throw new Error('A critical-gate task cannot be exempted. Assess it instead.');
    if (!feedback) throw new Error('Say why this task is exempt, for example prior experience.');
    return { status: 'exempt', score: '', feedback: feedback };
  }
  const score = Number(input.score);
  if ([1, 2, 3, 4].indexOf(score) < 0) throw new Error('Choose a score from 1 to 4.');
  if (outcome === 'complete' && score < 2) throw new Error('A score of 1 (Not yet competent) cannot be marked Complete. Choose Partial or Rework.');
  if (outcome === 'complete' && task.gate && score < settings.passScore) {
    throw new Error('This is a critical gate. It needs a score of ' + settings.passScore + ' or more to be Complete. Choose Partial or Rework.');
  }
  if ((outcome === 'partial' || outcome === 'rework') && !feedback) throw new Error('Tell the trainee what needs to change.');
  return { status: outcome, score: score, feedback: feedback };
}

/** Checks a readiness decision against the trainee's computed eligibility. */
function validateReadiness_(level, stats, me) {
  if (LEVELS.indexOf(level) < 0) throw new Error('Unknown readiness level.');
  if (level === 'notcleared') return;
  if (level === 'independent' && me.role !== 'Admin') throw new Error('Independent clearance is signed off by the Principal or an admin.');
  if (levelRank_(stats.eligible) < levelRank_(level)) {
    throw new Error('The critical gates for this level are not all passed yet.');
  }
}

function safeFileName_(name) {
  return String(name || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120);
}
const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'mp3', 'm4a', 'mp4'];
function extOk_(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name));
  return !!m && ALLOWED_EXT.indexOf(m[1].toLowerCase()) > -1;
}

/** Stats for one trainee straight from the db. Used to check a readiness decision on the server. */
function statsForTrainee_(db, email, todayIso) {
  const tr = db.trainees.find(t => t.email === email);
  const activeTasks = db.tasks.filter(t => t.active);
  const p = {};
  db.progress.filter(r => r.trainee === email).forEach(r => { p[r.task] = r; });
  return computeStats_(Object.assign({}, tr, { p: p }), {
    tasks: activeTasks, eff: effectiveWeights_(db.topics, activeTasks), settings: db.settings,
    cal: buildCalendar_(tr.start, db.settings.cycles, db.settings.daysPerCycle), todayIso: todayIso
  });
}
