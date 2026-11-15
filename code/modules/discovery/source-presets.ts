import { sourceSchema } from "./schema";

export const publicSourcePresets = [
  sourceSchema.parse({
    id: "anthropic-engineering",
    name: "Anthropic Engineering",
    kind: "html",
    url: "https://www.anthropic.com/engineering",
    listPath: "h3",
    linkPattern: "/research/",
    topics: ["Harness Engineering", "评测与生产实践"],
  }),
  sourceSchema.parse({
    id: "langchain-blog",
    name: "LangChain Blog",
    kind: "html",
    url: "https://www.langchain.com/blog",
    listPath: ".blog-item",
    mapping: {
      title: "h2",
      url: "a[href]",
      author: ".blog-author-name-list",
      publishedAt: ".date-color",
    },
    topics: ["Harness Engineering", "AI Native 应用"],
  }),
];
