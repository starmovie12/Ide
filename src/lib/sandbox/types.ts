/**
 * Sandbox types — Phase 5 §4.1
 * Shared interfaces for WebContainer and Cloud-mode runners.
 */

export interface FilePatch {
  path: string;
  content: string;
  /** undefined = create/update; true = delete */
  deleted?: boolean;
}

export interface ParsedError {
  file?: string;
  line?: number;
  col?: number;
  message: string;
  severity: 'error' | 'warning';
  source: 'tsc' | 'vite' | 'vitest' | 'eslint' | 'biome' | 'runtime' | 'cloud-build' | 'unknown';
}

export interface TerminalCapture {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  errors: ParsedError[];
}

export interface SandboxRunner {
  boot(): Promise<void>;
  refresh(changedFiles: FilePatch[]): Promise<void>;
  typecheck(): Promise<TerminalCapture>;
  lint(): Promise<TerminalCapture>;
  test(filePaths?: string[]): Promise<TerminalCapture>;
  runDev(): Promise<{ url: string; processId: string }>;
  stopDev(processId: string): Promise<void>;
  runCommand(cmd: string, args: string[]): Promise<TerminalCapture>;
  onOutput(listener: (chunk: string, stream: 'stdout' | 'stderr') => void): () => void;
  onError(listener: (err: ParsedError) => void): () => void;
  dispose(): Promise<void>;
}

export type SandboxMode = 'webcontainer' | 'cloud-mode' | 'skip';

export interface SandboxResult {
  ok: boolean;
  mode: SandboxMode;
  typecheck?: TerminalCapture;
  lint?: TerminalCapture;
  test?: TerminalCapture;
  errors: ParsedError[];
  durationMs: number;
}
