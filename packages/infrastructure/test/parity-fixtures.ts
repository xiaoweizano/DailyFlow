import {
  JournalSaveStateDtoSchema,
  JournalVersionSummaryDtoSchema,
  SaveJournalSnapshotDtoSchema,
  SavedJournalSnapshotDtoSchema,
  SearchEntityTypeSchema,
} from "../src/desktop/tauri-contracts.js";
import { parseEntityId, parseLocalDate, parseUtcTimestamp } from "@dailyflow/domain";

import type { JournalParityFixture } from "../src/testing/repository-contract.js";
import fixtureJson from "./fixtures/repository-parity.json";

export const parityFixture = fixtureJson;

export const initialParitySnapshot = SaveJournalSnapshotDtoSchema.parse(
  fixtureJson.initialSnapshot,
);

export const updateParitySnapshot = SaveJournalSnapshotDtoSchema.parse(fixtureJson.updateSnapshot);

export const parityContractFixture = {
  initialSnapshot: initialParitySnapshot,
  updateSnapshot: updateParitySnapshot,
  expected: {
    initialSave: SavedJournalSnapshotDtoSchema.parse(fixtureJson.expected.initialSave),
    updateSave: SavedJournalSnapshotDtoSchema.parse(fixtureJson.expected.updateSave),
    saveStateAfterUpdate: JournalSaveStateDtoSchema.parse(
      fixtureJson.expected.saveStateAfterUpdate,
    ),
    versions: fixtureJson.expected.versions.map((version) =>
      JournalVersionSummaryDtoSchema.parse(version),
    ),
    blockSearch: {
      text: fixtureJson.expected.blockSearch.text,
      expected: fixtureJson.expected.blockSearch.expected.map((hit) => ({
        entityType: SearchEntityTypeSchema.parse(hit.entityType),
        entityId: parseEntityId(hit.entityId),
        localDate: parseLocalDate(hit.localDate),
      })),
    },
    conflict: {
      code: "CONFLICT",
      expectedRevision: fixtureJson.expected.conflict.expectedRevision,
      actualRevision: fixtureJson.expected.conflict.actualRevision,
    },
    softDeleteAt: parseUtcTimestamp(fixtureJson.expected.softDeleteAt),
  },
  enums: fixtureJson.enums,
} satisfies JournalParityFixture;
