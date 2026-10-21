/**
 * One-time import of the task list from the counsellors' workbook (FS_Counsellor_Training_App_Workbook_v17).
 * After the import the app is the only master copy (Team Leaders' decision, 21 October 2026).
 *
 * buildImport_() is a pure function over the workbook's values, so it can be tested without Google.
 */

const NUMERIC_TASK_KEYS = ['dueOverride', 'maxReworks', 'effort'];

function cellText_(v) {
  if (v == null || Object.prototype.toString.call(v) === '[object Date]') return '';
  return String(v).replace(/\s+$/, '');
}

/** wb = { 'Task Catalogue': [[header...], [row...]], 'Milestones': [...], 'Key Skills': [...], 'Toolkit': [...], 'Rubrics': [...] } */
function buildImport_(wb) {
  const grid = name => (wb[name] || []).map(r => r.map(cellText_));
  const tc = grid('Task Catalogue');
  if (tc.length < 2) throw new Error("The workbook has no 'Task Catalogue' tab with rows in it.");
  const hdr = tc[0].map(h => h.trim()), idx = TASK_HEADERS.map(h => hdr.indexOf(h)), warnings = [];
  TASK_HEADERS.forEach((h, i) => { if (idx[i] < 0) warnings.push("The Task Catalogue has no column called '" + h + "'."); });
  const taskRows = tc.slice(1).filter(r => (idx[0] < 0 ? '' : String(r[idx[0]])).trim() !== '').map(r => TASK_HEADERS.map((h, i) => {
    let v = idx[i] < 0 ? '' : r[idx[i]];
    if (NUMERIC_TASK_KEYS.indexOf(TASK_KEYS[i]) > -1 && /^-?\d+\.0+$/.test(v)) v = v.replace(/\.0+$/, '');
    if (TASK_KEYS[i] === 'milestoneDeadline') v = '';           // the app works this out from the Milestones table
    return v;
  }));

  const pick = (name, test, h) => {
    const g = grid(name); if (g.length < 2) return { rows: [], idx: [] };
    const head = g[0].map(x => x.trim()), ix = h.map(c => head.indexOf(c));
    return { rows: g.slice(1).filter(r => test.test(String(r[0] || '').trim())), idx: ix };
  };
  const col = (r, ix, i) => ix[i] < 0 || r[ix[i]] == null ? '' : r[ix[i]];
  const ms = pick('Milestones', /^Milestone\s*\d+$/i, ['Milestone', 'Deadline (Cycle)', 'Main focus', 'Case Readiness possible']);
  const milestones = ms.rows.map(r => {
    const n = Number(String(r[0]).replace(/\D/g, ''));
    return [r[0], MILESTONE_DEADLINES[n] || col(r, ms.idx, 1), col(r, ms.idx, 2), col(r, ms.idx, 3)];
  });
  const kk = pick('Key Skills', /^Key Skill\s*\d+$/i, SHEETS.KeySkills), keySkills = kk.rows.map(r => SHEETS.KeySkills.map((h, i) => col(r, kk.idx, i)));
  const tk = pick('Toolkit', /^Tool\s*\d+$/i, SHEETS.Toolkit), toolkit = tk.rows.map(r => SHEETS.Toolkit.map((h, i) => col(r, tk.idx, i)));
  // the rubric's name is written only on the first row of each group, so carry it down
  const rb = pick('Rubrics', /^/, SHEETS.Rubrics); let rubricName = '';
  const rubrics = rb.rows.map(r => {
    const row = SHEETS.Rubrics.map((h, i) => col(r, rb.idx, i));
    if (row[0].trim()) rubricName = row[0].trim(); else row[0] = rubricName;
    return row;
  }).filter(r => r[1].trim());

  const raw = taskRows.map(r => { const o = {}; TASK_KEYS.forEach((k, i) => { o[k] = r[i]; }); return o; });
  return {
    tasks: taskRows, milestones: milestones, keySkills: keySkills, toolkit: toolkit, rubrics: rubrics,
    warnings: warnings.concat(validateCatalogue_(raw, keySkills)),
    counts: { tasks: taskRows.length, active: raw.filter(o => yes_(o.active)).length, milestones: milestones.length, keySkills: keySkills.length, toolkit: toolkit.length, rubrics: rubrics.length }
  };
}

/** Things in a task list that would silently break the app. Returns readable warnings. */
function validateCatalogue_(raw, keySkills) {
  const w = [], ids = {}, active = raw.filter(o => yes_(o.active));
  raw.forEach(o => { if (ids[o.id]) w.push('Task ID ' + o.id + ' appears more than once.'); ids[o.id] = o; });
  const activeIds = {}; active.forEach(o => { activeIds[o.id] = true; });
  active.forEach(o => {
    idList_(o.prereq).forEach(p => {
      if (!ids[p]) w.push(o.id + ' has prerequisite ' + p + ', which is not in the task list.');
      else if (!activeIds[p]) w.push(o.id + ' has prerequisite ' + p + ', which is retired (it is ignored).');
    });
    if (!/^Milestone\s*[1-4]$/i.test(o.milestone)) w.push(o.id + ' has no valid milestone (' + o.milestone + ').');
    if (STRANDS.indexOf(o.strand) < 0) w.push(o.id + ' has an unrecognised strand (' + o.strand + ').');
    if (blank_(o.ratingMethod)) w.push(o.id + ' has no rating method.');
    if (yes_(o.gate) && yes_(o.fastTrack)) w.push(o.id + ' is both a critical gate and fast-track eligible. Gates are never fast-tracked, so fast-track is ignored.');
    if (yes_(o.fastTrack) && AREAS.indexOf(o.entryArea) < 0) w.push(o.id + ' is fast-track eligible but its entry check area is not recognised (' + o.entryArea + ').');
  });
  (keySkills || []).forEach(k => idList_(k[2]).forEach(id => { if (!activeIds[id]) w.push(k[0] + ' is linked to ' + id + ', which is not an active task.'); }));
  // a prerequisite loop would lock those tasks for ever
  const state = {};
  const visit = (id, path) => {
    if (state[id] === 2) return; if (state[id] === 1) { w.push('Prerequisites loop: ' + path.concat(id).join(' > ') + '. These tasks could never unlock.'); return; }
    state[id] = 1; idList_((ids[id] || {}).prereq).filter(p => activeIds[p]).forEach(p => visit(p, path.concat(id))); state[id] = 2;
  };
  active.forEach(o => visit(o.id, []));
  return w.filter(Boolean);
}
