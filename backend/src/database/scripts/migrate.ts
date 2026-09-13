import { appDataSource } from '../data-source.js';

const commands = ['run', 'revert', 'show'] as const;
type Command = (typeof commands)[number];

const command = process.argv[2];

function isCommand(value: string | undefined): value is Command {
  return commands.some((candidate) => candidate === value);
}

async function getLastExecutedMigrationName(): Promise<string | undefined> {
  const rows: unknown[] = await appDataSource.query(
    'SELECT "name" FROM "migrations" ORDER BY "id" DESC LIMIT 1',
  );
  const last = rows[0] as { name?: string } | undefined;
  return last?.name;
}

if (!isCommand(command)) {
  console.error('Usage: npm run migration:<run|revert|show>');
  process.exitCode = 1;
} else {
  await appDataSource.initialize();
  try {
    if (command === 'run') {
      const executed = await appDataSource.runMigrations();
      if (executed.length === 0) {
        console.log('No pending migrations to run.');
      } else {
        for (const migration of executed) {
          console.log(`Migration executed: ${migration.name} (${migration.timestamp})`);
        }
      }
    } else if (command === 'revert') {
      const lastExecuted = await getLastExecutedMigrationName();
      if (lastExecuted === undefined) {
        console.log('Nothing to revert.');
      } else {
        await appDataSource.undoLastMigration();
        console.log(`Migration reverted: ${lastExecuted}`);
      }
    } else {
      const hasPending = await appDataSource.showMigrations();
      console.log(
        hasPending
          ? 'There are pending migrations to run.'
          : 'No pending migrations. Database up to date.',
      );
    }
  } finally {
    await appDataSource.destroy();
  }
}
