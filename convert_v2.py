#!/usr/bin/env python3
"""Convert raw Google Sheets workout data to v2 session-based format.

v2 format: { "2025-05-05": { "sessions": [{ "id", "type", "exercises": [...] }] } }
Key = Monday of the week.
"""

import json
import re
from datetime import datetime, timedelta

RAW_FILE = "raw_sheets_data.txt"
OUTPUT_FILE = "backfill_data.json"

TAB_DATES = {
    "5/5/25": "2025-05-05", "5/12": "2025-05-12", "5/19": "2025-05-19",
    "5/27": "2025-05-27", "6/2": "2025-06-02", "6-9": "2025-06-09",
    "6-16": "2025-06-16", "6-23": "2025-06-23", "6-30": "2025-06-30",
    "7-7": "2025-07-07", "7-14": "2025-07-14", "7-21": "2025-07-21",
    "7-28": "2025-07-28", "8-4": "2025-08-04", "8-11": "2025-08-11",
    "8-18": "2025-08-18", "8-25": "2025-08-25", "9-1": "2025-09-01",
    "9-22": "2025-09-22", "10-13": "2025-10-13", "10-20": "2025-10-20",
    "10-27": "2025-10-27", "11-3": "2025-11-03", "11-10": "2025-11-10",
    "11-17": "2025-11-17", "11-24": "2025-11-24", "12-1": "2025-12-01",
    "12-8": "2025-12-08", "12-15": "2025-12-15", "12-22": "2025-12-22",
    "12-29": "2025-12-29", "1-5": "2026-01-05", "1-12": "2026-01-12",
    "1-19": "2026-01-19", "1-26": "2026-01-26", "2-2": "2026-02-02",
    "2-9": "2026-02-09", "2-16": "2026-02-16", "2-23": "2026-02-23",
    "3-2": "2026-03-02", "3-9": "2026-03-09", "3-16": "2026-03-16",
    "3-23": "2026-03-23",
}

TYPE_MAP = {
    "push": "Push",
    "pull": "Pull",
    "leg": "Legs",
    "arm": "Arms",
    "full": "Full Body",
    "set": "Full Body",
    "core": "Core",
}


def get_workout_type(header):
    h = header.lower().strip()
    if "push" in h: return "push"
    if "pull" in h: return "pull"
    if "leg" in h: return "leg"
    if "arm" in h: return "arm"
    if "full" in h: return "full"
    if "core" in h: return "core"
    if "set w/" in h or "set with" in h: return "set"
    return None


def parse_sets_reps(sets_str):
    s = sets_str.strip()
    if not s: return []
    m = re.match(r'(\d+)\((.+?)\)', s)
    if not m:
        m = re.match(r'Sets?\(reps?\)\s*(\d+)\((.+?)\)', s, re.IGNORECASE)
        if not m: return []
    num_sets = int(m.group(1))
    reps_part = m.group(2).strip()
    reps_part = re.sub(r'\s*(each\s+leg|each|per side).*', '', reps_part, flags=re.IGNORECASE)
    if ',' in reps_part:
        reps_list = []
        for r in reps_part.split(','):
            try: reps_list.append(int(float(r.strip())))
            except: reps_list.append(10)
        while len(reps_list) < num_sets: reps_list.append(reps_list[-1] if reps_list else 10)
        return reps_list[:num_sets]
    range_m = re.match(r'(\d+)\s*-\s*(\d+)', reps_part)
    if range_m:
        avg = (int(range_m.group(1)) + int(range_m.group(2))) // 2 + 1
        return [avg] * num_sets
    if 'sec' in reps_part.lower():
        secs_m = re.search(r'(\d+)', reps_part)
        return [int(secs_m.group(1))] * num_sets if secs_m else [60] * num_sets
    try: return [int(float(reps_part))] * num_sets
    except: return [10] * num_sets


def parse_weight(weight_str):
    w = weight_str.strip()
    if not w: return 0
    lower = w.lower()
    if lower in ('', 'none', 'na', 'idk'): return 0
    if 'band' in lower: return 0
    m = re.search(r'(\d+\.?\d*)', w)
    return float(m.group(1)) if m else 0


# Keywords that identify equipment type from exercise name

# --- Equipment type detection ---
# Single DB (one dumbbell, both hands or one hand): keep as-is
SINGLE_DB_KEYWORDS = ['goblet', 'kettleball', 'kettle', 'single arm db']
# Dumbbell (one in each hand): ×2
DB_KEYWORDS = ['db ', 'db bench', 'dumbbell', 'dumbell', 'hammer curl', 'incline db',
               'db shoulder', 'db lateral', 'db front', 'db chest', 'db fly', 'db flys',
               'db standing row', 'db curl', 'db bulgarian',
               'seated incline db', 'seated db', 'incline db curl']
BB_KEYWORDS = ['bb ', 'bb bench', 'barbell', 'bb overhead', 'bb squat', 'bb back squat',
               'bb deadlift', 'bb row', 'incline bb', 'bent over bb', 'rdl']
EZ_KEYWORDS = ['ez bar']
# Leg press: weight per side ×2
LEG_PRESS_KEYWORDS = ['leg press']
# Lunges with dumbbells: ×2
LUNGE_KEYWORDS = ['lunge', 'reverse lunge', 'forward lunge']
# Machine/cable/smith/band/bodyweight => no adjustment
MACHINE_KEYWORDS = ['machine', 'cable', 'peck deck', 'lat pulldown', 'seated cable',
                    'leg extension', 'hip abduction', 'hip adduction',
                    'tricep extension machine', 'lat raise machine', 'reverse fly',
                    'rear delt', 'smith', 'leg curl', 'calf raise', 'sitting calf',
                    'straight bar push', 'band pull', 'pushdown', 'rope extension',
                    'upright cable', 'chest press machine', 'decline exercise ball',
                    'russian twist', 'penguin', 'plank', 'knee up', 'leg up',
                    'peck deck machine', 'rear delt machine']


def get_equipment_type(exercise_name):
    """Determine equipment type from exercise name."""
    name = exercise_name.lower().strip()

    # Check single-DB first (goblet squat, kettlebell, single arm)
    for kw in SINGLE_DB_KEYWORDS:
        if kw in name:
            return 'single_db'

    # Machine/cable (most specific patterns)
    for kw in MACHINE_KEYWORDS:
        if kw in name:
            return 'machine'

    # Leg press: per side ×2
    for kw in LEG_PRESS_KEYWORDS:
        if kw in name:
            return 'leg_press'

    # Lunges (DB in each hand)
    for kw in LUNGE_KEYWORDS:
        if kw in name:
            return 'dumbbell'

    # EZ bar before BB
    for kw in EZ_KEYWORDS:
        if kw in name:
            return 'ez_bar'

    # Barbell
    for kw in BB_KEYWORDS:
        if kw in name:
            return 'barbell'

    # Dumbbell (pair)
    for kw in DB_KEYWORDS:
        if kw in name:
            return 'dumbbell'

    return 'machine'


# Canonical exercise name mapping — normalize all variants
NAME_MAP = {
    # Barbell
    "bb bench": "BB Bench Press",
    "bb bench press": "BB Bench Press",
    "incline bb press": "Incline BB Bench Press",
    "bb overhead press": "BB Overhead Press",
    "bb back squat": "BB Back Squat",
    "back squat": "BB Back Squat",
    "bb squat": "BB Back Squat",
    "bb deadlift": "BB Deadlift",
    "rdl": "BB RDL",
    "bb row": "BB Bent Over Row",
    "barbell row": "BB Bent Over Row",
    "bent over bb row": "BB Bent Over Row",

    # Dumbbell
    "db bench": "DB Bench Press",
    "db bench press": "DB Bench Press",
    "incline db bench": "Incline DB Bench Press",
    "incline db press": "Incline DB Bench Press",
    "db flys": "DB Chest Fly",
    "db chest fly": "DB Chest Fly",
    "db shoulder press": "DB Shoulder Press",
    "db lateral raises": "DB Lateral Raises",
    "db lat raises": "DB Lateral Raises",
    "lat raises": "DB Lateral Raises",
    "lateral raises": "DB Lateral Raises",
    "db front raises": "DB Front Raises",
    "db standing rows": "DB Upright Row",
    "db goblet squat": "DB Goblet Squat",
    "goblet squat": "DB Goblet Squat",
    "goblet squats": "DB Goblet Squat",
    "db front squat": "DB Front Squat",
    "db bulgarian split": "DB Bulgarian Split Squat",
    "db lunges": "DB Lunges",
    "db preacher curl": "DB Preacher Curl",
    "hammer curls": "Hammer Curls",
    "seated incline db curls": "Seated Incline DB Curls",
    "incline db curl": "Seated Incline DB Curls",
    "incline db curls": "Seated Incline DB Curls",
    "single arm db curl": "Single Arm DB Curl",
    "seated bicep curls": "Seated DB Curls",
    "standing bicep curls": "Standing DB Curls",
    "seated db hammer curls": "Seated DB Hammer Curls",
    "kettleball swings": "Kettlebell Swings",

    # EZ Bar
    "ez bar preacher curls": "EZ Bar Preacher Curls",

    # Cable / Machine
    "cable curls": "Cable Curls",
    "cable bicep curls": "Cable Curls",
    "cable straight bar pushdowns": "Cable Straight Bar Pushdowns",
    "straight bar pushdowns": "Cable Straight Bar Pushdowns",
    "straight bar push down": "Cable Straight Bar Pushdowns",
    "tricep rope extensions": "Tricep Rope Extensions",
    "tricep extension machine": "Tricep Extension Machine",
    "trciep extension machine": "Tricep Extension Machine",
    "seated cable row": "Seated Cable Row",
    "seated cable row wide grip": "Seated Cable Row (Wide Grip)",
    "lat pulldowns": "Lat Pulldowns",
    "lat pulldown": "Lat Pulldowns",
    "upright cable rows": "Upright Cable Rows",
    "chest press machine": "Chest Press Machine",
    "machine chest press": "Chest Press Machine",
    "machine incline chest press": "Incline Chest Press Machine",
    "incline bench machine": "Incline Chest Press Machine",
    "peck deck": "Pec Deck",
    "peck deck machine": "Pec Deck",
    "reverse fly": "Reverse Fly Machine",
    "rear delt machine": "Rear Delt Machine",
    "machine rear delt": "Rear Delt Machine",
    "lat raise machine": "Lat Raise Machine",
    "leg extensions": "Leg Extensions",
    "leg press": "Leg Press",
    "leg curls": "Leg Curls",
    "hip abduction": "Hip Abduction",
    "hip abduction (out)": "Hip Abduction",
    "hip adduction": "Hip Adduction",
    "hip adduction (in)": "Hip Adduction",
    "smith calf raises": "Smith Calf Raises",
    "standing calf raises": "Standing Calf Raises",
    "calf raises": "Calf Raises",
    "sitting calf raises": "Seated Calf Raises",
    "smith squat": "Smith Squat",

    # Lunges
    "lunges": "Lunges",
    "reverse lunges": "Reverse Lunges",
    "forward lunges": "Forward Lunges",

    # Bands
    "band pull aparts": "Band Pull Aparts",
    "resistance band curls": "Resistance Band Curls",

    # Core
    "decline exercise ball sit-ups": "Decline Ball Sit-Ups",
    "decline bench sit-ups": "Decline Bench Sit-Ups",
    "russian twist": "Russian Twists",
    "penguins": "Penguins",
    "planks": "Planks",
    "knee ups": "Knee Ups",
    "leg ups": "Leg Ups",

    # Preacher curl (DB)
    "preacher curl": "DB Preacher Curl",
}


def normalize_name(name):
    """Normalize exercise name to canonical form."""
    key = name.lower().strip()
    return NAME_MAP.get(key, name)


def adjust_weight(raw_weight, exercise_name):
    """Convert recorded weight to actual total weight moved."""
    if raw_weight == 0:
        return 0

    etype = get_equipment_type(exercise_name)

    if etype == 'dumbbell':
        return raw_weight * 2          # weight per hand × 2
    elif etype == 'barbell':
        return (raw_weight * 2) + 45   # weight per side × 2 + 45lb bar
    elif etype == 'ez_bar':
        return (raw_weight * 2) + 15   # weight per side × 2 + ~15lb EZ bar
    elif etype == 'leg_press':
        return raw_weight * 2          # weight per side × 2
    elif etype == 'single_db':
        return raw_weight              # one DB, as-is
    else:
        return raw_weight              # machine/cable/bodyweight: as-is


def parse_csv_line(line):
    fields, current, in_quotes = [], "", False
    for ch in line:
        if ch == '"': in_quotes = not in_quotes
        elif ch == ',' and not in_quotes: fields.append(current); current = ""
        else: current += ch
    fields.append(current)
    return fields


def parse_tab_data(lines):
    rows = [parse_csv_line(l) for l in lines if l.strip()]
    if not rows: return []
    header_row = rows[0]
    groups = []
    i = 0
    while i < len(header_row):
        cell = header_row[i].strip()
        if cell:
            wtype = get_workout_type(cell)
            if wtype:
                groups.append((wtype, i))
                i += 3; continue
        i += 1

    workout_groups = []
    for wtype, col_start in groups:
        exercises = []
        for row in rows[1:]:
            if col_start >= len(row): continue
            name = row[col_start].strip() if col_start < len(row) else ""
            sets_str = row[col_start + 1].strip() if col_start + 1 < len(row) else ""
            weight_str = row[col_start + 2].strip() if col_start + 2 < len(row) else ""
            if not name or not sets_str: continue
            reps_list = parse_sets_reps(sets_str)
            if not reps_list: continue
            lower_name = name.lower()
            if any(s in lower_name for s in ['skipped', 'ran ', 'miles', 'hiked', 'albany',
                'out of town', 'not much', 'shoulders difficult', 'hamstrings tight', 'cabin',
                'push workout hotel']): continue
            canonical = normalize_name(name)
            raw_weight = parse_weight(weight_str)
            weight = adjust_weight(raw_weight, canonical)
            sets = [{"reps": r, "weight": weight} for r in reps_list]
            exercises.append({"name": canonical, "sets": sets})
        if exercises:
            workout_groups.append((wtype, exercises))

    # Check for inline exercises in header row
    for wtype, col_start in groups:
        cell = header_row[col_start].strip()
        m = re.match(r'(?:Push|Pull|Leg|Full)\s+dominant\s+(.+)', cell, re.IGNORECASE)
        if m:
            name = m.group(1).strip()
            sets_str = header_row[col_start + 1] if col_start + 1 < len(header_row) else ""
            weight_str = header_row[col_start + 2] if col_start + 2 < len(header_row) else ""
            reps_list = parse_sets_reps(sets_str)
            if reps_list:
                canonical = normalize_name(name)
                raw_weight = parse_weight(weight_str)
                weight = adjust_weight(raw_weight, canonical)
                sets = [{"reps": r, "weight": weight} for r in reps_list]
                name = canonical
                for i, (gt, exs) in enumerate(workout_groups):
                    if gt == wtype:
                        workout_groups[i] = (gt, [{"name": name, "sets": sets}] + exs)
                        break
    return workout_groups


def main():
    with open(RAW_FILE, 'r') as f:
        content = f.read()

    tab_sections = re.split(r'=== TAB: (.+?) ===', content)
    all_weeks = {}
    id_counter = 0

    for i in range(1, len(tab_sections), 2):
        tab_name = tab_sections[i].strip()
        tab_content = tab_sections[i + 1].strip()
        if tab_name == "2026!!!" or tab_name not in TAB_DATES:
            continue

        monday_str = TAB_DATES[tab_name]
        lines = [l for l in tab_content.split('\n') if l.strip() and not l.startswith('(No CSV')]
        if not lines: continue

        workout_groups = parse_tab_data(lines)
        if not workout_groups: continue

        sessions = []
        for wtype, exercises in workout_groups:
            id_counter += 1
            session_type = TYPE_MAP.get(wtype, "Custom")
            # Give each exercise an id
            for ex in exercises:
                id_counter += 1
                ex["id"] = f"bf{id_counter:04d}"

            id_counter += 1
            sessions.append({
                "id": f"bs{id_counter:04d}",
                "type": session_type,
                "exercises": exercises
            })

        if sessions:
            if monday_str in all_weeks:
                all_weeks[monday_str]["sessions"].extend(sessions)
            else:
                all_weeks[monday_str] = {"sessions": sessions}

    sorted_weeks = dict(sorted(all_weeks.items()))
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(sorted_weeks, f, indent=2)

    total_exercises = sum(
        len(ex) for w in sorted_weeks.values() for s in w["sessions"] for ex in [s["exercises"]]
    )
    total_sessions = sum(len(w["sessions"]) for w in sorted_weeks.values())
    print(f"Converted {total_exercises} exercises in {total_sessions} sessions across {len(sorted_weeks)} weeks")
    print(f"Date range: {min(sorted_weeks.keys())} to {max(sorted_weeks.keys())}")


if __name__ == "__main__":
    main()
