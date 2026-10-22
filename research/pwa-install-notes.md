# Android standalone installation audit — 2026-10-16

## Conclusion

The Pinggy free endpoint demonstrably substitutes its screening HTML for fresh
browser requests to the game page, manifest, and icon. Use a clean HTTPS origin
to test standalone installation; do not diagnose the phone's exact disabled
Install message from the manifest alone. The existing service worker and the
reported successful offline shortcut play are separate from Android WebAPK
installation.

The current manifest should also provide real PNG icons at 192 and 512 pixels.
This has a concrete compatibility benefit: Chromium's restricted installability
icon selector accepts PNG, SVG, and WebP, but excludes JPEG. The existing SVG
`sizes:any` remains an accepted candidate, so this does **not** prove that the
manifest currently fails installation.

## Reproduced transport evidence

At 10:46 UTC, the following URL paths on
`https://qsrrb-93-158-190-148.free.pinggy.net` were requested with an Android
Chrome-like User-Agent and no cookies:

| Path | Result |
| --- | --- |
| `/` | HTTP 200; 15,467 bytes of Pinggy screening HTML |
| `/manifest.webmanifest` | HTTP 200; the same screening HTML |
| `/icon.jpg` | HTTP 200; the same screening HTML, not JPEG |

The screening body begins `<!DOCTYPE html>` and describes the free-tunnel
confirmation. Using the same User-Agent plus `X-Pinggy-No-Screen: 1` returned the
real manifest (`application/manifest+json`, 422 bytes) and icon (`image/jpeg`,
84,805 bytes) at 10:47 UTC. These are controlled diagnostic requests, not a
capture of the phone's requests.

Evidence is preserved in `pwa-install-audit/receipts.json`,
`receipts-followup.json`, `live-root.html`, `live-manifest.html`,
`live-icon.bin`, `live-manifest-bypass.html`, and `live-icon-bypass.bin`.
The `.html`/`.bin` extensions are capture filenames; their actual contents are
described above.

[Pinggy's official screening documentation](https://pinggy.io/docs/http_tunnels/screening/)
states:

- Free tunnels screen browser User-Agents, once per browser.
- Programmatic clients and custom/non-standard User-Agents bypass screening.
- A client can supply `X-Pinggy-No-Screen` to bypass it.
- Removing screening entirely is a Pinggy Pro feature.

There is no free server-side disable flag documented there. Adding the bypass
header only to our JavaScript fetches does not control browser manifest requests
or browser-process install requests. Moving to another free origin changes app
identity, caches, and saved-game storage; it should not be described as an update
to the existing installed app.

## Chromium installation behavior

The sources below are Chromium `main` as retrieved on 2026-10-16, not a verified
match for the phone's unspecified Chrome version. Local captures preserve the
exact reviewed code under `pwa-install-audit/`.

1. [Current installable evaluator](https://chromium.googlesource.com/chromium/src/+/main/components/webapps/browser/installable/installable_evaluator.cc)
   requires a supported square `purpose:any` icon of at least 144 pixels or size
   `any` for its valid-manifest-with-icons criterion. It does not require a
   separate 192-pixel entry. Manifest parsing/network failure is reported
   separately as `MANIFEST_PARSING_OR_NETWORK_ERROR`.
2. [Manifest icon selector](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/common/manifest/manifest_icon_selector.cc)
   uses the restricted MIME set `image/png`, `image/svg+xml`, and `image/webp`
   for installability. Our declared 512-pixel JPEG is outside this set; the
   declared SVG `sizes:any` is inside it. `sips -g pixelWidth -g pixelHeight`
   independently verified the source artwork is 512×512.
3. [WebAPK installer](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/android/webapk/webapk_installer.cc)
   redownloads icons to hash them before constructing an installation request.
   The request goes to the WebAPK minting service, which returns a token for
   Android installation; the browser then delegates installation to Google Play.
   See also the [native WebAPK architecture overview](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/android/webapk/README.md).
4. [Single icon hasher](https://chromium.googlesource.com/chromium/src/+/main/components/webapps/browser/android/webapk/webapk_single_icon_hasher.cc)
   explicitly sets `credentials_mode = CredentialsMode::kOmit` on its network
   redownload. This is a real install-stage fetch that cannot depend on the
   visitor's screening cookie. Its actual User-Agent and response on the phone
   have not been captured.
5. [Multiple-icon hasher](https://chromium.googlesource.com/chromium/src/+/main/components/webapps/browser/android/webapk/webapk_icons_hasher.cc)
   can fall back to the already decoded primary icon bitmap.
   [The proto builder](https://chromium.googlesource.com/chromium/src/+/main/components/webapps/browser/android/webapk/webapk_proto_builder.cc)
   includes primary icon bytes and parsed manifest data. Therefore the sources
   do **not** establish that Google's minting server must refetch all manifest
   and icon resources, or that the screened redownload necessarily fails the
   whole installation.

[Chrome's published promotion criteria](https://web.dev/articles/install-criteria)
recommend 192- and 512-pixel icons, HTTPS, suitable manifest fields, and user
engagement. That document explicitly distinguishes promotion from the user's
ability to install manually. [Chrome's installation criteria update](https://developer.chrome.com/blog/update-install-criteria)
also states that a service worker with a fetch handler ceased being a menu
installation requirement in Chrome 108 mobile. Our service worker is needed for
offline play regardless of that change.

## Recommended next action

Use a Cloudflare Quick Tunnel for the next clean-origin installation check.
[Official Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
documents:

```sh
cloudflared tunnel --url http://localhost:8873
```

It requires no account or domain and prints a temporary HTTPS
`trycloudflare.com` URL. Leave the optional `--allowed-mail` authentication
unset for this test. Official [download documentation](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)
links the
[macOS ARM archive](https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz).
The audit did not download or run the binary or change any tunnel.

Quick Tunnels have no uptime guarantee, change hostname on restart, and allow
200 in-flight requests. That is appropriate for a temporary test; the intended
GitHub Pages site with a stable HTTPS address is the durable solution.
Before sharing the replacement, verify no-cookie browser-UA requests return
the actual index, manifest JSON, and valid images, then inspect browser
installability and offline reload. This audit has not observed an actual Android
standalone installation.

## Remaining uncertainty

The user's P icon and tab-opening shortcut are consistent with having installed
metadata from the Pinggy screening page, but no phone trace proves this. The
exact reason for Chrome showing “This app cannot be installed” remains
unconfirmed. Neither offline shortcut success nor a desktop manifest check
alone proves Android standalone installation.

No production files or tests were changed by this audit.
