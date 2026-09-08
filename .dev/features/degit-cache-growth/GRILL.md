# GRILL — degit-cache-growth (advisory; gates nothing)

## F1 — most of this increment already shipped, and the honest move is to say so (scope)

**Problem.** `5.3a` added a "leftover cache" section with all three platform paths and the "pharn will
not clean it up" hatch. Re-delivering Option A wholesale would produce a diff that looks like work and
adds nothing. A reviewer reading the PR must be able to tell what is genuinely new.

**Reduction.** The increment is scoped to the part `5.3a` did **not** cover — the growth mechanism —
and the PR says outright which half already existed. If that had left nothing, the correct outcome
would have been to close the prompt as satisfied, not to pad it.

## F2 — the interesting fact is the WHY, and it is easy to state uselessly (precision)

**Problem.** "The cache grows unboundedly" is not actionable. The useful fact is the mechanism: degit
deletes a tarball only when an existing **ref's** mapped hash changes, and pharn passed the resolved
SHA *as* the ref — so each fetch wrote a self-mapped `"<sha>": "<sha>"` entry under a **new key**, the
previous hash was always `undefined`, and the delete branch could never execute. Without that, a
reader cannot tell whether their large cache is a bug they hit or normal behaviour.

**Reduction.** The mechanism is stated in both docs, in one sentence each.

## F3 — "delete the directory" is wrong advice for a shared directory (correctness)

**Problem.** `~/Library/Caches/degit` is shared with **every** tool on the machine that uses degit.
The existing text says "delete it yourself" and names the top-level path — which, followed literally,
destroys another project's cache.

**Reduction.** Added an explicit scope note: delete `degit/github/pharn-dev/pharn-oss` if you use
degit elsewhere. This is a real fix to text `5.3a` shipped, not a new claim.

## F4 — a docs-only increment with no evals invites a fake one (P0)

**Problem.** The plan has an empty `## Evals to write`. The temptation is to invent a test — grepping
the docs for a phrase — so the section looks complete. That test would pin wording, not behaviour, and
would break on any future copy edit while proving nothing.

**Reduction.** The section says **none**, and the guarantee audit says why: the only floor-grade claim
in this area (`pharn no longer grows the cache`) is `5.3a`'s and is already verified there. An empty
evals list with a reason is honest; a tautological test would not be.

## Verdict

**Advisory: proceed.** F1 and F3 changed what shipped — F1 narrowed it to the genuinely-missing half,
F3 corrected advice that was already on `main`.
