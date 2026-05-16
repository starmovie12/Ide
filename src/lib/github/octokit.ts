/**
 * Octokit client factory — Phase 5 §4.6
 * Creates an authenticated Octokit instance from a stored GitHub token.
 * Handles both OAuth tokens and Personal Access Tokens.
 */

import { Octokit } from '@octokit/rest';

let _octokit: Octokit | null = null;

/**
 * Get or create the Octokit singleton for the given token.
 * Recreates the instance when the token changes.
 */
export function getOctokit(token: string): Octokit {
  // Simple singleton — recreate only if token changed (length heuristic)
  if (_octokit && ((_octokit as unknown as { _token?: string })._token === token)) {
    return _octokit;
  }
  _octokit = new Octokit({ auth: token });
  (_octokit as unknown as { _token?: string })._token = token;
  return _octokit;
}

/** Reset the cached instance (e.g. on token deletion) */
export function resetOctokit(): void {
  _octokit = null;
}

/**
 * Verify that the token is valid and return the GitHub login.
 * Throws on invalid token.
 */
export async function verifyGitHubToken(token: string): Promise<{ login: string; name: string | null; avatar_url: string }> {
  const octokit = getOctokit(token);
  const { data } = await octokit.users.getAuthenticated();
  return {
    login: data.login,
    name: data.name ?? null,
    avatar_url: data.avatar_url,
  };
}

/**
 * Get the HEAD SHA of the default (or specified) branch.
 */
export async function getBranchSHA(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<string> {
  const octokit = getOctokit(token);
  const { data } = await octokit.repos.getBranch({ owner, repo, branch });
  return data.commit.sha;
}

/**
 * Ensure a branch exists, creating it from baseSHA if not.
 */
export async function ensureBranch(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  baseSHA: string
): Promise<void> {
  const octokit = getOctokit(token);
  try {
    await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
    // Branch exists — update to baseSHA if behind
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: baseSHA,
      force: false,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      // Create branch
      await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branch}`,
        sha: baseSHA,
      });
    } else {
      throw err;
    }
  }
}

/**
 * Get the blob SHA for a file on a given branch.
 * Returns null if the file doesn't exist yet (new file).
 */
export async function getFileSHA(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<string | null> {
  const octokit = getOctokit(token);
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref: branch });
    if ('sha' in data) return data.sha;
    return null;
  } catch {
    return null;
  }
}
