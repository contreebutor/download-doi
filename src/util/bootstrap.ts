/**
 * Silences the `ExperimentalWarning` that node:sqlite emits on load.
 * Imported first by the CLI and server entrypoints; every other warning
 * still reaches the default handler.
 */
const originalEmitWarning = process.emitWarning.bind(process);

type EmitWarning = typeof process.emitWarning;

const patched = ((warning: string | Error, ...rest: unknown[]) => {
  const name = typeof warning === 'string' ? rest[0] : warning.name;
  const text = typeof warning === 'string' ? warning : warning.message;
  if (name === 'ExperimentalWarning' && text.includes('SQLite')) return;
  return (originalEmitWarning as (...args: unknown[]) => void)(warning, ...rest);
}) as EmitWarning;

process.emitWarning = patched;
