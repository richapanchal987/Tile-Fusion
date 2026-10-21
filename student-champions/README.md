# Student Champion Training

A web app for training new Student Champions at Fountainhead (Senior School). It replaces the *Student Champion Training* spreadsheet and the paper-style module.
New joiners see their 13-cycle plan, read the module text, submit evidence and track progress. Mentors and Team Leaders (TLs) score work against rubrics, agree deadlines and AI-use rules. A Certifying Mentor signs off completion. Admins edit the programme. Everyone works in the app only.

It is a separate copy of the Well-being Counsellor app (`../wellbeing-training/`, which is unchanged). It runs as a Google Apps Script web app with its **own** Google Sheet, its **own** private evidence folder and its **own** link.

## What is in this folder

| Path | What it is |
|---|---|
| `programme.json` | **The one place for names, wording, roles, the certified level, the scale, the critical-error list, the consent checklist, the rules (cycles, months, pass marks) and every colour.** Edit it, then run `python3 tools/build.py`. |
| `apps-script/` | The app. `FILES.md` lists every file with its line count, so you can check each one after pasting. |
| `source/` | Your workbook tabs (exports), the cleaned task table `task_table.csv`, and the rubric tabs. They are the source of the starting content. |
| `tools/build.py` | Rebuilds every generated file (`Config.gs`, `Styles.html`, `Styles2.html`, `SeedData.gs`, `SeedRubrics*.gs`, `FILES.md`). |
| `tests/` | Logic, doc-converter, build, server and browser tests (see Testing). |
| `screenshots/` | The app in light and dark mode, for presentations. |

Files in `apps-script/`: `Code.gs` (sign-in, Sheet storage), `Logic.gs` (rules, no Google calls), `Actions.gs` (what trainees and mentors do), `Admin.gs` (people and curriculum), `Work.gs` (typed answers, reflection, autosave, comments), `Store.gs` (reading and writing the Sheet, with a cache), `Migrate.gs` (one-off updates for an existing Sheet), `DocSync.gs` (module text from the Google Doc), `Config.gs`, `SeedData.gs`, `SeedRubrics*.gs` (generated), and the interface: `Index.html`, `Styles.html`, `Styles2.html`, `Art.html`, `AppCore.html`, `AppTrainee.html`, `AppAssess.html`, `AppTeam.html`, `AppAdmin.html`, `AppFiles.html`, `AppWork.html`, `AppEvents.html`. No file is over 25 KB, and **the order you add files in does not matter**.

## Set up (about 20 minutes, once)

The app must be owned by **richa.panchal@fsksurat.in**. Do all of this signed in as that account.

1. **Module document.** Open *Student Champion Training Module 2026-27* in Google Docs once as this account and make sure it opens. If it does not, ask the doc's owner (krishna.damle@fsksurat.in) to share it with this account (view access is enough). The app reads it with this account's access; trainees never need access to the doc.
2. Create a new Google Sheet, for example "Student Champion Training Data", in the school's Drive. Do **not** share it.
3. In the Sheet choose **Extensions > Apps Script**.
4. Replace the default `Code.gs` with `apps-script/Code.gs`, then add every other file with the **+** button, using the names in `FILES.md` (Script for `.gs`, HTML for `.html`; the editor adds the extension). After each file, scroll to the bottom and check the last line number against `FILES.md`. Open **Project Settings**, tick **Show "appsscript.json" manifest file in editor**, and paste in `apps-script/appsscript.json`.
5. The first admin is set in `Config.gs` (`firstAdmin` and `firstAdminName`, near the top). It is already Richa. If you change it there, change it in `programme.json` too.
6. Choose the function **`setup`** and press **Run**. Approve the permissions. This time the app also asks to read Google Docs and to install a nightly trigger. This creates every tab, loads the 32 tasks and their rubrics, creates the private evidence folder and sets up the nightly refresh.
7. Choose **`refreshModuleText`** and press **Run**. This copies the module from the Google Doc into the Sheet. (After this, an admin does it with a button in the app.)
8. **Deploy > New deployment > Web app.** Execute as **Me**. Who has access: **Anyone within fsksurat.in**. Copy the link.
9. Open the link. In **Team**, add the mentors, TLs and Certifying Mentors under **Staff** (tick "Can certify" for the Certifying Mentors), then enrol a new joiner with their joining date.

### Updating the app later
Change the files in the editor, then **Deploy > Manage deployments > pencil > New version**. The link stays the same. Changes to tasks, weights, rubrics, pass marks, resources, people and settings are made inside the app and need no redeploy. If a change touches only some files, the list below says which, and `FILES.md` lets you check each one.

## Who can do what

| | New joiner (trainee) | Mentor / TL | Certifying Mentor | Admin |
|---|---|---|---|---|
| See own training, type answers and reflection, submit, complete consent checklists, read review comments | yes | | | |
| See trainees | only themselves | those they are assigned to (mentor, TL or certifying mentor), plus any not yet assigned | same | all |
| Score rubrics, record live observations, flag a critical error | | yes | yes | yes |
| Agree a due date, AI permission and (for the dummy session) a timeline | | yes | yes | yes |
| Add review comments on any task; read answers and reflection | | yes | yes | yes |
| Confirm *Student Champion certified* | | | **yes** | |
| Withdraw certification | | | yes | yes |
| Allow an extra reattempt | | | | yes |
| Enrol people, manage staff, edit modules, tasks, rubrics, settings, refresh module text, read the log | | | | yes |

A person can hold any combination: the Staff table has a role (Mentor/TL or Admin) and a separate "Can certify" tick. Experienced Student Champions who act as mentors are added under Staff as Mentor/TL and assigned to a trainee as mentor.

**Staff only:** the rubric ("How it is assessed"), the competency standard, which tasks are critical gates and the full name of 7.4 (trainees see "RMC"). The server never sends these to a trainee; a trainee's certification card says "Some required tasks are not yet signed off by your mentor or TL" instead of naming gates.

## The programme

- **Length:** 3 calendar months from the joining date (1 June ends 1 September), shown to the trainee as the end date. The calendar has **13 cycles of 6 working days** (Sundays skipped), which fits inside the three months. Both numbers are settings in **Curriculum**.
- **8 modules, 32 tasks, weights total 100%.** A module's weight is shared among its tasks in proportion to task weight.

| Module | Weight | Pass mark | Tasks (cycle) |
|---|---|---|---|
| 1 Role, Boundaries & Professional Practice | 15% | 70% | 1.1 Role definition (1), 1.2 Case Studies 01 (1), 1.3 Case Studies 02 (1), 1.4 POCSO, CPP and SPACE Model (2), 1.5 SC Practice Principles (2) |
| 2 School, Programme & Essential Systems Knowledge | 10% | 60% | 2.1 About the school (3), 2.2 Programme Specific (3), 2.3 Career Questions (3), 2.4 Q&A (4), 2.5 Programme Guide (4) |
| 3 Read, Watch, Reflect | 4% | 60% | 3.1 Books, Videos and Articles (4), 3.2 Find a Book (5) |
| 4 Observations | 6% | 60% | 4.1 EY/PYP/MLC (5), 4.2 MYP (5), 4.3 DP (6), 4.4 SC meetings (6), 4.5 Parent meetings (6), 4.6 Graduation Presentation (6) |
| 5 Learning through Guided Application | 12% | 60% | 5.1 Worksheet / Activity (7), 5.2 Dummy Session (7) |
| 6 Applied Practice & Case Simulation | 24% | 70% | 6.1 Case Simulation (8), 6.2 Conversation Framework (8), 6.3 Understanding the Student (8), 6.4 Student Meeting (9), 6.5 Academic Accountability (9) |
| 7 Collaboration & Communication | 17% | 70% | 7.1 Student Communication (10), 7.2 Teacher Communication (10), 7.3 Parent Communication (10), 7.4 Referral Mapping Cases (11), 7.5 Case Conference (11) |
| 8 Final Readiness & Portfolio | 12% | 60% | 8.1 Viva (12), 8.2 Graduation Presentation (13) |

- **Phases belong to modules:** Foundation (1-2), Skill Development (3-5), Applied Practice (6-7), Final Readiness (8). A cycle that holds tasks from two phases takes the phase of its first task.
- **Critical gates (15, staff only):** 1.1, 1.2, 1.3, 1.4, 1.5, 4.6, 5.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1. Change them in **Curriculum** whenever you like (the plan is to review them at the demo with trainees).

## How scoring, pass marks and certification work

- **One scale, 1 to 4:** 1 Not yet met, 2 Developing, 3 Secure, 4 Strong.
- **Rubrics.** Each task has a rubric of criteria. The mentor/TL scores every criterion 1 to 4; the **task score is the average, rounded up at .5**. The task's result follows from it: 3 or 4 is **Complete**; 2 is **Developing** (half credit; the trainee reattempts after feedback); 1 is **Not yet met**. A critical gate needs Complete with a score of at least the pass score (default 3).
- **Rubric content.** Nine tasks have rubrics from your workbook tabs (Role; both Case Studies; POCSO; SC Principles; Programme Specific; Q&A; Worksheet; Dummy Session). Where a tab listed criteria but left the level descriptions blank, the app shows the standard meaning of each score. For Q&A the five levels became four (1, 2 and 3 as written; 4 uses "Excellent"). The other tasks get their criteria from the competency standard in your tracker. **Admins can edit any rubric in Curriculum > Rubric** (criteria, level descriptions, groups, and "reference only" rows that are shown but not scored). 
- **Rubrics and the competency standard are private to staff.** Mentors, TLs and admins see them on the task and in Reviews; a trainee never receives them.
- **Training completion** counts only an assessor's decision: Complete and Exempt are full credit, Developing is half.
- **Module percentage** = the score out of 4 on each task of the module, weighted, with unassessed work counting as zero. A module must reach its **pass mark: 60%, or 70% in modules 1, 6 and 7**. The trainee sees this on a "Module pass marks" card, the Team dashboard shows "x of 8 met".
- **Critical errors.** A mentor/TL can pick one of the seven errors from the module (promising confidentiality where it cannot be kept, failing to escalate, investigating an allegation, diagnosing or labelling, sharing information inappropriately, breaching a boundary, entering student information into an AI tool). The task becomes **Not yet met** with score 1 whatever the criteria say, the trainee sees why, and it shows on the Team dashboard until a good reattempt clears it.
- **Reattempts.** One reattempt is allowed after a task is Developing or Not yet met (a setting). After that the trainee cannot submit; an admin can allow one more for that task.
- **Certification** is a decision a person confirms. The app works out **eligibility**: every critical gate passed, every module at its pass mark, the consent checklists done, and no critical error waiting for a reattempt. When eligible, the **Certifying Mentor** confirms *Student Champion certified*. If something later stops being true, the status drops back and is flagged. There is no "supervised" level.

## Deadlines, AI use and real students

- **Deadlines.** The module says timelines are agreed with the mentor and TL. On each task a mentor/TL sets a **due date** for that trainee. It shows on the task card, the Deadlines card and the Reviews queue (late and due-soon are marked). It is a reminder and does not change a score.
- **AI tools.** Each task has a default: *Ask first* (the module's rule), *Not allowed* (the Viva) or *Allowed*. A mentor/TL can set it per trainee per task. The rule that **student information is never entered into an AI tool** is shown on every task and in the Guide.
- **Consent checklist.** Before tasks with a real student (6.3 two students, 6.4, 6.5, 7.2, 7.3, 7.5 two students) the trainee completes the module's *Pre-task safeguarding and consent checklist* in the app, once per student, using a **student code of their own choosing** (no particular format is required; the app asks for a code and says never a name). The task cannot be submitted until it is done. Admins can switch this on for any other task.

## Answers, reflection and saving

- **Answer boxes.** Where the doc leaves an empty cell for the trainee to write in (case-study tables, meeting observation tables, the P-T-S conversations and so on), the app shows a text box in that place. Each box is labelled from the text around it. Case Studies 01 and 02 have three boxes per scenario (issue identification; what the Student Champion should do; who else to involve and when to refer). 1.5 Part B has one box per situation; 7.1 has a box each for the conversation with the student, the teacher and the parent. Empty tables with nothing to fill in, and lines such as "Link the document here", are left out. Answer boxes are optional; the task shows how many are filled.
- **Reflection (required).** Reflection questions written in the module text are taken out of it and asked in one **Reflection** section at the end of the task. A task with none asks "What are the key takeaways from this section?". Every reflection question must be answered before the task can be submitted, including tasks watched live (6.2, the Viva). In Curriculum, the doc panel lists how many answer boxes and reflection questions each task has, so the team can check them.
- **Autosave.** Typing is saved by itself about 1.5 seconds after the trainee stops (the task says "Saved at 10:42"). If the connection drops, the typing is kept on that device and sent again; if the page is closed first, it is restored and saved the next time the trainee opens the task. Statuses, scores, plans, comments and checklists are saved the moment the button is pressed. The app reopens at the task the trainee was last working on (on the same device).
- **Evidence.** "Add document link" and file uploads appear only on tasks that ask for evidence. A task with no evidence line (6.2) is submitted with the reflection only.
- **Review comments.** Mentors, TLs, Certifying Mentors and admins can add a comment on any task, at any time; the trainee reads it on the task.
- **Timeline (5.2).** The TL writes a free-text timeline for each trainee in the plan box; the trainee sees it on the task. The doc's own timeline is not shown.
- **Consent checklist.** All 14 items are required. It saves by itself once the student code is entered and every item is ticked, and says how many are still to tick.
- **Speed.** The Sheet's settings, tasks, rubrics, staff and prompts are cached for 6 hours (cleared on every change made in the app). A page load reads about 4 tabs, an autosave about 7, and opening module text reads only that section's rows. If you edit the Sheet by hand, run `clearCache` once.

### Updating an existing Sheet (October 2026 team changes)

After pasting the new files: choose **`applyTeamChangesOct2026`** and press **Run** (once). It adds the new tabs and columns, updates the evidence lines and names (4.2, 5.2, 6.2, 7.4 shown as RMC), removes the guidebook reference rubrics from 2.5, and leaves every trainee's progress alone. Then in the app press **Curriculum > Refresh from the doc**, so the answer boxes and reflection questions are built. Then publish a new version.

## Module text from the Google Doc

The doc is the source. Each section of the module is a **tab of the doc**, and the **tab name** is the section title (for example "Case Studies: 1"). Each task names its tab in **Curriculum > Edit task > Module text (doc tab name)**. (A doc without tabs can use Title-style headings instead.) In **Curriculum**, the admin presses **Refresh from the doc** (it also runs by itself every night at about 2 am). The text is copied into the `Content` tab and shown inside each task under "Module text", so trainees never open the doc. The refresh reports any task whose section it cannot find, and any doc section nobody uses.

- If someone renames a tab in the doc, that task shows "not in the app yet" until the task's *doc tab name* is updated to match.
- Reads: headings, paragraphs, bold, italic, links, lists and tables, across all tabs of the doc. **Pictures are not carried over** (a note says so). Colours and fonts are not carried over.
- If the owner's account cannot open the doc, the refresh says who to share it with, and nothing is lost.
- Needs the **Docs permission** (`https://www.googleapis.com/auth/documents`, added to `appsscript.json`; the app only ever reads the doc); after updating the manifest you re-run `setup` once to approve it.

## Look and feel

Same as the Well-being app: FSK poster colours (blue `#0050A0`, red `#B02020`, yellow `#F2C21A`), a blue-to-red banner, Montserrat headings, a scoreboard, milestone medals, a "Since you last visited" card and confetti on Complete. **Every colour is a theme variable with a light and a dark value** (in `programme.json`), so the app follows each person's device setting; a test measures contrast on every main screen in both modes and fails below WCAG AA. Animation is drawn in code and switched off for people who prefer reduced motion.

## Source data: what was fixed, and what to check

Problems found in the workbook, and how this app handles them (decided with you):

1. **Task 2.2 had no cycle** → placed in cycle 3 with the other "School" tasks.
2. **Critical Gate column mixed `Yes`, `1`, `0`; Mandatory disagreed with it** → one flag only: a task is a gate or it is not (the Mandatory column is dropped; after the fix it was identical to the gate flag). 15 gates, listed above. "Case Clearance Relevance" is dropped.
3. **Module names** → "Module N: name" everywhere; Final Readiness is Module 8.
4. **Phases overlapped cycles** → phase belongs to the module.
5. **Wrong task types** → Student Meeting, Dummy Session, Academic Accountability and the Graduation Presentation are now Demonstration; the Viva is Final verification; Case Simulation is Practice; Programme Specific is Learning exposure.
6. **"Second set of case studies" in task 1.2** → split into **1.2 Case Studies 01** and **1.3 Case Studies 02**, each with its own rubric. So IDs after 1.2 in Module 1 moved up by one.
7. **Rubric scales (5 levels vs 4)** → one 1 to 4 scale everywhere (see above).
8. **Length** → 3 months, 13 cycles. Your tracker only placed tasks in C1-C9 (about 9 weeks); they are spread over 13 cycles in module order. Change a task's cycle in **Curriculum**.

Where the module document and the tracker disagreed, **the document wins**: Module 4 gains *Parent meetings* (4.5); Module 8 is the Viva and the Graduation Presentation; the tracker's Portfolio and Sign-off tasks are replaced by certification. The Viva (8.1) is a gate. The doc also has an *Essential Agreement*, shown in the Guide.

Typos fixed in task text: "defination", "Undestand", "Refferal".

## Testing

Run from this folder (Playwright is installed globally):

```
node tests/logic.test.js     # rules: calendar, weights, rubric scoring, pass marks, certification, checklist, deadlines, visibility
node tests/doc.test.js       # the Google Doc converter: sections, escaping, lists, tables, size limits
node tests/build.test.js     # generated files match programme.json; every file small enough to paste
node tests/server.test.js    # the real server code against fake Google services (sheet, drive, doc, triggers)
NODE_PATH=$(npm root -g) node tests/e2e.js          # the real pages in headless Chromium, screenshots in tests/shots/
NODE_PATH=$(npm root -g) node tests/contrast.js     # text contrast in light and dark on every main screen
NODE_PATH=$(npm root -g) node tests/design-shots.js # light and dark screenshots with sample data -> tests/shots/design-*.png
```
The viewer step of `e2e.js` loads pdfjs-dist 3.11.174 and mammoth 1.6.0 from `/tmp/claude-0/libs/node_modules` (or `LIBS_DIR`): `npm install pdfjs-dist@3.11.174 mammoth@1.6.0` there. The tests run the same code that is deployed against stand-ins for Google's services, using a small excerpt of the module document (`tests/fixtures/doc-sample.json`). A first deployment in your own Google account is still the real test: please click through one trainee, one mentor and one Certifying Mentor journey, and press **Refresh from the doc** once to see that every task finds its section.

## Making a third module

Copy this folder, edit `programme.json` (name, wording, roles, scale, rules, phases, colours, the module document id), replace the files in `source/` with the new programme's exports and `task_table.csv`, adapt `tools/build-seed.py` for the new rubric tabs, run `python3 tools/build.py` and `node tests/*.test.js`. The server and interface read all wording from `Config.gs`.

## Owning the data

The Sheet and the evidence folder belong to the account that ran `setup` (Richa). Keep that account's access stable, or move ownership of both (and the script) to a long-lived school account before relying on this. Do not share the Sheet or the folder. Evidence is served only to the trainee, their mentors, TL, certifying mentor and admins. The activity log records every submission, assessment, plan, checklist, certification and module change.
