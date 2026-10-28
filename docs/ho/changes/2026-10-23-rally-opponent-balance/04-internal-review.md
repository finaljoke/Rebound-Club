# Independent internal review — round 1

Reviewer: `rally_balance_review`, separate read-only agent, fresh context. Design and code were reviewed against baseline `0040c3a`; reviewer did not edit the worktree or dispatch additional agents. This is implementation-side review, not the relay acceptance review and not permission to mark the change complete.

## Verdict

Keep `implementing`: the balance experiment has not met all approved goals or full-match validity. No threshold or rule change was authorized by the review.

## Important findings and implementation response

1. **Unreturned opponent faults misclassified as whiffs.** Earlier `pendingHeavy` handling added `whiff` even when the opponent's own heavy shot went out. Reviewer counted 431 such false whiff wins in preliminary candidate A / N / σ=.25. Response: new `pointFacts` classifies opponent faults separately as `opponent-fault`, tested for net/out/own-half, while missed legal heavy returns remain `whiff`. New regression failed before implementation and passed after it. All earlier JSON files are superseded diagnostics for this grouping.
2. **Challenge mode showed the heavy-specific textual banner.** The initial hint split hid only the counter-window label/highlight. Response: challenge now hides the heavy-specific banner too; practice retains it. The unchanged renderer still shows windup, ring and racket glow, and charge audio remains common. Browser QA checks banner visibility on every HUD frame as well as counter text/highlight and all three visual tells plus charge sound.
3. **Empty-side choice used a shared approximate strike position/time.** Reviewer's independent real-state branch probes found two wrong-side selections among 35 ordinary balls. Response: `timingOption` now independently clones and advances the actual rules for +0.5 and -0.5, with the same .18s lateral reaction and common movement policy, then compares the actual landing gap at each actual hit. Only after choosing direction is the Gaussian timing noise added. New regression verifies separate hit times, real positions and no mutation of the live state; RED→GREEN. All final experiments are rerun with `experiment.controller=real-rule-branches-v1`.

## Experimental limitations identified by reviewer

- S faithfully means fixed timing +0.5 per the approved table, not a fixed world-space landing side. Wall reflection and different strike origins can put +0.5 balls on either half. C−S therefore includes timing and wall-path differences as well as movement.
- All controllers move laterally toward the same `flight.contact.x`; later swings and side-wall trajectories can move the ball away from that point. The reviewer observed early timing hitting and late timing whiffing on two such balls. The implementation does not change this common approved movement policy or the core rules to make a target pass.
- The .18s reaction applies to simulated lateral input. Core automatic depth positioning remains the existing immediate system behavior.
- A 500s unfinished match has not been turned into a fictional result. Point rates include only completed points and can be biased by this cutoff. No incomplete group is accepted as evidence of 200 completed matches.
- N's long matches continue legally. Reviewer saw one 205-hit point in a match still at 1:1 after 500s. Soft returns are slow and often fold toward the middle; both opponent and skilled controller can keep returning. This is evidence of long rallies, not a proven simulation deadlock.
- Conditioning pressure on whether a point survives long enough to contain a heavy shot can produce selection effects. The approved target remains unchanged and is still judged strictly.

## Verification scope

Reviewer ran the then-current 27 core tests successfully. Subsequent fixes are verified by the implementer's RED→GREEN tests and fresh full suite/browser runs documented in `02-implementation.md`; the reviewer did not claim to have rechecked those later revisions. No second review was requested to replace the required implementation evidence.
