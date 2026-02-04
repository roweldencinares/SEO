/**
 * Comprehensive Site Crawler (ES Module)
 * Performs deep SEO and performance audits like SEMrush
 *
 * Features:
 * - Crawls entire website
 * - Checks cache headers on JS/CSS
 * - Detects blocked resources in robots.txt
 * - Tests external links
 * - Analyzes text-HTML ratio
 * - Validates meta tags, titles, headings
 * - Finds orphaned pages
 * - Detects redirects
 * - Checks for llms.txt
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import robotsParser from 'robots-parser';

class SiteCrawler {
    constructor(baseUrl, options = {}) {
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        this.domain = new URL(baseUrl).hostname;

        // Configuration
        this.maxPages = options.maxPages || 100;
        this.maxDepth = options.maxDepth || 5;
        this.timeout = options.timeout || 10000;
        this.userAgent = options.userAgent || 'SiteCrawler/1.0 (SEO Audit Bot)';

        // State tracking
        this.visitedUrls = new Set();
        this.pendingUrls = [{ url: this.baseUrl, depth: 0 }];
        this.results = {
            pages: [],
            issues: {
                uncachedResources: [],
                blockedResources: [],
                brokenExternalLinks: [],
                lowTextHtmlRatio: [],
                missingMetaDescription: [],
                longTitles: [],
                lowWordCount: [],
                missingH1: [],
                orphanedPages: [],
                redirects: [],
                noAnchorText: [],
                contentOptimization: [],
                llmsTxtMissing: false
            },
            stats: {
                totalPages: 0,
                totalIssues: 0,
                crawlTime: 0
            }
        };

        this.robots = null;
        this.sitemap = [];
    }

    /**
     * Main crawl function
     */
    async crawl() {
        const startTime = Date.now();
        console.log(`🚀 Starting crawl of ${this.baseUrl}`);

        try {
            // Step 1: Parse robots.txt
            await this.parseRobotsTxt();

            // Step 2: Parse sitemap
            await this.parseSitemap();

            // Step 2.5: Fetch WordPress blog posts via API
            await this.fetchWordPressPosts();

            // Step 3: Crawl pages
            await this.crawlPages();

            // Step 4: Check for orphaned pages
            this.checkOrphanedPages();

            // Step 5: Check for llms.txt
            await this.checkLlmsTxt();

            // Step 6: Calculate stats
            this.results.stats.crawlTime = Date.now() - startTime;
            this.results.stats.totalPages = this.results.pages.length;
            this.results.stats.totalIssues = this.calculateTotalIssues();

            console.log(`✅ Crawl complete! Found ${this.results.stats.totalIssues} issues across ${this.results.stats.totalPages} pages`);

            return this.results;

        } catch (error) {
            console.error('❌ Crawl failed:', error);
            throw error;
        }
    }

    /**
     * Fetch WordPress blog posts via REST API
     */
    async fetchWordPressPosts() {
        try {
            console.log('🔍 Checking for WordPress blog posts...');

            // Check if WordPress API exists
            const checkUrl = `${this.baseUrl}/wp-json/wp/v2/posts?per_page=1`;
            const checkResponse = await axios.head(checkUrl, { timeout: 5000 });

            const totalPosts = parseInt(checkResponse.headers['x-wp-total'] || '0');

            if (totalPosts === 0) {
                console.log('ℹ️  No WordPress posts found');
                return;
            }

            console.log(`📰 Found ${totalPosts} WordPress blog posts!`);
            console.log('📥 Fetching blog post URLs...');

            // Fetch all post URLs (100 per page)
            const perPage = 100;
            const totalPages = Math.ceil(totalPosts / perPage);

            for (let page = 1; page <= totalPages; page++) {
                try {
                    const apiUrl = `${this.baseUrl}/wp-json/wp/v2/posts?per_page=${perPage}&page=${page}&_fields=link`;
                    const response = await axios.get(apiUrl, { timeout: 10000 });

                    response.data.forEach(post => {
                        if (post.link) {
                            this.sitemap.push(post.link);
                            // Add to crawl queue
                            this.pendingUrls.push({ url: post.link, depth: 1 });
                        }
                    });

                    console.log(`✅ Fetched page ${page}/${totalPages} (${response.data.length} posts)`);

                    // Small delay to avoid overwhelming the server
                    await this.sleep(200);

                } catch (error) {
                    console.log(`⚠️  Error fetching posts page ${page}:`, error.message);
                }
            }

            console.log(`✅ Added ${totalPosts} blog posts to crawl queue`);

        } catch (error) {
            console.log('ℹ️  Not a WordPress site or API unavailable');
        }
    }

    /**
     * Parse robots.txt
     */
    async parseRobotsTxt() {
        try {
            const robotsUrl = `${this.baseUrl}/robots.txt`;
            const response = await axios.get(robotsUrl, { timeout: this.timeout });
            this.robots = robotsParser(robotsUrl, response.data);
            console.log('✅ Parsed robots.txt');
        } catch (error) {
            console.log('⚠️  No robots.txt found or error parsing');
            this.robots = robotsParser(this.baseUrl, ''); // Empty robots
        }
    }

    /**
     * Parse sitemap.xml
     */
    async parseSitemap() {
        try {
            const sitemapUrl = `${this.baseUrl}/sitemap.xml`;
            const response = await axios.get(sitemapUrl, { timeout: this.timeout });
            const $ = cheerio.load(response.data, { xmlMode: true });

            $('url > loc').each((i, elem) => {
                this.sitemap.push($(elem).text());
            });

            console.log(`✅ Found ${this.sitemap.length} URLs in sitemap`);
        } catch (error) {
            console.log('⚠️  No sitemap.xml found or error parsing');
        }
    }

    /**
     * Crawl all pages
     */
    async crawlPages() {
        while (this.pendingUrls.length > 0 && this.visitedUrls.size < this.maxPages) {
            const { url, depth } = this.pendingUrls.shift();

            if (this.visitedUrls.has(url) || depth > this.maxDepth) {
                continue;
            }

            await this.crawlPage(url, depth);

            // Small delay to avoid overwhelming the server
            await this.sleep(100);
        }
    }

    /**
     * Crawl individual page
     */
    async crawlPage(url, depth) {
        try {
            console.log(`📄 Crawling [${this.visitedUrls.size + 1}/${this.maxPages}]: ${url}`);

            const startTime = Date.now();
            const response = await axios.get(url, {
                timeout: this.timeout,
                headers: { 'User-Agent': this.userAgent },
                maxRedirects: 0,
                validateStatus: (status) => status < 400 || status === 301 || status === 302
            });

            this.visitedUrls.add(url);
            const loadTime = Date.now() - startTime;

            // Check for redirects
            if (response.status === 301 || response.status === 302) {
                this.results.issues.redirects.push({
                    url,
                    status: response.status,
                    redirectTo: response.headers.location
                });
                return; // Don't process redirected pages
            }

            const html = response.data;
            const $ = cheerio.load(html);

            // Create page record
            const pageData = {
                url,
                depth,
                loadTime,
                statusCode: response.status,
                title: $('title').text(),
                metaDescription: $('meta[name="description"]').attr('content') || '',
                h1: $('h1').first().text(),
                h1Count: $('h1').length,
                wordCount: this.countWords($('body').text()),
                htmlSize: html.length,
                textSize: $('body').text().length,
                internalLinks: [],
                externalLinks: [],
                resources: []
            };

            // Calculate text-HTML ratio
            pageData.textHtmlRatio = (pageData.textSize / pageData.htmlSize) * 100;

            // Extract links
            $('a[href]').each((i, elem) => {
                const href = $(elem).attr('href');
                const anchorText = $(elem).text().trim();
                const absoluteUrl = this.resolveUrl(href, url);

                if (this.isInternalUrl(absoluteUrl)) {
                    pageData.internalLinks.push({ href: absoluteUrl, anchorText });

                    // Add to crawl queue if not visited
                    if (!this.visitedUrls.has(absoluteUrl) && depth < this.maxDepth) {
                        this.pendingUrls.push({ url: absoluteUrl, depth: depth + 1 });
                    }

                    // Check for empty anchor text
                    if (!anchorText && !$(elem).find('img').length) {
                        this.results.issues.noAnchorText.push({
                            page: url,
                            link: absoluteUrl
                        });
                    }
                } else if (absoluteUrl.startsWith('http')) {
                    pageData.externalLinks.push({ href: absoluteUrl, anchorText });
                }
            });

            // Check resources (JS, CSS, images)
            await this.checkPageResources(url, $, pageData);

            // Run issue checks
            this.checkPageIssues(pageData);

            // Store page data
            this.results.pages.push(pageData);

        } catch (error) {
            if (error.response && error.response.status >= 400) {
                console.log(`❌ Error ${error.response.status} on ${url}`);
            } else {
                console.log(`❌ Error crawling ${url}:`, error.message);
            }
        }
    }

    /**
     * Check page resources (JS, CSS, images)
     */
    async checkPageResources(pageUrl, $, pageData) {
        const resources = [];

        // Check CSS files
        $('link[rel="stylesheet"]').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) {
                resources.push({
                    type: 'css',
                    url: this.resolveUrl(href, pageUrl)
                });
            }
        });

        // Check JS files
        $('script[src]').each((i, elem) => {
            const src = $(elem).attr('src');
            if (src) {
                resources.push({
                    type: 'js',
                    url: this.resolveUrl(src, pageUrl)
                });
            }
        });

        // Check each resource for caching and robots.txt blocking
        for (const resource of resources) {
            try {
                // Check if blocked by robots.txt
                if (this.robots && !this.robots.isAllowed(resource.url, this.userAgent)) {
                    this.results.issues.blockedResources.push({
                        page: pageUrl,
                        resource: resource.url,
                        type: resource.type
                    });
                    continue; // Skip cache check if blocked
                }

                // Check cache headers (only for internal resources)
                if (this.isInternalUrl(resource.url)) {
                    const headResponse = await axios.head(resource.url, {
                        timeout: 5000,
                        validateStatus: () => true
                    }).catch(() => null);

                    if (headResponse) {
                        const cacheControl = headResponse.headers['cache-control'];
                        const expires = headResponse.headers['expires'];
                        const etag = headResponse.headers['etag'];

                        // Check if resource has proper caching
                        if (!cacheControl && !expires && !etag) {
                            this.results.issues.uncachedResources.push({
                                page: pageUrl,
                                resource: resource.url,
                                type: resource.type
                            });
                        }
                    }
                }

                pageData.resources.push(resource);

            } catch (error) {
                // Silently continue on resource check errors
            }
        }
    }

    /**
     * Check page for issues
     */
    checkPageIssues(pageData) {
        // Missing meta description
        if (!pageData.metaDescription || pageData.metaDescription.length === 0) {
            this.results.issues.missingMetaDescription.push({
                url: pageData.url,
                title: pageData.title
            });
        }

        // Title too long
        if (pageData.title.length > 60) {
            this.results.issues.longTitles.push({
                url: pageData.url,
                title: pageData.title,
                length: pageData.title.length
            });
        }

        // Low word count
        if (pageData.wordCount < 300) {
            this.results.issues.lowWordCount.push({
                url: pageData.url,
                wordCount: pageData.wordCount
            });
        }

        // Missing H1
        if (pageData.h1Count === 0) {
            this.results.issues.missingH1.push({
                url: pageData.url,
                title: pageData.title
            });
        }

        // Low text-HTML ratio
        if (pageData.textHtmlRatio < 10) {
            this.results.issues.lowTextHtmlRatio.push({
                url: pageData.url,
                ratio: pageData.textHtmlRatio.toFixed(2),
                htmlSize: pageData.htmlSize,
                textSize: pageData.textSize
            });
        }

        // Content optimization (basic check for thin content)
        if (pageData.wordCount < 500 && pageData.h1Count < 1) {
            this.results.issues.contentOptimization.push({
                url: pageData.url,
                reason: 'Thin content with no H1 heading',
                wordCount: pageData.wordCount
            });
        }
    }

    /**
     * Check external links
     */
    async checkExternalLinks() {
        console.log('🔗 Checking external links...');

        const externalLinks = new Set();

        // Collect all unique external links
        this.results.pages.forEach(page => {
            page.externalLinks.forEach(link => {
                externalLinks.add(link.href);
            });
        });

        // Check each external link (limit to avoid long runtime)
        const linksToCheck = Array.from(externalLinks).slice(0, 50);

        for (const link of linksToCheck) {
            try {
                await axios.head(link, {
                    timeout: 5000,
                    validateStatus: (status) => status < 400
                });
            } catch (error) {
                this.results.issues.brokenExternalLinks.push({
                    url: link,
                    error: error.response ? error.response.status : 'timeout'
                });
            }

            await this.sleep(50); // Small delay
        }
    }

    /**
     * Check for orphaned pages in sitemap
     */
    checkOrphanedPages() {
        if (this.sitemap.length === 0) return;

        // Get all discovered URLs
        const discoveredUrls = new Set(this.results.pages.map(p => p.url));

        // Find sitemap URLs that weren't discovered by crawling
        this.sitemap.forEach(sitemapUrl => {
            if (!discoveredUrls.has(sitemapUrl)) {
                this.results.issues.orphanedPages.push({
                    url: sitemapUrl,
                    reason: 'In sitemap but no internal links found'
                });
            }
        });

        console.log(`🔍 Found ${this.results.issues.orphanedPages.length} orphaned pages`);
    }

    /**
     * Check for llms.txt file
     */
    async checkLlmsTxt() {
        try {
            const llmsUrl = `${this.baseUrl}/llms.txt`;
            await axios.get(llmsUrl, { timeout: this.timeout });
            this.results.issues.llmsTxtMissing = false;
            console.log('✅ llms.txt found');
        } catch (error) {
            this.results.issues.llmsTxtMissing = true;
            console.log('⚠️  llms.txt not found (recommended for AI discovery)');
        }
    }

    /**
     * Calculate total issues
     */
    calculateTotalIssues() {
        let total = 0;
        const issues = this.results.issues;

        total += issues.uncachedResources.length;
        total += issues.blockedResources.length;
        total += issues.brokenExternalLinks.length;
        total += issues.lowTextHtmlRatio.length;
        total += issues.missingMetaDescription.length;
        total += issues.longTitles.length;
        total += issues.lowWordCount.length;
        total += issues.missingH1.length;
        total += issues.orphanedPages.length;
        total += issues.redirects.length;
        total += issues.noAnchorText.length;
        total += issues.contentOptimization.length;
        total += issues.llmsTxtMissing ? 1 : 0;

        return total;
    }

    /**
     * Helper: Count words in text
     */
    countWords(text) {
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    /**
     * Helper: Resolve relative URLs
     */
    resolveUrl(href, baseUrl) {
        try {
            return new URL(href, baseUrl).href;
        } catch {
            return href;
        }
    }

    /**
     * Helper: Check if URL is internal
     */
    isInternalUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname === this.domain;
        } catch {
            return false;
        }
    }

    /**
     * Helper: Sleep for ms
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate detailed report
     */
    generateReport() {
        const report = {
            summary: {
                url: this.baseUrl,
                crawlDate: new Date().toISOString(),
                totalPages: this.results.stats.totalPages,
                totalIssues: this.results.stats.totalIssues,
                crawlTime: `${(this.results.stats.crawlTime / 1000).toFixed(2)}s`
            },
            issues: {
                critical: [],
                warnings: [],
                notices: []
            },
            recommendations: []
        };

        // Categorize issues by severity
        const issues = this.results.issues;

        // CRITICAL ISSUES
        if (issues.brokenExternalLinks.length > 0) {
            report.issues.critical.push({
                type: 'Broken External Links',
                count: issues.brokenExternalLinks.length,
                impact: 'High',
                items: issues.brokenExternalLinks
            });
        }

        if (issues.missingH1.length > 0) {
            report.issues.critical.push({
                type: 'Missing H1 Headings',
                count: issues.missingH1.length,
                impact: 'High',
                items: issues.missingH1
            });
        }

        // WARNINGS
        if (issues.uncachedResources.length > 0) {
            report.issues.warnings.push({
                type: 'Uncached JavaScript/CSS Files',
                count: issues.uncachedResources.length,
                impact: 'Medium',
                items: issues.uncachedResources.slice(0, 10) // First 10
            });
        }

        if (issues.blockedResources.length > 0) {
            report.issues.warnings.push({
                type: 'Blocked Resources in robots.txt',
                count: issues.blockedResources.length,
                impact: 'Medium',
                items: issues.blockedResources
            });
        }

        if (issues.missingMetaDescription.length > 0) {
            report.issues.warnings.push({
                type: 'Missing Meta Descriptions',
                count: issues.missingMetaDescription.length,
                impact: 'Medium',
                items: issues.missingMetaDescription
            });
        }

        if (issues.longTitles.length > 0) {
            report.issues.warnings.push({
                type: 'Title Tags Too Long',
                count: issues.longTitles.length,
                impact: 'Low',
                items: issues.longTitles
            });
        }

        if (issues.lowWordCount.length > 0) {
            report.issues.warnings.push({
                type: 'Low Word Count',
                count: issues.lowWordCount.length,
                impact: 'Medium',
                items: issues.lowWordCount
            });
        }

        if (issues.lowTextHtmlRatio.length > 0) {
            report.issues.warnings.push({
                type: 'Low Text-HTML Ratio',
                count: issues.lowTextHtmlRatio.length,
                impact: 'Low',
                items: issues.lowTextHtmlRatio
            });
        }

        // NOTICES
        if (issues.orphanedPages.length > 0) {
            report.issues.notices.push({
                type: 'Orphaned Pages in Sitemap',
                count: issues.orphanedPages.length,
                impact: 'Low',
                items: issues.orphanedPages.slice(0, 10)
            });
        }

        if (issues.redirects.length > 0) {
            report.issues.notices.push({
                type: 'Permanent Redirects',
                count: issues.redirects.length,
                impact: 'Low',
                items: issues.redirects
            });
        }

        if (issues.noAnchorText.length > 0) {
            report.issues.notices.push({
                type: 'Links with No Anchor Text',
                count: issues.noAnchorText.length,
                impact: 'Low',
                items: issues.noAnchorText
            });
        }

        if (issues.llmsTxtMissing) {
            report.issues.notices.push({
                type: 'llms.txt Not Found',
                count: 1,
                impact: 'Low',
                items: [{ message: 'Consider adding llms.txt for AI discovery' }]
            });
        }

        return report;
    }
}

export default SiteCrawler;
