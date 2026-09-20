# Contributing

## Branching strategy
Trunk-based with short-lived branches. `main` is always releasable; nothing is committed to it directly.

| Branch | Purpose | Example |
| --- | --- | --- |
| `main` | Production-ready code; protected | |
| `feature/<phase>-<topic>` | New functionality, one story or phase slice | `feature/phase-3-multi-tenancy` |
| `fix/<topic>` | Bug fixes | `fix/approve-empty-body` |
| `refactor/<topic>` | Behaviour-preserving restructuring | `refactor/pr-service-layer` |
| `docs/<topic>` | Documentation only | `docs/branching-strategy` |
| `chore/<topic>` | Tooling, dependencies, CI | `chore/docker-compose` |
| `hotfix/<topic>` | Urgent fix branched from the latest release tag | `hotfix/jwt-expiry` |

Rules:
1. Branch from an up-to-date `main`; keep branches under about three days and one concern.
2. Open a pull request into `main`; squash-merge so `main` has one commit per change.
3. A PR merges only when CI is green (lint, tests) and the checklist below is done.
4. Delete the branch after merging.
5. Releases are tagged on `main` (`v1.0.0`, semantic versioning). Tag first, then branch `hotfix/*` from the tag if needed.

Branch protection to enable on GitHub for `main`: require pull request, require status checks, block force pushes.

## Commit messages
Conventional Commits: `<type>(<scope>): <summary>`, imperative, under 72 characters.
Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf`. Scopes match modules: `auth`, `vendors`, `requests`, `orders`, `tenancy`, `audit`, `client`.
Breaking changes: add `!` after the type and a `BREAKING CHANGE:` footer.

## Pull request checklist
- [ ] Tests added or updated; `npm test` passes locally
- [ ] Business rules touched are covered by a test
- [ ] Migrations are new files (never edit an applied migration)
- [ ] README endpoint tables and OpenAPI spec updated (once it exists)
- [ ] No secrets, no `.env` committed

## Mapping phases to branches
One branch per deliverable in the delivery plan, for example phase 3 becomes `feature/phase-3-tenant-model`, `feature/phase-3-tenant-scoped-prisma`, `feature/phase-3-isolation-tests`. Merge each slice as soon as it is green rather than holding one long-lived phase branch.
