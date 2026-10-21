/** Admin actions: people, and the module itself (topics, tasks, rubrics, resources, settings). */

/* ---------------- People ---------------- */

function checkStaffList_(db, list, what) {
  const out = [];
  (list || []).forEach(e => {
    const email = norm_(e);
    if (!email) return;
    if (!db.staff.some(s => s.email === email)) throw new Error(email + ' is not in the staff list. Add them under Staff first.');
    if (out.indexOf(email) < 0) out.push(email);
  });
  return out;
}
function checkOne_(db, e, what) {
  const email = norm_(e);
  if (!email) return '';
  if (what === 'certifier' && !db.staff.some(s => s.email === email && s.certifies)) throw new Error(email + ' is not a ' + PROGRAMME.words.certifier + '. Tick that box for them under Staff first.');
  if (!db.staff.some(s => s.email === email)) throw new Error(email + ' is not in the staff list. Add them under Staff first.');
  return email;
}
function checkDate_(v) {
  const s = normaliseDate_(v);
  if (!s) throw new Error('Enter the start date as a valid date.');
  return s;
}

/** people: { mentors: [emails], tl: email, certifier: email } */
function enrolTrainee(name, email, people, startDate) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    name = str_(name, 100); email = norm_(email);
    people = people || {};
    if (!name) throw new Error("Enter the trainee's name.");
    if (!email.endsWith('@' + CONFIG.DOMAIN)) throw new Error('Use their @' + CONFIG.DOMAIN + ' email address.');
    if (ctx.db.trainees.some(t => t.email === email)) throw new Error('This person is already enrolled.');
    if (ctx.db.staff.some(s => s.email === email)) throw new Error('This email belongs to a staff member.');
    const tr = { email: email, name: name, assessors: checkStaffList_(ctx.db, people.mentors), tl: checkOne_(ctx.db, people.tl),
                 certifier: checkOne_(ctx.db, people.certifier, 'certifier'), start: checkDate_(startDate || todayIso_()),
                 active: true, confirmed: 'notcertified', confirmedBy: '', confirmedAt: '', confirmNote: '' };
    upsert_('Trainees', [email], traineeRow_(tr));
    logAction_(ctx.me, 'Enrolled trainee', email, '', 'joins ' + tr.start + ', ends ' + addMonths_(tr.start, ctx.db.settings.programmeMonths));
    return getBootstrap();
  });
}

function updateTrainee(email, fields) {
  return withLock_(() => {
    const ctx = context_(email); requireAdmin_(ctx.me);
    const f = fields || {}, tr = ctx.tr;
    if (f.name !== undefined) { tr.name = str_(f.name, 100); if (!tr.name) throw new Error("Enter the trainee's name."); }
    if (f.mentors !== undefined) tr.assessors = checkStaffList_(ctx.db, f.mentors);
    if (f.tl !== undefined) tr.tl = checkOne_(ctx.db, f.tl);
    if (f.certifier !== undefined) tr.certifier = checkOne_(ctx.db, f.certifier, 'certifier');
    if (f.start !== undefined) tr.start = checkDate_(f.start);
    if (f.active !== undefined) tr.active = !!f.active;
    upsert_('Trainees', [tr.email], traineeRow_(tr));
    logAction_(ctx.me, 'Updated trainee', tr.email, '', JSON.stringify(f).slice(0, 300));
    return getBootstrap();
  });
}

function saveStaff(email, name, role, certifies) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    email = norm_(email); name = str_(name, 100);
    if (!email.endsWith('@' + CONFIG.DOMAIN)) throw new Error('Use an @' + CONFIG.DOMAIN + ' email address.');
    if (!name) throw new Error('Enter a name.');
    role = role === 'Admin' ? 'Admin' : 'Assessor';
    if (ctx.db.trainees.some(t => t.email === email)) throw new Error('This email belongs to a trainee.');
    const current = ctx.db.staff.find(s => s.email === email);
    if (current && current.role === 'Admin' && role !== 'Admin' && ctx.db.staff.filter(s => s.role === 'Admin').length < 2) {
      throw new Error('There must always be at least one admin.');
    }
    const cert = certifies === undefined ? !!(current && current.certifies) : !!certifies;
    if (current && current.certifies && !cert) {
      const used = ctx.db.trainees.filter(t => t.active && t.certifier === email);
      if (used.length) throw new Error(name + ' is the ' + PROGRAMME.words.certifier + ' for ' + used.map(t => t.name).join(', ') + '. Choose someone else for them first.');
    }
    upsert_('Staff', [email], [email, name, role, yn_(cert)]);
    logAction_(ctx.me, current ? 'Updated staff' : 'Added staff', '', '', email + ' as ' + role + (cert ? ', ' + PROGRAMME.words.certifier : ''));
    return getBootstrap();
  });
}

function removeStaff(email) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    email = norm_(email);
    const s = ctx.db.staff.find(x => x.email === email);
    if (!s) throw new Error('That person is not on the staff list.');
    if (email === ctx.me.email) throw new Error('You cannot remove yourself.');
    if (s.role === 'Admin' && ctx.db.staff.filter(x => x.role === 'Admin').length < 2) throw new Error('There must always be at least one admin.');
    replaceRows_('Staff', ctx.db.staff.filter(x => x.email !== email).map(x => [x.email, x.name, x.role, yn_(x.certifies)]));
    ctx.db.trainees.filter(t => peopleOf_(t).indexOf(email) > -1).forEach(t => {
      t.assessors = t.assessors.filter(a => a !== email);
      if (t.tl === email) t.tl = '';
      if (t.certifier === email) t.certifier = '';
      upsert_('Trainees', [t.email], traineeRow_(t));
    });
    logAction_(ctx.me, 'Removed staff', '', '', email);
    return getBootstrap();
  });
}

/* ---------------- The module ---------------- */

function saveTopic(topic) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    const t = topic || {};
    const name = str_(t.name, 200), weight = Number(t.w), need = Number(t.need);
    if (!name) throw new Error('Enter a module name.');
    if (!isFinite(weight) || weight < 0 || weight > 100) throw new Error('Weight must be between 0 and 100.');
    if (!isFinite(need) || need < 0 || need > 100) throw new Error('The pass mark must be between 0 and 100.');
    const phase = String(t.phase || ctx.db.phases[0] || '');
    if (ctx.db.phases.indexOf(phase) < 0) throw new Error('Choose one of the phases.');
    const id = t.id ? Number(t.id) : ctx.db.topics.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    if (t.id && !ctx.db.topics.some(x => x.id === id)) throw new Error('That module no longer exists.');
    upsert_('Topics', [id], [id, name, weight, phase, need, str_(t.doc, 200), str_(t.note, 3000)]);
    logAction_(ctx.me, t.id ? 'Edited module' : 'Added module', '', '', id + ' ' + name + ' ' + weight + '%, pass mark ' + need + '%');
    return getBootstrap();
  });
}

function saveTask(task, isNew) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    const t = task || {}, id = str_(t.id, 10);
    if (!/^\d+\.\d+$/.test(id)) throw new Error('Task ID must look like 5.12 (module number, a dot, then a number).');
    const existing = ctx.db.tasks.find(x => x.id === id);
    if (isNew && existing) throw new Error('A task with ID ' + id + ' already exists.');
    if (!isNew && !existing) throw new Error('That task no longer exists.');
    const topic = Number(t.topic), cycle = Number(t.cycle), weight = Number(t.weight), students = Number(t.students || 0);
    if (!ctx.db.topics.some(x => x.id === topic)) throw new Error('Choose a module.');
    if (!(cycle >= 1 && cycle <= ctx.db.settings.cycles && cycle % 1 === 0)) throw new Error('Cycle must be 1 to ' + ctx.db.settings.cycles + '.');
    if (!isFinite(weight) || weight < 0) throw new Error('Weight must be 0 or more.');
    if (TASK_TYPES.indexOf(t.type) < 0) throw new Error('Choose a task type.');
    if (AI_KEYS.indexOf(t.ai) < 0) throw new Error('Choose how AI may be used on this task.');
    if (!(students >= 0 && students <= 10 && students % 1 === 0)) throw new Error('Students needed must be a whole number from 0 to 10.');
    const name = str_(t.name, 200);
    if (!name) throw new Error('Enter the task name.');
    const row = {
      id: id, topic: topic, cycle: cycle, name: name, type: t.type, what: str_(t.what, 3000), evidence: str_(t.evidence, 1000),
      standard: str_(t.standard, 1000), weight: weight, gate: !!t.gate, active: existing ? existing.active : true,
      order: existing ? existing.order : ctx.db.tasks.reduce((m, x) => Math.max(m, x.order), 0) + 1,
      ai: t.ai, real: !!t.real, students: t.real ? Math.max(1, students) : 0, doc: str_(t.doc, 200),
      traineeName: str_(t.traineeName, 200), timeline: !!t.timeline
    };
    upsert_('Tasks', [id], taskToRow_(row));
    logAction_(ctx.me, isNew ? 'Added task' : 'Edited task', '', id, name + (row.gate ? ' (gate)' : ''));
    return getBootstrap();
  });
}

/** Tasks are archived, never deleted, so trainees' past progress is kept. */
function setTaskActive(taskId, active) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    const t = ctx.db.tasks.find(x => x.id === String(taskId).trim());
    if (!t) throw new Error('That task no longer exists.');
    t.active = !!active;
    upsert_('Tasks', [t.id], taskToRow_(t));
    logAction_(ctx.me, active ? 'Restored task' : 'Archived task', '', t.id, t.name);
    return getBootstrap();
  });
}

/** Replaces the rubric of one task. rows: [{group, criterion, evaluated, levels:[4], use}]. */
function saveRubric(taskId, rows) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    const task = ctx.db.tasks.find(x => x.id === String(taskId).trim());
    if (!task) throw new Error('That task no longer exists.');
    const clean = (rows || []).map(r => ({ group: str_(r.group, 3000), criterion: str_(r.criterion, 300), evaluated: str_(r.evaluated, 1500),
      levels: [0, 1, 2, 3].map(i => str_((r.levels || [])[i], 600)), use: r.use === 'reference' ? 'reference' : 'score' })).filter(r => r.criterion);
    if (!clean.some(r => r.use === 'score')) throw new Error('Keep at least one criterion that is used for scoring, or the assessor will have no rubric to score.');
    const keep = ctx.db.rubrics.filter(r => r.task !== task.id);
    const mine = clean.map((r, i) => ({ task: task.id, order: i + 1, use: r.use, group: r.group, criterion: r.criterion, evaluated: r.evaluated, levels: r.levels }));
    const all = keep.concat(mine);
    replaceRows_('Rubrics', all.map(r => [r.task, r.order, r.use, r.group, r.criterion, r.evaluated, r.levels[0], r.levels[1], r.levels[2], r.levels[3]]));
    logAction_(ctx.me, 'Saved rubric', '', task.id, mine.length + ' criteria');
    return getBootstrap();
  });
}

/** Replaces the resources of one scope: a whole module (taskId empty) or one task. */
function saveResources(topicId, taskId, list) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    topicId = Number(topicId); taskId = String(taskId || '').trim();
    const clean = (list || []).map(r => ({ topic: topicId, task: taskId, label: str_(r.label, 200), url: str_(r.url, 1000), note: str_(r.note, 500) }))
      .filter(r => r.label);
    clean.forEach(r => { if (r.url && !/^https?:\/\//i.test(r.url)) throw new Error('Links must start with http:// or https:// (' + r.label + ').'); });
    const keep = ctx.db.resources.filter(r => !(r.topic === topicId && r.task === taskId));
    replaceRows_('Resources', keep.concat(clean).sort((a, b) => a.topic - b.topic).map(r => [r.topic, r.task, r.label, r.url, r.note]));
    logAction_(ctx.me, 'Saved resources', '', taskId, 'Module ' + topicId + ', ' + clean.length + ' items');
    return getBootstrap();
  });
}

/** phases: [{name, old}]. When a phase is renamed, the modules in it follow. */
function saveSettings(settings, phases) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    const s = settings || {}, limits = { cycles: [1, 30], daysPerCycle: [1, 12], programmeMonths: [1, 12], passScore: [2, 4], reattempts: [0, 5], maxUploadMb: [1, 25] };
    const next = {};
    Object.keys(limits).forEach(k => {
      const n = Number(s[k]);
      if (!isFinite(n) || n % 1 !== 0 || n < limits[k][0] || n > limits[k][1]) throw new Error(k + ' must be a whole number from ' + limits[k][0] + ' to ' + limits[k][1] + '.');
      next[k] = n;
    });
    const ph = (phases || []).map(p => ({ name: str_(p.name, 100), old: String(p.old || '') }));
    if (!ph.length || ph.some(p => !p.name)) throw new Error('Every phase needs a name.');
    if (new Set(ph.map(p => p.name)).size !== ph.length) throw new Error('Phase names must be different from each other.');
    const names = ph.map(p => p.name), renamed = {};
    ph.forEach(p => { if (p.old && p.old !== p.name) renamed[p.old] = p.name; });
    ctx.db.topics.forEach(t => {
      const now = renamed[t.phase] || t.phase;
      if (names.indexOf(now) < 0) throw new Error('Module ' + t.id + ' is in the phase "' + t.phase + '", which would be removed. Move it to another phase first.');
      if (now !== t.phase) upsert_('Topics', [t.id], [t.id, t.name, t.weight, now, t.threshold, t.doc, t.note]);
    });
    replaceRows_('Settings', Object.keys(next).map(k => [k, next[k], SETTING_HELP[k] || '']));
    replaceRows_('Phases', names.map(n => [n]));
    logAction_(ctx.me, 'Saved settings', '', '', JSON.stringify(next));
    return getBootstrap();
  });
}
