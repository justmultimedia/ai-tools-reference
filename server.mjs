/**
 * AI Tools Reference — local web server
 * Run: node server.mjs
 * Access: http://localhost:3333
 */

import { createServer } from 'http'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname, extname } from 'path'
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
const SKILLS_TTL = 10 * 60 * 1000 // 10 minutes

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
  return [...all.values()].sort((a, b) => b.installs - a.installs).slice(0, 100)
}

// ── API ───────────────────────────────────────────────────────────────────────

function apiTools() {
  const tools = JSON.parse(readFileSync(join(__dir, 'data/tools.json'), 'utf8'))
  const transcriptsDir = join(__dir, 'data/transcripts')
  const tFiles = existsSync(transcriptsDir)
    ? readdirSync(transcriptsDir).filter(f => f.endsWith('.txt'))
    : []

  return tools.map(t => {
    const srcSlug = (t.source || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80)
    const match = tFiles.find(f => f.replace('.txt', '') === srcSlug || f.startsWith(srcSlug.slice(0, 30)))
    return { ...t, transcriptSlug: match ? match.replace('.txt', '') : null }
  })
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
  return readFileSync(file, 'utf8')
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
  const cats = [...new Set(tools.map(t => t.category))]
  return { tools: tools.length, transcripts, screenshots: ss.length, categories: cats.length }
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
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(readFileSync(join(__dir, 'app.html'), 'utf8'))
      return
    }

    if (path === '/api/tools')       { json(apiTools());       return }
    if (path === '/api/transcripts') { json(apiTranscripts()); return }
    if (path === '/api/screenshots') { json(apiScreenshots()); return }
    if (path === '/api/stats')       { json(apiStats());       return }

    if (path === '/api/skills') {
      const q = url.searchParams.get('q') || ''
      const results = q.length >= 2 ? await fetchSkills(q) : await apiSkillsTop()
      json(results); return
    }

    if (path.startsWith('/api/transcripts/')) {
      const slug = decodeURIComponent(path.slice('/api/transcripts/'.length))
      const text = apiTranscript(slug)
      if (!text) { res.writeHead(404); res.end('Not found'); return }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(text)
      return
    }

    if (path.startsWith('/screenshots/')) {
      const name = decodeURIComponent(path.slice('/screenshots/'.length))
      const dirs = [join(__dir, 'screenshots'), join(__dir, 'data/screenshots')]
      let found = null
      for (const d of dirs) {
        const f = join(d, name)
        if (existsSync(f)) { found = f; break }
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
