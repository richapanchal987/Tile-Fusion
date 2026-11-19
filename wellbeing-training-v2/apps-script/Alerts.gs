/**
 * "Needs attention" lists (R22-R25) and content review flags (R29). Computed on the server from the same rules as everything else,
 * and shown inside the app only. Each alert is { level: 'bad' | 'warn' | 'info', text, go: { view, trainee?, task? } }.
 * Alerts never contain student information; a trainee only ever gets their own.
 */

const alert_ = (level, text, go) => ({ level: level, text: text, go: go || null });
const dayOf_ = stamp => String(stamp || '').slice(0, 10);

function traineeAlerts_(db, tr, calc, today) {
  const out = [], list = ids => ids.slice(0, 3).map(id => id + ' ' + titleOf_(db, id)).join(', ') + (ids.length > 3 ? ' and ' + (ids.length - 3) + ' more' : '');
  if (calc.overdue.length) out.push(alert_('bad', 'Overdue: ' + list(calc.overdue), { view: 'tasks' }));
  if (calc.dueSoon.length) out.push(alert_('warn', 'Due soon: ' + list(calc.dueSoon), { view: 'tasks' }));
  db.attempts.filter(a => a.trainee === tr.email && a.status === 'Rated' && a.released && a.reworkRequired && a.reworkDue && !calc.tasks[a.task].passed && calc.tasks[a.task].status === 'rework').forEach(a => {
    out.push(alert_(a.reworkDue < today ? 'bad' : 'warn', 'Rework for ' + a.task + ' ' + titleOf_(db, a.task) + (a.reworkDue < today ? ' was due ' : ' is due ') + a.reworkDue, { view: 'task', task: a.task }));
  });
  const acks = db.acks[tr.email] || [];
  const stale = db.policies.filter(p => { const m = acks.filter(x => x.policy === p.name).sort((x, y) => y.at.localeCompare(x.at))[0]; return !m || (p.updated && m.updated !== p.updated); });
  if (stale.length) out.push(alert_('warn', stale.length + ' polic' + (stale.length === 1 ? 'y' : 'ies') + ' to read and acknowledge', { view: 'policies' }));
  return out;
}

function tlAlerts_(db, me, today) {
  const out = [], wait = db.settings.reviewWaitDays, hol = db.holidays;
  db.trainees.filter(tr => tr.section === me.section && tr.status !== 'Completed' && tr.status !== 'Left').forEach(tr => {
    const calc = computeFor_(db, tr, today), nm = tr.name;
    db.attempts.filter(a => a.trainee === tr.email).forEach(a => {
      const d = dayOf_(a.status === 'Rated' ? a.assessed : a.submitted);
      if ((a.status === 'Submitted' || (a.status === 'Rated' && !a.released)) && d && workingDaysBetween_(d, today, hol) > wait)
        out.push(alert_('warn', nm + ': ' + a.task + ' ' + titleOf_(db, a.task) + (a.status === 'Submitted' ? ' has waited ' : ' was rated but not released for ') + workingDaysBetween_(d, today, hol) + ' working days', { view: 'reviews', attempt: a.id }));
    });
    if (calc.clearance.openFlags.length) out.push(alert_('bad', nm + ' has an open Safety Flag on ' + calc.clearance.openFlags.join(', '), { view: 'flags' }));
    if (calc.overdue.length) out.push(alert_('warn', nm + ' has ' + calc.overdue.length + ' overdue task' + (calc.overdue.length === 1 ? '' : 's'), { view: 'trainee', trainee: tr.email }));
    if (calc.supervised.eligible) out.push(alert_('info', nm + ' is eligible for Supervised Practice', { view: 'trainee', trainee: tr.email }));
    if (calc.clearance.eligible && !/^cleared/i.test(tr.decision)) out.push(alert_('info', nm + ' meets every clearance check', { view: 'trainee', trainee: tr.email }));
    const cyc = Math.min(calc.cycle, db.settings.cycles);
    if (cyc >= 1 && cyc > 1 && !(db.behaviour[tr.email] || []).some(b => b.cycle === cyc - 1 && b.released)) out.push(alert_('info', nm + ': no released behaviour rating for cycle ' + (cyc - 1), { view: 'trainee', trainee: tr.email }));
  });
  const flags = contentFlags_(db).length;
  if (flags) out.push(alert_('info', flags + ' task' + (flags === 1 ? '' : 's') + ' need a content check', { view: 'catalogue' }));
  return out;
}

function coordAlerts_(db, me, today) {
  const out = [], wait = db.settings.reviewWaitDays, joint = {};
  db.tasks.filter(t => t.joint).forEach(t => { joint[t.id] = t; });
  db.attempts.filter(a => joint[a.task] && a.status === 'Rated' && ratingMeets_(joint[a.task], a) && blank_(a.processConfirmed)).forEach(a => {
    const d = dayOf_(a.assessed), n = d ? workingDaysBetween_(d, today, db.holidays) : 0;
    out.push(alert_(n > wait ? 'warn' : 'info', 'Confirm the process for ' + a.task + ' ' + titleOf_(db, a.task) + (n > wait ? ' (waiting ' + n + ' working days)' : ''), { view: 'confirm' }));
  });
  if (!db.settings.importedAt) out.push(alert_('warn', 'The task list has not been imported yet', { view: 'admin' }));
  else if (!db.links.length) out.push(alert_('info', 'No task links have been imported yet', { view: 'admin' }));
  const unlinked = db.policies.filter(p => !p.link).length;
  if (unlinked) out.push(alert_('info', unlinked + ' polic' + (unlinked === 1 ? 'y has' : 'ies have') + ' no link yet', { view: 'admin' }));
  return out;
}

function principalAlerts_(db, me, today) {
  return db.trainees.filter(tr => tr.section === me.section && /^cleared/i.test(tr.decision) && !tr.signoffDate && computeFor_(db, tr, today).clearance.eligible)
    .map(tr => alert_('warn', tr.name + ' is cleared by the Team Leader and waits for your sign-off', { view: 'clear' }));
}

/** R29: tasks whose content needs a look. Trainees never see these. */
function contentFlags_(db) {
  const out = [];
  db.tasks.filter(t => t.active).forEach(t => {
    const why = [], r = t.raw, hasLinks = db.links.some(l => l.task === t.id && l.url);
    if (t.soon) why.push('Marked "Needs school input"');
    if (!blank_(r.actionNeeded)) why.push('Action needed: ' + str_(r.actionNeeded, 140));
    if (blank_(r.learn) && blank_(r.inApp) && blank_(r.traineeLink) && !hasLinks) why.push('No learning content or links yet');
    if (why.length) out.push({ id: t.id, title: t.title, status: t.contentStatus, reasons: why });
  });
  return out;
}

function alertsFor_(db, me, tr, calc, today) {
  const list = me.kind === 'trainee' ? traineeAlerts_(db, tr, calc, today) : me.kind === 'tl' ? tlAlerts_(db, me, today) : me.kind === 'coord' ? coordAlerts_(db, me, today) : principalAlerts_(db, me, today);
  const rank = { bad: 0, warn: 1, info: 2 };
  return list.sort((a, b) => rank[a.level] - rank[b.level]);
}
