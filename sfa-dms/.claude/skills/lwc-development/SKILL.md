---
name: lwc-development
description: Build, lint, and test Lightning Web Components (and Aura) in the sfa-dms project. Use when creating or editing an LWC/Aura component, wiring Apex to a component, writing Jest tests, or running lint/format on JS.
---

# LWC / Aura Development

Components live in `force-app/main/default/lwc/` (LWC) and `force-app/main/default/aura/` (Aura). Each LWC bundle has `.js`, `.html`, `.js-meta.xml`, and optionally `.css` / `__tests__/`.

## Scaffolding a new LWC

```bash
sf lightning generate component --type lwc -n myComponent -d force-app/main/default/lwc
```
Set the `js-meta.xml` `apiVersion` to 67.0 and add the right `<target>`s (e.g. `lightning__RecordPage`, `lightning__AppPage`) plus `isExposed`.

## Wiring Apex

Import `@AuraEnabled` methods from a controller:
```js
import getData from '@salesforce/apex/Account360Controller.getData';
```
Use `@wire` for reactive reads and imperative calls for actions. Match patterns already used in neighboring components.

## Testing (Jest)

Tests go in `<component>/__tests__/<component>.test.js`. Commands (from `package.json`):
```bash
npm run test:unit                 # sfdx-lwc-jest, all tests
npm run test:unit:watch           # watch mode
npm run test:unit:coverage        # with coverage
npx sfdx-lwc-jest -- --findRelatedTests force-app/main/default/lwc/myComponent/myComponent.js
```
Mock Apex imports with `jest.mock` / the `@salesforce/apex` adapters.

## Lint & format

```bash
npm run lint                      # eslint on aura/lwc JS
npm run prettier                  # format all supported files
```
`lint-staged` runs prettier + eslint + related Jest tests on commit (husky pre-commit).

## Guidance

- Keep components small; reuse existing utilities/components rather than duplicating.
- Deploy with the `salesforce-deploy` skill (`-m LightningComponentBundle:myComponent`).
