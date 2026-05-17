import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  ChevronsLeft,
  Plus,
  FolderPlus,
  Search,
  X,
  Github,
  Loader2,
} from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useUIStore } from '@/lib/store/uiStore';
import { useEditorStore, type FileEntry } from '@/lib/store/editorStore';
import { useDiffStore } from '@/lib/store/diffStore';
import { useBlueprintStore } from '@/lib/store/blueprintStore';
import { useChatStore } from '@/lib/store/chatStore';
import { uploadSingleFile } from '@/lib/github/push';
import { getFileIcon } from '@/lib/utils/fileIcons';
import { cn } from '@/lib/utils/cn';

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  fileId?: string;
  children?: TreeNode[];
  hasDiff?: boolean;
}

function buildTree(files: FileEntry[], pendingFilePaths: Set<string>): TreeNode[] {
  const root: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();

  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    const parts = file.path.split('/');
    let currentLevel = root;
    let cumulativePath = '';

    for (let i = 0; i < parts.length - 1; i++) {
      cumulativePath = cumulativePath ? `${cumulativePath}/${parts[i]}` : parts[i];
      let folder = folderMap.get(cumulativePath);
      if (!folder) {
        folder = { name: parts[i], path: cumulativePath, type: 'folder', children: [] };
        folderMap.set(cumulativePath, folder);
        currentLevel.push(folder);
      }
      currentLevel = folder.children!;
    }

    currentLevel.push({
      name: parts[parts.length - 1],
      path: file.path,
      type: 'file',
      fileId: file.id,
      hasDiff: pendingFilePaths.has(file.path),
    });
  }

  function sortNodes(nodes: TreeNode[]): TreeNode[] {
    return nodes
      .map((n) => ({ ...n, children: n.children ? sortNodes(n.children) : undefined }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  return sortNodes(root);
}

interface ContextMenu {
  x: number;
  y: number;
  node: TreeNode | null;
}

interface InlineEdit {
  parentPath: string;
  type: 'file' | 'folder';
  renaming?: TreeNode;
}

interface FileExplorerProps {
  className?: string;
}

export function FileExplorer({ className }: FileExplorerProps) {
  const { filePanelOpen, toggleFilePanel } = useUIStore();
  const { files, openFile, createFile, deleteFile, renameFile, moveFile, activeFileId, openFiles } =
    useEditorStore();
  const { pendingDiffs } = useDiffStore();
  const { githubToken, getRepoConnection } = useBlueprintStore();
  const { activeChatId } = useChatStore();

  // GitHub upload state
  const [uploadingPath, setUploadingPath] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const repoConn = activeChatId ? getRepoConnection(activeChatId) : null;
  const hasGitHub = !!(githubToken && repoConn);

  const handleUploadFile = useCallback(async (node: TreeNode) => {
    if (!githubToken || !repoConn || !node.fileId) return;
    const fileEntry = files.find((f) => f.id === node.fileId);
    if (!fileEntry) return;

    setUploadingPath(node.path);
    try {
      await uploadSingleFile({
        githubToken,
        owner: repoConn.owner,
        repo: repoConn.repo,
        defaultBranch: repoConn.ref || 'main',
        filePath: fileEntry.path,
        fileContent: fileEntry.content,
      });
      setUploadSuccess(node.path);
      setTimeout(() => setUploadSuccess(null), 2500);
    } catch (err) {
      console.error('GitHub upload failed:', err);
    } finally {
      setUploadingPath(null);
    }
  }, [githubToken, repoConn, files]);

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [inlineEdit, setInlineEdit] = useState<InlineEdit | null>(null);
  const [inlineValue, setInlineValue] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const inlineRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const pendingFilePaths = new Set(pendingDiffs.map((d) => d.filePath));
  const tree = buildTree(files, pendingFilePaths);

  const filteredTree = search
    ? flatFilter(tree, search.toLowerCase())
    : tree;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }, []);

  const handleFileClick = useCallback(
    (node: TreeNode) => {
      if (!node.fileId) return;
      const fileEntry = files.find((f) => f.id === node.fileId);
      if (!fileEntry) return;
      openFile({ id: fileEntry.id, path: fileEntry.path, language: fileEntry.language }, fileEntry.content);
    },
    [files, openFile]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    const handler = () => closeContextMenu();
    window.addEventListener('click', handler);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeContextMenu(); });
    return () => window.removeEventListener('click', handler);
  }, [closeContextMenu]);

  useEffect(() => {
    if (inlineEdit && inlineRef.current) {
      inlineRef.current.focus();
      inlineRef.current.select();
    }
  }, [inlineEdit]);

  const startNewFile = useCallback((parentPath = '') => {
    setExpandedFolders((prev) => new Set([...prev, parentPath]));
    setInlineEdit({ parentPath, type: 'file' });
    setInlineValue('');
    closeContextMenu();
  }, [closeContextMenu]);

  const startNewFolder = useCallback((parentPath = '') => {
    setExpandedFolders((prev) => new Set([...prev, parentPath]));
    setInlineEdit({ parentPath, type: 'folder' });
    setInlineValue('');
    closeContextMenu();
  }, [closeContextMenu]);

  const startRename = useCallback((node: TreeNode) => {
    setInlineEdit({ parentPath: '', type: node.type, renaming: node });
    setInlineValue(node.name);
    closeContextMenu();
  }, [closeContextMenu]);

  const commitInlineEdit = useCallback(() => {
    const val = inlineValue.trim();
    if (!val || !inlineEdit) { setInlineEdit(null); return; }

    if (inlineEdit.renaming) {
      const node = inlineEdit.renaming;
      if (node.type === 'file' && node.fileId) {
        const parts = node.path.split('/');
        parts[parts.length - 1] = val;
        renameFile(node.fileId, parts.join('/'));
      }
    } else {
      const newPath = inlineEdit.parentPath
        ? `${inlineEdit.parentPath}/${val}`
        : val;
      if (inlineEdit.type === 'file') {
        createFile(newPath, '');
      } else {
        setExpandedFolders((prev) => new Set([...prev, newPath]));
      }
    }
    setInlineEdit(null);
  }, [inlineValue, inlineEdit, createFile, renameFile]);

  const handleDelete = useCallback(
    (node: TreeNode) => {
      if (node.type === 'file' && node.fileId) {
        if (confirm(`Delete "${node.name}"?`)) {
          deleteFile(node.fileId);
        }
      }
      closeContextMenu();
    },
    [deleteFile, closeContextMenu]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggingId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fileId = String(active.id);
      const targetPath = String(over.id);
      moveFile(fileId, targetPath);
    },
    [moveFile]
  );

  if (!filePanelOpen) return null;

  const activeFilePath = openFiles.find((f) => f.id === activeFileId)?.path ?? null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div
        ref={containerRef}
        className={cn('hidden md:flex flex-col flex-shrink-0', className)}
        style={{
          width: 'var(--file-panel-w)',
          background: 'var(--bg-surface-elevated)',
          borderRight: '1px solid var(--border-default)',
          overflow: 'hidden',
        }}
        onContextMenu={(e) => handleContextMenu(e, null)}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 10px 10px 12px',
            borderBottom: '1px solid var(--border-default)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-quaternary)',
            }}
          >
            Files
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconBtn onClick={() => startNewFile()} title="New File" label="New file">
              <Plus size={13} />
            </IconBtn>
            <IconBtn onClick={() => startNewFolder()} title="New Folder" label="New folder">
              <FolderPlus size={13} />
            </IconBtn>
            <IconBtn onClick={toggleFilePanel} title="Collapse" label="Collapse file panel">
              <ChevronsLeft size={13} />
            </IconBtn>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '6px 8px', flexShrink: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--bg-surface-sunken)',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
              padding: '4px 8px',
            }}
          >
            <Search size={11} style={{ color: 'var(--text-quaternary)', flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter files…"
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                fontSize: 11,
                fontFamily: 'var(--font-body)',
                color: 'var(--text-primary)',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-quaternary)', display: 'flex' }}
              >
                <X size={10} />
              </button>
            )}
          </div>
        </div>

        {/* Tree */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 4px 12px' }}>
          {files.length === 0 && !inlineEdit && (
            <div
              style={{
                padding: '24px 12px',
                textAlign: 'center',
                color: 'var(--text-quaternary)',
                fontSize: 12,
                fontFamily: 'var(--font-body)',
              }}
            >
              <p style={{ margin: '0 0 8px' }}>No files yet</p>
              <button
                onClick={() => startNewFile('')}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontFamily: 'var(--font-body)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                + Create first file
              </button>
            </div>
          )}

          {inlineEdit && !inlineEdit.renaming && inlineEdit.parentPath === '' && (
            <InlineInput
              ref={inlineRef}
              value={inlineValue}
              type={inlineEdit.type}
              depth={0}
              onChange={setInlineValue}
              onCommit={commitInlineEdit}
              onCancel={() => setInlineEdit(null)}
            />
          )}

          {filteredTree.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              expandedFolders={expandedFolders}
              activeFilePath={activeFilePath}
              draggingId={draggingId}
              inlineEdit={inlineEdit}
              inlineValue={inlineValue}
              inlineRef={inlineRef}
              onToggleFolder={toggleFolder}
              onFileClick={handleFileClick}
              onContextMenu={handleContextMenu}
              onSetInlineValue={setInlineValue}
              onCommitInlineEdit={commitInlineEdit}
              onCancelInlineEdit={() => setInlineEdit(null)}
              hasGitHub={hasGitHub}
              uploadingPath={uploadingPath}
              uploadSuccess={uploadSuccess}
              onUploadFile={handleUploadFile}
            />
          ))}
        </div>

        {/* Context menu */}
        {contextMenu && (
          <ContextMenuPopup
            x={contextMenu.x}
            y={contextMenu.y}
            node={contextMenu.node}
            onNewFile={() => startNewFile(contextMenu.node?.type === 'folder' ? contextMenu.node.path : '')}
            onNewFolder={() => startNewFolder(contextMenu.node?.type === 'folder' ? contextMenu.node.path : '')}
            onRename={() => contextMenu.node && startRename(contextMenu.node)}
            onDelete={() => contextMenu.node && handleDelete(contextMenu.node)}
            onClose={closeContextMenu}
          />
        )}
      </div>

      <DragOverlay>
        {draggingId ? (
          <div
            style={{
              padding: '4px 10px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-accent)',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'var(--font-body)',
              color: 'var(--text-primary)',
              opacity: 0.9,
            }}
          >
            Moving file…
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function FileTreeNode({
  node,
  depth,
  expandedFolders,
  activeFilePath,
  draggingId,
  inlineEdit,
  inlineValue,
  inlineRef,
  onToggleFolder,
  onFileClick,
  onContextMenu,
  onSetInlineValue,
  onCommitInlineEdit,
  onCancelInlineEdit,
  hasGitHub = false,
  uploadingPath,
  uploadSuccess,
  onUploadFile,
}: {
  node: TreeNode;
  depth: number;
  expandedFolders: Set<string>;
  activeFilePath: string | null;
  draggingId: string | null;
  inlineEdit: InlineEdit | null;
  inlineValue: string;
  inlineRef: React.RefObject<HTMLInputElement | null>;
  onToggleFolder: (path: string) => void;
  onFileClick: (node: TreeNode) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
  onSetInlineValue: (v: string) => void;
  onCommitInlineEdit: () => void;
  onCancelInlineEdit: () => void;
  hasGitHub?: boolean;
  uploadingPath?: string | null;
  uploadSuccess?: string | null;
  onUploadFile?: (node: TreeNode) => void;
}) {
  const isExpanded = expandedFolders.has(node.path);
  const isActive = node.type === 'file' && node.path === activeFilePath;
  const isRenaming = inlineEdit?.renaming?.path === node.path;

  const { icon: Icon, color } = getFileIcon(node.path);

  if (node.type === 'folder') {
    const { setNodeRef: dropRef, isOver } = useDroppable({ id: node.path });

    return (
      <div>
        <button
          ref={dropRef}
          data-testid={`folder-${node.name}`}
          onClick={() => onToggleFolder(node.path)}
          onContextMenu={(e) => onContextMenu(e, node)}
          className="flex items-center gap-1.5 w-full rounded-md text-left transition-colors hover:bg-[var(--bg-surface-overlay)]"
          style={{
            padding: `4px 8px 4px ${8 + depth * 14}px`,
            border: 'none',
            background: isOver ? 'var(--bg-surface-overlay)' : 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: 12,
            fontFamily: 'var(--font-body)',
            outline: isOver ? '1px solid var(--border-accent)' : 'none',
          }}
        >
          {isExpanded ? (
            <ChevronDown size={11} style={{ flexShrink: 0, color: 'var(--text-quaternary)' }} />
          ) : (
            <ChevronRight size={11} style={{ flexShrink: 0, color: 'var(--text-quaternary)' }} />
          )}
          {isExpanded ? (
            <FolderOpen size={13} style={{ flexShrink: 0, color: 'var(--color-accent)' }} />
          ) : (
            <Folder size={13} style={{ flexShrink: 0, color: 'var(--text-quaternary)' }} />
          )}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.name}
          </span>
        </button>

        {isExpanded && (
          <div>
            {inlineEdit && !inlineEdit.renaming && inlineEdit.parentPath === node.path && (
              <InlineInput
                ref={inlineRef}
                value={inlineValue}
                type={inlineEdit.type}
                depth={depth + 1}
                onChange={onSetInlineValue}
                onCommit={onCommitInlineEdit}
                onCancel={onCancelInlineEdit}
              />
            )}
            {node.children?.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                expandedFolders={expandedFolders}
                activeFilePath={activeFilePath}
                draggingId={draggingId}
                inlineEdit={inlineEdit}
                inlineValue={inlineValue}
                inlineRef={inlineRef}
                onToggleFolder={onToggleFolder}
                onFileClick={onFileClick}
                onContextMenu={onContextMenu}
                onSetInlineValue={onSetInlineValue}
                onCommitInlineEdit={onCommitInlineEdit}
                onCancelInlineEdit={onCancelInlineEdit}
                hasGitHub={hasGitHub}
                uploadingPath={uploadingPath}
                uploadSuccess={uploadSuccess}
                onUploadFile={onUploadFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({
    id: node.fileId ?? node.path,
  });

  if (isRenaming) {
    return (
      <InlineInput
        ref={inlineRef}
        value={inlineValue}
        type="file"
        depth={depth}
        onChange={onSetInlineValue}
        onCommit={onCommitInlineEdit}
        onCancel={onCancelInlineEdit}
      />
    );
  }

  const isUploading = uploadingPath === node.path;
  const isUploaded = uploadSuccess === node.path;

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} className="group">
      <button
        ref={dragRef}
        {...listeners}
        {...attributes}
        data-testid={`file-${node.name}`}
        onClick={() => onFileClick(node)}
        onContextMenu={(e) => onContextMenu(e, node)}
        className="flex items-center gap-1.5 w-full rounded-md text-left transition-colors hover:bg-[var(--bg-surface-overlay)]"
        style={{
          padding: `4px 8px 4px ${8 + depth * 14}px`,
          border: 'none',
          background: isActive ? 'var(--bg-surface-overlay)' : 'none',
          cursor: 'pointer',
          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontSize: 12,
          fontFamily: 'var(--font-body)',
          opacity: isDragging ? 0.4 : 1,
          borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
          paddingLeft: isActive ? `${6 + depth * 14}px` : `${8 + depth * 14}px`,
          flex: 1,
          minWidth: 0,
        }}
      >
        <span style={{ width: 11, flexShrink: 0 }} />
        <Icon size={13} style={{ flexShrink: 0, color }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
        {node.hasDiff && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--color-warning)',
              flexShrink: 0,
              marginRight: 2,
            }}
            title="Pending diff"
          />
        )}
      </button>

      {/* GitHub one-click upload — shown when a repo is connected */}
      {hasGitHub && node.type === 'file' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUploadFile?.(node);
          }}
          disabled={isUploading}
          title={
            isUploaded
              ? 'Uploaded!'
              : isUploading
              ? 'Uploading…'
              : `Upload ${node.path} to GitHub`
          }
          aria-label={`Upload ${node.name} to GitHub`}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            flexShrink: 0,
            marginRight: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: 4,
            border: isUploaded
              ? '1px solid var(--color-success)'
              : '1px solid var(--border-subtle)',
            background: isUploaded
              ? 'var(--color-success-subtle)'
              : 'var(--bg-surface-elevated)',
            color: isUploaded
              ? 'var(--color-success)'
              : isUploading
              ? 'var(--text-quaternary)'
              : 'var(--text-tertiary)',
            cursor: isUploading ? 'not-allowed' : 'pointer',
            transition: 'all 150ms',
          }}
        >
          {isUploading ? (
            <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <Github size={11} />
          )}
        </button>
      )}
    </div>
  );
}

const InlineInput = ({
  value,
  type,
  depth,
  onChange,
  onCommit,
  onCancel,
  ref,
}: {
  value: string;
  type: 'file' | 'folder';
  depth: number;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  ref?: React.RefObject<HTMLInputElement | null>;
}) => (
  <div
    style={{
      padding: `3px 8px 3px ${8 + depth * 14}px`,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    }}
  >
    {type === 'folder' ? (
      <Folder size={13} style={{ color: 'var(--text-quaternary)', flexShrink: 0 }} />
    ) : (
      <span style={{ width: 24 }} />
    )}
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit();
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={onCommit}
      placeholder={type === 'file' ? 'filename.ts' : 'folder-name'}
      style={{
        flex: 1,
        background: 'var(--bg-surface-sunken)',
        border: '1px solid var(--border-accent)',
        borderRadius: 4,
        padding: '2px 6px',
        fontSize: 12,
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-primary)',
        outline: 'none',
      }}
    />
  </div>
);

function ContextMenuPopup({
  x,
  y,
  node,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  node: TreeNode | null;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const adjustedX = Math.min(x, window.innerWidth - 180);
  const adjustedY = Math.min(y, window.innerHeight - 180);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => window.addEventListener('mousedown', handler), 0);
    return () => window.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: '4px',
        zIndex: 9999,
        minWidth: 160,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuAction onClick={onNewFile} icon="📄">New File</MenuAction>
      <MenuAction onClick={onNewFolder} icon="📁">New Folder</MenuAction>
      {node && (
        <>
          <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 0' }} />
          <MenuAction onClick={onRename} icon="✏️">Rename</MenuAction>
          {node.type === 'file' && (
            <MenuAction onClick={onDelete} icon="🗑️" danger>Delete</MenuAction>
          )}
        </>
      )}
    </div>
  );
}

function MenuAction({
  children,
  icon,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  icon: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full rounded-md text-left transition-colors hover:bg-[var(--bg-surface-elevated)]"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        border: 'none',
        background: 'none',
        width: '100%',
        cursor: 'pointer',
        fontSize: 12,
        fontFamily: 'var(--font-body)',
        color: danger ? 'var(--color-destructive)' : 'var(--text-secondary)',
        borderRadius: 5,
      }}
    >
      <span>{icon}</span>
      {children}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={label}
      className="flex items-center justify-center rounded transition-colors hover:bg-[var(--bg-surface-overlay)]"
      style={{
        width: 22,
        height: 22,
        border: 'none',
        background: 'none',
        color: 'var(--text-quaternary)',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

function flatFilter(nodes: TreeNode[], query: string): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    if (node.type === 'file' && node.name.toLowerCase().includes(query)) {
      result.push(node);
    } else if (node.type === 'folder' && node.children) {
      const filtered = flatFilter(node.children, query);
      if (filtered.length > 0) {
        result.push({ ...node, children: filtered });
      }
    }
  }
  return result;
}
