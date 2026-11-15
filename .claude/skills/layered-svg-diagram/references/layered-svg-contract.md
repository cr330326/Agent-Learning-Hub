# Layered SVG Contract

## Contents

1. Context profile
2. Invariants and configurable values
3. Portable defaults
4. Layout recipes
5. Typography and localization
6. Connectors and boundaries
7. Accessible SVG structure
8. Renderer selection
9. Visual QA

## Context profile

Before choosing coordinates, record: diagram type and audience; source-of-truth files; create versus update; target path and embedding size; canvas/aspect ratio; reading direction; locale and font stack; established palette and tokens; layer, boundary and edge semantics; available SVG renderers; related documents.

Use this precedence: controlling instructions and repository rules; the target SVG and its sibling diagrams when editing; explicit user requirements; portable defaults. Surface unresolved conflicts instead of silently choosing a lower-priority value.

## Invariants and configurable values

| Invariant | Configurable counterpart |
|---|---|
| Standalone editable SVG is canonical | Canvas size and derivative PNG/PDF sizes |
| Stable semantic IDs and real text | Visible labels, language and font stack |
| Explicit layer/boundary membership | Layer vocabulary, order and direction |
| Documented arrow direction and line meanings | Edge categories, labels and routing |
| `<title>` and `<desc>` plus non-color semantics | Brand palette, light/dark theme and decoration |
| Structural validation plus rendered inspection | Available validator and renderer commands |

## Portable defaults

- Use a responsive `viewBox`; derive height from content.
- Use 3–5% outer margins, at least 16 units between cards and 20 units between bands.
- Start with 14-unit node titles and 12-unit supporting text at intended display size.
- Use flat surfaces, subtle band fills, strong text contrast, 8–12 unit corner radii and 1.5–2 unit strokes.
- Draw connectors before nodes so cards mask endpoints.
- Use a system font stack with CJK fallbacks; never depend on a remote font.
- Treat the starter palette as a fallback, not a brand mandate.

## Layout recipes

| Diagram | Preferred organization | Typical secondary area |
|---|---|---|
| System context | actors/channels around one system boundary | external systems and legend |
| Architecture | clients → edge → application → messaging/data | cross-cutting capabilities and providers |
| Deployment | traffic entry → regions/zones → workloads → stores | observability, failover and trust boundaries |
| Dependency | consumer-to-dependency layers or left-to-right packages | external libraries and forbidden edges |
| Topology | physical/network zones with directional paths | control plane, management and legend |
| Data flow | sources → transforms → persistence → consumers | error, retry and audit paths |

Fix node geometry before routing edges. Expand the canvas or split overview/detail diagrams before reducing text below the readable minimum.

## Typography and localization

- Keep visible strings in real `<text>` elements and allow at least 30% growth across locales.
- Expand card height or wrap into explicit `<tspan>` lines before reducing font size.
- Choose locale-appropriate fallbacks and test representative CJK/Latin glyphs.
- For RTL diagrams, mirror reading direction, alignment, arrow flow and legend placement when semantics require it.
- Explain unavoidable acronyms in a legend or note.

## Connectors and boundaries

- State the arrow-direction rule in the legend.
- Use solid, dashed and dotted lines only after assigning each a named meaning.
- Reinforce color with line style, marker shape or labels.
- Terminate paths at card borders; avoid running lines through labels or unrelated nodes.
- Label trust, region, ownership and external-system boundaries explicitly.
- Render optional/future nodes with a named dashed treatment that cannot be mistaken for deployed state.

## Accessible SVG structure

Use this group order: metadata; background; header; layer bands/boundaries; connectors; nodes; labels/annotations; legend. Add `role="img"` and `aria-labelledby` on the root when the embedding environment preserves them. Keep DOM reading order aligned with the visual reading order. Do not encode essential meaning only through color, hover or animation.

## Renderer selection

Prefer the repository's normal documentation renderer. Otherwise select an installed capability: browser screenshot, Inkscape, `rsvg-convert`, ImageMagick, or macOS `qlmanage`. Render at the full viewBox and the intended embedded width. If no renderer is available, report that visual verification is blocked.

Example commands:

```bash
python3 scripts/validate_svg.py diagram.svg
rsvg-convert -o /tmp/diagram.png diagram.svg
inkscape diagram.svg --export-filename=/tmp/diagram.png
qlmanage -t -s 1600 -o /tmp diagram.svg
```

## Visual QA

Check: content matches its source facts; no clipping or overlap; labels remain readable at embedding size; arrowheads attach to the intended borders; crossings are minimized and unambiguous; boundaries and future states are clear; contrast survives grayscale; font fallbacks render; title/description match the visible content; the derivative preview matches the SVG source.
