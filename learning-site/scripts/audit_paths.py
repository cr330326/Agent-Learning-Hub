#!/usr/bin/env python3
"""
校验 learning-site/data.js 与 local-courses/ 是否还对得上。

两类漂移，方向相反，都不会报错：

1. **路径失效** —— 目录改名或移动后，data.js 里的引用指向不存在的文件。
   页面照常渲染，只有点开某一章才 404。（`AI-Coding/` 改名成 `AICoding/`
   那次，一口气废掉 119 条引用。）

2. **内容遗漏** —— 新下载的课程目录躺在磁盘上，但 data.js 里没人提，
   站点上完全看不见。这一类连 404 都不会有，只会「一直没发现」。

用法（在 learning-site/ 下）：
    python3 scripts/audit_paths.py            # 两类都查
    python3 scripts/audit_paths.py --no-cover # 只查路径失效

退出码 0 = 路径全部命中；1 = 有失效路径。未收录的目录只提示，不算失败——
是否收录是编辑判断，不是错误。
"""

import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
REPO = os.path.dirname(SITE)
COURSE_ROOT = os.path.join(REPO, "local-courses")

DOC_RE = re.compile(r'doc:\s*"([^"]+)"')
# links: [["标签", "路径"], ...] —— 只取第二个元素
LINK_RE = re.compile(r'\[\s*"[^"]*"\s*,\s*"([^"]+)"\s*\]')
IMG_RE = re.compile(r'\],\s*"((?:Learning|Agentic|AICoding|Application)/[^"]+)"')
# mark: "claude" → assets/marks/claude.svg，缺文件会 mask 成空白方框，肉眼很难发现
MARK_RE = re.compile(r'mark:\s*"([^"]+)"')
# tracks[].dir —— 轨道目录本身也可能被改名
TRACK_DIR_RE = re.compile(r'dir:\s*"([^"]+)"')

# 覆盖率检查最多下探几层。轨道(1)/分组(2)/项目(3)，个别项目挂在分组的分组下(4)。
COVER_DEPTH = 4
# 一个目录算「一个项目」的标志：有 README，或有仓库/包的根文件。
# 按标志识别而不是按目录名白名单——名字会变，这些标志不会。
PROJECT_MARKERS = (".git", "package.json", "pyproject.toml", "pom.xml", "Cargo.toml")


def resolve(path: str) -> str:
    """把 data.js 里的路径写法映射成磁盘上的绝对路径。"""
    if path.startswith("@root/"):
        return os.path.join(REPO, path[len("@root/"):])
    if path.startswith("@mark/"):
        return os.path.join(SITE, "assets", "marks", path[len("@mark/"):] + ".svg")
    return os.path.join(COURSE_ROOT, path)


def is_project(path: str, entries: list) -> bool:
    names = set(entries)
    if any(m in names for m in PROJECT_MARKERS):
        return True
    return any(n.lower().startswith("readme") and n.lower().endswith(".md") for n in names)


def project_dirs() -> list:
    """列出 local-courses/ 下的项目目录（相对课程根）。

    识别到一个项目就不再往里走——项目内部的 src/、docs/ 不是「另一门课」。
    """
    found = []
    for root, dirs, files in os.walk(COURSE_ROOT):
        rel = os.path.relpath(root, COURSE_ROOT)
        depth = 0 if rel == "." else rel.count(os.sep) + 1
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        if depth == 0:
            continue
        if is_project(root, dirs + files):
            found.append(rel)
            dirs[:] = []          # 命中即止，不下探项目内部
        elif depth >= COVER_DEPTH:
            dirs[:] = []
    return found


def report_coverage(src: str) -> None:
    """磁盘上有、data.js 里一个字都没提的项目 —— 新下载的课程通常卡在这里。

    这一类比路径失效更难发现：不会 404，站点上只是「一直没出现过」。
    """
    projects = project_dirs()
    uncovered = [d for d in projects if d not in src]

    print(f"\n覆盖检查 · 识别 {len(projects)} 个项目目录 · 未被 data.js 提及 {len(uncovered)}")
    if uncovered:
        for d in uncovered:
            print(f"  [未收录] {d}")
        print("\n以上项目站点上看不到。要么加进 data.js 的 courses / menuData，要么确认是有意跳过。")
    else:
        print("每个项目目录都有引用 ✓")


def main() -> int:
    data_path = os.path.join(SITE, "data.js")
    if not os.path.exists(data_path):
        print(f"找不到 {data_path}", file=sys.stderr)
        return 2

    src = open(data_path, encoding="utf-8").read()

    # 轨道目录本身：这一层错了，下面几百条引用会一起废掉
    for d in dict.fromkeys(TRACK_DIR_RE.findall(src)):
        if not os.path.isdir(os.path.join(COURSE_ROOT, d)):
            print(f"⚠️  轨道目录不存在：local-courses/{d}（data.js 的 tracks[].dir）")

    refs = []  # (kind, path)
    refs += [("doc", p) for p in DOC_RE.findall(src)]
    refs += [("link", p) for p in LINK_RE.findall(src) if not p.startswith("http")]
    refs += [("image-rewrite", p) for p in IMG_RE.findall(src)]
    refs += [("mark", "@mark/" + m) for m in MARK_RE.findall(src)]

    seen = set()
    missing = []
    checked = 0
    for kind, path in refs:
        key = (kind, path)
        if key in seen:
            continue
        seen.add(key)
        checked += 1
        target = resolve(path)
        # 图片重写规则指向目录，其余指向文件
        ok = os.path.isdir(target) if kind == "image-rewrite" else os.path.isfile(target)
        if not ok:
            missing.append((kind, path))

    print(f"检查 {checked} 条本地引用 · 命中 {checked - len(missing)} · 失效 {len(missing)}")
    if missing:
        print("\n失效清单：")
        for kind, path in missing:
            print(f"  [{kind}] {path}")
    else:
        print("全部命中 ✓")

    if "--no-cover" not in sys.argv:
        report_coverage(src)

    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
