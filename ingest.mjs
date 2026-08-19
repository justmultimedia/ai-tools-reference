#!/usr/bin/env node
/**
 * Social media → tools.json pipeline
 *
 * Usage:
 *   node ingest.mjs <url>          full pipeline (yt-dlp + TwelveLabs + Claude)
 *   node ingest.mjs <url> --fast   captions only, skip TwelveLabs video upload
 *   node ingest.mjs <url> --auto   non-interactive, auto-save without prompting
 *
 * Supports: YouTube, Instagram, TikTok, Facebook, and any yt-dlp-compatible URL
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
const CATEGORIES_PATH = join(__dir, 'data/categories.json')
const YTDLP = '/opt/homebrew/bin/yt-dlp'

// The closed category taxonomy. Kept in data/categories.json so ingest.mjs,
// query.mjs and mcp-server.mjs all agree on one list. If the file is absent the
// pipeline still runs — it just cannot enforce the enum.
function loadCategories() {
  if (!existsSync(CATEGORIES_PATH)) return null
  try {
    const parsed = JSON.parse(readFileSync(CATEGORIES_PATH, 'utf8'))
    const list = Array.isArray(parsed) ? parsed : parsed.categories
    return Array.isArray(list) && list.length ? list : null
  } catch {
    return null
  }
}

// The prompt asks for a value from the enum, but a prompt is a request, not a
// guarantee — one freeform reply is all it takes to start the sprawl again. So
// coerce anything off-list to 'other' and say so loudly.
function enforceCategory(entry, categories) {
  if (!categories) return entry
  const raw = (entry.category || '').trim()
  const hit = categories.find(c => c.toLowerCase() === raw.toLowerCase())
  if (hit) {
    entry.category = hit
  } else {
    console.warn(`  ! category "${raw || '(empty)'}" is not in the taxonomy — coercing to "other"`)
    if (raw) entry.category_suggested = raw   // keep the model's idea for review
    entry.category = categories.includes('other') ? 'other' : categories[categories.length - 1]
  }
  return entry
}
import { transcribeAudio, whisperAvailable } from './transcribe.mjs'
import { extractLocally, localModelAvailable } from './extract-local.mjs'

const TL_BASE = 'https://api.twelvelabs.io/v1.3'
const TL_INDEX_NAME = 'ai-tools-shorts'

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.argv[2]
  const fast = process.argv.includes('--fast')
  const auto = process.argv.includes('--auto')

  if (!url || url.startsWith('--')) {
    console.error('Usage: node ingest.mjs <url> [--fast] [--auto] [--update]')
    process.exit(1)
  }

  // No longer fatal. The local model on the mini does the cataloguing; the API
  // is only a fallback, so a missing key must not stop an ingest.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('Note: ANTHROPIC_API_KEY not set - local model only, no API fallback.')
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'yt-ingest-'))

  const platform = detectPlatform(url)

  try {
    // Step 1: fetch metadata + captions
    console.log('\n[1/4] Fetching metadata and captions...')
    const { title, description, channel, captions, captionKind } = fetchMetadata(url, tmpDir)
    console.log(`  Platform: ${platform}`)
    console.log(`  Title:    ${title}`)
    console.log(`  Channel:  ${channel}`)
    console.log(`  Captions: ${captions ? `${captions.length} chars` : 'none'}`)

    // Step 2: transcribe what was actually said.
    //
    // This is the step the archive spent months without. Instagram and Facebook
    // carry no caption track, so without it a post is catalogued from its title
    // and post text alone - which is how entries ended up saying the subject
    // matter could not be determined.
    let transcript = '', transcriptNote = ''
    if (captions) {
      transcript = captions
      console.log(`\n[2/5] Using the ${captionKind} that came with the video.`)
    } else if (whisperAvailable()) {
      console.log('\n[2/5] No captions. Transcribing the audio locally...')
      const r = transcribeAudio(url, tmpDir)
      transcript = r.text
      transcriptNote = r.note
      console.log(r.speech
        ? `  Transcribed ${r.text.length} chars of speech (${r.seconds}s of audio)`
        : `  ${r.note}`)
    } else {
      transcriptNote = 'whisper is not available on this machine'
      console.log('\n[2/5] No captions, and Whisper is not installed here.')
    }

    // Step 3: only when nothing was said does it become worth paying to LOOK at
    // the video. A post with a transcript needs no visual analysis.
    let videoAnalysis = ''
    const noSpeech = !transcript
    if (!fast && noSpeech) {
      if (!process.env.TWELVELABS_API_KEY) {
        console.log('\n[2/4] Skipping TwelveLabs (TWELVELABS_API_KEY not set)')
      } else {
        console.log('\n[2/4] Downloading and analysing video with TwelveLabs...')
        videoAnalysis = await analyzeWithTwelveLabs(url, tmpDir)
        console.log(`  Analysis: ${videoAnalysis.slice(0, 80)}...`)
      }
    } else if (!noSpeech) {
      console.log('\n[3/5] Speech was transcribed, so no video analysis is needed.')
    } else {
      console.log('\n[3/5] Skipped (--fast mode)')
    }

    // Step 4: catalogue it. The local model first - free, private, and with a
    // real transcript to work from it does this well. The API is the fallback.
    console.log('\n[4/5] Cataloguing...')
    let entry = null
    if (await localModelAvailable()) {
      entry = await extractLocally({ title, description, channel, captions, transcript,
                                     videoAnalysis, url, platform, dir: __dir })
      if (entry) console.log('  Catalogued by the local model (no API cost).')
      else console.log('  Local model could not produce a usable entry.')
    }
    if (!entry) {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('Local model unavailable and no ANTHROPIC_API_KEY to fall back on.')
      }
      console.log('  Falling back to the Claude API.')
      entry = await extractEntry({ title, description, channel,
                                   captions: transcript || captions,
                                   videoAnalysis, url, platform })
    }

    // What we know about how this entry was arrived at, kept with the entry. A
    // description built from a transcript and one guessed from a post caption
    // are not the same thing and must never look alike.
    entry.platform = platform
    entry.source = url
    entry.transcribed = Boolean(transcript) && !captions
    if (captions && captionKind) entry.caption_kind = captionKind
    if (transcriptNote) entry.transcript_note = transcriptNote
    console.log('\nExtracted entry:')
    console.log(JSON.stringify(entry, null, 2))

    // Save transcript alongside the entry
    if (transcript) {
      if (!existsSync(TRANSCRIPTS_DIR)) mkdirSync(TRANSCRIPTS_DIR, { recursive: true })
      const slug = url.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80)
      writeFileSync(join(TRANSCRIPTS_DIR, `${slug}.txt`),
        `Source: ${url}\nTitle: ${title}\nChannel: ${channel}\n` +
        `Transcript: ${captions ? 'published captions' : 'transcribed locally with Whisper'}\n\n${transcript}\n`)
      entry.transcriptSlug = slug
    }

    // Step 4: confirm and save
    const action = auto ? 'y' : await ask('\n[5/5] Save to tools.json? [y]es / [e]dit / [n]o: ')

    if (action === 'e') {
      const draft = join(tmpDir, 'entry.json')
      writeFileSync(draft, JSON.stringify(entry, null, 2))
      execSync(`${process.env.EDITOR || 'nano'} "${draft}"`, { stdio: 'inherit' })
      Object.assign(entry, JSON.parse(readFileSync(draft, 'utf8')))
    }

    if (action === 'y' || action === 'e') {
      saveEntry(entry, auto, process.argv.includes('--update'))
    } else {
      console.log('Skipped.')
    }

  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

// ─── Platform detection ───────────────────────────────────────────────────────

function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube'
  if (/instagram\.com/.test(url)) return 'instagram'
  if (/tiktok\.com/.test(url)) return 'tiktok'
  if (/facebook\.com|fb\.watch/.test(url)) return 'facebook'
  return 'web'
}

// ─── Step 1: metadata + captions ─────────────────────────────────────────────

function fetchMetadata(url, tmpDir) {
  // --ignore-errors so photo posts / carousels (Instagram /p/ links) still yield
  // their metadata: yt-dlp exits non-zero with "No video formats found" on every
  // slide, but it has already written the .info.json we actually need.
  try {
    execSync(
      `${YTDLP} \
        --ignore-errors \
        --write-info-json \
        --write-subs \
        --write-auto-subs \
        --sub-langs "en.*" \
        --sub-format vtt \
        --skip-download \
        --no-playlist \
        -o "${tmpDir}/video" \
        "${url}"`,
      { stdio: 'pipe' }
    )
  } catch (err) {
    // Only fatal if nothing usable landed on disk — checked just below.
    if (!readdirSync(tmpDir).some(f => f.endsWith('.info.json'))) throw err
  }

  const infoFile = readdirSync(tmpDir).find(f => f.endsWith('.info.json'))
  if (!infoFile) throw new Error('yt-dlp did not produce metadata — is the URL valid?')

  const meta = JSON.parse(readFileSync(join(tmpDir, infoFile), 'utf8'))
  const { title = '', description = '', channel = '', webpage_url = url } = meta

  // Human-written subtitles beat machine ones, and it matters which you have:
  // an auto-caption is another machine's guess at the audio, and treating it as
  // ground truth is exactly the mistake this archive exists to avoid.
  //
  // Only auto-captions were requested before, in "en,en-US" - so a talk with a
  // proper human en-GB transcript was read as having no captions at all, and
  // then failed to transcribe because YouTube refused the audio.
  let captions = '', captionKind = ''
  const vtts = readdirSync(tmpDir).filter(f => f.endsWith('.vtt'))
  const human = vtts.find(f => !f.includes('.auto.') && !/\.orig\./.test(f))
  const chosen = human || vtts[0]
  if (chosen) {
    captions = parseVtt(readFileSync(join(tmpDir, chosen), 'utf8'))
    captionKind = human ? 'published subtitles (human)' : 'auto-captions (machine)'
  }

  return { title, description, channel, url: webpage_url, captions, captionKind }
}

function parseVtt(raw) {
  // YouTube's auto-captions are "rollup": each cue repeats the previous line
  // with one more word on the end, so a naive join says everything two or three
  // times over. That made the stored transcripts unreadable and search snippets
  // useless - "People seem to think that you couldn't People seem to think that
  // you couldn't People seem to think..." - so identical and prefix-duplicated
  // lines are collapsed as they are read.
  const lines = raw
    .split('\n')
    .map(l => l.replace(/<[^>]+>/g, '').trim())
    .filter(l =>
      l &&
      !l.startsWith('WEBVTT') &&
      !l.startsWith('NOTE') &&
      !/^\d{2}:/.test(l) &&
      !/^(Kind|Language):/.test(l) &&
      !/^(align|position):/.test(l))

  const kept = []
  for (const line of lines) {
    const last = kept[kept.length - 1]
    if (!last) { kept.push(line); continue }
    if (line === last) continue                     // exact repeat
    if (last.endsWith(line)) continue               // already contained
    if (line.startsWith(last)) { kept[kept.length - 1] = line; continue }  // grown by a word
    kept.push(line)
  }

  return kept.join(' ').replace(/\s+/g, ' ').trim()
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

async function extractEntry({ title, description, channel, captions, videoAnalysis, url, platform }) {
  const categories = loadCategories()
  // A closed list when we have one; the old freeform hint only as a fallback.
  const categoryInstruction = categories
    ? `"EXACTLY ONE of these values, no others, no new values: ${categories.join(' | ')}"`
    : `"one descriptive category phrase, e.g. 'video editing', 'AI coding', 'design tools'"`
  const client = new Anthropic()
  const yearMonth = new Date().toISOString().slice(0, 7)

  const context = [
    `Title: ${title}`,
    `Channel: ${channel}`,
    `URL: ${url}`,
    `Platform: ${platform}`,
    description && `Description:\n${description.slice(0, 1500)}`,
    captions && `Auto-Captions:\n${captions.slice(0, 3000)}`,
    videoAnalysis && `TwelveLabs Video Analysis:\n${videoAnalysis}`,
  ].filter(Boolean).join('\n\n')

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You extract structured database entries from social media content. Return ONLY valid JSON — no markdown fences, no explanation.',
    messages: [{
      role: 'user',
      content: `Extract a database entry from this social media content.

${context}

First, decide what type of content this is:
- "ai-tool" — software tool, API, library, CLI, model, or service for developers/AI users
- "multimedia-tool" — video, audio, image, or creative production tool
- "tutorial" — how-to, tip, technique, or educational content
- "event" — conference, meetup, launch, webinar, or live event
- "product" — physical or digital product, app, or service (non-tool)
- "resource" — article, repo, dataset, template, or reference
- "other" — anything else

Return a JSON object:
{
  "id": "kebab-case-slug",
  "name": "Clear title or tool name",
  "content_type": "ai-tool|multimedia-tool|tutorial|event|product|resource|other",
  "category": ${categoryInstruction},
  "description": "2-3 sentences on what this is, why it's interesting or useful.",
  "tags": ["3 to 6 lowercase tags"],
  "link": "canonical URL or null",
  "platform": "${platform}",
  "install": "install command if it's a tool, otherwise null",
  "works_with": [],
  "use_cases": ["specific use case 1", "specific use case 2"],
  "notes": "important caveats, dates, prices, or null",
  "added": "${yearMonth}",
  "source": "${url}"
}`
    }]
  })

  const text = msg.content[0].text.trim()
  const match = text.match(/\{[\s\S]+\}/)
  if (!match) throw new Error(`Claude did not return valid JSON:\n${text}`)
  return enforceCategory(JSON.parse(match[0]), categories)
}

// ─── Step 4: save ─────────────────────────────────────────────────────────────

async function saveEntry(entry, auto = false, update = false) {
  const tools = JSON.parse(readFileSync(TOOLS_PATH, 'utf8'))

  // A full timestamp as well as `added`, which is only month-granular. Over a
  // hundred entries share the current month, so `added` alone cannot say which
  // arrived first - and the page needs that to show the newest at the top.
  if (!entry.ingested_at) entry.ingested_at = new Date().toISOString()
  // Match on the link first, then the id. The id comes from a name the model
  // invents, so re-ingesting the same post after any prompt change added a
  // second copy of it instead of updating the first.
  //
  // Only a real URL counts as a link. Entries ingested from a screenshot all
  // carry the source "screenshot", and keying on that would treat every one of
  // them as the same post.
  const linkKey = v => (v && /^https?:\/\//.test(v) ? v.split('?')[0] : '')
  const key = linkKey(entry.source)
  let existing = key ? tools.findIndex(t => linkKey(t.source) === key) : -1
  if (existing < 0) existing = tools.findIndex(t => t.id === entry.id)

  if (existing >= 0) {
    // --update refreshes a post that is already saved. Everything archived
    // before transcription existed was catalogued from its title and post text
    // alone, so this is how those entries get what was actually said.
    if (update) {
      const kept = tools[existing]
      tools[existing] = { ...kept, ...entry, added: kept.added, ingested_at: kept.ingested_at }
      writeFileSync(TOOLS_PATH, JSON.stringify(tools, null, 2) + '\n')
      console.log(`\nUpdated "${entry.name}" — ${entry.transcribed ? 'now has a transcript' : 're-catalogued'}`)
      return
    }
    if (auto) { console.log(`\nSkipped — "${entry.name}" already in database.`); return }
    const overwrite = await ask(`ID "${entry.id}" already exists. Overwrite? [y/n]: `)
    if (overwrite !== 'y') { console.log('Skipped.'); return }
    tools[existing] = entry
    console.log(`\nUpdated "${entry.name}" [${entry.content_type || 'unknown'}] in tools.json`)
  } else {
    tools.push(entry)
    console.log(`\nAdded "${entry.name}" [${entry.content_type || 'unknown'}] — tools.json now has ${tools.length} entries`)
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
