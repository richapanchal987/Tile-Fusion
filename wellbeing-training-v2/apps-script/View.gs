/**
 * What each person's screen is allowed to receive (App Rules R1, R2, R3, R15).
 * Everything is decided here on the server; the page never gets data it should not show.
 *
 *   Trainee      only their own rows; no Team Leader-only fields; ratings hidden until released; locked tasks show no content
 *   Team Leader  trainees of their own section in full; the other section read-only (no private notes) for cover
 *   Coordinator  the attempts on joint-assessed tasks, plus administration; never Team Leader private notes or feedback
 *   Principal    only the clearance page of their own section's trainees
 */

const COVER_HIDDEN_TRAINEE = ['background', 'entryNotes', 'extensionNotes'];

function appConfig_() {
  return { appName: 'Well-being Counsellor Training', orgName: 'Fountainhead School', domain: 'fsksurat.in', readiness: READINESS, areas: AREAS, strands: STRANDS,
           behaviourItems: BEHAVIOUR_ITEMS, decisions: DECISIONS, obsTypes: OBS_TYPES, sections: SECTIONS, roles: [ROLE.TL_J, ROLE.TL_S, ROLE.COORD, ROLE.PR_J, ROLE.PR_S],
           taskFields: TASK_FIELDS.map(f => ({ key: f[0], header: f[1], group: f[2], kind: f[3] })), maxFiles: 5 };
}

function milestoneRows_(db) {
  const act = db.tasks.filter(t => t.active);
  let prev = 0;
  return [1, 2, 3, 4].map(n => {
    const m = db.milestones[n] || { deadline: MILESTONE_DEADLINES[n], focus: '', readiness: '' }, ts = act.filter(t => t.milestone === n), cycles = Math.max(0, m.deadline - prev);
    prev = m.deadline || prev;
    const hours = ts.reduce((a, t) => a + t.effort, 0), days = cycles * db.settings.daysPerCycle;
    return { n: n, deadline: m.deadline, focus: m.focus, readiness: m.readiness, tasks: ts.length, cycles: cycles, days: days, hours: hours, hoursPerDay: days ? Math.round(hours / days * 10) / 10 : 0 };
  });
}

const tlName_ = (db, email) => { const u = db.users.find(x => x.email === email); return u ? u.name : email; };
const titleOf_ = (db, id) => { const t = db.tasks.find(x => x.id === id); return t ? t.title : id; };

/* ---------------- the trainee's own view ---------------- */

function traineeTaskView_(db, t, st) {
  const v = { id: t.id, title: t.title, strand: t.strand, area: t.area, milestone: t.milestone, stage: t.stage, ageBand: t.ageBand, gate: t.gate,
              keySkill: t.raw.keySkill, bestDoneOn: t.raw.bestDoneOn, effort: t.effort, ratingMethod: t.raw.ratingMethod, passMark: t.raw.passMark,
              evidenceRequired: t.raw.evidenceRequired, assessorRole: t.raw.assessorRole, joint: t.joint, obsType: t.obsType,
              status: st.status, due: st.due, dueCycle: st.dueCycle, planned: st.planned, pathway: st.pathway, used: st.used, maxAttempts: st.maxAttempts,
              best: st.best, underReview: st.underReview, canSubmit: st.canSubmit, nextVersion: st.nextVersion, flagEver: st.flagEverReleased, overdue: st.overdue, dueSoon: st.dueSoon,
              reasons: st.reasons.map(r => r.kind === 'prereq' ? { kind: 'prereq', tasks: r.ids.map(id => ({ id: id, title: titleOf_(db, id) })) } : r) };
  if (st.status === 'locked' || st.status === 'soon') return v;      // R4-R6: a locked or not-yet-ready task shows no content
  ['what', 'toolkit', 'learn', 'refs', 'refLinks', 'inApp', 'traineeLink', 'evidenceDesc', 'competency', 'anchor', 'rubric', 'rubricLink', 'toolkit'].forEach(k => { v[k] = t.raw[k]; });
  v.prereq = t.prereq.map(id => ({ id: id, title: titleOf_(db, id) }));
  return v;
}

/** R15: until the Team Leader releases a rating the trainee sees only that it is under review. */
function traineeAttemptView_(a) {
  const v = { id: a.id, task: a.task, no: a.no, status: a.status, submitted: a.submitted, evidence: a.evidence, files: a.files, anon: a.anon, reflection: a.reflection,
              question: a.question, hours: a.hours, seen: a.seen, source: a.source };
  if (a.status !== 'Rated') return v;
  if (!a.released) { v.underReview = true; return v; }
  return Object.assign(v, { released: true, score: a.score, rubric: a.rubric, flag: a.flag, flagNote: a.flagNote, feedback: a.feedback, goal: a.goal, reworkRequired: a.reworkRequired,
                            reworkDue: a.reworkDue, assessed: a.assessed, obsType: a.obsType, version: a.version, processConfirmed: a.processConfirmed, processNote: a.processNote });
}

function traineeBootstrap_(db, me, today, out) {
  const tr = db.trainees.find(x => x.email === me.email), calc = computeFor_(db, tr, today);
  const mine = db.attempts.filter(a => a.trainee === tr.email);
  const beh = db.behaviour[tr.email] || [];
  out.readOnly = !!me.readOnly;
  out.trainee = { id: tr.id, name: tr.name, email: tr.email, section: tr.section, start: tr.start, tl: tlName_(db, tr.tl), principal: tlName_(db, tr.principal), caseReadiness: tr.caseReadiness,
                  status: tr.status, decision: tr.decision, decisionDate: tr.decisionDate, conditions: tr.conditions, cases: tr.cases, groups: tr.groups };
  out.calc = { cal: calc.cal, cycle: calc.cycle, progress: calc.progress, ready: calc.ready, overdue: calc.overdue, dueSoon: calc.dueSoon, entryDone: calc.entryDone };
  out.tasks = db.tasks.filter(t => t.active).map(t => traineeTaskView_(db, t, calc.tasks[t.id]));
  out.attempts = mine.map(traineeAttemptView_);
  out.entry = Object.keys(db.entry[tr.email] || {}).map(a => ({ area: a, pathway: db.entry[tr.email][a].pathway }));   // ratings and notes stay with the Team Leader
  out.behaviour = beh.map(b => ({ cycle: b.cycle, self: b.self, released: b.released, items: b.released ? b.items : null, overall: b.released ? behaviourOverall_(b.items) : null,
                                  comments: b.released ? b.comments : '', goal: b.released ? b.goal : '' }));
  const acks = db.acks[tr.email] || [];
  out.policies = db.policies.map(p => { const mineAck = acks.filter(x => x.policy === p.name).sort((a, b) => b.at.localeCompare(a.at))[0];
    return { name: p.name, link: p.link, updated: p.updated, acknowledged: mineAck ? mineAck.at : '', ackedVersion: mineAck ? mineAck.updated : '', stale: !!(mineAck && p.updated && mineAck.updated !== p.updated) }; });
  out.keySkills = db.keySkills.map(k => { const s = calc.clearance.keySkills.find(x => x.n === k.n) || {}; return { n: k.n, name: k.name, rule: k.rule, linked: k.linked, occasions: s.occasions || 0, real: s.real || 0, ok: !!s.ok, rubricLink: k.rubricLink }; });
  out.supervision = db.supervision.filter(x => x.trainee === tr.email).map(x => ({ id: x.id, date: x.date, type: x.type, code: x.code }));
  out.limits = caseLimits_(db, tr, calc);
  out.toolkit = db.toolkit; out.rubrics = db.rubrics; out.milestones = milestoneRows_(db);
  return out;
}

/* ---------------- Team Leaders ---------------- */

function staffTraineeView_(db, tr, me, today, cover) {
  const calc = computeFor_(db, tr, today), rec = Object.assign({}, tr, { tlName: tlName_(db, tr.tl), principalName: tlName_(db, tr.principal) });
  if (cover) COVER_HIDDEN_TRAINEE.forEach(k => { rec[k] = ''; });
  const beh = (db.behaviour[tr.email] || []).map(b => cover ? Object.assign({}, b, { tlNotes: '' }) : b);
  const sup = db.supervision.filter(x => x.trainee === tr.email).map(x => cover ? Object.assign({}, x, { notes: '' }) : x);
  const attempts = db.attempts.filter(a => a.trainee === tr.email).map(a => cover ? Object.assign({}, a, { tlNotes: '' }) : a);
  return { record: rec, cover: !!cover, calc: calc, attempts: attempts, entry: db.entry[tr.email] || {}, supervision: sup, limits: caseLimits_(db, tr, calc), behaviour: beh, taskDates: db.taskDates[tr.email] || {}, acks: db.acks[tr.email] || [] };
}

function tlBootstrap_(db, me, today, out) {
  out.trainees = db.trainees.map(tr => staffTraineeView_(db, tr, me, today, tr.section !== me.section));
  out.catalogue = db.rawTasks;
  out.milestones = milestoneRows_(db); out.keySkills = db.keySkills; out.toolkit = db.toolkit; out.rubrics = db.rubrics; out.policies = db.policies;
  out.staff = db.users.filter(u => u.active).map(u => ({ email: u.email, name: u.name, role: u.role, section: u.section }));
  out.settings = db.settings;
  return out;
}

/* ---------------- Campus Operations Coordinator ---------------- */

function coordBootstrap_(db, me, today, out) {
  const joint = {}; db.tasks.filter(t => t.joint && t.active).forEach(t => { joint[t.id] = t; });
  out.trainees = db.trainees.map(tr => ({ id: tr.id, name: tr.name, email: tr.email, section: tr.section, start: tr.start, caseReadiness: tr.caseReadiness, status: tr.status }));
  out.confirmations = db.attempts.filter(a => joint[a.task] && a.status === 'Rated').map(a => {
    const t = joint[a.task], tr = db.trainees.find(x => x.email === a.trainee) || {};
    return { id: a.id, trainee: a.trainee, traineeName: tr.name || a.trainee, task: a.task, title: t.title, no: a.no, evidence: a.evidence, files: a.files, reflection: a.reflection, evidenceDesc: t.raw.evidenceDesc,
             rated: ratingMeets_(t, a), processConfirmed: a.processConfirmed, processNote: a.processNote, processDate: a.processDate, submitted: a.submitted };
  });
  out.reliability = [];
  Object.keys(db.behaviour).forEach(e => db.behaviour[e].forEach(b => out.reliability.push({ trainee: e, cycle: b.cycle, text: b.reliability })));
  out.users = db.users; out.settings = db.settings; out.policies = db.policies; out.holidays = db.holidays; out.milestones = milestoneRows_(db);
  out.catalogueCount = db.tasks.filter(t => t.active).length; out.imported = !!db.settings.importedAt;
  return out;
}

/* ---------------- Principals ---------------- */

function principalBootstrap_(db, me, today, out) {
  out.trainees = db.trainees.filter(tr => tr.section === me.section).map(tr => {
    const c = computeFor_(db, tr, today);
    return { id: tr.id, name: tr.name, email: tr.email, start: tr.start, caseReadiness: tr.caseReadiness, decision: tr.decision, decisionDate: tr.decisionDate, conditions: tr.conditions, signoffDate: tr.signoffDate,
             eligible: c.clearance.eligible, progress: c.progress, clearance: c.clearance };
  }).filter(x => x.eligible || x.decision !== 'Pending' || x.caseReadiness === 'Independent');
  return out;
}

function buildBootstrap_(db, me, today) {
  const out = { me: me, config: appConfig_(), today: today, settings: { keySkillOccasions: db.settings.keySkillOccasions, strandAverageMin: db.settings.strandAverageMin, supervisedEarliestCycle: db.settings.supervisedEarliestCycle, behaviourCycles: db.settings.behaviourCycles, cycles: db.settings.cycles, daysPerCycle: db.settings.daysPerCycle, passScore: db.settings.passScore, maxUploadMb: db.settings.maxUploadMb } };
  if (me.kind === 'none') return out;
  if (me.kind === 'trainee') return traineeBootstrap_(db, me, today, out);
  if (me.kind === 'tl') return tlBootstrap_(db, me, today, out);
  if (me.kind === 'coord') return coordBootstrap_(db, me, today, out);
  return principalBootstrap_(db, me, today, out);
}

/** May this person rate and edit this trainee? Team Leaders of the trainee's own section only (R17). */
const canRate_ = (me, tr) => me.kind === 'tl' && me.section === tr.section;

/** Caseload limits (R22): before Milestone 4 a trainee may carry a few cases and one group; Milestone 4 allows more. */
function caseLimits_(db, tr, calc) {
  const mine = db.supervision.filter(x => x.trainee === tr.email), m4 = !calc.tasks || !db.tasks.some(t => t.active && t.milestone >= 1 && t.milestone <= 3 && calc.tasks[t.id] && !calc.tasks[t.id].passed);
  return { cases: mine.filter(x => x.type === 'Case').length, groups: mine.filter(x => x.type === 'Group').length, maxCases: m4 ? db.settings.maxCasesM4 : db.settings.maxCases, maxGroups: db.settings.maxGroups, milestone4: m4 };
}
