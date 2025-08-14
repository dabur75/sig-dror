# Scheduling Algorithm Bible

Authoritative rules that govern how scheduling works across the system. This is the single source of truth for behavior and terminology.

## Core Definitions
- Weekdays: Sunday–Thursday (Sun=0, Mon=1, Tue=2, Wed=3, Thu=4)
- Weekend: Friday–Saturday (Fri=5, Sat=6)
- Weekend types (persisted in DB table `weekend_types`):
  - Open weekend: regular shifts on Fri/Sat
  - Closed weekend: Friday has Standby (כונן), Saturday has Standby + Motzash (מוצ״ש)
- Date normalization: Closed/Open flags are STORED ON FRIDAYS. Saturday queries read Friday’s flag.

## Scheduling Modes
1) Manual Scheduling
- Manual assignments override everything else.
- Persisted with `is_manual = true` and honored as-is.
- Auto never changes locked/manual days.

2) Auto Scheduling
- Goal: fill remaining days while honoring constraints, fairness, and weekend rules.
- Phases:
  1. Data preparation
     - Load guides, constraints (one-time + fixed), vacations, existing schedule, coordinator rules
     - Load weekend types for the month (Fridays) and mirror to Saturday in memory
     - Generate day objects for each calendar day with weekday info
  2. Per-day requirements
     - Weekday (Sun–Thu): two guides, roles ["רגיל","חפיפה"]
     - Open Fri/Sat: weekend=true (two guides like weekday unless closed logic applies)
     - Closed Friday (flag on Friday): one guide, role ["כונן"], links to Saturday
     - Closed Saturday (flag found on previous Friday): two roles ["כונן","מוצ״ש"], Friday’s standby continues, add Motzash guide
  3. Candidate evaluation
     - Compute each guide’s availability with reasons; produce `available` boolean and `score` (lower=better)
     - Exclude guides blocked by constraints/vacations
  4. Selection
     - Sort available by score and pick optimal pair (or single for closed Friday, or standby+motzash for closed Saturday)
  5. Persist
     - Insert/update schedule rows with roles, `is_manual=false`, and link closed-weekend pairs when relevant

## Traffic-Light System (Workload Heuristics)
Used both in UI hints and backend selection safety checks.
- Green (preferred): default when loads are moderate
- Yellow (caution):
  - totalShifts > 8 in the month
  - weekendShifts ≥ 3 in the month
  - standbyShifts ≥ 2 in the month
  - worked exactly 2 days ago (recommend rest)
- Red (blocked/avoid):
  - weekendShifts ≥ 4
  - totalShifts ≥ 12
  - hard constraints (vacation, personal/fixed constraints) or coordinator blocking rules

## Balancing & Fairness
- Track per-guide stats in context:
  - totalShifts, weekendShifts, standbyShifts, motzashShifts, lastShiftDate
- Preference given to guides with fewer shifts (fair distribution)
- Prefer spreading weekend work (limit per-month caps)
- Avoid consecutive heavy patterns (recent work penalties)
- No back-to-back days: a guide must not be scheduled on two consecutive days, except for closed-weekend pairing (Friday standby continues to Saturday).
- Respect coordinator rules (e.g., no automatic weekends for specific guides)

## Weekend Logic (Israel: Fri–Sat)
- Fri (5), Sat (6) are the only weekend days
- Closed weekend behavior:
  - Friday: assign one Standby (כונן). This assignment continues into Saturday.
  - Saturday: use Friday’s Standby + add a Motzash (מוצ״ש) guide (prefer different person)
- Open weekend behavior:
  - Friday/Saturday treated as regular weekend days (two roles: רגיל/חפיפה)
- Persistence:
  - Only Friday holds the is_closed flag in `weekend_types` table.
  - Saturday checks Friday’s flag for behavior.

## Weekend Scheduling Implementation Notes
- **Closed Friday**: Assigns 1 guide as כונן, automatically continues to Saturday
- **Closed Saturday**: Same כונן guide continues + different guide joins as מוצ״ש
- **Workload Tracking**: כונן guide counts as 2 shifts (Friday + Saturday)
- **Guide Selection**: מוצ״ש guide must be different from כונן guide
- **Automatic Linking**: Friday כונן assignment automatically creates Saturday כונן assignment

## Week & Calendar Rules
- Weeks run Sunday → Saturday in both UI and logic
- Day-of-week mapping is always JavaScript `getDay()` and Postgres `EXTRACT(DOW ...)`:
  - 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
- All date math uses local-midnight normalization to avoid timezone drift (no UTC off-by-one).

## Constraints Hierarchy (from strongest to weakest)
1. Manual assignments and locked days
2. Hard constraints (vacations, personal/fixed constraints)
3. Weekend type rules (closed/open) and role composition
4. Traffic-light red thresholds (block)
5. Balancing/fairness and yellow cautions (affect score/order)

## Roles Glossary
- רגיל (Regular)
- חפיפה (Overlap/Shadow)
- כונן (Standby) — only on closed Friday and continues to Saturday
- מוצ״ש (Motzash) — only on closed Saturday

## Invariants
- No schedule may assign a guide who is blocked by a hard constraint on that date.
- Closed Saturday must have the same Standby guide as the linked Friday.
- Saturday Motzash must be different from Friday’s Standby when possible.
- Weekend counts (Fri/Sat) are tracked for fairness thresholds.

## API & Data Notes
- Weekend types monthly fetch returns Friday flags only (dates normalized to YYYY-MM-DD in local time).
- Setting a weekend type on a Saturday will be stored on the prior Friday.
- Schedule rows include `is_manual` and role fields per day.

## Operational Checklist
- Manual before auto: apply manual/locked changes, then run auto for the month.
- After auto, review traffic-light hints and adjust manually as needed.
- For closed weekends, verify Friday standby and Saturday standby+motzash pairing.

This document is the reference for future changes. Any modification to logic should update this file and include migration/UX notes as needed.
