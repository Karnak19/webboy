import { cp } from "node:fs/promises";

const out = await Bun.build({
  entrypoints: ["src/background/main.ts", "src/panel/main.tsx"],
  outdir: "dist",
  target: "browser",
});
if (!out.success) {
  console.error(out.logs);
  process.exit(1);
}

await cp("src/panel/index.html", "dist/panel/index.html");
await cp("src/panel/styles.css", "dist/panel/styles.css");
await cp("manifest.json", "dist/manifest.json");
await cp("public/icons", "dist/icons", { recursive: true });

console.log("✓ build → dist/");
