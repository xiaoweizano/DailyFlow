import type { AttachmentAttrs } from "@dailyflow/editor";
import { Button } from "@dailyflow/ui";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { FileWarning, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAppServices } from "../app-services-hooks.js";

function toObjectUrl(bytes: Uint8Array, mimeType: string): string {
  return URL.createObjectURL(
    new Blob([bytes.slice().buffer], {
      type: mimeType || "application/octet-stream",
    }),
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface AttachmentPreviewProps {
  readonly attachmentId: string;
  readonly displayName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly isInline: boolean;
  readonly read: () => Promise<Uint8Array>;
}

export function AttachmentPreview({
  attachmentId,
  displayName,
  mimeType,
  byteSize,
  isInline,
  read,
}: AttachmentPreviewProps): React.JSX.Element {
  const objectUrlRef = useRef<string | null>(null);
  const [state, setState] = useState<
    | { readonly status: "loading" }
    | { readonly status: "ready"; readonly objectUrl: string | null }
    | { readonly status: "error" }
  >({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    setState({ status: "loading" });
    void read()
      .then((bytes) => {
        createdUrl = toObjectUrl(bytes, mimeType);
        if (!active) {
          URL.revokeObjectURL(createdUrl);
          return;
        }
        objectUrlRef.current = createdUrl;
        setState({
          status: "ready",
          objectUrl: mimeType.startsWith("image/") ? createdUrl : null,
        });
      })
      .catch(() => {
        if (active) {
          setState({ status: "error" });
        }
      });

    return () => {
      active = false;
      const objectUrl = objectUrlRef.current ?? createdUrl;
      if (objectUrl !== null) {
        URL.revokeObjectURL(objectUrl);
      }
      objectUrlRef.current = null;
    };
  }, [attachmentId, attempt, mimeType, read]);

  if (state.status === "loading") {
    return (
      <span
        role="status"
        className="inline-flex items-center rounded-[var(--radius-control)] border border-border bg-surface-muted px-2 py-1 text-xs text-muted-foreground"
      >
        正在加载 {displayName}
      </span>
    );
  }

  if (state.status === "error") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] border border-danger/40 bg-danger/5 px-2 py-1 text-xs">
        <FileWarning aria-hidden="true" className="size-4 text-danger" />
        <span>附件读取失败 {displayName}</span>
        <Button variant="ghost" size="sm" onClick={() => setAttempt((value) => value + 1)}>
          <RotateCcw aria-hidden="true" className="size-3.5" />
          重试
        </Button>
      </span>
    );
  }

  if (state.objectUrl !== null) {
    return (
      <img
        src={state.objectUrl}
        alt={displayName}
        className="my-1 inline-block max-h-80 max-w-full rounded-[var(--radius-control)] border border-border object-contain"
      />
    );
  }

  return (
    <span
      className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface-muted px-2 py-1 text-xs text-foreground"
      title={isInline ? "内联附件" : "附件"}
    >
      <span className="font-medium">{displayName}</span>
      <span className="text-muted-foreground">{formatBytes(byteSize)}</span>
    </span>
  );
}

export interface AttachmentUploadPlaceholderProps {
  readonly fileName: string;
  readonly errorMessage: string;
  readonly onRetry: () => void;
  readonly onDismiss: () => void;
}

export function AttachmentUploadPlaceholder({
  fileName,
  errorMessage,
  onRetry,
  onDismiss,
}: AttachmentUploadPlaceholderProps): React.JSX.Element {
  return (
    <div
      role="alert"
      className="mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-danger/40 bg-danger/5 px-3 py-2 text-sm"
    >
      <FileWarning aria-hidden="true" className="size-4 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{fileName}</p>
        <p className="text-xs text-danger">{errorMessage}</p>
      </div>
      <Button variant="secondary" size="sm" aria-label={`重试上传 ${fileName}`} onClick={onRetry}>
        <RotateCcw aria-hidden="true" className="size-3.5" />
        重试
      </Button>
      <Button variant="ghost" size="sm" aria-label={`取消上传 ${fileName}`} onClick={onDismiss}>
        <X aria-hidden="true" className="size-3.5" />
        取消
      </Button>
    </div>
  );
}

export function AttachmentNodeView({ node }: ReactNodeViewProps): React.JSX.Element {
  const services = useAppServices();
  const attrs = node.attrs as AttachmentAttrs;
  const read = useCallback(
    () => services.attachments.read(attrs.attachmentId as never),
    [attrs.attachmentId, services.attachments],
  );

  return (
    <NodeViewWrapper as="span" data-type="attachment" className="dailyflow-attachment">
      <AttachmentPreview
        attachmentId={attrs.attachmentId}
        displayName={attrs.displayName}
        mimeType={attrs.mimeType}
        byteSize={attrs.byteSize}
        isInline={attrs.isInline}
        read={read}
      />
    </NodeViewWrapper>
  );
}
