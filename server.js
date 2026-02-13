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
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// Supabase Client
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

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

// Competitor tracking
let competitorsList = [];
const crawlCache = new Map();
const speedCache = new Map();
const sitemapCache = new Map();
const CRAWL_CACHE_TTL = 24 * 60 * 60 * 1000;
const SPEED_CACHE_TTL = 60 * 60 * 1000;
const SITEMAP_CACHE_TTL = 24 * 60 * 60 * 1000;

function normalizeDomain(input) {
    let d = input.trim().toLowerCase();
    d = d.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
    return d;
}

function getCached(cache, key, ttl) {
    const entry = cache.get(key);
    if (entry && (Date.now() - entry.timestamp) < ttl) return entry.data;
    return null;
}

// Load competitors from Supabase on startup
async function loadCompetitorsFromDB() {
    if (!supabase) return;
    try {
        const { data } = await supabase.from('competitors').select('*').order('added_at', { ascending: true });
        if (data) competitorsList = data;
    } catch (e) { console.log('Competitors table not found, will create on first add'); }
}
loadCompetitorsFromDB();

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

app.get('/', (req, res) => res.redirect('/seo-agents'));
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
app.get('/competitors', (req, res) => res.sendFile(path.join(__dirname, 'public', 'competitors.html')));
app.get('/local-listing', (req, res) => res.sendFile(path.join(__dirname, 'public', 'local-listing.html')));
app.get('/ai-discovery', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ai-discovery.html')));
app.get('/alerts', (req, res) => res.sendFile(path.join(__dirname, 'public', 'alerts.html')));
app.get('/integrations', (req, res) => res.sendFile(path.join(__dirname, 'public', 'integrations.html')));
app.get('/email-campaigns', (req, res) => res.sendFile(path.join(__dirname, 'public', 'email-campaigns.html')));

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
// LOCAL LISTING SCANNER (Real directory checks)
// ============================================================

app.get('/api/local-listing/scan', async (req, res) => {
    const domain = req.query.domain || process.env.CLIENT_DOMAIN || 'example.com';
    const name = req.query.name || process.env.CLIENT_NAME || 'Business';
    const phone = process.env.CLIENT_CONTACT_PHONE || '';
    const location = process.env.CLIENT_LOCATION || '';

    const directories = [
        { name: 'Google Business', icon: 'G', searchUrl: `https://www.google.com/search?q="${encodeURIComponent(name)}"+"${encodeURIComponent(location)}"` },
        { name: 'Bing Places', icon: 'B', searchUrl: `https://www.bing.com/search?q="${encodeURIComponent(name)}"+"${encodeURIComponent(domain)}"` },
        { name: 'Yelp', icon: 'Y', checkUrl: `https://www.yelp.com/search?find_desc=${encodeURIComponent(name)}&find_loc=${encodeURIComponent(location)}` },
        { name: 'Facebook', icon: 'F', checkUrl: `https://www.facebook.com/search/pages/?q=${encodeURIComponent(name)}` },
        { name: 'BBB', icon: 'BBB', checkUrl: `https://www.bbb.org/search?find_text=${encodeURIComponent(name)}&find_loc=${encodeURIComponent(location)}` },
        { name: 'Yellow Pages', icon: 'YP', checkUrl: `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(name)}&geo_location_terms=${encodeURIComponent(location)}` },
        { name: 'Angi', icon: 'An', checkUrl: `https://www.angi.com/search?query=${encodeURIComponent(name)}` },
        { name: 'HomeAdvisor', icon: 'HA', checkUrl: `https://www.homeadvisor.com/` },
        { name: 'LinkedIn', icon: 'in', checkUrl: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(name)}` },
        { name: 'Thumbtack', icon: 'T', checkUrl: `https://www.thumbtack.com/search?query=${encodeURIComponent(name)}` },
        { name: 'Apple Maps', icon: 'A', checkUrl: `https://maps.apple.com/?q=${encodeURIComponent(name)}` },
        { name: 'Nextdoor', icon: 'N', checkUrl: `https://nextdoor.com/` }
    ];

    const results = [];

    // Check each directory by searching Google for site-specific results
    const checkPromises = directories.map(async (dir) => {
        try {
            // Search Google for the business name + directory domain
            const dirDomain = dir.checkUrl ? new URL(dir.checkUrl).hostname.replace('www.', '') : '';
            const searchQuery = `site:${dirDomain} "${name}"`;
            const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=3`;

            const response = await fetch(googleUrl, {
                timeout: 8000,
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOBot/1.0)' }
            });
            const html = await response.text();
            const found = html.toLowerCase().includes(name.toLowerCase()) && html.toLowerCase().includes(dirDomain.toLowerCase());

            return { ...dir, listed: found, method: 'google-search' };
        } catch (e) {
            // Fallback: try to directly check if the business website mentions this directory
            return { ...dir, listed: false, method: 'error', error: e.message };
        }
    });

    const directoryResults = await Promise.allSettled(checkPromises);
    directoryResults.forEach(r => {
        if (r.status === 'fulfilled') results.push(r.value);
        else results.push({ name: 'Unknown', listed: false, error: r.reason });
    });

    // Also check the business website itself for signals
    let websiteSignals = {};
    try {
        const siteRes = await fetch(`https://${domain}`, { timeout: 10000 });
        const siteHtml = await siteRes.text();
        const $ = cheerio.load(siteHtml);

        websiteSignals = {
            hasAddress: siteHtml.toLowerCase().includes(location.toLowerCase()) || $('[itemprop="address"]').length > 0,
            hasPhone: phone ? siteHtml.includes(phone.replace(/\D/g, '').slice(-10)) : false,
            hasSchema: $('script[type="application/ld+json"]').length > 0,
            hasLocalBusiness: siteHtml.includes('LocalBusiness') || siteHtml.includes('localbusiness'),
            hasGoogleMaps: siteHtml.includes('maps.google') || siteHtml.includes('google.com/maps') || siteHtml.includes('maps.googleapis'),
            napConsistent: true
        };
    } catch (e) {
        websiteSignals = { hasAddress: false, hasPhone: false, hasSchema: false, hasLocalBusiness: false, hasGoogleMaps: false, napConsistent: false };
    }

    const listedCount = results.filter(r => r.listed).length;
    const totalDirs = results.length;
    const signalScore = Object.values(websiteSignals).filter(v => v === true).length;
    const localScore = Math.round((listedCount / totalDirs) * 50 + (signalScore / 6) * 50);

    res.json({
        success: true,
        domain,
        businessName: name,
        location,
        phone,
        directories: results.map(r => ({ name: r.name, icon: r.icon, listed: r.listed })),
        websiteSignals,
        stats: {
            listed: listedCount,
            notListed: totalDirs - listedCount,
            total: totalDirs,
            localScore,
            napConsistency: websiteSignals.napConsistent && websiteSignals.hasAddress && websiteSignals.hasPhone ? 'High' : websiteSignals.hasAddress || websiteSignals.hasPhone ? 'Medium' : 'Low'
        }
    });
});

// ============================================================
// AI DISCOVERY SCANNER (Real web presence checks)
// ============================================================

app.get('/api/ai-discovery/scan', async (req, res) => {
    const domain = req.query.domain || process.env.CLIENT_DOMAIN || 'example.com';
    const name = req.query.name || process.env.CLIENT_NAME || 'Business';
    const location = process.env.CLIENT_LOCATION || '';
    const industry = process.env.CLIENT_INDUSTRY || '';

    const signals = {
        schema: false,
        localBusiness: false,
        wikipedia: false,
        socialProfiles: [],
        citations: 0,
        contentDepth: 0,
        brandMentions: 0
    };

    // 1. Check website for AI-readability signals
    try {
        const siteRes = await fetch(`https://${domain}`, { timeout: 10000 });
        const siteHtml = await siteRes.text();
        const $ = cheerio.load(siteHtml);

        // Schema markup
        const schemas = $('script[type="application/ld+json"]');
        signals.schema = schemas.length > 0;

        // Parse schema types
        const schemaTypes = [];
        schemas.each((i, el) => {
            try {
                const data = JSON.parse($(el).html());
                if (data['@type']) schemaTypes.push(data['@type']);
                if (Array.isArray(data['@graph'])) data['@graph'].forEach(g => { if (g['@type']) schemaTypes.push(g['@type']); });
            } catch(e) {}
        });
        signals.schemaTypes = schemaTypes;
        signals.localBusiness = schemaTypes.some(t => typeof t === 'string' && (t.includes('LocalBusiness') || t.includes('Organization') || t.includes('Service')));

        // Content depth
        const bodyText = $('body').text();
        const wordCount = bodyText.split(/\s+/).filter(w => w.length > 2).length;
        signals.contentDepth = wordCount;

        // Social profiles linked
        const socialDomains = ['facebook.com', 'linkedin.com', 'twitter.com', 'x.com', 'instagram.com', 'youtube.com', 'tiktok.com'];
        $('a[href]').each((i, el) => {
            const href = $(el).attr('href') || '';
            socialDomains.forEach(sd => {
                if (href.includes(sd) && !signals.socialProfiles.includes(sd)) {
                    signals.socialProfiles.push(sd);
                }
            });
        });

        // About page check
        try {
            const aboutRes = await fetch(`https://${domain}/about`, { timeout: 5000 });
            if (aboutRes.ok) {
                const aboutHtml = await aboutRes.text();
                const about$ = cheerio.load(aboutHtml);
                const aboutWords = about$('body').text().split(/\s+/).filter(w => w.length > 2).length;
                signals.hasAboutPage = true;
                signals.aboutPageDepth = aboutWords;
            } else {
                signals.hasAboutPage = false;
            }
        } catch(e) { signals.hasAboutPage = false; }

    } catch(e) {
        console.log('AI Discovery: Could not fetch site:', e.message);
    }

    // 2. Check Google for brand mentions/citations
    try {
        const brandSearch = await fetch(`https://www.google.com/search?q="${encodeURIComponent(name)}"+-site:${domain}&num=20`, {
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOBot/1.0)' }
        });
        const searchHtml = await brandSearch.text();
        // Count approximate result snippets containing the name
        const nameRegex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const mentions = (searchHtml.match(nameRegex) || []).length;
        signals.brandMentions = mentions;
        signals.citations = Math.min(mentions, 20);
    } catch(e) {
        signals.brandMentions = 0;
    }

    // 3. Check Wikipedia/Wikidata
    try {
        const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json`, { timeout: 5000 });
        const wikiData = await wikiRes.json();
        signals.wikipedia = wikiData.query?.search?.some(r => r.title.toLowerCase().includes(name.toLowerCase())) || false;
    } catch(e) {
        signals.wikipedia = false;
    }

    // Calculate AI visibility scores per platform based on signals
    const baseScore = (
        (signals.schema ? 15 : 0) +
        (signals.localBusiness ? 10 : 0) +
        (signals.wikipedia ? 20 : 0) +
        (signals.socialProfiles.length >= 3 ? 10 : signals.socialProfiles.length >= 1 ? 5 : 0) +
        (signals.citations >= 10 ? 15 : signals.citations >= 5 ? 10 : signals.citations >= 1 ? 5 : 0) +
        (signals.contentDepth >= 1000 ? 10 : signals.contentDepth >= 500 ? 5 : 0) +
        (signals.hasAboutPage ? 10 : 0) +
        (signals.brandMentions >= 10 ? 10 : signals.brandMentions >= 3 ? 5 : 0)
    );

    const platforms = [
        { name: 'ChatGPT (OpenAI)', score: Math.min(100, baseScore + (signals.wikipedia ? 10 : 0)), color: '#10a37f' },
        { name: 'Google Gemini', score: Math.min(100, baseScore + (signals.schema ? 10 : 0) + (signals.localBusiness ? 5 : 0)), color: '#4285f4' },
        { name: 'Claude (Anthropic)', score: Math.min(100, baseScore + (signals.contentDepth >= 1000 ? 10 : 0)), color: '#764ba2' },
        { name: 'Perplexity AI', score: Math.min(100, baseScore + (signals.citations >= 5 ? 10 : 0)), color: '#1a1a2e' },
        { name: 'Microsoft Copilot', score: Math.min(100, baseScore + (signals.socialProfiles.includes('linkedin.com') ? 10 : 0)), color: '#00bcf2' },
        { name: 'Google SGE', score: Math.min(100, baseScore + (signals.schema ? 10 : 0) + (signals.localBusiness ? 10 : 0)), color: '#ea4335' }
    ];

    const avgScore = Math.round(platforms.reduce((s, p) => s + p.score, 0) / platforms.length);

    // Generate queries relevant to the business
    const queries = [
        `Best ${industry || 'services'} companies in ${location}`,
        `${name} reviews`,
        `Top rated ${industry || 'services'} near ${location}`,
        `What is ${domain}?`,
        `${industry || 'services'} ${location} recommendations`,
        `Compare ${industry || 'services'} providers in ${location}`
    ];

    res.json({
        success: true,
        domain,
        businessName: name,
        overallScore: avgScore,
        platforms,
        signals,
        queries,
        recommendations: [
            !signals.schema ? { rec: 'Add structured data (JSON-LD) to your website', impact: 'High', status: 'Missing' } : { rec: 'Structured data detected', impact: 'High', status: 'Done' },
            !signals.localBusiness ? { rec: 'Add LocalBusiness or Organization schema', impact: 'High', status: 'Missing' } : { rec: 'Business schema detected', impact: 'High', status: 'Done' },
            !signals.hasAboutPage ? { rec: 'Create a detailed About page with entity-rich content', impact: 'High', status: 'Missing' } : { rec: 'About page exists', impact: 'High', status: 'Done' },
            !signals.wikipedia ? { rec: 'Build Wikipedia/Wikidata presence for entity recognition', impact: 'High', status: 'Missing' } : null,
            signals.socialProfiles.length < 3 ? { rec: `Add more social profiles (currently ${signals.socialProfiles.length})`, impact: 'Medium', status: 'Partial' } : { rec: 'Good social profile coverage', impact: 'Medium', status: 'Done' },
            signals.citations < 5 ? { rec: 'Get mentioned in industry publications and directories', impact: 'High', status: 'Missing' } : { rec: `${signals.citations} brand citations found`, impact: 'High', status: 'Done' },
            signals.contentDepth < 500 ? { rec: 'Add more detailed content to homepage (currently thin)', impact: 'Medium', status: 'Missing' } : null,
            { rec: 'Publish authoritative, FAQ-style content that AI models reference', impact: 'Medium', status: 'Todo' },
            { rec: 'Optimize for conversational/question-based queries', impact: 'Medium', status: 'Todo' }
        ].filter(Boolean)
    });
});

// ============================================================
// AUTOMATED DAILY SEO SCANNING & ALERTS
// ============================================================

// Daily cron scan - runs all SEO checks and stores results in Supabase
app.get('/api/cron/daily-scan', async (req, res) => {
    try {
        // Verify cron secret if configured (Vercel sends this automatically)
        if (process.env.CRON_SECRET) {
            const cronSecret = req.headers['authorization'];
            if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
        }

        if (!supabase) {
            return res.status(500).json({ error: 'Supabase not configured' });
        }

        console.log('🔄 Daily SEO scan starting...');
        const domain = process.env.CLIENT_DOMAIN || 'spearity.com';
        const siteUrl = `https://www.${domain}`;
        const gscSite = process.env.GSC_SITE || `sc-domain:${domain}`;
        const scanDate = new Date().toISOString().split('T')[0];

        // Run all scans in parallel
        const [auditResult, healthResult, gscResult, aiResult] = await Promise.allSettled([
            // Audit scan
            (async () => {
                const issues = [];
                const passed = [];
                try {
                    const robotsRes = await fetch(`${siteUrl}/robots.txt`, { timeout: 5000 });
                    if (robotsRes.ok) { passed.push('robots.txt'); } else issues.push('robots.txt not found');
                } catch (e) { issues.push('robots.txt inaccessible'); }
                try {
                    const sitemapRes = await fetch(`${siteUrl}/sitemap.xml`, { timeout: 5000 });
                    if (sitemapRes.ok) passed.push('sitemap.xml'); else issues.push('sitemap.xml not found');
                } catch (e) { issues.push('sitemap inaccessible'); }
                if (siteUrl.startsWith('https://')) passed.push('HTTPS'); else issues.push('No HTTPS');
                try {
                    const homeRes = await fetch(siteUrl, { timeout: 10000 });
                    const html = await homeRes.text();
                    const $ = cheerio.load(html);
                    if ($('title').length && $('title').text().trim()) passed.push('title'); else issues.push('Missing title');
                    if ($('meta[name="description"]').length) passed.push('meta-desc'); else issues.push('Missing meta description');
                } catch (e) { issues.push('Homepage inaccessible'); }
                const score = Math.max(0, Math.min(100, 50 + (passed.length * 10) - (issues.length * 15)));
                return { score, issues: issues.length, passed: passed.length, details: { issues, passed } };
            })(),
            // Health check (uses same logic as /api/seo-agents/health)
            (async () => {
                let score = 50;
                const checks = { robots: false, sitemap: false, https: false, title: false, meta: false };
                if (siteUrl.startsWith('https://')) { score += 10; checks.https = true; }
                try { const r = await fetch(`${siteUrl}/robots.txt`, { timeout: 5000 }); if (r.ok) { score += 10; checks.robots = true; } } catch (e) {}
                try { const r = await fetch(`${siteUrl}/sitemap.xml`, { timeout: 5000 }); if (r.ok) { score += 10; checks.sitemap = true; } } catch (e) {}
                try {
                    const r = await fetch(siteUrl, { timeout: 10000 }); const html = await r.text(); const $ = cheerio.load(html);
                    if ($('title').length && $('title').text().trim()) { score += 10; checks.title = true; }
                    if ($('meta[name="description"]').length) { score += 10; checks.meta = true; }
                } catch (e) {}
                return { score: Math.min(score, 100), checks };
            })(),
            // GSC summary
            (async () => {
                try {
                    await ensureValidToken();
                    const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });
                    const response = await searchconsole.searchanalytics.query({
                        siteUrl: getGSCSiteUrl(gscSite),
                        requestBody: { startDate: getDateDaysAgo(30), endDate: getDateDaysAgo(0), dimensions: ['query'], rowLimit: 25000 }
                    });
                    const rows = response.data.rows || [];
                    const totalClicks = rows.reduce((sum, r) => sum + (r.clicks || 0), 0);
                    const totalImpressions = rows.reduce((sum, r) => sum + (r.impressions || 0), 0);
                    const avgPosition = rows.length > 0 ? rows.reduce((sum, r) => sum + (r.position || 0), 0) / rows.length : 0;
                    const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100) : 0;
                    const top10Count = rows.filter(r => r.position && r.position <= 10).length;
                    return { clicks: totalClicks, impressions: totalImpressions, position: parseFloat(avgPosition.toFixed(1)), ctr: parseFloat(avgCTR.toFixed(2)), keywords: rows.length, top10: top10Count };
                } catch (e) {
                    return { clicks: null, error: e.message };
                }
            })(),
            // AI discovery (lightweight - check schema signals only to avoid API costs)
            (async () => {
                try {
                    const siteRes = await fetch(siteUrl, { timeout: 10000 });
                    const html = await siteRes.text();
                    const $ = cheerio.load(html);
                    const hasSchema = $('script[type="application/ld+json"]').length > 0;
                    const hasTitle = $('title').length > 0;
                    const hasMeta = $('meta[name="description"]').length > 0;
                    const hasOG = $('meta[property="og:title"]').length > 0;
                    const signals = [hasSchema, hasTitle, hasMeta, hasOG].filter(Boolean).length;
                    return { score: signals * 25 };
                } catch (e) {
                    return { score: null, error: e.message };
                }
            })()
        ]);

        const audit = auditResult.status === 'fulfilled' ? auditResult.value : { score: null };
        const health = healthResult.status === 'fulfilled' ? healthResult.value : { score: null };
        const gsc = gscResult.status === 'fulfilled' ? gscResult.value : {};
        const ai = aiResult.status === 'fulfilled' ? aiResult.value : { score: null };

        // Store scan result
        const scanRow = {
            scan_date: scanDate,
            domain,
            audit_score: audit.score,
            health_score: health.score,
            ai_score: ai.score,
            local_score: null,
            gsc_clicks: gsc.clicks || null,
            gsc_impressions: gsc.impressions || null,
            gsc_position: gsc.position || null,
            gsc_ctr: gsc.ctr || null,
            keywords_tracked: gsc.keywords || null,
            top10_count: gsc.top10 || null,
            raw_data: { audit, health, gsc, ai }
        };

        const { error: insertError } = await supabase
            .from('scan_history')
            .upsert(scanRow, { onConflict: 'scan_date' });

        if (insertError) console.error('Failed to store scan:', insertError.message);

        // Compare with previous scan for alert detection
        const { data: prevScans } = await supabase
            .from('scan_history')
            .select('*')
            .lt('scan_date', scanDate)
            .order('scan_date', { ascending: false })
            .limit(1);

        const alerts = [];
        const prev = prevScans?.[0];

        if (prev) {
            if (audit.score !== null && prev.audit_score !== null && prev.audit_score - audit.score > 10)
                alerts.push({ type: 'critical', title: 'Audit Score Drop', description: `Audit score dropped from ${prev.audit_score} to ${audit.score} (-${prev.audit_score - audit.score} points)`, category: 'audit' });
            if (health.score !== null && prev.health_score !== null && prev.health_score - health.score > 10)
                alerts.push({ type: 'critical', title: 'Health Score Drop', description: `Health score dropped from ${prev.health_score} to ${health.score}`, category: 'health' });
            if (ai.score !== null && prev.ai_score !== null && prev.ai_score - ai.score > 15)
                alerts.push({ type: 'warning', title: 'AI Visibility Drop', description: `AI visibility dropped from ${prev.ai_score}% to ${ai.score}%`, category: 'ai' });
            if (gsc.clicks !== null && prev.gsc_clicks !== null && prev.gsc_clicks > 0) {
                const dropPct = ((prev.gsc_clicks - gsc.clicks) / prev.gsc_clicks) * 100;
                if (dropPct > 30)
                    alerts.push({ type: 'warning', title: 'Traffic Drop', description: `GSC clicks dropped ${Math.round(dropPct)}% (${prev.gsc_clicks} → ${gsc.clicks})`, category: 'traffic' });
            }
            if (audit.score !== null && prev.audit_score !== null && audit.score - prev.audit_score > 10)
                alerts.push({ type: 'success', title: 'Audit Score Improved', description: `Audit score improved from ${prev.audit_score} to ${audit.score} (+${audit.score - prev.audit_score})`, category: 'audit' });
            if (health.score !== null && prev.health_score !== null && health.score - prev.health_score > 10)
                alerts.push({ type: 'success', title: 'Health Score Improved', description: `Health score improved from ${prev.health_score} to ${health.score}`, category: 'health' });
        } else {
            alerts.push({ type: 'info', title: 'First Scan Recorded', description: 'Baseline scan stored. Future scans will detect changes.', category: 'system' });
        }

        // Store alerts
        if (alerts.length > 0) {
            const alertRows = alerts.map(a => ({
                alert_date: scanDate, domain, type: a.type, title: a.title,
                description: a.description, category: a.category, data: { scan: scanRow }
            }));
            const { error: alertError } = await supabase.from('scan_alerts').insert(alertRows);
            if (alertError) console.error('Failed to store alerts:', alertError.message);
        }

        console.log(`✅ Daily scan complete: audit=${audit.score}, health=${health.score}, ai=${ai.score}, alerts=${alerts.length}`);

        res.json({
            success: true, scan_date: scanDate,
            scores: { audit: audit.score, health: health.score, ai: ai.score },
            gsc: { clicks: gsc.clicks, impressions: gsc.impressions, position: gsc.position, ctr: gsc.ctr },
            alerts_generated: alerts.length, alerts
        });
    } catch (error) {
        console.error('Daily scan error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get scan history for trend charts
app.get('/api/scan-history', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
        const days = parseInt(req.query.days) || 30;
        const since = getDateDaysAgo(days);

        const { data, error } = await supabase
            .from('scan_history')
            .select('scan_date, audit_score, health_score, ai_score, local_score, gsc_clicks, gsc_impressions, gsc_position, gsc_ctr, keywords_tracked, top10_count')
            .gte('scan_date', since)
            .order('scan_date', { ascending: true });

        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get stored alerts
app.get('/api/scan-alerts', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
        const days = parseInt(req.query.days) || 30;
        const since = getDateDaysAgo(days);

        const { data, error } = await supabase
            .from('scan_alerts')
            .select('*')
            .gte('alert_date', since)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// COMPETITOR INTELLIGENCE API
// ============================================================

// --- Competitor CRUD ---

app.get('/api/competitors', async (req, res) => {
    try {
        if (supabase) {
            const { data, error } = await supabase.from('competitors').select('*').order('added_at', { ascending: true });
            if (error) throw error;
            res.json({ success: true, competitors: data || [] });
        } else {
            res.json({ success: true, competitors: competitorsList });
        }
    } catch (error) {
        res.json({ success: true, competitors: competitorsList });
    }
});

app.post('/api/competitors', async (req, res) => {
    try {
        const { domain, name, type, notes } = req.body;
        if (!domain) return res.status(400).json({ success: false, error: 'Domain required' });

        const normalized = normalizeDomain(domain);
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized)) {
            return res.status(400).json({ success: false, error: 'Invalid domain format' });
        }

        const competitor = {
            domain: normalized,
            name: name || normalized,
            type: type || 'general',
            notes: notes || '',
            added_at: new Date().toISOString(),
            last_crawl: null
        };

        if (supabase) {
            const { error } = await supabase.from('competitors').upsert(competitor, { onConflict: 'domain' });
            if (error) console.error('Supabase upsert error:', error.message);
        }

        const idx = competitorsList.findIndex(c => c.domain === normalized);
        if (idx >= 0) competitorsList[idx] = competitor;
        else competitorsList.push(competitor);

        res.json({ success: true, competitor });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/competitors/:domain', async (req, res) => {
    try {
        const domain = normalizeDomain(req.params.domain);

        if (supabase) {
            await supabase.from('competitors').delete().eq('domain', domain);
        }

        competitorsList = competitorsList.filter(c => c.domain !== domain);
        crawlCache.delete(domain);
        speedCache.delete(domain);
        sitemapCache.delete(domain);

        res.json({ success: true, removed: domain });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Competitor Crawl Analysis ---

app.get('/api/competitors/analyze', async (req, res) => {
    const domain = req.query.domain;
    if (!domain) return res.status(400).json({ success: false, error: 'domain query param required' });

    const normalized = normalizeDomain(domain);
    const cached = getCached(crawlCache, normalized, CRAWL_CACHE_TTL);
    if (cached) return res.json({ success: true, analysis: cached, cached: true });

    try {
        const url = `https://${normalized}`;
        const response = await fetch(url, {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAnalyzer/1.0)' }
        });
        const html = await response.text();
        const $ = cheerio.load(html);

        // On-page SEO signals
        const title = $('title').text().trim();
        const metaDesc = $('meta[name="description"]').attr('content') || '';
        const h1s = [];
        $('h1').each((_, el) => h1s.push($(el).text().trim()));

        const headingCounts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
        for (const tag of ['h1','h2','h3','h4','h5','h6']) {
            headingCounts[tag] = $(tag).length;
        }

        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
        const wordCount = bodyText.split(/\s+/).filter(w => w.length > 0).length;

        const totalImages = $('img').length;
        const imagesWithAlt = $('img[alt]').filter((_, el) => $(el).attr('alt').trim().length > 0).length;

        // Links
        const allLinks = $('a[href]');
        let internalLinks = 0, externalLinks = 0;
        allLinks.each((_, el) => {
            const href = $(el).attr('href') || '';
            if (href.startsWith('/') || href.includes(normalized)) internalLinks++;
            else if (href.startsWith('http')) externalLinks++;
        });

        // Schema markup
        const schemaTypes = [];
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const json = JSON.parse($(el).html());
                const types = Array.isArray(json) ? json.map(j => j['@type']) : [json['@type']];
                types.filter(Boolean).forEach(t => { if (!schemaTypes.includes(t)) schemaTypes.push(t); });
            } catch {}
        });

        const canonical = $('link[rel="canonical"]').attr('href') || '';
        const ogTitle = $('meta[property="og:title"]').attr('content') || '';
        const ogDesc = $('meta[property="og:description"]').attr('content') || '';
        const ogImage = $('meta[property="og:image"]').attr('content') || '';

        // Technology detection
        let cms = 'Unknown';
        if (html.includes('wp-content') || html.includes('wp-includes')) cms = 'WordPress';
        else if (html.includes('Squarespace')) cms = 'Squarespace';
        else if (html.includes('wix.com')) cms = 'Wix';
        else if (html.includes('Shopify')) cms = 'Shopify';
        else if (html.includes('weebly.com')) cms = 'Weebly';

        const analytics = [];
        if (html.includes('google-analytics.com') || html.includes('gtag')) analytics.push('Google Analytics');
        if (html.includes('fbq(') || html.includes('facebook.com/tr')) analytics.push('Facebook Pixel');
        if (html.includes('hotjar.com')) analytics.push('Hotjar');
        if (html.includes('segment.com') || html.includes('analytics.js')) analytics.push('Segment');

        const hasLocalBusiness = schemaTypes.some(t => t && t.toLowerCase().includes('localbusiness')) || html.toLowerCase().includes('localbusiness');

        // Service page detection (scan internal links)
        const servicePatterns = [
            'potholing', 'daylighting', 'slot-trenching', 'slot trenching', 'hydrovac', 'hydro-excavation',
            'vacuum-excavation', 'vacuum excavation', 'remote-excavation', 'sue-level', 'sue level',
            'utility-locating', 'non-destructive', 'excavation-services', 'trenching',
            'emergency', '24-7', 'fiber-optic', 'fiber optic', 'underground'
        ];

        const servicePages = [];
        const internalUrls = new Set();
        allLinks.each((_, el) => {
            const href = $(el).attr('href') || '';
            if (href.startsWith('/') || href.includes(normalized)) {
                internalUrls.add(href);
                const lower = href.toLowerCase();
                for (const pattern of servicePatterns) {
                    if (lower.includes(pattern)) {
                        servicePages.push({ url: href, matchedService: pattern, title: $(el).text().trim() });
                        break;
                    }
                }
            }
        });

        const analysis = {
            domain: normalized,
            crawledAt: new Date().toISOString(),
            homepage: {
                title, titleLength: title.length,
                metaDescription: metaDesc, metaDescLength: metaDesc.length,
                h1s, h1Count: headingCounts.h1,
                headingCounts,
                totalHeadings: Object.values(headingCounts).reduce((a, b) => a + b, 0),
                wordCount,
                imageCount: totalImages, imagesWithAlt,
                imageAltCoverage: totalImages > 0 ? Math.round((imagesWithAlt / totalImages) * 100) : 0,
                internalLinks, externalLinks,
                canonical, ogTitle, ogDescription: ogDesc, ogImage,
                schemaTypes, hasLocalBusiness
            },
            technology: { cms, analytics },
            servicePages,
            totalInternalUrls: internalUrls.size
        };

        crawlCache.set(normalized, { data: analysis, timestamp: Date.now() });

        // Update Supabase
        if (supabase) {
            await supabase.from('competitors').update({ last_crawl: new Date().toISOString(), crawl_data: analysis }).eq('domain', normalized).catch(() => {});
        }

        res.json({ success: true, analysis });
    } catch (error) {
        res.json({ success: false, error: `Could not crawl ${normalized}: ${error.message}`, analysis: { domain: normalized, blocked: true } });
    }
});

// --- PageSpeed Comparison ---

app.get('/api/competitors/speed-compare', async (req, res) => {
    try {
        const clientDomain = process.env.CLIENT_DOMAIN || 'example.com';
        const comps = supabase
            ? (await supabase.from('competitors').select('domain').then(r => r.data || [])).map(c => c.domain)
            : competitorsList.map(c => c.domain);

        const domains = [clientDomain, ...comps].slice(0, 5);
        const apiKey = process.env.PAGESPEED_API_KEY || '';

        const results = await Promise.allSettled(domains.map(async (domain) => {
            const cached = getCached(speedCache, domain, SPEED_CACHE_TTL);
            if (cached) return cached;

            const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://${domain}&strategy=mobile&category=performance${apiKey ? '&key=' + apiKey : ''}`;
            const resp = await fetch(apiUrl, { timeout: 30000 });
            const json = await resp.json();

            if (!json.lighthouseResult) throw new Error('No lighthouse data');

            const lh = json.lighthouseResult;
            const audits = lh.audits || {};
            const getMetric = (id) => {
                const a = audits[id];
                return a ? { value: a.numericValue, displayValue: a.displayValue || '', score: a.score } : null;
            };

            const result = {
                domain,
                fetchedAt: new Date().toISOString(),
                performanceScore: Math.round((lh.categories?.performance?.score || 0) * 100),
                vitals: {
                    LCP: getMetric('largest-contentful-paint'),
                    FCP: getMetric('first-contentful-paint'),
                    CLS: getMetric('cumulative-layout-shift'),
                    TBT: getMetric('total-blocking-time'),
                    SI: getMetric('speed-index'),
                    TTFB: getMetric('server-response-time')
                }
            };

            speedCache.set(domain, { data: result, timestamp: Date.now() });
            return result;
        }));

        const data = results.map((r, i) => {
            if (r.status === 'fulfilled') return r.value;
            return { domain: domains[i], error: r.reason?.message || 'Failed', performanceScore: 0, vitals: {} };
        });

        res.json({ success: true, results: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Content Gap Analysis ---

async function fetchSitemapUrls(domain) {
    const cached = getCached(sitemapCache, domain, SITEMAP_CACHE_TTL);
    if (cached) return cached;

    const urls = [];
    try {
        const sitemapUrl = `https://${domain}/sitemap.xml`;
        const resp = await fetch(sitemapUrl, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAnalyzer/1.0)' } });
        const xml = await resp.text();
        const $ = cheerio.load(xml, { xmlMode: true });

        // Check if it's a sitemap index
        const sitemapLocs = [];
        $('sitemap loc').each((_, el) => sitemapLocs.push($(el).text().trim()));

        if (sitemapLocs.length > 0) {
            // Follow up to 3 child sitemaps
            const children = sitemapLocs.slice(0, 3);
            for (const childUrl of children) {
                try {
                    const childResp = await fetch(childUrl, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAnalyzer/1.0)' } });
                    const childXml = await childResp.text();
                    const c$ = cheerio.load(childXml, { xmlMode: true });
                    c$('url loc').each((_, el) => urls.push(c$(el).text().trim()));
                } catch {}
            }
        } else {
            $('url loc').each((_, el) => urls.push($(el).text().trim()));
        }
    } catch {}

    sitemapCache.set(domain, { data: urls, timestamp: Date.now() });
    return urls;
}

app.get('/api/competitors/content-gap', async (req, res) => {
    const domain = req.query.domain;
    if (!domain) return res.status(400).json({ success: false, error: 'domain required' });

    const normalized = normalizeDomain(domain);
    const clientDomain = process.env.CLIENT_DOMAIN || 'example.com';

    try {
        const [yourUrls, theirUrls] = await Promise.all([
            fetchSitemapUrls(clientDomain),
            fetchSitemapUrls(normalized)
        ]);

        // Categorize by path segments
        const categorize = (urls) => {
            const cats = {};
            urls.forEach(u => {
                try {
                    const p = new URL(u).pathname.replace(/^\/|\/$/g, '').split('/')[0] || 'homepage';
                    cats[p] = (cats[p] || 0) + 1;
                } catch {}
            });
            return cats;
        };

        const yourCats = categorize(yourUrls);
        const theirCats = categorize(theirUrls);

        // Categories competitor has but you don't
        const competitorOnly = Object.keys(theirCats).filter(c => !yourCats[c]).map(c => ({ category: c, pages: theirCats[c] }));

        // Service coverage detection
        const serviceKeywords = [
            { name: 'Potholing / Daylighting', patterns: ['potholing', 'daylighting', 'daylight', 'pothole'] },
            { name: 'Slot Trenching', patterns: ['slot-trenching', 'slot_trenching', 'slottrenching', 'trenching'] },
            { name: 'Hydro Excavation', patterns: ['hydrovac', 'hydro-excavation', 'hydroexcavation', 'hydro_excavation', 'vacuum-excavation'] },
            { name: 'Remote Excavation', patterns: ['remote-excavation', 'remote_excavation', 'remote-hose'] },
            { name: 'SUE Level A', patterns: ['sue-level', 'sue_level', 'subsurface-utility', 'utility-verification'] },
            { name: 'Emergency Services', patterns: ['emergency', '24-7', '24-hour', 'urgent'] },
            { name: 'Fiber Optic', patterns: ['fiber-optic', 'fiber_optic', 'fiberoptic', 'fibre'] },
            { name: 'Utility Locating', patterns: ['utility-locat', 'locate', 'underground-utility'] },
            { name: 'Non-Destructive Digging', patterns: ['non-destructive', 'nondestructive', 'safe-digging'] }
        ];

        const checkCoverage = (urls) => {
            const coverage = {};
            serviceKeywords.forEach(svc => {
                const matchedUrls = urls.filter(u => svc.patterns.some(p => u.toLowerCase().includes(p)));
                coverage[svc.name] = { covered: matchedUrls.length > 0, urls: matchedUrls, count: matchedUrls.length };
            });
            return coverage;
        };

        const yourCoverage = checkCoverage(yourUrls);
        const theirCoverage = checkCoverage(theirUrls);

        // Build gap matrix
        const gapMatrix = serviceKeywords.map(svc => ({
            service: svc.name,
            you: yourCoverage[svc.name].covered,
            competitor: theirCoverage[svc.name].covered,
            gap: !yourCoverage[svc.name].covered && theirCoverage[svc.name].covered,
            yourPages: yourCoverage[svc.name].count,
            theirPages: theirCoverage[svc.name].count
        }));

        res.json({
            success: true,
            gap: {
                yourTotalPages: yourUrls.length,
                theirTotalPages: theirUrls.length,
                yourCategories: yourCats,
                theirCategories: theirCats,
                competitorOnly,
                gapMatrix,
                yourCoverage,
                theirCoverage
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Keyword Battles with Revenue Intent ---

app.get('/api/competitors/keyword-battles', async (req, res) => {
    try {
        await ensureValidToken();
        const site = req.query.site || process.env.GSC_SITE || '';
        const siteUrl = getGSCSiteUrl(site);

        const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 28);

        const response = await searchconsole.searchanalytics.query({
            siteUrl,
            requestBody: {
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                dimensions: ['query'],
                rowLimit: 500
            }
        });

        const rows = response.data.rows || [];

        // Revenue Intent classification (4 tiers: emergency > money > contract > trust)
        const emergencyPatterns = ['emergency', 'urgent', '24/7', '24 hour', '24-hour', 'same day', 'same-day', 'asap', 'immediate'];
        const tier1Patterns = ['near me', 'services', 'company', 'companies', 'hire', 'cost', 'price', 'pricing', 'quote', 'rental', 'contractor'];
        const tier2Patterns = ['fiber optic', 'gas line', 'non-destructive', 'sue level', 'slot trench', 'potholing', 'daylighting', 'commercial', 'municipal', 'industrial', 'construction', 'utility'];
        const tier3Patterns = [' vs ', 'how to', 'how does', 'what is', 'safe', 'benefits', 'advantage', 'guide', 'difference', 'comparison', 'explained'];
        const cityPatterns = (process.env.CLIENT_LOCATION || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

        // SERP feature inference patterns
        const mapPackTriggers = ['near me', 'near', 'local', ...cityPatterns];
        const localServiceAdTriggers = ['services', 'contractor', 'company', 'hire', 'repair'];

        const expectedCTR = [0.28, 0.15, 0.11, 0.08, 0.06, 0.05, 0.04, 0.03, 0.025, 0.02];

        const keywords = rows.map(row => {
            const keyword = row.keys[0];
            const kw = keyword.toLowerCase();
            const position = Math.round(row.position * 10) / 10;
            const clicks = row.clicks;
            const impressions = row.impressions;
            const ctr = row.ctr;
            const wordCount = kw.split(/\s+/).length;

            // Classify tier (emergency is highest)
            let tier = 'unclassified';
            let intentScore = 1;

            if (emergencyPatterns.some(p => kw.includes(p))) {
                tier = 'emergency'; intentScore = 15;
            } else if (tier1Patterns.some(p => kw.includes(p)) || cityPatterns.some(p => p && kw.includes(p))) {
                tier = 'money'; intentScore = 10;
            } else if (tier2Patterns.some(p => kw.includes(p))) {
                tier = 'contract'; intentScore = 5;
            } else if (tier3Patterns.some(p => kw.includes(p))) {
                tier = 'trust'; intentScore = 2;
            }

            // SERP Feature inference
            const serpFeatures = [];
            if (mapPackTriggers.some(p => p && kw.includes(p))) serpFeatures.push('Map Pack');
            if (localServiceAdTriggers.some(p => kw.includes(p)) && cityPatterns.some(p => p && kw.includes(p))) serpFeatures.push('Local Ads');
            if (tier3Patterns.some(p => kw.includes(p))) serpFeatures.push('Featured Snippet');
            if (serpFeatures.length === 0 && (tier === 'money' || tier === 'emergency')) serpFeatures.push('Organic');

            // Win-ability score (0-100): how easy is this keyword to win?
            let winability = 50;
            if (position <= 10) winability += 25;        // Already on page 1
            else if (position <= 20) winability += 10;   // Page 2, within reach
            else winability -= 15;                        // Deep = harder
            if (wordCount >= 4) winability += 15;         // Long-tail = less competition
            else if (wordCount <= 2) winability -= 10;    // Head term = more competition
            if (cityPatterns.some(p => p && kw.includes(p))) winability += 15; // Local = less national competition
            if (impressions > 0 && impressions < 100) winability += 5;  // Low volume = less competition
            if (impressions >= 500) winability -= 10;     // High volume = more competition
            winability = Math.max(0, Math.min(100, winability));

            // Vibe tags
            const vibeTags = [];
            if (position > 10 && position <= 25 && winability >= 60) vibeTags.push('Target This');
            if (wordCount <= 2 && position > 30 && impressions < 20) vibeTags.push('Ignore');
            if (serpFeatures.includes('Map Pack')) vibeTags.push('Local Priority');
            if (position >= 4 && position <= 10 && tier !== 'trust') vibeTags.push('Almost There');
            if (tier === 'emergency') vibeTags.push('Urgent Revenue');

            // Revenue Priority score
            const priority = (intentScore * impressions) - (position * 10);

            // Estimated traffic loss
            const posIndex = Math.min(Math.max(Math.round(position) - 1, 0), 9);
            const expectedRate = position <= 10 ? expectedCTR[posIndex] : 0.01;
            const trafficLoss = Math.round(impressions * Math.max(0, expectedRate - ctr));

            return { keyword, position, clicks, impressions, ctr, tier, intentScore, priority, trafficLoss, serpFeatures, winability, vibeTags };
        });

        // Split into groups
        const almostWinning = keywords.filter(k => k.position >= 4 && k.position <= 10).sort((a, b) => b.priority - a.priority);
        const bigOpportunity = keywords.filter(k => k.position > 10 && k.position <= 20).sort((a, b) => b.priority - a.priority);
        const contentGap = keywords.filter(k => k.impressions >= 50 && k.clicks === 0).sort((a, b) => b.impressions - a.impressions);

        // Tier summaries
        const tiers = {
            emergency: keywords.filter(k => k.tier === 'emergency'),
            money: keywords.filter(k => k.tier === 'money'),
            contract: keywords.filter(k => k.tier === 'contract'),
            trust: keywords.filter(k => k.tier === 'trust'),
            unclassified: keywords.filter(k => k.tier === 'unclassified')
        };

        const tierSummary = {};
        for (const [name, kws] of Object.entries(tiers)) {
            tierSummary[name] = {
                count: kws.length,
                avgPosition: kws.length > 0 ? Math.round(kws.reduce((s, k) => s + k.position, 0) / kws.length * 10) / 10 : 0,
                totalTrafficLoss: kws.reduce((s, k) => s + k.trafficLoss, 0),
                topKeywords: kws.sort((a, b) => b.priority - a.priority).slice(0, 20)
            };
        }

        res.json({
            success: true,
            totalKeywords: keywords.length,
            almostWinning: almostWinning.slice(0, 30),
            bigOpportunity: bigOpportunity.slice(0, 30),
            contentGap: contentGap.slice(0, 20),
            tierSummary
        });
    } catch (error) {
        res.json({ success: false, error: error.message, almostWinning: [], bigOpportunity: [], contentGap: [], tierSummary: {} });
    }
});

// --- Local Presence Comparison ---

app.get('/api/competitors/local-compare', async (req, res) => {
    try {
        const clientDomain = process.env.CLIENT_DOMAIN || 'example.com';
        const clientName = process.env.CLIENT_NAME || 'Business';
        const location = process.env.CLIENT_LOCATION || '';

        const comps = supabase
            ? (await supabase.from('competitors').select('domain, name').then(r => r.data || []))
            : competitorsList;

        const allDomains = [{ domain: clientDomain, name: clientName }, ...comps];

        const scanDomain = async (d) => {
            const results = [];
            const directories = ['Google Business', 'Yelp', 'BBB', 'Yellow Pages', 'LinkedIn', 'Facebook'];

            for (const dir of directories) {
                try {
                    const dirDomainMap = {
                        'Google Business': 'google.com', 'Yelp': 'yelp.com', 'BBB': 'bbb.org',
                        'Yellow Pages': 'yellowpages.com', 'LinkedIn': 'linkedin.com', 'Facebook': 'facebook.com'
                    };
                    const searchQuery = `site:${dirDomainMap[dir]} "${d.name}"`;
                    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=3`;
                    const resp = await fetch(googleUrl, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOBot/1.0)' } });
                    const html = await resp.text();
                    const found = html.toLowerCase().includes(d.name.toLowerCase()) && html.toLowerCase().includes(dirDomainMap[dir]);
                    results.push({ directory: dir, listed: found });
                } catch {
                    results.push({ directory: dir, listed: false });
                }
            }

            // Website signals check
            let signals = { hasSchema: false, hasLocalBusiness: false, hasAddress: false, hasPhone: false };
            try {
                const siteResp = await fetch(`https://${d.domain}`, { timeout: 10000 });
                const html = await siteResp.text();
                const $ = cheerio.load(html);
                signals.hasSchema = $('script[type="application/ld+json"]').length > 0;
                signals.hasLocalBusiness = html.toLowerCase().includes('localbusiness');
                signals.hasAddress = $('[itemprop="address"]').length > 0 || (location && html.toLowerCase().includes(location.toLowerCase()));
                signals.hasPhone = $('a[href^="tel:"]').length > 0;
            } catch {}

            const listedCount = results.filter(r => r.listed).length;
            const localScore = Math.round((listedCount / results.length) * 60 + (Object.values(signals).filter(v => v).length / 4) * 40);

            return { domain: d.domain, name: d.name, directories: results, signals, localScore, listedCount, total: results.length };
        };

        const allResults = await Promise.allSettled(allDomains.map(d => scanDomain(d)));
        const data = allResults.map((r, i) => {
            if (r.status === 'fulfilled') return r.value;
            return { domain: allDomains[i].domain, name: allDomains[i].name, error: true, localScore: 0 };
        });

        res.json({ success: true, results: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
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
