// build.ts - fetch your data, render the card, write card.svg
import { writeFileSync } from "node:fs";
import { renderProfileCard } from "./engine.ts";
import { fetchGitHub, toProfileData } from "./fetch-github.ts";

// ---- edit these two lines to change the wording on the card ----
const CARD_TEXT = {
  intro: "Crafting 3D web, AR/VR & AI-powered tools.",
  title: "3D Developer",
  tech: "Three.js · WebGL · React",
};
// ---------------------------------------------------------------

// login + token come from the GitHub Action automatically (see the workflow)
const login = process.env.GH_LOGIN || process.env.GITHUB_REPOSITORY_OWNER;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

if (!login) throw new Error("Set GH_LOGIN (or run inside the Action).");
if (!token) throw new Error("Set GH_TOKEN to a GitHub token.");

const user = await fetchGitHub(login, token);
const { grid, data } = toProfileData(user, CARD_TEXT);

const svg = renderProfileCard(grid, data, {
  orientation: "skyline",   // "iso" | "skyline" | "angled" | "topdown"
  animStyle: "build",       // "build" | "wave" | "sweep" | "bounce" | "drop"
  animStagger: 0.016,
  animDuration: 0.4,
});

writeFileSync("card.svg", svg);
console.log(`card.svg updated for ${data.name} (@${data.handle})`);