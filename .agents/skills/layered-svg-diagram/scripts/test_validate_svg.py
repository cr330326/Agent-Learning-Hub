from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from validate_svg import validate_svg


VALID_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 760">
  <title>Layered system diagram</title>
  <desc>Three layers connected by a documented request flow.</desc>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5">
      <path d="M0,0 L10,5 L0,10 z"/>
    </marker>
  </defs>
  <path id="request-flow" d="M100 100 L100 200" marker-end="url(#arrow)"/>
</svg>
"""


class ValidateSvgTests(unittest.TestCase):
    def validate(self, svg: str) -> tuple[list[str], list[str]]:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "diagram.svg"
            path.write_text(svg, encoding="utf-8")
            return validate_svg(path)

    def test_accepts_accessible_standalone_svg(self) -> None:
        errors, warnings = self.validate(VALID_SVG)
        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])

    def test_rejects_missing_title_and_description(self) -> None:
        errors, _ = self.validate(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"/>'
        )
        self.assertIn("root <title> must contain text", errors)
        self.assertIn("root <desc> must contain text", errors)

    def test_rejects_duplicate_ids(self) -> None:
        errors, _ = self.validate(
            VALID_SVG.replace(
                "</svg>", '<g id="request-flow"/></svg>'
            )
        )
        self.assertIn("duplicate id: request-flow", errors)

    def test_rejects_broken_local_references(self) -> None:
        errors, _ = self.validate(
            VALID_SVG.replace("url(#arrow)", "url(#missing-arrow)")
        )
        self.assertIn("broken local reference: missing-arrow", errors)

    def test_rejects_remote_resources(self) -> None:
        errors, _ = self.validate(
            VALID_SVG.replace(
                "</svg>", '<image href="https://example.com/node.png"/></svg>'
            )
        )
        self.assertIn("remote resource reference: https://example.com/node.png", errors)

    def test_rejects_remote_urls_inside_attribute_values(self) -> None:
        errors, _ = self.validate(
            VALID_SVG.replace(
                'marker-end="url(#arrow)"',
                'fill="url(https://example.com/pattern.svg)"',
            )
        )
        self.assertIn(
            "remote resource reference: https://example.com/pattern.svg", errors
        )

    def test_rejects_non_finite_view_box_values(self) -> None:
        errors, _ = self.validate(
            VALID_SVG.replace('viewBox="0 0 1200 760"', 'viewBox="0 0 nan inf"')
        )
        self.assertIn(
            "viewBox must contain four numbers with positive width and height", errors
        )

    def test_rejects_scripts_and_mermaid_markup(self) -> None:
        errors, _ = self.validate(
            VALID_SVG.replace(
                "</svg>", '<script>run()</script><g class="flowchart mermaid"/></svg>'
            )
        )
        self.assertIn("script elements are not allowed", errors)
        self.assertIn("Mermaid-generated markup is not an editable source artifact", errors)

    def test_warns_about_portability_risks(self) -> None:
        errors, warnings = self.validate(
            VALID_SVG.replace(
                "</svg>",
                '<foreignObject/><image href="data:image/png;base64,AA=="/></svg>',
            )
        )
        self.assertEqual(errors, [])
        self.assertIn("foreignObject may not render consistently", warnings)
        self.assertIn("embedded raster image reduces editability", warnings)


if __name__ == "__main__":
    unittest.main()
