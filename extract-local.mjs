/**
 * Catalogue a saved post using the model running on the mini.
 *
 * Ingest previously called the Claude API for every single link, which costs
 * money per post and needs a key on the machine. Qwen 2.5 7B is already running
 * locally for Verbatim, it is free, nothing leaves the house, and with a real
 * transcript to work from it does this job well - the hard part was never the
 * model, it was that nothing had transcribed the audio.
 *
 * The Anthropic path is kept as a fallback for when the local model is down or
 * returns something unusable.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const OLLAMA = 'http://127.0.0.1:11434'
const MODEL = 'qwen2.5:7b-instruct'

const CONTENT_TYPES = ['tutorial', 'resource', 'product', 'ai-tool', 'event', 'other']

export async function localModelAvailable() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(4000) })
    if (!r.ok) return false
    const { models = [] } = await r.json()
    return models.some(m => (m.name || '').startsWith('qwen2.5:7b'))
  } catch {
    return false
  }
}

/**
 * Returns a catalogue entry, or null if the local model could not produce a
 * usable one - the caller then falls back to the API rather than saving
 * something wrong.
 */
export async function extractLocally({ title, description, channel, captions, transcript, videoAnalysis, url, platform, dir }) {
  const taxonomy = JSON.parse(readFileSync(join(dir, 'data/categories.json'), 'utf8'))
  const categories = taxonomy.categories
  const glossed = categories
    .map(c => `- ${c}: ${(taxonomy.descriptions || {})[c] || ''}`)
    .join('\n')

  // Transcript first: it is what was actually said, where title and post text are
  // frequently marketing or nothing at all.
  const evidence = [
    transcript && `WHAT WAS SAID IN THE POST (transcript):\n${transcript.slice(0, 6000)}`,
    captions && !transcript && `CAPTIONS:\n${captions.slice(0, 4000)}`,
    videoAnalysis && `WHAT IS SHOWN ON SCREEN:\n${videoAnalysis.slice(0, 2000)}`,
    title && `TITLE: ${title}`,
    channel && `POSTED BY: ${channel}`,
    description && `POST TEXT: ${description.slice(0, 1500)}`,
  ].filter(Boolean).join('\n\n')

  const prompt = `You catalogue posts Eoin saves for research. Return ONLY JSON.

Keys: name, category, content_type, description, tags, topics, key_points.
- name: a specific, factual title. Never "Video by <account>".
- category: EXACTLY one slug from the list below. Choose by the SUBJECT MATTER
  of what is being said, not by any technology that happens to be mentioned. A
  post about money is personal-finance even if it mentions AI or blockchain.
${glossed}
- content_type: one of: ${CONTENT_TYPES.join(', ')}
- description: 2-3 sentences on what the post ACTUALLY SAYS. Base this on the
  transcript where there is one. Never say the content cannot be determined.
- tags: 4-8 lowercase keywords someone would search for later.
- topics: 2-4 broad subject areas.
- key_points: 2-5 specific claims or facts stated in the post.

${evidence}`

  try {
    const res = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, prompt, stream: false, format: 'json',
        options: { temperature: 0, num_ctx: 8192 },
      }),
      signal: AbortSignal.timeout(180000),
    })
    if (!res.ok) return null
    const { response } = await res.json()
    const entry = JSON.parse(response)

    // The taxonomy is closed on purpose - 124 invented categories is what it was
    // rescued from. A category outside the list means the extraction is not
    // trustworthy, so hand over to the API rather than coercing it quietly.
    if (!entry.name || !categories.includes(entry.category)) return null

    // The model is not asked for an id - it would invent inconsistent ones.
    // Derive it from the name, the same shape the rest of the file uses.
    entry.id = entry.name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
    if (!CONTENT_TYPES.includes(entry.content_type)) entry.content_type = 'other'

    return entry
  } catch {
    return null
  }
}
