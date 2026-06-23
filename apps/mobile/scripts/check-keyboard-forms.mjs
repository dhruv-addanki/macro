import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const appRoot = resolve(process.cwd(), "app");
const failures = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }
    if (extname(path) !== ".tsx") continue;

    const source = await readFile(path, "utf8");
    const label = relative(process.cwd(), path);
    if (source.includes("<TextInput")) {
      failures.push(`${label}: use FormTextInput instead of raw TextInput`);
    }
    const hasKeyboardSafeContainer =
      source.includes("<KeyboardAwareScrollView") ||
      (source.includes("<TabScreen") && source.includes("keyboardAware"));
    if (source.includes("<FormTextInput") && !hasKeyboardSafeContainer) {
      failures.push(`${label}: FormTextInput must be inside a keyboard-safe screen`);
    }
  }
}

await visit(appRoot);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Keyboard-safe form invariant passed.");
