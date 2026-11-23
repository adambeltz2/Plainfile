# Contributing to Plainfile

Thanks for helping. Plainfile is a static web app over a plain folder of markdown files. Read `CLAUDE.md` for the rules the project follows (files are the source of truth, minimal writes, black and white, tests with every change).

## Set up

```bash
npm ci
npm run build
npm run serve        # http://127.0.0.1:4173
```

## Before you open a pull request

```bash
npm run format       # Prettier: run it, and your code matches the rest
npm run typecheck
npm test             # unit tests (Vitest)
npm run test:e2e     # browser tests (Playwright); run `npx playwright install chromium` once
npm run coverage     # optional: how much of src/ the unit tests reach (about 89% of lines today)
```

The browser tests include an accessibility scan (axe) of every main screen in light and dark; a new screen should be added to `tests/e2e/a11y.spec.ts`.

CI runs the format check, type check, unit tests and browser tests on every push. A red run is fixed before merging.

## Branches, pull requests and releases

Work on a branch and open a pull request; CI runs the format check, type check, unit tests and browser tests on it. Merging to `main` deploys the site and, if the version in `package.json` is new, publishes a GitHub release with that version's section of `CHANGELOG.md`. So every change that should ship bumps the version and adds a changelog entry.

## What a good change looks like

- **Small and focused.** One idea per pull request. A new idea you find on the way goes in `BACKLOG.md`.
- **With tests.** Any change in behavior adds or updates a test. Anything that writes to a user's files must have a test showing the file is byte-identical apart from the intended edit. Any visible UI change updates a browser spec in `tests/e2e/`.
- **Core in `src/`, screens in `web/`.** `src/` must not import from `web/`. Folder access goes through `VaultStorage`; a new storage adapter must pass `test/storage-contract.test.ts`.
- **Docs.** Bump the version in `package.json` and add a `CHANGELOG.md` entry; update `docs/FEATURES.md` for visible changes (and regenerate screenshots with `npm run screenshots`).
- **No new dependencies** unless the browser cannot do the job. Pin exact versions; a script loaded from a CDN needs a version and an integrity hash.

## Formatting

Prettier formats `.ts` and `.mjs` files (see `.prettierrc.json`). To keep `git blame` useful, run once:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```
