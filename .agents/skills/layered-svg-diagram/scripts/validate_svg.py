#!/usr/bin/env python3
from __future__ import annotations

import argparse
import math
import re
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from typing import Sequence


LOCAL_URL_REFERENCE = re.compile(r"url\(\s*['\"]?#([^'\")\s]+)['\"]?\s*\)")
REMOTE_URL = re.compile(
    r"(?i)https?://[^'\"\s)]+|(?<![A-Za-z0-9+./:=])//[^'\"\s)]+"
)
MERMAID_MARKUP = (
    re.compile(r"class\s*=\s*['\"][^'\"]*\bflowchart\b", re.IGNORECASE),
    re.compile(r"(?:id|class)\s*=\s*['\"][^'\"]*\bmermaid[-_ ]", re.IGNORECASE),
    re.compile(r"aria-roledescription\s*=\s*['\"]flowchart-v\d+['\"]", re.IGNORECASE),
)


def local_name(name: str) -> str:
    return name.rsplit("}", 1)[-1]


def direct_text(root: ET.Element, tag_name: str) -> str:
    for child in root:
        if local_name(child.tag) == tag_name:
            return "".join(child.itertext()).strip()
    return ""


def validate_svg(path: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    try:
        raw = path.read_text(encoding="utf-8")
        root = ET.fromstring(raw)
    except (OSError, UnicodeError, ET.ParseError) as exc:
        return [f"cannot parse SVG: {exc}"], warnings

    if local_name(root.tag) != "svg":
        return ["root element must be <svg>"], warnings

    view_box = root.attrib.get("viewBox", "")
    try:
        values = [float(value) for value in re.split(r"[\s,]+", view_box.strip())]
        if (
            len(values) != 4
            or not all(math.isfinite(value) for value in values)
            or values[2] <= 0
            or values[3] <= 0
        ):
            raise ValueError
    except ValueError:
        errors.append("viewBox must contain four numbers with positive width and height")

    if not direct_text(root, "title"):
        errors.append("root <title> must contain text")
    if not direct_text(root, "desc"):
        errors.append("root <desc> must contain text")

    ids = [element.attrib["id"] for element in root.iter() if element.attrib.get("id")]
    for identifier, count in sorted(Counter(ids).items()):
        if count > 1:
            errors.append(f"duplicate id: {identifier}")

    known_ids = set(ids)
    local_references: set[str] = set()
    has_script = False

    for element in root.iter():
        tag = local_name(element.tag)
        if tag == "script":
            has_script = True
        elif tag == "foreignObject":
            warnings.append("foreignObject may not render consistently")
        elif tag == "image":
            warnings.append("embedded raster image reduces editability")

        for attribute_name, value in element.attrib.items():
            local_references.update(LOCAL_URL_REFERENCE.findall(value))
            remote_references = REMOTE_URL.findall(value)
            for reference in remote_references:
                errors.append(f"remote resource reference: {reference}")
            if local_name(attribute_name) in {"href", "src"}:
                if value.startswith("#"):
                    local_references.add(value[1:])
                elif value.startswith("data:"):
                    continue
                elif value and not remote_references:
                    errors.append(f"remote resource reference: {value}")

        if tag == "style" and element.text and re.search(r"(?i)url\(\s*['\"]?(?:https?:)?//", element.text):
            errors.append("remote resource reference in <style>")

    if has_script:
        errors.append("script elements are not allowed")

    for reference in sorted(local_references - known_ids):
        errors.append(f"broken local reference: {reference}")

    if any(pattern.search(raw) for pattern in MERMAID_MARKUP):
        errors.append("Mermaid-generated markup is not an editable source artifact")

    return errors, list(dict.fromkeys(warnings))


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate an editable standalone SVG diagram")
    parser.add_argument("svg", type=Path)
    args = parser.parse_args(argv)
    errors, warnings = validate_svg(args.svg)

    for warning in warnings:
        print(f"WARNING: {warning}")
    for error in errors:
        print(f"ERROR: {error}")
    if errors:
        return 1
    print(f"OK: {args.svg}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
