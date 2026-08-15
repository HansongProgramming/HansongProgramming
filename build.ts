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
  animStagger: 0.007,       // gap between neighbouring bars
  animDuration: 0.28,       // how long one bar takes to appear (and to vanish)
  animLoop: true,           // appear -> hold -> vanish -> repeat
  animHold: 1.1,            // seconds the finished city stays up
  animGap: 0.45,            // empty beat before it rebuilds
});

writeFileSync("card.svg", svg);
console.log(`card.svg updated for ${data.name} (@${data.handle})`);