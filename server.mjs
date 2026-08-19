/**
 * AI Tools Reference — local web server
 * Run: node server.mjs
 * Access: http://localhost:3333
 */

import { createServer } from 'http'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname, extname, basename, resolve, sep } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const PORT = 3333

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
}

// ── Skills proxy cache ────────────────────────────────────────────────────────
const skillsCache = new Map() // query → {data, ts}
const descCache = new Map()   // skill id → description string (24h TTL)
const SKILLS_TTL = 10 * 60 * 1000
const DESC_TTL   = 24 * 60 * 60 * 1000

async function fetchSkillDesc(id) {
  const hit = descCache.get(id)
  if (hit && Date.now() - hit.ts < DESC_TTL) return hit.desc
  const [owner, repo, ...rest] = id.split('/')
  const skillId = rest.join('/')
  const branches = ['main', 'master']
  const paths = [`skills/${skillId}/SKILL.md`, `SKILL.md`]
  for (const branch of branches) {
    for (const path of paths) {
      try {
        const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`)
        if (!r.ok) continue
        const text = await r.text()
        const m = text.match(/^---[\s\S]*?description:\s*(.+?)(?:\n|\r|$)/m)
        const desc = m ? m[1].trim().replace(/^["']|["']$/g,'') : ''
        descCache.set(id, { desc, ts: Date.now() })
        return desc
      } catch { continue }
    }
  }
  descCache.set(id, { desc: '', ts: Date.now() })
  return ''
}

async function withDescriptions(skills) {
  // Fetch in parallel, max 15 at a time
  const chunks = []
  for (let i = 0; i < skills.length; i += 15) chunks.push(skills.slice(i, i + 15))
  const result = []
  for (const chunk of chunks) {
    const descs = await Promise.allSettled(chunk.map(s => fetchSkillDesc(s.id)))
    chunk.forEach((s, i) => result.push({ ...s, description: descs[i].value || '' }))
  }
  return result
}

async function fetchSkills(query) {
  const key = query.toLowerCase().trim()
  const cached = skillsCache.get(key)
  if (cached && Date.now() - cached.ts < SKILLS_TTL) return cached.data
  const url = `https://skills.sh/api/search?q=${encodeURIComponent(key)}&limit=50`
  const res = await fetch(url)
  if (!res.ok) return []
  const d = await res.json()
  const data = (d.skills || []).map(s => ({
    id: s.id,
    name: s.name,
    source: s.source || '',
    installs: s.installs || 0,
    installCmd: `npx skills add ${s.source || s.id}`,
    url: `https://skills.sh/${s.id}`,
  }))
  skillsCache.set(key, { data, ts: Date.now() })
  return data
}

const SEED_QUERIES = ['design', 'claude', 'browser', 'image', 'video', 'code']

async function apiSkillsTop() {
  const all = new Map()
  await Promise.allSettled(SEED_QUERIES.map(q => fetchSkills(q).then(results => {
    results.forEach(s => { if (!all.has(s.id)) all.set(s.id, s) })
  })))
  const sorted = [...all.values()].sort((a, b) => b.installs - a.installs).slice(0, 100)
  return withDescriptions(sorted)
}

// ── API ───────────────────────────────────────────────────────────────────────

function apiTools() {
  const tools = JSON.parse(readFileSync(join(__dir, 'data/tools.json'), 'utf8'))
  const transcriptsDir = join(__dir, 'data/transcripts')
  const tFiles = existsSync(transcriptsDir)
    ? readdirSync(transcriptsDir).filter(f => f.endsWith('.txt'))
    : []

  // Matching an entry to its transcript file is fiddly because the filename is
  // derived from whatever URL was passed at ingest - sometimes carrying an
  // ?igsh= tracking parameter, sometimes not, and always truncated to 80 chars.
  // Comparing the part before any query, on whichever is shorter, matches the
  // same post however it was linked. Without this, transcripts written today
  // showed up in search with no entry attached at all.
  const slugify = s => (s || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
  const fileKeys = tFiles.map(f => ({ file: f, key: slugify(f.replace('.txt', '')) }))

  return tools.map(t => {
    const key = slugify((t.source || '').split('?')[0])
    if (!key) return { ...t, transcriptSlug: null }
    const match = fileKeys.find(({ key: fk }) => {
      const n = Math.min(key.length, fk.length, 60)
      return n >= 20 && key.slice(0, n) === fk.slice(0, n)
    })
    return { ...t, transcriptSlug: match ? match.file.replace('.txt', '') : null }
  })
}

/**
 * Search what was actually SAID across the whole archive.
 *
 * This is the thing the archive exists for. Titles and post captions are
 * marketing; the transcript is the content. Searching a phrase here finds the
 * post where someone said it, and returns the sentence around it as proof.
 *
 * The index is built in memory and cached against the newest transcript file,
 * so it rebuilds only when something has actually been archived. 200-odd short
 * transcripts is well under a megabyte - a database would be more machinery
 * than the problem needs.
 */
let INDEX = null
let INDEX_STAMP = ''

/**
 * Collapse rollup-caption repetition at read time.
 *
 * Transcripts written before the parser was fixed contain every phrase two or
 * three times, because YouTube's auto-captions repeat the previous line with one
 * more word appended. Cleaning here means the archive reads correctly now,
 * without rewriting files while a backfill is running against them.
 */
function deRollup(text) {
  // Strip the VTT preamble. It survives inside the body rather than on its own
  // line, because the original parser joined every line together first.
  // Captions arrive HTML-escaped. Left as-is they get escaped a second time on
  // the way to the page and render as literal "&gt;&gt;" in the middle of a
  // sentence. ">>" is a caption speaker-change marker, not speech, so it goes.
  const cleaned = text
    .replace(/^\s*(Kind:\s*\S+\s*)?(Language:\s*\S+\s*)?/i, '')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, m => ({
      '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
      '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
    }[m] || m))
    .replace(/>>+/g, ' ')
    .replace(/\s+/g, ' ')

  const w = cleaned.split(/\s+/).filter(Boolean)
  const out = []
  let i = 0
  while (i < w.length) {
    // Does the run about to be read repeat the run just written? Longest match
    // first, so "you couldn't easily diagnose" collapses as a unit rather than
    // word by word.
    let skip = 0
    for (let len = Math.min(20, out.length, w.length - i); len >= 3; len--) {
      let same = true
      for (let k = 0; k < len; k++) {
        if (out[out.length - len + k] !== w[i + k]) { same = false; break }
      }
      if (same) { skip = len; break }
    }
    if (skip) { i += skip; continue }
    out.push(w[i]); i++
  }
  return out.join(' ')
}


function buildIndex() {
  const dir = join(__dir, 'data/transcripts')
  const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.txt')) : []
  const stamp = files
    .map(f => `${f}:${statSync(join(dir, f)).mtimeMs}`)
    .sort()
    .join('|')
  if (INDEX && stamp === INDEX_STAMP) return INDEX

  const tools = apiTools()
  INDEX = files.map(f => {
    const raw = readFileSync(join(dir, f), 'utf8')
    // Everything after the header block is the transcript itself.
    const body = deRollup(
      raw.split('\n\n').slice(1).join(' ').replace(/\s+/g, ' ').trim())
    const slug = f.replace('.txt', '')
    const entry = tools.find(t => t.transcriptSlug === slug)
    return {
      slug,
      body,
      lower: body.toLowerCase(),
      entry: entry || null,
    }
  })
  INDEX_STAMP = stamp
  return INDEX
}

function searchTranscripts(q, { category = '', platform = '', limit = 60 } = {}) {
  const query = String(q || '').trim().toLowerCase()
  if (!query) return []

  // Quoted text means that exact phrase. Otherwise every word must appear
  // somewhere in the transcript - an AND, because an OR across six common words
  // returns the whole archive and is no use to anybody.
  const phrase = /^".+"$/.test(query)
  const terms = phrase ? [query.slice(1, -1)] : query.split(/\s+/).filter(Boolean)

  const out = []
  for (const doc of buildIndex()) {
    if (!terms.every(term => doc.lower.includes(term))) continue
    const e = doc.entry
    if (category && e?.category !== category) continue
    if (platform && e?.platform !== platform) continue

    // Show the sentence the first match sits in, so the result carries its own
    // evidence rather than asking you to open it to find out why it matched.
    const at = doc.lower.indexOf(terms[0])
    const from = Math.max(0, doc.body.lastIndexOf('.', at - 1) + 1)
    let to = doc.body.indexOf('.', at + terms[0].length)
    if (to < 0 || to - from > 400) to = Math.min(doc.body.length, at + 260)
    const snippet = doc.body.slice(from, to + 1).trim()

    out.push({
      slug: doc.slug,
      snippet,
      hits: terms.reduce((n, term) => n + doc.lower.split(term).length - 1, 0),
      entry: e && {
        id: e.id, name: e.name, category: e.category, content_type: e.content_type,
        platform: e.platform, source: e.source, link: e.link,
        ingested_at: e.ingested_at, added: e.added, transcribed: e.transcribed,
      },
    })
  }

  // Most mentions first: a post that says the word once is usually an aside,
  // one that says it nine times is about it.
  return out.sort((a, b) => b.hits - a.hits).slice(0, limit)
}

function apiTranscripts() {
  const dir = join(__dir, 'data/transcripts')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.txt'))
    .map(f => {
      const lines = readFileSync(join(dir, f), 'utf8').split('\n')
      const get = (prefix) => (lines.find(l => l.startsWith(prefix)) || '').slice(prefix.length)
      return {
        slug: f.replace('.txt', ''),
        source: get('Source: '),
        title: get('Title: '),
        channel: get('Channel: '),
        words: readFileSync(join(dir, f), 'utf8').split(/\s+/).length,
        modified: statSync(join(dir, f)).mtime.toISOString(),
      }
    })
    .sort((a, b) => b.modified.localeCompare(a.modified))
}

function apiTranscript(slug) {
  const file = join(__dir, 'data/transcripts', slug + '.txt')
  if (!existsSync(file)) return null
  const raw = readFileSync(file, 'utf8')
  // Same cleaning the search index applies, so what you read matches what you
  // searched. Files written before the caption parser was fixed repeat every
  // phrase two or three times.
  const [head, ...rest] = raw.split('\n\n')
  return `${head}\n\n${deRollup(rest.join(' ').replace(/\s+/g, ' ').trim())}\n`
}

function apiScreenshots() {
  // Check both possible screenshot directories
  const dirs = [join(__dir, 'screenshots'), join(__dir, 'data/screenshots')]
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    const files = readdirSync(dir).filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    if (files.length) return files.map(f => ({ filename: f }))
  }
  return []
}

function apiStats() {
  const tools = JSON.parse(readFileSync(join(__dir, 'data/tools.json'), 'utf8'))
  const transcriptsDir = join(__dir, 'data/transcripts')
  const transcripts = existsSync(transcriptsDir)
    ? readdirSync(transcriptsDir).filter(f => f.endsWith('.txt')).length : 0
  const ss = apiScreenshots()
  // The 'Categories' stat used to count content_type, which is a different axis
  // and always read ~6. Count real categories, and expose a fingerprint so the
  // client poll notices a re-categorisation even when no entries were added.
  const cats = [...new Set(tools.map(t => t.category).filter(Boolean))]
  return {
    tools: tools.length,
    transcripts,
    screenshots: ss.length,
    categories: cats.length,
    categoryFingerprint: cats.sort().join('|'),
  }
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname

  const json = (data) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify(data))
  }

  try {
    if (path === '/' || path === '/index.html') {
      // One server, two front doors. research.jambles.com opens on the search,
      // because the question there is "what did anyone say about X". ait keeps
      // the browsable tool grid it has always had, and its links keep working.
      //
      // The proxy forwards the original Host, so this reads the real hostname
      // rather than localhost.
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
      const page = host.startsWith('research.') ? 'research.html' : 'app.html'
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache, no-store, must-revalidate' })
      res.end(readFileSync(join(__dir, page), 'utf8'))
      return
    }

    // Either page is reachable by name from either host, so the search can be
    // linked to directly and the grid is never stranded.
    if (path === '/research' || path === '/search') {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' })
      res.end(readFileSync(join(__dir, 'research.html'), 'utf8'))
      return
    }
    if (path === '/tools' || path === '/archive') {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' })
      res.end(readFileSync(join(__dir, 'app.html'), 'utf8'))
      return
    }

    if (path === '/api/tools')       { json(apiTools());       return }
    if (path === '/api/transcripts') { json(apiTranscripts()); return }

    if (path === '/api/search') {
      const p = new URL(req.url, 'http://localhost').searchParams
      json({
        query: p.get('q') || '',
        results: searchTranscripts(p.get('q'), {
          category: p.get('category') || '',
          platform: p.get('platform') || '',
          limit: Math.min(Number(p.get('limit')) || 60, 200),
        }),
      })
      return
    }
    if (path === '/api/screenshots') { json(apiScreenshots()); return }
    if (path === '/api/stats')       { json(apiStats());       return }

    if (path === '/api/skills') {
      const q = url.searchParams.get('q') || ''
      const raw = q.length >= 2 ? await fetchSkills(q) : await apiSkillsTop()
      const results = q.length >= 2 ? await withDescriptions(raw) : raw
      json(results); return
    }

    if (path.startsWith('/api/transcripts/')) {
      const slug = basename(decodeURIComponent(path.slice('/api/transcripts/'.length)))
      const text = apiTranscript(slug)
      if (!text) { res.writeHead(404); res.end('Not found'); return }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(text)
      return
    }

    if (path.startsWith('/screenshots/')) {
      // Only ever a bare filename. Before this, an encoded traversal
      // (/screenshots/..%2f.env) escaped the directory and served .env with the
      // API keys in it to anyone on the internet. new URL() normalises a plain
      // ../ but not a percent-encoded one, and the decode happened after the
      // slice - so the guard has to be here, on the decoded value.
      const requested = decodeURIComponent(path.slice('/screenshots/'.length))
      const name = basename(requested)
      if (!name || name !== requested) { res.writeHead(400); res.end('Bad request'); return }

      const dirs = [join(__dir, 'screenshots'), join(__dir, 'data/screenshots')]
      let found = null
      for (const d of dirs) {
        const f = join(d, name)
        // Belt and braces: the resolved path must still sit inside the directory.
        if (resolve(f).startsWith(resolve(d) + sep) && existsSync(f)) { found = f; break }
      }
      if (!found) { res.writeHead(404); res.end('Not found'); return }
      const ext = extname(found).toLowerCase()
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
      res.end(readFileSync(found))
      return
    }

    res.writeHead(404); res.end('Not found')
  } catch (err) {
    console.error(err)
    res.writeHead(500); res.end(String(err))
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`AI Tools Reference → http://localhost:${PORT}`)
  console.log(`Tailscale           → http://100.89.17.28:${PORT}`)
})
