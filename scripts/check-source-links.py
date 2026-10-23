#!/usr/bin/env python3
"""
Checks how much of a project's code ByteMatch can show: for a sample of each unit's functions,
asks the instance's source API (the one the project page uses) and reports what it found. Needs
only Python 3 and the network; run it after changing objdiff.json, names or file layout, once a
CI run with the change has been read (docs/source-linking.md).

    python3 scripts/check-source-links.py OpenRAC/rac1-decomp
    python3 scripts/check-source-links.py OpenRAC/rac1-decomp --version SCES_509.16 --per-unit 5
    python3 scripts/check-source-links.py owner/repo --unit main/player --per-unit 0   # every function of one unit

Exit status: 0 when every sampled function was found (as C or as assembly) or is absent from the
repository altogether (code generated at build time, not committed), 1 when some that should be
findable weren't, 2 when the project or its report couldn't be read.
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter

FOUND = {"c", "asm"}
# Nothing in the repository has it: not a linking problem, there's no code to link to.
ABSENT = {"absent"}


def main() -> int:
    p = argparse.ArgumentParser(description="Check which functions ByteMatch can show the source of.")
    p.add_argument("project", help="owner/repo, as on the site")
    p.add_argument("--site", default="https://bytematch.dev", help="the ByteMatch instance (default: %(default)s)")
    p.add_argument("--version", help="game version (default: the project's default version)")
    p.add_argument("--per-unit", type=int, default=2, help="functions to try per unit, spread across it; 0 for all (default: %(default)s)")
    p.add_argument("--unit", action="append", default=[], help="only this unit (repeatable)")
    p.add_argument("--max-units", type=int, default=0, help="stop after this many units (default: all)")
    p.add_argument("--delay", type=float, default=0.25, help="seconds between requests, to be kind to the instance (default: %(default)s)")
    p.add_argument("--json", action="store_true", help="print the results as JSON instead of a table")
    a = p.parse_args()

    owner, _, repo = a.project.partition("/")
    if not owner or not repo:
        print("project must be owner/repo", file=sys.stderr)
        return 2

    def get(path: str, **query: str | None) -> dict:
        q = {k: v for k, v in query.items() if v}
        url = f"{a.site.rstrip('/')}{path}" + (f"?{urllib.parse.urlencode(q)}" if q else "")
        req = urllib.request.Request(url, headers={"user-agent": "bytematch-check-source-links"})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            try:
                return json.load(e)
            except Exception:
                return {"error": f"HTTP {e.code}"}
        except (urllib.error.URLError, TimeoutError) as e:
            return {"error": str(e)}

    base = f"/{owner}/{repo}" + (f"/{urllib.parse.quote(a.version)}" if a.version else "")
    report = get(f"{base}.json", mode="report")
    units = report.get("units")
    if not isinstance(units, list):
        print(f"couldn't read the report: {report.get('error', 'no units')}", file=sys.stderr)
        return 2
    if a.unit:
        units = [u for u in units if u.get("name") in a.unit]
    if a.max_units:
        units = units[: a.max_units]

    counts: Counter[str] = Counter()
    problems: list[dict] = []
    no_path = 0
    for unit in units:
        functions = unit.get("functions") or []
        source_path = (unit.get("metadata") or {}).get("source_path")
        if not source_path:
            no_path += 1
        if not functions:
            continue
        n = len(functions) if a.per_unit <= 0 else min(a.per_unit, len(functions))
        picks = [functions[(i * len(functions)) // n] for i in range(n)]
        for f in picks:
            # The project page asks by demangled name when there is one; the API takes either.
            name = (f.get("metadata") or {}).get("demangled_name") or f.get("name")
            r = get(f"/api/v1/projects/{owner}/{repo}/source", unit=unit.get("name"), function=name, version=a.version)
            kind = r.get("kind") or "error"
            counts[kind] += 1
            if kind not in FOUND and kind not in ABSENT:
                problems.append(
                    {
                        "unit": unit.get("name"),
                        "source_path": source_path,
                        "function": name,
                        "kind": kind,
                        "path": r.get("path"),
                        "error": r.get("error"),
                    }
                )
            time.sleep(a.delay)

    total = sum(counts.values())
    found = sum(counts[k] for k in FOUND)
    absent = sum(counts[k] for k in ABSENT)
    if a.json:
        print(json.dumps({"checked": total, "found": found, "absent": absent, "counts": counts, "units_without_source_path": no_path, "problems": problems}, indent=2))
    else:
        print(f"{a.project}: {found} of {total} sampled functions found, {absent} not in the repository ({', '.join(f'{k} {v}' for k, v in counts.most_common())})")
        print(f"{no_path} of {len(units)} units have no source_path in the report")
        if problems:
            print("\nNot found:")
            for x in problems:
                where = x["path"] or x["source_path"] or "(no source_path)"
                print(f"  {x['unit']}  {x['function']}  [{x['kind']}]  {where}" + (f"  {x['error']}" if x["error"] else ""))
    return 0 if found + absent == total else 1


if __name__ == "__main__":
    sys.exit(main())
