import { runMacroEvals } from "./runner";

const report = await runMacroEvals();

if (report.failures.length > 0) {
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(report, null, 2));
}
