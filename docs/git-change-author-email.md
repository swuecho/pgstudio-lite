# How to Change Git Author Email

A step-by-step guide to updating the author/committer email in a Git repository — from simple config changes to full history rewrites.

---

## Table of Contents

1. [Change the email for future commits only](#1-change-the-email-for-future-commits-only)
2. [Change the email of the most recent commit](#2-change-the-email-of-the-most-recent-commit)
3. [Rewrite all commits in the current branch](#3-rewrite-all-commits-in-the-current-branch)
4. [Rewrite commits across all branches](#4-rewrite-commits-across-all-branches)
5. [Verify & clean up](#5-verify--clean-up)
6. [Push to remote](#6-push-to-remote)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Change the email for future commits only

If you only care about **new** commits going forward:

```bash
# Set globally (affects all repos)
git config --global user.email "new@email.com"
git config --global user.name "Your Name"

# Or set per-repo (affects only this repo)
git config user.email "new@email.com"
git config user.name "Your Name"
```

Verify:

```bash
git config user.email
git config user.name
```

---

## 2. Change the email of the most recent commit

To fix only the latest commit (amend it):

```bash
git commit --amend --author="Your Name <new@email.com>" --no-edit
```

The `--no-edit` flag keeps the existing commit message. Omit it to edit the message too.

If the commit was already pushed:

```bash
git push --force
```

---

## 3. Rewrite all commits in the current branch

Use `git filter-branch` with an environment filter to rewrite every commit on the current branch:

```bash
git filter-branch --env-filter '
OLD_EMAIL="old@email.com"
NEW_NAME="Your Name"
NEW_EMAIL="new@email.com"

if [ "$GIT_COMMITTER_EMAIL" = "$OLD_EMAIL" ]; then
    GIT_COMMITTER_NAME="$NEW_NAME"
    GIT_COMMITTER_EMAIL="$NEW_EMAIL"
fi
if [ "$GIT_AUTHOR_EMAIL" = "$OLD_EMAIL" ]; then
    GIT_AUTHOR_NAME="$NEW_NAME"
    GIT_AUTHOR_EMAIL="$NEW_EMAIL"
fi
' --tag-name-filter cat -- --branches --tags
```

This rewrites every branch and tag in the repository.

---

## 4. Rewrite commits across all branches

To rewrite **every ref** (local branches, remote-tracking branches, tags, stashes, etc.):

```bash
git filter-branch --env-filter '
if [ "$GIT_AUTHOR_EMAIL" = "old@email.com" ]; then
    GIT_AUTHOR_EMAIL="new@email.com"
fi
if [ "$GIT_COMMITTER_EMAIL" = "old@email.com" ]; then
    GIT_COMMITTER_EMAIL="new@email.com"
fi
' -- --all
```

**Options explained:**

| Flag           | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `--env-filter` | Runs a shell script for each commit to modify author/committer |
| `-- --all`     | Processes all refs (branches, remotes, tags, stashes)          |
| `-f`           | Force re-run if a previous filter-branch left backup refs      |

---

### Check which refs still have the old email

```bash
for ref in $(git for-each-ref --format='%(refname)'); do
    email=$(git log -1 --format='%ae' "$ref" 2>/dev/null)
    if [ "$email" = "old@email.com" ]; then
        echo "$ref -> $email"
    fi
done
```

### Rewrite a specific ref that was skipped

Sometimes filter-branch marks a ref as "unchanged" (e.g., remote-tracking branches that diverged). Force-rewrite it individually:

```bash
git filter-branch -f --env-filter '
if [ "$GIT_AUTHOR_EMAIL" = "old@email.com" ]; then
    GIT_AUTHOR_EMAIL="new@email.com"
fi
if [ "$GIT_COMMITTER_EMAIL" = "old@email.com" ]; then
    GIT_COMMITTER_EMAIL="new@email.com"
fi
' refs/remotes/origin/branch-name
```

---

## 5. Verify & clean up

### Confirm no old emails remain

```bash
git log --all --format='%ae' | grep -c 'old@email.com'
# Should return 0
```

### Remove filter-branch backup refs

filter-branch creates backups under `refs/original/`. Delete them once you've confirmed the rewrite is correct:

```bash
git for-each-ref refs/original/ --format='%(refname)' | while read ref; do
    git update-ref -d "$ref"
done
```

### Expire the reflog and garbage-collect

Old commits may still be reachable through the reflog. Clean them up:

```bash
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

> ⚠️ `--prune=now` removes all unreachable objects. **Do this only after you've confirmed the rewrite is correct**, as there is no undo.

---

## 6. Push to remote

Once everything looks correct locally, force-push all branches and tags:

```bash
git push --force --all origin
git push --force --tags origin
```

> ⚠️ **Warning**: Force-pushing rewrites remote history. Coordinate with all collaborators before doing this. Anyone who has pulled the old history will need to rebase or re-clone.

---

## 7. Troubleshooting

### filter-branch says a ref is "unchanged" but it still has old emails

This can happen with remote-tracking branches. Run filter-branch again specifically on that ref with `-f` (force):

```bash
git filter-branch -f --env-filter '...' refs/remotes/origin/problem-branch
```

### "cannot lock ref" when deleting backup refs

A previous filter-branch run may have already moved the backup. Run `git for-each-ref refs/original/` to see what remains, then delete them individually:

```bash
git update-ref -d refs/original/refs/heads/some-branch
```

### How to revert if something goes wrong

If you haven't deleted the backup refs yet, you can restore the original history:

```bash
git for-each-ref refs/original/ --format='%(refname:short)' | while read ref; do
    original="refs/original/$ref"
    git update-ref "$ref" "$(git rev-parse $original)"
done
```

If backup refs are already deleted, you'll need to re-clone from the remote (assuming the remote hasn't been force-pushed yet).

---

## Quick Reference

| Goal                   | Command                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------- |
| Future commits only    | `git config user.email "new@email.com"`                                               |
| Amend last commit      | `git commit --amend --author="Name <new@email.com>"`                                  |
| Rewrite current branch | `git filter-branch --env-filter '...' HEAD`                                           |
| Rewrite all branches   | `git filter-branch --env-filter '...' -- --all`                                       |
| Force push             | `git push --force --all origin`                                                       |
| Clean up backups       | `git for-each-ref refs/original/ --format='%(refname)' \| xargs -r git update-ref -d` |
| Garbage collect        | `git reflog expire --expire=now --all && git gc --prune=now --aggressive`             |
