/**
 * Octokit client factory — Phase 5 §4.6
 *
 * v6.1 fixes (May 2026):
 *   FIX-O1 — `ensureBranch` was destructive: on every call it issued
 *            `updateRef` with the latest default-branch SHA, which silently
 *            reset the AI feature branch back to base, deleting all prior
 *            AI commits and breaking PRD §1.7's "subsequent prompts amend
 *            the same PR" promise. The new behavior creates the branch
 *            from baseSHA when it doesn't exist, and leaves an existing
 *            branch alone so commits accumulate.
 *   FIX-O2 — Added `commitTreeChangeSet` which writes N file changes in a
 *            single commit via the git data API (blobs → tree → commit →
 *            update ref). The old per-file `createOrUpdateFileContents`
 *            loop produced one commit per file, exploding history and
 *            making PR review painful for any change set touching more
 *            than one or two files.
 *   FIX-O3 — `getFileSHA` now reads from the AI branch directly, not from
 *            the default branch. Previously, when a file existed on main
 *            but the AI branch had already modified it (later prompt in
 *            same chat), the SHA on default branch was stale and the
 *            commit silently failed with 409.
 *   FIX-O4 — Octokit singleton no longer trusts a non-existent length
 *            heuristic comment. Token comparison is strict equality.
 *            (The comment is gone; the behavior is unchanged but clearer.)
 */

import { Octokit } from '@octokit/rest';

let _octokit: Octokit | null = null;
let _octokitToken: string | null = null;

/**
 * Get or create the Octokit singleton for the given token.
 * Recreates the instance when the token changes.
 */
export function getOctokit(token: string): Octokit {
  if (_octokit && _octokitToken === token) return _octokit;
  _octokit = new Octokit({ auth: token });
  _octokitToken = token;
  return _octokit;
}

/** Reset the cached instance (e.g. on token deletion) */
export function resetOctokit(): void {
  _octokit = null;
  _octokitToken = null;
}

/**
 * Verify that the token is valid and return the GitHub login.
 * Throws on invalid token.
 */
export async function verifyGitHubToken(
  token: string
): Promise<{ login: string; name: string | null; avatar_url: string }> {
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
 * Ensure a branch exists. If it doesn't, create it from `baseSHA`.
 *
 * FIX-O1 — Does NOT reset an existing branch back to baseSHA. The previous
 * implementation called updateRef on every push, which discarded prior AI
 * commits. PRD §1.7 explicitly requires that subsequent prompts in the
 * same chat amend the same branch + PR, so we leave existing branches alone.
 */
export async function ensureBranch(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  baseSHA: string
): Promise<{ created: boolean; existed: boolean }> {
  const octokit = getOctokit(token);
  try {
    await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
    return { created: false, existed: true };
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branch}`,
        sha: baseSHA,
      });
      return { created: true, existed: false };
    }
    throw err;
  }
}

/**
 * Get the blob SHA for a file on a given branch.
 * Returns null if the file doesn't exist yet (new file).
 * FIX-O3 — reads from the branch passed in, not from default.
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
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });
    if (Array.isArray(data)) return null; // path is a directory
    if ('sha' in data) return data.sha;
    return null;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 404) return null;
    throw err;
  }
}

export interface TreeFileChange {
  path: string;
  /** When undefined, the file is treated as a deletion. */
  content?: string;
}

/**
 * FIX-O2 — Write an entire change set as a single commit on `branch`.
 *
 * Why: GitHub's `repos.createOrUpdateFileContents` makes one commit per file.
 * A 10-file change becomes 10 commits, which is ugly in the PR timeline and
 * wastes API budget. The git data API lets us batch into one commit.
 *
 * Flow:
 *   1. read the branch HEAD (commit + tree)
 *   2. create a blob for each new/changed file
 *   3. build a new tree on top of the existing tree
 *   4. create a commit pointing at the new tree, parented to HEAD
 *   5. fast-forward the branch ref to the new commit
 *
 * Returns the new commit SHA.
 */
export async function commitTreeChangeSet(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  changes: TreeFileChange[],
  message: string
): Promise<{ commitSha: string; treeSha: string }> {
  if (changes.length === 0) {
    throw new Error('commitTreeChangeSet called with empty changes');
  }
  const octokit = getOctokit(token);

  // 1. Branch HEAD
  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const headCommitSha = refData.object.sha;
  const { data: headCommit } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: headCommitSha,
  });
  const baseTreeSha = headCommit.tree.sha;

  // 2. Blobs (one network call per file — parallelized)
  const treeEntries = await Promise.all(
    changes.map(async (change) => {
      if (change.content === undefined) {
        // Deletion marker (sha:null tells git to remove the path from the tree)
        return {
          path: change.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: null as unknown as string, // Octokit types reject `null` but the API accepts it for deletes
        };
      }
      const { data: blob } = await octokit.git.createBlob({
        owner,
        repo,
        content: change.content,
        encoding: 'utf-8',
      });
      return {
        path: change.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blob.sha,
      };
    })
  );

  // 3. New tree (base_tree means: keep all other files unchanged)
  const { data: newTree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeEntries,
  });

  // 4. Commit
  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message,
    tree: newTree.sha,
    parents: [headCommitSha],
  });

  // 5. Update branch ref. `force: false` keeps us safe — if the branch
  //    moved under us between steps 1 and 5 (concurrent push), the API
  //    rejects with 422 and the caller can retry.
  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: newCommit.sha,
    force: false,
  });

  return { commitSha: newCommit.sha, treeSha: newTree.sha };
}
