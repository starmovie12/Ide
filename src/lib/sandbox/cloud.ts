/**
 * Cloud-Mode Sandbox — Phase 5 §4.1 / §1.6 Mode 2
 * When WebContainers unavailable (mobile, Firefox, missing SAB):
 *   1. Push diffs to a temporary verification branch
 *   2. Poll GitHub Actions / Vercel for build status
 *   3. Fetch logs → parse errors → return SandboxResult
 *
 * Friction Vector 1: phone 2GB RAM → cloud-mode handles it.
 */

import type { FilePatch, ParsedError, SandboxResult, TerminalCapture } from './types';
import { parseErrorOutput } from '@/lib/heal/errorParser';

export interface CloudSandboxConfig {
  /** Octokit-compatible token */
  githubToken: string;
  owner: string;
  repo: string;
  /** Parent branch to branch from (usually main) */
  baseBranch: string;
  /** Unique verification branch: verify/<chatId>-<shortHash> */
  verifyBranch: string;
  /** Vercel project ID (optional — enables Vercel log fetching) */
  vercelProjectId?: string;
  vercelToken?: string;
}

interface GitHubWorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  logs_url: string;
  created_at: string;
}

/** Poll interval in ms */
const POLL_INTERVAL_MS = 3_000;
/** Max poll duration before giving up */
const POLL_TIMEOUT_MS = 5 * 60 * 1_000; // 5 min

export class CloudSandbox {
  constructor(private config: CloudSandboxConfig) {}

  /**
   * Push changed files to the verify branch, wait for CI, return result.
   */
  async run(patches: FilePatch[]): Promise<SandboxResult> {
    const start = Date.now();

    try {
      await this.pushVerifyBranch(patches);
    } catch (err) {
      return {
        ok: false,
        mode: 'cloud-mode',
        errors: [
          {
            message: `Failed to push verify branch: ${(err as Error).message}`,
            severity: 'error',
            source: 'cloud-build',
          },
        ],
        durationMs: Date.now() - start,
      };
    }

    // Check if GitHub Actions exist on the repo
    const hasCI = await this.detectCI();
    if (!hasCI) {
      return {
        ok: true,
        mode: 'skip' as const,
        errors: [],
        durationMs: Date.now() - start,
      };
    }

    try {
      const workflowRun = await this.pollForRun(this.config.verifyBranch);
      const logs = await this.fetchLogs(workflowRun.logs_url);
      const errors = parseErrorOutput(logs, 'cloud-build');
      const ok = workflowRun.conclusion === 'success' && errors.filter((e) => e.severity === 'error').length === 0;

      const capture: TerminalCapture = {
        stdout: logs,
        stderr: '',
        exitCode: ok ? 0 : 1,
        durationMs: Date.now() - start,
        errors,
      };

      return {
        ok,
        mode: 'cloud-mode',
        typecheck: capture,
        errors,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        ok: false,
        mode: 'cloud-mode',
        errors: [
          {
            message: `CI polling failed: ${(err as Error).message}`,
            severity: 'error',
            source: 'cloud-build',
          },
        ],
        durationMs: Date.now() - start,
      };
    }
  }

  private async pushVerifyBranch(patches: FilePatch[]): Promise<void> {
    const headers = {
      Authorization: `Bearer ${this.config.githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
    const base = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}`;

    // Get base branch SHA
    const branchRes = await fetch(`${base}/git/ref/heads/${this.config.baseBranch}`, { headers });
    if (!branchRes.ok) throw new Error(`Failed to get base branch: ${branchRes.status}`);
    const branchData: { object: { sha: string } } = await branchRes.json();
    const baseSHA = branchData.object.sha;

    // Create or update verify branch
    const refCheckRes = await fetch(`${base}/git/ref/heads/${this.config.verifyBranch}`, { headers });
    if (refCheckRes.status === 404) {
      await fetch(`${base}/git/refs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ref: `refs/heads/${this.config.verifyBranch}`, sha: baseSHA }),
      });
    }

    // Push each changed file
    for (const patch of patches) {
      if (patch.deleted) continue;
      const encoded = btoa(unescape(encodeURIComponent(patch.content)));
      // Get current file SHA if it exists
      let fileSHA: string | undefined;
      const fileRes = await fetch(`${base}/contents/${patch.path}?ref=${this.config.verifyBranch}`, { headers });
      if (fileRes.ok) {
        const fileData: { sha: string } = await fileRes.json();
        fileSHA = fileData.sha;
      }
      await fetch(`${base}/contents/${patch.path}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `verify: ${patch.path}`,
          content: encoded,
          branch: this.config.verifyBranch,
          ...(fileSHA ? { sha: fileSHA } : {}),
        }),
      });
    }
  }

  private async detectCI(): Promise<boolean> {
    const headers = {
      Authorization: `Bearer ${this.config.githubToken}`,
      Accept: 'application/vnd.github.v3+json',
    };
    const res = await fetch(
      `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/actions/workflows`,
      { headers }
    );
    if (!res.ok) return false;
    const data: { total_count: number } = await res.json();
    return data.total_count > 0;
  }

  private async pollForRun(branch: string): Promise<GitHubWorkflowRun> {
    const headers = {
      Authorization: `Bearer ${this.config.githubToken}`,
      Accept: 'application/vnd.github.v3+json',
    };
    const start = Date.now();

    while (Date.now() - start < POLL_TIMEOUT_MS) {
      const res = await fetch(
        `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/actions/runs?branch=${branch}&per_page=1`,
        { headers }
      );
      if (res.ok) {
        const data: { workflow_runs: GitHubWorkflowRun[] } = await res.json();
        const run = data.workflow_runs[0];
        if (run && run.status === 'completed') return run;
      }
      await sleep(POLL_INTERVAL_MS);
    }

    throw new Error('CI poll timeout exceeded');
  }

  private async fetchLogs(logsUrl: string): Promise<string> {
    const res = await fetch(logsUrl, {
      headers: { Authorization: `Bearer ${this.config.githubToken}` },
    });
    if (!res.ok) return `Failed to fetch logs: ${res.status}`;
    return res.text();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
