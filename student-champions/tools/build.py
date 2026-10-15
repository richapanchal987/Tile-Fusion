#!/usr/bin/env python3
"""Rebuilds every generated file: Config.gs, Styles.html/Styles2.html, SeedData.gs, the SeedRubrics*.gs files and FILES.md.
Run from the student-champions folder:  python3 tools/build.py
"""
import subprocess, sys, pathlib
here = pathlib.Path(__file__).resolve().parent
for script in ("build-config.py", "build-styles.py", "build-seed.py", "file-check.py"):
    subprocess.run([sys.executable, str(here / script)], check=True)
