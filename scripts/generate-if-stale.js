/**
 * Run `prisma generate` only when the schema has changed since the client was
 * last generated from it.
 *
 * Why this exists: `prisma generate` writes the query engine to a temp file and
 * renames it over the real one. Windows refuses that rename while a process has
 * the DLL open, so `npm run build` fails with EPERM whenever the dev server is
 * running — even though, nine times out of ten, the schema hasn't changed and
 * there was nothing to regenerate.
 *
 * Freshness is decided on modification time, not file contents: Prisma
 * reformats the schema when it copies it next to the client (it re-aligns the
 * columns), so the two files never match as text even when nothing has changed.
 *
 * On a fresh checkout or CI box there is no generated client, so this always
 * runs the real generate. It only skips when the client is provably newer than
 * the schema, and when the schema HAS changed it says plainly what to stop.
 *
 * `npm run build:force` bypasses this entirely.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const schema = path.join(root, 'prisma', 'schema.prisma');
const generatedSchema = path.join(
  root,
  'node_modules',
  '.prisma',
  'client',
  'schema.prisma',
);

// A string command, so no shell-escaping of arguments is involved.
const generate = () =>
  execSync('npx prisma generate', { cwd: root, stdio: 'inherit' });

const upToDate =
  fs.existsSync(generatedSchema) &&
  fs.statSync(generatedSchema).mtimeMs >= fs.statSync(schema).mtimeMs;

if (upToDate) {
  console.log(
    'Prisma client is newer than the schema — skipping generate. ' +
      '(npm run build:force to regenerate anyway.)',
  );
  process.exit(0);
}

try {
  generate();
} catch (error) {
  const engineLocked =
    process.platform === 'win32' &&
    /EPERM|EBUSY/i.test(`${error.stdout ?? ''}${error.message ?? ''}`);

  if (engineLocked) {
    console.error(
      '\nThe schema changed, but the Prisma query engine is open by a running ' +
        'process. Stop the backend (npm run start:dev, or the dist/src/main ' +
        'process) and run the build again.',
    );
  }
  process.exit(1);
}
