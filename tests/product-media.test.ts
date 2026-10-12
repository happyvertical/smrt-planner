import { describe, expect, it } from 'vitest';
import { createPlannerDataSource } from '../src/lib/data/planner-source.ts';
import { catalogModels } from '../src/lib/forms/shared.ts';
import {
  ASSET,
  PRODUCT_ASSET,
  planProductImageDelete,
  planProductImageSave,
  productImages,
} from '../src/lib/products/media.ts';

const PRODUCT = '@happyvertical/smrt-products:Product';

describe('product media demo', () => {
  it('seeds deterministic canonical Asset and ProductAsset thumbnails', async () => {
    const source = createPlannerDataSource();
    const [product] = await source.list(catalogModels(PRODUCT));
    const assets = await source.list(catalogModels(ASSET));
    const links = await source.list(catalogModels(PRODUCT_ASSET));
    if (!product) throw new Error('product sample missing');

    expect(productImages(product.id, assets, links)[0]).toMatchObject({
      sourceUri: expect.stringMatching(/^data:image\/svg\+xml,/),
      sortOrder: 0,
    });
  });

  it('writes and removes a selected image through canonical records', async () => {
    const source = createPlannerDataSource();
    const [product] = await source.list(catalogModels(PRODUCT));
    if (!product) throw new Error('product sample missing');
    const file = { name: 'mug.png', type: 'image/png' } as File;

    await source.apply(
      planProductImageSave(product.id, file, 'data:image/png;base64,AA==', 1),
    );
    const assets = await source.list(catalogModels(ASSET));
    const links = await source.list(catalogModels(PRODUCT_ASSET));
    expect(productImages(product.id, assets, links)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'mug.png', sortOrder: 1 }),
      ]),
    );

    await source.apply(planProductImageDelete(product.id, links));
    expect(await source.list(catalogModels(PRODUCT_ASSET))).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: product.id }),
      ]),
    );
  });
});
