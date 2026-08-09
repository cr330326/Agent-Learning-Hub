# Mobile and accessibility acceptance

Date: 2026-08-09  
Viewport: 390×844, device scale factor 1, mobile/touch emulation  
Runtime: Local Mode production build on `127.0.0.1`

## Result

The mobile first-release flow is accepted. The route, search, reader, private
note and stage-outcome flow completed without switching to a desktop viewport.
The final Lighthouse snapshot for the learning panel scored 100 for
Accessibility, Best Practices, SEO and Agentic Browsing, with 32 passed and 0
failed. The final search snapshot scored 100 in all four categories, with 31
passed and 0 failed.

## Walk-through evidence

| Flow           | Evidence                                                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roadmap        | `/roadmap` rendered all nine stages; `scrollWidth=390` matched the viewport; one `h1` and nine stage `h2` headings were present; no unlabeled controls were found.                                                                                                                                      |
| Search         | `/search?q=agent` rendered 619 results including allowlisted local chapters; `scrollWidth=390`; favicon request resolved to `/icon.svg`; no console messages.                                                                                                                                           |
| Reader         | The long local chapter rendered at 33,133px document height with the article TOC and local chapter navigation; `scrollWidth=390`; no console messages. A 390×844 reader viewport screenshot was captured during this acceptance session and intentionally not committed because it contains course正文. |
| Private note   | The mobile learning form accepted a Markdown note and rendered it back from `/api/state` with `noteCount=1`. Every input/select/textarea had a stable `id` and `name`.                                                                                                                                  |
| Stage outcome  | The same form accepted a repository URL, rendered the outcome, and the `确认阶段完成` action persisted a non-null `confirmedAt`.                                                                                                                                                                        |
| Keyboard focus | Six Tab presses moved focus through the page; the focused link exposed a visible 3px coral outline with a 4px offset.                                                                                                                                                                                   |

## Issues found and fixed during acceptance

1. Chrome reported 12 learning-panel controls without `id/name`; the dashboard
   now assigns stable identifiers to task checkboxes, note fields and outcome
   fields.
2. Lighthouse found a 4.39 contrast ratio on the forest dashboard and 15px
   export/delete touch targets; the dashboard now uses the lighter text color
   and a 24px minimum touch target.

The final browser console was empty and the final Lighthouse audit had no
failed accessibility or touch-target checks.
