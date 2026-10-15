#!/usr/bin/env python3
"""Builds apps-script/SeedData.gs and the SeedRubrics*.gs files.

Inputs (all in source/):
  Training_Overview.csv, Master_Tracker.csv, Detailed_Training_Plan.csv   exports of the Student Champion Training workbook
  task_table.csv                                                          the cleaned, approved task table (source of truth for ids, cycles, gates, weights)
  rubrics/*.csv                                                           the rubric tabs of the workbook
Settings and wording come from programme.json.
Run from the student-champions folder:  python3 tools/build-seed.py
The seed is only used by setup() the first time, to fill an empty Sheet. After that the Sheet (edited in the app) is the truth.
"""
import csv, json, re, pathlib, sys

root = pathlib.Path(__file__).resolve().parent.parent
src = root / "source"
prog = json.loads((root / "programme.json").read_text(encoding="utf-8"))

def read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.reader(f))

def dicts(path):
    rows = read(path)
    return [dict(zip(rows[0], r)) for r in rows[1:]]

TYPO = {"defination": "definition", "Undestand": "Understand", "Refferal": "Referral", "Joinee": "Joiner"}
def fix(s):
    for a, b in TYPO.items():
        s = s.replace(a, b)
    return s.strip()

# ---------------------------------------------------------------- topics
MODULE_PHASE = {1: 0, 2: 0, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 3}            # phase belongs to the module (approved)
DOC_INTRO = {3: "M3: Read, Watch, Reflect", 4: "M4: Observations", 5: "M5: Learning through guided application",
             6: "M6: Applied Practice & Case Simulations", 7: "M7: Collaboration & Communication", 8: "M8: Final Readiness & Portfolio"}
rules = prog["rules"]
topics = []
for r in dicts(src / "Training_Overview.csv"):
    m = re.match(r"Module 0?(\d+):\s*(.+)", r["Training Topic"])
    if not m:
        continue
    tid = int(m.group(1))
    topics.append({"id": tid, "name": m.group(2).strip(), "weight": round(float(r["Weightage"]) * 100, 2),
                   "phase": prog["phases"][MODULE_PHASE[tid]],
                   "threshold": rules["strictModuleThreshold"] if tid in rules["strictModules"] else rules["moduleThreshold"],
                   "doc": DOC_INTRO.get(tid, ""), "note": ""})
assert abs(sum(t["weight"] for t in topics) - 100) < 1e-6, "topic weights must total 100"

# ---------------------------------------------------------------- tasks
tracker = {r["Task ID"]: r for r in dicts(src / "Master_Tracker.csv")}
table = dicts(src / "task_table.csv")

def clean_what(text, name):
    t = fix(re.sub(r"^\d+\.\s+", "", text.strip()))
    m = re.match(r"^(.{3,80}?)\s*-\s*(?=[A-Z])", t)
    return t[m.end():] if m and "." not in m.group(1)[:-1] else t

WHAT = {"1.1": "Summarise your understanding of the Student Champion role, its responsibilities, boundaries and collaboration with other support roles, and note any questions you would like to discuss with the SC Team Leader.",
        "1.5": "Create an agreement outlining your principles, boundaries, communication practices and professional commitments for working with students as a Student Champion."}
tasks = []
for i, r in enumerate(table, 1):
    t = tracker[r["from_tracker"]]
    what = r["what"] or WHAT.get(r["id"]) or clean_what(t["What the New Joinee Will Do"], r["name"])
    tasks.append({
        "id": r["id"], "topic": int(r["id"].split(".")[0]), "cycle": int(r["cycle"]), "name": r["name"], "type": r["type"],
        "what": what, "evidence": r["evidence"] or fix(t["Evidence / Output"]), "standard": r["standard"] or fix(t["Competency Standard"]),
        "weight": float(r["weight"]), "gate": r["gate"] == "1", "active": True, "order": i,
        "ai": r["ai"], "real": r["real_student"] == "1", "students": int(r["students"]), "doc": r["doc_section"]})

# checks the user asked for
ids = [t["id"] for t in tasks]
assert len(set(ids)) == len(ids), "task ids must be unique"
assert all(isinstance(i, str) and re.fullmatch(r"\d+\.\d+", i) for i in ids), "ids are text like 5.10"
assert all(1 <= t["cycle"] <= rules["cycles"] for t in tasks), "every task needs a cycle within the programme"
for tp in topics:
    s = sum(t["weight"] for t in tasks if t["topic"] == tp["id"])
    assert abs(s - tp["weight"]) < 1e-6, "task weights of module %s add to %s, not %s" % (tp["id"], s, tp["weight"])

# ---------------------------------------------------------------- rubrics
SPLIT_SKIP = re.compile(r"no critical|sign-off|all mandatory evidence", re.I)
def from_standard(task):
    out = []
    for c in re.split(r";\s*", task["standard"]):
        c = c.strip().rstrip(".")
        if c and not SPLIT_SKIP.search(c):
            out.append(c[0].upper() + c[1:])
    return out

VIVA = ["Applies understanding of the Student Champion role", "Applies professional boundaries", "Applies knowledge of programme processes",
        "Handles confidentiality and its limits correctly", "Shows sound stakeholder collaboration", "Shows sound student support and reasoning"]
GP = ["Understanding the SC role", "Key learnings", "Strategies and tools", "Learning through experience", "Student engagement and ownership",
      "Collaboration", "My growth as an SC", "Looking ahead", "Presentation and delivery"]

def cell(r, i):
    return r[i].strip() if i < len(r) else ""

def rows_simple(path):
    """Criteria | What is being evaluated | five blank level columns. Single-cell rows name a group."""
    out, group = [], ""
    for r in read(path):
        c0, c1 = cell(r, 0), cell(r, 1)
        if not c0 or c0.startswith("Comments") or c0 in ('""', "Criteria", "Criterion"):
            continue
        if not c1 and not any(cell(r, i) for i in range(2, 7)):
            group = c0
            continue
        out.append({"group": group, "criterion": c0, "evaluated": c1, "levels": ["", "", "", ""]})
    return out

def rows_case(path):
    out, group = [], ""
    for r in read(path):
        c0, c1 = cell(r, 0), cell(r, 1)
        if c0.startswith("Scenario"):
            group = c0
        elif not c0 and c1.startswith("1 -"):
            continue
        elif c0 and not c1 and not c0.startswith("Comments") and c0 != '""':
            out.append({"group": group, "criterion": c0, "evaluated": "", "levels": ["", "", "", ""]})
    return out

def rows_qa(path):
    out, cur = [], None
    for r in read(path)[1:]:
        c0 = cell(r, 0)
        if c0.startswith("Comments"):
            cur = None
        elif c0:
            cur = {"group": "", "criterion": c0, "evaluated": "", "levels": ["", "", "", ""]}
            out.append(cur)
        elif cur and any(cell(r, i) for i in range(1, 6)):
            d = [cell(r, i) for i in range(1, 6)]
            cur["levels"] = [d[0], d[1], d[2], d[4]]     # five levels become four: 1, 2, 3 as written; 4 uses "Excellent"
    return out

def rows_dummy(path):
    out, cur = [], None
    for r in read(path)[1:]:
        c0 = cell(r, 0)
        if c0 and not c0.startswith("Comments") and not any(cell(r, i) for i in range(1, 5)):
            cur = {"group": "", "criterion": c0, "evaluated": "", "levels": ["", "", "", ""]}
            out.append(cur)
        elif cur and not c0 and any(cell(r, i) for i in range(1, 5)):
            d = [cell(r, i) for i in range(1, 5)]
            cur["levels"] = [d[3], d[2], d[1], d[0]]    # the tab lists 4 (Excellent) first; levels here run 1 to 4
    return out

FILES = {"role": rows_simple, "pocso": rows_simple, "principles": rows_simple, "worksheet": rows_simple, "programme": rows_simple,
         "case1": rows_case, "case2": rows_case, "qa": rows_qa, "dummy": rows_dummy}
rub = src / "rubrics"
rubrics = []
for t in tasks:
    key = next(r["rubric"] for r in table if r["id"] == t["id"])
    if key in FILES:
        rows = FILES[key](rub / (key + ".csv"))
    elif key == "viva":
        rows = [{"group": "", "criterion": c, "evaluated": "", "levels": ["", "", "", ""]} for c in VIVA]
    elif key == "gp":
        rows = [{"group": "", "criterion": c, "evaluated": "", "levels": ["", "", "", ""]} for c in GP]
    else:                                                                   # no rubric tab: criteria come from the competency standard
        rows = [{"group": "", "criterion": c, "evaluated": "", "levels": ["", "", "", ""]} for c in from_standard(t)]
    n = 0
    for r in rows:
        n += 1
        rubrics.append(dict(task=t["id"], order=n, use="score", **r))
    if key == "guide":                                                      # kept for reference, not used for scoring yet
        for name, f in (("Parent Guidebook (reference only)", "parent_guidebook"), ("Student Guidebook (reference only)", "student_guidebook")):
            for r in rows_simple(rub / (f + ".csv")):
                n += 1
                rubrics.append(dict(task=t["id"], order=n, use="reference", **dict(r, group=name)))
    assert any(x["task"] == t["id"] and x["use"] == "score" for x in rubrics), "no rubric for %s" % t["id"]

# ---------------------------------------------------------------- output
seed = {
    "settings": {"cycles": rules["cycles"], "daysPerCycle": rules["daysPerCycle"], "programmeMonths": rules["programmeMonths"],
                 "passScore": rules["passScore"], "reattempts": rules["reattempts"], "maxUploadMb": rules["maxUploadMb"]},
    "phases": prog["phases"], "topics": topics, "tasks": tasks, "resources": [],
}

def compact(seed):
    """One line per record keeps each file short enough to paste in one go and still easy to read."""
    lines = []
    for key, value in seed.items():
        if isinstance(value, list):
            body = ",\n".join("  " + json.dumps(v, ensure_ascii=False) for v in value)
            lines.append(" %s: [\n%s\n ]" % (json.dumps(key), body))
        else:
            lines.append(" %s: %s" % (json.dumps(key), json.dumps(value, ensure_ascii=False)))
    return "{\n" + ",\n".join(lines) + "\n}"

out = root / "apps-script"
(out / "SeedData.gs").write_text("// Generated by tools/build-seed.py from source/ and programme.json. Do not edit by hand.\nconst SEED = " + compact(seed) + ";\n", encoding="utf-8")
groups = []                       # long group texts (case-study scenarios) are stored once and referred to by number
for r in rubrics:
    if r["group"] not in groups:
        groups.append(r["group"])
    r["group"] = groups.index(r["group"])
for old in out.glob("SeedRubrics*.gs"):
    old.unlink()
lines = ["  " + json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rubrics]
parts, cur, size = [], [], 0
for ln in lines:                  # several small files, because long files get cut off when pasted into the Apps Script editor
    if size + len(ln) > 20000 and cur:
        parts.append(cur); cur, size = [], 0
    cur.append(ln); size += len(ln) + 2
parts.append(cur)
for i, part in enumerate(parts, 1):
    (out / ("SeedRubrics%d.gs" % i)).write_text("// Generated by tools/build-seed.py from source/rubrics. Do not edit by hand.\nconst SEED_RUBRICS_%d = [\n%s\n];\n" % (i, ",\n".join(part)), encoding="utf-8")
(out / "SeedRubrics.gs").write_text("// Generated by tools/build-seed.py. Lists the rubric rows kept in SeedRubrics1.gs, SeedRubrics2.gs ... Do not edit by hand.\nconst SEED_RUBRIC_GROUPS = [\n"
    + ",\n".join("  " + json.dumps(g, ensure_ascii=False) for g in groups) + "\n];\nconst SEED_RUBRIC_PARTS = () => [" + ", ".join("SEED_RUBRICS_%d" % i for i in range(1, len(parts) + 1)) + "];\n", encoding="utf-8")
print("topics %d, tasks %d, gates %d, rubric rows %d in %d files" % (len(topics), len(tasks), sum(t["gate"] for t in tasks), len(rubrics), len(parts)))
