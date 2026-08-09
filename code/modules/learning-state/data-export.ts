import type { LearningStateSnapshot, NoteRecord } from "./repository";

export type ExportedLearningState = {
  schemaVersion: 1;
  exportedAt: string;
  user: {
    id: string;
    mode: "cloud" | "local";
    displayName: string;
  };
  itemProgress: LearningStateSnapshot["itemProgress"];
  stageTaskProgress: LearningStateSnapshot["stageTaskProgress"];
  bookmarks: LearningStateSnapshot["bookmarks"];
  stageOutcomes: LearningStateSnapshot["stageOutcomes"];
  notes: LearningStateSnapshot["notes"];
};

export function exportLearningState(
  snapshot: LearningStateSnapshot,
  exportedAt = new Date().toISOString(),
): ExportedLearningState {
  return {
    schemaVersion: 1,
    exportedAt,
    user: {
      id: snapshot.user.id,
      mode: snapshot.user.mode,
      displayName: snapshot.user.displayName,
    },
    itemProgress: snapshot.itemProgress,
    stageTaskProgress: snapshot.stageTaskProgress,
    bookmarks: snapshot.bookmarks,
    stageOutcomes: snapshot.stageOutcomes,
    notes: snapshot.notes,
  };
}

function noteHeading(note: NoteRecord): string {
  return `## ${note.scopeType}: ${note.scopeId}`;
}

export function renderNotesMarkdown(snapshot: LearningStateSnapshot): string {
  const sections = snapshot.notes.map(
    (note) => `${noteHeading(note)}\n\n${note.body.trim()}\n`,
  );
  return [
    "# Agent Learning Hub notes",
    "",
    `- Exported for: ${snapshot.user.displayName}`,
    "",
    sections.length > 0 ? sections.join("\n") : "No notes yet.",
  ].join("\n");
}
