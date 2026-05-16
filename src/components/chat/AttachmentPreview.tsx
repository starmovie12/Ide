import { FileText, Image, Code, File } from 'lucide-react';

interface AttachmentPreviewProps {
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  previewUrl?: string;
}

function getFileIcon(fileName: string, mimeType?: string) {
  if (mimeType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(fileName)) {
    return Image;
  }
  if (
    mimeType?.startsWith('text/') ||
    /\.(ts|tsx|js|jsx|py|rs|go|java|cpp|c|h|css|html|json|md)$/i.test(fileName)
  ) {
    return Code;
  }
  if (/\.(pdf|doc|docx|txt|csv)$/i.test(fileName)) {
    return FileText;
  }
  return File;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * AttachmentPreview — shows a compact chip for an attached file.
 * Image files show a thumbnail if previewUrl is provided; others show icon + name.
 */
export function AttachmentPreview({
  fileName,
  mimeType,
  sizeBytes,
  previewUrl,
}: AttachmentPreviewProps) {
  const isImage =
    mimeType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(fileName);
  const Icon = getFileIcon(fileName, mimeType);

  if (isImage && previewUrl) {
    return (
      <div
        data-testid="attachment-preview-image"
        style={{
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid var(--border-default)',
          maxWidth: 200,
          background: 'var(--bg-surface-elevated)',
        }}
      >
        <img
          src={previewUrl}
          alt={fileName}
          style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 140, objectFit: 'cover' }}
        />
        <div
          style={{
            padding: '4px 8px',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-mono)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fileName}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="attachment-preview-file"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'var(--bg-surface-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: '5px 10px',
        fontSize: 12,
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)',
        maxWidth: 240,
        overflow: 'hidden',
      }}
    >
      <Icon size={13} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
      <span
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
      >
        {fileName}
      </span>
      {sizeBytes !== undefined && (
        <span style={{ color: 'var(--text-quaternary)', flexShrink: 0 }}>
          {formatBytes(sizeBytes)}
        </span>
      )}
    </div>
  );
}
