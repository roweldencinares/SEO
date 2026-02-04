/**
 * SEO Agents Server
 * Multi-site SEO Dashboard with Google Search Console integration
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// PAGES
// ============================================================

app.get('/', (req, res) => {
    res.redirect('/seo-agents');
});

app.get('/seo-agents', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'seo-agents.html'));
});

// ============================================================
// SEO AGENTS API
// ============================================================

// Health Score
app.get('/api/seo-agents/health', async (req, res) => {
    const siteUrl = req.query.site || 'https://example.com';

    try {
        // Run quick audit to estimate health
        let score = 50;
        const issues = [];

        // Check robots.txt
        try {
            const robotsRes = await fetch(`${siteUrl}/robots.txt`, { timeout: 5000 });
            if (robotsRes.ok) {
                score += 15;
                const text = await robotsRes.text();
                if (text.includes('Sitemap:')) score += 5;
            } else {
                issues.push('robots.txt not found');
            }
        } catch (e) {
            issues.push('Could not access robots.txt');
        }

        // Check sitemap
        try {
            const sitemapRes = await fetch(`${siteUrl}/sitemap.xml`, { timeout: 5000 });
            if (sitemapRes.ok) score += 15;
            else issues.push('sitemap.xml not found');
        } catch (e) {
            issues.push('Could not access sitemap');
        }

        // Check HTTPS
        if (siteUrl.startsWith('https://')) score += 15;
        else issues.push('Not using HTTPS');

        const overall = Math.min(score, 100);
        const grade = overall >= 90 ? 'A+' : overall >= 80 ? 'A' : overall >= 70 ? 'B' : overall >= 60 ? 'C' : overall >= 50 ? 'D' : 'F';

        res.json({
            success: true,
            data: {
                overall,
                grade,
                breakdown: {
                    indexation: score >= 70 ? 80 : 60,
                    ctr: 50,
                    rankings: 60,
                    traffic: 50
                },
                summary: {
                    totalPages: '--',
                    indexedPages: '--',
                    totalClicks: '--',
                    avgPosition: '--'
                },
                issues,
                note: 'Connect GSC for accurate data'
            }
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Technical Audit
app.get('/api/seo-agents/audit', async (req, res) => {
    const url = req.query.url || 'https://example.com';

    try {
        const issues = [];
        const passed = [];

        // Check robots.txt
        try {
            const robotsRes = await fetch(`${url}/robots.txt`, { timeout: 5000 });
            if (robotsRes.ok) {
                const robotsTxt = await robotsRes.text();
                passed.push({ check: 'robots.txt', status: 'EXISTS' });
                if (!robotsTxt.includes('Sitemap:')) {
                    issues.push({ severity: 'HIGH', type: 'robots.txt', issue: 'Missing sitemap reference', fix: `Add: Sitemap: ${url}/sitemap.xml` });
                } else {
                    passed.push({ check: 'Sitemap in robots.txt', status: 'PRESENT' });
                }
                if (robotsTxt.includes('Disallow: /') && !robotsTxt.includes('Disallow: /wp-admin')) {
                    issues.push({ severity: 'CRITICAL', type: 'robots.txt', issue: 'May be blocking search engines', fix: 'Review Disallow rules' });
                }
            } else {
                issues.push({ severity: 'HIGH', type: 'robots.txt', issue: 'robots.txt not found', fix: 'Create robots.txt file' });
            }
        } catch (e) {
            issues.push({ severity: 'MEDIUM', type: 'robots.txt', issue: 'Could not access robots.txt', fix: 'Verify server accessibility' });
        }

        // Check sitemap
        try {
            const sitemapRes = await fetch(`${url}/sitemap.xml`, { timeout: 5000 });
            if (sitemapRes.ok) {
                passed.push({ check: 'sitemap.xml', status: 'EXISTS' });
                const sitemapText = await sitemapRes.text();
                const urlCount = (sitemapText.match(/<loc>/g) || []).length;
                passed.push({ check: 'Sitemap URLs', status: `${urlCount} URLs found` });
            } else {
                // Try sitemap_index.xml
                const indexRes = await fetch(`${url}/sitemap_index.xml`, { timeout: 5000 });
                if (indexRes.ok) {
                    passed.push({ check: 'sitemap_index.xml', status: 'EXISTS' });
                } else {
                    issues.push({ severity: 'HIGH', type: 'sitemap', issue: 'sitemap.xml not found', fix: 'Generate XML sitemap' });
                }
            }
        } catch (e) {
            issues.push({ severity: 'MEDIUM', type: 'sitemap', issue: 'Could not access sitemap', fix: 'Verify sitemap URL' });
        }

        // Check HTTPS
        if (url.startsWith('https://')) {
            passed.push({ check: 'HTTPS', status: 'ENABLED' });
        } else {
            issues.push({ severity: 'CRITICAL', type: 'security', issue: 'Not using HTTPS', fix: 'Install SSL certificate' });
        }

        // Check homepage
        try {
            const homeRes = await fetch(url, { timeout: 10000 });
            if (homeRes.ok) {
                passed.push({ check: 'Homepage', status: 'ACCESSIBLE' });
                const html = await homeRes.text();

                // Check title
                const titleMatch = html.match(/<title>(.*?)<\/title>/i);
                if (titleMatch) {
                    const title = titleMatch[1];
                    if (title.length > 60) {
                        issues.push({ severity: 'MEDIUM', type: 'on-page', issue: `Title too long (${title.length} chars)`, fix: 'Shorten to 50-60 characters' });
                    } else if (title.length < 30) {
                        issues.push({ severity: 'MEDIUM', type: 'on-page', issue: `Title too short (${title.length} chars)`, fix: 'Expand with keywords' });
                    } else {
                        passed.push({ check: 'Title tag', status: `OK (${title.length} chars)` });
                    }
                } else {
                    issues.push({ severity: 'CRITICAL', type: 'on-page', issue: 'Missing title tag', fix: 'Add title tag' });
                }

                // Check meta description
                const metaMatch = html.match(/<meta name="description" content="(.*?)"/i);
                if (metaMatch) {
                    const meta = metaMatch[1];
                    if (meta.length > 160) {
                        issues.push({ severity: 'MEDIUM', type: 'on-page', issue: `Meta description too long (${meta.length} chars)`, fix: 'Shorten to 150-160 characters' });
                    } else {
                        passed.push({ check: 'Meta description', status: `OK (${meta.length} chars)` });
                    }
                } else {
                    issues.push({ severity: 'HIGH', type: 'on-page', issue: 'Missing meta description', fix: 'Add meta description' });
                }

                // Check H1
                const h1Matches = html.match(/<h1[^>]*>(.*?)<\/h1>/gi) || [];
                if (h1Matches.length === 0) {
                    issues.push({ severity: 'HIGH', type: 'on-page', issue: 'No H1 tag found', fix: 'Add H1 with primary keyword' });
                } else if (h1Matches.length > 1) {
                    issues.push({ severity: 'MEDIUM', type: 'on-page', issue: `Multiple H1 tags (${h1Matches.length})`, fix: 'Use only one H1 per page' });
                } else {
                    passed.push({ check: 'H1 tag', status: 'OK (1 found)' });
                }

                // Check viewport
                if (html.includes('viewport')) {
                    passed.push({ check: 'Viewport meta', status: 'PRESENT' });
                } else {
                    issues.push({ severity: 'HIGH', type: 'mobile', issue: 'Missing viewport meta tag', fix: 'Add viewport meta for mobile' });
                }

                // Check schema
                const schemaCount = (html.match(/application\/ld\+json/g) || []).length;
                if (schemaCount > 0) {
                    passed.push({ check: 'Schema markup', status: `${schemaCount} found` });
                } else {
                    issues.push({ severity: 'MEDIUM', type: 'schema', issue: 'No structured data found', fix: 'Add JSON-LD schema' });
                }

                // Check canonical
                if (html.includes('rel="canonical"')) {
                    passed.push({ check: 'Canonical tag', status: 'PRESENT' });
                } else {
                    issues.push({ severity: 'MEDIUM', type: 'on-page', issue: 'Missing canonical tag', fix: 'Add self-referencing canonical' });
                }

            } else {
                issues.push({ severity: 'CRITICAL', type: 'accessibility', issue: `Homepage returned ${homeRes.status}`, fix: 'Fix server errors' });
            }
        } catch (e) {
            issues.push({ severity: 'CRITICAL', type: 'accessibility', issue: 'Could not access homepage', fix: 'Verify site is online' });
        }

        // Calculate score
        const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
        const highCount = issues.filter(i => i.severity === 'HIGH').length;
        const mediumCount = issues.filter(i => i.severity === 'MEDIUM').length;
        const score = Math.max(0, 100 - (criticalCount * 25) - (highCount * 10) - (mediumCount * 5));
        const grade = score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : score >= 50 ? 'D' : 'F';

        res.json({
            success: true,
            data: {
                siteUrl: url,
                score,
                grade,
                summary: {
                    passed: passed.length,
                    issues: issues.length,
                    critical: criticalCount,
                    high: highCount,
                    medium: mediumCount
                },
                passed,
                issues: issues.sort((a, b) => {
                    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
                    return order[a.severity] - order[b.severity];
                }),
                auditedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Opportunities
app.get('/api/seo-agents/opportunities', async (req, res) => {
    res.json({
        success: true,
        data: {
            ctrOpportunities: { count: 0, pages: [] },
            pageTwoKeywords: { count: 0, keywords: [] },
            priorityActions: [
                { type: 'SETUP', action: 'Connect Google Search Console for real data', impact: 'HIGH' },
                { type: 'AUDIT', action: 'Run full technical audit', impact: 'HIGH' },
                { type: 'CONTENT', action: 'Add schema markup to pages', impact: 'MEDIUM' }
            ],
            note: 'Connect GSC to see CTR and ranking opportunities'
        }
    });
});

// Page Analyzer
app.get('/api/seo-agents/analyze-page', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).json({ success: false, error: 'URL required' });
    }

    try {
        const response = await fetch(url, { timeout: 10000 });
        const html = await response.text();

        // Parse SEO elements
        const titleMatch = html.match(/<title>(.*?)<\/title>/i);
        const metaMatch = html.match(/<meta name="description" content="(.*?)"/i);
        const h1Matches = html.match(/<h1[^>]*>(.*?)<\/h1>/gi) || [];
        const schemaMatches = html.match(/<script type="application\/ld\+json">/gi) || [];
        const canonicalMatch = html.match(/<link rel="canonical" href="(.*?)"/i);
        const ogTitleMatch = html.match(/<meta property="og:title" content="(.*?)"/i);

        const title = titleMatch ? titleMatch[1] : null;
        const meta = metaMatch ? metaMatch[1] : null;
        const h1 = h1Matches[0]?.replace(/<[^>]+>/g, '').trim() || null;

        const recommendations = [];

        if (!title) recommendations.push('Add title tag');
        else if (title.length > 60) recommendations.push(`Shorten title from ${title.length} to 60 chars`);
        else if (title.length < 30) recommendations.push('Expand title with more keywords');

        if (!meta) recommendations.push('Add meta description');
        else if (meta.length > 160) recommendations.push(`Shorten meta description from ${meta.length} to 160 chars`);
        else if (meta.length < 120) recommendations.push('Expand meta description for better CTR');

        if (h1Matches.length === 0) recommendations.push('Add H1 tag');
        else if (h1Matches.length > 1) recommendations.push('Use only one H1 per page');

        if (schemaMatches.length === 0) recommendations.push('Add structured data (JSON-LD)');
        if (!canonicalMatch) recommendations.push('Add canonical tag');
        if (!ogTitleMatch) recommendations.push('Add Open Graph tags for social sharing');

        const score = Math.max(0, 100 - (recommendations.length * 12));

        res.json({
            success: true,
            data: {
                url,
                indexation: { indexed: true, clicks: '--', position: '--' },
                onPage: {
                    title,
                    titleLength: title?.length || 0,
                    metaDescription: meta,
                    metaLength: meta?.length || 0,
                    h1,
                    h1Count: h1Matches.length,
                    hasSchema: schemaMatches.length > 0,
                    schemaCount: schemaMatches.length,
                    hasCanonical: !!canonicalMatch,
                    hasOpenGraph: !!ogTitleMatch
                },
                recommendations,
                score
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Bulk Check
app.post('/api/seo-agents/bulk-check', async (req, res) => {
    const { urls } = req.body || {};
    if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ success: false, error: 'URLs array required' });
    }

    const results = [];
    let indexed = 0;

    for (const url of urls.slice(0, 50)) {
        try {
            const response = await fetch(url, { method: 'HEAD', timeout: 5000 });
            const isAccessible = response.ok;
            if (isAccessible) indexed++;
            results.push({ url, accessible: isAccessible, status: response.status });
        } catch (e) {
            results.push({ url, accessible: false, error: e.message });
        }
    }

    res.json({
        success: true,
        data: {
            total: urls.length,
            checked: results.length,
            indexed,
            notIndexed: results.length - indexed,
            indexRate: Math.round((indexed / results.length) * 100) + '%',
            results
        }
    });
});

// Terminal Command
app.post('/api/seo-agents/command', async (req, res) => {
    const { command, site } = req.body || {};
    if (!command) {
        return res.status(400).json({ success: false, error: 'Command required' });
    }

    const parts = command.trim().toLowerCase().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    switch (cmd) {
        case 'help':
            res.json({
                success: true,
                data: {
                    commands: [
                        'seo audit [url] - Run technical SEO audit',
                        'seo health [url] - Get health score',
                        's1 check [url] - Technical check',
                        's2 schema [url] - Check schema markup',
                        's3 content [url] - Analyze content',
                        's4 gsc - GSC status (requires setup)',
                        's5 wp - WordPress status',
                        's6 index [url] - Check indexation',
                        'help - Show this help'
                    ]
                }
            });
            break;
        case 'seo':
            if (args[0] === 'audit') {
                res.json({ success: true, data: { message: `Running audit for ${args[1] || site || 'default site'}...`, action: 'Use the Audit tab for full results' } });
            } else if (args[0] === 'health') {
                res.json({ success: true, data: { message: `Checking health for ${args[1] || site || 'default site'}...`, action: 'See Dashboard tab' } });
            } else {
                res.json({ success: true, data: { agent: 'SEO Orchestrator', status: 'Active', site: site || 'none' } });
            }
            break;
        case 's1':
        case 's2':
        case 's3':
        case 's4':
        case 's5':
        case 's6':
            const agentNames = { s1: 'Technical SEO', s2: 'Schema', s3: 'Content', s4: 'GSC', s5: 'WordPress', s6: 'Indexation' };
            res.json({ success: true, data: { agent: agentNames[cmd], status: 'Activated', command: args.join(' '), site: site || 'none' } });
            break;
        default:
            res.json({ success: true, data: { message: `Unknown command: ${cmd}`, hint: "Type 'help' for available commands" } });
    }
});

// GSC Placeholder routes
app.get('/api/gsc/summary', (req, res) => {
    res.json({
        success: true,
        message: 'GSC not configured',
        totalClicks: 0,
        totalImpressions: 0,
        averageCTR: 0,
        averagePosition: 0,
        note: 'Add Google Search Console credentials to enable'
    });
});

app.get('/api/gsc/pages', (req, res) => {
    res.json({
        success: true,
        message: 'GSC not configured',
        pages: [],
        note: 'Add Google Search Console credentials to enable'
    });
});

// ============================================================
// START SERVER
// ============================================================

// For Vercel serverless deployment
export default app;

// For local development
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════╗
║   🤖 SEO Agents Dashboard Running                      ║
╚════════════════════════════════════════════════════════╝

🌐 Dashboard:  http://localhost:${PORT}/seo-agents
📊 API:        http://localhost:${PORT}/api/seo-agents/health

Press Ctrl+C to stop
        `);
    });
}
