#!/usr/bin/env node
// Usage: node query.mjs "animation react"
//        node query.mjs --tag design
//        node query.mjs --category browser-automation
//        node query.mjs --list-categories

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const tools = JSON.parse(readFileSync(join(__dir, 'data/tools.json'), 'utf8'))

const args = process.argv.slice(2)

if (!args.length || args[0] === '--help') {
  console.log('Usage:')
  console.log('  node query.mjs "search terms"       — search by name/description/tags')
  console.log('  node query.mjs --tag animation      — filter by tag')
  console.log('  node query.mjs --category design    — filter by category')
  console.log('  node query.mjs --list-categories    — show all categories')
  console.log('  node query.mjs --all                — show all tools\n')
  process.exit(0)
}

function display(t) {
  console.log(`\n─── ${t.name} (${t.id})`)
  console.log(`  Category: ${t.category} · Type: ${t.type}`)
  console.log(`  ${t.description}`)
  console.log(`  Install: ${t.install}`)
  if (t.link) console.log(`  Link: ${t.link}`)
  console.log(`  Tags: ${t.tags.join(', ')}`)
  console.log(`  Status: ${t.status}`)
  if (t.notes) console.log(`  Notes: ${t.notes}`)
}

if (args[0] === '--list-categories') {
  const cats = [...new Set(tools.map(t => t.category))].sort()
  console.log('Categories:', cats.join(', '))
  process.exit(0)
}

if (args[0] === '--all') {
  tools.forEach(display)
  console.log(`\n${tools.length} tools total`)
  process.exit(0)
}

if (args[0] === '--tag') {
  const tag = args[1]?.toLowerCase()
  const results = tools.filter(t => t.tags.includes(tag))
  results.forEach(display)
  console.log(`\n${results.length} tools with tag "${tag}"`)
  process.exit(0)
}

if (args[0] === '--category') {
  const cat = args[1]?.toLowerCase()
  const results = tools.filter(t => t.category === cat)
  results.forEach(display)
  console.log(`\n${results.length} tools in category "${cat}"`)
  process.exit(0)
}

// Free text search across name, description, tags, use_cases
const query = args.join(' ').toLowerCase()
const results = tools.filter(t => {
  const searchable = [
    t.name, t.description, t.id,
    ...(t.tags || []),
    ...(t.use_cases || []),
    t.category, t.type
  ].join(' ').toLowerCase()
  return query.split(' ').every(word => searchable.includes(word))
})

results.forEach(display)
console.log(`\n${results.length} tools matching "${args.join(' ')}"`)
