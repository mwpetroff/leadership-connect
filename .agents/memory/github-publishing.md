---
name: GitHub publishing
description: How to publish this workspace when the configured Git remote rejects its credential.
---

## Rule
If `git push origin main` fails with an invalid username or token error, do not ask the user for a GitHub token. The connected GitHub integration can still have valid OAuth access and can publish through GitHub's authenticated REST Git API.

**Why:** The workspace remote's HTTPS credential and the Replit GitHub connector are separate authentication paths. The remote rejected Git operations while the connector successfully read and wrote the repository.

**How to apply:** Verify the remote branch has not changed, upload changed blobs, create and verify the local tree through the Git API, then create a commit and advance the branch ref. Keep the local Git history untouched unless the user explicitly asks to reconcile or rewrite it.