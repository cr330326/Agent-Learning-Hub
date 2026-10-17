# Functional regression

- Instance: http://127.0.0.1:3001
- Generated: 2026-10-17T03:40:46.861Z
- Checks: 24, failed: 0, skipped: 3

| Result | Check | Detail |
| --- | --- | --- |
| PASS | runtime mode detected | local |
| PASS | internal links resolve | 78 internal links, all < 400 |
| PASS | header navigation reaches every section | 6 sections reachable |
| PASS | roadmap rows open their stage | 9 rows; first opens 理解 Agent 是什么 |
| PASS | stage pages chain prev/next | stage-0 and stage-8 boundaries correct |
| PASS | catalog pagination advances | next/prev change the result window |
| PASS | catalog filters narrow results | 57 of 384 after track=learning |
| PASS | empty filter combination explains itself | empty state present with recovery guidance |
| PASS | unknown filter values are ignored | 384 items kept; internal tags hidden |
| PASS | stage filter is reachable and preselected | 2 items for stage-1, filter preselected |
| PASS | search returns and filters results | 24 results, kind labels localised |
| PASS | search results are not duplicated | 24 distinct results with per-result context |
| SKIP | reader opens the course document | 本地素材未挂载：该条目回退到上游，没有正文可断言 |
| SKIP | reader chapter tabs switch content | 本地素材未挂载：该条目回退到上游，没有正文可断言 |
| SKIP | reader has previous/next chapter links | 本地素材未挂载：该条目回退到上游，没有正文可断言 |
| PASS | reader in-body links are not dead ends | no unresolved document-relative links |
| PASS | reader table of contents anchors exist | every TOC entry resolves to a heading |
| PASS | course detail exposes references | 3 references, metadata localised |
| PASS | bookmark persists and can be undone | bookmark round-trips to the dashboard |
| PASS | stage task checkbox persists | "画出 agent loop" persisted across a reload |
| PASS | stage page ticks tasks and roadmap shows it | stage tick round-trips; roadmap went "动作 0/3" → "动作 1/3" |
| PASS | private note saves and deletes | note created then removed |
| PASS | personal data export responds | JSON and Markdown exports both respond |
| PASS | no console errors during the run |  |
