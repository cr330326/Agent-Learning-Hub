import {
  createPersistentLearningStateStore,
  type PersistentLearningStateStore,
} from "../modules/learning-state/state-store";

let stateStore: PersistentLearningStateStore | null = null;

export function getLearningStateStore(): PersistentLearningStateStore {
  if (!stateStore) {
    stateStore = createPersistentLearningStateStore();
  }
  return stateStore;
}
