---
name: layered-svg-diagram
description: Use when creating or revising standalone layered SVG technical diagrams—architecture, deployment, dependency, topology, system-context, or data-flow—and the result must remain editable, repository-aware, and visually consistent; do not use for general illustration or raster image generation.
---

# Layered SVG Diagram

## Overview

Create hand-authored, editable SVG diagrams whose visual structure follows verified architecture facts and the target repository's conventions. Treat the bundled visual system as a portable fallback, never as a replacement for repository-owned rules.

## Quick Routing

| Situation | Next action |
|---|---|
| Revise an existing SVG | Read the target SVG and repository instructions; preserve its tokens, stable IDs and edge semantics |
| Create a diagram with repository exemplars | Read the closest canonical diagram and derive a local profile before drawing |
| Create a diagram without an exemplar | Load `references/layered-svg-contract.md`; copy `assets/layered-svg-starter.svg` only if it saves work |
| Diagram is dense or has crossing flows | Model layers/nodes/edges first; split overview and detail diagrams when expansion is insufficient |
| Prepare final delivery | Run `scripts/validate_svg.py`, render the SVG, inspect it visually and update actual references |

## Instruction Precedence

Apply controlling instructions and repository rules first. When editing, preserve the target artifact's established visual grammar next. Then apply explicit user requirements. Use bundled defaults only for values that remain unspecified. Surface irreconcilable conflicts instead of silently choosing a lower-priority rule.

## Default Workflow

1. Identify the diagram type, audience, scope, source facts, target path and intended display size.
2. Inspect repository instructions and relevant canonical diagrams. Do not invent components or relationships to improve composition.
3. Write a content model: layers, nodes, boundaries, edges, direction rule, legend and primary reading path.
4. Resolve configurable tokens: canvas, layout direction, locale, typography, palette, spacing, cards, edges and future-state treatment.
5. Fix node geometry before routing edges. Keep lines off text and attach endpoints to node borders.
6. Author semantic SVG with real text and stable IDs. Mermaid or Graphviz may inform a disposable layout sketch, but generated markup is not the final source.
7. Run structural validation, render at full and embedded sizes, inspect the image and iterate until visual checks pass.
8. Update only documents that actually reference the diagram and report the source artifact plus validation evidence.

## Contract References

When no repository visual profile exists, when selecting a layout recipe, or when resolving localization, accessibility, connector or renderer questions:
-> Load `references/layered-svg-contract.md` for portable defaults, configurable tokens, diagram-specific layouts and the visual QA checklist.

When creating a new diagram and no canonical SVG is available:
-> Use `assets/layered-svg-starter.svg` as an optional editable scaffold; replace all labels and adapt every token to verified context.

Before delivering any created or modified SVG:
-> Run `python3 scripts/validate_svg.py <diagram.svg>` for XML, viewBox, accessible metadata, ID/reference, remote-resource and generated-markup checks. Then render and visually inspect it; structural validation cannot detect clipping or semantic errors.

## Output Contract

- Deliver one canonical standalone SVG with a valid `viewBox`, root `<title>` and `<desc>`, real text and semantic groups.
- State layer membership, edge direction and non-obvious line meanings through labels or a legend.
- Encode status and relationship types with labels, line styles, markers or boundaries in addition to color.
- Keep secrets, personal data, scripts, remote fonts and unauthorized external resources out of the artifact.
- Provide derivative PNG/PDF files only when requested or needed for review; they never replace the SVG source.
- Report the files changed, repository conventions followed, validator result, renderer used and visual checks performed.

## Common Mistakes

| Mistake | Correction |
|---|---|
| Copying the starter's canvas or palette into every repository | Treat them as defaults and derive a local profile first |
| Replacing a maintained SVG with Mermaid output | Re-author clean semantic SVG and retain only the layout insight |
| Shrinking text until a dense graph fits | Expand the canvas or split overview/detail diagrams |
| Drawing edges before node positions stabilize | Freeze geometry, draw connectors behind nodes, then add labels |
| Relying on color alone | Add line style, marker, boundary or text semantics |
| Claiming completion after XML validation | Render and inspect at the actual embedding size |

## Important Rules

- Preserve architecture truth over visual symmetry.
- Preserve an existing diagram's visual language unless redesign is explicit.
- Do not claim visual verification when no SVG renderer was available.
- Do not create a second architecture source of truth when the repository designates canonical diagram files.
