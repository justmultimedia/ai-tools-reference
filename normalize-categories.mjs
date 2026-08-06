#!/usr/bin/env node
/**
 * Bring any off-taxonomy entries back into the closed category list.
 *
 * ingest.mjs enforces the taxonomy at write time, but entries can still drift in:
 * a link ingested on a machine running older code, or a git merge that lands new
 * entries alongside a migration. This is the repair pass — safe to re-run anytime.
 *
 *   node normalize-categories.mjs           report only, changes nothing
 *   node normalize-categories.mjs --write   apply the fixes
 *
 * Mapping order: data/category-map.json -> 'other'. Originals are preserved in
 * category_original so every change stays reversible.
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const TOOLS = join(__dir, 'data/tools.json')
const CATS = join(__dir, 'data/categories.json')
const MAP = join(__dir, 'data/category-map.json')

const write = process.argv.includes('--write')

const categories = JSON.parse(readFileSync(CATS, 'utf8')).categories
const mapFile = JSON.parse(readFileSync(MAP, 'utf8'))
const map = mapFile.map || {}
const tools = JSON.parse(readFileSync(TOOLS, 'utf8'))

const lookup = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]))
const valid = new Set(categories.map(c => c.toLowerCase()))

let fixed = 0
const unmapped = []

for (const t of tools) {
  const cur = (t.category || '').trim()
  if (valid.has(cur.toLowerCase())) continue

  const target = lookup.get(cur.toLowerCase())
  if (!target) unmapped.push({ id: t.id, category: cur })

  const next = target || 'other'
  console.log(`  ${t.id}\n    "${cur || '(empty)'}" -> ${next}${target ? '' : '   [no mapping — defaulted]'}`)

  if (write) {
    if (!t.category_original) t.category_original = cur
    t.category = next
  }
  fixed++
}

if (!fixed) {
  console.log('All entries already within the taxonomy — nothing to do.')
} else if (write) {
  writeFileSync(TOOLS, JSON.stringify(tools, null, 2) + '\n')
  console.log(`\nNormalized ${fixed} entr${fixed === 1 ? 'y' : 'ies'} (${tools.length} total).`)
} else {
  console.log(`\n${fixed} entr${fixed === 1 ? 'y' : 'ies'} would change. Re-run with --write to apply.`)
}

if (unmapped.length) {
  console.log(`\nNote: ${unmapped.length} value(s) had no entry in category-map.json and fell back to 'other'.`)
  console.log("Add them to the map if they deserve a real category.")
}
