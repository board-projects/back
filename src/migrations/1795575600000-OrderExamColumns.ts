import type { MigrationInterface, QueryRunner } from 'typeorm';
import { Exam } from '../exam/entities/exam.entity';

const auditColumns = {
  createdBy: 'created_by',
  updatedBy: 'updated_by',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  isActive: 'is_active',
};

const publicationColumns = {
  visibility: 'visibility',
  topic: 'topic',
  level: 'level',
  locale: 'locale',
  publishedAt: 'published_at',
  opensAt: 'opens_at',
  closesAt: 'closes_at',
  durationMinutes: 'duration_minutes',
  searchPending: 'search_pending',
};

async function moveColumnsToEnd(runner: QueryRunner, columns: Record<string, string>) {
  if (!runner.isTransactionActive) throw new Error('Reordering tests requires a transaction');

  const table = await runner.getTable('tests');
  if (!table || table.columns[0]?.name !== 'id') throw new Error('Unexpected tests table structure');

  const names = Object.values(columns);
  if (table.columns.slice(-names.length).every((column, index) => column.name === names[index])) return;
  const originals = names.map((name) => {
    const column = table.findColumnByName(name);
    if (!column) throw new Error(`Missing tests column: ${name}`);
    return column.clone();
  });

  const touches = (namesToCheck: string[]) => namesToCheck.some((name) => names.includes(name));
  const foreignKeys = table.foreignKeys.filter((key) => touches(key.columnNames)).map((key) => key.clone());
  const indexes = table.indices.filter((index) => touches(index.columnNames) ||
    names.some((name) => index.where?.includes(`"${name}"`))).map((index) => index.clone());

  await runner.dropForeignKeys('tests', foreignKeys);
  await runner.dropIndices('tests', indexes);
  for (const name of names) await runner.renameColumn('tests', name, `reorder_${name}`);

  await runner.addColumns('tests', originals.map((column) => {
    const copy = column.clone();
    copy.isNullable = true;
    copy.default = undefined;
    return copy;
  }));

  await runner.manager.createQueryBuilder().update(Exam).set(Object.fromEntries(
    Object.entries(columns).map(([property, name]) => [property, () => `"reorder_${name}"`]),
  )).execute();

  for (const column of originals) await runner.changeColumn('tests', column.name, column);
  await runner.dropColumns('tests', names.map((name) => `reorder_${name}`));
  await runner.createForeignKeys('tests', foreignKeys);
  await runner.createIndices('tests', indexes);
}

export class OrderExamColumns1795575600000 implements MigrationInterface {
  up(runner: QueryRunner): Promise<void> {
    return moveColumnsToEnd(runner, auditColumns);
  }

  down(runner: QueryRunner): Promise<void> {
    return moveColumnsToEnd(runner, publicationColumns);
  }
}
