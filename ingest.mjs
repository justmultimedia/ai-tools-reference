#!/usr/bin/env node
/**
 * YouTube Shorts → tools.json pipeline
 *
 * Usage:
 *   node ingest.mjs <youtube-url>          full pipeline (yt-dlp + TwelveLabs + Claude)
 *   node ingest.mjs <youtube-url> --fast   captions only, skip TwelveLabs video upload
 *
 * Requires: ANTHROPIC_API_KEY, TWELVELABS_API_KEY (already set on MBP)
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import { createInterface } from 'readline'
import Anthropic from '@anthropic-ai/sdk'

const __dir = dirname(fileURLToPath(import.meta.url))
const TOOLS_PATH = join(__dir, 'data/tools.json')
const TRANSCRIPTS_DIR = join(__dir, 'data/transcripts')
const YTDLP = '/opt/homebrew/bin/yt-dlp'
const TL_BASE = 'https://api.twelvelabs.io/v1.3'
const TL_INDEX_NAME = 'ai-tools-shorts'

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.argv[2]
  const fast = process.argv.includes('--fast')
  const auto = process.argv.includes('--auto')

  if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
    console.error('Usage: node ingest.mjs <youtube-url> [--fast]')
    process.exit(1)
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set.')
    console.error('Get one at console.anthropic.com and run: export ANTHROPIC_API_KEY=sk-...')
    process.exit(1)
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'yt-ingest-'))

  try {
    // Step 1: fetch metadata + captions
    console.log('\n[1/4] Fetching metadata and captions...')
    const { title, description, channel, captions } = fetchMetadata(url, tmpDir)
    console.log(`  Title:    ${title}`)
    console.log(`  Channel:  ${channel}`)
    console.log(`  Captions: ${captions ? `${captions.length} chars` : 'none'}`)

    // Step 2: TwelveLabs video analysis (unless --fast)
    let videoAnalysis = ''
    if (!fast) {
      if (!process.env.TWELVELABS_API_KEY) {
        console.log('\n[2/4] Skipping TwelveLabs (TWELVELABS_API_KEY not set)')
      } else {
        console.log('\n[2/4] Downloading and analysing video with TwelveLabs...')
        videoAnalysis = await analyzeWithTwelveLabs(url, tmpDir)
        console.log(`  Analysis: ${videoAnalysis.slice(0, 80)}...`)
      }
    } else {
      console.log('\n[2/4] Skipped (--fast mode)')
    }

    // Step 3: Claude API extraction
    console.log('\n[3/4] Extracting tool entry with Claude...')
    const entry = await extractEntry({ title, description, channel, captions, videoAnalysis, url })
    console.log('\nExtracted entry:')
    console.log(JSON.stringify(entry, null, 2))

    // Save transcript alongside the tool entry
    if (captions) {
      if (!existsSync(TRANSCRIPTS_DIR)) mkdirSync(TRANSCRIPTS_DIR, { recursive: true })
      const slug = url.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80)
      writeFileSync(join(TRANSCRIPTS_DIR, `${slug}.txt`), `Source: ${url}\nTitle: ${title}\nChannel: ${channel}\n\n${captions}\n`)
    }

    // Step 4: confirm and save
    const action = auto ? 'y' : await ask('\n[4/4] Save to tools.json? [y]es / [e]dit / [n]o: ')

    if (action === 'e') {
      const draft = join(tmpDir, 'entry.json')
      writeFileSync(draft, JSON.stringify(entry, null, 2))
      execSync(`${process.env.EDITOR || 'nano'} "${draft}"`, { stdio: 'inherit' })
      Object.assign(entry, JSON.parse(readFileSync(draft, 'utf8')))
    }

    if (action === 'y' || action === 'e') {
      saveEntry(entry)
    } else {
      console.log('Skipped.')
    }

  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

// ─── Step 1: metadata + captions ─────────────────────────────────────────────

function fetchMetadata(url, tmpDir) {
  execSync(
    `${YTDLP} \
      --write-info-json \
      --write-auto-subs \
      --sub-langs "en,en-US" \
      --sub-format vtt \
      --skip-download \
      --no-playlist \
      -o "${tmpDir}/video" \
      "${url}"`,
    { stdio: 'pipe' }
  )

  const infoFile = readdirSync(tmpDir).find(f => f.endsWith('.info.json'))
  if (!infoFile) throw new Error('yt-dlp did not produce metadata — is the URL valid?')

  const meta = JSON.parse(readFileSync(join(tmpDir, infoFile), 'utf8'))
  const { title = '', description = '', channel = '', webpage_url = url } = meta

  let captions = ''
  const vttFile = readdirSync(tmpDir).find(f => f.endsWith('.vtt'))
  if (vttFile) captions = parseVtt(readFileSync(join(tmpDir, vttFile), 'utf8'))

  return { title, description, channel, url: webpage_url, captions }
}

function parseVtt(raw) {
  return raw
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('WEBVTT') && !l.match(/^\d{2}:/) && !l.startsWith('NOTE'))
    .join(' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Step 2: TwelveLabs ───────────────────────────────────────────────────────

async function analyzeWithTwelveLabs(url, tmpDir) {
  const key = process.env.TWELVELABS_API_KEY
  const headers = { 'x-api-key': key, 'Content-Type': 'application/json' }

  // download video
  execSync(
    `${YTDLP} \
      --format "mp4[height<=720]/bestvideo[height<=720]+bestaudio/best" \
      --merge-output-format mp4 \
      --no-playlist \
      -o "${tmpDir}/video.%(ext)s" \
      "${url}"`,
    { stdio: 'pipe' }
  )
  const videoFile = readdirSync(tmpDir).find(f => f.match(/^video\.(mp4|webm|mkv)$/))
  if (!videoFile) throw new Error('Video download failed')
  const videoPath = join(tmpDir, videoFile)

  // get or create index
  const indexesRes = await fetch(`${TL_BASE}/indexes`, { headers })
  const indexes = await indexesRes.json()
  let indexId = indexes.data?.find(i => i.name === TL_INDEX_NAME)?._id

  if (!indexId) {
    console.log('  Creating TwelveLabs index...')
    const created = await fetch(`${TL_BASE}/indexes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: TL_INDEX_NAME,
        models: [{ name: 'pegasus1.2', options: ['visual', 'conversation'] }]
      })
    }).then(r => r.json())
    indexId = created._id
  }

  // upload video
  console.log('  Uploading video...')
  const form = new FormData()
  form.append('index_id', indexId)
  form.append('video_file', new Blob([readFileSync(videoPath)], { type: 'video/mp4' }), 'video.mp4')

  const task = await fetch(`${TL_BASE}/tasks`, {
    method: 'POST',
    headers: { 'x-api-key': key },
    body: form
  }).then(r => r.json())

  if (!task._id) throw new Error(`TwelveLabs task creation failed: ${JSON.stringify(task)}`)

  // poll until ready
  console.log('  Indexing', { spinner: true })
  let videoId = null
  for (let i = 0; i < 72; i++) {
    await sleep(5000)
    const status = await fetch(`${TL_BASE}/tasks/${task._id}`, { headers }).then(r => r.json())
    process.stdout.write(`\r  Indexing: ${status.status}...   `)
    if (status.status === 'ready') { videoId = status.video_id; break }
    if (status.status === 'failed') throw new Error('TwelveLabs indexing failed')
  }
  process.stdout.write('\n')
  if (!videoId) throw new Error('Indexing timed out after 6 minutes')

  // generate analysis
  console.log('  Generating analysis...')
  const gen = await fetch(`${TL_BASE}/generate/text`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      video_id: videoId,
      prompt: 'What AI tool or feature is demonstrated? State: the tool name, what it does, key capabilities shown, any install commands or URLs mentioned, and what platforms/languages it works with.'
    })
  }).then(r => r.json())

  return gen.data || ''
}

// ─── Step 3: Claude extraction ────────────────────────────────────────────────

async function extractEntry({ title, description, channel, captions, videoAnalysis, url }) {
  const client = new Anthropic()
  const yearMonth = new Date().toISOString().slice(0, 7)

  const context = [
    `Title: ${title}`,
    `Channel: ${channel}`,
    `URL: ${url}`,
    description && `YouTube Description:\n${description.slice(0, 1500)}`,
    captions && `Auto-Captions:\n${captions.slice(0, 3000)}`,
    videoAnalysis && `TwelveLabs Video Analysis:\n${videoAnalysis}`,
  ].filter(Boolean).join('\n\n')

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You extract structured AI tool entries from video metadata. Return ONLY valid JSON — no markdown fences, no explanation.',
    messages: [{
      role: 'user',
      content: `Extract an AI tools database entry from this YouTube Short.

${context}

Return a JSON object with exactly these fields:
{
  "id": "kebab-case-slug",
  "name": "Tool Name",
  "category": "design|animation|browser-automation|document-conversion|networking|media|ai-video|claude-workflow|image-generation|other",
  "type": "claude-code-skill|npm-package|python-package|cli-tool|api-service|component-library|reference-database|vpn-mesh|other",
  "description": "One or two sentences on what it does and why it's useful. Include stats (stars, downloads) if mentioned.",
  "install": "exact install command, or null",
  "works_with": ["array", "of", "platforms"],
  "use_cases": ["specific use case 1", "specific use case 2"],
  "tags": ["3 to 6 lowercase tags"],
  "link": "https://... or null",
  "status": "available",
  "notes": "important caveats or null",
  "added": "${yearMonth}",
  "source": "${url}"
}`
    }]
  })

  const text = msg.content[0].text.trim()
  const match = text.match(/\{[\s\S]+\}/)
  if (!match) throw new Error(`Claude did not return valid JSON:\n${text}`)
  return JSON.parse(match[0])
}

// ─── Step 4: save ─────────────────────────────────────────────────────────────

async function saveEntry(entry) {
  const tools = JSON.parse(readFileSync(TOOLS_PATH, 'utf8'))
  const existing = tools.findIndex(t => t.id === entry.id)

  if (existing >= 0) {
    const overwrite = await ask(`ID "${entry.id}" already exists. Overwrite? [y/n]: `)
    if (overwrite !== 'y') { console.log('Skipped.'); return }
    tools[existing] = entry
    console.log(`\nUpdated "${entry.name}" in tools.json`)
  } else {
    tools.push(entry)
    console.log(`\nAdded "${entry.name}" — tools.json now has ${tools.length} tools`)
  }

  writeFileSync(TOOLS_PATH, JSON.stringify(tools, null, 2) + '\n')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ask(question) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, answer => { rl.close(); resolve(answer.trim().toLowerCase()) })
  })
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

main().catch(err => {
  console.error('\nError:', err.message)
  process.exit(1)
})
