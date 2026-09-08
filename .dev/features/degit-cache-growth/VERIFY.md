# VERIFY — degit-cache-growth

**FLOOR layer** — `check-verify.mjs` over the six gates: all 0 → **`PASS`**.

**ADVISORY layer** — no `role: verifier` capabilities exist (P7).

**What PASS means here is unusually narrow, and worth saying.** This increment adds no behaviour. The
gates prove the markdown lints and that nothing else broke; they cannot check whether a paragraph is
true. The claim it makes — that degit's tarball deletion could never fire under pharn's SHA-pinned
refs — rests on the spec's verbatim quote of `degit@3.6.6`'s cache-update function and on the
reproduction recorded there:

```
map.json → { "main": "b7626d4d…", "461216dc…": "461216dc…" }
                                   ^ the self-mapped entry, under a new key each fetch
```

That is provenance from the spec, not something re-measured this run — the dependency is no longer
installed, so it cannot be. Stated rather than implied.

The one adjacent claim that IS floor-grade belongs to `5.3a`, not here: `grep -rn degit src/` is empty
and `dist/index.js` contains no occurrence, so pharn cannot add to that cache any more.
