/** Topic-based defaults are suggestions; maintainers review the PR before publication. */
export function curationSuggestion(topics: readonly string[], reason = "") {
  const match = topics.includes("评测与生产实践")
    ? {
        stageId: "stage-7",
        prerequisites: "已实现一个最小 Agent，并了解测试与日志。",
      }
    : topics.includes("工具与 Skills")
      ? { stageId: "stage-5", prerequisites: "了解工具调用与最小 Agent Loop。" }
      : topics.includes("上下文与记忆")
        ? {
            stageId: "stage-2",
            prerequisites: "了解最小 Agent Loop 与工具调用。",
          }
        : topics.includes("AI Native 应用")
          ? {
              stageId: "stage-8",
              prerequisites: "已实现一个 Agent，能够说明用户、任务与成功标准。",
            }
          : {
              stageId: "stage-3",
              prerequisites: "了解 Agent Loop、工具调用与上下文。",
            };
  return {
    ...match,
    reason:
      reason ||
      `主题为${topics.join("、") || "AI 开发"}，建议作为该阶段的补充实践资料，请核对内容深度与学习价值。`,
  };
}
