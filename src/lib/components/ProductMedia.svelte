<script lang="ts">
import { Switch } from '@happyvertical/smrt-ui/forms';
import type { ModelRecord } from '../data/source.ts';
import type { ProductImage } from '../products/media.ts';

interface ProductMediaProps {
  rows: readonly ModelRecord[];
  images: ReadonlyMap<string, readonly ProductImage[]>;
  onselect: (product: ModelRecord, file: File) => void;
}

let { rows, images, onselect }: ProductMediaProps = $props();
let showing = $state(true);

function select(product: ModelRecord, event: Event) {
  const file = (event.currentTarget as HTMLInputElement).files?.[0];
  if (file) onselect(product, file);
  (event.currentTarget as HTMLInputElement).value = '';
}
</script>

<section class="media" aria-label="Product gallery">
  <div class="heading">
    <div>
      <h3>Product gallery</h3>
      <p>Images stay in this browser demo and are linked through ProductAsset.</p>
    </div>
    <Switch checked={showing} onchange={(event) => (showing = event.currentTarget.checked)} label="Show gallery" />
  </div>

  {#if showing}
    <ul class="gallery">
      {#each rows as product (product.id)}
        {@const productImages = images.get(product.id) ?? []}
        <li>
          <div class="photos">
            {#if productImages.length}
              {#each productImages as image (image.id)}
                <img src={image.sourceUri} alt={image.description || image.name} />
              {/each}
            {:else}
              <span class="empty" aria-label={`No image for ${product.name}`}>No image</span>
            {/if}
          </div>
          <div class="details">
            <strong>{String(product.name ?? 'Untitled product')}</strong>
            <label>
              <span>Add image</span>
              <input type="file" accept="image/*" onchange={(event) => select(product, event)} />
            </label>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .media, .heading, .details { display: grid; gap: var(--smrt-spacing-2); }
  .heading { grid-template-columns: 1fr auto; align-items: center; }
  h3, p { margin: 0; }
  p { color: var(--smrt-color-on-surface-variant); }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: var(--smrt-spacing-3); margin: 0; padding: 0; list-style: none; }
  li { display: grid; gap: var(--smrt-spacing-2); padding: var(--smrt-spacing-2); border: 1px solid var(--smrt-color-outline-variant); border-radius: var(--smrt-radius-medium); }
  .photos { display: flex; gap: var(--smrt-spacing-1); min-height: 7rem; overflow-x: auto; }
  img, .empty { width: 100%; min-width: 7rem; aspect-ratio: 1; object-fit: cover; border-radius: var(--smrt-radius-small); }
  .empty { display: grid; place-items: center; background: var(--smrt-color-surface-variant); color: var(--smrt-color-on-surface-variant); font-size: var(--smrt-font-size-body-small); }
  label { display: grid; gap: var(--smrt-spacing-1); font-size: var(--smrt-font-size-body-small); }
</style>
