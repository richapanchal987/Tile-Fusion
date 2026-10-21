# Well-being Counsellor Training, version 2

Built from the counsellors' workbook (v17) and the Team Leaders' reply of 21 October 2026, which takes priority where they differ.
Version 1 (`../wellbeing-training/`) is untouched and keeps working.

It is a Google Apps Script web app. The Google Sheet is the database, a private Drive folder holds evidence, and everyone signs in with their school Google account. Trainees only ever see the web app.

## What is in this build

**Step 1 (core, done and tested)**
- Task list imported once from the workbook, then edited in the app (edit, add, retire, export to CSV, every change logged).
- 4 milestones with deadlines in cycles 3, 5, 10, 12 (12 cycles, 6 working days each, Monday to Saturday, holidays skipped).
- Locks: prerequisites, Milestone 4 after Milestones 1 to 3, Supervised Practice, and "Coming soon" tasks that cannot be started.
- Four rating methods (1 to 4, Complete / Not complete, % with required questions, not pass/fail), pass marks, reworks (max 2), Version A/B, Safety Flag (always forces rework), rating hidden as "Under review" until the Team Leader releases it.
- Joint assessment: the Campus Operations Coordinator confirms the process, and sees evidence only, never scores or feedback.
- Entry check with Focus / Show quickly pathway, Supervised Practice eligibility, clearance checks (every task passed, strand average 2.5, Key Skills, professional behaviour, no open flags), Team Leader decision, Principal sign-off.
- Professional behaviour: trainee self-rating, Team Leader rating (overall is the lowest of six), Coordinator reliability input, release switch.
- Policy acknowledgements (asked again when a policy's "last updated" date changes).
- Roles and sections: trainee, Team Leader (own section in full, other section read-only for cover without private notes), Coordinator, Principal (clearance page only).
- Anonymisation tick, no audio or video upload, history log, read-only records after Completed or Left.

**Not yet built (Steps 2 and 3):** Key Skills tracker screen (the rule is already enforced in clearance), supervision log and caseload limits, email alerts, content review flags, holiday calendar beyond the date list.

## Deploy (new Apps Script project, copy of the Sheet)

1. Create a new Google Sheet and open Extensions > Apps Script.
2. Add these files (names exactly as shown): `Schema.gs, Dates.gs, Rules.gs, Data.gs, Import.gs, View.gs, Code.gs, Actions.gs, Staff.gs` and the HTML files `Index, Styles, Art, AppCore, AppTrainee, AppTeam, AppAdmin`. Replace `appsscript.json` with the one here. (Using `clasp push` from `apps-script/` avoids copy-paste mistakes.)
3. Run `setup()` once and accept the permissions. It creates every tab, the evidence folder, default policies and makes `richa.panchal@fsksurat.in` the Coordinator.
4. Deploy > New deployment > Web app, execute as you, access: anyone in fsksurat.in.
5. Open the app as the Coordinator: Admin > Task list import. Share the workbook with the account that runs the app, paste its link, press "Check the workbook", read the notes, then "Import". Add staff and holidays on the same page.
6. Team Leaders enrol trainees on the Team page.

## Checks

```
node tests/rules.test.js      # the rules (21)
node tests/server.test.js     # the server, roles and privacy (14)
NODE_PATH=$(npm root -g) node tests/e2e.js        # real pages in Chromium (9)
NODE_PATH=$(npm root -g) node tests/contrast.js   # WCAG AA text contrast, light and dark
```
Tests use `tests/fixture.js`, a made-up workbook. The real workbook is never committed because it holds Team Leader-only answer keys.

## Assumptions to confirm with the Team Leaders
1. "Show quickly" skips prerequisite locks on fast-track tasks only; critical gates are never skipped.
2. A locked or Coming soon task shows no learning content to the trainee.
3. The Coordinator sees only the evidence on joint tasks and whether the Team Leader rated it, not the score.
4. Principal sign-off makes the trainee Independent and closes the record.
5. SAFE-12 is described both as 1 to 4 and as a percentage in App Notes; the app follows its Rating Method column.
6. Only SYS-02 is "Not pass/fail"; it counts as passed once the entry check is complete.
7. Clearance in Step 1 uses the checks above; Step 2 will add supervision-log requirements.
