/**
 * Transcribe the spoken audio of a saved post.
 *
 * The archive existed for months without this, and it is the thing that makes it
 * a research tool rather than a list of links. Instagram and Facebook carry no
 * caption track at all, so every reel Eoin saved was catalogued from its title
 * and post text alone - which is why so many entries read "the specific subject
 * matter cannot be determined without viewing the content".
 *
 * Runs entirely on the mini: yt-dlp for the audio, mlx-whisper on the GPU. The
 * model and its Python environment belong to the Verbatim project rather than
 * being installed twice - large-v3 is several gigabytes and the mini is short of
 * disk.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

// Verbatim's environment. If that project ever moves, this is the one line to
// change - and transcription degrades to "no transcript" rather than breaking
// the ingest.
const WHISPER_PY = '/Users/ai-code/projects/yt/.venv/bin/python'
const MODEL = 'mlx-community/whisper-large-v3-mlx'
const ENV = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH || ''}` }

export function whisperAvailable() {
  return existsSync(WHISPER_PY)
}

/**
 * Returns { text, seconds, speech } - speech:false when Whisper heard nothing.
 * Never throws: a post that cannot be transcribed must still be archived.
 */
export function transcribeAudio(url, tmpDir) {
  if (!whisperAvailable()) {
    return { text: '', seconds: 0, speech: false, note: 'whisper not installed on this machine' }
  }

  let audio = ''
  try {
    // Same fallback ladder Verbatim uses: sites drop formats without warning and
    // the first choice is not always served.
    for (const fmt of ['bestaudio[ext=m4a]', '140', 'bestaudio[ext=webm]', 'bestaudio']) {
      try {
        execFileSync('yt-dlp', ['-f', fmt, '--no-part', '-o', join(tmpDir, 'audio.%(ext)s'), url],
          { env: ENV, stdio: 'pipe', timeout: 180000 })
      } catch { /* try the next format */ }
      const found = readdirSync(tmpDir).filter(f => f.startsWith('audio.'))
      if (found.length) { audio = join(tmpDir, found[0]); break }
    }
    if (!audio) return { text: '', seconds: 0, speech: false, note: 'no audio track available' }

    const script = `
import json, sys, mlx_whisper
r = mlx_whisper.transcribe(sys.argv[1], path_or_hf_repo=${JSON.stringify(MODEL)},
                           language='en', verbose=False)
segs = r.get('segments') or []
# Whisper does not error on silence - it emits one token over and over. Judge by
# how confident it was that there was speech at all, not by whether text came
# back, or a music-only reel gets archived with an invented transcript.
probs = [s.get('no_speech_prob', 0) for s in segs]
mean_no_speech = sum(probs) / len(probs) if probs else 1.0
print(json.dumps({'text': r.get('text', '').strip(),
                  'seconds': round(segs[-1]['end'], 1) if segs else 0,
                  'mean_no_speech_prob': round(mean_no_speech, 3)}))
`
    const out = execFileSync(WHISPER_PY, ['-c', script, audio],
      { env: ENV, encoding: 'utf8', timeout: 900000, maxBuffer: 32 * 1024 * 1024 })
    const r = JSON.parse(out.trim().split('\n').pop())

    const speech = r.text.length > 20 && r.mean_no_speech_prob < 0.6
    return {
      text: speech ? r.text : '',
      seconds: r.seconds,
      speech,
      note: speech ? '' : 'no speech detected in the audio',
    }
  } catch (err) {
    return { text: '', seconds: 0, speech: false, note: `transcription failed: ${String(err.message).slice(0, 160)}` }
  } finally {
    // The audio is never kept. Only the transcript is.
    try {
      for (const f of readdirSync(tmpDir).filter(f => f.startsWith('audio.'))) unlinkSync(join(tmpDir, f))
    } catch { /* tmpdir is removed by the caller anyway */ }
  }
}
