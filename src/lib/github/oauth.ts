export interface GitHubRepo {
  id: number;
  full_name: string;
  owner: string;
  name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  updated_at: string;
  language: string | null;
  stargazers_count: number;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_API = 'https://api.github.com';

export function buildOAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo,read:user',
    state: crypto.randomUUID(),
  });
  return `${GITHUB_AUTH_URL}?${params}`;
}

export async function fetchUserRepos(token: string): Promise<GitHubRepo[]> {
  const res = await fetch(`${GITHUB_API}/user/repos?per_page=100&sort=updated&type=all`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data: Array<{
    id: number;
    full_name: string;
    owner: { login: string };
    name: string;
    description: string | null;
    private: boolean;
    default_branch: string;
    updated_at: string;
    language: string | null;
    stargazers_count: number;
  }> = await res.json();

  return data.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    owner: r.owner.login,
    name: r.name,
    description: r.description,
    private: r.private,
    default_branch: r.default_branch,
    updated_at: r.updated_at,
    language: r.language,
    stargazers_count: r.stargazers_count,
  }));
}

export async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = await res.json();
  return { login: data.login, name: data.name, avatar_url: data.avatar_url };
}

export function parseOwnerRepo(repoUrl: string): { owner: string; repo: string } | null {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/\s?#]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}
