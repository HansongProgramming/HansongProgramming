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
    if count < 3:  return 1
    if count < 6:  return 2
    if count < 10: return 3
    return 4

# matches the web app's green accent palette
CELL_COLORS = [
    "#ffffff08",           # 0 — empty
    "#a8ff7820",           # 1 — low
    "#a8ff7850",           # 2 — mid
    "#a8ff7888",           # 3 — high
    "#a8ff78",             # 4 — max
]

LANG_COLORS = {
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
    return LANG_COLORS.get(name, "#888888")

def build_svg(user, repos, calendar):
    total_commits = calendar["totalContributions"]
    total_stars   = sum(r.get("stargazers_count", 0) for r in repos)
    total_repos   = user.get("public_repos", 0)

    # language tally
    lang_map = defaultdict(int)
    for r in repos:
        if r.get("language"):
            lang_map[r["language"]] += 1
    top_langs  = sorted(lang_map.items(), key=lambda x: -x[1])[:4]
    total_lang = sum(v for _, v in top_langs) or 1
    langs      = [(name, round(count / total_lang * 100)) for name, count in top_langs]

    # commit grid (last 52 weeks × 7 days)
    weeks = calendar["weeks"][-52:]
    cells = []
    for week in weeks:
        for day in week["contributionDays"]:
            cells.append(level(day["contributionCount"]))

    # ── layout constants ──────────────────────────────────────
    W, H    = 820, 440
    PAD     = 32
    CELL    = 9
    GAP     = 3
    GRID_Y  = 148

    name_display = (user.get("name") or USERNAME)[:30]
    bio_display  = (user.get("bio") or f"@{USERNAME}")[:58]

    # ── 3D skewed commit grid ─────────────────────────────────
    grid_cells = ""
    for i, val in enumerate(cells):
        col = i // 7
        row = i % 7
        x   = col * (CELL + GAP)
        y   = row * (CELL + GAP)
        c   = CELL_COLORS[val]
        glow = ' filter="url(#cellglow)"' if val == 4 else ""
        grid_cells += f'<rect x="{x}" y="{y}" width="{CELL}" height="{CELL}" rx="2" fill="{c}"{glow}/>\n'

    # ── language bars ─────────────────────────────────────────
    BAR_Y   = 298
    BAR_X   = PAD
    BAR_W   = W - PAD * 2
    LABEL_W = 80
    PCT_W   = 36
    TRACK_W = BAR_W - LABEL_W - PCT_W - 8

    lang_svg = ""
    for i, (name, pct) in enumerate(langs):
        fill_w = max(4, int(TRACK_W * pct / 100))
        color  = lang_color(name)
        ty     = BAR_Y + i * 28
        lang_svg += f'''
  <text x="{BAR_X}" y="{ty}" fill="#888888" font-size="11" font-family="monospace">{name}</text>
  <rect x="{BAR_X + LABEL_W}" y="{ty - 11}" width="{TRACK_W}" height="6" rx="3" fill="#ffffff0a"/>
  <rect x="{BAR_X + LABEL_W}" y="{ty - 11}" width="{fill_w}" height="6" rx="3" fill="{color}" opacity="0.85"/>
  <text x="{BAR_X + LABEL_W + TRACK_W + 6}" y="{ty}" fill="#555555" font-size="11" font-family="monospace">{pct}%</text>'''

    # ── stat pills ────────────────────────────────────────────
    def pill(x, y, value, label, w=140):
        vlen = len(str(value)) * 9
        return f'''
  <rect x="{x}" y="{y}" width="{w}" height="32" rx="10"
        fill="#ffffff07" stroke="#ffffff12" stroke-width="1"/>
  <text x="{x + 14}" y="{y + 21}" fill="#a8ff78" font-size="15"
        font-family="monospace" font-weight="bold">{value}</text>
  <text x="{x + 14 + vlen + 4}" y="{y + 21}" fill="#444444" font-size="11"
        font-family="monospace">{label}</text>'''

    pills = (
        pill(PAD,        80, total_commits, "commits", 160) +
        pill(PAD + 170,  80, total_repos,   "repos",   130) +
        pill(PAD + 310,  80, total_stars,   "stars",   130)
    )

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs>
    <!-- glow filter for hot commit cells -->
    <filter id="cellglow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <!-- top accent gradient — same as web app -->
    <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#a8ff78" stop-opacity="0.9"/>
      <stop offset="60%"  stop-color="#78ffd6" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#78ffd6" stop-opacity="0"/>
    </linearGradient>
    <!-- subtle inner bg glow -->
    <radialGradient id="bgGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
                    gradientTransform="translate(0,0) scale(600,400)">
      <stop offset="0%"   stop-color="#00ff87" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#00ff87" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="cardClip"><rect width="{W}" height="{H}" rx="20"/></clipPath>
  </defs>

  <g clip-path="url(#cardClip)">
    <!-- base background — matches #080c10 web app bg -->
    <rect width="{W}" height="{H}" fill="#0d1117"/>
    <!-- soft green glow top-left corner -->
    <rect width="{W}" height="{H}" fill="url(#bgGlow)"/>
  </g>

  <!-- card border — matches --glass-border -->
  <rect width="{W}" height="{H}" rx="20" fill="none"
        stroke="#ffffff18" stroke-width="1"/>

  <!-- top accent line — matches web app ::before pseudo -->
  <rect x="0" y="0" width="{W}" height="2" rx="1" fill="url(#accentGrad)"/>

  <!-- username -->
  <text x="{PAD}" y="46" fill="#f0f0f0" font-size="22"
        font-family="monospace" font-weight="bold">{name_display}</text>

  <!-- bio / handle -->
  <text x="{PAD}" y="66" fill="#555555" font-size="12"
        font-family="monospace">{bio_display}</text>

  <!-- stat pills -->
  {pills}

  <!-- section label -->
  <text x="{PAD}" y="{GRID_Y - 12}" fill="#333333" font-size="10"
        font-family="monospace" letter-spacing="3">// contributions this year</text>

  <!-- 3D commit grid — skewY matches web app transform -->
  <g transform="translate({PAD},{GRID_Y}) skewY(-8) scaleY(0.88)">
    {grid_cells}
  </g>

  <!-- section label -->
  <text x="{PAD}" y="{BAR_Y - 16}" fill="#333333" font-size="10"
        font-family="monospace" letter-spacing="3">// top languages</text>

  {lang_svg}

  <!-- footer -->
  <text x="{W - PAD}" y="{H - 14}" fill="#2a2a2a" font-size="10"
        font-family="monospace" text-anchor="end">wrapped.dev · @{USERNAME}</text>
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
