/**
 * What a trainee can do. Every action reloads the database and re-checks the rules on the server (R4-R6, R12, R26, R27).
 * Each returns the trainee's fresh bootstrap so the page redraws from the truth.
 */

const BLOCKED_EXT = /\.(mp3|m4a|wav|aac|ogg|mp4|mov|avi|mkv|webm|3gp|wmv)$/i;     // R27: no audio or video of real students
const ALLOWED_EXT = /\.(pdf|docx?|xlsx?|pptx?|txt|rtf|odt|csv|png|jpe?g|gif|webp)$/i;
const safeFileName_ = n => String(n || 'file').replace(/[\\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 120);
const needsEvidence_ = t => !blank_(t.raw.evidenceRequired) && !/^(no|none|n\/a|not required)\b/i.test(t.raw.evidenceRequired);

function myDraft_(c, taskId) {
  return c.db.attempts.find(a => a.trainee === c.tr.email && a.task === taskId && a.status === 'Draft') ||
    { id: newId_('A'), trainee: c.tr.email, task: taskId, no: null, status: 'Draft', source: 'Trainee', submitted: '', evidence: '', files: [], anon: false, reflection: '',
      question: '', hours: null, obsType: '', version: '', assessed: '', score: '', rubric: {}, flag: false, flagNote: '', feedback: '', goal: '', reworkRequired: false,
      reworkDue: '', processConfirmed: '', processDate: '', processNote: '', processBy: '', released: false, assessedBy: '', tlNotes: '', seen: false };
}
function openTask_(c, taskId) {
  const t = taskOf_(c.db, taskId), st = computeFor_(c.db, c.tr, c.today).tasks[t.id];
  if (!st.canSubmit) throw new Error(st.status === 'soon' ? 'This task is coming soon. It is not open yet.' : st.status === 'locked' ? 'This task is still locked.' : 'This task is not open for new work.');
  return { t: t, st: st };
}
function applyDraftFields_(a, f) {
  if (f.evidence !== undefined) a.evidence = str_(f.evidence, 1000);
  if (f.reflection !== undefined) a.reflection = str_(f.reflection, 8000);
  if (f.question !== undefined) a.question = str_(f.question, 2000);
  if (f.hours !== undefined) { const h = blank_(f.hours) ? null : num_(f.hours, null); if (h !== null && (h < 0 || h > 200)) throw new Error('Hours spent should be a number between 0 and 200.'); a.hours = h; }
  if (f.anon !== undefined) a.anon = !!f.anon;
}

function saveDraft(taskId, fields) {
  return withLock_(() => {
    const c = traineeCtx_('save work'); const o = openTask_(c, String(taskId).trim());
    const a = myDraft_(c, o.t.id); applyDraftFields_(a, fields || {}); saveAttempt_(a);
    return getBootstrap();
  });
}

function uploadEvidence(taskId, fileName, mimeType, base64) {
  return withLock_(() => {
    const c = traineeCtx_('upload evidence'); const o = openTask_(c, String(taskId).trim());
    const name = safeFileName_(fileName);
    if (BLOCKED_EXT.test(name) || /^(audio|video)\//i.test(String(mimeType || ''))) throw new Error('Audio and video of real students are not allowed. Upload a written summary instead.');
    if (!ALLOWED_EXT.test(name)) throw new Error('That file type is not allowed. Use PDF, Office documents, text or images.');
    const a = myDraft_(c, o.t.id);
    if (a.files.length >= 5) throw new Error('You can attach up to 5 files to one attempt.');
    const bytes = Utilities.base64Decode(String(base64 || ''));
    if (!bytes.length) throw new Error('That file is empty.');
    if (bytes.length > c.db.settings.maxUploadMb * 1024 * 1024) throw new Error('That file is larger than ' + c.db.settings.maxUploadMb + ' MB. Share a link instead.');
    const file = traineeFolder_(c.tr.email).createFile(Utilities.newBlob(bytes, String(mimeType || 'application/octet-stream'), o.t.id + ' - ' + name));
    a.files.push({ id: file.getId(), name: name, size: bytes.length, at: nowStamp_() });
    saveAttempt_(a);
    return getBootstrap();
  });
}

function removeEvidence(taskId, fileId) {
  return withLock_(() => {
    const c = traineeCtx_('remove evidence'); const t = taskOf_(c.db, taskId);
    const a = c.db.attempts.find(x => x.trainee === c.tr.email && x.task === t.id && x.status === 'Draft');
    const f = a && a.files.find(x => x.id === fileId);
    if (!f) throw new Error('That file is not attached to a draft of this task.');
    a.files = a.files.filter(x => x.id !== fileId); saveAttempt_(a);
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* already gone */ }
    return getBootstrap();
  });
}

/** R26: the anonymisation tick is required; evidence (a link or a file) is required when the task asks for it. R9: hours are asked on every submission. */
function submitAttempt(taskId, fields) {
  return withLock_(() => {
    const c = traineeCtx_('submit work'); const o = openTask_(c, String(taskId).trim());
    const a = myDraft_(c, o.t.id); applyDraftFields_(a, fields || {});
    if (!a.anon) throw new Error('Please confirm that the evidence is anonymised before you submit.');
    if (needsEvidence_(o.t) && blank_(a.evidence) && !a.files.length) throw new Error('This task needs evidence. Add a link or upload a file.');
    if (a.hours === null) throw new Error('Please say roughly how many hours this took.');
    a.status = 'Submitted'; a.no = o.st.used + 1; a.version = o.st.nextVersion; a.submitted = nowStamp_();
    saveAttempt_(a);
    logChange_(c.me, 'Attempts', a.id, 'submitted', '', o.t.id + ' attempt ' + a.no);
    return getBootstrap();
  });
}

/** Staff may open evidence: the trainee's own Team Leader (either section, read-only cover), the Coordinator on joint tasks. */
function getEvidenceFile(attemptId, fileId) {
  const c = ctx_(), a = attemptOf_(c.db, attemptId);
  const t = c.db.tasks.find(x => x.id === a.task) || {};
  const ok = c.me.kind === 'trainee' ? a.trainee === c.me.email : c.me.kind === 'tl' ? true : c.me.kind === 'coord' ? !!t.joint && a.status !== 'Draft' : false;
  if (!ok) throw new Error('You do not have access to this file.');
  const f = a.files.find(x => x.id === fileId);
  if (!f) throw new Error('That file is not attached to this attempt.');
  const blob = DriveApp.getFileById(fileId).getBlob();
  return { name: f.name, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

function markSeen(attemptId) {
  return withLock_(() => {
    const c = ctx_(); const a = attemptOf_(c.db, attemptId);
    if (c.me.kind !== 'trainee' || a.trainee !== c.me.email) throw new Error('This is not your attempt.');
    if (a.status === 'Rated' && a.released && !a.seen) { a.seen = true; saveAttempt_(a); }
    return getBootstrap();
  });
}

function acknowledgePolicy(name) {
  return withLock_(() => {
    const c = traineeCtx_('acknowledge a policy'); const p = c.db.policies.find(x => x.name === name);
    if (!p) throw new Error('That policy was not found.');
    appendRow_('PolicyAcks', [c.tr.email, p.name, p.updated, nowStamp_()]);
    return getBootstrap();
  });
}

function savePlannedDate(taskId, date) {
  return withLock_(() => {
    const c = traineeCtx_('plan a task'); const t = taskOf_(c.db, taskId), iso = blank_(date) ? '' : normaliseDate_(date);
    if (!blank_(date) && !iso) throw new Error('That date is not valid.');
    const cur = (c.db.taskDates[c.tr.email] || {})[t.id] || {};
    upsert_('TaskDates', [0, 1], [c.tr.email, t.id], [c.tr.email, t.id, iso, cur.dueOverride || '']);
    return getBootstrap();
  });
}

/** R20: the trainee rates themselves on the six behaviour items for the current cycle; the Team Leader's rating is separate. */
function saveSelfRating(cycle, items) {
  return withLock_(() => {
    const c = traineeCtx_('rate yourself'); const cy = num_(cycle, 0);
    if (cy < 1 || cy > c.db.settings.cycles) throw new Error('That cycle is not valid.');
    const self = (items || []).slice(0, 6).map(x => { const n = num_(x, 0); return n >= 1 && n <= 4 ? n : null; });
    while (self.length < 6) self.push(null);
    const b = (c.db.behaviour[c.tr.email] || []).find(x => x.cycle === cy) || { trainee: c.tr.email, cycle: cy, items: [null, null, null, null, null, null], comments: '', goal: '', reliability: '', self: [], released: false, tlNotes: '' };
    b.self = self; upsert_('Behaviour', [0, 1], [b.trainee, cy], behaviourToRow_(b));
    return getBootstrap();
  });
}
