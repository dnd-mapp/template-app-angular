# Signed commit/tag verification via the GitHub API

Research for [Define a release process and workflow](https://github.com/dnd-mapp/template-app-angular/issues/19), specifically the sub-question tracked at [issue #20](https://github.com/dnd-mapp/template-app-angular/issues/20): can the release workflow produce a "Verified" commit and a "Verified" annotated tag directly on `main`, using only the `dnd-mapp` GitHub App's installation access token, without generating a real signing key?

## Direct answer

**Commits: yes.** **Annotated tag objects: no, not via the API.** **The ruleset's `required_signatures` rule itself only ever checks commits, never the tag object.** See [What `required_signatures` actually checks](#what-required_signatures-actually-checks) below for why that matters less than it sounds.

## How GitHub's bot auto-signing works

GitHub's docs describe a signing path specifically for bots and GitHub Apps, separate from personal GPG/SSH/S-MIME signing:

> Organizations and GitHub Apps that require commit signing can use bots to sign commits. If a commit or tag has a bot signature that is cryptographically verifiable, GitHub marks the commit or tag as verified.
>
> Signature verification for bots will only work if the request is verified and authenticated as the GitHub App or bot and contains no custom author information, custom committer information, and no custom signature information, such as Commits API.

Source: [About commit signature verification, "Signature verification for bots"](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification#signature-verification-for-bots).

In practice, this means: authenticate the request with the GitHub App's installation access token, and **omit** `author`, `committer`, and `signature` from the request body entirely. GitHub then signs the resulting commit with its own bot-signing key and marks it `"verified": true, "reason": "valid"`. Supplying *any* custom `author`/`committer` (even one that matches the App's own bot identity) breaks this and produces an unsigned, unverified commit. This is corroborated by real request/response examples in [GitHub Community Discussion #50055](https://github.com/orgs/community/discussions/50055), where an installation-token commit came back with:

- `author`: the App's own bot identity, e.g. `dnd-mapp[bot] <ID+dnd-mapp[bot]@users.noreply.github.com>` (the numeric ID is the App's associated *user* ID, obtainable via `GET /users/{app-slug}[bot]`)
- `committer`: `GitHub <noreply@github.com>`, since the web-flow/bot-signing identity applies the signature and becomes the committer of record, not the App

This applies equally to the **Git Database API** (`POST /repos/{owner}/{repo}/git/commits`) and the **Contents API** (`PUT /repos/{owner}/{repo}/contents/{path}`). Both endpoints funnel into the same commit-creation and bot-signing path, and both fail to sign the moment you set a custom `author`/`committer`. This is confirmed both by the docs passage above, which explicitly names "Commits API" as an example of an endpoint that accepts, and is broken by, custom author/committer/signature, and by community reports of successful Contents-API auto-signing under the same no-custom-identity condition. See the [search results summary](https://github.com/orgs/community/discussions/50055) and [`swinton`'s gist walkthrough](https://gist.github.com/swinton/03e84635b45c78353b1f71e41007fc7c).

**Gotcha: Contents API deletions are not signed.** [Community Discussion #180621](https://github.com/orgs/community/discussions/180621) reports, and a second user confirms independently in December 2025, that `PUT` (create/update) commits get the bot signature and show Verified, but `DELETE /repos/{owner}/{repo}/contents/{path}` commits do not. The response has `committer: <app-slug>[bot]` instead of `GitHub <noreply@github.com>` and no `gpgsig`. Unresolved as of this writing. Not relevant to a changelog-update commit (a `PUT`), but worth remembering if the workflow ever needs to delete a file via the API.

There is also a newer, purpose-built path for this exact case: the GraphQL `createCommitOnBranch` mutation, introduced specifically to replace the multi-step Git Database API dance (create blobs → create tree → create commit → update ref) with one call that adds/updates/deletes several files at once. GitHub's announcement states plainly that commits it creates "are automatically GPG signed and are marked as verified in the GitHub UI," and that GitHub Apps can call it directly. See [A simpler API for authoring commits](https://github.blog/changelog/2021-09-13-a-simpler-api-for-authoring-commits/) (GitHub Changelog, 2021-09-13) and the [`createCommitOnBranch` mutation reference](https://docs.github.com/en/graphql/reference/mutations#createcommitonbranch). For a single-file change like the changelog, either the REST Contents API or this mutation works. The REST Git Database API is only worth the extra calls if full control over the tree is needed, e.g. multiple unrelated file changes plus custom parents.

## Annotated tags cannot be signed via the API

The Git Database API's "Create a tag object" endpoint (`POST /repos/{owner}/{repo}/git/tags`) has no path to a verified signature, and this is a hard API-shape limitation, not a configuration issue:

- Its request schema accepts only `tag`, `message`, `object`, `type`, and `tagger`: there is **no `signature` field**. This is unlike the commit-creation endpoint, which exposes an optional, manually-computed `signature` field. Confirmed directly against GitHub's published OpenAPI description ([`github/rest-api-description`](https://github.com/github/rest-api-description), `descriptions/api.github.com/api.github.com.json`, the source that generates [the REST API reference for Git tags](https://docs.github.com/en/rest/git/tags?apiVersion=2022-11-28#create-a-tag-object)).
- The bot auto-signing behavior documented for commits has never been extended to tag *objects* created this way. A GitHub engineering team member confirmed this directly in 2020: "In your action, new tag is created using REST API, there is no method to create a signed tag using REST API." ([Community Discussion #27016](https://github.com/orgs/community/discussions/27016), reply from `Yanjingzhu`, 2020-05-05). A second, independent thread from November 2024 confirms the gap is unchanged four years later: "REST API for git commits are automatically signed, while I have no luck doing the same with API endpoint for tags" ([Community Discussion #69847](https://github.com/orgs/community/discussions/69847)). No GitHub Changelog post between 2020 and this research (August 2026) announces API-created tag signing being added. The closest related changes are [tag protections migrating into repository rules (2023-10-18)](https://github.blog/changelog/2023-10-18-migrate-tag-protections-to-repository-rules/) and [persistent commit signature verification going GA (2024-12-10)](https://github.blog/changelog/2024-12-10-persistent-commit-signature-verification-is-generally-available/), and neither touches tag-object signing.
- The workaround people converge on in both threads is **not** an annotated tag at all: create a **lightweight tag** (a plain ref, via `POST /repos/{owner}/{repo}/git/refs` with `ref: "refs/tags/v<version>"`) pointing straight at the already-verified commit SHA, with no separate tag object. GitHub's UI then shows that tag pointing at a Verified commit, but this is the commit's verification showing through the tag, not a signature on the tag itself. It is also not an annotated tag: no tag message, no independent tagger identity or SHA. That does not match this repo's decided tag format (`v<major>.<minor>.<patch>` annotated tags, matching `pnpm version`'s default of creating annotated tags with the bare version as the tag message).

## What `required_signatures` actually checks

This is the fact that resolves most of the practical tension above. The ruleset rule's own schema description, straight from GitHub's OpenAPI spec:

> **`required_signatures`**: "Commits pushed to matching refs must have verified signatures."

Source: the [`repository-rule-required-signatures` schema in `github/rest-api-description`](https://github.com/github/rest-api-description/blob/main/descriptions/api.github.com/api.github.com.json) (also rendered on [REST API endpoints for rules](https://docs.github.com/en/rest/repos/rules?apiVersion=2022-11-28#get-all-repository-rulesets)). The general behavior is described at [Available rules for rulesets, "Require signed commits"](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-signed-commits): "With both methods, we use the `verified_signature?` to confirm if a commit has a valid signature. If not, the update is not accepted."

The rule text talks about **commits**, not tag objects. Two consequences:

1. For a ruleset that targets the `main` **branch** (this repo's setup), `required_signatures` only ever evaluates the commit(s) being pushed to `main`. It has no opinion on the tag at all, because a tag ref update isn't a branch-ref update. This repo's branch ruleset does not gate the tag push in any way.
2. Even if this org later adds a **tag** ruleset with `required_signatures` enabled, the rule's own description says it checks "commits pushed to matching refs." That means it would validate the signature of the commit the tag points at, not a signature on the annotated tag object itself. An annotated tag with an unsigned tag object, pointing at a bot-signed/Verified commit, should satisfy this rule.

So: getting a Verified **commit** on `main` via the API (fully solved, see above) is sufficient to satisfy `required_signatures` today and under any plausible future tag-ruleset configuration. A "Verified" **badge on the tag object itself** is a separate, purely cosmetic/trust-signal goal in GitHub's UI (not something any ruleset rule currently checks), and it is the one piece the API cannot deliver.

## Exact call sequence for a verified commit + tag on `main`

This assumes a GitHub App installation access token minted via `actions/create-github-app-token`, as already used in this repo's workflows (`.github/workflows/pull-request.yml`, `.github/actions/find-image-version/action.yml`). It also assumes the App has already been added as a `main` ruleset bypass actor, tracked separately and done via the GitHub UI on 2026-08-07 per this project's planning notes. See [Bypass actor requirement](#bypass-actor-requirement) below for why that's needed.

1. **Get the current tip of `main`**: `GET /repos/{owner}/{repo}/git/ref/heads/main` → `sha` (the parent commit).
2. **Get that commit's tree**: `GET /repos/{owner}/{repo}/git/commits/{sha}` → `tree.sha` (only needed if building a tree manually; skip if using the Contents API).
3. **Write the new file content**, either:
   - **Contents API (recommended for this single-file changelog case):** `PUT /repos/{owner}/{repo}/contents/CHANGELOG.md` with `message`, `content` (base64), `sha` (current blob SHA of `CHANGELOG.md`), `branch: "main"`. **Omit `author` and `committer` entirely.** Response includes `commit.sha`: this is the new, Verified commit.
   - **Git Database API (if multiple files/trees are ever needed):** `POST /repos/{owner}/{repo}/git/blobs` for the new content → `POST /repos/{owner}/{repo}/git/trees` with `base_tree` set to the parent tree SHA → `POST /repos/{owner}/{repo}/git/commits` with `message`, `tree`, `parents: [<parent sha>]`, and again **no `author`, `committer`, or `signature`** → then update the branch ref (step 4).
4. **Fast-forward `main` to the new commit**: `PATCH /repos/{owner}/{repo}/git/refs/heads/main` with `sha: <new commit sha>`. Leave `force` **unset (or `false`)**: this is a fast-forward (the new commit's sole parent is the previous tip), and `force: false` is what makes the API reject the update if `main` moved underneath you in the meantime. That's the safety property you want for a linear release commit. (Skipped automatically if using the Contents API, which updates the ref as part of the same `PUT` call.)
5. **Create the annotated tag object**: `POST /repos/{owner}/{repo}/git/tags` with `tag: "v<version>"`, `message: "<version>"` (bare version, matching this repo's decided convention), `object: <new commit sha>`, `type: "commit"`. As established above, this object will **not** be signed/Verified regardless of auth. There is no field to make it so. Optionally set `tagger` to the App's bot identity for a readable tagger line; it won't affect verification either way, since verification isn't possible here regardless.
6. **Create the tag ref**: `POST /repos/{owner}/{repo}/git/refs` with `ref: "refs/tags/v<version>"`, `sha: <tag object sha from step 5>`. Use `POST .../git/refs`, not `PATCH`, because the ref doesn't exist yet: `create-a-reference` is for new refs, while `update-a-reference` (`PATCH`) is for moving an existing one, and only `update-a-reference` takes the `force` flag.

## Bypass actor requirement

A verified signature and ruleset bypass are **orthogonal**. Satisfying `required_signatures` does not exempt the push from the ruleset's other rules (e.g. "require a pull request before merging," "block force pushes," "restrict updates"). Direct API commits/ref-updates to `main` are still a non-pull-request, non-fast-forward-shaped push from the ruleset's point of view unless the pushing identity is itself allowed to bypass those other rules.

GitHub Apps are an explicit supported `actor_type` (`Integration`) for ruleset `bypass_actors`, alongside `OrganizationAdmin`, `RepositoryRole`, `Team`, `DeployKey`, and `User` ([`repository-ruleset-bypass-actor` schema](https://github.com/github/rest-api-description/blob/main/descriptions/api.github.com/api.github.com.json), rendered at [REST API endpoints for rules](https://docs.github.com/en/rest/repos/rules?apiVersion=2022-11-28)). `bypass_mode` controls *when* the bypass applies: `always`, `pull_request` (branch rulesets only, because bypass there applies only inside PR merges, not direct pushes, so **not** what's needed here), or `exempt` (rules don't run for that actor at all, no audit entry). For a workflow that pushes directly to `main` outside a PR, the App needs `bypass_mode: "always"` (or `"exempt"`) on the `main` ruleset. This repo's planning notes record that this was already granted via the GitHub UI on 2026-08-07, tracked as a separate task.

So the full picture for this release workflow is: **bypass actor status** gets the push past the ruleset's structural rules (no-PR, direct-push, etc.). **Bot auto-signing** (correctly-shaped request, App-authenticated, no custom author/committer/signature) is what makes `required_signatures` itself pass on top of that. Neither one substitutes for the other.

## Token permission scope

`contents:write` is sufficient for every endpoint in the call sequence above. No additional GitHub App permission is needed beyond what the App already has. Confirmed against [Permissions required for GitHub Apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps?apiVersion=2022-11-28#contents): "Create a commit," "Create a tag object," "Create a reference," "Update a reference," and "Create or update file contents" are all listed under the "Contents" permission at the write level.

## Recommendation: real signing keys are not worth it here

Since `required_signatures` only ever checks the pushed **commit** (see above), and that's fully solvable with bot auto-signing, there is no functional gap that a real GPG/SSH key would close. The only thing a real key buys is a "Verified" badge on the tag object itself in GitHub's UI, which is cosmetic. If that cosmetic gap is later judged worth closing, note the tradeoffs before reaching for it:

- **Key custody**: a real GPG or SSH private key would need to be generated, stored as an org/repo Actions secret, and imported in the runner (`gpg --import` / `ssh-add` plus `git config user.signingkey` / `gpg.format=ssh`). It would then be used for `git tag -s` on an actual `git` checkout, not the REST API (which has no way to accept a tag signature), followed by `git push origin v<version>`.
- **Identity problem**: GPG/SSH signing keys can only be registered against a GitHub **user account** (Settings → SSH and GPG keys). GitHub Apps have no such account surface. A "Verified" (not "Unverified" or no-status) badge needs one of two things: a dedicated machine/bot user account with the public key uploaded to it and its email matching the tag's `tagger`, or accepting "Unverified"/unsigned status on the tag. That first option is a materially bigger operational surface (a login-capable bot account plus key rotation policy) for a purely cosmetic win.
- **No API shortcut exists**: this path requires shelling out to real `git`/`gpg` inside the Actions job. It cannot be done through `create-github-app-token` plus REST/GraphQL calls, the way the commit can.

Given the ruleset only checks the commit, the recommendation is to **ship the bot-auto-signed commit as described above, and use a plain (unsigned, API-created) annotated tag object.** Don't invest in a real signing key unless a future requirement explicitly needs the tag object itself to carry a cryptographic signature.

## Sources

- [About commit signature verification](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification) (GitHub Docs), including the "Signature verification for bots" section. Raw source: [`github/docs` content file](https://github.com/github/docs/blob/main/content/authentication/managing-commit-signature-verification/about-commit-signature-verification.md).
- [Available rules for rulesets, "Require signed commits"](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-signed-commits) (GitHub Docs)
- [Create a commit](https://docs.github.com/en/rest/git/commits?apiVersion=2022-11-28#create-a-commit) (GitHub Docs, REST API endpoints for Git commits)
- [Create a tag object](https://docs.github.com/en/rest/git/tags?apiVersion=2022-11-28#create-a-tag-object) (GitHub Docs, REST API endpoints for Git tags)
- [REST API endpoints for Git references](https://docs.github.com/en/rest/git/refs?apiVersion=2022-11-28) (GitHub Docs; Create/Update a reference)
- [Create or update file contents](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#create-or-update-file-contents) (GitHub Docs, REST API endpoints for repository contents)
- [REST API endpoints for rules](https://docs.github.com/en/rest/repos/rules?apiVersion=2022-11-28) (GitHub Docs; ruleset and bypass-actor object shapes)
- [Permissions required for GitHub Apps, "Contents"](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps?apiVersion=2022-11-28#contents) (GitHub Docs)
- [`github/rest-api-description`](https://github.com/github/rest-api-description): GitHub's published OpenAPI description for `api.github.com`, the authoritative schema source for the REST docs pages above. Used directly to confirm the Git tags endpoint has no `signature` field, and to get the exact wording of the `required_signatures` rule.
- [A simpler API for authoring commits](https://github.blog/changelog/2021-09-13-a-simpler-api-for-authoring-commits/) (GitHub Changelog, 2021-09-13; introduces the `createCommitOnBranch` GraphQL mutation)
- [`createCommitOnBranch` mutation reference](https://docs.github.com/en/graphql/reference/mutations#createcommitonbranch) (GitHub Docs)
- [Migrate tag protections to repository rules](https://github.blog/changelog/2023-10-18-migrate-tag-protections-to-repository-rules/) (GitHub Changelog, 2023-10-18)
- [Persistent commit signature verification is generally available](https://github.blog/changelog/2024-12-10-persistent-commit-signature-verification-is-generally-available/) (GitHub Changelog, 2024-12-10)
- [Community Discussion #50055, "How to Use Commit Signing with GitHub Apps"](https://github.com/orgs/community/discussions/50055): used as a lead and verified against the docs/schema above; the concrete author/committer identity fields are corroborating evidence, not the source of the underlying rule.
- [Community Discussion #180621, "GitHub App verified commits with REST API: Deletions are not signed"](https://github.com/orgs/community/discussions/180621): used as a lead for the Contents-API-delete gotcha; unresolved on GitHub's side as of the discussion's latest reply.
- [Community Discussion #27016, "Creating signed tags in a Github action"](https://github.com/orgs/community/discussions/27016): includes a 2020 reply from GitHub staff (`Yanjingzhu`) confirming no tag-signing method exists via the REST API.
- [Community Discussion #69847, "Creating a signed tag using the REST API"](https://github.com/orgs/community/discussions/69847): independent 2024 confirmation that the tag-signing gap is unchanged.
