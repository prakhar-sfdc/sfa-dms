---
name: salesforce-deploy
description: Deploy and retrieve Salesforce metadata with the sf CLI for the sfa-dms project. Use when the user wants to push/pull source to an org, deploy a class/LWC/object, retrieve metadata, validate a deployment, or work with the manifest/package.xml.
---

# Salesforce Deploy & Retrieve

This is a Salesforce DX (source-tracked) project. Metadata lives under `force-app/main/default`.

- **Default target org:** `sfa_dms_primary` (set in `.sf/config.json`). Omit `-o` to use it.
- **Source API version:** 67.0 (`sfdx-project.json`).
- **CLI:** modern `sf` (not the legacy `sfdx force:*`).

## Core commands

Deploy specific metadata:
```bash
sf project deploy start -d force-app/main/default/classes/Foo.cls        # a file/dir
sf project deploy start -m ApexClass:Foo                                  # by metadata name
sf project deploy start -m "LightningComponentBundle:myCmp"
```

Deploy the whole project or via manifest:
```bash
sf project deploy start                                # everything under package dirs
sf project deploy start -x manifest/package.xml        # via manifest
```

Validate only (no changes committed) — use before risky deploys:
```bash
sf project deploy start -d force-app/main/default/classes/Foo.cls --dry-run -l RunLocalTests
```

Retrieve metadata into the project:
```bash
sf project retrieve start -m ApexClass:Foo
sf project retrieve start -x manifest/package.xml
```

Check source-tracking diffs vs the org:
```bash
sf project deploy preview      # what would deploy
sf org list                    # confirm which orgs are connected
```

## Guidance

- Always confirm the target org before deploying to anything other than `sfa_dms_primary`; deploys are outward-facing and hard to reverse.
- Prefer deploying the narrowest metadata that satisfies the request (single class/component) over the whole project.
- For production-like orgs, run with `-l RunLocalTests` and consider `--dry-run` first.
- If a deploy fails, report the CLI error output verbatim rather than guessing.
- When new metadata is added, keep `manifest/package.xml` in sync if the team relies on it.
