import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";

execSync("node scripts/build.mjs", { stdio: "inherit" });

const { version } = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
const zipPath = `release/mitid-auto-authenticator-${version}.zip`;

mkdirSync("release", { recursive: true });
rmSync(zipPath, { force: true });
execSync(`tar -a -c -f ${zipPath} -C dist .`, { stdio: "inherit" });
console.log(`Packaged ${zipPath}`);
