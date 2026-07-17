# Parse a KubotaPad parts-list PDF (text layer) into JSON for
# scripts/import-parts-catalogue.ts.
#
# Page anatomy (see MU4501 2024.pdf): boilerplate header lines, then a
# section title like "573001 AIR CLEANER [OLD] ## MU4501DT", then a
# parts table whose rows look like
#   "010 TC740-16300 CLEANER,AIR,ASSY 1 - 0.0"
#   (ref-no, part-no, name, qty, FRT/serial columns, weight)
#
# Usage: python scripts/parse-parts-pdf.py "<pdf path>" <model> <out.json>
import io
import json
import re
import sys

from pypdf import PdfReader

pdf_path, model, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

SECTION_RE = re.compile(r"^([A-Z]?\d{5,6})\s+(.+?)(?:\s*\[(?:OLD|NEW)\])?\s*(?:##.*)?$")
# e.g. "MU4501DT (S/N;T*50001-T*79999) REAR AXLE/BRAKE" — the trailing
# words are the chapter (system) the current section belongs to.
CHAPTER_RE = re.compile(r"^MU\w+\s+\(S/N;[^)]*\)\s+(.+)$")
# ref-no (3 digits), part-no (ALNUM-ALNUM), name, then a standalone qty
# followed by the FRT column ("-" or a number).
ROW_RE = re.compile(r"^(\d{3})\s+([A-Z0-9]{2,7}-[A-Z0-9]{3,7})\s+(.+?)\s+(\d{1,3})\s+(?:-|\d)")

BOILERPLATE = (
    "Update Date:", "Printing Date:", "This content is", "information such as",
    "Illustrations of", "No. Part No.", "Page ", " Interchangeable",
    "Not Interchangeable", "New for Old", "Old for New", "S.No.",
)

reader = PdfReader(pdf_path)
parts = {}  # part_number -> record (first occurrence wins)
section = None
chapter = None
rows_seen = 0

for page_idx, page in enumerate(reader.pages):
    text = page.extract_text() or ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line or any(line.startswith(b) or line.lstrip("﻿ ").startswith(b.strip()) for b in BOILERPLATE):
            continue
        m = ROW_RE.match(line)
        if m:
            _, part_no, name, qty = m.groups()
            rows_seen += 1
            if part_no not in parts:
                parts[part_no] = {
                    "part_number": part_no,
                    "part_name": name.strip().rstrip(","),
                    "section": section,
                    "chapter": chapter,
                    "model": model,
                    "page": page_idx + 1,
                }
            continue
        c = CHAPTER_RE.match(line)
        if c:
            chapter = c.group(1).strip()
            continue
        s = SECTION_RE.match(line)
        # Guard against UUID-ish noise lines matching the section shape.
        if s and len(s.group(2)) > 2 and not re.search(r"[a-f0-9]{8}-", line):
            section = s.group(2).strip()

records = sorted(parts.values(), key=lambda r: r["part_number"])
with io.open(out_path, "w", encoding="utf-8") as f:
    json.dump({"model": model, "source": pdf_path, "parts": records}, f, ensure_ascii=False, indent=1)

print(f"table rows seen: {rows_seen}, unique parts: {len(records)}")
sections = {r["section"] for r in records}
print(f"sections: {len(sections)}")
for r in records[:5]:
    print(" sample:", r["part_number"], "|", r["part_name"], "|", r["section"])
