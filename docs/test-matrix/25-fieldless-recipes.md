# Fieldless feature models (#25)

The producer already emits the webhook task and schema. The catalogue must
retain it without inventing public operations or treating real collections as
models. There is no persistence, authentication, or runtime mutation change.

| Behavior / invariant | Trigger | Positive case | Negative case | Actor / context | Executor / transaction | Runtime / dialect | Contract edge | Level | Command |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fieldless model remains available to its feature recipe | Extract a package manifest and build the catalogue | A fieldless SmrtObject task survives and its recipe is retained | Its generated routes/tools remain disabled; a collection with an inherited schema is excluded | N/A: build-time metadata only | N/A: no database access | Node 26 generator; SQL N/A because no query occurs | Manifest ancestry/schema; missing optional schema retains legacy field-based detection | Catalogue integration regression | `pnpm exec vitest run tests/extract.test.ts tests/catalog-drop.test.ts` |

The regression fails against the base classifier (task absent) and must pass
with the corrected classifier. Full repository gates run on the committed
head. The committed catalogue stays registry-generated; preview validation
against the coordinated smrt build is evidence, not a committed local overlay.
