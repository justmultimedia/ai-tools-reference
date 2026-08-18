# 2026-08-18-001 — Path traversal was serving .env to the public internet

## Date
2026-08-18

## What happened
`ait.jambles.com` was publicly readable and returning the project's `.env` file,
containing `ANTHROPIC_API_KEY` and `TWELVELABS_API_KEY`, to anyone who asked for
the right URL.

Found while reviewing what was actually exposed on the shared Cloudflare tunnel,
after taking a WordPress site off it. The question was "is `ait` being open a
risk?" — the answer turned out to be yes, and not for the reason expected.

## The bug

`server.mjs` served screenshots like this:

```js
const name = decodeURIComponent(path.slice('/screenshots/'.length))
const f = join(d, name)
if (existsSync(f)) { found = f; break }
res.end(readFileSync(found))
```

`new URL()` normalises a plain `../` away, so `/screenshots/../.env` returned
404 and the handler looked safe. But the decode happens **after** the slice, so
a percent-encoded traversal survives:

```
GET /screenshots/..%2f.env   ->  decodes to ../.env  ->  join() escapes  ->  .env
```

Confirmed exploitable against the running site before changing anything, and
confirmed blocked from the public internet afterwards, in four encodings.

## The fix
Only a bare filename is accepted — `basename()`, and the decoded value must
equal it, so anything containing a path separator is rejected outright. Belt and
braces, the resolved path must still sit inside the screenshots directory. Same
treatment applied to the transcript slug.

## What this cost, and what to do
**Both keys must be rotated. Treat them as compromised.** The site has been up
for some time and there is no way to know whether anyone requested that path.
Check billing on both accounts.

## Why it is worth writing down
The server has no POST handler and never shells out, so it looked harmless —
and by the usual measures it was. The whole risk sat in one line where a decode
happened on the wrong side of a slice.

The general lesson: "read-only" is not the same as "safe". A read-only server
that can be talked into reading the wrong file is exactly as bad as one that can
be talked into writing.

## What comes next
- Rotate both keys (Eoin).
- Consider whether `ait` should stay publicly readable at all; it is open by
  choice, but it now holds transcripts and screenshots as well as the tool list.
