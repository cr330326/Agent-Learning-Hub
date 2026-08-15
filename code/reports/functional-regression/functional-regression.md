# Functional regression

- Instance: http://127.0.0.1:3210
- Generated: 2026-08-15T10:33:56.308Z
- Checks: 23, failed: 0

| Result | Check | Detail |
| --- | --- | --- |
| PASS | runtime mode detected | local |
| PASS | internal links resolve | 132 internal links, all < 400 |
| PASS | header navigation reaches every section | 6 sections reachable |
| PASS | roadmap rows open their stage | 9 rows; first opens 理解 Agent 是什么 |
| PASS | stage pages chain prev/next | stage-0 and stage-8 boundaries correct |
| PASS | catalog pagination advances | next/prev change the result window |
| PASS | catalog filters narrow results | 63 of 515 after track=learning |
| PASS | empty filter combination explains itself | empty state present with recovery guidance |
| PASS | unknown filter values are ignored | 515 items kept; internal tags hidden |
| PASS | search returns and filters results | 24 results, kind labels localised |
| PASS | search results are not duplicated | 24 distinct results with per-result context |
| PASS | reader opens the course document | 5126 characters rendered |
| PASS | reader chapter tabs switch content | switched to 前言 |
| PASS | reader has previous/next chapter links | next then previous round-trips |
| PASS | reader in-body links are not dead ends | no unresolved document-relative links |
| PASS | reader table of contents anchors exist | every TOC entry resolves to a heading |
| PASS | course detail exposes references | 3 references, metadata localised |
| PASS | bookmark persists and can be undone | bookmark round-trips to the dashboard |
| PASS | stage task checkbox persists | "画出 agent loop" persisted across a reload |
| PASS | stage page ticks tasks and roadmap shows it | stage tick round-trips; roadmap went "动作 0/3" → "动作 1/3" |
| PASS | private note saves and deletes | note created then removed |
| PASS | personal data export responds | JSON and Markdown exports both respond |
| PASS | no console errors during the run |  |
