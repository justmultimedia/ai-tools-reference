# 2026-06-18-003 — Open Source / Local LLMs

## Date
2026-06-18

## What was done
- Discovered GLM-5.2 on ollama.com — Z.ai's 756B flagship model
- Added Ollama (platform) and GLM-5.2 to tools.json (now 16 tools)
- Clarified what `ollama launch claude --model glm-5.2:cloud` actually does

## Key findings

### Ollama
- Platform for running open-source LLMs locally on Mac
- Huge model library: Llama, Mistral, Gemma, GLM, Qwen, Phi, etc.
- Serves a local OpenAI-compatible API at localhost:11434
- `brew install ollama` then `ollama run <model>`
- Models can be used with Claude Code via `--model` flag

### GLM-5.2
- 756B parameters, 756GB size — way too large for Mac mini
- Mac mini (32GB) tops out at ~34B models at 4-bit quantisation
- The `:cloud` tag routes to Z.ai's servers (not local inference)
- For a local GLM option: `glm4` (9B) would fit in 32GB

### What `ollama launch claude --model glm-5.2:cloud` does
- "claude" = Claude Code (the CLI), not the Claude AI model
- Routes Claude Code to use GLM-5.2 as the underlying LLM instead of Anthropic
- Cloud variant because 756B can't run locally on consumer hardware

## What Eoin can run locally on Mac mini (32GB)
- Models up to ~13B comfortably
- Up to ~34B at 4-bit quantisation (tight)
- Good starting points: llama3.2, mistral, gemma3, qwen2.5

## Decision: Ollama on Mac mini?
Not needed right now. Main reasons it could matter later:
- High-volume automated tasks with no per-token API cost
- Projects too sensitive to send to any external API
- 24/7 availability with no rate limits

Reality check: 32GB Mac mini can only run 7B–13B models well. These are noticeably weaker than Claude. Not a replacement — an experiment.

## What comes next
- No immediate action. Come back to Ollama if a specific privacy or cost use case comes up.
- When ready to explore: `brew install ollama` then `ollama run llama3.2` is the simplest first step.
- Still need to set ANTHROPIC_API_KEY to test the full ingest pipeline.
