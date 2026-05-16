import {
  FileText,
  FileCode,
  FileJson,
  FileImage,
  File,
  Globe,
  Braces,
  Hash,
  Terminal,
  Database,
  Settings,
  Package,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface FileIconEntry {
  icon: LucideIcon;
  color: string;
}

const EXT_MAP: Record<string, FileIconEntry> = {
  ts: { icon: FileCode, color: '#3178c6' },
  tsx: { icon: FileCode, color: '#3178c6' },
  js: { icon: FileCode, color: '#f7df1e' },
  jsx: { icon: FileCode, color: '#61dafb' },
  html: { icon: Globe, color: '#e44d26' },
  css: { icon: Hash, color: '#264de4' },
  scss: { icon: Hash, color: '#cc6699' },
  json: { icon: FileJson, color: '#cbcb41' },
  md: { icon: FileText, color: '#7c6af7' },
  py: { icon: FileCode, color: '#3572a5' },
  rs: { icon: Braces, color: '#dea584' },
  go: { icon: FileCode, color: '#00add8' },
  sh: { icon: Terminal, color: '#4ade80' },
  bash: { icon: Terminal, color: '#4ade80' },
  zsh: { icon: Terminal, color: '#4ade80' },
  sql: { icon: Database, color: '#f59e0b' },
  toml: { icon: Settings, color: '#9e9e9e' },
  yaml: { icon: Settings, color: '#cb171e' },
  yml: { icon: Settings, color: '#cb171e' },
  png: { icon: FileImage, color: '#4ade80' },
  jpg: { icon: FileImage, color: '#4ade80' },
  jpeg: { icon: FileImage, color: '#4ade80' },
  svg: { icon: FileImage, color: '#ffb13b' },
  webp: { icon: FileImage, color: '#4ade80' },
  graphql: { icon: Braces, color: '#e10098' },
  xml: { icon: FileCode, color: '#f59e0b' },
};

const NAME_MAP: Record<string, FileIconEntry> = {
  'package.json': { icon: Package, color: '#cb3837' },
  'tsconfig.json': { icon: Settings, color: '#3178c6' },
  '.gitignore': { icon: FileText, color: '#f05032' },
  'dockerfile': { icon: FileCode, color: '#0db7ed' },
  'makefile': { icon: Terminal, color: '#6d8086' },
};

export function getFileIcon(path: string): FileIconEntry {
  const name = path.split('/').pop()?.toLowerCase() ?? '';
  if (NAME_MAP[name]) return NAME_MAP[name];
  const ext = name.split('.').pop() ?? '';
  return EXT_MAP[ext] ?? { icon: File, color: 'var(--text-quaternary)' };
}
