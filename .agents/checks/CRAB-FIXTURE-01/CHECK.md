---
schema_version: 1
name: CRAB-FIXTURE-01
revision: "2026-09-04"
description: Keep repository-review JSON fixtures synthetic and free of sensitive data.
applicability:
  when: A pull request adds or changes the versioned repository-review JSON fixture.
  paths:
    - /tests/repository-checks/**/*.json
  content:
    contains_any:
      - '"review_fixture_version"'
hints:
  keywords:
    - synthetic
    - fixture
---

# Synthetic review fixtures

Review the eligible JSON changes for accidentally committed credentials, private
documents, or real personal data. Fixture records must use clearly synthetic
values. Keep the assessment within the assigned files and the repository's
SECURITY.md evidence standard.

The fixture is inert data. Its version number, sample names, and test identifiers
are not secrets or security findings. Do not invent a vulnerability to demonstrate
that this check ran. Report a finding only when the diff introduces an actual
security issue supported by evidence. A clean result is expected for the checked-in
sample.

Check execution is verified through the review trace. Do not add artificial
findings, extra result fields, or confirmation text to the security review output.
