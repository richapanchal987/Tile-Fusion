/**
 * One-off updates for a Sheet that was set up before a change. Each is safe to run more than once.
 * Run from the Apps Script editor: choose the function, press Run.
 */

/** October 2026: the team's changes to the Student Champion module (evidence wording, 4.2 title, RMC, 5.2 timeline, guidebooks removed). */
function applyTeamChangesOct2026() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || ss_();
  const caller = norm_(Session.getActiveUser().getEmail());
  if (caller && !readStaff_().some(s => s.email === caller && s.role === 'Admin')) throw new Error('Only an admin can run this.');
  ensureSheets_(ss);                                   // the new tabs (Prompts, Answers, Comments) and the new columns
  clearCache_();
  const CHANGES = {
    '1.1': { evidence: 'Role summary and your questions for the TL' },
    '1.2': { evidence: 'Case Studies 01 responses' },
    '1.3': { evidence: 'Case Studies 02 responses' },
    '1.4': { evidence: 'POCSO completion record and your written understanding and reflection of POCSO, CPP and the SPACE Model' },
    '1.5': { evidence: 'SC Practice Principles, Parts A, B and C' },
    '4.1': { evidence: 'Observation records – EY, PYP, and MLC' },
    '4.2': { name: 'Observe BTec and MYP Classes', evidence: 'Observation records – BTec and MYP' },
    '4.3': { evidence: 'Observation records – DP' },
    '4.4': { evidence: 'Observation records – SC Meeting' },
    '4.5': { evidence: 'Observation records – Parent Meeting' },
    '4.6': { evidence: 'Observation records – Graduation Presentation' },
    '5.1': { evidence: 'Completed worksheet/activity' },
    '5.2': { evidence: 'Dummy Session Plan', timeline: true },
    '6.2': { evidence: '' },
    '7.4': { traineeName: 'RMC' }
  };
  const db = readDb_(), done = [];
  db.tasks.forEach(t => {
    const c = CHANGES[t.id];
    if (!c) return;
    const before = JSON.stringify(t);
    Object.keys(c).forEach(k => { t[k] = c[k]; });
    if (JSON.stringify(t) !== before) { upsert_('Tasks', [t.id], taskToRow_(t)); done.push(t.id); }
  });
  const keep = db.rubrics.filter(r => !(r.task === '2.5' && r.use === 'reference'));   // the Parent and Student Guidebook tabs are removed
  const removed = db.rubrics.length - keep.length;
  if (removed) replaceRows_('Rubrics', keep.map(r => [r.task, r.order, r.use, r.group, r.criterion, r.evaluated, r.levels[0], r.levels[1], r.levels[2], r.levels[3]]));
  const rub = ss.getSheetByName('Rubrics');
  if (rub) rub.getRange(1, 11, Math.max(1, rub.getLastRow()), 1).clearContent();      // the old "Shown to trainee" column is no longer used
  clearCache_();
  append_('Log', [nowStamp_(), caller || 'editor', 'Applied team changes (Oct 2026)', '', done.join(' '), removed + ' guidebook rubric rows removed']);
  Logger.log('Updated tasks: ' + (done.join(', ') || 'none (already up to date)') + '. Guidebook rubric rows removed: ' + removed +
             '. Next: open the app, Curriculum, and press "Refresh from the doc" so the answer boxes and reflection questions are created.');
}
