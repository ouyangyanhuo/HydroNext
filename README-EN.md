# HydroNext

[![hydrooj](https://img.shields.io/npm/dm/hydrooj)](https://www.npmjs.com/package/hydrooj)
[![npm](https://img.shields.io/npm/v/hydrooj?label=hydrooj)](https://www.npmjs.com/package/hydrooj)
[![node-current](https://img.shields.io/node/v/hydrooj)](https://www.npmjs.com/package/hydrooj)
[![GitHub contributors](https://img.shields.io/github/contributors/ouyangyanhuo/HydroNext)](https://github.com/ouyangyanhuo/HydroNext/graphs/contributors)
[![GitHub commit activity](https://img.shields.io/github/commit-activity/y/ouyangyanhuo/HydroNext)](https://github.com/ouyangyanhuo/HydroNext/commits/master)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

HydroNext is a downstream distribution of [hydro-dev/Hydro](https://github.com/hydro-dev/Hydro). It tracks the upstream core while replacing the frontend with a new React implementation, and adds features for online exams, coursework and day-to-day operations out of the box.

Everything from upstream is preserved: a modular plugin architecture, single-instance multi-domain isolation, a fine-grained permission system, multiple contest rules, support for every problem type, and one-click backup/import. On top of that, HydroNext adds:

- **A new React frontend (`ui-next`)** — a single-page app built on React 19 + Vite + Mantine, whose pages are wired to backend plugins through a registry.
- **An online proctoring client (Electron)** — a desktop app paired with the backend's `HydroNext-proctor/1` protocol for device and network control during an exam, plus log upload.
- **Honor frames** — wearable 512×512 avatar frames; admins upload and grant them, users wear them on their profile.
- **Code replay** — records a contestant's complete editing history and replays it against a submission afterwards.
- **Team participation** — team creation, invite-code joins, captain management and post-contest member attribution.
- **Client hot updates** — host proctoring client builds in the admin panel with signature verification and version rollout.
- **Accent themes** — four preset color schemes (default / blue / violet / rose), adaptive to light and dark mode.

Development documentation lives in [`docs/`](docs/), organized by development, installation, system administration, plugins, API and user guides (Chinese and English).

> This is a modified version of Hydro, renamed to HydroNext as required by section 7(c) of AGPL-3.0, retaining the upstream copyright notice and attribution.

## Requirements

| Component | Version |
|---|---|
| Node.js | `>= 22` |
| MongoDB | `7` |
| Yarn | `4` (`packageManager: yarn@4.17.0`) |
| go-judge (sandbox) | `1.13.3` (pinned and SHA-256 verified in the Docker image) |

## Quick start

```bash
# Install dependencies (postinstall runs build/prepare.js)
yarn

# Build the backend (TypeScript compile)
yarn build

# Build the frontend (either one)
yarn build:ui      # legacy ui-default (Nunjucks / Webpack)
yarn build:ui-next # new ui-next (Vite / React)

# Start the server, listening on port 8888 by default
yarn start
```

Then open `http://localhost:8888/` and follow the setup flow to create the admin account and the first domain.

### Development mode

```bash
yarn debug              # start the backend in debug mode (--debug --template --trace)
yarn build:watch        # incremental backend compile
yarn build:ui:dev       # ui-default dev mode (watch)
yarn workspace @hydrooj/ui-next dev   # ui-next dev server (HMR port 3010)
```

## Layout

```
packages/      core packages (hydrooj, hydrojudge, ui-default, ui-next, code-replay, ...)
framework/     framework layer (web server, router, decorators, utils)
docs/          development documentation (Chinese and English)
install/       deployment (docker, helm-single, nix, install.sh)
test/          integration tests
examples/      example configs and plugins (examples/plugins/ holds plugin examples)
```

## Frontend

### ui-next (new, default)

`packages/ui-next` is a single-page app built with Vite + React 19 + Mantine 9 + Tailwind 4. The backend `ui-next` package registers a `next` renderer at `priority: 100`, which takes over HTML output for every template, injecting the route name and serialized context into the SPA shell; the frontend then renders the matching page (82 pages currently).

Pages are assembled through a registry, so plugins can extend the UI without touching frontend source:

```ts
import {
  installPlugin, defineSlot, registerPage, registerLayout, intercept,
} from '@/registry';

api.registerPage('example_home', () => import('./pages/example_home'));
api.registerLayout('wide', WideLayout);
api.intercept('page:home_dashboard', (props, next) => next(props), { priority: 0 });
defineSlot('app:sidebar:bottom', MySidebar);
```

Available interceptors: `before` / `after` / `patch` / `replace` / `wrap` / `intercept`. A lower `priority` runs earlier and sits further out. A complete plugin example is at [`examples/plugins/ui-next-plugin/`](examples/plugins/ui-next-plugin/): the backend `index.ts` returns the template name `example_home.html`, and `ui/index.tsx` registers the page of the same name.

Frontend features include the Monaco editor, Markdown rendering (KaTeX / highlight.js), the code replay player, a contribution graph, problem statistics, four accent themes, light/dark mode, and Simplified Chinese / Traditional Chinese / English / Japanese / Korean UI translations.

Set the `HYDRO_UI_NEXT_DISABLE` environment variable or system setting to disable the frontend package and fall back to `ui-default`.

### ui-default (legacy)

`packages/ui-default` is the traditional frontend based on Nunjucks templates and Webpack, version `4.58.5`. It remains available for cases the new frontend does not cover yet, for custom templates, or during migration.

## Online proctoring

HydroNext ships a complete proctoring solution: an Electron desktop client (`exam-proctor-client/`, product name "在线监考客户端") and the backend handler at `packages/hydrooj/src/handler/proctor.ts`. The protocol is specified in [`docs/proctor-protocol.md`](docs/proctor-protocol.md). Key points:

- Protocol version `HydroNext-proctor/1`, HTTPS required; identity endpoint `/proctor/identity` (per-domain: `/d/<domainId>/proctor/identity`).
- Device keys are generated automatically in the client's main process (Ed25519); no registration codes.
- The server uses an Ed25519 signing key plus a separate RSA-3072/OAEP-SHA256 log key sharing one keyId; logs are identified by 256-bit opaque tokens stored as SHA-256.
- Default policy: exact client version match, token validity 300 seconds (60–1800), 30 days (1–365) of post-contest log backfill, 64 MiB (1–256) per file.

Admin pages: `/manage/proctor` (configuration, keys and grants), `/manage/proctor/logs` (log management and grading), and `/contest/:tid/proctor` during a contest. Configuration and private key access require the `PRIV_EDIT_SYSTEM` privilege plus a second-factor challenge (sudo). Keys are stored under `HYDRO_PROCTOR_KEY_DIR` (`~/.hydro/proctor-keys` by default); persist that directory when deploying with Docker.

Client builds are driven by `exam-proctor-client/.github/workflows/build.yml` (manually dispatched; inputs include build type, version, target URL and update origins).

> Security note: the client's public key can be extracted from an installer, so hiding it proves nothing about whether the program was modified. Never commit a server private key.

## Deployment

### Docker Compose

The `docker-compose.yml` at the repository root provides mongo + backend + judge:

```bash
docker compose up -d
```

- `oj-mongo`: `mongo:7-jammy`;
- `oj-backend`: `hydrooj/backend:latest`, port mapping `8282:8888`, volumes `./data/file:/data/file` and `./data/backend:/root/.hydro`;
- `oj-judge`: `hydrooj/judge:latest`, requires `privileged: true`, sandbox listening on container-local `127.0.0.1:5050`.

Building the backend image runs `yarn workspace @hydrooj/ui-next vite build` and symlinks `ui-next` and `code-replay` into `/opt/hydro-addons`. Maintenance scripts and backup details are in [`install/docker/README.md`](install/docker/README.md): a daily 03:00 backup and restart using flock plus Compose v2 `start --wait`; backups are a single full copy stored in `backup-file/` and marked with `.hydro-backup`.

### Helm / Nix / install script

- **Helm**: `install/helm-single`; chart values in `values.yaml`.
- **Nix**: `install/nix` (`default.nix`, `env.nix`, `hydro.nix`) and `install/install.ts` (`nix profile install github:hydro-dev/nix-channel/master#...`).
- **One-liner**: `install/install.sh` (v3.0.1, requires root, includes a system telemetry notice and calls `curl https://hydro.ac/nix.sh`).
- **Reset / uninstall**: `install/reset.sh`, `install/uninstall.sh`.

### Judge hosts

Standalone judge hosts are driven by `packages/hydrojudge`, which connects to the backend over WebSocket and invokes the go-judge sandbox on `http://localhost:5050` to execute code. Judging uses a pinned testlib revision (pinned by commit and SHA-256 verified in the Docker image). Backup and restore:

```bash
yarn hydrooj backup
yarn hydrooj restore <filename>
```

## Common commands

The CLI is provided by `packages/hydrooj/bin/hydrooj.js`:

```bash
yarn debug cli                 # enter the interactive CLI
yarn hydrooj install <pkg>     # install an addon
yarn hydrooj uninstall <pkg>   # uninstall an addon
yarn hydrooj addon list        # list loaded addons
yarn hydrooj addon create <name>
yarn hydrooj db                # database maintenance
yarn hydrooj backup            # back up the database
yarn hydrooj restore <file>    # restore the database
yarn hydrooj diag              # diagnostics
```

## Tests and linting

```bash
yarn test:unit   # Node.js test runner + Chai over framework/ and packages/*/tests/*.spec.ts
yarn test        # unit tests + test/entry.js integration tests
yarn lint:ci     # ESLint with zero warnings allowed
yarn oxlint      # oxlint checks
```

## Contributing

Repository conventions are in [AGENTS.md](AGENTS.md) (Yarn 4 TypeScript monorepo layout, code style, naming, commit format) and [CONTRIBUTING.md](CONTRIBUTING.md). Commit subjects follow Conventional Commits, e.g. `feat: add theme selector`, `fix(domain & judge): apply domain config`. Pull requests that change the UI need screenshots. Contributors remain responsible for reviewing and explaining AI-assisted changes; automated submissions are not accepted.

## License

- Contents under `framework/`, `examples/` and `install/` are MIT licensed.
- Contents under `packages/ui-default/` are AGPL-3.0 licensed only.
- The rest of the project is licensed under AGPL-3.0 with the additional terms below; contact us for a different license if closed-source use is required.

### Additional terms

Under section 7 of AGPL-3.0, use of this project is subject to the following additional terms:

1. You must not remove the copyright declaration and author/source attribution. ([AGPL3 7(b)](LICENSE#L356))
2. When redistributing a modified version of the software, you must identify the change in the software name or version number. ([AGPL3 7(c)](LICENSE#L360))
3. Unless permitted, you may not use the author's name for promotional purposes. ([AGPL3 7(d)](LICENSE#L364))

When deploying HydroNext, keep the `Powered by Hydro` text in the footer, with `Hydro` linking to one of `hydro.js.org/this repository/a fork`. Modifications to the source must be released under AGPL-3.0-or-later; note them in the footer in the form `Powered by Hydro, Modified by xxx`.

## Thanks to

In no particular order, in link dictionary order:

- [GitHub](https://github.com/) for code hosting and automated builds.
- [criyle](https://github.com/criyle) for the judging sandbox.
- [Hydro](https://github.com/hydro-dev/Hydro) for the upstream project.
- [Vijos](https://github.com/vijos/vj4) for the UI framework Hydro builds on.

## Sponsors

- [云斗学院](https://www.yundouxueyuan.com)
