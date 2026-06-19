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

// ── API handlers ──────────────────────────────────────────────────────────────

function apiTools() {
  const tools = JSON.parse(readFileSync(join(__dir, 'data/tools.json'), 'utf8'))
  const transcriptsDir = join(__dir, 'data/transcripts')
  const transcriptFiles = existsSync(transcriptsDir)
    ? readdirSync(transcriptsDir).filter(f => f.endsWith('.txt'))
    : []

  return tools.map(t => ({
    ...t,
    hasTranscript: transcriptFiles.some(f => f.includes(
      (t.source || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40)
    )),
    transcriptSlug: (() => {
      const slug = (t.source || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80)
      const match = transcriptFiles.find(f => f.startsWith(slug.slice(0, 30)))
      return match ? match.replace('.txt', '') : null
    })(),
  }))
}

function apiTranscripts() {
  const dir = join(__dir, 'data/transcripts')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.txt'))
    .map(f => {
      const content = readFileSync(join(dir, f), 'utf8')
      const lines = content.split('\n')
      return {
        slug: f.replace('.txt', ''),
        source: (lines.find(l => l.startsWith('Source:')) || '').replace('Source: ', ''),
        title: (lines.find(l => l.startsWith('Title:')) || '').replace('Title: ', ''),
        channel: (lines.find(l => l.startsWith('Channel:')) || '').replace('Channel: ', ''),
        words: content.split(/\s+/).length,
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
  const dir = join(__dir, 'screenshots')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .map(f => ({ filename: f, url: `/screenshots/${f}` }))
}

function apiStats() {
  const tools = JSON.parse(readFileSync(join(__dir, 'data/tools.json'), 'utf8'))
  const transcriptsDir = join(__dir, 'data/transcripts')
  const transcripts = existsSync(transcriptsDir) ? readdirSync(transcriptsDir).filter(f => f.endsWith('.txt')).length : 0
  const screenshotsDir = join(__dir, 'screenshots')
  const screenshots = existsSync(screenshotsDir) ? readdirSync(screenshotsDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).length : 0
  const cats = [...new Set(tools.map(t => t.category))]
  return { tools: tools.length, transcripts, screenshots, categories: cats.length }
}

// ── HTML app ──────────────────────────────────────────────────────────────────

const APP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Tools Reference</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0b0d14;--surface:#13161f;--surface2:#1a1d2a;--border:#252836;
  --text:#e0e3f0;--muted:#6b6f8e;--accent:#7c6af7;--blue:#5eaeff;
  --green:#3dd68c;--orange:#f5a524;--red:#ef4444;
  --font:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --mono:'SF Mono','Fira Code',monospace;
  --sidebar:260px;
}
html,body{height:100%;overflow:hidden}
body{font-family:var(--font);background:var(--bg);color:var(--text);display:flex;flex-direction:column}

/* ── top bar ── */
.topbar{
  height:52px;background:var(--surface);border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:16px;padding:0 20px;flex-shrink:0;z-index:20;
}
.topbar h1{font-size:15px;font-weight:700;letter-spacing:-.2px;flex:1}
.topbar .stats{display:flex;gap:10px}
.stat{font-size:11px;color:var(--muted);background:var(--surface2);padding:3px 8px;border-radius:20px;white-space:nowrap}
.stat b{color:var(--text);font-weight:600}
.search-wrap{position:relative}
.search-wrap input{
  background:var(--surface2);border:1px solid var(--border);border-radius:8px;
  color:var(--text);font-size:13px;padding:6px 10px 6px 28px;width:220px;outline:none;
}
.search-wrap input:focus{border-color:var(--accent)}
.search-wrap input::placeholder{color:var(--muted)}
.search-icon{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:13px;pointer-events:none}

/* ── layout ── */
.body{display:flex;flex:1;overflow:hidden}

/* ── sidebar ── */
.sidebar{
  width:var(--sidebar);flex-shrink:0;background:var(--surface);border-right:1px solid var(--border);
  display:flex;flex-direction:column;overflow:hidden;
}
.sidebar-section{padding:12px 12px 6px;border-bottom:1px solid var(--border)}
.sidebar-label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px;font-weight:600}
.nav-item{
  display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;
  cursor:pointer;font-size:13px;color:var(--muted);transition:all .12s;
  -webkit-tap-highlight-color:transparent;user-select:none;
}
.nav-item:hover{background:var(--surface2);color:var(--text)}
.nav-item.active{background:rgba(124,106,247,.15);color:var(--accent)}
.nav-item .badge{margin-left:auto;font-size:10px;background:var(--surface2);padding:1px 6px;border-radius:10px;color:var(--muted)}
.nav-item.active .badge{background:rgba(124,106,247,.2);color:var(--accent)}
.nav-icon{font-size:14px;width:18px;text-align:center}

/* ── main ── */
.main{flex:1;overflow-y:auto;padding:20px}

/* ── tool grid ── */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px}

/* ── tool card ── */
.card{
  background:var(--surface);border:1px solid var(--border);border-radius:14px;
  overflow:hidden;transition:border-color .15s, box-shadow .15s;cursor:pointer;
}
.card:hover{border-color:#353850;box-shadow:0 4px 20px rgba(0,0,0,.3)}
.card.expanded{border-color:var(--accent)}
.card-head{padding:14px 16px;display:flex;gap:12px;align-items:flex-start}
.card-icon{
  width:38px;height:38px;border-radius:10px;background:var(--surface2);
  display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;
}
.card-info{flex:1;min-width:0}
.card-name{font-size:14px;font-weight:600;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-badges{display:flex;gap:5px;flex-wrap:wrap}
.badge{font-size:10px;padding:2px 7px;border-radius:5px;font-weight:500;white-space:nowrap}
.b-cat{background:#1d2a4a;color:var(--blue)}
.b-type{background:#1d2a30;color:#4cd9b0}
.b-status{background:#1a2c1e;color:var(--green)}
.card-desc{padding:0 16px 12px;font-size:12.5px;color:#9ea3c0;line-height:1.55}
.card-body{padding:0 16px 14px;display:none}
.card.expanded .card-body{display:block}
.card-body .install{
  background:#0d0f1a;border-radius:8px;padding:8px 10px;margin-bottom:10px;
  display:flex;align-items:center;gap:8px;
}
.install-label{font-size:10px;color:var(--muted);flex-shrink:0}
.install-cmd{font-family:var(--mono);font-size:11.5px;color:#82e09e;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.copy-btn{background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;flex-shrink:0;padding:2px}
.copy-btn:active{color:var(--green)}
.section-label{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:6px;font-weight:600}
.use-cases{list-style:none;margin-bottom:10px}
.use-cases li{font-size:12px;color:#9ea3c0;padding:3px 0;padding-left:12px;position:relative;line-height:1.4}
.use-cases li::before{content:'→';position:absolute;left:0;color:var(--muted)}
.tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px}
.tag{background:var(--surface2);border-radius:4px;color:var(--muted);font-size:10.5px;padding:2px 7px}
.works-chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px}
.works-chip{background:#1d2a4a;border-radius:4px;color:var(--blue);font-size:10.5px;padding:2px 7px}
.card-link{display:block;color:var(--blue);font-size:11.5px;margin-bottom:8px;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.transcript-btn{
  width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:8px;
  color:var(--muted);cursor:pointer;font-size:12px;padding:7px 10px;text-align:left;
  transition:all .12s;
}
.transcript-btn:hover{border-color:var(--accent);color:var(--accent)}
.card-footer{padding:0 16px 12px;display:flex;gap:6px}
.card-footer-tag{font-size:10px;color:var(--muted);background:var(--surface2);padding:2px 7px;border-radius:10px}

/* ── transcript panel ── */
.panel-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100;display:none;align-items:center;justify-content:center}
.panel-overlay.open{display:flex}
.panel{
  background:var(--surface);border:1px solid var(--border);border-radius:16px;
  width:min(720px,95vw);max-height:85vh;display:flex;flex-direction:column;
}
.panel-head{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px}
.panel-title{flex:1;font-size:14px;font-weight:600}
.panel-close{background:none;border:none;color:var(--muted);cursor:pointer;font-size:20px;line-height:1;padding:4px}
.panel-body{padding:20px;overflow-y:auto;flex:1}
.transcript-meta{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
.transcript-text{font-size:13px;color:#9ea3c0;line-height:1.7;white-space:pre-wrap;font-family:var(--mono)}

/* ── screenshots view ── */
.screenshots-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.screenshot-card{
  background:var(--surface);border:1px solid var(--border);border-radius:10px;
  overflow:hidden;cursor:pointer;transition:border-color .15s;
}
.screenshot-card:hover{border-color:#353850}
.screenshot-card img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:var(--surface2)}
.screenshot-name{font-size:11px;color:var(--muted);padding:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ── transcripts list ── */
.transcript-list{display:flex;flex-direction:column;gap:8px}
.titem{
  background:var(--surface);border:1px solid var(--border);border-radius:10px;
  padding:12px 16px;cursor:pointer;transition:border-color .15s;display:flex;gap:12px;align-items:center;
}
.titem:hover{border-color:#353850}
.titem-info{flex:1;min-width:0}
.titem-title{font-size:13px;font-weight:500;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.titem-meta{font-size:11px;color:var(--muted)}
.titem-words{font-size:11px;color:var(--muted);background:var(--surface2);padding:2px 8px;border-radius:10px;white-space:nowrap}

.empty{text-align:center;color:var(--muted);padding:60px 0;font-size:14px}
.loading{text-align:center;color:var(--muted);padding:60px 0}

.view{display:none}
.view.active{display:block}
</style>
</head>
<body>

<div class="topbar">
  <h1>AI Tools Reference</h1>
  <div class="stats" id="stats"></div>
  <div class="search-wrap">
    <span class="search-icon">⌕</span>
    <input type="search" id="q" placeholder="Search tools…" autocomplete="off">
  </div>
</div>

<div class="body">
  <aside class="sidebar">
    <div class="sidebar-section">
      <div class="sidebar-label">Browse</div>
      <div class="nav-item active" data-view="tools" data-cat="all" onclick="nav(this)">
        <span class="nav-icon">🗂</span> All Tools <span class="badge" id="nav-all">0</span>
      </div>
    </div>
    <div class="sidebar-section" style="flex:1;overflow-y:auto">
      <div class="sidebar-label">Categories</div>
      <div id="cats"></div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-label">Data</div>
      <div class="nav-item" data-view="transcripts" onclick="nav(this)">
        <span class="nav-icon">📝</span> Transcripts <span class="badge" id="nav-trans">0</span>
      </div>
      <div class="nav-item" data-view="screenshots" onclick="nav(this)">
        <span class="nav-icon">🖼</span> Screenshots <span class="badge" id="nav-shots">0</span>
      </div>
    </div>
  </aside>

  <main class="main">
    <div class="view active" id="view-tools">
      <div class="grid" id="grid"><p class="loading">Loading…</p></div>
    </div>
    <div class="view" id="view-transcripts">
      <div class="transcript-list" id="tlist"><p class="loading">Loading…</p></div>
    </div>
    <div class="view" id="view-screenshots">
      <div class="screenshots-grid" id="ssgrid"><p class="loading">Loading…</p></div>
    </div>
  </main>
</div>

<!-- transcript panel -->
<div class="panel-overlay" id="overlay" onclick="closePanel(event)">
  <div class="panel">
    <div class="panel-head">
      <div class="panel-title" id="panel-title"></div>
      <button class="panel-close" onclick="closePanel()">×</button>
    </div>
    <div class="panel-body" id="panel-body"></div>
  </div>
</div>

<script>
const ICONS = {
  design:'🎨',animation:'✨','browser-automation':'🌐','document-conversion':'📄',
  networking:'🔗',media:'🎬','ai-video':'🎥','claude-workflow':'🤖',
  'image-generation':'🖼️','image-processing':'📷','local-llm':'💻',other:'🔧'
}
const CAT_COLORS = {
  design:'#1d2a4a/var(--blue)',animation:'#2a1d4a/var(--accent)','browser-automation':'#1d2a30/#4cd9b0',
  'document-conversion':'#2a2a1d/#f5c842',networking:'#1d2a24/var(--green)','local-llm':'#2a1d1d/var(--red)',
}

let allTools = [], allTranscripts = [], allScreenshots = []
let currentCat = 'all', currentView = 'tools', expandedId = null

async function load() {
  const [tools, transcripts, screenshots, stats] = await Promise.all([
    fetch('/api/tools').then(r=>r.json()),
    fetch('/api/transcripts').then(r=>r.json()),
    fetch('/api/screenshots').then(r=>r.json()),
    fetch('/api/stats').then(r=>r.json()),
  ])
  allTools = tools; allTranscripts = transcripts; allScreenshots = screenshots

  document.getElementById('stats').innerHTML = [
    \`<span class="stat"><b>\${stats.tools}</b> tools</span>\`,
    \`<span class="stat"><b>\${stats.transcripts}</b> transcripts</span>\`,
    \`<span class="stat"><b>\${stats.screenshots}</b> screenshots</span>\`,
    \`<span class="stat"><b>\${stats.categories}</b> categories</span>\`,
  ].join('')

  document.getElementById('nav-all').textContent = tools.length
  document.getElementById('nav-trans').textContent = transcripts.length
  document.getElementById('nav-shots').textContent = screenshots.length

  buildCats()
  renderTools()
  renderTranscripts()
  renderScreenshots()
}

function buildCats() {
  const counts = {}
  allTools.forEach(t => { counts[t.category] = (counts[t.category]||0)+1 })
  const cats = Object.entries(counts).sort((a,b) => b[1]-a[1])
  document.getElementById('cats').innerHTML = cats.map(([c,n]) =>
    \`<div class="nav-item" data-view="tools" data-cat="\${c}" onclick="nav(this)">
      <span class="nav-icon">\${ICONS[c]||'🔧'}</span> \${c} <span class="badge">\${n}</span>
    </div>\`
  ).join('')
}

function nav(el) {
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'))
  el.classList.add('active')
  const view = el.dataset.view || 'tools'
  currentCat = el.dataset.cat || 'all'
  currentView = view
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'))
  document.getElementById('view-'+view).classList.add('active')
  if (view === 'tools') renderTools()
}

function renderTools() {
  const q = document.getElementById('q').value.toLowerCase()
  const tools = allTools.filter(t => {
    if (currentCat !== 'all' && t.category !== currentCat) return false
    if (!q) return true
    return [t.name,t.description,...(t.tags||[]),...(t.use_cases||[]),t.category,t.type]
      .some(s => s && s.toLowerCase().includes(q))
  })
  const grid = document.getElementById('grid')
  if (!tools.length) { grid.innerHTML='<p class="empty">No tools match.</p>'; return }
  grid.innerHTML = tools.map(t => cardHTML(t)).join('')
  document.getElementById('nav-all').textContent = tools.length
}

function cardHTML(t) {
  const isExpanded = expandedId === t.id
  return \`<div class="card\${isExpanded?' expanded':''}" id="card-\${t.id}" onclick="toggleCard('\${t.id}')">
    <div class="card-head">
      <div class="card-icon">\${ICONS[t.category]||'🔧'}</div>
      <div class="card-info">
        <div class="card-name">\${esc(t.name)}</div>
        <div class="card-badges">
          <span class="badge b-cat">\${esc(t.category)}</span>
          \${t.type?'<span class="badge b-type">'+esc(t.type)+'</span>':''}
          \${t.status?'<span class="badge b-status">'+esc(t.status)+'</span>':''}
        </div>
      </div>
    </div>
    \${t.description?'<p class="card-desc">'+esc(t.description)+'</p>':''}
    <div class="card-body">
      \${t.install?'<div class="install"><span class="install-label">install</span><span class="install-cmd">'+esc(t.install)+'</span><button class="copy-btn" onclick="cp(event,\\''+esc(t.install)+'\\')" title="Copy">⎘</button></div>':''}
      \${t.works_with?.length?'<div class="section-label">Works with</div><div class="works-chips">'+t.works_with.map(w=>'<span class="works-chip">'+esc(w)+'</span>').join('')+'</div>':''}
      \${t.use_cases?.length?'<div class="section-label">Use cases</div><ul class="use-cases">'+t.use_cases.map(u=>'<li>'+esc(u)+'</li>').join('')+'</ul>':''}
      \${t.tags?.length?'<div class="tags">'+t.tags.map(tg=>'<span class="tag">'+esc(tg)+'</span>').join('')+'</div>':''}
      \${t.link?'<a class="card-link" href="'+esc(t.link)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">'+esc(t.link)+'</a>':''}
      \${t.notes?'<p style="font-size:11.5px;color:var(--muted);margin-bottom:8px">'+esc(t.notes)+'</p>':''}
      \${t.transcriptSlug?'<button class="transcript-btn" onclick="openTranscript(event,\\''+t.transcriptSlug+'\\',\\''+esc(t.name)+'\\')">📝 View source transcript</button>':''}
    </div>
    <div class="card-footer">
      \${t.added?'<span class="card-footer-tag">Added '+esc(t.added)+'</span>':''}
      \${t.source?'<span class="card-footer-tag">from YouTube</span>':''}
      \${t.transcriptSlug?'<span class="card-footer-tag">has transcript</span>':''}
    </div>
  </div>\`
}

function toggleCard(id) {
  expandedId = expandedId === id ? null : id
  renderTools()
  if (expandedId) {
    setTimeout(() => {
      const el = document.getElementById('card-'+id)
      if (el) el.scrollIntoView({behavior:'smooth',block:'nearest'})
    }, 50)
  }
}

function renderTranscripts() {
  if (!allTranscripts.length) { document.getElementById('tlist').innerHTML='<p class="empty">No transcripts yet.</p>'; return }
  document.getElementById('tlist').innerHTML = allTranscripts.map(t => \`
    <div class="titem" onclick="openTranscript(null,'\${t.slug}','\${esc(t.title||t.slug)}')">
      <div class="titem-info">
        <div class="titem-title">\${esc(t.title||t.slug)}</div>
        <div class="titem-meta">\${esc(t.channel)} · \${new Date(t.modified).toLocaleDateString()}</div>
      </div>
      <span class="titem-words">\${t.words} words</span>
    </div>\`).join('')
}

function renderScreenshots() {
  const grid = document.getElementById('ssgrid')
  if (!allScreenshots.length) { grid.innerHTML='<p class="empty">No screenshots yet.</p>'; return }
  grid.innerHTML = allScreenshots.map(s => \`
    <div class="screenshot-card" onclick="window.open('/screenshots/\${s.filename}','_blank')">
      <img src="/screenshots/\${s.filename}" alt="\${s.filename}" loading="lazy">
      <div class="screenshot-name">\${s.filename.replace(/[-_]/g,' ').replace(/\\.\\w+$/,'')}</div>
    </div>\`).join('')
}

async function openTranscript(e, slug, title) {
  if (e) e.stopPropagation()
  document.getElementById('panel-title').textContent = title
  document.getElementById('panel-body').innerHTML = '<p class="loading">Loading…</p>'
  document.getElementById('overlay').classList.add('open')
  const text = await fetch('/api/transcripts/'+slug).then(r=>r.text())
  const lines = text.split('\\n')
  const meta = lines.slice(0,3).filter(Boolean)
  const body = lines.slice(4).join('\\n').trim()
  const src = (meta.find(l=>l.startsWith('Source:'))||'').replace('Source: ','')
  document.getElementById('panel-body').innerHTML = \`
    <div class="transcript-meta">
      \${meta.map(m=>'<span class="badge b-cat">'+esc(m)+'</span>').join('')}
      \${src?'<a href="'+esc(src)+'" target="_blank" class="badge b-type" style="text-decoration:none">▶ Source video</a>':''}
    </div>
    <div class="transcript-text">\${esc(body)}</div>\`
}

function closePanel(e) {
  if (e && e.target !== document.getElementById('overlay')) return
  document.getElementById('overlay').classList.remove('open')
}

function cp(e, text) {
  e.stopPropagation()
  navigator.clipboard.writeText(text).catch(()=>{})
  e.target.textContent = '✓'
  setTimeout(()=>e.target.textContent='⎘', 1200)
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

document.getElementById('q').addEventListener('input', renderTools)
load()
</script>
</body>
</html>`

// ── Server ────────────────────────────────────────────────────────────────────

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname

  const json = (data) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify(data))
  }

  try {
    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(APP_HTML)
      return
    }

    if (path === '/api/tools') { json(apiTools()); return }
    if (path === '/api/transcripts') { json(apiTranscripts()); return }
    if (path === '/api/stats') { json(apiStats()); return }

    if (path.startsWith('/api/transcripts/')) {
      const slug = decodeURIComponent(path.replace('/api/transcripts/', ''))
      const text = apiTranscript(slug)
      if (!text) { res.writeHead(404); res.end('Not found'); return }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(text)
      return
    }

    if (path.startsWith('/screenshots/')) {
      const file = join(__dir, 'screenshots', decodeURIComponent(path.replace('/screenshots/', '')))
      if (!existsSync(file)) { res.writeHead(404); res.end('Not found'); return }
      const ext = extname(file).toLowerCase()
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
      res.end(readFileSync(file))
      return
    }

    res.writeHead(404); res.end('Not found')
  } catch (err) {
    res.writeHead(500); res.end(String(err))
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`AI Tools Reference running at http://localhost:${PORT}`)
  console.log(`Also accessible at http://100.89.17.28:${PORT} via Tailscale`)
})
