# Catalog drift report

Generated at: 2026-08-24T15:17:38.188Z
Local Material root: /Users/vsh9p8q/AI/Agent-Learning-Hub/local-courses

## Summary

| Finding | Count |
| --- | ---: |
| Declared paths | 475 |
| Missing paths | 0 |
| — corroborated moves (`--apply` rewrites these) | 0 |
| — uncertain (decide by hand) | 0 |
| — gone (no file of that name on disk) | 0 |
| Uncatalogued repositories | 4 |
| Items without an upstream fallback | 479 |
| — grouped into repositories to confirm | 55 |

## Uncatalogued material

Git repositories in the library that no catalog entry points into.
Nothing is added automatically: track, stage, summary, attribution and the
chapter list are curation decisions that cannot be read off a disk.

| Repository | Markdown files | Branch | Remote |
| --- | ---: | --- | --- |
| `Agentic/Harness/deepseek/deepseek-harness` | 2499 | master | https://github.com/deepseek-ai/deepseek-harness.git |
| `Agentic/HelloAgents` | 17 | learn_version | git@github.com:jjyaoao/HelloAgents.git |
| `AICoding/opencode/code/openchamber` | 53 | main | git@github.com:openchamber/openchamber.git |
| `AICoding/opencode/plugins/opencode-goal-plugin` | 8 | main | git@github.com:prevalentWare/opencode-goal-plugin.git |

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
    "sourceUrl": "https://github.com/deepseek-ai/deepseek-harness",
    "localPath": "Agentic/Harness/deepseek/deepseek-harness/README.md",
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
        "localPath": "Agentic/Harness/deepseek/deepseek-harness/README.md"
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
    "sourceUrl": "https://github.com/jjyaoao/HelloAgents",
    "localPath": "Agentic/HelloAgents/README.md",
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
        "localPath": "Agentic/HelloAgents/README.md"
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
    "sourceUrl": "https://github.com/openchamber/openchamber",
    "localPath": "AICoding/opencode/code/openchamber/README.md",
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
        "localPath": "AICoding/opencode/code/openchamber/README.md"
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
    "sourceUrl": "https://github.com/prevalentWare/opencode-goal-plugin",
    "localPath": "AICoding/opencode/plugins/opencode-goal-plugin/README.md",
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
        "localPath": "AICoding/opencode/plugins/opencode-goal-plugin/README.md"
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
| `Agentic/crewAI` | 36 | main | https://github.com/crewAIInc/crewAI/blob/HEAD/README.md |
| `Learning/hello-agents` | 32 | main | https://github.com/datawhalechina/hello-agents/blob/HEAD/README.md |
| `Agentic/AutoGPT` | 28 | master | https://github.com/Significant-Gravitas/AutoGPT/blob/HEAD/README.md |
| `Agentic/Harness/harness-books` | 25 | main | https://github.com/wquguru/harness-books/blob/HEAD/book1-claude-code/index.md |
| `AICoding/claude/document/learn-claude-code` | 21 | main | https://github.com/shareAI-lab/learn-claude-code/blob/HEAD/README-zh.md |
| `Agentic/ai-agent-deep-dive` | 19 | main | https://github.com/tvytlx/ai-agent-deep-dive/blob/HEAD/README.md |
| `Application/cc-switch` | 19 | main | https://github.com/farion1231/cc-switch/blob/HEAD/README_ZH.md |
| `Learning/claw0` | 19 | main | https://github.com/shareAI-lab/claw0/blob/HEAD/README.md |
| `AICoding/openclaw/doc/openclaw_guide` | 18 | main | https://github.com/yeasy/openclaw_guide/blob/HEAD/README.md |
| `Agentic/Harness/learn-harness-engineering` | 16 | main | https://github.com/walkinglabs/learn-harness-engineering/blob/HEAD/docs/zh/index.md |
| `Agentic/Harness/PI/pi-mono` | 15 | main | https://github.com/earendil-works/pi/blob/HEAD/README.md |
| `AICoding/claude/code/claude-code-analysis` | 14 | main | https://github.com/liuup/claude-code-analysis/blob/HEAD/README.md |
| `AICoding/opencode/learn-opencode` | 11 | main | https://github.com/vbgate/learn-opencode/blob/HEAD/README.md |
| `Agentic/Harness/deepagents` | 10 | main | https://github.com/langchain-ai/deepagents/blob/HEAD/README.md |
| `Agentic/Harness/smolagents` | 10 | main | https://github.com/huggingface/smolagents/blob/HEAD/README.md |
| `Agentic/MetaGPT` | 9 | main | https://github.com/FoundationAgents/MetaGPT/blob/HEAD/README.md |
| `(no repository)` | 8 | — | — |
| `Agentic/multica` | 8 | main | https://github.com/multica-ai/multica/blob/HEAD/README.zh-CN.md |
| `Agentic/OpenHands` | 6 | main | https://github.com/OpenHands/OpenHands/blob/HEAD/README.md |
| `Application/CodexSwitch` | 6 | master | https://github.com/guhailin/CodexSwitch/blob/HEAD/README.md |
| `Application/solon-ai` | 5 | main | https://gitee.com/opensolon/solon-ai/blob/HEAD/README.md |
| `Agentic/Harness/openworker` | 4 | main | https://github.com/andrewyng/openworker/blob/HEAD/README.md |
| `AICoding/claude/plugins/claude-mem` | 4 | main | https://github.com/thedotmack/claude-mem/blob/HEAD/README.md |
| `AICoding/CyberClaw` | 4 | main | https://github.com/ttguy0707/CyberClaw/blob/HEAD/README.md |
| `AICoding/openclaw/openclaw-code` | 4 | main | https://github.com/openclaw/openclaw/blob/HEAD/VISION.md |
| `AICoding/opencode/code/opencode` | 3 | dev | https://github.com/anomalyco/opencode/blob/HEAD/README.md |
| `Agentic/Memory/mem0` | 2 | main | https://github.com/mem0ai/mem0/blob/HEAD/README.md |
| `AICoding/claude/code/awesome-claude-code` | 2 | main | https://github.com/hesreallyhim/awesome-claude-code/blob/HEAD/README.md |
| `AICoding/claude/code/claude-code-rev` | 2 | main | https://github.com/oboard/claude-code-rev/blob/HEAD/README.md |
| `AICoding/claude/code/claude-code-templates` | 2 | main | https://github.com/davila7/claude-code-templates/blob/HEAD/README.md |
| `AICoding/claude/code/collection-claude-code-source-code` | 2 | main | https://github.com/chauncygu/collection-claude-code-source-code/blob/HEAD/README-CN.md |
| `AICoding/claude/document/claude-code-guide` | 2 | main | https://github.com/zebbern/claude-code-guide/blob/HEAD/README.md |
| `AICoding/claude/plugins/claude-auto-mode-unlock` | 2 | main | https://github.com/zzturn/claude-auto-mode-unlock/blob/HEAD/README.md |
| `AICoding/MiMo-Code` | 2 | main | https://github.com/XiaomiMiMo/MiMo-Code/blob/HEAD/README.zh.md |
| `AICoding/opencode/code/opencode-supermemory` | 2 | main | https://github.com/supermemoryai/opencode-supermemory/blob/HEAD/README.md |
| `Application/workany` | 2 | dev | https://github.com/workany-ai/workany/blob/HEAD/README.md |
| `Agentic/open-agent-sdk-typescript` | 1 | main | https://github.com/codeany-ai/open-agent-sdk-typescript/blob/HEAD/README.md |
| `AICoding/claude/code/claude-code-haha` | 1 | main | https://github.com/NanmiCoder/claude-code-haha/blob/HEAD/README.md |
| `AICoding/claude/code/claude-code-lens` | 1 | main | https://github.com/ningzimu/claude-code-lens/blob/HEAD/README.zh-CN.md |
| `AICoding/claude/code/claude-code-source-code` | 1 | main | https://github.com/sanbuphy/claude-code-source-code/blob/HEAD/README_CN.md |
| `AICoding/claude/code/claude-init` | 1 | main | https://github.com/cfrs2005/claude-init/blob/HEAD/README.md |
| `AICoding/claude/document/ClaudeMD/andrej-karpathy-skills` | 1 | main | https://github.com/forrestchang/andrej-karpathy-skills/blob/HEAD/README.zh.md |
| `AICoding/claude/plugins/claude-mermaid` | 1 | main | https://github.com/veelenga/claude-mermaid/blob/HEAD/README.md |
| `AICoding/claude/plugins/claude-stt` | 1 | main | https://github.com/jarrodwatts/claude-stt/blob/HEAD/README.md |
| `AICoding/claude/plugins/claudian` | 1 | main | https://github.com/YishenTu/claudian/blob/HEAD/README.md |
| `AICoding/codex/codex-code` | 1 | main | https://github.com/openai/codex/blob/HEAD/README.md |
| `AICoding/hermes/hermes-agent` | 1 | main | https://github.com/NousResearch/hermes-agent/blob/HEAD/README.md |
| `AICoding/openclaw/channels/openclaw-lark` | 1 | main | https://github.com/larksuite/openclaw-lark/blob/HEAD/README.zh.md |
| `AICoding/opencode/awesome-opencode` | 1 | main | https://github.com/awesome-opencode/awesome-opencode/blob/HEAD/README.md |
| `AICoding/opencode/code/openwork` | 1 | dev | https://github.com/different-ai/openwork/blob/HEAD/README_ZH.md |
| `AICoding/opencode/plugins/opencode-wakatime` | 1 | master | https://github.com/angristan/opencode-wakatime/blob/HEAD/README.md |
| `Learning/easy-agent` | 1 | main | https://github.com/ConardLi/easy-agent/blob/HEAD/README.zh-CN.md |
| `Learning/easy-learn-ai` | 1 | main | https://github.com/ConardLi/easy-learn-ai/blob/HEAD/readme.md |

