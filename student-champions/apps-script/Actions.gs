/** What trainees and assessors do: submit work, upload evidence, assess, plan, certify. Rules live in Logic.gs. */

/* ---------------- Trainee actions ---------------- */

/** action: 'save' keeps the work in progress, 'submit' sends it for review. Typed answers and reflection are saved by autosaveTask. */
function saveMyTask(taskId, action, evidence) {
  return withLock_(() => {
    const ctx = traineeContext_('submit their own tasks');
    const task = taskOf_(ctx.db, taskId);
    const p = progressOf_(ctx.db, ctx.me.email, task.id);
    if (EDITABLE_STATES.indexOf(p.status) < 0) throw new Error('This task has already been submitted or completed.');
    if (evidence !== undefined && evidence !== null) p.evidence = str_(evidence, 1000);
    if (action === 'submit') {
      const pr = promptsFor_(ctx.db, task), work = readWork_(ctx.me.email, task.id);
      const problem = submitProblem_(task, pr, work, p);
      if (problem) throw new Error(problem);
      p.answered = filled_(work.a, pr.answers); p.reflected = filled_(work.r, pr.reflection);
      if (task.real) {
        const have = ctx.db.checklists.filter(c => c.trainee === ctx.me.email && c.task === task.id).length;
        if (have < Math.max(1, task.students)) {
          throw new Error('Complete the consent checklist for ' + Math.max(1, task.students) + ' student' + (task.students > 1 ? 's' : '') + ' before you submit this task (you have ' + have + ').');
        }
      }
      if (p.failed >= failedAllowed_(ctx.db.settings, p)) {
        throw new Error('You have used the reattempts allowed for this task. Talk to your TL or mentor; an admin can allow another.');
      }
      p.status = 'submitted'; p.submitted = nowStamp_();
    } else if (p.status === 'not') {
      p.status = 'progress';
    }
    p.updated = nowStamp_();
    saveProgress_(p);
    logAction_(ctx.me, action === 'submit' ? 'Submitted' : 'Saved', ctx.me.email, task.id, '');
    return getBootstrap();
  });
}

/** One checklist per real student, before the task begins. The student is only ever a code the trainee chooses; no particular format is required. */
function saveChecklist(taskId, studentCode, ticked) {
  return withLock_(() => {
    const ctx = traineeContext_('complete a consent checklist');
    const task = taskOf_(ctx.db, taskId);
    const code = validateChecklist_(task.id, studentCode, ticked, task);
    if (ctx.db.checklists.some(c => c.trainee === ctx.me.email && c.task === task.id && c.code.toLowerCase() === code.toLowerCase())) {
      throw new Error('You already completed the checklist for ' + code + ' on this task.');
    }
    append_('Checklists', [ctx.me.email, task.id, code, todayIso_()]);
    logAction_(ctx.me, 'Consent checklist', ctx.me.email, task.id, code);
    return getBootstrap();
  });
}

function uploadEvidence(taskId, fileName, mimeType, base64) {
  return withLock_(() => {
    const ctx = traineeContext_('upload evidence');
    const task = taskOf_(ctx.db, taskId);
    const p = progressOf_(ctx.db, ctx.me.email, task.id);
    if (EDITABLE_STATES.indexOf(p.status) < 0) throw new Error('This task has already been submitted or completed.');
    if (!extOk_(fileName)) throw new Error('That file type is not allowed. Use PDF, Office documents, images, text, mp3, m4a or mp4.');
    if (p.files.length >= CONFIG.MAX_FILES_PER_TASK) throw new Error('You can attach up to ' + CONFIG.MAX_FILES_PER_TASK + ' files to one task.');
    const bytes = Utilities.base64Decode(String(base64 || ''));
    if (!bytes.length) throw new Error('That file is empty.');
    if (bytes.length > ctx.db.settings.maxUploadMb * 1024 * 1024) throw new Error('That file is larger than ' + ctx.db.settings.maxUploadMb + ' MB. Share a link instead.');

    const clean = safeFileName_(fileName);
    const blob = Utilities.newBlob(bytes, String(mimeType || 'application/octet-stream'), task.id + ' - ' + clean);
    const file = traineeFolder_(ctx.me.email).createFile(blob);
    p.files.push({ id: file.getId(), name: clean, size: bytes.length, at: nowStamp_() });
    if (p.status === 'not') p.status = 'progress';
    p.updated = nowStamp_();
    saveProgress_(p);
    logAction_(ctx.me, 'Uploaded file', ctx.me.email, task.id, clean);
    return getBootstrap();
  });
}

function removeEvidence(taskId, fileId) {
  return withLock_(() => {
    const ctx = traineeContext_('remove their evidence');
    const task = taskOf_(ctx.db, taskId);
    const p = progressOf_(ctx.db, ctx.me.email, task.id);
    if (EDITABLE_STATES.indexOf(p.status) < 0) throw new Error('This task has already been submitted or completed.');
    const f = p.files.find(x => x.id === fileId);
    if (!f) throw new Error('That file is not attached to this task.');
    p.files = p.files.filter(x => x.id !== fileId);
    p.updated = nowStamp_();
    saveProgress_(p);
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* already gone */ }
    logAction_(ctx.me, 'Removed file', ctx.me.email, task.id, f.name);
    return getBootstrap();
  });
}

/** Sends a stored evidence file to the page. Only the trainee and their mentors, TL, certifying mentor and admins can fetch it. */
function getEvidenceFile(traineeEmail, taskId, fileId) {
  const ctx = context_(traineeEmail);
  const p = progressOf_(ctx.db, ctx.tr.email, String(taskId).trim());
  const f = p.files.find(x => x.id === fileId);
  if (!f) throw new Error('That file is not attached to this task.');
  const blob = DriveApp.getFileById(fileId).getBlob();
  return { name: f.name, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/* ---------------- Mentor, TL and admin actions ---------------- */

/**
 * Records a decision on any task, whether or not the trainee has submitted it (viva, role play, observed session).
 * input: { exempt, criteria: {order: score}, score, feedback, critical: {type} }
 */
function assessTask(traineeEmail, taskId, input) {
  return withLock_(() => {
    const ctx = context_(traineeEmail); requireStaff_(ctx.me);
    const task = taskOf_(ctx.db, taskId);
    const rows = ctx.db.rubrics.filter(r => r.task === task.id && r.use === 'score');
    const v = validateAssessment_(task, rows, input || {}, ctx.db.settings);
    const p = progressOf_(ctx.db, ctx.tr.email, task.id);
    const before = p.status + (p.score ? ' ' + p.score : '');
    const wasOpen = p.status === 'partial' || p.status === 'rework';
    if ((v.status === 'partial' || v.status === 'rework') && !wasOpen) p.failed = (p.failed || 0) + 1;   // a new attempt that did not meet the criteria
    p.status = v.status; p.score = v.score === '' ? null : v.score; p.feedback = v.feedback;
    p.criteria = v.criteria; p.critical = v.critical;
    p.assessor = ctx.me.name || ctx.me.email; p.date = todayIso_(); p.updated = nowStamp_();
    saveProgress_(p);
    logAction_(ctx.me, v.critical ? 'Critical error' : 'Assessed', ctx.tr.email, task.id,
      before + ' -> ' + v.status + (v.score === '' ? '' : ' ' + v.score) + (v.critical ? ' (' + v.critical + ')' : ''));
    return getBootstrap();
  });
}

/** The deadline agreed with the trainee, whether they may use AI on this task (the default comes from the task), and their timeline (5.2). */
function setTaskPlan(traineeEmail, taskId, due, ai, timeline) {
  return withLock_(() => {
    const ctx = context_(traineeEmail); requireStaff_(ctx.me);
    const task = taskOf_(ctx.db, taskId);
    const p = progressOf_(ctx.db, ctx.tr.email, task.id);
    p.due = validateDue_(due);
    ai = String(ai || '');
    if (ai !== '' && AI_KEYS.indexOf(ai) < 0) throw new Error('Choose how AI may be used on this task.');
    p.ai = ai;
    if (timeline !== undefined && timeline !== null) p.timeline = str_(timeline, 3000);
    p.updated = nowStamp_();
    saveProgress_(p);
    logAction_(ctx.me, 'Task plan', ctx.tr.email, task.id, 'due ' + (p.due || 'none') + ', AI ' + (p.ai || 'task default'));
    return getBootstrap();
  });
}

/** After the reattempts allowed are used, an admin can allow one more for this task. */
function grantReattempt(traineeEmail, taskId) {
  return withLock_(() => {
    const ctx = context_(traineeEmail); requireAdmin_(ctx.me);
    const task = taskOf_(ctx.db, taskId);
    const p = progressOf_(ctx.db, ctx.tr.email, task.id);
    p.extra = (p.extra || 0) + 1; p.updated = nowStamp_();
    saveProgress_(p);
    logAction_(ctx.me, 'Extra reattempt', ctx.tr.email, task.id, 'now ' + failedAllowed_(ctx.db.settings, p) + ' attempts');
    return getBootstrap();
  });
}

/** Records the certification decision. The computed eligibility is a recommendation; a Certifying Mentor confirms it. */
function confirmCertification(traineeEmail, level, note) {
  return withLock_(() => {
    const ctx = context_(traineeEmail); requireStaff_(ctx.me);
    const stats = statsForTrainee_(ctx.db, ctx.tr.email, todayIso_());
    validateCertification_(level, stats, ctx.me);
    ctx.tr.confirmed = level; ctx.tr.confirmedBy = ctx.me.name || ctx.me.email;
    ctx.tr.confirmedAt = todayIso_(); ctx.tr.confirmNote = str_(note, 500);
    upsert_('Trainees', [ctx.tr.email], traineeRow_(ctx.tr));
    logAction_(ctx.me, 'Certification', ctx.tr.email, '', level + (note ? ': ' + str_(note, 200) : ''));
    return getBootstrap();
  });
}
