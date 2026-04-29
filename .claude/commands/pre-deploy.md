---
description: Run pre-deploy validation. Usage `/pre-deploy [environment]`.
---

Invoke the `pre-deploy` skill. Environment defaults to `production`.

Present results as a checklist with PASS/FAIL/WARN status per check. If any critical check fails, state explicitly: **"DEPLOY RECOMMENDATION: 🚫 BLOCK"** and list the specific fixes needed before deploy can proceed.

If everything passes, state: **"DEPLOY RECOMMENDATION: ✅ GO"** and surface any warnings that should be addressed soon (but don't block).
