import { execSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
execSync("tsc -p tsconfig.json", { stdio: "inherit" });
cpSync("static", "dist", { recursive: true });
