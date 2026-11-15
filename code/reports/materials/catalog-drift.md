# Catalog drift report

Generated at: 2026-11-14T09:23:33.237Z
Local Material root: /Users/vsh9p8q/AI/Agent-Learning-Hub/local-courses

## Summary

| Finding | Count |
| --- | ---: |
| Declared paths | 434 |
| Missing paths | 36 |
| — corroborated moves (`--apply` rewrites these) | 18 |
| — uncertain (decide by hand) | 12 |
| — gone (no file of that name on disk) | 6 |
| Uncatalogued repositories | 10 |
| Items without an upstream fallback | 432 |
| — grouped into repositories to confirm | 47 |

## Corroborated moves

Each target is backed by a directory rewrite that several paths agree on.

| Declared path | Proposed path | Items |
| --- | --- | ---: |
| `AICoding/openclaw/openclaw_guide/01_overview/README.md` | `AICoding/openclaw_guide/01_overview/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/02_setup/README.md` | `AICoding/openclaw_guide/02_setup/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/03_minimal_loop/README.md` | `AICoding/openclaw_guide/03_minimal_loop/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/04_config_models/README.md` | `AICoding/openclaw_guide/04_config_models/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/05_tools_skills/README.md` | `AICoding/openclaw_guide/05_tools_skills/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/06_context_memory/README.md` | `AICoding/openclaw_guide/06_context_memory/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/07_multi_agent/README.md` | `AICoding/openclaw_guide/07_multi_agent/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/08_automation_ops/README.md` | `AICoding/openclaw_guide/08_automation_ops/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/09_gateway_protocol/README.md` | `AICoding/openclaw_guide/09_gateway_protocol/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/10_agent_loop/README.md` | `AICoding/openclaw_guide/10_agent_loop/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/11_reliability_security/README.md` | `AICoding/openclaw_guide/11_reliability_security/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/12_extension_engineering/README.md` | `AICoding/openclaw_guide/12_extension_engineering/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/13_practical_cases/README.md` | `AICoding/openclaw_guide/13_practical_cases/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/14_performance_cost/README.md` | `AICoding/openclaw_guide/14_performance_cost/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/15_troubleshooting_trees/README.md` | `AICoding/openclaw_guide/15_troubleshooting_trees/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/16_claude_ecosystem/README.md` | `AICoding/openclaw_guide/16_claude_ecosystem/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/appendix/README.md` | `AICoding/openclaw_guide/appendix/README.md` | 1 |
| `AICoding/openclaw/openclaw_guide/README.md` | `AICoding/openclaw_guide/README.md` | 2 |

## Needs a decision

`--apply` never touches these. A deleted file usually still has a
same-named twin somewhere in the library, so a candidate here is not
evidence the material moved.

| Declared path | Kind | Candidates | Items |
| --- | --- | ---: | ---: |
| `Agentic/Harness/deepagents/openwiki/engineering/operations-and-testing.md` | gone | 0 | legacy-reading-31-014 |
| `Agentic/Harness/deepagents/openwiki/workflows/deep-agents-code.md` | gone | 0 | legacy-reading-31-012 |
| `Agentic/Harness/deepagents/openwiki/workflows/evaluation-and-release.md` | gone | 0 | legacy-reading-31-013 |
| `Agentic/Harness/openhanako/README.md` | uncertain | 2 | openhanako |
| `Agentic/Harness/openworker/README.md` | uncertain | 1766 | legacy-course-032, legacy-reading-22-013, legacy-reading-32-014 |
| `Agentic/Harness/openworker/surfaces/gui/README.md` | uncertain | 1766 | legacy-reading-32-015 |
| `Agentic/Harness/PI/pi-mono/packages/client/README.md` | uncertain | 2 | legacy-reading-33-009 |
| `Agentic/Harness/PI/pi-mono/packages/protocol/README.md` | uncertain | 3 | legacy-reading-33-007 |
| `Agentic/Harness/PI/pi-mono/packages/server/README.md` | uncertain | 1 | legacy-reading-33-008 |
| `Agentic/openchamber/packages/docs/content/docs/zh-cn/commands-snippets.mdx` | gone | 0 | legacy-reading-35-005 |
| `AICoding/claude/plugins/claude-mem/cursor-hooks/CONTEXT-INJECTION.md` | gone | 0 | legacy-reading-12-007 |
| `AICoding/claude/plugins/claude-mem/cursor-hooks/README.md` | uncertain | 1766 | legacy-reading-12-006 |
| `AICoding/claude/plugins/claude-mem/README.md` | uncertain | 1766 | legacy-course-013, legacy-reading-12-005 |
| `AICoding/openclaw/openclaw-code/AGENTS.md` | uncertain | 216 | legacy-reading-13-021 |
| `AICoding/openclaw/openclaw-code/docs.acp.md` | gone | 0 | legacy-reading-13-022 |
| `AICoding/openclaw/openclaw-code/SECURITY.md` | uncertain | 40 | legacy-reading-13-023 |
| `AICoding/openclaw/openclaw-code/VISION.md` | uncertain | 2 | legacy-course-016, legacy-reading-13-020 |
| `AICoding/openclaw/openclaw-lark/README.zh.md` | uncertain | 507 | legacy-course-016, legacy-reading-13-019 |

## Uncatalogued material

Git repositories in the library that no catalog entry points into.
Nothing is added automatically: track, stage, summary, attribution and the
chapter list are curation decisions that cannot be read off a disk.

| Repository | Markdown files | Branch | Remote |
| --- | ---: | --- | --- |
| `Agentic/Harness/deepseek/dsh-superagent-prototype` | 28 | main | git@github.com:deepseek-ai/dsh-superagent-prototype.git |
| `Agentic/Harness/PI/HanakoPro` | 59 | main | git@github.com:ZS520L/HanakoPro.git |
| `Agentic/Harness/PI/openhanako` | 58 | main | https://github.com/liliMozi/openhanako.git |
| `Agentic/Harness/PI/pi-web` | 39 | main | git@github.com:agegr/pi-web.git |
| `Agentic/Harness/PI/PiDeck` | 224 | main | git@github.com:ayuayue/PiDeck.git |
| `AICoding/magpie` | 49 | main | git@github.com:yetone/magpie.git |
| `AICoding/openclaw_guide` | 112 | main | git@github.com:yeasy/openclaw_guide.git |
| `Application/Buildr` | 5704 | main | git@github.com:BuildrAI/Buildr.git |
| `Application/OpenMausBot` | 358 | main | git@github.com:milind-soni/OpenMausBot.git |
| `Application/rea` | 524 | main | git@github.com:morluto/rea.git |

### Paste-ready skeleton

```json
[
  {
    "id": "TODO-stable-kebab-case-id",
    "title": "TODO",
    "track": "TODO: learning | aicoding | agentic | application",
    "stageIds": [],
    "summary": "TODO",
    "learningGoals": [
      "TODO"
    ],
    "sourceUrl": "https://github.com/deepseek-ai/dsh-superagent-prototype",
    "localPath": "Agentic/Harness/deepseek/dsh-superagent-prototype/README.md",
    "accessPolicy": "local-preferred",
    "publicationRights": "third-party",
    "author": "TODO",
    "license": "TODO",
    "licenseStatus": "unknown",
    "tags": [],
    "lastReviewedAt": null,
    "references": [
      {
        "label": "本地 README",
        "sourceUrl": null,
        "localPath": "Agentic/Harness/deepseek/dsh-superagent-prototype/README.md"
      }
    ],
    "unavailableReason": null
  },
  {
    "id": "TODO-stable-kebab-case-id",
    "title": "TODO",
    "track": "TODO: learning | aicoding | agentic | application",
    "stageIds": [],
    "summary": "TODO",
    "learningGoals": [
      "TODO"
    ],
    "sourceUrl": "https://github.com/ZS520L/HanakoPro",
    "localPath": "Agentic/Harness/PI/HanakoPro/README.md",
    "accessPolicy": "local-preferred",
    "publicationRights": "third-party",
    "author": "TODO",
    "license": "TODO",
    "licenseStatus": "unknown",
    "tags": [],
    "lastReviewedAt": null,
    "references": [
      {
        "label": "本地 README",
        "sourceUrl": null,
        "localPath": "Agentic/Harness/PI/HanakoPro/README.md"
      }
    ],
    "unavailableReason": null
  },
  {
    "id": "TODO-stable-kebab-case-id",
    "title": "TODO",
    "track": "TODO: learning | aicoding | agentic | application",
    "stageIds": [],
    "summary": "TODO",
    "learningGoals": [
      "TODO"
    ],
    "sourceUrl": "https://github.com/liliMozi/openhanako",
    "localPath": "Agentic/Harness/PI/openhanako/README.md",
    "accessPolicy": "local-preferred",
    "publicationRights": "third-party",
    "author": "TODO",
    "license": "TODO",
    "licenseStatus": "unknown",
    "tags": [],
    "lastReviewedAt": null,
    "references": [
      {
        "label": "本地 README",
        "sourceUrl": null,
        "localPath": "Agentic/Harness/PI/openhanako/README.md"
      }
    ],
    "unavailableReason": null
  },
  {
    "id": "TODO-stable-kebab-case-id",
    "title": "TODO",
    "track": "TODO: learning | aicoding | agentic | application",
    "stageIds": [],
    "summary": "TODO",
    "learningGoals": [
      "TODO"
    ],
    "sourceUrl": "https://github.com/agegr/pi-web",
    "localPath": "Agentic/Harness/PI/pi-web/README.md",
    "accessPolicy": "local-preferred",
    "publicationRights": "third-party",
    "author": "TODO",
    "license": "TODO",
    "licenseStatus": "unknown",
    "tags": [],
    "lastReviewedAt": null,
    "references": [
      {
        "label": "本地 README",
        "sourceUrl": null,
        "localPath": "Agentic/Harness/PI/pi-web/README.md"
      }
    ],
    "unavailableReason": null
  },
  {
    "id": "TODO-stable-kebab-case-id",
    "title": "TODO",
    "track": "TODO: learning | aicoding | agentic | application",
    "stageIds": [],
    "summary": "TODO",
    "learningGoals": [
      "TODO"
    ],
    "sourceUrl": "https://github.com/ayuayue/PiDeck",
    "localPath": "Agentic/Harness/PI/PiDeck/README.md",
    "accessPolicy": "local-preferred",
    "publicationRights": "third-party",
    "author": "TODO",
    "license": "TODO",
    "licenseStatus": "unknown",
    "tags": [],
    "lastReviewedAt": null,
    "references": [
      {
        "label": "本地 README",
        "sourceUrl": null,
        "localPath": "Agentic/Harness/PI/PiDeck/README.md"
      }
    ],
    "unavailableReason": null
  },
  {
    "id": "TODO-stable-kebab-case-id",
    "title": "TODO",
    "track": "TODO: learning | aicoding | agentic | application",
    "stageIds": [],
    "summary": "TODO",
    "learningGoals": [
      "TODO"
    ],
    "sourceUrl": "https://github.com/yetone/magpie",
    "localPath": "AICoding/magpie/README.md",
    "accessPolicy": "local-preferred",
    "publicationRights": "third-party",
    "author": "TODO",
    "license": "TODO",
    "licenseStatus": "unknown",
    "tags": [],
    "lastReviewedAt": null,
    "references": [
      {
        "label": "本地 README",
        "sourceUrl": null,
        "localPath": "AICoding/magpie/README.md"
      }
    ],
    "unavailableReason": null
  },
  {
    "id": "TODO-stable-kebab-case-id",
    "title": "TODO",
    "track": "TODO: learning | aicoding | agentic | application",
    "stageIds": [],
    "summary": "TODO",
    "learningGoals": [
      "TODO"
    ],
    "sourceUrl": "https://github.com/yeasy/openclaw_guide",
    "localPath": "AICoding/openclaw_guide/README.md",
    "accessPolicy": "local-preferred",
    "publicationRights": "third-party",
    "author": "TODO",
    "license": "TODO",
    "licenseStatus": "unknown",
    "tags": [],
    "lastReviewedAt": null,
    "references": [
      {
        "label": "本地 README",
        "sourceUrl": null,
        "localPath": "AICoding/openclaw_guide/README.md"
      }
    ],
    "unavailableReason": null
  },
  {
    "id": "TODO-stable-kebab-case-id",
    "title": "TODO",
    "track": "TODO: learning | aicoding | agentic | application",
    "stageIds": [],
    "summary": "TODO",
    "learningGoals": [
      "TODO"
    ],
    "sourceUrl": "https://github.com/BuildrAI/Buildr",
    "localPath": "Application/Buildr/README.md",
    "accessPolicy": "local-preferred",
    "publicationRights": "third-party",
    "author": "TODO",
    "license": "TODO",
    "licenseStatus": "unknown",
    "tags": [],
    "lastReviewedAt": null,
    "references": [
      {
        "label": "本地 README",
        "sourceUrl": null,
        "localPath": "Application/Buildr/README.md"
      }
    ],
    "unavailableReason": null
  },
  {
    "id": "TODO-stable-kebab-case-id",
    "title": "TODO",
    "track": "TODO: learning | aicoding | agentic | application",
    "stageIds": [],
    "summary": "TODO",
    "learningGoals": [
      "TODO"
    ],
    "sourceUrl": "https://github.com/milind-soni/OpenMausBot",
    "localPath": "Application/OpenMausBot/README.md",
    "accessPolicy": "local-preferred",
    "publicationRights": "third-party",
    "author": "TODO",
    "license": "TODO",
    "licenseStatus": "unknown",
    "tags": [],
    "lastReviewedAt": null,
    "references": [
      {
        "label": "本地 README",
        "sourceUrl": null,
        "localPath": "Application/OpenMausBot/README.md"
      }
    ],
    "unavailableReason": null
  },
  {
    "id": "TODO-stable-kebab-case-id",
    "title": "TODO",
    "track": "TODO: learning | aicoding | agentic | application",
    "stageIds": [],
    "summary": "TODO",
    "learningGoals": [
      "TODO"
    ],
    "sourceUrl": "https://github.com/morluto/rea",
    "localPath": "Application/rea/README.md",
    "accessPolicy": "local-preferred",
    "publicationRights": "third-party",
    "author": "TODO",
    "license": "TODO",
    "licenseStatus": "unknown",
    "tags": [],
    "lastReviewedAt": null,
    "references": [
      {
        "label": "本地 README",
        "sourceUrl": null,
        "localPath": "Application/rea/README.md"
      }
    ],
    "unavailableReason": null
  }
]
```

## Upstream fallback gaps

Items with no `sourceUrl`, grouped by the repository their material lives
in. Confirm once per repository rather than reading every derived link:
the sample is built exactly like the rest of its group, so opening it
settles the whole group.

The sample URL is **derived, not verified** — this report stays offline by
design. Deriving is not enough on its own: a repository can be private,
renamed or deleted upstream, and a local copy that has drifted from
upstream can name a file that upstream no longer has. Open the sample
before accepting a group.

| Repository | Items | Branch | Sample upstream URL |
| --- | ---: | --- | --- |
| `Agentic/openchamber` | 46 | main | https://github.com/openchamber/openchamber/blob/HEAD/README.md |
| `Agentic/Harness/harness-engineering-from-cc-to-ai-coding` | 41 | main | https://github.com/ZhangHanDong/harness-engineering-from-cc-to-ai-coding/blob/HEAD/book/src/preface.md |
| `(no repository)` | 38 | — | — |
| `Agentic/crewAI` | 36 | main | https://github.com/crewAIInc/crewAI/blob/HEAD/README.md |
| `Learning/hello-agents` | 32 | main | https://github.com/datawhalechina/hello-agents/blob/HEAD/README.md |
| `Agentic/AutoGPT` | 28 | master | https://github.com/Significant-Gravitas/AutoGPT/blob/HEAD/README.md |
| `Learning/ai-agent-deep-dive` | 19 | main | https://github.com/tvytlx/ai-agent-deep-dive/blob/HEAD/README.md |
| `Learning/claw0` | 19 | main | https://github.com/shareAI-lab/claw0/blob/HEAD/README.md |
| `Application/cc-switch` | 18 | main | https://github.com/farion1231/cc-switch/blob/HEAD/README_ZH.md |
| `Agentic/Harness/learn-harness-engineering` | 16 | main | https://github.com/walkinglabs/learn-harness-engineering/blob/HEAD/docs/zh/index.md |
| `Agentic/Harness/PI/pi-mono` | 14 | main | https://github.com/earendil-works/pi/blob/HEAD/README.md |
| `AICoding/claude/code/claude-code-analysis` | 14 | main | https://github.com/liuup/claude-code-analysis/blob/HEAD/README.md |
| `Learning/learn-opencode` | 11 | main | https://github.com/vbgate/learn-opencode/blob/HEAD/README.md |
| `Agentic/Harness/deepagents` | 10 | main | https://github.com/langchain-ai/deepagents/blob/HEAD/README.md |
| `Agentic/Harness/smolagents` | 10 | main | https://github.com/huggingface/smolagents/blob/HEAD/README.md |
| `Learning/learn-claude-code` | 10 | main | https://github.com/shareAI-lab/learn-claude-code/blob/HEAD/README-zh.md |
| `Agentic/MetaGPT` | 9 | main | https://github.com/FoundationAgents/MetaGPT/blob/HEAD/README.md |
| `Application/CodexSwitch` | 6 | master | https://github.com/guhailin/CodexSwitch/blob/HEAD/README.md |
| `Application/multica` | 5 | main | https://github.com/multica-ai/multica/blob/HEAD/README.zh.md |
| `Application/solon-ai` | 5 | main | https://gitee.com/opensolon/solon-ai/blob/HEAD/README.md |
| `Agentic/Harness/CyberClaw` | 4 | main | https://github.com/ttguy0707/CyberClaw/blob/HEAD/README.md |
| `AICoding/opencode/code/opencode` | 3 | dev | https://github.com/anomalyco/opencode/blob/HEAD/README.md |
| `Agentic/Memory/mem0` | 2 | main | https://github.com/mem0ai/mem0/blob/HEAD/README.md |
| `AICoding/claude/code/awesome-claude-code` | 2 | main | https://github.com/hesreallyhim/awesome-claude-code/blob/HEAD/README.md |
| `AICoding/claude/code/claude-code-rev` | 2 | main | https://github.com/oboard/claude-code-rev/blob/HEAD/README.md |
| `AICoding/claude/code/claude-code-templates` | 2 | main | https://github.com/davila7/claude-code-templates/blob/HEAD/README.md |
| `AICoding/claude/code/collection-claude-code-source-code` | 2 | main | https://github.com/chauncygu/collection-claude-code-source-code/blob/HEAD/README-CN.md |
| `AICoding/claude/document/claude-code-guide` | 2 | main | https://github.com/zebbern/claude-code-guide/blob/HEAD/README.md |
| `AICoding/minimax-code` | 2 | main | https://github.com/MiniMax-AI/minimax-code/blob/HEAD/README_ZH.md |
| `AICoding/opencode/code/opencode-supermemory` | 2 | main | https://github.com/supermemoryai/opencode-supermemory/blob/HEAD/README.md |
| `Application/workany` | 2 | dev | https://github.com/workany-ai/workany/blob/HEAD/README.md |
| `Agentic/sdk/open-agent-sdk-typescript` | 1 | main | https://github.com/codeany-ai/open-agent-sdk-typescript/blob/HEAD/README.md |
| `AICoding/claude/code/claude-code-haha` | 1 | main | https://github.com/NanmiCoder/claude-code-haha/blob/HEAD/README.md |
| `AICoding/claude/code/claude-code-lens` | 1 | main | https://github.com/ningzimu/claude-code-lens/blob/HEAD/README.zh-CN.md |
| `AICoding/claude/code/claude-code-source-code` | 1 | main | https://github.com/sanbuphy/claude-code-source-code/blob/HEAD/README_CN.md |
| `AICoding/claude/code/claude-init` | 1 | main | https://github.com/cfrs2005/claude-init/blob/HEAD/README.md |
| `AICoding/claude/document/ClaudeMD/andrej-karpathy-skills` | 1 | main | https://github.com/forrestchang/andrej-karpathy-skills/blob/HEAD/README.zh.md |
| `AICoding/claude/plugins/claude-mermaid` | 1 | main | https://github.com/veelenga/claude-mermaid/blob/HEAD/README.md |
| `AICoding/claude/plugins/claude-stt` | 1 | main | https://github.com/jarrodwatts/claude-stt/blob/HEAD/README.md |
| `AICoding/claude/plugins/claudian` | 1 | main | https://github.com/YishenTu/claudian/blob/HEAD/README.md |
| `AICoding/codex/codex-code` | 1 | main | https://github.com/openai/codex/blob/HEAD/README.md |
| `AICoding/easy-agent` | 1 | main | https://github.com/ConardLi/easy-agent/blob/HEAD/README.zh-CN.md |
| `AICoding/hermes/hermes-agent` | 1 | main | https://github.com/NousResearch/hermes-agent/blob/HEAD/README.md |
| `AICoding/opencode/awesome-opencode` | 1 | main | https://github.com/awesome-opencode/awesome-opencode/blob/HEAD/README.md |
| `AICoding/opencode/plugins/opencode-wakatime` | 1 | master | https://github.com/angristan/opencode-wakatime/blob/HEAD/README.md |
| `Application/openwork` | 1 | dev | https://github.com/different-ai/openwork/blob/HEAD/README_ZH.md |
| `Learning/easy-learn-ai` | 1 | main | https://github.com/ConardLi/easy-learn-ai/blob/HEAD/readme.md |

