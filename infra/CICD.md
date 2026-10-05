# Vibe CI/CD — test and deploy from GitHub

**CI** (`.github/workflows/ci.yml`) runs on every push and pull request, only for the parts that changed:

| Part | Checks |
|---|---|
| backend | lint, typecheck, unit tests, build, e2e tests against Postgres 16 + Redis 7 |
| admin, web | lint, typecheck, vitest, `next build` |
| landing | lint, typecheck, `next build` |
| face | `docker build --target test` (downloads the pinned models, runs pytest) |
| app | `flutter analyze --no-fatal-infos`, `flutter test` |

A change to `ci.yml` itself, or **Actions → CI → Run workflow**, runs everything. The final job **CI passed** sums it up.

**CD** (`.github/workflows/deploy.yml`) starts when CI passes on `main` → GitHub Actions SSHes into the server → runs `infra/deploy.sh` →
server pulls that commit, rebuilds `.env`, `docker compose up -d --build`, waits for the API → Actions checks the public URLs and the TURN relay.
If CI fails, nothing is deployed.

```
git push main ─▶ CI ✓ ─▶ Deploy ──(key A: SSH)──▶ server opc@145.241.156.60
                                                   │ deploy.sh
                                                   └─(key B: deploy key, read-only)─▶ git pull from GitHub
```

Two keys, both made **on the server**:

| Key | Private half lives in | Public half goes to | Used for |
|---|---|---|---|
| A `gh_actions` | GitHub secret `SSH_PRIVATE_KEY` | server `~/.ssh/authorized_keys` | GitHub logging into the server |
| B `vibe_deploy_key` | server `~/.ssh/` | GitHub repo → Deploy keys (read-only) | Server pulling the code |

If nothing server-side changed since the live commit (only `app/`, `docs/`, `.github/`, `*.md`, `notes.txt`), deploy.sh updates the checkout and leaves the containers running. **Actions → Deploy → Run workflow** always rebuilds — use it after a failed deploy too.

### Recommended: protect main

**Settings → Branches → Add rule** (or Rulesets) for `main`: require a pull request and the status check **CI passed**. Then broken code can't reach `main`, so it can't reach the server.

---

## One-time setup (≈10 minutes)

### Step 1 — Log in to the server (PowerShell on your PC)

```powershell
ssh -i "C:\Users\Tauseef\Desktop\Kids Coding Platform\repo\scripts\ssh-key-2026-10-02.key" opc@145.241.156.60
```

Everything in steps 2–4 runs **on the server** in that window.

### Step 2 — Key B: let the server pull from GitHub (deploy key)

```bash
command -v git || sudo dnf install -y git

ssh-keygen -t ed25519 -N "" -C "vibe-server-pull" -f ~/.ssh/vibe_deploy_key

cat >> ~/.ssh/config <<'EOF'

Host github-vibe
  HostName github.com
  User git
  IdentityFile ~/.ssh/vibe_deploy_key
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh-keyscan github.com >> ~/.ssh/known_hosts

cat ~/.ssh/vibe_deploy_key.pub        # copy this line
```

On GitHub: **github.com/fawadeqbal/vibe → Settings → Deploy keys → Add deploy key**

- Title: `vibe server`
- Key: paste the line
- **Allow write access: leave OFF**
- Add key

Back on the server, test it:

```bash
ssh -T git@github-vibe
# expected: "Hi fawadeqbal/vibe! You've successfully authenticated, but GitHub does not provide shell access."
```

### Step 3 — Key A: let GitHub Actions log in to the server

```bash
ssh-keygen -t ed25519 -N "" -C "github-actions-vibe" -f ~/.ssh/gh_actions
cat ~/.ssh/gh_actions.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

cat ~/.ssh/gh_actions                 # copy ALL of it, incl. the BEGIN/END lines → secret SSH_PRIVATE_KEY
```

And the server's host fingerprint (so GitHub can trust it's really your server):

```bash
for f in /etc/ssh/ssh_host_*_key.pub; do echo "145.241.156.60 $(cut -d' ' -f1,2 "$f")"; done
                                      # copy all lines → secret SSH_KNOWN_HOSTS
```

### Step 4 — Add the secrets on GitHub

**github.com/fawadeqbal/vibe → Settings → Secrets and variables → Actions → New repository secret**, four times:

| Name | Value |
|---|---|
| `SSH_HOST` | `145.241.156.60` |
| `SSH_USER` | `opc` |
| `SSH_PRIVATE_KEY` | output of `cat ~/.ssh/gh_actions` (whole thing) |
| `SSH_KNOWN_HOSTS` | output of the `for f in …` line |

Now delete the copy of key A's private half from the server (GitHub has it; the server only needs the `.pub` in `authorized_keys`):

```bash
rm ~/.ssh/gh_actions
```

### Step 5 — Commit and push the CD files

From your PC, in `apps/vibe`:

```powershell
git add .github/workflows/deploy.yml infra/deploy.sh infra/CICD.md .gitattributes
git commit -m "CD: deploy to server from GitHub Actions"
git push origin main
```

Watch it under **Actions → Deploy**. The first run turns `/opt/vibe` into a git checkout; `.env`, `infra/turn/certs` and the Docker volumes (database, photos) are untouched.

---

## Day to day

| I want to… | Do this |
|---|---|
| Deploy | `git push origin main` |
| Re-deploy without a change | Actions → Deploy → **Run workflow** |
| Roll back | On the server: `bash /opt/vibe/infra/deploy.sh <old-commit>` (the failure message prints the previous commit), or `git revert` + push |
| Deploy by hand | On the server: `bash /opt/vibe/infra/deploy.sh` |
| See what's live | On the server: `cd /opt/vibe && git log -1 --oneline` |

## Good to know

- `.env` on the server is rebuilt from `infra/.env.prod` on each deploy; the six pinned secrets (DB password, JWT, webhook, encryption key) keep the server's values — same rule as `deploy.ps1`.
- Only one deploy runs at a time (GitHub `concurrency` + a lock file on the server).
- The shared Caddy proxy (`/opt/global-proxy/Caddyfile`) is not touched by deploys.
- `deploy.ps1` still works as a manual fallback, but don't mix them: it re-uploads files over the git checkout. After a `deploy.ps1` run, the next push simply resets the files back to git.
- Optional approval gate: **Settings → Environments → production → Required reviewers** → every deploy waits for your click.
- If a key ever leaks: remove its line from `~/.ssh/authorized_keys` (key A) or delete it under Deploy keys (key B), then repeat its step.
