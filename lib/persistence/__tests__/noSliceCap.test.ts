import * as fs from "fs";
import * as path from "path";

describe("no arbitrary outbox cap", () => {
  it("has no .slice(-200) remaining under expo/", () => {
    const root = path.resolve(__dirname, "../../..");
    const hits: string[] = [];

    function walk(dir: string) {
      for (const name of fs.readdirSync(dir)) {
        if (name === "node_modules" || name === ".git" || name === "coverage") continue;
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx|js|jsx)$/.test(name)) continue;
        // Skip this assertion file (it contains the needle as a string literal).
        if (full.endsWith(`${path.sep}noSliceCap.test.ts`)) continue;
        const text = fs.readFileSync(full, "utf8");
        if (text.includes(".slice(-200)")) {
          hits.push(path.relative(root, full));
        }
      }
    }

    walk(root);
    expect(hits).toEqual([]);
  });
});
