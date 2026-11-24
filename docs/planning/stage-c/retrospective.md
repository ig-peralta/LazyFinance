# Sprint C (Stage C) — retrospective

- **Review date:** 2026-11-24 (America/Santiago).
- **Scope:** Stage C through [`main` at `7ae34761`](https://github.com/ig-peralta/LazyFinance/commit/7ae3476103b401b278c2e1c9e301a79d377336f2).
- **Provenance:** documentary retrospective based on the written maintainer gate review, [dated tracker snapshot](../snapshots/backlog-2026-11-24-stage-c-gate.md) and linked delivery records. No separate retrospective meeting is claimed.
- **Outcome:** [GO for development closure](closure.md), with production release risks still open.

## What worked

- Separating the integrated experience from the deployment, performance, mock
  banking and security deliveries gave each review a concrete result and an
  explicit verification boundary. The [integrated experience](experience-delivery.md)
  kept related UI, contracts and service behavior together.
- The simulated bank reuses the selected-account discovery and import path.
  Together with the repeatable fixture, it makes account selection, corrections
  and recovery demonstrable without real bank access. The
  [security regressions](security-testing.md) exercised this addition under separate owners
  and restricted PostgreSQL roles instead of relying on UI checks alone.
- The [performance work](performance-testing.md) exposed slow reads and costly
  import writes before a capacity claim. The final measured profile kept the
  financial assertions and atomicity checks while improving latency.

## What took extra work

- The early performance runs and the later smaller-resource run did not pass
  every workload. Hardware limits and complete per-route samples matter; neither
  a partial percentile nor a successful import proves the whole profile passed.
- Controlled checks, endpoint liveness and signed-in/live workflow checks answer
  different questions. The maintainer's confirmation is enough for this stage,
  but it does not provide a reproducible release support matrix.
- Security regression success did not resolve the advisory findings. Keeping the
  application checks and dependency audit separate prevented an unqualified
  security pass from being recorded.

## Follow-up decisions

Keep coherent reviews and retain the exact build, workload, resource limits and
underlying results for future verification. For a release candidate, record the
supported provider/client matrix and review dependencies, deployment and
recovery, capacity, retention and cost together with the
[product release criteria](../product-definition-of-done.md). The
[closure record](closure.md#open-release-follow-ups) preserves the individual risks.

No optional item was promoted or new stage selected in this review. Follow-up
owners and target dates were not set here.
