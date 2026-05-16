/**
 * PR Status Poller — Phase 5 §4.9
 * Polls open PRs and Vercel deployments for status changes.
 * Pushes inline chat cards when CI goes green/red or preview deploys.
 */

const POLL_INTERVAL_MS = 10_000; // 10s between polls
const MAX_POLL_DURATION_MS = 20 * 60 * 1000; // 20 min max before giving up

export type PRStatus =
  | 'open'
  | 'merged'
  | 'closed'
  | 'ci-pending'
  | 'ci-success'
  | 'ci-failed'
  | 'preview-ready'
  | 'preview-failed';

export interface PRPollResult {
  prNumber: number;
  status: PRStatus;
  mergeability?: 'mergeable' | 'conflicting' | 'unknown';
  ciState?: string;
  previewUrl?: string;
  updatedAt: number;
}

export type PollCallback = (result: PRPollResult) => void;

interface ActivePoll {
  prNumber: number;
  owner: string;
  repo: string;
  githubToken: string;
  startedAt: number;
  intervalId: ReturnType<typeof setInterval>;
}

const activePolls = new Map<string, ActivePoll>();

/**
 * Start polling a PR. Calls onUpdate whenever status changes.
 * Returns a stop function.
 */
export function pollPR(
  prNumber: number,
  owner: string,
  repo: string,
  githubToken: string,
  onUpdate: PollCallback
): () => void {
  const key = `${owner}/${repo}#${prNumber}`;
  stopPoll(key); // stop any existing poll for this PR

  let lastStatus: PRStatus | null = null;

  const checkOnce = async () => {
    try {
      const result = await fetchPRStatus(prNumber, owner, repo, githubToken);
      if (result.status !== lastStatus) {
        lastStatus = result.status;
        onUpdate(result);
      }
      // Auto-stop on terminal states
      if (result.status === 'merged' || result.status === 'closed') {
        stopPoll(key);
      }
    } catch {
      // Silently ignore — will retry next interval
    }
  };

  const poll = activePolls.get(key);
  if (!poll) {
    const intervalId = setInterval(() => {
      const p = activePolls.get(key);
      if (!p) return;
      if (Date.now() - p.startedAt > MAX_POLL_DURATION_MS) {
        stopPoll(key);
        return;
      }
      checkOnce();
    }, POLL_INTERVAL_MS);

    activePolls.set(key, {
      prNumber,
      owner,
      repo,
      githubToken,
      startedAt: Date.now(),
      intervalId,
    });

    // Immediate first check
    checkOnce();
  }

  return () => stopPoll(key);
}

/** Stop a specific poll */
export function stopPoll(key: string): void {
  const p = activePolls.get(key);
  if (p) {
    clearInterval(p.intervalId);
    activePolls.delete(key);
  }
}

/** Stop all active polls (e.g. on app unmount) */
export function stopAllPolls(): void {
  for (const key of activePolls.keys()) {
    stopPoll(key);
  }
}

async function fetchPRStatus(
  prNumber: number,
  owner: string,
  repo: string,
  token: string
): Promise<PRPollResult> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  const [prRes, checksRes] = await Promise.all([
    fetch(`${base}/pulls/${prNumber}`, { headers }),
    fetch(`${base}/commits/{sha}/check-runs`.replace('{sha}', 'HEAD'), { headers }),
  ]);

  if (!prRes.ok) throw new Error(`PR fetch failed: ${prRes.status}`);

  const pr: {
    state: string;
    merged: boolean;
    mergeable?: boolean | null;
    head: { sha: string };
    html_url: string;
  } = await prRes.json();

  if (pr.merged) {
    return { prNumber, status: 'merged', updatedAt: Date.now() };
  }
  if (pr.state === 'closed') {
    return { prNumber, status: 'closed', updatedAt: Date.now() };
  }

  // Fetch check runs for the head commit
  const commitSHA = pr.head.sha;
  const checkRes = await fetch(`${base}/commits/${commitSHA}/check-runs`, { headers });
  let ciState: string | undefined;
  let ciStatus: PRStatus = 'ci-pending';

  if (checkRes.ok) {
    const checks: { check_runs: Array<{ status: string; conclusion: string | null }> } =
      await checkRes.json();
    const runs = checks.check_runs;
    const allDone = runs.every((r) => r.status === 'completed');
    if (allDone && runs.length > 0) {
      const anyFailed = runs.some((r) => r.conclusion === 'failure' || r.conclusion === 'error');
      ciStatus = anyFailed ? 'ci-failed' : 'ci-success';
      ciState = ciStatus;
    }
  }

  // Check Vercel deployment (via deployments API)
  let previewUrl: string | undefined;
  const deployRes = await fetch(`${base}/deployments?ref=${commitSHA}&environment=Preview`, {
    headers,
  });
  if (deployRes.ok) {
    const deployments: Array<{ id: number }> = await deployRes.json();
    if (deployments.length > 0) {
      const statusRes = await fetch(`${base}/deployments/${deployments[0].id}/statuses`, { headers });
      if (statusRes.ok) {
        const statuses: Array<{ state: string; target_url: string }> = await statusRes.json();
        const latest = statuses[0];
        if (latest?.state === 'success' && latest.target_url) {
          previewUrl = latest.target_url;
          ciStatus = 'preview-ready';
        } else if (latest?.state === 'failure') {
          ciStatus = 'preview-failed';
        }
      }
    }
  }

  const mergeability: PRPollResult['mergeability'] =
    pr.mergeable === true ? 'mergeable' : pr.mergeable === false ? 'conflicting' : 'unknown';

  return {
    prNumber,
    status: ciStatus,
    mergeability,
    ciState,
    previewUrl,
    updatedAt: Date.now(),
  };
}
