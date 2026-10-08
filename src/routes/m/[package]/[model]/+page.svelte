<script lang="ts">
import { blueprintStore } from '$lib/blueprint/store.svelte.ts';
import { catalog, getModel } from '$lib/catalog/index.ts';
import FormWorkspace from '$lib/components/FormWorkspace.svelte';
import ModelWorkspace from '$lib/components/ModelWorkspace.svelte';
import SectionIcons from '$lib/components/SectionIcons.svelte';
import { humanize, singularize } from '$lib/data/format.ts';
import { activeForms } from '$lib/forms/active.ts';
import { PRODUCT } from '$lib/forms/stock.ts';
import { appHref } from '$lib/planner/app.svelte.ts';
import { selection } from '$lib/planner/selection.svelte.ts';
import { FEATURE_SECTION } from '$lib/recipes/features.ts';
import { recipeNav, recipes, sectionId } from '$lib/recipes/index.ts';
import {
  childLinks,
  childTitle,
  hasNavPage,
  lineageNames,
} from '$lib/recipes/plumbing.ts';
import { navSectionOf } from '$lib/recipes/sections.ts';
import { recipeState } from '$lib/recipes/state.svelte.ts';
import type { PageProps } from './$types';

let { data }: PageProps = $props();

const catalogModel = $derived(getModel(data.packageId, data.modelName));
// Recipe options (field policies, narrowed exposure) shape what is shown.
const applied = $derived(
  catalogModel ? recipeState.apply(catalogModel) : undefined,
);
const model = $derived(applied?.model);
// Added recipes' forms (with their extensions) replace the generic form.
const forms = $derived(
  catalogModel ? activeForms(recipeState.ids, recipes, catalogModel.id) : [],
);
const recipesWithModel = $derived(
  recipes.filter(
    (recipe) => catalogModel && recipe.models.includes(catalogModel.id),
  ),
);
// The recipe the header icons belong to: an added one first. Its section's
// Help and Options pages are what the icons open.
const iconRecipe = $derived(
  recipesWithModel.find((recipe) => recipeState.has(recipe.id)) ??
    recipesWithModel[0],
);
const iconSection = $derived(iconRecipe ? sectionId(iconRecipe) : undefined);
const iconLabel = $derived(
  iconRecipe ? (iconRecipe.group?.label ?? iconRecipe.label) : '',
);
// Breadcrumbs follow the app's own navigation, not catalog packages: the menu
// section the model sits in (the user's renamed label wins) and its menu label.
const navCrumb = $derived.by(() => {
  if (!catalogModel) return undefined;
  const recipe = recipesWithModel.find((r) => recipeState.has(r.id));
  if (!recipe) {
    if (!recipeState.hasFeature(catalogModel.id)) return undefined;
    const renamed =
      blueprintStore.layout?.sections?.[`section:${FEATURE_SECTION.id}`]?.label;
    return {
      section: renamed || FEATURE_SECTION.label,
      label: humanize(catalogModel.name),
    };
  }
  const section = navSectionOf(recipe);
  const entry = recipeNav(recipe).find((e) => e.model.id === catalogModel.id);
  const renamed =
    blueprintStore.layout?.sections?.[`section:${section.id}`]?.label;
  return {
    section: renamed || section.label,
    label: entry?.label ?? catalogModel.name,
  };
});

/** "Section / Entry", or just the name once when both are the same. */
const breadcrumb = (crumb: { section: string; label: string }) =>
  crumb.section.trim().toLowerCase() === crumb.label.trim().toLowerCase()
    ? crumb.label
    : `${crumb.section} / ${crumb.label}`;
// The list heading: the menu entry's label unless it is only the model's name.
const listTitle = $derived(
  navCrumb &&
    catalogModel &&
    navCrumb.label.toLowerCase() !== humanize(catalogModel.name).toLowerCase()
    ? navCrumb.label
    : undefined,
);

// What New creates, from the menu entry: "Sales Orders" -> "sales order".
const noun = $derived(
  navCrumb ? singularize(navCrumb.label).toLowerCase() : undefined,
);

// Anchored to this model's fields in the recipe whose Help covers it.
const helpAnchor = $derived.by(() => {
  const covering =
    recipesWithModel.find(
      (recipe) =>
        recipe.help &&
        sectionId(recipe) === iconSection &&
        recipeState.has(recipe.id),
    ) ??
    recipesWithModel.find(
      (recipe) => recipe.help && sectionId(recipe) === iconSection,
    );
  return covering ? `${covering.id}-fields-${data.modelName}` : undefined;
});
// Line items and other dependent records live inside their parent's record
// view, filtered to it; they have no list page of their own.
const childTables = $derived.by(() => {
  if (!catalogModel) return [];
  const parentNames = lineageNames(catalog, catalogModel.id);
  return childLinks(catalog, recipes, catalogModel.id).map((link) => {
    const view = recipeState.apply(link.model);
    return {
      model: view.model,
      fields: view.fields,
      fk: link.fk,
      title: childTitle(link.model.name, parentNames),
    };
  });
});
// A child in a recipe without a menu entry (and not added as a feature) is
// reached through its parents, not as a page.
const embeddedIn = $derived.by(() => {
  if (!catalogModel) return [];
  if (hasNavPage(recipes, catalogModel.id)) return [];
  if (recipeState.hasFeature(catalogModel.id)) return [];
  if (!recipesWithModel.length) return [];
  return recipes.flatMap((recipe) =>
    recipeNav(recipe).filter((entry) =>
      childLinks(catalog, [recipe], entry.model.id).some(
        (link) => link.model.id === catalogModel.id,
      ),
    ),
  );
});
const inApp = $derived(
  selection.has(data.packageId) ||
    (catalogModel ? recipeState.hasFeature(catalogModel.id) : false) ||
    recipesWithModel.some((recipe) => recipeState.has(recipe.id)),
);
</script>

<svelte:head>
  <title>{data.modelName} · {humanize(data.packageId)} · smrt planner</title>
</svelte:head>

{#if model && applied}
  <main>
    <div class="bar">
    <nav aria-label="Breadcrumb">
      {#if navCrumb}
        {breadcrumb(navCrumb)}
      {:else}
        {model.name}
      {/if}
      {#if !inApp}
        <span class="meta">(not in your app yet)</span>
      {/if}
    </nav>
    {#if iconSection}
      <SectionIcons section={iconSection} label={iconLabel} {helpAnchor} />
    {/if}
    </div>

    {#if embeddedIn.length}
      <p>
        {humanize(model.name)} records live inside their parent record. Open
        one of:
        {#each embeddedIn as entry, i (entry.model.id)}
          {i ? ', ' : ''}<a href={appHref(`/m/${entry.packageId}/${entry.model.name}/`)}>{entry.label}</a>
        {/each}
      </p>
    {:else if forms.length && model.id === PRODUCT}
      <FormWorkspace {model} {forms} />
    {:else}
      <ModelWorkspace
        {model}
        fields={applied.fields}
        {forms}
        {childTables}
        title={listTitle}
        {noun}
      />
    {/if}
  </main>
{/if}

<style>
  main {
    display: grid;
    gap: var(--smrt-spacing-6);
    width: min(100%, 72rem);
    margin-inline: auto;
    padding: var(--smrt-spacing-6);
  }

  .bar {
    display: flex;
    align-items: center;
  }

  .meta {
    color: var(--smrt-color-on-surface-variant);
  }
</style>
