#!/usr/bin/env python3
"""Convert raw Google Sheets workout data to workout-tracker JSON format."""

import json
import re
import sys
from datetime import datetime, timedelta

RAW_FILE = "raw_sheets_data.txt"
OUTPUT_FILE = "backfill_data.json"

# Map tab names to actual Monday dates
TAB_DATES = {
    "5/5/25":   "2025-05-05",
    "5/12":     "2025-05-12",
    "5/19":     "2025-05-19",
    "5/27":     "2025-05-27",  # Tuesday, but treat as week start
    "6/2":      "2025-06-02",
    "6-9":      "2025-06-09",
    "6-16":     "2025-06-16",
    "6-23":     "2025-06-23",
    "6-30":     "2025-06-30",
    "7-7":      "2025-07-07",
    "7-14":     "2025-07-14",
    "7-21":     "2025-07-21",
    "7-28":     "2025-07-28",
    "8-4":      "2025-08-04",
    "8-11":     "2025-08-11",
    "8-18":     "2025-08-18",
    "8-25":     "2025-08-25",
    "9-1":      "2025-09-01",
    "9-22":     "2025-09-22",
    "10-13":    "2025-10-13",
    "10-20":    "2025-10-20",
    "10-27":    "2025-10-27",
    "11-3":     "2025-11-03",
    "11-10":    "2025-11-10",
    "11-17":    "2025-11-17",
    "11-24":    "2025-11-24",
    "12-1":     "2025-12-01",
    "12-8":     "2025-12-08",
    "12-15":    "2025-12-15",
    "12-22":    "2025-12-22",
    "12-29":    "2025-12-29",
    "1-5":      "2026-01-05",
    "1-12":     "2026-01-12",
    "1-19":     "2026-01-19",
    "1-26":     "2026-01-26",
    "2-2":      "2026-02-02",
    "2-9":      "2026-02-09",
    "2-16":     "2026-02-16",
    "2-23":     "2026-02-23",
    "3-2":      "2026-03-02",
    "3-9":      "2026-03-09",
    "3-16":     "2026-03-16",
    "3-23":     "2026-03-23",
}

# Day offsets for workout groups within a week
# Push=Mon, Pull=Wed, Legs=Fri, Arm=Sat, Core gets merged
DAY_OFFSETS = {
    "push": 0,       # Monday
    "pull": 2,       # Wednesday
    "leg": 4,        # Friday
    "arm": 5,        # Saturday
    "full": 0,       # Monday
    "set": 1,        # Tuesday (e.g., "Set w/ Isaac")
    "core": None,    # Merged into the day before it
}

def get_workout_type(header):
    """Determine workout type from column header."""
    h = header.lower().strip()
    if "push" in h:
        return "push"
    if "pull" in h:
        return "pull"
    if "leg" in h:
        return "leg"
    if "arm" in h:
        return "arm"
    if "full" in h:
        return "full"
    if "core" in h:
        return "core"
    if "set w/" in h or "set with" in h:
        return "set"
    return None

def parse_sets_reps(sets_str):
    """Parse sets/reps string like '3(15)' or '3(10,8,8)' or '3(10 each leg)'."""
    s = sets_str.strip()
    if not s:
        return []

    # Match patterns like "3(15)", "3(10-12)", "3(10,8,8)", "3(10 each leg)"
    m = re.match(r'(\d+)\((.+?)\)', s)
    if not m:
        # Try "Sets(reps) 3(15)" format (header row with inline data)
        m = re.match(r'Sets?\(reps?\)\s*(\d+)\((.+?)\)', s, re.IGNORECASE)
        if not m:
            return []

    num_sets = int(m.group(1))
    reps_part = m.group(2).strip()

    # Remove "each leg" etc.
    reps_part = re.sub(r'\s*(each\s+leg|each|per side).*', '', reps_part, flags=re.IGNORECASE)

    # Check if individual set reps are specified: "10,8,8"
    if ',' in reps_part:
        reps_list = []
        for r in reps_part.split(','):
            r = r.strip()
            try:
                reps_list.append(int(float(r)))
            except ValueError:
                reps_list.append(10)  # fallback
        # Pad or trim to num_sets
        while len(reps_list) < num_sets:
            reps_list.append(reps_list[-1] if reps_list else 10)
        return reps_list[:num_sets]

    # Check for range: "10-12"
    range_m = re.match(r'(\d+)\s*-\s*(\d+)', reps_part)
    if range_m:
        avg = (int(range_m.group(1)) + int(range_m.group(2))) // 2 + 1
        return [avg] * num_sets

    # Check for "secs" (planks etc.)
    if 'sec' in reps_part.lower():
        secs_m = re.search(r'(\d+)', reps_part)
        if secs_m:
            return [int(secs_m.group(1))] * num_sets
        return [60] * num_sets

    # Simple number
    try:
        reps = int(float(reps_part))
        return [reps] * num_sets
    except ValueError:
        return [10] * num_sets

def parse_weight(weight_str):
    """Parse weight string, extract numeric value in lbs."""
    w = weight_str.strip()
    if not w:
        return 0

    # Handle "none", "NA", "red band", etc.
    lower = w.lower()
    if lower in ('', 'none', 'na', 'idk'):
        return 0
    if 'band' in lower:
        return 0

    # Handle special cases
    # "25 on each side" -> barbell, so 25*2 + 45 bar... actually just extract first number
    # "40s" -> 40 (dumbbells)
    # "EZ bar 10s" -> 10
    # "190 lbs (Albany)" -> 190
    # "35 lbs X2 then 35 lbs" -> 35
    # "37.5 lbs X2 then 35 lbs" -> 37.5

    # Try to find first number
    m = re.search(r'(\d+\.?\d*)', w)
    if m:
        return float(m.group(1))

    return 0

def parse_csv_line(line):
    """Parse a CSV line respecting quotes."""
    fields = []
    current = ""
    in_quotes = False
    for ch in line:
        if ch == '"':
            in_quotes = not in_quotes
        elif ch == ',' and not in_quotes:
            fields.append(current)
            current = ""
        else:
            current += ch
    fields.append(current)
    return fields

def parse_tab_data(lines):
    """Parse a tab's CSV lines into workout groups (columns of 3)."""
    if not lines:
        return []

    # Parse all rows
    rows = [parse_csv_line(line) for line in lines if line.strip()]
    if not rows:
        return []

    # First row has headers - determine workout groups
    header_row = rows[0]
    groups = []  # list of (type, col_start)

    i = 0
    while i < len(header_row):
        cell = header_row[i].strip()
        if cell:
            wtype = get_workout_type(cell)
            if wtype:
                groups.append((wtype, i))
                i += 3
                continue
        i += 1

    # For each group, extract exercises from subsequent rows
    workout_groups = []
    for wtype, col_start in groups:
        exercises = []
        for row in rows[1:]:  # skip header
            if col_start >= len(row):
                continue
            name = row[col_start].strip() if col_start < len(row) else ""
            sets_str = row[col_start + 1].strip() if col_start + 1 < len(row) else ""
            weight_str = row[col_start + 2].strip() if col_start + 2 < len(row) else ""

            if not name or not sets_str:
                continue

            # Skip notes/comments (no sets data)
            reps_list = parse_sets_reps(sets_str)
            if not reps_list:
                # Check if the header row itself has inline set data
                # e.g., "Push dominant DB bench" with "Sets(reps) 3(15)" and "weight 40s"
                continue

            # Skip meta notes like "Skipped", "Ran X miles", etc.
            lower_name = name.lower()
            if any(skip in lower_name for skip in ['skipped', 'ran ', 'miles', 'hiked', 'albany', 'out of town', 'not much', 'shoulders difficult', 'hamstrings tight', 'cabin']):
                continue

            weight = parse_weight(weight_str)
            sets = [{"reps": r, "weight": weight} for r in reps_list]
            exercises.append({"name": name, "sets": sets})

        if exercises:
            workout_groups.append((wtype, exercises))

    # Also check if first row has inline exercise data (like the 5/5/25 tab)
    # e.g., "Push dominant DB bench", "Sets(reps) 3(15)", "weight 40s"
    for wtype, col_start in groups:
        cell = header_row[col_start].strip()
        # Check if the header contains an exercise name embedded
        # Pattern: "Push dominant DB bench" or "Leg dominant back squat"
        m = re.match(r'(?:Push|Pull|Leg|Full)\s+dominant\s+(.+)', cell, re.IGNORECASE)
        if m:
            exercise_name = m.group(1).strip()
            sets_str = header_row[col_start + 1] if col_start + 1 < len(header_row) else ""
            weight_str = header_row[col_start + 2] if col_start + 2 < len(header_row) else ""
            reps_list = parse_sets_reps(sets_str)
            if reps_list:
                weight = parse_weight(weight_str)
                sets = [{"reps": r, "weight": weight} for r in reps_list]
                # Find the group and prepend
                for i, (gt, exs) in enumerate(workout_groups):
                    if gt == wtype:
                        workout_groups[i] = (gt, [{"name": exercise_name, "sets": sets}] + exs)
                        break

    return workout_groups

def main():
    with open(RAW_FILE, 'r') as f:
        content = f.read()

    # Split into tabs
    tab_sections = re.split(r'=== TAB: (.+?) ===', content)
    # tab_sections: ['', 'tab_name', 'tab_content', 'tab_name', 'tab_content', ...]

    all_workouts = {}
    exercise_count = 0
    id_counter = 0

    for i in range(1, len(tab_sections), 2):
        tab_name = tab_sections[i].strip()
        tab_content = tab_sections[i + 1].strip()

        if tab_name == "2026!!!":
            continue

        if tab_name not in TAB_DATES:
            print(f"Warning: Unknown tab '{tab_name}', skipping")
            continue

        monday_str = TAB_DATES[tab_name]
        monday = datetime.strptime(monday_str, "%Y-%m-%d")

        lines = [l for l in tab_content.split('\n') if l.strip() and not l.startswith('(No CSV')]
        if not lines:
            continue

        workout_groups = parse_tab_data(lines)

        # Assign days based on workout type
        used_offsets = set()
        for wtype, exercises in workout_groups:
            if wtype == "core":
                continue  # merge core later

            offset = DAY_OFFSETS.get(wtype, 0)
            # Avoid date collisions
            while offset in used_offsets:
                offset += 1
            used_offsets.add(offset)

            date = monday + timedelta(days=offset)
            date_str = date.strftime("%Y-%m-%d")

            if date_str not in all_workouts:
                all_workouts[date_str] = []

            for ex in exercises:
                id_counter += 1
                ex["id"] = f"bf{id_counter:04d}"
                all_workouts[date_str].append(ex)
                exercise_count += 1

        # Merge core exercises into the last assigned date
        for wtype, exercises in workout_groups:
            if wtype != "core":
                continue
            # Find the most recent date we assigned
            if used_offsets:
                last_offset = max(used_offsets)
                date = monday + timedelta(days=last_offset)
                date_str = date.strftime("%Y-%m-%d")
            else:
                date_str = monday_str

            if date_str not in all_workouts:
                all_workouts[date_str] = []

            for ex in exercises:
                id_counter += 1
                ex["id"] = f"bf{id_counter:04d}"
                all_workouts[date_str].append(ex)
                exercise_count += 1

    # Sort by date
    sorted_workouts = dict(sorted(all_workouts.items()))

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(sorted_workouts, f, indent=2)

    print(f"Converted {exercise_count} exercises across {len(sorted_workouts)} days")
    print(f"Date range: {min(sorted_workouts.keys())} to {max(sorted_workouts.keys())}")
    print(f"Output: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
