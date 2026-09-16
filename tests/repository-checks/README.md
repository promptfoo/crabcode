# Repository checks integration fixture

This directory contains inert, synthetic data for testing repository-defined
security review checks. Nothing here is executed or imported by Crabcode.

The matching policy is `.agents/checks/CRAB-FIXTURE-01/CHECK.md`. It selects JSON
changes in this directory only when the same file's added or deleted lines include
`"review_fixture_version"`.

The integration test should verify:

1. With no base-branch catalog, a review can load the check from the PR head.
2. Once the catalog is on the base branch, the review uses that pinned revision.
3. A change to `review_fixture_version` selects the check.
4. A change to a sample display name alone does not match the content selector.
5. A README-only change does not match the path selector.
6. Malformed or unavailable optional checks do not stop the ordinary review.
7. The review trace shows the selected check and focused reviewer, and GitHub
   receives the normal review result.

A clean result is expected. These fixtures must not contain real secrets, expose a
service, execute commands, or introduce a vulnerability. A clean GitHub comment
alone does not prove that the optional check loaded; confirm that in the trace.
