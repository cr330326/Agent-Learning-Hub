# Cloud Mode verification on the target host

- Date: 2026-08-20
- Host: `VM-0-9-ubuntu` (tencent-lighthouse), Ubuntu 24.04, x86_64
- Image: `ghcr.io/cr330326/agent-learning-hub:v0.1.0` (linux/amd64,
  digest `sha256:76da5d2a84f1f39cc8759f2c1fd2da33f827755460d6fe305c6e5c803123af3c`)
- Binding: `127.0.0.1:3000` only — never exposed publicly
- Secrets: throwaway, sufficient only to render anonymous pages. No GitHub OAuth
  app exists yet, so the login half is deliberately out of scope here.

The image was transferred over SSH (`docker save | ssh docker load`) because the
GHCR package is private and the host is not authenticated against it.

## Results

| Check | Result |
| --- | --- |
| `/api/health` | `{"status":"ok","mode":"cloud","checks":{"catalog":"ok","database":"ok"}}` |
| Home page smoke (cloud) | pass |
| Public page smoke | pass, 9 routes |
| Health smoke + admin boundary | pass |
| `/api/state` anonymous | 401 |
| `/api/data` anonymous | 401 |
| `/api/admin/health` anonymous | 401 |
| `/api/local-image?path=README.md` | 404 |
| `/read/<local-preferred item>` | 200, safe fallback — no third-party body |
| Image contains `local-courses` or `*.sqlite` | none |

The reader fallback was checked by content, not status code: the page renders
"READER / SAFE FALLBACK — 这个条目当前没有站内正文" and none of the five
third-party body markers appear anywhere in the HTML. Navigation correctly shows
"登录" and the "云端模式" badge rather than the Local Mode wording.

## What this does not cover

Public DNS, TLS via Caddy, a real GitHub OAuth app, and therefore the entire
authenticated half (login, learning state, export, account deletion) on the
host. Those need the domain and OAuth credentials the maintainer holds. The
authenticated half is covered on a developer machine and container-to-container
by `test:e2e:cloud` (29/29); see T8.12.

The instance was torn down after verification: leaving a container configured
with placeholder OAuth secrets on the production host would invite mistaking it
for a real deployment. The image stays loaded on the host, so a real deploy does
not need the transfer again.
