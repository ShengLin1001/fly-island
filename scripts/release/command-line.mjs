// release.mjs runs commands through the Windows shell, so `pnpm` finds pnpm.cmd.
// Node deprecates passing an argument list together with `shell` (DEP0190): the
// arguments were only joined with spaces, so one with a space split in two. This
// builds the one command line instead, quoting what needs it.

/** One argument for the command line: as it is when plain, else in double quotes. */
export function quoteArg(arg) {
  if (/^[\w@%+=:,./\\-]+$/.test(arg)) return arg;
  if (arg.includes('"')) throw new Error(`An argument with a double quote cannot go through the shell: ${arg}`);
  return `"${arg}"`;
}

export function commandLine(command, args) {
  return [command, ...args].map(quoteArg).join(" ");
}
