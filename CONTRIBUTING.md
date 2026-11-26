# Contributing to OpenChar

Thank you for helping. Bug reports, protocol corrections, translations,
feedback on workflows and code are all welcome.

## Before you start

- For a bug, open a GitHub issue that says what you did, what you expected
  and what happened. Screenshots help.
- For a new feature or a large change, open an issue first so we can agree on
  the approach before you start.
- For a protocol correction, a translation, or a workflow that does not match
  how a plant, a lab or a verification body really works, open an issue that
  describes it. You do not need to write code for these, and they are as
  useful as code.

## Making a change

1. Fork the repository and create a branch from `main`.
2. Set up the development environment as described in the
   [README](README.md#develop).
3. Make the change, with an automated test that proves it. OpenChar calls its
   tests "evals": browser tests in `evals/` and server tests in
   `server/test/`. A change is complete when its evals pass, and
   [evals/CHARTER.md](evals/CHARTER.md) explains how they are organised.
4. Run `npm run evals` and make sure everything passes.
5. Open a pull request that says what changed and why.

Changes to the carbon ledger (`server/src/ledger/`) need a test case in
`server/test/ledger.test.ts` whose expected values are worked out by hand
from the protocol text, not copied from the code's output. Cite the
protocol requirement ID the change implements (for example R-8W08-0, from
[the protocol digest](docs/protocols/isometric-biochar-v1.3.md)).

## Sign off your commits

Every commit needs a `Signed-off-by` line, which certifies the
[Developer Certificate of Origin](https://developercertificate.org/): you
confirm that you wrote the change or have the right to submit it.
`git commit -s` (a lowercase s) adds the line. This is not the same as
signing commits with a GPG key.

## Licence of contributions

OpenChar is released under the GNU Affero General Public License v3.0
(AGPL-3.0). By submitting a contribution you agree to two things. First, your
contribution is licensed under the AGPL-3.0. Second, you grant
CarbonMarketsHQ a perpetual, worldwide, royalty-free licence to use, modify
and distribute your contribution under other terms as well. This lets
CarbonMarketsHQ run the hosted service, while the OpenChar code stays
available to everyone under the AGPL-3.0.

## Code of conduct

Everyone taking part is expected to follow the
[code of conduct](CODE_OF_CONDUCT.md).
