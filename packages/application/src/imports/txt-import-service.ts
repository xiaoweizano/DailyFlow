import {
  createContentDocument,
  createImportSession,
  detectImportDate,
  nextEntityId,
  normalizeImportRelativePath,
  nowUtc,
  parseEntityId,
  parseRevision,
  type Clock,
  type ImportConflictKind,
  type ImportEntry,
  type ImportSession,
  type IdGenerator,
  type LocalDate,
  type UtcTimestamp,
} from "@dailyflow/domain";
import type { ImportIssue } from "@dailyflow/shared";

import type {
  BeginImportCommitInput,
  ImportCommitBatchInput,
  ImportCommitEntry,
  ImportExistingMatch,
  ImportRepository,
} from "../ports/import-repository.js";
import type {
  CommitImportInput,
  ImportCommitResult,
  ImportConflictPolicy,
  ImportPreview,
  ImportPreviewEntry,
  ImportRoot,
  ImportScanOptions,
  ImportService,
  ImportSource,
  ImportTxtAnalysis,
  ImportTxtAnalyzer,
  RawImportFile,
  TxtDocumentConverter,
} from "../ports/import-service.js";
import type { ContentProjector } from "../ports/journal-repository.js";

const PREVIEW_EXCERPT_LENGTH = 240;

interface PreviewCandidate {
  readonly entry: ImportEntry;
  readonly excerpt: string;
  readonly existingJournalId: ImportEntry["journalId"];
  readonly existingRevision: number | null;
}

export interface TxtImportServiceDependencies {
  readonly source: ImportSource;
  readonly repository: ImportRepository;
  readonly analyzer: ImportTxtAnalyzer;
  readonly converter: TxtDocumentConverter;
  readonly projector: ContentProjector;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly timezone: () => string;
}

export class TxtImportService implements ImportService {
  private readonly dependencies: TxtImportServiceDependencies;

  constructor(dependencies: TxtImportServiceDependencies) {
    this.dependencies = dependencies;
  }

  selectRoot(): Promise<ImportRoot | null> {
    return this.dependencies.source.selectRoot();
  }

  scan(root: ImportRoot, options?: ImportScanOptions): Promise<AsyncIterable<RawImportFile>> {
    return Promise.resolve(this.dependencies.source.scan(root, options));
  }

  async createPreview(
    root: ImportRoot,
    files: AsyncIterable<RawImportFile>,
  ): Promise<ImportPreview> {
    const session = createImportSession(
      {
        rootLabel: root.label,
        options: { source: "txt" },
      },
      this.dependencies,
    );
    await this.dependencies.repository.createSession(session);

    const candidates: PreviewCandidate[] = [];
    for await (const file of files) {
      candidates.push(await this.createCandidate(file));
    }

    markBatchDateConflicts(candidates);
    const existingMatches = await this.dependencies.repository.findExistingMatches(
      candidates.map(({ entry }) => entry),
    );
    const classified = candidates.map((candidate) =>
      classifyExistingConflict(candidate, existingMatches),
    );
    const entries = classified.map(({ entry }) => entry);
    const previewEntries = classified.map(toPreviewEntry);
    const previewSession: ImportSession = {
      ...session,
      status: "preview_ready",
      revision: parseRevision(session.revision + 1),
      scannedCount: entries.length,
      readyCount: entries.filter((entry) => entry.status === "ready").length,
      skippedCount: entries.filter((entry) => entry.status === "skipped").length,
      conflictCount: entries.filter((entry) => entry.status === "conflict").length,
      invalidCount: entries.filter((entry) => entry.status === "invalid").length,
      entries,
    };
    await this.dependencies.repository.savePreview(previewSession);

    const { entries: _entries, ...sessionSummary } = previewSession;
    return {
      session: sessionSummary,
      entries: previewEntries,
      counts: {
        scanned: previewSession.scannedCount,
        ready: previewSession.readyCount,
        skipped: previewSession.skippedCount,
        conflicts: previewSession.conflictCount,
        invalid: previewSession.invalidCount,
      },
      estimatedBytes: entries.reduce((total, entry) => total + (entry.rawSize ?? 0), 0),
      warnings: previewEntries.flatMap((entry) =>
        entry.issue === null ? [] : [entry.issue],
      ),
    };
  }

  async commit(input: CommitImportInput): Promise<ImportCommitResult> {
    let committingSession: ImportSession | null = null;
    let selectedEntries: readonly ImportEntry[] = [];
    const conflictPolicy = input.conflictPolicy ?? "skip";
    const beginInput: BeginImportCommitInput = {
      sessionId: input.sessionId,
      expectedRevision: input.expectedSessionRevision,
      startedAt: input.committedAt,
    };

    try {
      committingSession = await this.dependencies.repository.beginCommit(beginInput);
      const selectedPaths = new Set(input.selectedPaths);
      selectedEntries = committingSession.entries.filter((entry) =>
        selectedPaths.has(entry.relativePath),
      );
      const committableEntries = selectedEntries.filter(
        (entry) =>
          entry.status === "ready" ||
          (entry.status === "conflict" &&
            entry.conflictKind === "same_date_conflict" &&
            conflictPolicy === "new_version"),
      );
      const skippedEntryIds = committingSession.entries
        .filter(
          (entry) =>
            selectedPaths.has(entry.relativePath) &&
            !committableEntries.some((item) => item.id === entry.id),
        )
        .map((entry) => entry.id);
      const commitEntries: ImportCommitEntry[] = [];
      for (const entry of committableEntries) {
        commitEntries.push(await this.createCommitEntry(entry, input.committedAt));
      }

      const batch: ImportCommitBatchInput = {
        sessionId: committingSession.id,
        expectedRevision: committingSession.revision,
        committedAt: input.committedAt,
        entries: commitEntries,
        skippedEntryIds,
        failedEntryIds: [],
      };
      const summary = await this.dependencies.repository.commitBatch(batch);
      return {
        ...summary,
        status: "completed",
      };
    } catch (error) {
      const failedEntryIds = selectedEntries.map((entry) => entry.id);
      try {
        await this.dependencies.repository.recordFailure({
          sessionId: input.sessionId,
          expectedRevision:
            committingSession?.revision ?? input.expectedSessionRevision,
          failedAt: input.committedAt,
          errorSummary: errorMessage(error),
          failedEntryIds,
        });
      } catch {
        // The original commit failure is more useful than a secondary audit failure.
      }
      return {
        sessionId: input.sessionId,
        status: "failed",
        importedCount: 0,
        skippedCount:
          committingSession === null
            ? 0
            : committingSession.entries.length - selectedEntries.length,
        failedCount:
          committingSession === null
            ? input.selectedPaths.length
            : failedEntryIds.length,
      };
    }
  }

  private async createCandidate(file: RawImportFile): Promise<PreviewCandidate> {
    const normalizedPath = normalizeImportRelativePath(file.relativePath);
    const createdAt = nowUtc(this.dependencies.clock);
    const entryId = nextEntityId(this.dependencies.ids);
    const dateDetection = detectImportDate(normalizedPath);
    const detectedDate =
      dateDetection.kind === "resolved" ? dateDetection.date : null;
    const dateIssue: ImportIssue | null =
      dateDetection.kind === "resolved"
        ? null
        : {
            entryId,
            code: dateDetection.code,
            message: dateDetection.message,
            retryable: false,
          };

    if (file.readError !== null || file.rawBytes === null) {
      const issue = file.readError ?? {
        entryId,
        code: "FILE_READ_FAILED" as const,
        message: "The TXT file could not be read",
        retryable: true,
      };
      return {
        existingJournalId: null,
        existingRevision: null,
        excerpt: "",
        entry: {
          id: entryId,
          relativePath: normalizedPath,
          originalFileName: file.fileName,
          detectedDate,
          encoding: "unknown",
          newlineStyle: "unknown",
          fileSha256: null,
          rawSize: file.byteSize,
          rawCaptureStatus: "unavailable",
          rawBytes: null,
          rawCleanedAt: null,
          status: "invalid",
          conflictKind: null,
          errorCode: issue.code,
          errorDetail: issue.message,
          journalId: null,
          previousJournalRevision: null,
          createdAt,
          committedAt: null,
        },
      };
    }

    const analysis = await this.analyze(file.rawBytes);
    const fileSha256 = await sha256Bytes(file.rawBytes);
    const error = importContentError(dateIssue, analysis, file.rawBytes.byteLength);
    return {
      existingJournalId: null,
      existingRevision: null,
      excerpt: createExcerpt(analysis.text),
      entry: {
        id: entryId,
        relativePath: normalizedPath,
        originalFileName: file.fileName,
        detectedDate,
        encoding: analysis.encoding,
        newlineStyle: analysis.newlineStyle,
        fileSha256,
        rawSize: file.rawBytes.byteLength,
        rawCaptureStatus: "captured",
        rawBytes: file.rawBytes,
        rawCleanedAt: null,
        status: error === null ? "ready" : "invalid",
        conflictKind: null,
        errorCode: error?.code ?? null,
        errorDetail: error?.message ?? null,
        journalId: null,
        previousJournalRevision: null,
        createdAt,
        committedAt: null,
      },
    };
  }

  private async analyze(bytes: Uint8Array): Promise<ImportTxtAnalysis> {
    try {
      return await this.dependencies.analyzer.analyze(bytes);
    } catch {
      return { encoding: "unknown", text: null, newlineStyle: "unknown" };
    }
  }

  private async createCommitEntry(
    entry: ImportEntry,
    committedAt: UtcTimestamp,
  ): Promise<ImportCommitEntry> {
    if (entry.detectedDate === null || entry.rawBytes === null) {
      throw new Error(`Import entry ${entry.relativePath} is not committable`);
    }
    const analysis = await this.dependencies.analyzer.analyze(entry.rawBytes);
    if (analysis.text === null) {
      throw new Error(`Import entry ${entry.relativePath} could not be decoded`);
    }

    const isExistingVersion =
      entry.status === "conflict" &&
      entry.conflictKind === "same_date_conflict" &&
      entry.journalId !== null;
    const journalId = isExistingVersion
      ? entry.journalId!
      : parseEntityId(this.dependencies.ids.nextId());
    const title = importTitle(entry);
    const content = this.dependencies.converter.toContent(analysis.text);
    const projected = await this.dependencies.projector.project({
      content,
      tags: [],
      searchContext: {
        ownerEntityId: journalId,
        entityType: "journal",
        title,
        localDate: entry.detectedDate,
        updatedAt: committedAt,
      },
    });
    const expectedRevision = isExistingVersion
      ? (entry.previousJournalRevision ?? null)
      : null;

    return {
      entryId: entry.id,
      journalId,
      previousJournalRevision: expectedRevision,
      snapshot: {
        journalId,
        journalDate: entry.detectedDate,
        timezone: this.dependencies.timezone(),
        title,
        contentJson: content.doc,
        editorSchemaVersion: content.schemaVersion,
        contentMarkdown: projected.contentMarkdown,
        contentPlainText: projected.contentPlainText,
        contentHash: projected.contentHash,
        projectionVersion: 1,
        excerpt: projected.excerpt,
        expectedRevision,
        checkpoint: "import",
        tags: [],
        structuredBlocks: projected.structuredBlocks,
        searchDocuments: projected.searchDocuments,
        savedAt: committedAt,
      },
    };
  }
}

function importContentError(
  dateIssue: ImportIssue | null,
  analysis: ImportTxtAnalysis,
  byteSize: number,
): ImportIssue | null {
  if (dateIssue !== null) {
    return dateIssue;
  }
  if (byteSize === 0) {
    return {
      code: "EMPTY_FILE",
      message: "The TXT file is empty",
      retryable: false,
    };
  }
  if (analysis.encoding === "unknown" || analysis.text === null) {
    return {
      code: "ENCODING_UNRESOLVED",
      message: "The TXT encoding could not be detected safely",
      retryable: false,
    };
  }
  return null;
}

function markBatchDateConflicts(candidates: PreviewCandidate[]): void {
  const byDate = new Map<LocalDate, PreviewCandidate[]>();
  for (const candidate of candidates) {
    const date = candidate.entry.detectedDate;
    if (date === null) {
      continue;
    }
    const group = byDate.get(date) ?? [];
    group.push(candidate);
    byDate.set(date, group);
  }

  for (const [date, group] of byDate) {
    if (group.length < 2) {
      continue;
    }
    for (const candidate of group) {
      const index = candidates.indexOf(candidate);
      candidates[index] = withConflict(candidate, "duplicate_date_in_batch", null, null);
    }
    void date;
  }
}

function classifyExistingConflict(
  candidate: PreviewCandidate,
  matches: readonly ImportExistingMatch[],
): PreviewCandidate {
  if (candidate.entry.status !== "ready") {
    return candidate;
  }

  const pathMatch = matches.find(
    (match) =>
      match.relativePath === candidate.entry.relativePath &&
      match.fileSha256 !== null &&
      match.fileSha256 === candidate.entry.fileSha256,
  );
  if (pathMatch !== undefined) {
    return withConflict(
      candidate,
      "duplicate_path",
      pathMatch.journalId,
      pathMatch.journalRevision,
    );
  }

  const dateMatches = matches.filter(
    (match) =>
      match.detectedDate !== null &&
      match.detectedDate === candidate.entry.detectedDate,
  );
  if (dateMatches.length === 0) {
    return candidate;
  }
  const contentMatch = dateMatches.find(
    (match) =>
      match.fileSha256 !== null && match.fileSha256 === candidate.entry.fileSha256,
  );
  if (contentMatch !== undefined) {
    return withConflict(
      candidate,
      "duplicate_content",
      contentMatch.journalId,
      contentMatch.journalRevision,
    );
  }
  const existing = dateMatches[0]!;
  return withConflict(
    candidate,
    "same_date_conflict",
    existing.journalId,
    existing.journalRevision,
  );
}

function withConflict(
  candidate: PreviewCandidate,
  conflictKind: ImportConflictKind,
  existingJournalId: ImportEntry["journalId"],
  existingRevision: number | null,
): PreviewCandidate {
  const status =
    conflictKind === "same_date_conflict" ||
    conflictKind === "duplicate_date_in_batch"
      ? "conflict"
      : "skipped";
  return {
    excerpt: candidate.excerpt,
    existingJournalId,
    existingRevision,
    entry: {
      ...candidate.entry,
      status,
      conflictKind,
      journalId:
        conflictKind === "same_date_conflict" ? existingJournalId : candidate.entry.journalId,
      previousJournalRevision:
        conflictKind === "same_date_conflict" && existingRevision !== null
          ? parseRevision(existingRevision)
          : null,
    },
  };
}

function toPreviewEntry(candidate: PreviewCandidate): ImportPreviewEntry {
  const { entry } = candidate;
  const issue =
    entry.errorCode === null
      ? null
      : {
          entryId: entry.id,
          code: entry.errorCode as ImportIssue["code"],
          message: entry.errorDetail ?? entry.errorCode,
          retryable: entry.rawCaptureStatus === "unavailable",
        };
  return {
    entryId: entry.id,
    relativePath: entry.relativePath,
    fileName: entry.originalFileName,
    detectedDate: entry.detectedDate,
    encoding: entry.encoding,
    newlineStyle: entry.newlineStyle,
    rawCaptureStatus: entry.rawCaptureStatus,
    fileSha256: entry.fileSha256,
    byteSize: entry.rawSize,
    excerpt: candidate.excerpt,
    status: entry.status === "failed" || entry.status === "imported" ? "invalid" : entry.status,
    conflictKind: entry.conflictKind,
    existingJournalId: candidate.existingJournalId,
    existingRevision: candidate.existingRevision,
    errorCode: entry.errorCode,
    errorMessage: entry.errorDetail,
    issue,
  };
}

function createExcerpt(text: string | null): string {
  if (text === null) {
    return "";
  }
  return text.length <= PREVIEW_EXCERPT_LENGTH
    ? text
    : `${text.slice(0, PREVIEW_EXCERPT_LENGTH - 3).trimEnd()}...`;
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const source = new Uint8Array(bytes).buffer;
  const digest = await crypto.subtle.digest("SHA-256", source);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function importTitle(entry: ImportEntry): string {
  const stem = entry.originalFileName.replace(/\.txt$/iu, "").trim();
  return (stem || `导入日志 ${entry.detectedDate ?? ""}`).slice(0, 200);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "TXT import commit failed";
}
