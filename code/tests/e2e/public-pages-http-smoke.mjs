const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:3100";
const cases = [
  ["/roadmap", "九阶段路线"],
  ["/roadmap/stage-0", "理解 Agent 是什么"],
  ["/courses", "课程目录"],
  ["/courses/agent-loop-maintainer-guide", "Agent loop maintainer guide"],
  ["/projects", "项目阶梯"],
  ["/read/agent-loop-maintainer-guide", "Agent loop：从观察到行动"],
  ["/content-policy", "资料来自哪里"],
  ["/contribute", "把修正送进 Git"],
];

for (const [path, expected] of cases) {
  const response = await fetch(`${baseUrl}${path}`);
  const page = await response.text();
  const visibleText = page
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (response.status !== 200 || !visibleText.includes(expected)) {
    throw new Error(
      `${path} did not render ${expected}: status ${response.status}.`,
    );
  }
}

console.log(`Public page smoke test passed for ${cases.length} routes.`);
