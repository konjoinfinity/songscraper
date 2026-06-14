# Git Workflow

- Conventional Commits: `type(scope): description`
  - Types: feat, fix, refactor, test, docs, chore, perf
- `git add && git commit && git push` after every completed sprint/phase
- `npm run lint` and `npm test` must be green before committing
- Never suppress command output — failures must be visible in real time
- Never commit with known failing tests
- Never commit secrets — `.env`, `creds.json`, `token.json`, refresh tokens stay out of the tree
