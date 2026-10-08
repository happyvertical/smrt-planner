<script lang="ts">
import type { CatalogModel } from '../catalog/types.ts';
import {
  blankChild,
  listColumns,
  missingRequired,
  recordTitle,
  rowsOf,
} from '../data/columns.ts';
import { useDataSource } from '../data/context.ts';
import { derivedFieldNames, lineAmounts } from '../data/derived.ts';
import type { ModelRecord } from '../data/fakes.ts';
import { formatValue } from '../data/format.ts';
import { relationLabels, shortId } from '../data/labels.ts';
import type { ViewField } from '../recipes/policy.ts';
import FieldInput from './FieldInput.svelte';

interface ChildRecordsProps {
  model: CatalogModel;
  fields: ViewField[];
  /** The child's field that holds the parent's id; preset and never shown. */
  fk: string;
  parentId: string;
  title: string;
  /** Called after a row is added, changed or removed (the parent's totals moved). */
  onchanged?: () => void;
}

let {
  model,
  fields: allFields,
  fk,
  parentId,
  title,
  onchanged,
}: ChildRecordsProps = $props();

const source = useDataSource();
const fields = $derived(allFields.filter((f) => f.name !== fk));
const columns = $derived(listColumns(fields));
const calculated = $derived(derivedFieldNames(model, false));
/** The line's amount as it will be saved, live as quantity and price change. */
const derivedPreview = (name: string): unknown =>
  name === 'amount' ? lineAmounts(draft).amount : draft[name];
let errors = $state<Record<string, string>>({});

let rows = $state<ModelRecord[]>([]);
let labels = $state(new Map<string, string>());
let loaded = $state(false);
/** `null` closed, `'new'` adding, otherwise the id being edited. */
let editing = $state<string | 'new' | null>(null);
let draft = $state<Record<string, unknown>>({});
let formKey = $state(0);

async function load() {
  const listed = rowsOf(await source.list(model), fk, parentId);
  labels = await relationLabels(source, fields, listed);
  rows = listed;
  loaded = true;
}

$effect(() => {
  // Reload when the parent record (or the child model) changes.
  model.id;
  parentId;
  editing = null;
  loaded = false;
  void load();
});

const nameOf = (row: ModelRecord) =>
  recordTitle(model, fields, row, labels) || shortId(row.id);

function startCreate() {
  errors = {};
  draft = blankChild(fields, fk, parentId);
  editing = 'new';
  formKey++;
}

function startEdit(row: ModelRecord) {
  errors = {};
  draft = { ...row };
  editing = row.id;
  formKey++;
}

async function save(event: SubmitEvent) {
  event.preventDefault();
  errors = missingRequired(fields, draft, calculated);
  if (Object.keys(errors).length > 0) return;
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    if (!calculated.has(field.name)) values[field.name] = draft[field.name];
  }
  values[fk] = parentId;
  if (editing === 'new') await source.create(model, values);
  else if (editing) await source.update(model, editing, values);
  editing = null;
  await load();
  onchanged?.();
}

async function remove(row: ModelRecord) {
  await source.delete(model, row.id);
  await load();
  onchanged?.();
}
</script>

<section class="children" data-child-model={model.name}>
  <header>
    <h3>{title} <small>{rows.length}</small></h3>
    <button type="button" class="secondary" onclick={startCreate}>
      Add {title.toLowerCase().replace(/s$/, '')}
    </button>
  </header>

  {#if editing}
    {#key formKey}
      <form onsubmit={save}>
        {#each fields as field (field.name)}
          {#if calculated.has(field.name)}
            <div class="derived">
              <span class="derived-label">{field.label}</span>
              <output data-derived={field.name}>
                {formatValue(field, derivedPreview(field.name), labels)}
              </output>
              <small>Calculated from quantity, price, discount and tax.</small>
            </div>
          {:else}
            <FieldInput
              {field}
              modelId={model.id}
              label={field.label}
              help={field.help}
              value={draft[field.name]}
              onchange={(value) => {
                draft[field.name] = value;
                delete errors[field.name];
              }}
            />
            {#if errors[field.name]}
              <p class="error" role="alert">{errors[field.name]}</p>
            {/if}
          {/if}
        {/each}
        <div class="actions">
          <button type="submit">Save</button>
          <button type="button" class="secondary" onclick={() => (editing = null)}>
            Cancel
          </button>
        </div>
      </form>
    {/key}
  {/if}

  {#if !loaded}
    <p>Loading...</p>
  {:else if rows.length === 0}
    <p class="empty">None yet.</p>
  {:else}
    <div class="scroll">
      <table>
        <thead>
          <tr>
            {#each columns as column (column.name)}
              <th>{column.label}</th>
            {/each}
            <th><span class="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.id)}
            <tr>
              {#each columns as column (column.name)}
                <td>{formatValue(column, row[column.name], labels)}</td>
              {/each}
              <td class="row-actions">
                <button
                  type="button"
                  class="secondary"
                  aria-label={`Edit ${nameOf(row)}`}
                  onclick={() => startEdit(row)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="secondary"
                  aria-label={`Delete ${nameOf(row)}`}
                  onclick={() => remove(row)}
                >
                  Delete
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .children {
    display: grid;
    gap: var(--smrt-spacing-3);
    padding: var(--smrt-spacing-3) var(--smrt-spacing-4);
    border: 1px solid var(--smrt-color-outline-variant);
    border-radius: var(--smrt-radius-large);
  }

  header {
    display: flex;
    gap: var(--smrt-spacing-3);
    align-items: center;
    justify-content: space-between;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  small,
  .empty {
    color: var(--smrt-color-on-surface-variant);
    font-weight: 400;
  }

  p {
    margin: 0;
  }

  form {
    display: grid;
    gap: var(--smrt-spacing-2);
  }

  .error {
    margin: 0;
    color: var(--smrt-color-error);
  }

  .derived {
    display: grid;
    gap: var(--smrt-spacing-1);
  }

  .derived-label {
    font-weight: 500;
  }

  .actions,
  .row-actions {
    display: flex;
    gap: var(--smrt-spacing-2);
  }

  .scroll {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  th,
  td {
    padding: var(--smrt-spacing-1) var(--smrt-spacing-2);
    border-bottom: 1px solid var(--smrt-color-outline-variant);
    text-align: left;
    white-space: nowrap;
  }

  button {
    padding: var(--smrt-spacing-1) var(--smrt-spacing-3);
    border: 0;
    border-radius: var(--smrt-radius-medium);
    background: var(--smrt-color-primary);
    color: var(--smrt-color-on-primary);
    font: inherit;
    cursor: pointer;
  }

  button.secondary {
    border: 1px solid var(--smrt-color-outline);
    background: transparent;
    color: var(--smrt-color-on-surface);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
