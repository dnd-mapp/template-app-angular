# SSH tag-signing mechanics for a GitHub-Verified annotated tag

Research for [Define a release process and workflow](https://github.com/dnd-mapp/template-app-angular/issues/19), specifically the sub-question tracked at [issue #28](https://github.com/dnd-mapp/template-app-angular/issues/28). Prior research at [`docs/research/signed-commit-tag-verification.md`](signed-commit-tag-verification.md) (branch `research/signed-commit-tag-verification`, [issue #20](https://github.com/dnd-mapp/template-app-angular/issues/20)) established that GitHub's REST/GraphQL APIs can auto-sign **commits** as Verified when called with a GitHub App token and no custom author/committer/signature, but have no field or path to sign a **tag object**. This document covers the fallback plan: running real `git tag -s` with `gpg.format=ssh` inside the Actions runner, signed by a dedicated bot GitHub *user* account (key custody tracked separately as [issue #27](https://github.com/dnd-mapp/template-app-angular/issues/27), out of scope here).

## Direct answer

Config: `git config gpg.format ssh` and `git config user.signingkey <path-to-private-key-file>` (a filesystem path, not a key ID). No `ssh-agent` is required — pointing `user.signingkey` straight at a passphrase-less private key file lets Git's default `gpg.ssh.program` (`ssh-keygen`) sign directly and non-interactively. `gpg.ssh.allowedSignersFile` is **not** needed to create the signature; it only matters for *local* `git verify-tag`/`git verify-commit`, and GitHub's own verification doesn't consult it at all. Write the private key from the Actions secret to a runner-local temp file with `chmod 600` immediately before signing, `git config` it, run `git tag -s`, then delete the file — see [Recommended workflow steps](#recommended-workflow-steps).

For the Verified badge itself: GitHub's SSH verification is a pure cryptographic match — the tag's signature against a public key uploaded as a **signing**-type key on *some* GitHub account — with no requirement that the tag object's `tagger` name/email correspond to that account, and (per GitHub's own docs) no mention of any repository/organization role or permission for that account. This is a real asymmetry with GPG, which GitHub's own docs single out for a committer-identity/verified-email match requirement that has no SSH equivalent. See [Question 3](#question-3-what-does-verified-actually-check-for-ssh) and [Question 4](#question-4-does-the-key-owning-account-need-repositoryorg-permissions) for the evidence and its limits.

## Question 1: non-interactive `git tag -s` with `gpg.format=ssh` in CI

### The config, per git's own docs

- **`gpg.format`**: "Specifies which key format to use when signing with `--gpg-sign`. Default is `openpgp`." Other supported values: `x509`, `ssh`. Source: [`git-config`, `gpg.format`](https://git-scm.com/docs/git-config#Documentation/git-config.txt-gpgformat) (verbatim text confirmed against the [`git/git` source, `Documentation/config/gpg.adoc`](https://github.com/git/git/blob/master/Documentation/config/gpg.adoc)).
- **`gpg.ssh.program`**: "The default value for `gpg.x509.program` is `gpgsm` and `gpg.ssh.program` is `ssh-keygen`." Source: same `gpg.adoc` file, `gpg.<format>.program` entry. So plain `ssh-keygen` — already present on GitHub-hosted runners as part of the OpenSSH client — is sufficient; no extra binary or `ssh-agent` daemon is required by default.
- **`user.signingKey`**: "This option is passed unchanged to gpg's `--local-user` parameter... **If `gpg.format` is set to `ssh` this can contain the path to either your private ssh key or the public key when ssh-agent is used.** ... The private key needs to be available via ssh-agent [only in the public-key case]. If not set Git will call `gpg.ssh.defaultKeyCommand` (e.g. `ssh-add -L`) and try to use the first key available." Source: [`git-config`, `user.signingKey`](https://git-scm.com/docs/git-config#Documentation/git-config.txt-usersigningKey) (verbatim, from `Documentation/config/user.adoc`).

That `user.signingKey` sentence is the load-bearing fact: Git's SSH backend has **two distinct modes**, and only one of them needs `ssh-agent`:

1. `user.signingkey` = path to a **private key file** → `ssh-keygen -Y sign -f <that file>` signs directly against the file on disk. No agent, no daemon, no forwarding.
2. `user.signingkey` = path to a **public key file** (or a `key::`-prefixed public key) → Git expects the matching private key to already be loaded into a running `ssh-agent`; this is the mode meant for interactive human workstations where the key is agent-managed.

For a CI runner, mode 1 is the only one that makes sense: no long-lived agent process to babysit, no `SSH_AUTH_SOCK` plumbing across steps. It also means the private key must have **no passphrase** (or one supplied through some other non-interactive channel) — `ssh-keygen -Y sign` has no documented `SSH_ASKPASS`/batch-passphrase flag of its own, so an encrypted key would hang/fail waiting for a prompt that never comes in a runner. A dedicated CI-only key with an empty passphrase, rotated periodically, is the practical answer (key generation and custody policy tracked in issue #27, not decided here).

- **`gpg.ssh.defaultKeyCommand`**: "This command will be run when `user.signingkey` is not set and a ssh signature is requested." — i.e. only a fallback if `user.signingkey` is left unset; irrelevant once `user.signingkey` is configured explicitly, which is what the recommended recipe below does. Source: `gpg.adoc`.

### `gpg.ssh.allowedSignersFile`: creation vs. verification

Per git's docs, `gpg.ssh.allowedSignersFile` is described purely in verification terms: "A file containing ssh public keys which you are willing to trust... The trust level of a signature verification is set to `fully` when the public key is present in the allowedSignersFile." Source: `gpg.adoc`, `gpg.ssh.allowedSignersFile` entry.

This matches the underlying `ssh-keygen` CLI split, which git's SSH backend shells out to:

- **Signing** (`ssh-keygen -Y sign`): takes `-f <identity-file>` (the signing key itself, private or agent-backed public) and `-n <namespace>`. It does not take, need, or consult an allowed-signers file. Source: [`ssh-keygen(1)`](https://man.openbsd.org/ssh-keygen.1), `-Y sign` section — "The key used for signing is specified using the `-f` option and may refer to either a private key, or a public key with the private half available via ssh-agent(1)."
- **Verifying** (`ssh-keygen -Y verify`): takes `-s <signature-file>`, `-I <signer-identity>`, and `-f <allowed-signers-file>` — the allowed-signers file is what verification checks the claimed signer against. Source: same man page, `-Y verify` / `ALLOWED SIGNERS` sections.

So: **not needed to create the tag's signature.** It's only relevant if this repo ever wants `git verify-tag`/`git verify-commit` to run *locally* (e.g. a pre-push hook, or a separate CI verification step distinct from GitHub's own server-side check) — and even then, GitHub's website/API verification is a wholly separate, server-side process (see Question 3) that doesn't read this file at all; it exists purely for local `git` invocations on whatever machine has it configured.

## Question 2: supplying the private-key secret without leaving plaintext on disk longer than needed

Git's SSH backend has no in-memory/stdin key-passing mode of its own — `user.signingkey` in file-path mode must point at an actual file, and `ssh-keygen -Y sign -f` reads that file from disk. There are two ways to keep the private key out of a persistent plaintext file for longer than necessary: write it to a short-lived temp file and delete it immediately after signing, or hand it to `ssh-agent` (which holds it only in the agent process's memory, never in a file) and point `user.signingkey` at the corresponding *public* key per the agent-backed mode described in Question 1. Both are grounded in the same `user.signingKey` documentation quoted above; git/GitHub's own docs don't prescribe a CI-specific recipe for either, so what follows is this document's own construction from those primitives, not a directly-cited "the docs say do this" recipe.

### Pattern A: temp file, `chmod 600`, delete immediately after signing

The common, git-docs-grounded pattern:

1. Store the private key as a GitHub Actions **encrypted secret** (`secrets.SSH_SIGNING_KEY`) — masked in logs by Actions' own secret redaction, out of scope for git/GitHub docs but standard Actions practice.
2. In the signing step, write the secret straight to a file inside the (ephemeral, per-job) runner workspace or `$RUNNER_TEMP`, immediately restricting its permissions before any git command touches it:

   ```yaml
   - name: Configure SSH tag signing
     env:
       SSH_SIGNING_KEY: ${{ secrets.SSH_SIGNING_KEY }}
     run: |
       key_path="$RUNNER_TEMP/tag_signing_key"
       umask 077
       printf '%s\n' "$SSH_SIGNING_KEY" > "$key_path"
       chmod 600 "$key_path"
       git config gpg.format ssh
       git config user.signingkey "$key_path"
   ```

   `umask 077` plus an explicit `chmod 600` covers both "don't create it world-readable in the first place" and "fix it if the umask didn't apply." OpenSSH's own key-loading code rejects/warns on group- or world-readable private key files (the well-known `UNPROTECTED PRIVATE KEY FILE` check); `ssh-keygen -Y sign` shares that key-loading path, so a `chmod 600` isn't just hygiene, it can be a correctness requirement.
3. Run the actual `git tag -s` step.
4. Delete the key file as the **last** step regardless of outcome — an `always()`-conditioned cleanup step (`rm -f "$RUNNER_TEMP/tag_signing_key"`), since a failed tag/push should still scrub the secret from disk:

   ```yaml
   - name: Remove signing key
     if: always()
     run: rm -f "$RUNNER_TEMP/tag_signing_key"
   ```

5. GitHub-hosted runner VMs are single-job, freshly-provisioned and torn down after the job (standard Actions runner lifecycle), so even without step 4 the key wouldn't persist across jobs — but explicit cleanup is still the defensible pattern for a secret that touched disk, and costs nothing.

This is a direct application of the two git-config facts from Question 1 (`user.signingkey` as a private-key file path, no agent needed) rather than a documented "GitHub-recommended CI recipe" — neither git-scm.com nor docs.github.com prescribes a CI-specific pattern for this, since `git tag -s`/SSH signing is a generic git feature with no CI-specific documentation on either site. Community write-ups describing effectively this same write-chmod-sign-delete shape were used only as a sanity check, not as a cited source for any claim above.

### Pattern B: `ssh-agent`, via the `webfactory/ssh-agent` community Action

The alternative that avoids a plaintext key file on disk entirely is the agent-backed mode from Question 1 (`user.signingkey` = the *public* key, private half resolved through a running `ssh-agent`). GitHub's own docs describe exactly this shape for interactive/local use — set up the agent, `ssh-add` the private key, then point `user.signingkey` at the public key:

> Configure Git to use SSH to sign commits and tags: `git config --global gpg.format ssh`
>
> To set your SSH signing key in Git, paste the text below, substituting `/PATH/TO/.SSH/KEY.PUB` with the path to the public key you'd like to use: `git config --global user.signingkey /PATH/TO/.SSH/KEY.PUB`

Source: [`github/docs`, `data/reusables/gpg/configure-ssh-signing.md`](https://github.com/github/docs/blob/main/data/reusables/gpg/configure-ssh-signing.md) and [`data/reusables/gpg/paste-ssh-public-key.md`](https://github.com/github/docs/blob/main/data/reusables/gpg/paste-ssh-public-key.md), both included into [Telling Git about your signing key](https://docs.github.com/en/authentication/managing-commit-signature-verification/telling-git-about-your-signing-key).

GitHub's docs don't cover starting an agent inside a CI job specifically, but the widely-used community Action for it is [`webfactory/ssh-agent`](https://github.com/webfactory/ssh-agent) (MIT licensed, ~1.5k GitHub stars, maintained by webfactory GmbH, actively updated as of 2026):

```yaml
- uses: webfactory/ssh-agent@v0.9.0
  with:
    ssh-private-key: ${{ secrets.SSH_SIGNING_KEY }}
```

It starts `ssh-agent`, exports `SSH_AUTH_SOCK`/`SSH_AGENT_PID` for later steps, feeds the secret to `ssh-add` (held only in the agent process's memory, never written to a dotfile), and registers a post-job cleanup step that kills the agent when the job ends. `user.signingkey` would then be set to the key's public half — safe to keep as a plain (non-secret) workflow value — rather than a file path.

**Recommendation for this repo**: Pattern A (temp file, `rm`'d immediately after signing) is sufficient and keeps the workflow free of a third-party Action dependency for a signing-only need. Pattern B/`webfactory/ssh-agent` earns its keep when a key is also needed for actual SSH-transport `git` operations (clone/push over `git@github.com:` instead of HTTPS), which doesn't apply here since this workflow already authenticates its `git push` over the runner's existing token-based auth — SSH is only needed for the one `git tag -s` signing call, not for transport.

## Question 3: what does "Verified" actually check, for SSH

From [About commit signature verification](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification) (GitHub Docs), the SSH-specific section states:

> You can use SSH to sign commits with an SSH key that you generate yourself... GitHub uses [ssh_data](https://github.com/github/ssh_data), an open source Ruby library, to confirm that your locally signed commits and tags are cryptographically verifiable **against a public key you have added to your account** on GitHub.

That sentence — "against a public key you have added to your account" — is the entire documented matching criterion for SSH: a valid signature over a public key that exists somewhere in that account's registered keys. Nothing in this section, or anywhere else in GitHub's commit-signature-verification doc set, states that the tag's `tagger` name/email must match the key-owning account's name/email for SSH.

That absence is more informative than it first looks, because of an explicit **contrast with GPG** on the very same doc set. [Telling Git about your signing key](https://docs.github.com/en/authentication/managing-commit-signature-verification/telling-git-about-your-signing-key) opens its GPG section (per-OS, but identical wording across macOS/Windows/Linux) with:

> If you're using a GPG key that matches your committer identity and your verified email address associated with your account on GitHub, then you can begin signing commits and signing tags.
>
> If you don't have a GPG key that matches your committer identity, you need to associate an email with an existing key.

— and links out to a dedicated troubleshooting page, [Using a verified email address in your GPG key](https://docs.github.com/en/authentication/troubleshooting-commit-signature-verification/using-a-verified-email-address-in-your-gpg-key), for exactly this failure mode. The parallel "Telling Git about your SSH key" section, immediately below the GPG one on the same page, carries **no such statement** — no committer-identity language, no linked troubleshooting page for an SSH identity/email mismatch. GitHub's troubleshooting doc set (`docs.github.com/.../troubleshooting-commit-signature-verification/`) has exactly two child pages: the verification-status checker and that GPG-email-matching page — there's no SSH counterpart, which is consistent with there being no SSH identity-matching failure mode to document.

The underlying technical reason this asymmetry makes sense: a GPG key carries an embedded identity (UID: name + email) as part of the key material itself, which is why GitHub can and does check it against the account's verified emails. A raw SSH public key is just key material — no name, no email, nothing to compare against the tag's `tagger` line even if GitHub wanted to. The `ssh_data` library GitHub names as doing the actual cryptographic check ([`github/ssh_data`](https://github.com/github/ssh_data)) is described in its own README as scoped purely to "processing SSH keys and certificates... verify signatures using public keys" — no identity/email semantics live in that library either, consistent with GitHub's verification being signature-against-key-blob only.

**Caveat**: none of this is a positive, explicit "tagger identity is ignored" statement from GitHub — it's an absence-of-requirement inferred from (a) the one sentence that does describe the SSH matching criterion, and (b) the documented contrast with GPG's explicit identity requirement. Treat it as strongly evidenced, not as a verbatim guarantee, since GitHub does not appear to publish that negative claim directly anywhere in the doc set surveyed.

## Question 4: does the key-owning account need repository/org permissions

Not addressed anywhere in GitHub's commit-signature-verification documentation. The "About commit signature verification," "Telling Git about your signing key," "Adding a new SSH key to your GitHub account," and "Checking your commit and tag signature verification status" pages describe the Verified/Unverified/Partially-verified statuses purely in terms of (a) cryptographic validity of the signature and (b) presence of the matching public key as a **signing**-type key on an account (as opposed to an **authentication**-type key — [Adding a new SSH key to your GitHub account](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account) has you pick "the type of key, either authentication or signing" when uploading, and a key must be uploaded as the signing type to count here). None of these pages mention repository collaborator status, org membership, or any permission level as a precondition for the badge.

The one repository-permission-flavored mechanism that does exist — [Signature verification for bots](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification#signature-verification-for-bots) — is a **separate feature** from personal SSH/GPG signing (it covers GitHub Apps/bots authenticating API requests with no custom signature at all, the mechanism already fully documented in the prior research file) and doesn't bear on the `git tag -s`-with-SSH-key path this document covers.

Given the absence of any stated permission requirement, plus the well-known observable behavior that external contributors with no push/write access routinely get Verified badges on commits within pull requests to repositories they don't have any role on, the reasonable reading is that **registration of the public key as a signing key on some GitHub account is the entire requirement** — repository or organization role is not part of the check. This part of the answer rests on absence-of-mention in the docs plus that widely-observed behavior, not on an explicit "no permission is required" sentence in GitHub's documentation; flag this as the lowest-confidence claim in this document if it ever needs re-verification.

## Recommended workflow steps

Putting Questions 1–2 together into concrete job steps (assumes a dedicated bot user's private signing key is available as `secrets.SSH_SIGNING_KEY`, and that its matching public key has already been uploaded to that bot account as a **signing**-type SSH key per issue #27 — both out of scope here):

```yaml
- name: Configure SSH tag signing
  env:
    SSH_SIGNING_KEY: ${{ secrets.SSH_SIGNING_KEY }}
  run: |
    key_path="$RUNNER_TEMP/tag_signing_key"
    umask 077
    printf '%s\n' "$SSH_SIGNING_KEY" > "$key_path"
    chmod 600 "$key_path"
    git config gpg.format ssh
    git config user.signingkey "$key_path"

- name: Create signed annotated tag
  run: git tag -s "v${{ steps.version.outputs.version }}" -m "${{ steps.version.outputs.version }}"

- name: Push tag
  run: git push origin "v${{ steps.version.outputs.version }}"

- name: Remove signing key
  if: always()
  run: rm -f "$RUNNER_TEMP/tag_signing_key"
```

Notes on this shape:

- No `ssh-agent` step anywhere — `user.signingkey` pointing at the private-key file path is sufficient (Question 1).
- No `gpg.ssh.allowedSignersFile` configuration — not needed to create the signature, and GitHub's server-side verification doesn't use it either (Question 1, Question 3).
- The private key must be passphrase-less for the non-interactive `ssh-keygen -Y sign` call to succeed without a prompt (Question 1); key-generation/rotation policy for that is issue #27's concern.
- For the resulting tag to actually show "Verified" on GitHub: the public half of `SSH_SIGNING_KEY` must be uploaded to the bot account as a **signing** key (not authentication), and — per Question 3's evidence — the tag's `tagger` identity does not need to match that bot account's name/email, and — per Question 4 — that bot account does not need any particular role on this repository for the badge to appear, though it will still need whatever separate push/write permission is required to actually push the tag ref in the first place (a distinct, non-verification concern).

## Sources

- [`git-config`, `gpg.format`](https://git-scm.com/docs/git-config#Documentation/git-config.txt-gpgformat) and surrounding `gpg.*`/`gpg.ssh.*` entries (git-scm.com), cross-checked verbatim against [`git/git`, `Documentation/config/gpg.adoc`](https://github.com/git/git/blob/master/Documentation/config/gpg.adoc)
- [`git-config`, `user.signingKey`](https://git-scm.com/docs/git-config#Documentation/git-config.txt-usersigningKey) (git-scm.com), cross-checked verbatim against [`git/git`, `Documentation/config/user.adoc`](https://github.com/git/git/blob/master/Documentation/config/user.adoc)
- [`git-tag`](https://git-scm.com/docs/git-tag) `-s`/`--sign` and `-u`/`--local-user` (git-scm.com), cross-checked against [`git/git`, `Documentation/git-tag.adoc`](https://github.com/git/git/blob/master/Documentation/git-tag.adoc) lines 67–84
- [`ssh-keygen(1)`](https://man.openbsd.org/ssh-keygen.1) (OpenBSD manual pages) — `-Y sign`, `-Y verify`, and `ALLOWED SIGNERS` sections
- [About commit signature verification](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification) (GitHub Docs), full text cross-checked against the raw source at [`github/docs`, `content/authentication/managing-commit-signature-verification/about-commit-signature-verification.md`](https://github.com/github/docs/blob/main/content/authentication/managing-commit-signature-verification/about-commit-signature-verification.md)
- [Telling Git about your signing key](https://docs.github.com/en/authentication/managing-commit-signature-verification/telling-git-about-your-signing-key) (GitHub Docs), raw source at [`github/docs`, same path](https://github.com/github/docs/blob/main/content/authentication/managing-commit-signature-verification/telling-git-about-your-signing-key.md)
- [Signing tags](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-tags) (GitHub Docs)
- [Adding a new SSH key to your GitHub account](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account) (GitHub Docs) — authentication-vs-signing key type distinction
- [Checking your commit and tag signature verification status](https://docs.github.com/en/authentication/troubleshooting-commit-signature-verification/checking-your-commit-and-tag-signature-verification-status) (GitHub Docs)
- [Using a verified email address in your GPG key](https://docs.github.com/en/authentication/troubleshooting-commit-signature-verification/using-a-verified-email-address-in-your-gpg-key) (GitHub Docs) — confirms the GPG-only email-matching troubleshooting page, with no SSH counterpart in the same troubleshooting section (per [`github/docs`, `content/authentication/troubleshooting-commit-signature-verification/index.md`](https://github.com/github/docs/blob/main/content/authentication/troubleshooting-commit-signature-verification/index.md), which lists only those two child pages)
- [SSH commit verification now supported](https://github.blog/changelog/2022-08-23-ssh-commit-verification-now-supported/) (GitHub Changelog, 2022-08-23) — announcement of SSH commit/tag signing support
- [`github/ssh_data`](https://github.com/github/ssh_data) — the library GitHub's docs name as doing the cryptographic SSH-signature check; README confirms it is scoped to key/certificate parsing and signature verification only, no identity semantics
- [`webfactory/ssh-agent`](https://github.com/webfactory/ssh-agent) — community (non-GitHub-published, non-git-scm) Action implementing the `ssh-agent`-backed key-delivery pattern in CI; cited as the common Pattern B alternative, not as a primary source for the underlying git/GitHub mechanics
