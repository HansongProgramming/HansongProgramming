// fetch-github.ts
// Pulls your real data from GitHub's GraphQL API and shapes it for the card.
// Split in two: fetchGitHub() does the network call; toProfileData() is pure
// (no network) so it's easy to test.

import type { ProfileData, Lang } from "./engine.ts";

// nicer, more vibrant colours for common languages (falls back to GitHub's own colour)
const COLOR: Record<string, string> = {
  TypeScript: "#3b82f6", JavaScript: "#f59e0b", Python: "#14b8a6",
  "C#": "#8b5cf6", "C++": "#f472b6", C: "#93c5fd", HTML: "#ef4444",
  CSS: "#06b6d4", Java: "#f97316", Go: "#22d3ee", Rust: "#fb923c",
  Shell: "#a3e635", Vue: "#42b883", Dart: "#38bdf8", Kotlin: "#a78bfa",
};
const SHORT: Record<string, string> = {
  TypeScript: "TS", JavaScript: "JS", Python: "PY", "C#": "C#", "C++": "C++",
  HTML: "HT", CSS: "CS", Java: "JV", Go: "GO", Rust: "RS", Shell: "SH",
  Vue: "VU", Dart: "DA", Kotlin: "KT", C: "C",
};

interface Day { date: string; weekday: number; contributionCount: number; }
export interface RawUser {
  name: string | null;
  login: string;
  location: string | null;
  contributionsCollection: {
    contributionCalendar: { totalContributions: number; weeks: { contributionDays: Day[] }[] };
  };
  repositories: { totalCount: number; nodes: { languages: { edges: { size: number; node: { name: string; color: string | null } }[] } }[] };
}

const QUERY = `query($login:String!){
  user(login:$login){
    name login location
    contributionsCollection{
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ date weekday contributionCount } }
      }
    }
    repositories(first:100, ownerAffiliations:OWNER, isFork:false, orderBy:{field:PUSHED_AT,direction:DESC}){
      totalCount
      nodes{ languages(first:10, orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name color } } } }
    }
  }
}`;

export async function fetchGitHub(login: string, token: string): Promise<RawUser> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": login,
    },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error("GraphQL error: " + JSON.stringify(json.errors));
  if (!json.data?.user) throw new Error(`No user found for "${login}"`);
  return json.data.user as RawUser;
}

// personal text that isn't in the API - edit these to taste
export interface CardText { intro?: string; title?: string; tech?: string; }

export function toProfileData(user: RawUser, text: CardText = {}): { grid: number[][]; data: ProfileData } {
  const weeks = user.contributionsCollection.contributionCalendar.weeks;
  const cols = weeks.length;

  // grid[weekday 0..6][week] = count
  const grid: number[][] = Array.from({ length: 7 }, () => Array.from({ length: cols }, () => 0));
  weeks.forEach((w, c) => w.contributionDays.forEach((d) => { grid[d.weekday][c] = d.contributionCount; }));

  // streaks (from a chronological list of days)
  const days = weeks.flatMap((w) => w.contributionDays).sort((a, b) => (a.date < b.date ? -1 : 1));
  let longest = 0, run = 0;
  for (const d of days) { if (d.contributionCount > 0) { run++; longest = Math.max(longest, run); } else run = 0; }
  let cur = 0, i = days.length - 1;
  if (i >= 0 && days[i].contributionCount === 0) i--; // don't let an empty "today" break the streak
  for (; i >= 0; i--) { if (days[i].contributionCount > 0) cur++; else break; }

  // languages (aggregate bytes across repos)
  const sizes = new Map<string, { size: number; color: string | null }>();
  for (const repo of user.repositories.nodes)
    for (const e of repo.languages.edges) {
      const prev = sizes.get(e.node.name) ?? { size: 0, color: e.node.color };
      prev.size += e.size;
      sizes.set(e.node.name, prev);
    }
  const sorted = [...sizes.entries()].sort((a, b) => b[1].size - a[1].size);
  const totalSize = sorted.reduce((a, [, v]) => a + v.size, 0) || 1;
  const topN = 5;
  const langs: Lang[] = sorted.slice(0, topN - 1).map(([name, v]) => ({
    name, pct: Math.round((v.size / totalSize) * 100),
    color: COLOR[name] ?? v.color ?? "#94a3b8", short: SHORT[name],
  }));
  const rest = sorted.slice(topN - 1);
  if (rest.length) {
    const restSize = rest.reduce((a, [, v]) => a + v.size, 0);
    langs.push({ name: "Other", pct: Math.round((restSize / totalSize) * 100), color: "#94a3b8", short: "•" });
  }

  const total = user.contributionsCollection.contributionCalendar.totalContributions;
  const data: ProfileData = {
    name: user.name || user.login,
    handle: user.login,
    location: user.location || undefined,
    intro: text.intro,
    title: text.title ?? "3D Developer",
    tech: text.tech,
    stats: [
      { label: "Contributions", value: total.toLocaleString("en-US") },
      { label: "Current streak", value: String(cur) },
      { label: "Longest streak", value: String(longest) },
      { label: "Repos", value: String(user.repositories.totalCount) },
    ],
    langs,
  };
  return { grid, data };
}