/** Typed answers, reflection, autosave and review comments. Rules are in Logic.gs; storage in Store.gs. */

const ANSWER_MAX = 6000;                          // characters in one box
const WORK_KEY = /^[ar]-[a-z0-9-]{1,40}$/;

/**
 * Saves what the trainee has typed, a few seconds after they stop typing. Sends back very little, so it is quick.
 * data: { evidence: 'link', a: {key: text}, r: {key: text} } (only what changed)
 */
function autosaveTask(taskId, data) {
  return withLock_(() => {
    const ctx = traineeContext_('save their own work');
    const task = taskOf_(ctx.db, taskId);
    const p = progressOf_(ctx.db, ctx.me.email, task.id);
    if (EDITABLE_STATES.indexOf(p.status) < 0) throw new Error('This task has already been submitted or completed, so it cannot be changed.');
    data = data || {};
    const work = readWork_(ctx.me.email, task.id);
    ['a', 'r'].forEach(kind => Object.keys(data[kind] || {}).forEach(k => {
      if (!WORK_KEY.test(k)) return;
      work[kind][k] = str_(data[kind][k], ANSWER_MAX);
      if (!work[kind][k]) delete work[kind][k];
    }));
    const at = nowStamp_();
    work.at = at;
    writeWork_(ctx.me.email, task.id, work);
    const pr = promptsFor_(ctx.db, task);
    if (data.evidence !== undefined) p.evidence = str_(data.evidence, 1000);
    if (p.status === 'not') p.status = 'progress';
    p.answered = filled_(work.a, pr.answers); p.reflected = filled_(work.r, pr.reflection); p.updated = at;
    saveProgress_(p);
    return { at: at, answered: p.answered, reflected: p.reflected, status: p.status };
  });
}

/** A task's typed answers and reflection, with the questions they answer. For the trainee and the people who can see them. */
function getTaskWork(traineeEmail, taskId) {
  const ctx = context_(traineeEmail);
  const task = ctx.db.tasks.find(x => x.id === String(taskId).trim());
  if (!task) throw new Error('That task is not part of the programme.');
  const work = readWork_(ctx.tr.email, task.id), pr = promptsFor_(ctx.db, task);
  return { a: work.a, r: work.r, at: work.at, answers: pr.answers, reflection: pr.reflection };
}

/** A mentor, TL, certifying mentor or admin adds a review comment on a task. The trainee can read it. */
function addComment(traineeEmail, taskId, text) {
  return withLock_(() => {
    const ctx = context_(traineeEmail); requireStaff_(ctx.me);
    const task = taskOf_(ctx.db, taskId);
    text = str_(text, 3000);
    if (!text) throw new Error('Write a comment first.');
    append_('Comments', [nowStamp_(), ctx.tr.email, task.id, ctx.me.email, ctx.me.name || ctx.me.email, text]);
    logAction_(ctx.me, 'Comment', ctx.tr.email, task.id, text.slice(0, 200));
    return getBootstrap();
  });
}
