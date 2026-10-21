/**
 * Schema and small helpers shared by every other file. No Google services are called here.
 *
 * The Tasks sheet uses the SAME columns, in the same order, as the Task Catalogue in the counsellors'
 * workbook (FS_Counsellor_Training_App_Workbook_v17), so importing and exporting lose nothing.
 */

const ROLE = {
  TRAINEE: 'Trainee',
  TL_J: 'Team Leader – Junior School', TL_S: 'Team Leader – Senior School',
  COORD: 'Campus Operations Coordinator',
  PR_J: 'Principal – Junior School', PR_S: 'Principal – Senior School'
};
const STAFF_ROLES = [ROLE.TL_J, ROLE.TL_S, ROLE.COORD, ROLE.PR_J, ROLE.PR_S];
const SECTIONS = ['Junior School', 'Senior School'];
const READINESS = ['Not Cleared', 'Supervised Practice', 'Independent'];
const AREAS = ['Parent conversations', 'Teacher consultation', 'Case formulation', 'Policy and systems', 'Counselling skills'];
const PATHWAYS = ['Focus', 'Show quickly'];
const BEHAVIOUR_ITEMS = ['Reliability and follow-through', 'Boundaries and ethics', 'Openness to feedback', 'Emotional steadiness', 'Documentation habits', 'Collaboration with adults'];
const DECISIONS = ['Pending', 'Cleared', 'Cleared with conditions', 'Not yet'];
const STRANDS = ['Safe & Ethical Practice', 'Working with Students', 'Working with Adults', 'School Systems & Accountability'];
const OBS_TYPES = ['Role play', 'Simulation', 'Real', 'Written', 'Viva', 'Not observed'];
const DEFAULT_POLICIES = ['Code of Conduct', 'Personal Relationships', 'Celebration Policy', 'Mobile Phone Usage', 'Eating Etiquette'];

/** [key, workbook header, group, input kind, can a trainee see it?] */
const TASK_FIELDS = [
  ['id', 'Task ID', 'Identity', 'text', true],
  ['active', 'Active', 'Identity', 'yesno', false],
  ['strand', 'Strand', 'Identity', 'text', true],
  ['area', 'Area', 'Identity', 'text', true],
  ['milestone', 'Milestone', 'Identity', 'text', true],
  ['milestoneDeadline', 'Milestone Deadline (Cycle)', 'Identity', 'calc', true],
  ['title', 'Task Title', 'Identity', 'text', true],
  ['stage', 'Stage', 'Identity', 'text', true],
  ['ageBand', 'Age Band', 'Identity', 'text', true],
  ['gate', 'Critical Gate', 'Identity', 'yesno', true],
  ['keySkill', 'Key Skill', 'Identity', 'text', true],
  ['obsType', 'Expected Observation Type', 'Identity', 'text', true],
  ['dueOverride', 'Due Cycle (override)', 'Identity', 'number', true],
  ['requiresSupervised', 'Requires Supervised Practice', 'Identity', 'yesno', false],
  ['what', 'What the Trainee Will Do', 'Instructions', 'long', true],
  ['prereq', 'Prerequisites', 'Instructions', 'text', true],
  ['toolkit', 'Toolkit Link', 'Instructions', 'text', true],
  ['bestDoneOn', 'Best Done On', 'Instructions', 'text', true],
  ['effort', 'Estimated Effort (hrs)', 'Instructions', 'number', true],
  ['learn', 'Learning Content (in app)', 'Content', 'long', true],
  ['refs', 'References', 'Content', 'long', true],
  ['refLinks', 'Reference Links', 'Content', 'long', true],
  ['checkedAgainst', 'Content Checked Against (Team Leader only)', 'Content', 'long', false],
  ['inApp', 'In-App Text (trainee sees)', 'Content', 'long', true],
  ['traineeFile', 'Trainee File (Drive)', 'Content', 'text', false],
  ['traineeLink', 'Trainee Content Link', 'Content', 'url', true],
  ['inAppTL', 'In-App Text (Team Leader only)', 'Content', 'long', false],
  ['tlFile', 'Team Leader File (Drive)', 'Content', 'text', false],
  ['tlLink', 'Team Leader Content Link', 'Content', 'url', false],
  ['contentNotes', 'Content Notes (Team Leader only)', 'Content', 'long', false],
  ['contentStatus', 'Content Status', 'Content', 'text', false],
  ['actionNeeded', 'Action Needed (for you)', 'Content', 'long', false],
  ['evidenceRequired', 'Evidence Required', 'Rating', 'text', true],
  ['evidenceDesc', 'Evidence Description', 'Rating', 'text', true],
  ['assessorRole', 'Assessor Role', 'Rating', 'text', true],
  ['ratingMethod', 'Rating Method', 'Rating', 'text', true],
  ['passMark', 'Pass Mark', 'Rating', 'text', true],
  ['competency', 'Competency Standard', 'Rating', 'long', true],
  ['anchor', 'Rating Anchor', 'Rating', 'long', true],
  ['rubric', 'Rubric', 'Rating', 'text', true],
  ['rubricLink', 'Rubric Link', 'Rating', 'url', true],
  ['maxReworks', 'Max Reworks', 'Rating', 'number', true],
  ['fastTrack', 'Fast-track Eligible', 'Rating', 'yesno', false],
  ['entryArea', 'Entry Check Area (fast-track)', 'Rating', 'text', false],
  ['appNotes', 'App Notes', 'Admin', 'long', false],
  ['source', 'Source (Team Leader only)', 'Admin', 'long', false],
  ['oldTask', 'Old Task (Team Leader only)', 'Admin', 'text', false]
];
const TASK_HEADERS = TASK_FIELDS.map(f => f[1]);
const TASK_KEYS = TASK_FIELDS.map(f => f[0]);
const TRAINEE_HIDDEN = TASK_FIELDS.filter(f => !f[4]).map(f => f[0]);

const SHEETS = {
  Settings: ['Key', 'Value', 'What it does'],
  Users: ['Email', 'Name', 'Role', 'Active'],
  Trainees: ['Trainee ID', 'Name', 'Email', 'Home Section', 'Start Date', 'Team Leader', 'Principal', 'Case Readiness', 'Training Status',
             'Caseload Cases', 'Caseload Groups', 'Clearance Decision', 'Decision Date', 'Conditions', 'Principal Sign-off Date',
             'Background', 'Entry Check Notes', 'Extension Notes'],
  EntryCheck: ['Trainee', 'Area', 'Rating', 'Pathway', 'Notes'],
  Tasks: TASK_HEADERS,
  Milestones: ['Milestone', 'Deadline (Cycle)', 'Main focus', 'Case Readiness possible'],
  KeySkills: ['Key Skill', 'Name', 'Linked tasks', 'Evidence rule', 'Rubric', 'Rubric Link'],
  Toolkit: ['Tool', 'Name', 'Group', 'Level', 'Used in tasks', 'Card Link'],
  Rubrics: ['Rubric', 'Criterion', '1 Not yet competent', '2 Developing', '3 Competent', '4 Proficient'],
  Policies: ['Policy', 'Link', 'Last Updated'],
  Holidays: ['Date', 'Note'],
  Attempts: ['Attempt ID', 'Trainee', 'Task ID', 'Attempt No', 'Status', 'Source', 'Date Submitted', 'Evidence Link', 'Files', 'Anonymisation Confirmed',
             'Reflection', 'Question for Team Leader', 'Hours Spent', 'Observation Type', 'Scenario Version', 'Date Assessed', 'Score',
             'Rubric Scores', 'Safety Flag', 'Safety Note', 'Feedback', 'Development Goal', 'Rework Required', 'Rework Due',
             'Process Confirmed', 'Process Confirmed Date', 'Process Note', 'Process Confirmed By', 'Rating Released', 'Assessed By',
             'Team Leader Private Notes', 'Seen By Trainee'],
  TaskDates: ['Trainee', 'Task ID', 'Planned Date', 'Due Override'],
  PolicyAcks: ['Trainee', 'Policy', 'Policy Updated', 'Acknowledged'],
  Behaviour: ['Trainee', 'Cycle'].concat(BEHAVIOUR_ITEMS, ['Comments', 'Development Goal', 'Reliability Input', 'Self Ratings', 'Rating Released', 'Team Leader Private Notes']),
  History: ['Time', 'By', 'Table', 'Record', 'Field', 'Old', 'New']
};

const SETTING_DEFS = {
  cycles: [12, 'Number of cycles in the programme (a cycle is 6 working days)'],
  daysPerCycle: [6, 'Working days in one cycle (Monday to Saturday, skipping school holidays)'],
  passScore: [3, 'Default pass mark for 1-4 rated tasks'],
  supervisedTask: ['STU-21', 'The task whose prerequisites make a trainee eligible for Supervised Practice'],
  supervisedEarliestCycle: [4, 'Supervised Practice can start from the first day of this cycle at the earliest'],
  strandAverageMin: [2.5, 'Each strand needs this average (1-4 rated tasks only) for clearance'],
  keySkillOccasions: [2, 'Occasions rated 3 or above needed for each Key Skill'],
  keySkillRealUpTo: [5, 'Key Skills up to this number need at least one Real occasion'],
  behaviourCycles: [2, 'Professional behaviour must be 3 or above in this many most recent released cycles'],
  dueSoonDays: [3, 'A task is due soon within this many working days'],
  maxUploadMb: [10, 'Largest evidence file in MB'],
  maxCases: [3, 'Supervised cases allowed before Milestone 4'],
  maxGroups: [1, 'Groups allowed before Milestone 4'],
  maxCasesM4: [5, 'Cases allowed in Milestone 4'],
  workbookId: ['', 'Google Sheet ID of the workbook the task list is imported from (once)'],
  importedAt: ['', 'Set when the task list has been imported']
};

/** Deadline cycles decided by the Team Leaders on 21 October 2026 (replace the workbook values 2, 4, 8, 10). */
const MILESTONE_DEADLINES = { 1: 3, 2: 5, 3: 10, 4: 12 };

const yes_ = v => v === true || /^(yes|true|y|1)$/i.test(String(v == null ? '' : v).trim());
const yn_ = b => b ? 'Yes' : 'No';
const str_ = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 20000);
const norm_ = e => String(e || '').trim().toLowerCase();
const blank_ = v => String(v == null ? '' : v).trim() === '';
const num_ = (v, d) => { if (blank_(v)) return d === undefined ? 0 : d; const n = Number(v); return isFinite(n) ? n : (d === undefined ? 0 : d); };
const idList_ = s => String(s || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
const cmpId_ = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

function roleInfo_(role) {
  const r = String(role || '');
  if (r === ROLE.TRAINEE) return { kind: 'trainee', section: '' };
  const section = /junior/i.test(r) ? 'Junior School' : /senior/i.test(r) ? 'Senior School' : '';
  if (/^team leader/i.test(r)) return { kind: 'tl', section: section };
  if (/^principal/i.test(r)) return { kind: 'principal', section: section };
  if (/coordinator/i.test(r)) return { kind: 'coord', section: '' };
  return { kind: 'none', section: '' };
}
const roleName_ = (kind, section) => kind === 'coord' ? ROLE.COORD : kind === 'tl' ? 'Team Leader – ' + section : kind === 'principal' ? 'Principal – ' + section : ROLE.TRAINEE;
