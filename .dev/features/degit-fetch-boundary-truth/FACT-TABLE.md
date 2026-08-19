# FACT-TABLE — the degit fetch boundary (T5, Phase A)

**Base:** `45c4be8` (the brief pinned `2cd061d`; `210d0e4` #96 and `45c4be8` #97 landed since —
latest `main` wins, per the brief's own normative instruction).
**Dependency measured:** `degit@3.6.6` (see H7). **Probes:** 2026-08-17, `darwin`.

Chunk SHA-256s at measurement time (every source anchor below is pinned to these):

| file | sha256 |
| --- | --- |
| `dist/index.js` | `6c352d4c473335aec2eaa649bf51ee6733a8a8802bf7d7504eadcad6208dd056` |
| `dist/src-COTalb41.js` | `baf9fe2b86060e2dff92eb278cb825daa39ae542ee794c1e2604a7b967c1fca1` |
| `dist/client-C95Y-jLv.js` | `45885337fbd55fba33557d5aaf973145c88475893a1bde0f50182d3609f4158b` |
| `dist/utils-DCX7uekb.js` | `982dbb0d2f4a0a9be01b38d9ed05198728b2c0d4bedd24b05e0c5024f6418897` |
| `dist/bin.js` | `8a29ba0821a6cccf9bb167e692894158a634aa553300c9f097029027f7d536fb` |

---

## H1 — `cache: false` semantics — **OVERTURNED, upward**

**Hypothesis:** skips *reuse* but still *writes*. **Verdict:** skips **neither**.

**Source** (`dist/src-COTalb41.js`, `Ao(t,n)`) — the whole body is gated on `if(!t.cache)`:

```js
async function Ao(t,n){ if(!t.cache){
  try{ await se(n.file,ce.F_OK), t.verboseInfo({code:`FILE_EXISTS`,…}); return }catch{}
  e(l.dirname(n.file)),                                   // mkdir the cache dir
  t.proxy&&t.verboseInfo({code:`PROXY`,…}),
  t.verboseInfo({code:`DOWNLOADING`,message:`downloading ${n.url} to ${n.file}`});
  try{ await t.fetch(n.url,n.file,t.proxy) }catch(e){ throw new s(`could not download …`) }
}}
```

**Cache dir resolution** (`dist/utils-DCX7uekb.js`): `win32` → `%LOCALAPPDATA% ?? ~/AppData/Local`
+ `degit`; `darwin` → `~/Library/Caches/degit`; else → `$XDG_CACHE_HOME ?? ~/.cache` + `degit`.
**`XDG_CACHE_HOME` is not consulted on darwin.**

**Live transcript** (options verbatim from `src/lib/repo.ts` — `{force:true, cache:false}`):

```
before rm:  ~/Library/Caches/degit = 21M          (accumulated, cross-project)
rm -rf      ~/Library/Caches/degit → gone
fetch #1 →  github/pharn-dev/pharn-oss/b7626d4d….tar.gz + map.json + access.json  = 2.3M
fetch #2 →  [info] FILE_EXISTS | …b7626d4d….tar.gz already exists locally
            [info] EXTRACTING  | … → …/degit/github/pharn-dev/pharn-oss/extract-BNlPNF
            mtime 20:06:07 → 20:06:07 (unchanged; no DOWNLOADING event)
map.json  = {"main":"b7626d4d600090d94e1680394f707abf90027954"}
```

**Brief's recipe was broken on this platform:** `rm -rf ~/.cache/degit` measures nothing on darwin.

## H2 — resolver stack — **Q2 CONFIRMED; S3 overturned**

**Source** (`dist/client-C95Y-jLv.js`):

```js
async function Ht(e){ let t=Et(e);
  try{ let e=Lt(await gt.listServerRefs({http:Bt,peelTags:!0,symrefs:!0,url:t})); if(e.length>0)return e }catch{}
  try{ let e=Lt((await gt.getRemoteInfo2({http:Bt,protocolVersion:1,url:t})).refs||[]); if(e.length>0)return e }catch{}
  return Vt(e) }                       // Vt = spawn('git',['ls-remote','--symref',…])
```

Both `catch {}` are **empty** — the fallback is silent and fires on any error. Tier 3 spawns
`git ls-remote --symref` (`GIT_LS_REMOTE_FAILED`). The git-clone fallback `Ut` runs
`git clone --depth 1 …` then `rmSync(join(t,'.git'))`.

**Not run:** the fixed-PATH no-git live probe. Resolved by source (tier-3-only) instead; the live
transcript remains the stronger instrument if wanted.

## H3 — the dropped `warn`s — **CONFIRMED; relocation confirmed**

Three degit-owned `warn` sites, all tar→`git clone` (`dist/src-COTalb41.js`):
`ssh` transport → *"tar lookup failed; falling back to git clone"*; *"git lfs pointer detected in tar
snapshot; falling back to git clone"*; *"tar snapshot download or extraction failed; falling back to
git clone"*. (A fourth, GitLab-only: *"…not found; trying next"*.)

degit's **CLI** registers `e.on('warn', e => console.warn('! ' + …))`. `src/lib/repo.ts` registers
none. **Empirically confirmed the listener works:** the H1 probe registered `on('warn')`/`on('info')`
and received `FILE_EXISTS` / `EXTRACTING` / `SUCCESS`.

## H4 — tar provenance + guards — **STRENGTHENS upward** ("not located" → **present**)

Bundled **node-tar** (no dependency entry — vendored). Guards found in `dist/src-COTalb41.js`:

- `[Hr](e){ this[Vr]+=e.length; let t=this[Vr]/this[Br]; return t>this.maxDecompressionRatio ? (this.abort(Error(\`max decompression ratio exceeded: ${t.toFixed(2)} > ${this.maxDecompressionRatio}\`)),!1) : !0 }`
- absolute-path stripping: `if(!this.preservePaths){ let[e,t]=Qr(this.path); … }` + `TAR_ENTRY_INFO 'stripping … from absolute path'`. degit does not set `preservePaths` → default `false` → active.
- `TAR_ENTRY_INVALID` (checksum failure / path required / linkpath required), `TAR_BAD_ARCHIVE`
  (unrecognized format / truncated input), `TAR_ABORT`.

## H5 — proxy handling — **Q2 OVERTURNED; S3's Act-1 claim TRUE**

`dist/src-COTalb41.js` constructor: `… this.proxy = process.env.https_proxy, …` — unconditional, on
the programmatic path pharn uses. `https-proxy-agent` is **vendored** into `dist/utils-DCX7uekb.js`
(debug namespaces `https-proxy-agent:parse-proxy-response` / `:agent`, `secureProxy`,
`ALPNProtocols`). `Ao` passes `t.proxy` into `t.fetch`.

> **Correction (2026-08-19, increment `proxy-env-notice`).** This entry originally read "`Ao` logs
> `{code:'PROXY'}` and passes `t.proxy` into `t.fetch`." The log half is misleading as stated: the
> emit is `t.verboseInfo({code:'PROXY', …})`, and `verboseInfo` is defined
> `verboseInfo(e){this.verbose&&this.info(e)}`. `fetchRepo` passes `{force:true, cache:false}` and no
> `verbose`, so **the PROXY event never fires on pharn's path** — an `emitter.on('info', …)` listener
> would observe nothing. The `t.fetch(n.url, n.file, t.proxy)` call is unaffected and still happens.
> This matters because it rules out "observe degit rather than read the env," which otherwise looks
> like the more honest design. Re-verified across every published version in the declared `^3.6.1`
> range (3.6.1-3.8.0): the assignment, the single lowercase name, and the `verboseInfo` gate are
> identical in all nine.

Literal sweep over `dist/*.js` for `https?_proxy|no_proxy|ALL_PROXY` → **exactly one hit**:
`src-COTalb41.js: https_proxy`. **Lowercase only.** `src/lib/repo.ts` passes no `proxy` option — but
does not need to.

*Disambiguation:* `corsProxy` in `dist/client-C95Y-jLv.js` is isomorphic-git's transport option
(`http.corsProxy`), a different mechanism. `proxyErrors`/`unpipe` in `src-COTalb41.js` are node-tar
stream plumbing. Conflating either with env-proxy would produce a true-sounding, wrong sentence.

## H6 — lineage — **RESOLVED; brief's guess overturned**

`repository: git+https://github.com/Rich-Harris/degit.git`, `author: Rich Harris`,
`maintainers = [rich_harris, yoglib]`, `_npmUser = GitHub Actions` with
`trustedPublisher {id: github}` and `approver: yoglib`. `docs/CHANGELOG.md` cites live issues
#331/#345/#349/#362/#370/#371. **Not** a community fork carrying stale metadata, and **not**
sveltejs/degit-stopped-at-2.8 — same lineage, moved namespace, still active.

## H7 — *novel* — the dependency-state split; **#83 is MERGED**

The brief calls #83 an unmerged PR. `git log` shows `c41b55a chore(deps): bump degit from 3.6.5 to
3.6.6 (#83)`, with #84–#87 stacked above it. `package.json` stayed `^3.6.1` (the range already
admitted 3.6.6); only the lockfile moved. `node_modules` was **stale at 3.6.5** until `npm ci`.
`gh pr view 83` returned **HTTP 503**, so merge state comes from `git log`, not the API.

## H8 — *novel* — cache-poisoning residual

Reuse is keyed by **filename** (`<sha>.tar.gz`), never a verified digest of contents. Anything able
to write `<cache>/github/<owner>/<repo>/<sha>.tar.gz` makes pharn extract those bytes with **no
network fetch**. SHA-pinning does not protect this — the SHA is the file's name, not a checked
property of its contents. Written into `THREAT-MODEL` §2 item 7 and §4b.

---

## Traps in the brief's own recipes (both hit)

1. `rm -rf ~/.cache/degit` is the **linux** branch; on darwin it measures nothing.
2. "Walk the dep tree / `npm ls isomorphic-git`" has nothing to walk — degit declares **no
   `dependencies`**; the client is bundled. Trap 2's real cause was that `dist/index.js` is a
   **59-byte re-export stub**, so that grep could only ever return 0/0.

## Corrections to the brief itself

- Base was `45c4be8`, not `2cd061d`.
- #83 is merged, not unmerged.
- `THREAT-MODEL.md` **cannot** be scoped in via the setter (`protect-trusted-paths.cjs:58`
  `DEFAULT_PROTECTED`; `PHARN_PROTECTED` adds only). Delivered as `THREAT-MODEL.UPDATED.md` per the
  #93 precedent.
- The misstating comment is at `src/lib/repo.ts:37-38` (the doc block at `:25-42`), not the
  options-and-cleanup block at `:52-66`.

## One interim error of my own

Mid-run I floated that 3.6.6 might spawn no git binary at all. Wrong — I had searched 2 of 4 chunks
and flagged it as provisional; the spawn is in `client-C95Y-jLv.js`.
