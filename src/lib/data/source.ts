import type { CatalogModel } from '../catalog/types.ts';
import { type ChildOf, fakeChildrenOf, syncTotals } from './children.ts';
import { isLineModel, settleLine, withTotals } from './derived.ts';
import {
  fakeId,
  fakeRecords,
  type ModelRecord,
  SAMPLE_ROW_COUNTS,
} from './fakes.ts';

export type { ModelRecord } from './fakes.ts';

/**
 * Where the generated views read and write rows. Everything is async so the
 * in-memory fakes here can later be swapped for live s-m-r-t collections
 * without touching a view.
 */
/**
 * The id of an earlier write in the same {@link DataSource.apply}, by alias; or,
 * with `field`, that row's value of that field (a Customer's `profileId`).
 */
export interface RecordRef {
  ref: string;
  field?: string;
}

/** A plain JSON object, e.g. an Address; never a {@link RecordRef}. */
export type JsonObject = { readonly [key: string]: unknown };

export type WriteValue =
  | string
  | number
  | boolean
  | null
  | RecordRef
  | JsonObject;

export function isRecordRef(value: unknown): value is RecordRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RecordRef).ref === 'string'
  );
}

/**
 * One step of a multi-model save. `save` updates the row `id`; without an `id`
 * it finds the row whose fields equal `match` (creating it from `match`,
 * `onCreate` and `values` when none does), and without either it creates one. `delete`
 * removes the row `id`, or every row equal to `match`.
 */
export type RecordWrite =
  | {
      op: 'save';
      /** Names the written row so a later step can `{ref}` its id. */
      as?: string;
      model: CatalogModel;
      id?: string;
      match?: Record<string, WriteValue>;
      values?: Record<string, WriteValue>;
      /** Extra values applied only when the row is created, not when found. */
      onCreate?: Record<string, WriteValue>;
    }
  | {
      op: 'delete';
      model: CatalogModel;
      id?: string;
      match?: Record<string, WriteValue>;
    };

export interface DataSource {
  list(model: CatalogModel): Promise<ModelRecord[]>;
  get(model: CatalogModel, id: string): Promise<ModelRecord | undefined>;
  create(
    model: CatalogModel,
    values: Record<string, unknown>,
  ): Promise<ModelRecord>;
  update(
    model: CatalogModel,
    id: string,
    values: Record<string, unknown>,
  ): Promise<ModelRecord | undefined>;
  delete(model: CatalogModel, id: string): Promise<boolean>;
  /**
   * Related multi-model saves, all or nothing: the steps run in order and if
   * one fails (an unknown `{ref}`, a missing row to update) none is kept.
   * Returns the rows written, by alias.
   */
  apply(writes: readonly RecordWrite[]): Promise<Record<string, ModelRecord>>;
  /** Forget every row and stored copy; the next read starts from the samples. */
  reset?(): void;
}

/** Prefix of the localStorage keys rows are kept under, one per model. */
export const DATA_STORAGE_PREFIX = 'smrt-planner:data:v1:';
const CREATED_KEY = `${DATA_STORAGE_PREFIX}_created`;

/** Remove every stored row. Never throws. */
export function clearStoredData(storage: Storage | null | undefined): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(DATA_STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Storage may be unavailable; there is nothing to clear then.
  }
}

export interface MemoryDataSourceOptions {
  /** Seed for the sample data; the same seed gives the same rows. */
  seed?: number;
  /** Rows generated per model on first read. */
  rowsPerModel?: number;
  /**
   * Values every row of a model carries whatever the form shows, e.g. the
   * `contractType` discriminator of a model in a shared table. Read each time
   * a row is read or created, so it follows the current recipe options.
   */
  defaults?: (model: CatalogModel) => Record<string, unknown>;
  /**
   * Qualified model names that start empty instead of with sample rows:
   * models whose rows only make sense under a parent a form creates (SKUs,
   * stock), where random rows would point at nothing.
   */
  empty?: readonly string[];
  /**
   * Parent-to-children wiring. With it, every sample parent comes with one to
   * four child rows (line items, allocations, entries) whose foreign key is
   * the parent's id, so an open record's child tables are not empty. `links`
   * is the helper the record view uses (`childLinks`); `models` is what to
   * scan for parents of a child.
   */
  children?: {
    models: readonly CatalogModel[];
    links: (modelId: string) => ChildOf[];
  };
  /**
   * Where rows are kept between visits (a model's rows under one versioned
   * key). Without it the rows live in memory only. Edits to a model and the
   * models it owns or belongs to are saved together, so a parent and its
   * line items are never out of step.
   */
  storage?: Storage | null;
}

/** Deterministic seeded fakes held in memory, lazily per model. */
export function createMemoryDataSource(
  options: MemoryDataSourceOptions = {},
): DataSource {
  const seed = options.seed ?? 1;
  const rows = options.rowsPerModel ?? 8;
  const empty = new Set(options.empty ?? []);
  const tables = new Map<string, ModelRecord[]>();
  const storage = options.storage ?? null;
  const storedKey = (model: CatalogModel) =>
    `${DATA_STORAGE_PREFIX}${model.id}`;
  const readStored = (model: CatalogModel): ModelRecord[] | undefined => {
    if (!storage) return undefined;
    try {
      const raw = storage.getItem(storedKey(model));
      if (raw === null) return undefined;
      const parsed: unknown = JSON.parse(raw);
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (r) =>
            typeof r === 'object' && r !== null && typeof r.id === 'string',
        )
      ) {
        return parsed as ModelRecord[];
      }
    } catch {
      // Unreadable: fall back to the samples; the next write replaces it.
    }
    return undefined;
  };
  let created = 0;
  if (storage) {
    try {
      created = Number(storage.getItem(CREATED_KEY)) || 0;
    } catch {
      created = 0;
    }
  }

  // Parent-to-children wiring, indexed both ways on first use.
  const links = new Map<string, ChildOf[]>();
  const linksOf = (id: string): ChildOf[] => {
    let found = links.get(id);
    if (!found) {
      found = options.children?.links(id) ?? [];
      links.set(id, found);
    }
    return found;
  };
  let owners: Map<string, { parent: CatalogModel; fk: string }[]> | undefined;
  const ownersOf = (id: string) => {
    if (!owners) {
      owners = new Map();
      for (const parent of options.children?.models ?? []) {
        for (const link of linksOf(parent.id)) {
          const list = owners.get(link.model.id) ?? [];
          list.push({ parent, fk: link.fk });
          owners.set(link.model.id, list);
        }
      }
      // A child pointing at several kinds of parent (a JournalEntry at a
      // Journal and an Account) is generated under one key only: the one its
      // name starts with, else the first. Its other keys already hold ids of
      // real sample rows.
      for (const [id, list] of owners) {
        const name = id.slice(id.lastIndexOf(':') + 1).toLowerCase();
        const main =
          list.find((o) =>
            name.startsWith(o.fk.replace(/Id$/, '').toLowerCase()),
          )?.fk ?? list[0]?.fk;
        owners.set(
          id,
          list.filter((o) => o.fk === main),
        );
      }
    }
    return owners.get(id) ?? [];
  };

  const table = (model: CatalogModel): ModelRecord[] => {
    const existing = tables.get(model.id);
    if (existing) return existing;
    const stored = readStored(model);
    if (stored) {
      tables.set(model.id, stored);
      for (const link of linksOf(model.id)) table(link.model);
      return stored;
    }
    const owned = ownersOf(model.id);
    // A child's rows come from its parents, never from random fakes.
    const made: ModelRecord[] =
      empty.has(model.id) || owned.length
        ? []
        : fakeRecords(model, SAMPLE_ROW_COUNTS[model.id] ?? rows, seed);
    // Registered before the other side is built so each finds this table.
    tables.set(model.id, made);
    for (const link of linksOf(model.id)) table(link.model);
    if (!empty.has(model.id)) {
      for (const { parent, fk } of owned) {
        for (const row of table(parent)) {
          const items = fakeChildrenOf(model, fk, row, seed);
          made.push(...items);
          syncTotals(row, parent, items);
        }
      }
    }
    return made;
  };

  /** Save the model and the tables it is built together with. */
  const persist = (model: CatalogModel) => {
    if (!storage) return;
    const family = [
      model,
      ...linksOf(model.id).map((l) => l.model),
      ...ownersOf(model.id).map((o) => o.parent),
    ];
    try {
      for (const member of family) {
        const rows = tables.get(member.id);
        if (rows) storage.setItem(storedKey(member), JSON.stringify(rows));
      }
      storage.setItem(CREATED_KEY, String(created));
    } catch {
      // Quota or private mode: the rows stay in memory for this visit.
    }
  };

  /** A parent's line items, by its id. */
  const lineLink = (parent: CatalogModel) =>
    linksOf(parent.id).find((l) => isLineModel(l.model));

  /** Recompute a parent's totals from its lines (they are never typed in). */
  const resync = (parent: CatalogModel, parentId: unknown) => {
    const link = lineLink(parent);
    if (!link) return;
    const list = table(parent);
    const index = list.findIndex((r) => r.id === parentId);
    if (index < 0) return;
    const lines = table(link.model).filter((r) => r[link.fk] === parentId);
    list[index] = withTotals(parent, list[index] as ModelRecord, lines);
  };

  /** Settle a written row, then the parents whose totals depend on it. */
  const settle = (model: CatalogModel, record: ModelRecord): ModelRecord => {
    let settled = record;
    if (isLineModel(model)) {
      settled = settleLine(record);
      const list = table(model);
      const index = list.findIndex((r) => r.id === record.id);
      if (index >= 0) list[index] = settled;
    }
    if (lineLink(model)) {
      resync(model, record.id);
      settled = table(model).find((r) => r.id === record.id) ?? settled;
    }
    for (const { parent, fk } of ownersOf(model.id)) {
      if (isLineModel(model)) resync(parent, record[fk]);
    }
    return settled;
  };

  const present = (model: CatalogModel, record: ModelRecord): ModelRecord => ({
    ...record,
    ...(options.defaults?.(model) ?? {}),
  });

  const nextId = (model: CatalogModel) =>
    fakeId(`${model.id}:new:${seed}:${created++}`);

  const matches = (record: ModelRecord, match: Record<string, unknown>) =>
    Object.entries(match).every(([key, value]) => record[key] === value);

  return {
    async list(model) {
      return table(model).map((r) => present(model, r));
    },
    async get(model, id) {
      const found = table(model).find((r) => r.id === id);
      return found ? present(model, found) : undefined;
    },
    async create(model, values) {
      const record: ModelRecord = {
        ...(options.defaults?.(model) ?? {}),
        ...values,
        id: nextId(model),
      };
      table(model).push(record);
      const settled = settle(model, record);
      persist(model);
      return { ...settled };
    },
    async update(model, id, values) {
      const list = table(model);
      const index = list.findIndex((r) => r.id === id);
      if (index < 0) return undefined;
      const next: ModelRecord = { ...list[index], ...values, id };
      list[index] = next;
      const settled = settle(model, next);
      persist(model);
      return { ...settled };
    },
    async delete(model, id) {
      const list = table(model);
      const index = list.findIndex((r) => r.id === id);
      if (index < 0) return false;
      const [gone] = list.splice(index, 1);
      for (const { parent, fk } of ownersOf(model.id)) {
        if (isLineModel(model) && gone) resync(parent, gone[fk]);
      }
      persist(model);
      return true;
    },
    reset() {
      tables.clear();
      created = 0;
      clearStoredData(storage);
    },
    async apply(writes) {
      // Snapshot every table a step touches; restore them all if one throws.
      const snapshots = new Map<string, ModelRecord[]>();
      const counter = created;
      const touched = new Map<string, CatalogModel>();
      const touch = (model: CatalogModel) => {
        touched.set(model.id, model);
        const rows = table(model);
        if (!snapshots.has(model.id)) {
          snapshots.set(
            model.id,
            rows.map((r) => ({ ...r })),
          );
        }
        return rows;
      };
      const written: Record<string, ModelRecord> = {};
      const resolve = (
        values: Record<string, WriteValue> | undefined,
      ): Record<string, unknown> =>
        Object.fromEntries(
          Object.entries(values ?? {}).map(([key, value]) => {
            if (!isRecordRef(value)) return [key, value];
            const target = written[value.ref];
            if (!target)
              throw new Error(`Unknown record reference ${value.ref}`);
            return [key, value.field ? target[value.field] : target.id];
          }),
        );

      try {
        for (const write of writes) {
          const list = touch(write.model);
          const match = resolve(write.match);
          if (write.op === 'delete') {
            const doomed = list.filter((r) =>
              write.id !== undefined ? r.id === write.id : matches(r, match),
            );
            if (write.id === undefined && Object.keys(match).length === 0) {
              throw new Error('A delete needs an id or a match');
            }
            for (const record of doomed) {
              list.splice(list.indexOf(record), 1);
            }
            continue;
          }
          const values = resolve(write.values);
          let index = -1;
          if (write.id !== undefined) {
            index = list.findIndex((r) => r.id === write.id);
            if (index < 0) {
              throw new Error(`No ${write.model.name} with id ${write.id}`);
            }
          } else if (Object.keys(match).length > 0) {
            index = list.findIndex((r) => matches(r, match));
          }
          let record: ModelRecord;
          if (index >= 0) {
            const current = list[index] as ModelRecord;
            record = { ...current, ...values, id: current.id };
            list[index] = record;
          } else {
            record = {
              ...(options.defaults?.(write.model) ?? {}),
              ...match,
              ...resolve(write.onCreate),
              ...values,
              id: nextId(write.model),
            };
            list.push(record);
          }
          if (write.as) written[write.as] = { ...record };
        }
      } catch (error) {
        for (const [id, rows] of snapshots) tables.set(id, rows);
        created = counter;
        throw error;
      }
      for (const model of touched.values()) persist(model);
      return written;
    },
  };
}
