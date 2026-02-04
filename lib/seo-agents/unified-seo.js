/**
 * Unified SEO Intelligence Platform
 * Combines GSC + GA4 + WordPress for complete SEO picture
 *
 * This is the BRAIN of the SEO agent system.
 * It correlates data from multiple sources to provide actionable insights.
 *
 * NEXUS Integration: FULL mode (all 9 layers)
 */

import { GSCClient } from './gsc-client.js';
import { GA4Client } from './ga-client.js';
import fetch from 'node-fetch';

/**
 * Unified SEO Client
 * The single source of truth for all SEO data
 */
export class UnifiedSEO {
  constructor(options = {}) {
    this.gsc = new GSCClient(options.gsc || {});
    this.ga4 = new GA4Client(options.ga4 || {});
    this.wpApiUrl = options.wpApiUrl || process.env.WORDPRESS_URL;
    this.debug = options.debug || false;
  }

  // ============================================================
  // COMPREHENSIVE REPORTS
  // ============================================================

  /**
   * Complete SEO Dashboard
   * Everything you need in one call
   */
  async getDashboard(options = {}) {
    const { days = 28 } = options;

    this.log('Generating comprehensive SEO dashboard...');

    // Parallel fetch from all sources
    const [
      gscHealth,
      gscPerformance,
      gscCoverage,
      gaTraffic,
      gaSources,
      gaOrganic
    ] = await Promise.all([
      this.gsc.getHealthScore().catch(e => ({ error: e.message })),
      this.gsc.getPerformanceSummary({ days }).catch(e => ({ error: e.message })),
      this.gsc.getCoverageReport({ limit: 50 }).catch(e => ({ error: e.message })),
      this.ga4.getTrafficOverview({ startDate: `${days}daysAgo` }).catch(e => ({ error: e.message })),
      this.ga4.getTrafficSources({ startDate: `${days}daysAgo` }).catch(e => ({ error: e.message })),
      this.ga4.getOrganicTraffic({ startDate: `${days}daysAgo` }).catch(e => ({ error: e.message }))
    ]);

    return {
      // Health Score
      health: {
        score: gscHealth.overall || 0,
        grade: gscHealth.grade || 'N/A',
        breakdown: gscHealth.breakdown || {}
      },

      // Search Performance (GSC)
      search: {
        clicks: gscPerformance.summary?.totalClicks || 0,
        impressions: gscPerformance.summary?.totalImpressions || 0,
        ctr: gscPerformance.summary?.avgCTR || 0,
        avgPosition: gscPerformance.summary?.avgPosition || 0,
        topKeywords: (gscPerformance.topKeywords || []).slice(0, 10),
        top10Rankings: gscPerformance.summary?.top10Rankings || 0
      },

      // Indexation (GSC)
      indexation: {
        total: gscCoverage.summary?.total || 0,
        indexed: gscCoverage.summary?.indexed || 0,
        rate: gscCoverage.summary?.indexRate || '0%',
        excluded: gscCoverage.summary?.excluded || 0,
        errors: gscCoverage.summary?.errors || 0
      },

      // Traffic (GA4)
      traffic: {
        sessions: gaTraffic.sessions || 0,
        users: gaTraffic.users || 0,
        pageviews: gaTraffic.pageviews || 0,
        bounceRate: gaTraffic.bounceRate || 0,
        avgDuration: gaTraffic.avgSessionDuration || 0
      },

      // Organic Traffic (GA4)
      organic: {
        sessions: gaOrganic.totalOrganicSessions || 0,
        topLandingPage: gaOrganic.topLandingPage || null,
        pages: (gaOrganic.pages || []).slice(0, 10)
      },

      // Traffic Sources (GA4)
      sources: (gaSources.sources || []).map(s => ({
        channel: s.channel,
        sessions: s.sessions,
        percentage: s.percentage
      })),

      // Metadata
      meta: {
        period: `Last ${days} days`,
        generatedAt: new Date().toISOString(),
        dataSources: ['Google Search Console', 'Google Analytics 4']
      }
    };
  }

  /**
   * Page-Level SEO Analysis
   * Complete picture of a single page's SEO performance
   */
  async analyzePage(url, options = {}) {
    const { days = 28 } = options;

    this.log(`Analyzing page: ${url}`);

    // Extract path from URL
    const urlObj = new URL(url);
    const pagePath = urlObj.pathname;

    // Parallel fetch
    const [
      gscIndex,
      gaPerformance,
      pageContent
    ] = await Promise.all([
      this.gsc.checkIndexStatus(url).catch(e => ({ error: e.message })),
      this.ga4.getPageSEOPerformance(pagePath, { startDate: `${days}daysAgo` }).catch(e => ({ error: e.message })),
      this.fetchPageSEO(url).catch(e => ({ error: e.message }))
    ]);

    // Generate recommendations
    const recommendations = this.generatePageRecommendations({
      gsc: gscIndex,
      ga: gaPerformance,
      content: pageContent
    });

    return {
      url,
      pagePath,

      // Indexation Status
      indexation: {
        indexed: gscIndex.indexed || false,
        clicks: gscIndex.clicks || 0,
        impressions: gscIndex.impressions || 0,
        position: gscIndex.position || null
      },

      // Traffic Performance
      traffic: {
        pageviews: gaPerformance.pageviews || 0,
        users: gaPerformance.users || 0,
        bounceRate: gaPerformance.bounceRate || 0,
        avgTime: gaPerformance.avgSessionDuration || 0
      },

      // On-Page SEO
      onPage: {
        title: pageContent.title || null,
        titleLength: pageContent.titleLength || 0,
        metaDescription: pageContent.metaDescription || null,
        metaLength: pageContent.metaLength || 0,
        h1: pageContent.h1 || null,
        h1Count: pageContent.h1Count || 0,
        hasSchema: pageContent.hasSchema || false,
        schemaTypes: pageContent.schemaTypes || [],
        canonical: pageContent.canonical || null,
        wordCount: pageContent.wordCount || 0
      },

      // Issues Found
      issues: recommendations.issues,

      // Recommendations
      recommendations: recommendations.actions,

      // Overall Score
      score: this.calculatePageScore({
        indexed: gscIndex.indexed,
        hasTraffic: (gaPerformance.pageviews || 0) > 0,
        titleOk: (pageContent.titleLength || 0) >= 30 && (pageContent.titleLength || 0) <= 60,
        metaOk: (pageContent.metaLength || 0) >= 120 && (pageContent.metaLength || 0) <= 160,
        hasH1: (pageContent.h1Count || 0) === 1,
        hasSchema: pageContent.hasSchema
      }),

      meta: {
        period: `Last ${days} days`,
        analyzedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Find all SEO opportunities across the site
   */
  async findOpportunities(options = {}) {
    const { limit = 20 } = options;

    this.log('Finding SEO opportunities...');

    const [
      ctrOpps,
      pageTwoKws,
      coverage
    ] = await Promise.all([
      this.gsc.findCTROpportunities({ limit }).catch(e => ({ opportunities: [] })),
      this.gsc.findPageTwoKeywords({ limit }).catch(e => ({ keywords: [] })),
      this.gsc.getCoverageReport({ limit: 100 }).catch(e => ({ pages: [] }))
    ]);

    // Find pages with low engagement
    const lowEngagement = (coverage.pages || [])
      .filter(p => p.impressions > 50 && p.clicks < 5)
      .slice(0, limit);

    return {
      // CTR Optimization Opportunities
      ctrOpportunities: {
        count: ctrOpps.opportunities?.length || 0,
        potentialClicks: ctrOpps.totalPotentialClicks || 0,
        pages: ctrOpps.opportunities || [],
        action: 'Improve titles and meta descriptions for better CTR'
      },

      // Page 2 Keywords (easy wins)
      pageTwoKeywords: {
        count: pageTwoKws.keywords?.length || 0,
        keywords: pageTwoKws.keywords || [],
        action: 'Add content, internal links, or build backlinks to push to page 1'
      },

      // Low Engagement Pages
      lowEngagementPages: {
        count: lowEngagement.length,
        pages: lowEngagement,
        action: 'Review content quality and search intent match'
      },

      // Priority Actions (sorted by impact)
      priorityActions: [
        ...ctrOpps.opportunities?.slice(0, 3).map(o => ({
          type: 'CTR',
          url: o.url,
          action: o.recommendation,
          impact: 'HIGH'
        })) || [],
        ...pageTwoKws.keywords?.slice(0, 3).map(k => ({
          type: 'RANKING',
          keyword: k.keyword,
          url: k.url,
          action: k.recommendation,
          impact: 'HIGH'
        })) || []
      ],

      analyzedAt: new Date().toISOString()
    };
  }

  /**
   * Technical SEO Audit
   */
  async runTechnicalAudit(siteUrl) {
    this.log(`Running technical audit for: ${siteUrl}`);

    const issues = [];
    const passed = [];

    // Check robots.txt
    try {
      const robotsRes = await fetch(`${siteUrl}/robots.txt`);
      const robotsTxt = await robotsRes.text();

      if (robotsRes.ok) {
        passed.push({ check: 'robots.txt', status: 'EXISTS' });

        if (!robotsTxt.includes('Sitemap:')) {
          issues.push({
            severity: 'HIGH',
            type: 'robots.txt',
            issue: 'Missing sitemap reference',
            fix: `Add: Sitemap: ${siteUrl}/sitemap.xml`
          });
        }

        if (robotsTxt.includes('Disallow: /')) {
          issues.push({
            severity: 'CRITICAL',
            type: 'robots.txt',
            issue: 'May be blocking search engines',
            fix: 'Review disallow rules'
          });
        }
      } else {
        issues.push({
          severity: 'HIGH',
          type: 'robots.txt',
          issue: 'robots.txt not found',
          fix: 'Create robots.txt file'
        });
      }
    } catch (e) {
      issues.push({
        severity: 'HIGH',
        type: 'robots.txt',
        issue: 'Could not access robots.txt',
        fix: 'Verify robots.txt is accessible'
      });
    }

    // Check sitemap
    try {
      const sitemapRes = await fetch(`${siteUrl}/sitemap.xml`);
      if (sitemapRes.ok) {
        passed.push({ check: 'sitemap.xml', status: 'EXISTS' });
      } else {
        issues.push({
          severity: 'HIGH',
          type: 'sitemap',
          issue: 'sitemap.xml not found',
          fix: 'Generate and submit sitemap'
        });
      }
    } catch (e) {
      issues.push({
        severity: 'HIGH',
        type: 'sitemap',
        issue: 'Could not access sitemap',
        fix: 'Verify sitemap is accessible'
      });
    }

    // Check HTTPS
    if (!siteUrl.startsWith('https://')) {
      issues.push({
        severity: 'CRITICAL',
        type: 'security',
        issue: 'Site not using HTTPS',
        fix: 'Install SSL certificate'
      });
    } else {
      passed.push({ check: 'HTTPS', status: 'ENABLED' });
    }

    // Check homepage
    try {
      const homeRes = await fetch(siteUrl);
      const html = await homeRes.text();
      const pageAnalysis = this.parsePageSEO(html);

      // Viewport
      if (!html.includes('viewport')) {
        issues.push({
          severity: 'HIGH',
          type: 'mobile',
          issue: 'Missing viewport meta tag',
          fix: 'Add viewport meta tag for mobile'
        });
      } else {
        passed.push({ check: 'Viewport', status: 'PRESENT' });
      }

      // Title
      if (!pageAnalysis.title) {
        issues.push({
          severity: 'CRITICAL',
          type: 'on-page',
          issue: 'Homepage missing title tag',
          fix: 'Add optimized title tag'
        });
      } else if (pageAnalysis.titleLength > 60) {
        issues.push({
          severity: 'MEDIUM',
          type: 'on-page',
          issue: `Title too long (${pageAnalysis.titleLength} chars)`,
          fix: 'Shorten to 50-60 characters'
        });
      }

      // Meta description
      if (!pageAnalysis.metaDescription) {
        issues.push({
          severity: 'HIGH',
          type: 'on-page',
          issue: 'Homepage missing meta description',
          fix: 'Add compelling meta description'
        });
      } else if (pageAnalysis.metaLength > 160) {
        issues.push({
          severity: 'MEDIUM',
          type: 'on-page',
          issue: `Meta description too long (${pageAnalysis.metaLength} chars)`,
          fix: 'Shorten to 150-160 characters'
        });
      }

      // Schema
      if (!pageAnalysis.hasSchema) {
        issues.push({
          severity: 'MEDIUM',
          type: 'schema',
          issue: 'No structured data found',
          fix: 'Add Organization/LocalBusiness schema'
        });
      } else {
        passed.push({ check: 'Schema Markup', status: 'PRESENT' });
      }

    } catch (e) {
      issues.push({
        severity: 'CRITICAL',
        type: 'accessibility',
        issue: 'Could not access homepage',
        fix: 'Verify site is accessible'
      });
    }

    // Calculate score
    const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
    const highCount = issues.filter(i => i.severity === 'HIGH').length;
    const score = Math.max(0, 100 - (criticalCount * 25) - (highCount * 10));

    return {
      siteUrl,
      score,
      grade: this.scoreToGrade(score),
      summary: {
        passed: passed.length,
        issues: issues.length,
        critical: criticalCount,
        high: highCount,
        medium: issues.filter(i => i.severity === 'MEDIUM').length
      },
      passed,
      issues: issues.sort((a, b) => {
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return order[a.severity] - order[b.severity];
      }),
      auditedAt: new Date().toISOString()
    };
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  async fetchPageSEO(url) {
    try {
      const response = await fetch(url);
      const html = await response.text();
      return this.parsePageSEO(html);
    } catch (e) {
      return { error: e.message };
    }
  }

  parsePageSEO(html) {
    // Title
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;

    // Meta description
    const metaMatch = html.match(/<meta name="description" content="(.*?)"/i);
    const metaDescription = metaMatch ? metaMatch[1] : null;

    // H1
    const h1Matches = html.match(/<h1[^>]*>(.*?)<\/h1>/gi) || [];
    const h1 = h1Matches[0]?.replace(/<[^>]+>/g, '').trim() || null;

    // Schema
    const schemaMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi) || [];
    const schemaTypes = schemaMatches.map(s => {
      const typeMatch = s.match(/"@type"\s*:\s*"([^"]+)"/);
      return typeMatch ? typeMatch[1] : 'Unknown';
    });

    // Canonical
    const canonicalMatch = html.match(/<link rel="canonical" href="(.*?)"/i);
    const canonical = canonicalMatch ? canonicalMatch[1] : null;

    // Word count (rough estimate)
    const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const wordCount = textContent.split(' ').filter(w => w.length > 2).length;

    return {
      title,
      titleLength: title?.length || 0,
      metaDescription,
      metaLength: metaDescription?.length || 0,
      h1,
      h1Count: h1Matches.length,
      hasSchema: schemaMatches.length > 0,
      schemaTypes,
      canonical,
      wordCount
    };
  }

  generatePageRecommendations({ gsc, ga, content }) {
    const issues = [];
    const actions = [];

    // Indexation
    if (!gsc.indexed) {
      issues.push({ type: 'CRITICAL', message: 'Page is not indexed' });
      actions.push('Submit page for indexing via GSC');
    }

    // Title
    if (!content.title) {
      issues.push({ type: 'CRITICAL', message: 'Missing title tag' });
      actions.push('Add an optimized title tag (50-60 chars)');
    } else if (content.titleLength > 60) {
      issues.push({ type: 'MEDIUM', message: 'Title too long' });
      actions.push(`Shorten title from ${content.titleLength} to 60 chars`);
    } else if (content.titleLength < 30) {
      issues.push({ type: 'MEDIUM', message: 'Title too short' });
      actions.push('Expand title to include more keywords');
    }

    // Meta description
    if (!content.metaDescription) {
      issues.push({ type: 'HIGH', message: 'Missing meta description' });
      actions.push('Add a compelling meta description (150-160 chars)');
    } else if (content.metaLength > 160) {
      issues.push({ type: 'MEDIUM', message: 'Meta description too long' });
      actions.push(`Shorten meta from ${content.metaLength} to 160 chars`);
    }

    // H1
    if (content.h1Count === 0) {
      issues.push({ type: 'HIGH', message: 'Missing H1 tag' });
      actions.push('Add a single H1 tag with primary keyword');
    } else if (content.h1Count > 1) {
      issues.push({ type: 'MEDIUM', message: 'Multiple H1 tags' });
      actions.push('Use only one H1 per page');
    }

    // Schema
    if (!content.hasSchema) {
      issues.push({ type: 'MEDIUM', message: 'No structured data' });
      actions.push('Add relevant schema markup (FAQ, HowTo, etc.)');
    }

    // Content
    if (content.wordCount < 300) {
      issues.push({ type: 'MEDIUM', message: 'Thin content' });
      actions.push('Add more comprehensive content (aim for 1000+ words)');
    }

    // CTR (if has impressions but low clicks)
    if (gsc.impressions > 100 && gsc.clicks < 5) {
      issues.push({ type: 'HIGH', message: 'Low CTR despite impressions' });
      actions.push('Improve title and meta for better click-through');
    }

    return { issues, actions };
  }

  calculatePageScore(factors) {
    let score = 0;
    if (factors.indexed) score += 30;
    if (factors.hasTraffic) score += 20;
    if (factors.titleOk) score += 15;
    if (factors.metaOk) score += 15;
    if (factors.hasH1) score += 10;
    if (factors.hasSchema) score += 10;
    return score;
  }

  scoreToGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
  }

  log(message) {
    if (this.debug) {
      console.log(`[SEO] ${message}`);
    }
  }
}

// Default instance
export const seo = new UnifiedSEO();

// Quick access
export const getDashboard = (opts) => seo.getDashboard(opts);
export const analyzePage = (url, opts) => seo.analyzePage(url, opts);
export const findOpportunities = (opts) => seo.findOpportunities(opts);
export const technicalAudit = (url) => seo.runTechnicalAudit(url);

export default UnifiedSEO;
