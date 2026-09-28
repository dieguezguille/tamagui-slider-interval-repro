import { spawn } from "node:child_process";

const cases =
  process.argv[2] === "export"
    ? [{ name: "expo export --platform web", command: ["expo", "export", "--platform", "web"], ready: "Exported:", grace: 30_000 }]
    : [
        { name: "require('tamagui')", command: ["node", "-e", "require('tamagui')"], grace: 5000 },
        { name: "import('tamagui')", command: ["node", "--input-type=module", "-e", "await import('tamagui')"], grace: 5000 },
      ];

for (const { name, command, ready, grace } of cases) {
  const start = performance.now();
  const child = spawn(command[0], command.slice(1), { detached: true, stdio: ["ignore", "pipe", "inherit"] });
  let finished;
  let timer = setTimeout(() => process.kill(-child.pid, "SIGKILL"), ready ? 300_000 : grace);
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    if (!ready || finished !== undefined || !chunk.toString().includes(ready)) return;
    finished = performance.now();
    clearTimeout(timer);
    timer = setTimeout(() => process.kill(-child.pid, "SIGKILL"), grace);
  });
  const code = await new Promise((resolve) => child.on("exit", (exit, signal) => resolve(exit ?? signal)));
  clearTimeout(timer);
  const elapsed = Math.round(performance.now() - start);
  if (code === "SIGKILL") {
    process.exitCode = 1;
    console.log(`HANG  ${name}: killed at ${elapsed} ms${finished ? `, ${Math.round(performance.now() - finished)} ms after "${ready}"` : ""}`);
  } else {
    console.log(`OK    ${name}: exited with code ${code} after ${elapsed} ms`);
  }
}
