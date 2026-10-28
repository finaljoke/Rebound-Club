# Round 2 independent implementation review

Reviewer: `rally_balance_round2_review`, fresh read-only agent. Base `19226fc`; reviewed Round 2 B4/F/core/simulator changes against the approved Amendments 第 2 轮. No files, index or commits were mutated; no further reviewers were spawned.

## Verdict and scope

No demonstrated Critical/Important implementation bug or unauthorized rule change was found in the reviewed B4/F code and new measurement protocol. This is not acceptance: the experiment fails approved goals and full-match validity, so keep `implementing` and ask before any additional mechanism.

The reviewer personally ran the then-current 36 core tests, all passed. The later optional normal-corner placement parameter (default disabled) and selected numeric tuning were not re-reviewed; the implementer's fresh 182-test suite and browser checks are documented in `02-implementation.md`. No second review was requested as a substitute for direct verification.

## Findings checked

- Heavy chain resets only on successful counter or point end; ordinary soft return preserves it.
- Pressure is an exact multiplier of the original same-pose/base-target 3D launch speed. The widened target is then solved ballistically at that speed. Flight time is not merely divided to approximate a speed multiplier.
- World-space player targets depend on t, normalize t=0, are monotone, and use a same-side wall before landing for |t|≥.7.
- Incoming-ball classification is real returned/missed/opponent-fault/unresolved. Only returned+missed are in legal failure-rate denominators; ordinary includes serves.
- The tenth N/.25 control really disables heavy selection in the core; ten-group shape, 500s maximum and 200-match acceptance scale are checked.

## Evidence about failed balance, not a code defect

At initial .12 ramp / 1.36 cap / 3.8 chase, the full initial dataset shows C/.25=7.6639% and N/.25=38.9335%; heavy miss rates C17.7596% / N5.6601%. The reviewer found no aggregation mix-up.

With seed 1875895933, N/.12 continued legally to heavy chain 124; one point lasted 256 hits. It finally scored through an incidental counter of a stronger high-chain shot. Two such N counters launched at 12.0118 and 12.2813, while early deliberate C counters in the same-seed diagnostic launched around 8.39–9.82. Counter pressure reset plus speed borrowing and center targets provide a plausible local explanation of why an early counter can earn less advantage; this is trajectory evidence, not full-sample causal proof.

C's first three losses in that diagnostic were third-level heavies. All 16 active swing frames missed lateral reach; height was valid in all frames and depth in 9–10. The player did not reach the ball; no missing counter event or scoring bug was identified.

## Final experiment supplied by implementer

After 36 small-scale parameter trials and a full default check, the selected A/12 candidate was rerun twice at 200 matches in each of ten groups. Both JSON and stdout are byte-identical. Numeric results: no-heavy median11, N per-ball pressure gap16.5572pp, C−S29.8548pp; C−N−13.1450pp, skilled C93.6330%, novice N58.1818%. Three unfinished matches remain (2 skilled S, 1 no-heavy control), so acceptance is false regardless of the three numeric rows met. These final results were verified by the implementer, not re-run by the reviewer.

## Items left for design/user decision

The approved B4/F mechanisms are implemented, but the data do not establish that deliberate countering is the better overall strategy or that every group finishes. Further mechanisms, counter reward changes or timeout scoring would exceed this round's authorization and require a new answer. Thresholds and sigma remain unchanged.
