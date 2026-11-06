#!/usr/bin/env python3
"""Writes apps/web/src/data/holidays.json: national public holidays per country and year.

Source: the `holidays` Python package (MIT, https://github.com/vacanza/holidays).
Run from the repo root:  pip install holidays && python3 scripts/holidays-gen.py 2026 2028
Only countries that also appear in cities.json are written. Regional holidays are not included.
"""
import json
import re
import sys
from datetime import date

import holidays

first, last = (int(a) for a in sys.argv[1:3])
cities = json.load(open("apps/web/src/data/cities.json"))
supported = holidays.list_supported_countries()
EST = re.compile(r"\s*\((estimated|observed, estimated)\)|\*\s*$", re.I)

out = {
    "source": f"holidays {holidays.__version__} (github.com/vacanza/holidays), MIT",
    "first_year": first,
    "last_year": last,
    "countries": {},
}
for cc in sorted(cities["countries"]):
    if cc not in supported:
        continue
    cls = holidays.country_holidays(cc, years=first)
    # Python weekday numbers (Monday = 0) to the site mask (bit 0 = Monday).
    weekend = sum(1 << d for d in cls.weekend)
    years = {}
    for y in range(first, last + 1):
        h = holidays.country_holidays(cc, years=y, language="en_US") if "en_US" in getattr(cls, "supported_languages", ()) else holidays.country_holidays(cc, years=y)
        rows = []
        for d, names in sorted(h.items()):
            for name in names.split("; "):
                estimated = bool(re.search(r"estimated", name, re.I))
                observed = bool(re.search(r"\bobserved\b", name, re.I))
                clean = EST.sub("", name).strip()
                clean = re.sub(r"\s*\(observed\)", "", clean, flags=re.I).strip()
                flags = ("e" if estimated else "") + ("o" if observed else "")
                rows.append([d.isoformat(), clean, flags] if flags else [d.isoformat(), clean])
        years[str(y)] = rows
    if not any(years.values()):
        continue
    out["countries"][cc] = {"weekend": weekend, "years": years}

json.dump(out, open("apps/web/src/data/holidays.json", "w"), ensure_ascii=False, separators=(",", ":"))
print(len(out["countries"]), "countries")
