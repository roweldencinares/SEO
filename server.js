/**
 * SEO Agents Dashboard - Multi-Site Server
 * Full SEO automation platform with Google Search Console & Analytics integration
 */

import express from 'express';
import { google } from 'googleapis';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import rateLimit from 'express-rate-limit';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later.'
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/api/', apiLimiter);

// Disable caching for development
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// MULTI-SITE CONFIGURATION
// ============================================================

// Sites are stored in memory (use database for production)
let siteConfigs = {};

// Helper to get site URL for GSC
// GSC accepts either: "https://example.com/" (URL property) or "sc-domain:example.com" (domain property)
function getGSCSiteUrl(siteUrl) {
    if (!siteUrl) return siteUrl;

    // If already sc-domain format, keep it
    if (siteUrl.startsWith('sc-domain:')) {
        return siteUrl;
    }

    // Otherwise, ensure URL has trailing slash (required by GSC API for URL properties)
    try {
        const url = new URL(siteUrl);
        return url.origin + '/';
    } catch {
        return siteUrl;
    }
}

// ============================================================
// OAUTH CONFIGURATION
// ============================================================

let oauth2Client = null;

// Use /tmp on Vercel (writable) or local directory
const isVercel = process.env.VERCEL === '1';
const tokenPath = isVercel ? '/tmp/google-tokens.json' : path.join(__dirname, 'google-tokens.json');

// Helper to save tokens safely
function saveTokens(tokens) {
    try {
        fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
        console.log('✅ Tokens saved to', tokenPath);
        return true;
    } catch (error) {
        console.log('⚠️ Could not save tokens to file:', error.message);
        return false;
    }
}

// Helper to load tokens
function loadTokens() {
    // Try environment variable first (for Vercel persistence)
    if (process.env.GOOGLE_REFRESH_TOKEN) {
        console.log('✅ Loading tokens from environment');
        return {
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
            access_token: process.env.GOOGLE_ACCESS_TOKEN || null,
            expiry_date: parseInt(process.env.GOOGLE_TOKEN_EXPIRY) || 0
        };
    }

    // Try file
    try {
        if (fs.existsSync(tokenPath)) {
            const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
            console.log('✅ Loaded tokens from file');
            return tokens;
        }
    } catch (error) {
        console.log('⚠️ Could not load tokens from file:', error.message);
    }

    return null;
}

try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;

    if (clientId && clientSecret) {
        oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        console.log('✅ OAuth configured');

        // Load existing tokens
        const tokens = loadTokens();
        if (tokens) {
            oauth2Client.setCredentials(tokens);
        }
    }
} catch (error) {
    console.log('⚠️ OAuth not configured:', error.message);
}

// Helper to ensure valid token
async function ensureValidToken() {
    if (!oauth2Client) throw new Error('OAuth not configured');

    const tokens = oauth2Client.credentials;
    if (!tokens.access_token && !tokens.refresh_token) throw new Error('Not authenticated. Please go to /auth/google to connect.');

    // Check expiry and refresh if needed
    if (!tokens.access_token || (tokens.expiry_date && tokens.expiry_date < Date.now() + 300000)) {
        try {
            const { credentials } = await oauth2Client.refreshAccessToken();
            oauth2Client.setCredentials(credentials);
            saveTokens(credentials);
        } catch (error) {
            throw new Error('Token refresh failed. Please re-authenticate at /auth/google');
        }
    }

    return oauth2Client;
}

// Helper function for date calculations
function getDateDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
}

// ============================================================
// CLIENT CONFIG API (env-var driven, swap clients by changing vars)
// ============================================================

app.get('/api/config', (req, res) => {
    res.json({
        domain: process.env.CLIENT_DOMAIN || 'example.com',
        name: process.env.CLIENT_NAME || 'Your Company',
        tagline: process.env.CLIENT_TAGLINE || 'SEO Performance Dashboard',
        primaryColor: process.env.CLIENT_PRIMARY_COLOR || '#1a365d',
        accentColor: process.env.CLIENT_ACCENT_COLOR || '#ffd65a',
        logoUrl: process.env.CLIENT_LOGO_URL || '',
        contactEmail: process.env.CLIENT_CONTACT_EMAIL || '',
        contactPhone: process.env.CLIENT_CONTACT_PHONE || '',
        location: process.env.CLIENT_LOCATION || '',
        industry: process.env.CLIENT_INDUSTRY || ''
    });
});

// ============================================================
// PAGE ROUTES
// ============================================================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'seo-dashboard.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'seo-dashboard.html')));
app.get('/seo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'seo-dashboard.html')));
app.get('/seo-agents', (req, res) => res.sendFile(path.join(__dirname, 'public', 'seo-agents.html')));
app.get('/keywords', (req, res) => res.sendFile(path.join(__dirname, 'public', 'keywords-live.html')));
app.get('/keywords-live', (req, res) => res.sendFile(path.join(__dirname, 'public', 'keywords-live.html')));
app.get('/website-audit', (req, res) => res.sendFile(path.join(__dirname, 'public', 'website-audit.html')));
app.get('/indexation-control', (req, res) => res.sendFile(path.join(__dirname, 'public', 'indexation-control.html')));
app.get('/deindex-recovery', (req, res) => res.sendFile(path.join(__dirname, 'public', 'deindex-recovery.html')));
app.get('/sitemap-automation', (req, res) => res.sendFile(path.join(__dirname, 'public', 'sitemap-automation.html')));
app.get('/entity-management', (req, res) => res.sendFile(path.join(__dirname, 'public', 'entity-management.html')));
app.get('/actions', (req, res) => res.sendFile(path.join(__dirname, 'public', 'action-plan.html')));
app.get('/progress', (req, res) => res.sendFile(path.join(__dirname, 'public', 'progress.html')));
app.get('/universal-audit', (req, res) => res.sendFile(path.join(__dirname, 'public', 'universal-audit.html')));

// ============================================================
// AUTH ROUTES
// ============================================================

app.get('/auth/google', (req, res) => {
    if (!oauth2Client) {
        return res.status(500).send('OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
    }

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/webmasters.readonly',
            'https://www.googleapis.com/auth/webmasters'
        ],
        prompt: 'consent'
    });

    res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('No code provided');

    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Save tokens using helper function
        const saved = saveTokens(tokens);

        // On Vercel, show the refresh token so user can add it as env var for persistence
        if (isVercel && tokens.refresh_token) {
            res.send(`
                <html>
                <body style="font-family: sans-serif; padding: 40px; background: linear-gradient(135deg, #667eea, #764ba2); min-height: 100vh;">
                    <div style="background: white; padding: 40px; border-radius: 15px; max-width: 700px; margin: 0 auto;">
                        <h1 style="color: #28a745;">✅ Authentication Successful!</h1>
                        <p style="color: #666; margin: 20px 0;">Your Google Search Console is now connected for this session.</p>

                        <div style="background: #fff3cd; padding: 20px; border-radius: 10px; margin: 20px 0;">
                            <h3 style="color: #856404; margin-bottom: 10px;">⚠️ For Persistent Access</h3>
                            <p style="color: #856404; margin-bottom: 15px;">Add this refresh token to Vercel environment variables to stay connected:</p>
                            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 12px;">
                                GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}
                            </div>
                            <p style="color: #666; font-size: 12px; margin-top: 10px;">
                                Go to Vercel → Project Settings → Environment Variables → Add this variable → Redeploy
                            </p>
                        </div>

                        <a href="/seo-agents" style="display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px;">
                            Go to Dashboard →
                        </a>
                    </div>
                </body>
                </html>
            `);
        } else {
            res.send(`
                <html>
                <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: linear-gradient(135deg, #667eea, #764ba2);">
                    <div style="background: white; padding: 40px; border-radius: 15px; text-align: center;">
                        <h1 style="color: #28a745;">✅ Authentication Successful!</h1>
                        <p>Redirecting to dashboard...</p>
                    </div>
                    <script>setTimeout(() => window.location.href = '/seo-agents', 1500);</script>
                </body>
                </html>
            `);
        }
    } catch (error) {
        res.status(500).send(`Authentication failed: ${error.message}`);
    }
});

// ============================================================
// GSC API ROUTES (Multi-Site)
// ============================================================

app.get('/api/gsc/status', async (req, res) => {
    if (!oauth2Client) {
        return res.json({ authenticated: false, message: 'OAuth not configured' });
    }
    const tokens = oauth2Client.credentials;

    // If we have an access_token and it's not expired, we're good
    if (tokens?.access_token && tokens?.expiry_date && tokens.expiry_date > Date.now() + 60000) {
        return res.json({ authenticated: true, expiryDate: tokens.expiry_date });
    }

    // If we have a refresh_token, try to refresh automatically
    if (tokens?.refresh_token) {
        try {
            const { credentials } = await oauth2Client.refreshAccessToken();
            oauth2Client.setCredentials(credentials);
            saveTokens(credentials);
            return res.json({ authenticated: true, expiryDate: credentials.expiry_date });
        } catch (error) {
            console.log('Auto-refresh failed on status check:', error.message);
            return res.json({ authenticated: false, message: 'Token refresh failed', canRetry: true });
        }
    }

    res.json({ authenticated: false, expiryDate: tokens?.expiry_date });
});

// Explicit refresh endpoint for client-side reconnection
app.post('/api/gsc/refresh', async (req, res) => {
    try {
        await ensureValidToken();
        const tokens = oauth2Client.credentials;
        res.json({ success: true, authenticated: true, expiryDate: tokens.expiry_date });
    } catch (error) {
        res.json({ success: false, authenticated: false, error: error.message });
    }
});

app.get('/api/gsc/sites', async (req, res) => {
    try {
        await ensureValidToken();
        const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });
        const response = await searchconsole.sites.list();
        res.json({ success: true, sites: response.data.siteEntry || [] });
    } catch (error) {
        res.json({ success: false, error: error.message, sites: [] });
    }
});

app.get('/api/gsc/summary', async (req, res) => {
    try {
        await ensureValidToken();

        const site = req.query.site || req.query.gsc;
        if (!site) {
            return res.json({ authenticated: true, success: false, error: 'Site parameter required' });
        }

        const siteUrl = getGSCSiteUrl(site);
        const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });

        const response = await searchconsole.searchanalytics.query({
            siteUrl,
            requestBody: {
                startDate: getDateDaysAgo(30),
                endDate: getDateDaysAgo(0),
                dimensions: ['query'],
                rowLimit: 25000
            }
        });

        const rows = response.data.rows || [];
        let totalClicks = 0, totalImpressions = 0, totalPosition = 0, top10Count = 0;

        rows.forEach(row => {
            totalClicks += row.clicks || 0;
            totalImpressions += row.impressions || 0;
            totalPosition += row.position || 0;
            if (row.position <= 10) top10Count++;
        });

        res.json({
            authenticated: true,
            success: true,
            site: siteUrl,
            summary: {
                keywordsTracked: rows.length,
                top10Rankings: top10Count,
                avgPosition: rows.length > 0 ? (totalPosition / rows.length).toFixed(1) : 0,
                totalClicks,
                totalImpressions,
                avgCTR: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : 0
            }
        });
    } catch (error) {
        res.json({ authenticated: false, error: error.message, summary: null });
    }
});

app.get('/api/gsc/keywords', async (req, res) => {
    try {
        await ensureValidToken();

        const site = req.query.site || req.query.gsc;
        const limit = parseInt(req.query.limit) || 100;

        if (!site) {
            return res.json({ success: false, error: 'Site parameter required' });
        }

        const siteUrl = getGSCSiteUrl(site);
        const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });

        const response = await searchconsole.searchanalytics.query({
            siteUrl,
            requestBody: {
                startDate: getDateDaysAgo(30),
                endDate: getDateDaysAgo(0),
                dimensions: ['query'],
                rowLimit: 25000
            }
        });

        const keywords = (response.data.rows || [])
            .map(row => ({
                keyword: row.keys[0],
                clicks: row.clicks || 0,
                impressions: row.impressions || 0,
                ctr: ((row.ctr || 0) * 100).toFixed(2),
                position: (row.position || 0).toFixed(1)
            }))
            .sort((a, b) => parseFloat(a.position) - parseFloat(b.position))
            .slice(0, limit);

        res.json({ authenticated: true, success: true, count: keywords.length, keywords });
    } catch (error) {
        res.json({ authenticated: false, error: error.message, keywords: [] });
    }
});

app.get('/api/gsc/pages', async (req, res) => {
    try {
        await ensureValidToken();

        const site = req.query.site || req.query.gsc;
        const limit = parseInt(req.query.limit) || 10;

        if (!site) {
            return res.json({ success: false, error: 'Site parameter required' });
        }

        const siteUrl = getGSCSiteUrl(site);
        const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });

        const response = await searchconsole.searchanalytics.query({
            siteUrl,
            requestBody: {
                startDate: getDateDaysAgo(30),
                endDate: getDateDaysAgo(0),
                dimensions: ['page'],
                rowLimit: limit
            }
        });

        const pages = (response.data.rows || []).map(row => ({
            page: row.keys[0],
            clicks: row.clicks || 0,
            impressions: row.impressions || 0,
            ctr: ((row.ctr || 0) * 100).toFixed(2),
            position: (row.position || 0).toFixed(1)
        }));

        res.json({ authenticated: true, success: true, count: pages.length, pages });
    } catch (error) {
        res.json({ authenticated: false, error: error.message, pages: [] });
    }
});

app.get('/api/gsc/analytics', async (req, res) => {
    try {
        await ensureValidToken();

        const site = req.query.site || req.query.gsc;
        const { startDate, endDate, dimensions = 'query' } = req.query;

        if (!site) {
            return res.json({ success: false, error: 'Site parameter required' });
        }

        const siteUrl = getGSCSiteUrl(site);
        const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });

        const response = await searchconsole.searchanalytics.query({
            siteUrl,
            requestBody: {
                startDate: startDate || getDateDaysAgo(30),
                endDate: endDate || getDateDaysAgo(0),
                dimensions: dimensions.split(','),
                rowLimit: 25000
            }
        });

        res.json({
            success: true,
            siteUrl,
            dateRange: { startDate, endDate },
            dimensions: dimensions.split(','),
            rowCount: (response.data.rows || []).length,
            rows: response.data.rows || []
        });
    } catch (error) {
        res.json({ authenticated: false, error: error.message, rows: [] });
    }
});

app.get('/api/gsc/rankings', async (req, res) => {
    try {
        await ensureValidToken();

        const site = req.query.site || req.query.gsc;
        if (!site) {
            return res.json({ success: false, error: 'Site parameter required' });
        }

        const siteUrl = getGSCSiteUrl(site);
        const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });

        // Current week
        const currentData = await searchconsole.searchanalytics.query({
            siteUrl,
            requestBody: {
                startDate: getDateDaysAgo(7),
                endDate: getDateDaysAgo(0),
                dimensions: ['query'],
                rowLimit: 25000
            }
        });

        // Previous week for comparison
        const previousData = await searchconsole.searchanalytics.query({
            siteUrl,
            requestBody: {
                startDate: getDateDaysAgo(14),
                endDate: getDateDaysAgo(7),
                dimensions: ['query'],
                rowLimit: 25000
            }
        });

        const currentMap = new Map();
        (currentData.data.rows || []).forEach(row => {
            currentMap.set(row.keys[0], row);
        });

        const previousMap = new Map();
        (previousData.data.rows || []).forEach(row => {
            previousMap.set(row.keys[0], row);
        });

        const rankings = Array.from(currentMap.entries()).map(([keyword, current]) => {
            const previous = previousMap.get(keyword);
            const positionChange = previous ? previous.position - current.position : 0;

            return {
                keyword,
                position: current.position,
                clicks: current.clicks,
                impressions: current.impressions,
                ctr: current.ctr,
                positionChange,
                trend: positionChange > 0 ? 'up' : positionChange < 0 ? 'down' : 'stable'
            };
        }).sort((a, b) => b.clicks - a.clicks);

        res.json({
            success: true,
            totalKeywords: rankings.length,
            rankings
        });
    } catch (error) {
        res.json({ authenticated: false, error: error.message, rankings: [] });
    }
});

// ============================================================
// SEO AGENTS API ROUTES
// ============================================================

app.get('/api/seo-agents/health', async (req, res) => {
    const siteUrl = req.query.site || 'https://example.com';

    try {
        let score = 50;
        const issues = [];
        const checks = { robots: false, sitemap: false, https: false, title: false, meta: false };

        // Check HTTPS
        if (siteUrl.startsWith('https://')) {
            score += 10;
            checks.https = true;
        } else {
            issues.push({ type: 'security', message: 'Site not using HTTPS', severity: 'high' });
        }

        // Check robots.txt
        try {
            const robotsRes = await fetch(`${siteUrl}/robots.txt`, { timeout: 5000 });
            if (robotsRes.ok) {
                score += 10;
                checks.robots = true;
            }
        } catch (e) {
            issues.push({ type: 'technical', message: 'robots.txt not accessible', severity: 'medium' });
        }

        // Check sitemap
        try {
            const sitemapRes = await fetch(`${siteUrl}/sitemap.xml`, { timeout: 5000 });
            if (sitemapRes.ok) {
                score += 10;
                checks.sitemap = true;
            }
        } catch (e) {
            issues.push({ type: 'technical', message: 'sitemap.xml not found', severity: 'medium' });
        }

        // Check homepage
        try {
            const homeRes = await fetch(siteUrl, { timeout: 10000 });
            const html = await homeRes.text();
            const $ = cheerio.load(html);

            if ($('title').length && $('title').text().trim()) {
                score += 10;
                checks.title = true;
            } else {
                issues.push({ type: 'content', message: 'Missing or empty title tag', severity: 'high' });
            }

            if ($('meta[name="description"]').length) {
                score += 10;
                checks.meta = true;
            } else {
                issues.push({ type: 'content', message: 'Missing meta description', severity: 'medium' });
            }
        } catch (e) {
            issues.push({ type: 'technical', message: 'Could not fetch homepage', severity: 'high' });
        }

        const grade = score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D';

        res.json({
            success: true,
            data: {
                overall: Math.min(score, 100),
                grade,
                breakdown: {
                    technical: checks.robots && checks.sitemap ? 80 : 40,
                    security: checks.https ? 100 : 20,
                    content: checks.title && checks.meta ? 80 : 40
                },
                checks,
                issues
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/seo-agents/audit', async (req, res) => {
    const url = req.query.url || req.query.site || 'https://example.com';

    try {
        const results = {
            url,
            timestamp: new Date().toISOString(),
            checks: [],
            score: 0,
            maxScore: 0
        };

        const addCheck = (name, passed, weight = 1, details = '') => {
            results.checks.push({ name, passed, weight, details });
            results.maxScore += weight * 10;
            if (passed) results.score += weight * 10;
        };

        // HTTPS Check
        addCheck('HTTPS', url.startsWith('https://'), 2, url.startsWith('https://') ? 'Site uses HTTPS' : 'Site not using HTTPS');

        // Fetch page
        const response = await fetch(url, { timeout: 15000 });
        const html = await response.text();
        const $ = cheerio.load(html);

        // Title
        const title = $('title').text().trim();
        addCheck('Title Tag', !!title && title.length > 0, 2, title ? `Title: "${title.substring(0, 60)}..."` : 'Missing title');
        addCheck('Title Length', title.length >= 30 && title.length <= 60, 1, `Length: ${title.length} chars`);

        // Meta Description
        const metaDesc = $('meta[name="description"]').attr('content') || '';
        addCheck('Meta Description', !!metaDesc, 2, metaDesc ? `Description: "${metaDesc.substring(0, 80)}..."` : 'Missing');
        addCheck('Meta Description Length', metaDesc.length >= 120 && metaDesc.length <= 160, 1, `Length: ${metaDesc.length} chars`);

        // H1
        const h1Count = $('h1').length;
        addCheck('H1 Tag', h1Count === 1, 2, `Found ${h1Count} H1 tag(s)`);

        // Viewport
        addCheck('Viewport Meta', $('meta[name="viewport"]').length > 0, 1, 'Mobile viewport configured');

        // Canonical
        const canonical = $('link[rel="canonical"]').attr('href');
        addCheck('Canonical URL', !!canonical, 1, canonical ? `Canonical: ${canonical}` : 'Missing canonical');

        // Schema/JSON-LD
        const hasSchema = $('script[type="application/ld+json"]').length > 0;
        addCheck('Schema Markup', hasSchema, 1, hasSchema ? 'JSON-LD schema found' : 'No schema markup');

        // Images alt text
        const images = $('img');
        const imagesWithAlt = $('img[alt]').length;
        addCheck('Image Alt Text', imagesWithAlt >= images.length * 0.8, 1, `${imagesWithAlt}/${images.length} images have alt text`);

        // robots.txt
        try {
            const robotsRes = await fetch(`${new URL(url).origin}/robots.txt`, { timeout: 5000 });
            addCheck('robots.txt', robotsRes.ok, 1, robotsRes.ok ? 'robots.txt accessible' : 'Not found');
        } catch {
            addCheck('robots.txt', false, 1, 'Could not check');
        }

        // sitemap.xml
        try {
            const sitemapRes = await fetch(`${new URL(url).origin}/sitemap.xml`, { timeout: 5000 });
            addCheck('sitemap.xml', sitemapRes.ok, 1, sitemapRes.ok ? 'sitemap.xml found' : 'Not found');
        } catch {
            addCheck('sitemap.xml', false, 1, 'Could not check');
        }

        const percentage = Math.round((results.score / results.maxScore) * 100);
        const grade = percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : 'D';

        res.json({
            success: true,
            data: {
                url,
                score: percentage,
                grade,
                passed: results.checks.filter(c => c.passed).length,
                total: results.checks.length,
                checks: results.checks,
                issues: results.checks.filter(c => !c.passed).map(c => ({
                    name: c.name,
                    severity: c.weight >= 2 ? 'high' : 'medium',
                    details: c.details
                }))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/seo-agents/analyze-page', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).json({ success: false, error: 'URL parameter required' });
    }

    try {
        const response = await fetch(url, { timeout: 15000 });
        const html = await response.text();
        const $ = cheerio.load(html);

        const analysis = {
            url,
            title: $('title').text().trim(),
            metaDescription: $('meta[name="description"]').attr('content') || '',
            h1: $('h1').first().text().trim(),
            h2Count: $('h2').length,
            h3Count: $('h3').length,
            wordCount: $('body').text().split(/\s+/).filter(w => w.length > 0).length,
            imageCount: $('img').length,
            imagesWithAlt: $('img[alt]').length,
            internalLinks: $('a[href^="/"], a[href^="' + new URL(url).origin + '"]').length,
            externalLinks: $('a[href^="http"]').not('a[href^="' + new URL(url).origin + '"]').length,
            hasSchema: $('script[type="application/ld+json"]').length > 0,
            canonical: $('link[rel="canonical"]').attr('href') || null,
            ogTitle: $('meta[property="og:title"]').attr('content') || null,
            ogDescription: $('meta[property="og:description"]').attr('content') || null,
            ogImage: $('meta[property="og:image"]').attr('content') || null
        };

        // Generate recommendations
        const recommendations = [];
        if (!analysis.title) recommendations.push('Add a title tag');
        if (analysis.title && analysis.title.length < 30) recommendations.push('Title too short - aim for 50-60 characters');
        if (!analysis.metaDescription) recommendations.push('Add a meta description');
        if (analysis.metaDescription && analysis.metaDescription.length < 120) recommendations.push('Meta description too short - aim for 150-160 characters');
        if (!analysis.h1) recommendations.push('Add an H1 heading');
        if (analysis.wordCount < 300) recommendations.push('Content may be too thin - consider adding more text');
        if (analysis.imagesWithAlt < analysis.imageCount) recommendations.push(`Add alt text to ${analysis.imageCount - analysis.imagesWithAlt} images`);
        if (!analysis.hasSchema) recommendations.push('Add structured data (JSON-LD schema)');
        if (!analysis.canonical) recommendations.push('Add a canonical URL');

        res.json({
            success: true,
            data: {
                ...analysis,
                recommendations,
                score: Math.max(0, 100 - (recommendations.length * 10))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/seo-agents/bulk-check', async (req, res) => {
    const { urls } = req.body || {};
    if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ success: false, error: 'URLs array required' });
    }

    const results = [];
    let accessible = 0;

    for (const url of urls.slice(0, 50)) {
        try {
            const response = await fetch(url, { method: 'HEAD', timeout: 5000 });
            const ok = response.ok;
            if (ok) accessible++;
            results.push({ url, accessible: ok, status: response.status });
        } catch (e) {
            results.push({ url, accessible: false, error: e.message });
        }
    }

    res.json({
        success: true,
        data: {
            total: urls.length,
            checked: results.length,
            accessible,
            notAccessible: results.length - accessible,
            accessRate: Math.round((accessible / results.length) * 100) + '%',
            results
        }
    });
});

app.get('/api/seo-agents/opportunities', async (req, res) => {
    const site = req.query.site;

    // Return sample opportunities (would integrate with GSC for real data)
    res.json({
        success: true,
        data: {
            opportunities: [
                { type: 'quick-win', title: 'Improve meta descriptions', impact: 'medium', effort: 'low' },
                { type: 'technical', title: 'Add schema markup', impact: 'high', effort: 'medium' },
                { type: 'content', title: 'Create FAQ content', impact: 'high', effort: 'medium' }
            ]
        }
    });
});

app.post('/api/seo-agents/command', async (req, res) => {
    const { command, site } = req.body || {};
    if (!command) {
        return res.status(400).json({ success: false, error: 'Command required' });
    }

    const parts = command.trim().toLowerCase().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    const agentNames = {
        seo: 'SEO Orchestrator',
        s1: 'Technical SEO',
        s2: 'Schema',
        s3: 'Content',
        s4: 'GSC',
        s5: 'WordPress',
        s6: 'Indexation'
    };

    if (cmd === 'help') {
        return res.json({
            success: true,
            data: {
                commands: [
                    'seo audit [url] - Run full SEO audit',
                    'seo health - Get site health score',
                    's1 check [url] - Technical analysis',
                    's2 schema [url] - Check schema markup',
                    's3 content [url] - Analyze content',
                    's4 gsc - GSC status',
                    's5 wp - WordPress status',
                    's6 index [url] - Check indexation',
                    'help - Show commands'
                ]
            }
        });
    }

    if (agentNames[cmd]) {
        return res.json({
            success: true,
            data: {
                agent: agentNames[cmd],
                status: 'Activated',
                command: args.join(' ') || 'ready',
                site: site || 'none'
            }
        });
    }

    res.json({
        success: true,
        data: { message: `Unknown: ${cmd}`, hint: "Type 'help'" }
    });
});

// ============================================================
// WEBSITE AUDIT API
// ============================================================

app.post('/api/seo-audit', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ success: false, error: 'URL required' });
    }

    try {
        // Reuse the audit logic
        const auditResponse = await fetch(`http://localhost:${PORT}/api/seo-agents/audit?url=${encodeURIComponent(url)}`);
        const auditData = await auditResponse.json();
        res.json(auditData);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// CORE WEB VITALS (Simulated)
// ============================================================

app.get('/api/web-vitals', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.json({ success: false, error: 'URL required' });
    }

    // Simulated Web Vitals (would use PageSpeed Insights API in production)
    res.json({
        success: true,
        url,
        vitals: {
            LCP: { value: 2.1, rating: 'good', unit: 's' },
            FID: { value: 45, rating: 'good', unit: 'ms' },
            CLS: { value: 0.05, rating: 'good', unit: '' },
            TTFB: { value: 0.8, rating: 'good', unit: 's' },
            FCP: { value: 1.2, rating: 'good', unit: 's' }
        },
        score: 85,
        note: 'Connect Google PageSpeed Insights API for real data'
    });
});

// ============================================================
// SERVER START
// ============================================================

export default app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║   🤖 SEO Agents Dashboard - Multi-Site Platform           ║
╚════════════════════════════════════════════════════════════╝

📊 Dashboard:      http://localhost:${PORT}/
🤖 SEO Agents:     http://localhost:${PORT}/seo-agents
🔍 Website Audit:  http://localhost:${PORT}/website-audit
📈 Keywords:       http://localhost:${PORT}/keywords
🛡️ Indexation:     http://localhost:${PORT}/indexation-control

🔑 GSC Auth:       http://localhost:${PORT}/auth/google

Press Ctrl+C to stop
        `);
    });
}
