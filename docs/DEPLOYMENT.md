# Publishing the game

Publish the generated `build/web/` directory to a stable HTTPS address. This
is a maintainer guide; player instructions are in the [README](../README.md).

## Before publishing

1. Confirm permission to redistribute the included original game artwork,
   audio and fonts. They are third-party resources; this project does not grant
   rights to them.
2. Prepare the checkout using the [development guide](DEVELOPMENT.md#quick-start)
   and run `npm ci` followed by `npm run check`. Publish the output of that
   successful run. An older ZIP or previous test result does not validate a new
   release.
3. Choose a permanent HTTPS address and complete the relevant
   [physical-device checks](DEVICE-TESTING.md) there. Record the tested commit,
   URL, device and result. Use the same address for later updates so players can
   keep their saved games and installed app.
4. Review [acceptance](ACCEPTANCE.md) before describing support or fidelity.
   iPad gesture/Help retesting, Apple installed offline/audio checks, iPhone
   coverage, sustained device performance and a human campaign playthrough
   remain open in the recorded evidence.

The build is a static site with no server runtime or backend. Only publish
`build/web/`, never the project root: source code, research inputs and local
artifacts are not part of the game download.

## GitHub Pages

1. Push the repository to GitHub, including `data/game-source.json`,
   `tests/fixtures/` and the required files in `dist/assets/`. Original
   executables, research captures and generated QA artifacts stay ignored.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
   Pages availability for private repositories depends on your GitHub plan;
   a private repository does not automatically make its Pages site private.
3. Run **Actions → Check and deploy GitHub Pages → Run workflow** on the default
   branch, or push a commit to it. Pull requests and other branches run checks
   without deploying. Deployment waits for `npm run check` to pass.
4. Configure [the custom domain](#custom-domain-knightsmahenzonru), open
   `https://knights.mahenzon.ru` and run the device checks against that address.

The [workflow](../.github/workflows/pages.yaml) installs Node.js 24, Python 3.12
and the Rust toolchain pinned in `rust-toolchain.toml`, then uploads only
`build/web/`. GitHub Pages serves that artifact without Jekyll processing.
Normal CI uses the committed focused fixtures. The optional
[`npm run test:native`](DEVELOPMENT.md#optional-native-replay-checks) comparisons
require local captures and are not part of CI or the Pages artifact.
Relative asset, manifest and service-worker paths support both a project URL
such as `https://OWNER.github.io/REPOSITORY/` and a custom domain. No base URL
setting, deployment secret or generated-site branch is required.

Actions are pinned to full commit SHAs, with release versions in comments.
[Dependabot](../.github/dependabot.yaml) checks weekly for action updates and
opens pull requests; review and merge them to keep the workflow current.
The npm lockfile uses public npm registry URLs so GitHub-hosted runners can
install the pinned tools without access to a private registry.

### Custom domain: knights.mahenzon.ru

1. In the repository's **Settings → Pages**, select **GitHub Actions** as the
   publishing source. Under **Custom domain**, enter `knights.mahenzon.ru` and
   click **Save**. Save this setting before adding DNS records.
2. At the DNS provider for `mahenzon.ru`, create this record:

   | Type | Name / host | Target / value | TTL |
   | --- | --- | --- | --- |
   | `CNAME` | `knights` | `mahenzon.github.io` | `3600` or Auto |

   `mahenzon` is the GitHub account that owns this repository.
   Do not include `https://` or the repository name. Providers
   that require the full hostname should use `knights.mahenzon.ru` in the name
   field. Use DNS-only mode if the provider offers proxying, and remove any
   conflicting `A` or `AAAA` records for `knights`; leave the apex domain's
   records unchanged.
3. Run **Actions → Check and deploy GitHub Pages → Run workflow** on the default
   branch. This is also the retry path if the first push ran before Pages was
   enabled. Later pushes to the default branch deploy automatically after the
   checks pass. No deployment token or secret needs to be added.
4. Once GitHub's DNS check and certificate provisioning finish, enable
   **Enforce HTTPS** in **Settings → Pages**. DNS propagation can take up to
   24 hours. Verify `https://knights.mahenzon.ru` and use that address for
   installed apps and future updates.

For this Actions-based publishing workflow, GitHub stores the custom domain
in the Pages settings. A `CNAME` file in the repository or uploaded artifact
is ignored and is not required. See GitHub's
[custom-domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site#configuring-a-subdomain).

To check DNS after saving the record:

```sh
dig +short CNAME knights.mahenzon.ru
```

The answer should be `mahenzon.github.io.`. Browser saves from another
hostname, including a temporary `github.io` URL, do not transfer to this domain.

## Other static hosts

1. Upload the contents of the freshly checked `build/web/` directory together.
   `index.html` must be at the site root; retain the `art/` and `assets/`
   subdirectories and every generated file.
2. Serve the site over HTTPS at a hostname root or a directory such as
   `/knights/`. A directory address must redirect its slashless form to the
   trailing slash.
3. Use standard MIME types: JavaScript for `.mjs`/`.js`, `application/wasm` for
   `.wasm`, `audio/mpeg` for `.mp3`, `application/manifest+json` for
   `.webmanifest`, `image/png` for `.png` and binary data for `.pack`.
4. Serve HTML, modules and `sw.js` with revalidation (`Cache-Control: no-cache`).
   Do not mark these unversioned URLs immutable. Keep normal byte-range support
   for audio; the service worker handles offline caching.
5. Open the published site and complete the [device checks](DEVICE-TESTING.md).
   An HTTP success response alone does not prove installation, saved-battle
   recovery or offline audio works.

If the host requires a ZIP, package the contents of this same `build/web/`
directory with `index.html` at the archive root. The 17 October 2026 archive
recorded in [acceptance](ACCEPTANCE.md) and [progress](PROGRESS.md) is historical
evidence, not the current release candidate.

## Updates and installation

Keep the same address and path for updates. Players should wait for the offline
download to finish and use **Update game**. A different hostname has separate
browser saves and a separate installation; temporary tunnel URLs are unsuitable
as the lasting address. Old preview-session details remain in
[progress](PROGRESS.md) and should not be used as current deployment instructions.

The offline installer checks every file against the build's SHA-256 digest,
including files reused after an interrupted download. If a deployment changes
during installation, mismatched files cannot activate as part of that release;
the previous active cache stays available. Publish the generated files together
and keep their bytes unchanged.

The build includes 192 px and 512 px PNG manifest icons and a 180 px Apple touch
icon. Android's installed app may update its manifest separately from the game
service worker, so a page refresh alone may not apply display changes. Preserve
the existing app and site data when checking updates.

The manifest requests fullscreen. iOS may retain a system status bar, and Apple
touch devices use page expansion to avoid native fullscreen swipe dismissal.
Safari chrome can remain in a browser tab; Home Screen installation provides
standalone presentation. See the [device checklist](DEVICE-TESTING.md) for the
installation and airplane-mode acceptance steps.
