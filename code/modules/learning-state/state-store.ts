import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { openLearningDatabase, type LearningDatabase } from "./database";
import {
  createLearningStateRepository,
  type LearningStateRepository,
} from "./repository";

export type PersistentLearningStateStore = {
  database: LearningDatabase;
  repository: LearningStateRepository;
  close(): void;
};

export type PersistentLearningStateStoreOptions = {
  filename?: string;
  enableWal?: boolean;
  environment?: Readonly<Record<string, string | undefined>>;
};

export function getDefaultStateDatabaseFilename(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return resolve(
    environment.STATE_DATABASE_PATH ??
      resolve(process.cwd(), ".data", "learning-state.sqlite"),
  );
}

export function createPersistentLearningStateStore(
  options: PersistentLearningStateStoreOptions = {},
): PersistentLearningStateStore {
  const filename = resolve(
    options.filename ?? getDefaultStateDatabaseFilename(options.environment),
  );
  mkdirSync(dirname(filename), { recursive: true });
  const database = openLearningDatabase({
    filename,
    enableWal: options.enableWal ?? true,
  });
  const repository = createLearningStateRepository(database);
  return {
    database,
    repository,
    close: database.close,
  };
}
