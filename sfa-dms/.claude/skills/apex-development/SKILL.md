---
name: apex-development
description: Write, run, and test Apex classes and triggers in the sfa-dms project. Use when creating or editing an Apex class/trigger, adding a test class, running Apex tests, checking code coverage, or executing anonymous Apex.
---

# Apex Development

Apex classes live in `force-app/main/default/classes/` and triggers in `force-app/main/default/triggers/`. Every `.cls`/`.trigger` has a paired `*-meta.xml` (API version 67.0).

## Conventions in this repo

- Controller classes end in `Controller` (e.g. `Account360Controller`).
- Test classes end in `Test` (e.g. `CommunitiesLoginControllerTest`) and mirror the class under test.
- Match the surrounding style: sharing keywords (`with sharing`), `@AuraEnabled` for LWC-facing methods, and existing naming.
- Salesforce requires ≥75% org-wide coverage to deploy to production — new Apex should ship with a test class.

## Running tests

```bash
sf apex run test -n MyClassTest -o sfa_dms_primary -r human -w 10   # one class, wait for result
sf apex run test -l RunLocalTests -c -r human -w 30                 # all local tests + coverage
sf apex get test -i <testRunId>                                     # fetch async results
```

Check coverage for a class:
```bash
sf apex run test -n MyClassTest -c -r json -w 10
```

## Anonymous Apex

Ad-hoc scripts live in `scripts/apex/`. Run one with:
```bash
sf apex run -f scripts/apex/hello.apex -o sfa_dms_primary
```

## New class checklist

1. Create `Foo.cls` + `Foo.cls-meta.xml` (apiVersion 67.0, status Active).
2. Create `FooTest.cls` + meta, cover main paths and bulk/negative cases.
3. Format: `npm run prettier` (uses prettier-plugin-apex).
4. Deploy/test via the `salesforce-deploy` skill, then `sf apex run test`.
