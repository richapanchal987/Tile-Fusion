// A small made-up workbook in the same shape as the counsellors' workbook (no real content, no answer keys).
// It exercises every rating method, a gate, a joint task, fast-track, the supervised-practice task, an entry-check placement task, "Needs school input" and a retired task.
function build(taskHeaders) {
  const T = (o) => {
    const d = { Active: 'Yes', Strand: 'Working with Students', Milestone: 'Milestone 1', 'Critical Gate': 'No', 'Rating Method': '1–4', 'Pass Mark': '3', 'Max Reworks': '2',
                'Assessor Role': 'Team Leader', 'Requires Supervised Practice': 'No', 'Fast-track Eligible': 'No', 'Content Status': 'In Drive – linked', 'Evidence Required': 'Link or file',
                'Expected Observation Type': 'Written', 'Estimated Effort (hrs)': '2.0', 'Learning Content (in app)': 'Learn text for ' + o['Task ID'],
                'Content Checked Against (Team Leader only)': 'SECRET-SOURCE', 'In-App Text (Team Leader only)': 'SECRET-TL-TEXT', 'Source (Team Leader only)': 'SECRET-SOURCE' };
    const r = Object.assign(d, o); r['Task Title'] = r['Task Title'] || 'Title ' + r['Task ID'];
    return taskHeaders.map(h => r[h] === undefined ? '' : r[h]);
  };
  const tasks = [
    T({ 'Task ID': 'SAFE-01', Strand: 'Safe & Ethical Practice', 'Critical Gate': 'Yes' }),
    T({ 'Task ID': 'SAFE-02', Strand: 'Safe & Ethical Practice', 'Prerequisites': 'SAFE-01', 'Fast-track Eligible': 'Yes', 'Entry Check Area (fast-track)': 'Counselling skills' }),
    T({ 'Task ID': 'STU-01', 'Rating Method': 'Complete / Not complete', 'Pass Mark': 'Complete' }),
    T({ 'Task ID': 'STU-02', 'Rating Method': '% correct', 'Pass Mark': '90% + questions 1, 2 correct', Prerequisites: 'STU-01' }),
    T({ 'Task ID': 'ADU-01', Strand: 'Working with Adults', Milestone: 'Milestone 2', 'Assessor Role': 'Team Leader + Campus Operations Coordinator', 'Key Skill': 'Key Skill 1', Prerequisites: 'SAFE-01' }),
    T({ 'Task ID': 'STU-21', Milestone: 'Milestone 2', Prerequisites: 'SAFE-01, STU-01' }),
    T({ 'Task ID': 'STU-22', Milestone: 'Milestone 3', 'Requires Supervised Practice': 'Yes', Prerequisites: 'STU-21' }),
    T({ 'Task ID': 'SYS-02', Strand: 'School Systems & Accountability', 'Rating Method': 'Not pass/fail', 'Pass Mark': '' }),
    T({ 'Task ID': 'SYS-05', Strand: 'School Systems & Accountability', 'Content Status': 'Needs school input' }),
    T({ 'Task ID': 'SYS-09', Strand: 'School Systems & Accountability', Active: 'No' }),
    T({ 'Task ID': 'SYS-10', Strand: 'School Systems & Accountability', Milestone: 'Milestone 4', Prerequisites: 'SAFE-01' })
  ];
  return {
    'Task Catalogue': [taskHeaders].concat(tasks),
    'Milestones': [['Milestone', 'Deadline (Cycle)', 'Main focus', 'Case Readiness possible'], ['Milestone 1', '2', 'Foundations', 'Not Cleared'], ['Milestone 2', '4', 'Practice', 'Supervised'], ['Milestone 3', '8', 'Cases', 'Supervised'], ['Milestone 4', '10', 'Independence', 'Independent']],
    'Key Skills': [['Key Skill', 'Name', 'Linked tasks', 'Evidence rule', 'Rubric', 'Rubric Link'], ['Key Skill 1', 'Adult conversations', 'ADU-01', 'Two occasions', 'Rubric A', '']],
    'Toolkit': [['Tool', 'Name', 'Group', 'Level', 'Used in tasks', 'Card Link'], ['Tool 1', 'Active listening', 'Core', 'Basic', 'STU-01', '']],
    'Rubrics': [['Rubric', 'Criterion', '1 Not yet competent', '2 Developing', '3 Competent', '4 Proficient'], ['Rubric A', 'Clarity', 'a', 'b', 'c', 'd']]
  };
}
module.exports = { build };
