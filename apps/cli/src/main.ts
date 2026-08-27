import { runCli } from "./run";

const code = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  writeOut: (s) => {
    process.stdout.write(s);
  },
  writeErr: (s) => {
    process.stderr.write(s);
  },
});

process.exit(code);
