# 🤖 SEO Agents Dashboard

Multi-site SEO automation dashboard with AI-powered agents for technical audits, content analysis, and Google Search Console integration.

![SEO Agents](https://img.shields.io/badge/SEO-Agents-purple)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- 🌐 **Multi-Site Support** - Manage unlimited websites from one dashboard
- 🔍 **Technical SEO Audit** - robots.txt, sitemap, HTTPS, meta tags, schema
- 📊 **Health Score** - Overall SEO health with breakdown by category
- 📄 **Page Analyzer** - Deep analysis of individual pages
- 📋 **Bulk URL Checker** - Check multiple URLs at once
- 💻 **Terminal Interface** - Run agent commands directly
- 🤖 **7 Specialized Agents** - Orchestrator + 6 domain experts

## Quick Start

```bash
# Clone the repo
git clone https://github.com/roweldencinares/SEO.git
cd SEO

# Install dependencies
npm install

# Start the server
npm start

# Open in browser
http://localhost:3000/seo-agents
```

## SEO Agents

| Agent | Shortcut | Purpose |
|-------|----------|---------|
| **Orchestrator** | `seo` | Master coordinator, full audits |
| **Technical** | `s1` | Crawl, robots.txt, sitemap, speed |
| **Schema** | `s2` | JSON-LD structured data |
| **Content** | `s3` | Titles, meta, headings, keywords |
| **GSC** | `s4` | Google Search Console data |
| **WordPress** | `s5` | CMS operations, Yoast SEO |
| **Indexation** | `s6` | Index control, deindex recovery |

## API Endpoints

```
GET  /api/seo-agents/health?site=https://example.com
GET  /api/seo-agents/audit?url=https://example.com
GET  /api/seo-agents/opportunities
GET  /api/seo-agents/analyze-page?url=https://example.com/page
POST /api/seo-agents/bulk-check  { urls: [...] }
POST /api/seo-agents/command     { command: "seo audit" }
```

## Directory Structure

```
├── server.js              # Express server
├── public/
│   ├── seo-agents.html    # Main dashboard
│   ├── sidebar.js         # Sidebar component
│   └── sidebar.css        # Sidebar styles
├── lib/seo-agents/
│   ├── gsc-client.js      # Google Search Console client
│   ├── ga-client.js       # Google Analytics client
│   ├── unified-seo.js     # Combined SEO intelligence
│   ├── nexus-seo.js       # NEXUS framework wrapper
│   └── index.js           # Library exports
├── api/seo-agents/
│   └── index.js           # API routes (Vercel)
└── .claude/agents/
    ├── seo-orchestrator.md
    ├── technical-seo-agent.md
    ├── schema-agent.md
    ├── content-agent.md
    ├── gsc-agent.md
    ├── wordpress-agent.md
    └── indexation-agent.md
```

## Adding Sites

1. Click **➕ Add Site** in the dashboard
2. Enter website URL (e.g., `https://beachhydrovac.com`)
3. Optionally add GSC property ID
4. Click **Add Site**

Sites are stored in browser localStorage.

## Google Search Console Setup (Optional)

For full GSC integration:

1. Create a Google Cloud project
2. Enable Search Console API
3. Create OAuth credentials
4. Add credentials to `.env`:

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback
```

## Terminal Commands

```bash
seo audit https://example.com   # Run audit
seo health                      # Get health score
s1 check https://example.com    # Technical check
s2 schema                       # Schema audit
s3 content                      # Content analysis
help                            # Show all commands
```

## Deployment

### Vercel

```bash
npm i -g vercel
vercel
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## License

MIT License - feel free to use for any project.

## Author

**Rowel Dencinares**

---

Built with ❤️ using Node.js, Express, and Claude Code
