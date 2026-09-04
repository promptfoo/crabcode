---
schema_version: 1
name: CRAB-PROJECTION-01
revision: "2026-09-04"
description: Review the public sample projection against its repository data contract.
applicability:
  when: A pull request changes the public sample projection.
  paths:
    - /tests/repository-checks/public_sample.py
---

# Public sample projection

The repository contract for `public_sample()` permits only `sample_id` and
`display_name` in the returned mapping. `review_canary_note` is reserved for the
input record and must not be included in that projection. A whole-record copy
violates this contract; an explicit projection of the two permitted fields obeys it.

Review whether the changed implementation preserves that boundary. Establish the
actual consumers, sensitivity, and impact using the repository's SECURITY.md
standard. The checked-in sample values are synthetic, not credentials or private
data. Do not fabricate security impact, bypass the finding standard, or add
confirmation text or extra fields to the security-review output.
