#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'

const __dir = dirname(fileURLToPath(import.meta.url))

function loadTools() {
  return JSON.parse(readFileSync(join(__dir, 'data/tools.json'), 'utf8'))
}

function formatTool(t) {
  const lines = [
    `## ${t.name} (${t.id})`,
    `Category: ${t.category} | Type: ${t.type} | Status: ${t.status}`,
    t.description,
    `Install: ${t.install}`,
  ]
  if (t.link) lines.push(`Link: ${t.link}`)
  if (t.works_with?.length) lines.push(`Works with: ${t.works_with.join(', ')}`)
  if (t.use_cases?.length) lines.push(`Use cases: ${t.use_cases.join(', ')}`)
  if (t.tags?.length) lines.push(`Tags: ${t.tags.join(', ')}`)
  if (t.notes) lines.push(`Notes: ${t.notes}`)
  return lines.join('\n')
}

const server = new McpServer({
  name: 'ai-tools',
  version: '1.0.0',
})

server.tool(
  'search_tools',
  'Search Eoin\'s personal AI tools database by keyword, category, or tag. Use this before any build or design task to check if a saved tool could help.',
  {
    query: z.string().optional().describe('Keyword to search across name, description, tags, use cases'),
    category: z.string().optional().describe('Filter by category: design, animation, browser-automation, document-conversion, networking, media, ai-video, claude-workflow, image-generation'),
    tag: z.string().optional().describe('Filter by a specific tag'),
  },
  async ({ query, category, tag }) => {
    const tools = loadTools()
    let results = tools

    if (category) {
      results = results.filter(t => t.category === category.toLowerCase())
    }
    if (tag) {
      results = results.filter(t => t.tags?.includes(tag.toLowerCase()))
    }
    if (query) {
      const q = query.toLowerCase()
      results = results.filter(t => {
        const searchable = [
          t.name, t.description, t.id,
          ...(t.tags || []),
          ...(t.use_cases || []),
          t.category, t.type
        ].join(' ').toLowerCase()
        return q.split(' ').every(word => searchable.includes(word))
      })
    }

    if (!results.length) {
      return { content: [{ type: 'text', text: 'No tools found matching your query.' }] }
    }

    const text = results.map(formatTool).join('\n\n---\n\n')
    return { content: [{ type: 'text', text: `${results.length} tool(s) found:\n\n${text}` }] }
  }
)

server.tool(
  'list_tools',
  'List all tools in Eoin\'s AI tools database with a one-line summary of each.',
  {},
  async () => {
    const tools = loadTools()
    const lines = tools.map(t => `- **${t.name}** (${t.category}) — ${t.description.slice(0, 80)}${t.description.length > 80 ? '…' : ''}`)
    return {
      content: [{
        type: 'text',
        text: `${tools.length} tools in database:\n\n${lines.join('\n')}`
      }]
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
