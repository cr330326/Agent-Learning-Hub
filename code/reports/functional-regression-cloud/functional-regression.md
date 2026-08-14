# Functional regression

- Instance: http://127.0.0.1:3000
- Generated: 2026-08-14T14:28:54.526Z
- Checks: 22, failed: 0

| Result | Check | Detail |
| --- | --- | --- |
| PASS | runtime mode detected | cloud |
| PASS | internal links resolve | 76 internal links, all < 400 |
| PASS | header navigation reaches every section | 6 sections reachable |
| PASS | roadmap rows open their stage | 9 rows; first opens 理解 Agent 是什么 |
| PASS | stage pages chain prev/next | stage-0 and stage-8 boundaries correct |
| PASS | catalog pagination advances | next/prev change the result window |
| PASS | catalog filters narrow results | 63 of 515 after track=learning |
| PASS | empty filter combination explains itself | empty state present with recovery guidance |
| PASS | unknown filter values are ignored | 515 items kept; internal tags hidden |
| PASS | search returns and filters results | 24 results, kind labels localised |
| PASS | search results are not duplicated | 24 distinct results with per-result context |
| PASS | cloud reader withholds local material and offers upstream | body withheld, upstream link offered |
| PASS | reader opens the course document | 398 characters rendered |
| PASS | reader chapter tabs switch content | n/a in this mode |
| PASS | reader has previous/next chapter links | n/a in this mode |
| PASS | reader in-body links are not dead ends | no unresolved document-relative links |
| PASS | reader table of contents anchors exist | every TOC entry resolves to a heading |
| PASS | course detail exposes references | 3 references, metadata localised |
| PASS | anonymous cloud state is gated | dashboard, export and writes all refused |
| PASS | anonymous stage page stays read-only | 3 tasks readable, 0 controls |
| PASS | login page offers the cloud identity route | GitHub sign-in offered |
| PASS | no console errors during the run |  |
