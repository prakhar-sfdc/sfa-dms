---
name: soql-and-org
description: Query data and inspect the Salesforce org for the sfa-dms project. Use when the user wants to run a SOQL query, look up records, describe an sObject/fields, check org info, or open the org in a browser.
---

# SOQL & Org Inspection

Default org: `sfa_dms_primary`. Saved queries live in `scripts/soql/`.

## Run SOQL

```bash
sf data query -q "SELECT Id, Name FROM Account LIMIT 10" -o sfa_dms_primary
sf data query -f scripts/soql/account.soql                     # from a saved file
sf data query -q "SELECT COUNT() FROM Contact" -r json         # machine-readable
sf data query --use-tooling-api -q "SELECT Name FROM ApexClass" # Tooling API objects
```

## Inspect metadata / schema

```bash
sf sobject describe -s Account -o sfa_dms_primary              # fields, relationships
sf sobject list -s custom                                      # list custom objects
sf org display -o sfa_dms_primary                              # org info, instance URL
sf org open -o sfa_dms_primary                                 # open in browser
```

## DML from CLI (use carefully)

```bash
sf data create record -s Account -v "Name='Acme'"
sf data update record -s Account -i <id> -v "Name='Acme Inc'"
sf data delete record -s Account -i <id>
```

## Guidance

- Reads are safe; confirm before create/update/delete since they mutate real org data.
- Custom objects in `force-app/main/default/objects/` use the `__c` suffix — check there for field API names before querying.
- Prefer selective queries (`WHERE`, `LIMIT`) over full-table scans.
