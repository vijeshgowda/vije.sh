# Omni signalling server

The WebSocket relay behind `/lab/omni`. It pairs two browsers in a room and forwards their
handshake (`signal` messages); it never sees keys, messages or media. This folder is Render's
deployment root, and Playwright starts the same folder with the same commands for the e2e specs.

Vendored from `vijeshgowda/coming-soon-temp` `omni/server/index.js` at commit
`c2a2056a34b9805cccc68b42d848c826078726fa` (the commit the client's wire protocol is pinned to).
The protocol is unchanged; the only changes are the origin allow-list below and logging the bound
port. The old GitHub Pages Omni (`https://vijeshgowda.com`) speaks the same protocol but isn't on
the allow-list, so once `ALLOWED_ORIGINS` is removed from Render it gets 403. Add its origin to
`origins.js` if it should keep working.

## Origin allow-list

Render has no CORS setting; the server checks the browser's `Origin` header itself and refuses a
mismatch with HTTP 403.

- `origins.js` holds the committed production list: exactly `https://vije.sh`.
- `ALLOWED_ORIGINS` (comma-separated, exact origins) replaces that list for one process. Leave it
  unset in production. An empty or missing value keeps the committed list; it never allows every
  origin. An entry that isn't an exact `http(s)://host[:port]` origin (path, trailing slash,
  wildcard) stops the server from starting.

## Commands

Run from this folder (or add `--prefix services/omni-signaling` from the repository root):

```fish
npm ci --omit=dev   # install (Render's build command)
npm start           # PORT defaults to 8080 (Render's start command)
npm run dev         # local: port 8080, allows http://localhost:3000, restarts on change
npm test            # node:test suites (origins, protocol, 403 on a foreign origin)
```

From the root, `npm run test:signaling` installs and runs the tests (CI does this too).

To use it from `npm run dev`, set `NEXT_PUBLIC_OMNI_SIGNALING_URL=ws://localhost:8080` in
`.env.local` and restart Next.js.

## Render

| Setting          | Value                                       |
| ---------------- | ------------------------------------------- |
| Repository       | `vijeshgowda/vije.sh`                       |
| Root Directory   | `services/omni-signaling`                   |
| Runtime          | Node                                        |
| Build Command    | `npm ci --omit=dev`                         |
| Start Command    | `npm start`                                 |
| Health Check     | `/health`                                   |
| Build Filters    | include `services/omni-signaling/**`        |
| Environment      | none required (Render sets `PORT`)          |

There is no Dockerfile or `render.yaml`: Render uses the Node runtime and the settings above.
Delete any `ALLOWED_ORIGINS` value on Render once vije.sh is tested against this deployment,
because it overrides the committed list.
