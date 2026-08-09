#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import vm from "node:vm";

const TRACK_ID_MAP = new Map([
  ["learning", "learning"],
  ["ai-coding", "aicoding"],
  ["agentic", "agentic"],
  ["application", "application"],
]);

function usage() {
  return [
    "Usage: node scripts/convert-legacy-content.mjs [options]",
    "",
    "Options:",
    "  --root <path>          Repository root (default: current directory)",
    "  --content-dir <path>   Generated content directory (default: <root>/content)",
    "  --report-dir <path>    Conversion report directory (default: <root>/reports/legacy-conversion)",
    "  --baseline <path>      Baseline report to reconcile (default: <root>/reports/baseline/baseline.json)",
    "  -h, --help             Show this help message",
  ].join("\n");
}

function parseArguments(args) {
  const options = {
    root: process.cwd(),
    contentDirectory: undefined,
    reportDirectory: undefined,
    baselinePath: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "-h" || argument === "--help") {
      return { help: true };
    }

    if (
      argument === "--root" ||
      argument === "--content-dir" ||
      argument === "--report-dir" ||
      argument === "--baseline"
    ) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a path.`);
      }
      index += 1;

      if (argument === "--root") {
        options.root = value;
      } else if (argument === "--content-dir") {
        options.contentDirectory = value;
      } else if (argument === "--report-dir") {
        options.reportDirectory = value;
      } else {
        options.baselinePath = value;
      }
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  const root = resolve(options.root);
  return {
    help: false,
    root,
    contentDirectory: resolve(options.contentDirectory ?? join(root, "content")),
    reportDirectory: resolve(
      options.reportDirectory ?? join(root, "reports", "legacy-conversion"),
    ),
    baselinePath: resolve(
      options.baselinePath ?? join(root, "reports", "baseline", "baseline.json"),
    ),
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isExternalReference(value) {
  return /^[a-z][a-z\d+.-]*:/i.test(value);
}

function isRepositoryReference(value) {
  return value.startsWith("@root/");
}

function unique(values) {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function padded(value, width) {
  return String(value).padStart(width, "0");
}

function mapTrackId(trackId) {
  const mapped = TRACK_ID_MAP.get(trackId);
  if (!mapped) {
    throw new Error(`Legacy track ID cannot be mapped: ${trackId}`);
  }
  return mapped;
}

function toReference(link) {
  if (!Array.isArray(link) || typeof link[0] !== "string" || typeof link[1] !== "string") {
    throw new Error("Expected every legacy course link to contain a label and target.");
  }

  return {
    label: link[0],
    sourceUrl: isExternalReference(link[1]) ? link[1] : null,
    localPath: isExternalReference(link[1]) ? null : link[1],
  };
}

function accessPolicyFor(references) {
  const localPath = references.find((reference) => reference.localPath !== null)?.localPath ?? null;
  const sourceUrl = references.find((reference) => reference.sourceUrl !== null)?.sourceUrl ?? null;

  if (localPath !== null) {
    return { accessPolicy: "local-preferred", localPath, sourceUrl, unavailableReason: null };
  }

  if (sourceUrl !== null) {
    return { accessPolicy: "upstream-only", localPath: null, sourceUrl, unavailableReason: null };
  }

  return {
    accessPolicy: "unavailable",
    localPath: null,
    sourceUrl: null,
    unavailableReason: "The legacy entry has no readable link.",
  };
}

function loadLegacyDataFromSource(source, dataPath) {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: dataPath, timeout: 1_000 });
  const data = sandbox.window.HubData;

  if (
    !data ||
    !Array.isArray(data.tracks) ||
    !Array.isArray(data.stages) ||
    !Array.isArray(data.courses) ||
    !Array.isArray(data.menuData) ||
    !Array.isArray(data.projects)
  ) {
    throw new Error(`Expected ${dataPath} to assign the legacy HubData collections.`);
  }

  return data;
}

async function loadBaseline(baselinePath) {
  const contents = await readFile(baselinePath, "utf8");
  return JSON.parse(contents);
}

function createStageDocuments(legacyStages, readingItemIdsByPath) {
  return legacyStages.map((legacyStage, stageIndex) => {
    const stageId = legacyStage.id;
    const taskIds = (legacyStage.tasks ?? []).map(
      (_, taskIndex) => `${stageId}-task-${taskIndex + 1}`,
    );
    const outcomeId = `${stageId}-outcome`;
    const learningItemIds = unique(
      (legacyStage.reading ?? []).map((reading) => {
        const itemId = readingItemIdsByPath.get(reading.doc);
        if (!itemId) {
          throw new Error(`No converted reading item exists for ${reading.doc}.`);
        }
        return itemId;
      }),
    );

    return {
      stage: {
        id: stageId,
        order: stageIndex,
        title: legacyStage.title,
        summary: legacyStage.summary,
        learningGoals: [...(legacyStage.tasks ?? [])],
        maintainerGuide: legacyStage.summary,
        trackIds: ["learning", "aicoding", "agentic", "application"],
        taskIds,
        projectOutcomeIds: [outcomeId],
        learningItemIds,
        legacyImport: {
          source: "learning-site/data.js",
          kind: "stage",
          order: stageIndex,
          raw: cloneJson(legacyStage),
        },
      },
      stageTasks: (legacyStage.tasks ?? []).map((task, taskIndex) => ({
        id: `${stageId}-task-${taskIndex + 1}`,
        stageId,
        title: task,
        summary: task,
        acceptanceCriteria: [],
        legacyImport: {
          source: "learning-site/data.js",
          kind: "stage",
          order: stageIndex,
          raw: { task, taskIndex },
        },
      })),
      projectOutcomes: [
        {
          id: outcomeId,
          stageId,
          title: legacyStage.badge,
          summary: legacyStage.output,
          evidenceTypes: [],
          level: null,
          legacyImport: {
            source: "learning-site/data.js",
            kind: "stage",
            order: stageIndex,
            raw: { output: legacyStage.output, badge: legacyStage.badge },
          },
        },
      ],
    };
  });
}

function createCourseItems(legacyCourses) {
  return legacyCourses.map((course, courseIndex) => {
    const references = (course.links ?? []).map(toReference);
    const access = accessPolicyFor(references);

    return {
      id: `legacy-course-${padded(courseIndex + 1, 3)}`,
      title: course.title,
      track: mapTrackId(course.track),
      stageIds: [],
      summary: course.summary,
      learningGoals: course.focus ? [course.focus] : [],
      sourceUrl: access.sourceUrl,
      localPath: access.localPath,
      accessPolicy: access.accessPolicy,
      publicationRights: "third-party",
      author: "Unknown",
      license: "Unknown",
      licenseStatus: "unknown",
      tags: unique([course.tag ?? "", course.kind ?? "", course.featured ? "featured" : ""]),
      lastReviewedAt: null,
      references,
      unavailableReason: access.unavailableReason,
      legacyImport: {
        source: "learning-site/data.js",
        kind: "course-card",
        order: courseIndex,
        raw: cloneJson(course),
      },
    };
  });
}

function createReadingItems(legacyGroups, stageIdsByPath) {
  const itemIdsByPath = new Map();
  const items = [];

  legacyGroups.forEach((group, groupIndex) => {
    const track = mapTrackId(group.track);
    (group.items ?? []).forEach((reading, readingIndex) => {
      const repositoryReference = isRepositoryReference(reading.doc);
      const references = repositoryReference
        ? []
        : [
            {
              label: reading.label,
              sourceUrl: isExternalReference(reading.doc) ? reading.doc : null,
              localPath: isExternalReference(reading.doc) ? null : reading.doc,
            },
          ];
      const access = repositoryReference
        ? {
            accessPolicy: "unavailable",
            localPath: null,
            sourceUrl: null,
            unavailableReason:
              "The legacy reference targets a repository file outside Local Material.",
          }
        : accessPolicyFor(references);
      const id = `legacy-reading-${padded(groupIndex + 1, 2)}-${padded(readingIndex + 1, 3)}`;

      if (!itemIdsByPath.has(reading.doc)) {
        itemIdsByPath.set(reading.doc, id);
      }

      items.push({
        id,
        title: reading.label,
        track,
        stageIds: stageIdsByPath.get(reading.doc) ?? [],
        summary: group.title,
        learningGoals: [],
        sourceUrl: access.sourceUrl,
        localPath: access.localPath,
        accessPolicy: access.accessPolicy,
        publicationRights: "third-party",
        author: "Unknown",
        license: "Unknown",
        licenseStatus: "unknown",
        tags: unique([group.title, "legacy-reading"]),
        lastReviewedAt: null,
        references,
        unavailableReason: access.unavailableReason,
        legacyImport: {
          source: "learning-site/data.js",
          kind: "reading-chapter",
          order: groupIndex * 1_000 + readingIndex,
          raw: {
            group: {
              title: group.title,
              track: group.track,
            },
            item: cloneJson(reading),
          },
        },
      });
    });
  });

  return { itemIdsByPath, items };
}

function createProjectOutcomes(legacyProjects) {
  return legacyProjects.map((project, projectIndex) => {
    if (!Array.isArray(project) || project.length < 3) {
      throw new Error("Expected every legacy project to contain a level, title, and summary.");
    }

    const level = Number.parseInt(String(project[0]).replace(/\D+/g, ""), 10);
    if (!Number.isInteger(level) || level < 1) {
      throw new Error(`Could not determine a project level from ${project[0]}.`);
    }

    return {
      id: `legacy-project-${padded(projectIndex + 1, 2)}`,
      stageId: null,
      title: project[1],
      summary: project[2],
      evidenceTypes: [],
      level,
      legacyImport: {
        source: "learning-site/data.js",
        kind: "project",
        order: projectIndex,
        raw: {
          level: project[0],
          title: project[1],
          summary: project[2],
        },
      },
    };
  });
}

function createTracks(legacyTracks) {
  return legacyTracks.map((track) => ({
    id: mapTrackId(track.id),
    title: track.name,
    summary: track.desc,
  }));
}

function createStageIdsByPath(legacyStages) {
  const stageIdsByPath = new Map();

  legacyStages.forEach((stage) => {
    (stage.reading ?? []).forEach((reading) => {
      const stageIds = stageIdsByPath.get(reading.doc) ?? [];
      stageIds.push(stage.id);
      stageIdsByPath.set(reading.doc, unique(stageIds));
    });
  });

  return stageIdsByPath;
}

function createUnresolvedReport(items) {
  const counts = { sourceUrls: 0, authors: 0, licenses: 0 };
  const entries = [];

  for (const item of items) {
    const missing = [];
    if (item.sourceUrl === null) {
      counts.sourceUrls += 1;
      missing.push("sourceUrl");
    }
    if (item.author === "Unknown") {
      counts.authors += 1;
      missing.push("author");
    }
    if (item.licenseStatus === "unknown") {
      counts.licenses += 1;
      missing.push("license");
    }

    if (missing.length > 0) {
      entries.push({
        id: item.id,
        title: item.title,
        kind: item.legacyImport.kind,
        localPath: item.localPath,
        missing,
      });
    }
  }

  return { ...counts, entries };
}

function reconcileBaseline(baseline, counts) {
  const expected = {
    tracks: baseline.counts?.tracks,
    stages: baseline.counts?.stages,
    courses: baseline.counts?.courses,
    readingGroups: baseline.counts?.readingGroups,
    readingChapters: baseline.counts?.readingChapters,
  };
  const actual = {
    tracks: counts.tracks,
    stages: counts.stages,
    courses: counts.courseCards,
    readingGroups: counts.readingGroups,
    readingChapters: counts.readingChapters,
  };
  const mismatches = Object.entries(expected)
    .filter(([, value]) => !Number.isInteger(value))
    .map(([key]) => `Baseline is missing numeric ${key} count.`)
    .concat(
      Object.entries(expected)
        .filter(([key, value]) => Number.isInteger(value) && value !== actual[key])
        .map(([key, value]) => `Expected ${key}=${value}, received ${actual[key]}.`),
    );

  return { expected, actual, matches: mismatches.length === 0, mismatches };
}

function renderMarkdown(report) {
  return [
    "# Legacy content conversion",
    "",
    `Source digest: \`${report.source.sha256}\``,
    "",
    "## Reconciled counts",
    "",
    "| Metric | Converted | Baseline |",
    "| --- | ---: | ---: |",
    `| Tracks | ${report.counts.tracks} | ${report.baselineComparison.expected.tracks} |`,
    `| Stages | ${report.counts.stages} | ${report.baselineComparison.expected.stages} |`,
    `| Course cards | ${report.counts.courseCards} | ${report.baselineComparison.expected.courses} |`,
    `| Reading groups | ${report.counts.readingGroups} | ${report.baselineComparison.expected.readingGroups} |`,
    `| Reading chapters | ${report.counts.readingChapters} | ${report.baselineComparison.expected.readingChapters} |`,
    "",
    "## Pending attribution",
    "",
    `- Missing upstream URLs: ${report.unresolved.sourceUrls}`,
    `- Unknown authors: ${report.unresolved.authors}`,
    `- Unknown licenses: ${report.unresolved.licenses}`,
    "",
    "The converter writes `Unknown` only as an explicit pending sentinel and does not infer an author, license, or upstream URL.",
  ].join("\n");
}

async function writeJson(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const dataPath = join(options.root, "learning-site", "data.js");
  const [source, baseline] = await Promise.all([
    readFile(dataPath, "utf8"),
    loadBaseline(options.baselinePath),
  ]);
  const data = loadLegacyDataFromSource(source, dataPath);
  const stageIdsByPath = createStageIdsByPath(data.stages);
  const { itemIdsByPath, items: readingItems } = createReadingItems(
    data.menuData,
    stageIdsByPath,
  );
  const courseItems = createCourseItems(data.courses);
  const stageDocuments = createStageDocuments(data.stages, itemIdsByPath);
  const projectOutcomes = createProjectOutcomes(data.projects);
  const tracks = createTracks(data.tracks);
  const items = [...courseItems, ...readingItems];
  const counts = {
    tracks: tracks.length,
    stages: stageDocuments.length,
    stageTasks: stageDocuments.flatMap((document) => document.stageTasks).length,
    stageOutcomes: stageDocuments.flatMap((document) => document.projectOutcomes).length,
    projectOutcomes: projectOutcomes.length,
    courseCards: courseItems.length,
    readingGroups: data.menuData.length,
    readingChapters: readingItems.length,
    stageReadings: data.stages.reduce(
      (total, stage) => total + (stage.reading?.length ?? 0),
      0,
    ),
    items: items.length,
  };
  const baselineComparison = reconcileBaseline(baseline, counts);
  if (!baselineComparison.matches) {
    throw new Error(`Baseline reconciliation failed: ${baselineComparison.mismatches.join(" ")}`);
  }

  const report = {
    formatVersion: 1,
    source: {
      legacyData: "learning-site/data.js",
      sha256: hashText(source),
    },
    counts,
    baselineComparison,
    unresolved: createUnresolvedReport(items),
  };
  const sourceSnapshot = {
    formatVersion: 1,
    source: "learning-site/data.js",
    sha256: hashText(source),
    courseRoot: data.COURSE_ROOT,
    tracks: cloneJson(data.tracks),
    stages: cloneJson(data.stages),
    courses: cloneJson(data.courses),
    projects: cloneJson(data.projects),
    resources: cloneJson(data.resources ?? []),
    menuData: cloneJson(data.menuData),
    imageRewrites: cloneJson(data.imageRewrites ?? []),
  };

  await Promise.all([
    mkdir(options.contentDirectory, { recursive: true }),
    mkdir(options.reportDirectory, { recursive: true }),
  ]);
  await Promise.all([
    writeJson(join(options.contentDirectory, "catalog", "tracks.json"), tracks),
    writeJson(join(options.contentDirectory, "stages", "legacy-import.json"), stageDocuments),
    writeJson(join(options.contentDirectory, "courses", "legacy-import.json"), items),
    writeJson(
      join(options.contentDirectory, "catalog", "project-outcomes.json"),
      projectOutcomes,
    ),
    writeJson(
      join(options.contentDirectory, "catalog", "legacy-source-snapshot.json"),
      sourceSnapshot,
    ),
    writeJson(join(options.reportDirectory, "legacy-conversion.json"), report),
    writeFile(
      join(options.reportDirectory, "legacy-conversion.md"),
      `${renderMarkdown(report)}\n`,
    ),
  ]);

  process.stdout.write(
    `Converted ${counts.courseCards} course cards and ${counts.readingChapters} reading chapters.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
