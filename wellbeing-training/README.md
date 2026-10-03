# Well-being Counsellor Onboarding

A web app for onboarding new Well-being counsellors at Fountainhead. It replaces the training spreadsheet.
Trainees see their 10-cycle plan, add evidence and reflections, and track progress. Team Leaders and the
Principal assess work, confirm readiness and edit the module. Everyone works in the app only.

It runs as a Google Apps Script web app. A Google Sheet is its database and a private Drive folder holds
uploaded evidence. Neither is shared with trainees or assessors.

## What is in this folder

| Path | What it is |
|---|---|
| `apps-script/Code.gs` | Server: sign-in roles, Sheet storage, uploads, every action |
| `apps-script/Logic.gs` | Rules with no Google calls: weights, gates, calendar, readiness |
| `apps-script/SeedData.gs` | The starting module (generated from `source/`) |
| `apps-script/Index.html`, `Styles.html`, `App.html` | The interface |
| `apps-script/appsscript.json` | Permissions and web-app settings |
| `source/*.csv` | Your original spreadsheet tabs, kept as the source of the seed data |
| `tools/build-seed.py` | Rebuilds `SeedData.gs` from `source/` |
| `tests/` | Logic tests, server tests and a browser test (see Testing) |

## Set up (about 15 minutes, once)

Use a school Google account that will own the data. If that person leaves, ownership has to move (see Owning the data).

1. Create a new Google Sheet, for example "Well-being Training Data", in the school's Drive.
2. In the Sheet choose **Extensions > Apps Script**.
3. Replace the default `Code.gs` with `apps-script/Code.gs`. Then add the other files with the **+** button, using the same names:
   `Logic.gs`, `SeedData.gs` (script files) and `Index`, `Styles`, `App` (HTML files).
   In the editor, open **Project Settings** and tick **Show "appsscript.json" manifest file in editor**, then paste in `apps-script/appsscript.json`.
4. Edit `FIRST_ADMIN` and `FIRST_ADMIN_NAME` at the top of `Code.gs` if the first admin is not Richa.
5. Choose the function `setup` and press **Run**. Approve the permissions. This creates every tab, loads the 76 tasks and creates the private evidence folder.
6. **Deploy > New deployment > Web app.** Execute as **Me**. Who has access: **Anyone within fsksurat.in**. Copy the link.
7. Open the link, then enrol a trainee from **Team**.

If you prefer the command line, `clasp` can push the `apps-script` folder: copy `.clasp.json.example` to `.clasp.json`, put your script ID in it and run `clasp push`.

### Updating the app later
Change the files in the editor (or `clasp push`), then **Deploy > Manage deployments > Edit > New version**. The link stays the same. Changes to tasks, weights, resources and people are made inside the app and need no redeploy.

## Who can do what

| | Trainee | Assessor (TL) | Admin (Principal, Well-being lead) |
|---|---|---|---|
| See own training, submit evidence | yes | | |
| See trainees | only themselves | assigned ones (or unassigned) | all |
| Assess, record live observations | | yes | yes |
| Confirm supervised practice | | yes | yes |
| Confirm independent clearance | | | yes |
| Enrol trainees, manage staff | | | yes |
| Edit tasks, topics, weights, resources, settings | | | yes |
| Read the activity log | | | yes |

## How progress and readiness are worked out

- **Weights.** Each topic carries its weight from the Training Overview (10, 10, 8, 12, 20, 12, 10, 8, 3, 7 = 100%). A topic's weight is shared among its tasks in proportion to each task's own weight, so the programme always totals 100%.
- **Training completion** counts only what an assessor has decided: Complete = full credit, Partial = half, Exempt = full. Submitted, in-progress and Rework earn nothing yet.
- **Competency** is the weighted average of scores (out of 4) on Complete and Partial tasks.
- **Critical gates.** A gate is passed only when the task is Complete with a score of at least the pass score (default 3, Competent).
- **Readiness** is a gate, not a percentage. The app works out what a trainee is *eligible* for, and a person *confirms* it:
  - Supervised practice: every critical gate through cycle 5 (end of Phase 2) is passed. Urgent-pathway trainees need the gates through cycle 2 (Phase 1) only.
  - Independent: every critical gate is passed, and an admin confirms.
  - If a gate later fails after clearance was confirmed, the trainee drops back and is flagged for review.
- **Calendar.** A cycle is 6 working days. Sundays are skipped. School holidays are not (yet) skipped. The app shows each cycle's dates and whether the trainee is ahead, on track or behind.

Both gate cycles, the pass score, the number of cycles and days, and the phases are set in **Curriculum > Programme settings**.

## Evidence and privacy

- Uploads (PDF, Office files, images, text, mp3, m4a, mp4; up to 10 MB each, 5 per task) go to a private Drive folder, one sub-folder per trainee. The folder is not shared. The app serves a file only to that trainee and their assessors and admins.
- Assessors read evidence inside the app with the **View** button: PDF, Word (.docx), images, text, and audio or video play in place. **Download** is always available too. Older Office files (.doc, .xls, .xlsx, .ppt, .pptx) cannot be previewed in a browser, so the app says so and offers Download; trainees are told that a PDF is best. The PDF and Word viewers load their code from `cdnjs.cloudflare.com`, so if the school network blocks that address those two fall back to Download.
- Anything bigger, such as a recording, should be a link. Recording is never the default requirement.
- The forms ask trainees not to enter student names or case details.
- Every submission, assessment, readiness decision and module change is recorded in the activity log.

## Owning the data

The Sheet and the evidence folder belong to the account that ran `setup`. Keep that account's access stable, or move ownership of both to a long-lived school account before relying on this. Do not share the Sheet or folder with trainees. Assessors do not need them either.

## Source data notes

Fixed while building the seed from the original spreadsheet:

- Task IDs `5.10` and `10.10` had been turned into `5.1` and `10.1` by Sheets, so each ID appeared twice. They are restored.
- The task weights summed to 110, and topic sub-totals did not match the Training Overview. The Overview weights are treated as the truth; the task weights only decide how a topic's weight is split.

Still for you to decide:

- Tasks 1.1 (Role Mapping) and 5.6 (Micro-skills Practice) are marked critical gates but not "mandatory before independent cases". They are treated as gates. Change them in **Curriculum** if that is a mistake.
- Gate tasks with a weight of 0 (1.5, 2.6, 10.9, 10.10, 10.11) earn no completion credit but must still be passed.

## Testing

```
node tests/logic.test.js     # weights, gates, calendar, readiness (no dependencies)
node tests/server.test.js    # the real Code.gs against fake Google services
NODE_PATH=$(npm root -g) node tests/e2e.js   # the real pages in headless Chromium, screenshots in tests/shots/
                                              # (the PDF/Word viewer steps load pdfjs-dist 3.11.174 and mammoth 1.6.0 from
                                              #  LIBS_DIR, default /tmp/claude-0/libs/node_modules: npm install them there)
```

These run the same code that is deployed, but against stand-ins for Google's services. A first deployment in your own Google account is still the real test: please click through one trainee and one assessor journey.
