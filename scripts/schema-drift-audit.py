#!/usr/bin/env python3
"""
Schema drift audit — parses all edge functions and the frontend supabase
client calls, extracts column references by table, and cross-references
against the actual information_schema.columns.

Catches the class of silent bugs where code references a column that was
deleted/renamed/never existed (e.g. the last_limit_reset_at incident that
silently broke the entire watchdog allExt fetch).

Usage:
  SCHEMA_PATH=/tmp/schema.py python3 scripts/schema-drift-audit.py

Outputs:
  - PASS list (table → cols used that all exist)
  - FAIL list (table → missing cols + file:line)
"""
import os, re, sys, json
from pathlib import Path

SCHEMA_PATH = os.environ.get("SCHEMA_PATH", "/tmp/schema.py")
exec(open(SCHEMA_PATH).read())  # defines SCHEMA: {table: [cols]}

ROOT = Path(__file__).resolve().parents[1]
SCAN_DIRS = [ROOT / "supabase" / "functions", ROOT / "src"]

# Pattern: .from("TABLE")... chained calls.
# We lex each file into "from-blocks" by greedy match from `.from("X")` to the
# end of the statement (next `;` or line-terminator after a closing paren).
FROM_RE = re.compile(r'\.from\(\s*["\']([a-z_][a-z_0-9]*)["\']\s*\)', re.IGNORECASE)

# Within a block, extract column names referenced via standard PostgREST filters
COL_FILTER_RE = re.compile(
    r'\.(?:eq|neq|gt|gte|lt|lte|like|ilike|in|contains|containedBy|is|not|match|or|filter|order|cs|cd|overlap)\(\s*["\']([a-z_][a-z_0-9]*)["\']',
    re.IGNORECASE,
)

# .select("a,b,c") or .select("a, b, c")
SELECT_RE = re.compile(r'\.select\(\s*["\']([^"\']+)["\']', re.IGNORECASE)

# .insert({...}) / .update({...}) / .upsert({...}) — we extract the keys
# inside the first {...} balanced braces after the call.
OBJ_CALL_RE = re.compile(r'\.(?:insert|update|upsert)\s*\(\s*(\{)', re.IGNORECASE)

def extract_balanced_object(src: str, open_idx: int) -> str:
    """Return the text of the balanced JS/TS object starting at open_idx."""
    depth = 0
    i = open_idx
    in_str = False
    str_ch = ""
    while i < len(src):
        ch = src[i]
        if in_str:
            if ch == "\\":
                i += 2
                continue
            if ch == str_ch:
                in_str = False
        else:
            if ch in ('"', "'", "`"):
                in_str = True
                str_ch = ch
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return src[open_idx : i + 1]
        i += 1
    return src[open_idx:]

# Extract object keys (handles "foo:", 'foo':, foo:, "foo-bar": skipped).
# Only top-level keys of the object.
def extract_top_keys(obj_src: str):
    # Strip outer braces
    inner = obj_src[1:-1]
    keys = []
    depth = 0
    i = 0
    in_str = False
    str_ch = ""
    key_buf = ""
    reading_key = True
    just_saw_comma = True
    while i < len(inner):
        ch = inner[i]
        if in_str:
            if ch == "\\":
                key_buf += inner[i : i + 2]
                i += 2
                continue
            if ch == str_ch:
                in_str = False
            else:
                key_buf += ch
            i += 1
            continue
        if ch in ('"', "'", "`"):
            if depth == 0 and reading_key and just_saw_comma:
                in_str = True
                str_ch = ch
                key_buf = ""
                i += 1
                continue
            in_str = True
            str_ch = ch
            i += 1
            continue
        if ch == "{" or ch == "[" or ch == "(":
            depth += 1
            key_buf = ""
            reading_key = False
            i += 1
            continue
        if ch == "}" or ch == "]" or ch == ")":
            depth -= 1
            i += 1
            continue
        if depth != 0:
            i += 1
            continue
        if ch == ",":
            reading_key = True
            just_saw_comma = True
            key_buf = ""
            i += 1
            continue
        if ch == ":":
            if reading_key and just_saw_comma:
                k = key_buf.strip()
                # Only accept identifier-style keys
                if re.fullmatch(r"[a-zA-Z_][a-zA-Z_0-9]*", k):
                    keys.append(k)
                reading_key = False
                just_saw_comma = False
                key_buf = ""
            i += 1
            continue
        if reading_key and just_saw_comma:
            if ch.isspace():
                if key_buf:
                    # end of unquoted key
                    pass
            else:
                key_buf += ch
        i += 1
    return keys

def parse_select(s: str):
    """Extract column names from a PostgREST select string."""
    cols = []
    # Strip nested relations like author(id,name)
    depth = 0
    cur = ""
    for ch in s:
        if ch == "(":
            depth += 1
            continue
        if ch == ")":
            depth -= 1
            continue
        if depth == 0:
            cur += ch
    for raw in cur.split(","):
        c = raw.strip()
        # Handle "alias:col"
        if ":" in c:
            c = c.split(":", 1)[1].strip()
        # Strip casts ::type
        if "::" in c:
            c = c.split("::", 1)[0].strip()
        if c in ("*", ""):
            continue
        if re.fullmatch(r"[a-zA-Z_][a-zA-Z_0-9]*", c):
            cols.append(c)
    return cols

def extract_from_blocks(src: str):
    """Yield (table, block_text) tuples. The block ends at the next top-level `;`
    or the start of another `.from(` at the same or shallower depth."""
    matches = list(FROM_RE.finditer(src))
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(src)
        yield m.group(1), src[m.start():end]

def scan_file(path: Path):
    """Return list of (table, col, usage, line_no)."""
    try:
        txt = path.read_text(encoding="utf-8")
    except Exception:
        return []
    refs = []
    # Compute line numbers lazily
    line_starts = [0]
    for i, ch in enumerate(txt):
        if ch == "\n":
            line_starts.append(i + 1)
    def line_of(pos):
        import bisect
        return bisect.bisect_right(line_starts, pos)

    for table, block in extract_from_blocks(txt):
        # Find position of this block in txt to compute line numbers
        block_start = txt.find(block)
        if block_start < 0:
            block_start = 0

        # Column filters
        for m in COL_FILTER_RE.finditer(block):
            col = m.group(1)
            refs.append((table, col, "filter", line_of(block_start + m.start())))

        # .select(...)
        for m in SELECT_RE.finditer(block):
            sel = m.group(1)
            for col in parse_select(sel):
                refs.append((table, col, "select", line_of(block_start + m.start())))

        # .insert({...}) / .update({...}) / .upsert({...})
        for m in OBJ_CALL_RE.finditer(block):
            brace = block_start + m.start(1)
            obj = extract_balanced_object(txt, brace)
            for key in extract_top_keys(obj):
                refs.append((table, key, "insert/update", line_of(brace)))

    return refs

def main():
    all_refs = []
    for d in SCAN_DIRS:
        if not d.exists():
            continue
        for p in d.rglob("*.ts"):
            if "node_modules" in p.parts:
                continue
            for ref in scan_file(p):
                all_refs.append((str(p.relative_to(ROOT)), *ref))
        for p in d.rglob("*.tsx"):
            if "node_modules" in p.parts:
                continue
            for ref in scan_file(p):
                all_refs.append((str(p.relative_to(ROOT)), *ref))

    drifts = []
    unknown_tables = set()
    ok_count = 0

    for file, table, col, usage, line in all_refs:
        if table not in SCHEMA:
            unknown_tables.add(table)
            continue
        if col not in SCHEMA[table]:
            drifts.append((file, table, col, usage, line))
        else:
            ok_count += 1

    # Dedupe drifts
    uniq = {}
    for f, t, c, u, l in drifts:
        key = (t, c)
        uniq.setdefault(key, []).append((f, u, l))

    print(f"═══ Schema drift audit ═══")
    print(f"Tables in schema: {len(SCHEMA)}")
    print(f"Total column references found: {len(all_refs)}")
    print(f"OK references: {ok_count}")
    print(f"Drift references: {len(drifts)}")
    print(f"Unknown tables (not in public schema, probably RPCs or views): {sorted(unknown_tables)}")
    print()
    if uniq:
        print("⚠️  DRIFT BY (table, column):")
        for (t, c), locs in sorted(uniq.items()):
            valid = SCHEMA.get(t, [])
            # Suggest closest match
            import difflib
            close = difflib.get_close_matches(c, valid, n=2, cutoff=0.6)
            hint = f"  did you mean: {', '.join(close)}" if close else ""
            print(f"  {t}.{c}  ({len(locs)} refs){hint}")
            for f, u, l in locs[:5]:
                print(f"    - {f}:{l}  ({u})")
            if len(locs) > 5:
                print(f"    ... +{len(locs) - 5} more")
    else:
        print("✅ No drift detected.")

    # Return non-zero on drift so CI fails loudly. Set
    # SCHEMA_DRIFT_AUDIT_SOFT=1 locally if you want the report without the
    # exit code (useful while actively iterating).
    if uniq and not os.environ.get("SCHEMA_DRIFT_AUDIT_SOFT"):
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main() or 0)
