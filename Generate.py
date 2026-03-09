import requests
import os
import json
from datetime import datetime, timedelta
from collections import defaultdict

USERNAME = "HansongProgramming"
TOKEN = os.environ.get("GH_TOKEN")

HEADERS = {
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github.v3+json"
}

# ── fetch user ──────────────────────────────────────────────
def fetch_user():
    r = requests.get(f"https://api.github.com/users/{USERNAME}", headers=HEADERS)
    return r.json()

# ── fetch repos ─────────────────────────────────────────────
def fetch_repos():
    repos = []
    page = 1
    while True:
        r = requests.get(
            f"https://api.github.com/user/repos?per_page=100&page={page}",
            headers=HEADERS
        )
        data = r.json()
        if not data: break
        repos.extend(data)
        page += 1
    return repos

# ── fetch contributions via graphql ─────────────────────────
def fetch_contributions():
    query = """
    query($username: String!) {
      user(login: $username) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }
    }
    """
    r = requests.post(
        "https://api.github.com/graphql",
        json={"query": query, "variables": {"username": USERNAME}},
        headers=HEADERS
    )
    data = r.json()
    calendar = data["data"]["user"]["contributionsCollection"]["contributionCalendar"]
    return calendar

# ── build svg ───────────────────────────────────────────────
def level(count):
    if count == 0: return 0
    if count < 3: return 1
    if count < 6: return 2
    if count < 10: return 3
    return 4

COLORS = ["#1a1f24", "#1e4620", "#2d6a2f", "#40a043", "#a8ff78"]
GLOW   = ["none", "none", "none", "0 0 4px #40a04388", "0 0 8px #a8ff7899"]

def build_svg(user, repos, calendar):
    total_commits = calendar["totalContributions"]
    total_stars   = sum(r.get("stargazers_count", 0) for r in repos)
    total_repos   = user.get("public_repos", 0)

    # language tally
    lang_map = defaultdict(int)
    for r in repos:
        if r.get("language"):
            lang_map[r["language"]] += 1
    top_langs = sorted(lang_map.items(), key=lambda x: -x[1])[:4]
    total_lang = sum(v for _, v in top_langs) or 1
    langs = [(name, round(count / total_lang * 100)) for name, count in top_langs]

    # commit grid data (last 52 weeks × 7 days)
    weeks = calendar["weeks"][-52:]
    cells = []
    for week in weeks:
        for day in week["contributionDays"]:
            cells.append(level(day["contributionCount"]))

    # ── SVG dimensions ──
    W, H = 800, 420
    PADDING = 28

    lang_colors = {
        "JavaScript": "#f7df1e",
        "TypeScript": "#3178c6",
        "Python":     "#3776ab",
        "CSS":        "#a8ff78",
        "HTML":       "#ff6b35",
        "Rust":       "#dea584",
        "Go":         "#00add8",
        "Java":       "#b07219",
    }

    def lang_color(name):
        return lang_colors.get(name, "#888888")

    # grid dimensions
    CELL = 9
    GAP  = 3
    GRID_W = 52 * (CELL + GAP)
    GRID_X = PADDING
    GRID_Y = 130

    # 3d transform via skew
    skew_str = f"translate({GRID_X},{GRID_Y}) skewY(-8) skewX(0) scaleY(0.85)"

    # build grid cells
    grid_cells = ""
    for i, val in enumerate(cells):
        col = i // 7
        row = i % 7
        x = col * (CELL + GAP)
        y = row * (CELL + GAP)
        color = COLORS[val]
        shadow = GLOW[val]
        extra = f'filter="url(#glow)"' if val == 4 else ""
        grid_cells += f'<rect x="{x}" y="{y}" width="{CELL}" height="{CELL}" rx="2" fill="{color}" {extra}/>\n'

    # lang bars
    lang_bar_svg = ""
    bar_y = 290
    bar_x = PADDING
    bar_w = W - PADDING * 2
    for i, (name, pct) in enumerate(langs):
        fill_w = int(bar_w * pct / 100)
        color  = lang_color(name)
        lang_bar_svg += f'''
        <text x="{bar_x}" y="{bar_y + i*28 - 2}" fill="#aaaaaa" font-size="10" font-family="monospace">{name}</text>
        <rect x="{bar_x + 72}" y="{bar_y + i*28 - 12}" width="{bar_w - 72 - 40}" height="6" rx="3" fill="#ffffff11"/>
        <rect x="{bar_x + 72}" y="{bar_y + i*28 - 12}" width="{fill_w - 72 - 40}" height="6" rx="3" fill="{color}"/>
        <text x="{bar_x + bar_w - 30}" y="{bar_y + i*28 - 2}" fill="#aaaaaa" font-size="10" font-family="monospace" text-anchor="end">{pct}%</text>
        '''

    name_display = user.get("name") or USERNAME
    bio_display  = (user.get("bio") or f"@{USERNAME}")[:55]

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="topbar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#a8ff78" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#78ffd6" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="card"><rect width="{W}" height="{H}" rx="18"/></clipPath>
  </defs>

  <!-- background -->
  <rect width="{W}" height="{H}" rx="18" fill="#0d1117"/>
  <rect width="{W}" height="{H}" rx="18" fill="url(#topbar)" opacity="0.04"/>

  <!-- top accent line -->
  <rect x="0" y="0" width="{W}" height="2" rx="1" fill="url(#topbar)"/>

  <!-- border -->
  <rect width="{W}" height="{H}" rx="18" fill="none" stroke="#ffffff18" stroke-width="1"/>

  <!-- user info -->
  <text x="{PADDING}" y="44" fill="#f0f0f0" font-size="20"
        font-family="monospace" font-weight="bold">{name_display}</text>
  <text x="{PADDING}" y="64" fill="#888888" font-size="12"
        font-family="monospace">{bio_display}</text>

  <!-- stats pills -->
  <rect x="{PADDING}" y="76" width="120" height="28" rx="8" fill="#ffffff08" stroke="#ffffff12" stroke-width="1"/>
  <text x="{PADDING + 12}" y="95" fill="#a8ff78" font-size="13" font-family="monospace" font-weight="bold">{total_commits}</text>
  <text x="{PADDING + 12 + len(str(total_commits))*8 + 4}" y="95" fill="#666666" font-size="11" font-family="monospace">commits</text>

  <rect x="{PADDING + 130}" y="76" width="100" height="28" rx="8" fill="#ffffff08" stroke="#ffffff12" stroke-width="1"/>
  <text x="{PADDING + 142}" y="95" fill="#a8ff78" font-size="13" font-family="monospace" font-weight="bold">{total_repos}</text>
  <text x="{PADDING + 142 + len(str(total_repos))*8 + 4}" y="95" fill="#666666" font-size="11" font-family="monospace">repos</text>

  <rect x="{PADDING + 240}" y="76" width="100" height="28" rx="8" fill="#ffffff08" stroke="#ffffff12" stroke-width="1"/>
  <text x="{PADDING + 252}" y="95" fill="#a8ff78" font-size="13" font-family="monospace" font-weight="bold">{total_stars}</text>
  <text x="{PADDING + 252 + len(str(total_stars))*8 + 4}" y="95" fill="#666666" font-size="11" font-family="monospace">stars</text>

  <!-- section label -->
  <text x="{PADDING}" y="{GRID_Y - 10}" fill="#444444" font-size="10"
        font-family="monospace" letter-spacing="2">// contributions</text>

  <!-- 3d commit grid -->
  <g transform="{skew_str}">
    {grid_cells}
  </g>

  <!-- lang section label -->
  <text x="{PADDING}" y="{290 - 16}" fill="#444444" font-size="10"
        font-family="monospace" letter-spacing="2">// top languages</text>

  {lang_bar_svg}

  <!-- footer -->
  <text x="{W - PADDING}" y="{H - 14}" fill="#333333" font-size="10"
        font-family="monospace" text-anchor="end">generated by wrapped.dev</text>
</svg>'''

    return svg


if __name__ == "__main__":
    print("Fetching data for", USERNAME)
    user   = fetch_user()
    repos  = fetch_repos()
    cal    = fetch_contributions()
    svg    = build_svg(user, repos, cal)

    with open("metrics.svg", "w") as f:
        f.write(svg)

    print("✓ metrics.svg generated")
