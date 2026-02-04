/**
 * Google Search Console API Client
 * Unified interface for all GSC operations
 *
 * NEXUS Layer Integration:
 * L1 SCAN - Validate inputs, check API access
 * L5 HEAL - Auto-retry on rate limits, fallback to cache
 * L8 OBSERVE - Track API usage and performance
 */

import fetch from 'node-fetch';

// Configuration
const GSC_BASE_URL = process.env.GSC_API_URL || 'https://marketing.example.com';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Simple in-memory cache
const cache = new Map();

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data, ttl = CACHE_TTL) {
  cache.set(key, { data, expires: Date.now() + ttl });
}

/**
 * GSC Client - Google Search Console API wrapper
 */
export class GSCClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || GSC_BASE_URL;
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
    this.debug = options.debug || false;
  }

  // ============================================================
  // CORE API METHODS
  // ============================================================

  /**
   * Check if a specific URL is indexed
   * @param {string} url - Full URL to check
   * @returns {Promise<{indexed: boolean, data: object}>}
   */
  async checkIndexStatus(url) {
    // L1 SCAN: Validate input
    if (!url || !url.startsWith('http')) {
      throw new Error('Invalid URL: must be a full URL starting with http(s)');
    }

    // Check cache first
    const cacheKey = `index:${url}`;
    const cached = getCached(cacheKey);
    if (cached) {
      this.log(`Cache hit: ${url}`);
      return { ...cached, fromCache: true };
    }

    // Make API call
    const response = await this.fetch(
      `/api/indexation/gsc/status?url=${encodeURIComponent(url)}`
    );

    const result = {
      url,
      indexed: response.indexed || false,
      clicks: response.data?.clicks || 0,
      impressions: response.data?.impressions || 0,
      ctr: response.data?.ctr || 0,
      position: response.data?.position || null,
      source: response.source,
      checkedAt: new Date().toISOString()
    };

    setCache(cacheKey, result);
    return result;
  }

  /**
   * Get coverage report for entire site
   * @param {object} options - { limit, offset }
   * @returns {Promise<{summary: object, pages: array}>}
   */
  async getCoverageReport(options = {}) {
    const { limit = 100, offset = 0 } = options;

    const cacheKey = `coverage:${limit}:${offset}`;
    const cached = getCached(cacheKey);
    if (cached) return { ...cached, fromCache: true };

    const response = await this.fetch(
      `/api/indexation/gsc/coverage?limit=${limit}&offset=${offset}`
    );

    const result = {
      summary: {
        total: response.summary?.total || 0,
        indexed: response.summary?.indexed || 0,
        indexRate: response.summary?.indexRate || '0%',
        avgPosition: response.summary?.avgPosition || 0,
        excluded: response.summary?.excluded || 0,
        errors: response.summary?.errors || 0
      },
      pages: response.pages || [],
      source: response.source,
      fetchedAt: new Date().toISOString()
    };

    setCache(cacheKey, result);
    return result;
  }

  /**
   * Get performance summary (dashboard data)
   * @param {object} options - { days }
   * @returns {Promise<{summary: object, topKeywords: array, topPages: array}>}
   */
  async getPerformanceSummary(options = {}) {
    const { days = 28 } = options;

    const cacheKey = `summary:${days}`;
    const cached = getCached(cacheKey);
    if (cached) return { ...cached, fromCache: true };

    const response = await this.fetch(
      `/api/indexation/gsc/summary?days=${days}`
    );

    const result = {
      summary: {
        totalClicks: response.summary?.totalClicks || 0,
        totalImpressions: response.summary?.totalImpressions || 0,
        avgCTR: response.summary?.avgCTR || 0,
        avgPosition: response.summary?.avgPosition || 0,
        keywordsTracked: response.summary?.keywordsTracked || 0,
        top10Rankings: response.summary?.top10Rankings || 0,
        top3Rankings: response.summary?.top3Rankings || 0
      },
      topKeywords: response.topKeywords || [],
      topPages: response.topPages || [],
      trends: response.trends || {},
      source: response.source,
      period: `${days} days`,
      fetchedAt: new Date().toISOString()
    };

    setCache(cacheKey, result, 10 * 60 * 1000); // 10 min cache for summary
    return result;
  }

  /**
   * Bulk check multiple URLs for index status
   * @param {string[]} urls - Array of URLs to check
   * @returns {Promise<{results: array, summary: object}>}
   */
  async bulkInspect(urls) {
    // L1 SCAN: Validate inputs
    if (!Array.isArray(urls) || urls.length === 0) {
      throw new Error('URLs must be a non-empty array');
    }

    if (urls.length > 100) {
      throw new Error('Maximum 100 URLs per bulk request');
    }

    const response = await this.fetch('/api/indexation/gsc/inspect-bulk', {
      method: 'POST',
      body: JSON.stringify({ urls })
    });

    return {
      total: response.total || urls.length,
      indexed: response.indexed || 0,
      notIndexed: response.notIndexed || 0,
      indexRate: response.indexRate || '0%',
      results: response.results || [],
      source: response.source,
      checkedAt: new Date().toISOString()
    };
  }

  // ============================================================
  // ADVANCED ANALYTICS
  // ============================================================

  /**
   * Find pages with high impressions but low CTR (optimization opportunities)
   * @param {object} options - { minImpressions, maxCTR, limit }
   */
  async findCTROpportunities(options = {}) {
    const { minImpressions = 100, maxCTR = 0.02, limit = 20 } = options;

    const coverage = await this.getCoverageReport({ limit: 500 });

    const opportunities = coverage.pages
      .filter(page =>
        page.impressions >= minImpressions &&
        page.ctr <= maxCTR
      )
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, limit)
      .map(page => ({
        url: page.url,
        impressions: page.impressions,
        clicks: page.clicks,
        ctr: page.ctr,
        position: page.position,
        potentialClicks: Math.round(page.impressions * 0.05), // If CTR improved to 5%
        recommendation: page.position <= 3
          ? 'Improve title/meta for better CTR'
          : 'Improve content to rank higher first'
      }));

    return {
      opportunities,
      totalPotentialClicks: opportunities.reduce((sum, o) => sum + o.potentialClicks, 0),
      analyzedAt: new Date().toISOString()
    };
  }

  /**
   * Find keywords ranking on page 2 (positions 11-20)
   * These are the easiest wins - already ranking, just need a push
   */
  async findPageTwoKeywords(options = {}) {
    const { limit = 30 } = options;

    const summary = await this.getPerformanceSummary({ days: 28 });

    const pageTwoKeywords = summary.topKeywords
      .filter(kw => kw.position >= 11 && kw.position <= 20)
      .sort((a, b) => a.position - b.position)
      .slice(0, limit)
      .map(kw => ({
        keyword: kw.query,
        position: kw.position,
        impressions: kw.impressions,
        url: kw.url,
        positionsToPage1: Math.ceil(kw.position - 10),
        recommendation: 'Add more content, internal links, or backlinks'
      }));

    return {
      keywords: pageTwoKeywords,
      count: pageTwoKeywords.length,
      analyzedAt: new Date().toISOString()
    };
  }

  /**
   * Find pages losing rankings (content decay detection)
   * Compares last 7 days vs previous 7 days
   */
  async findDecayingPages(options = {}) {
    const recent = await this.getPerformanceSummary({ days: 7 });
    const previous = await this.getPerformanceSummary({ days: 14 });

    // This would require date-range comparison in the API
    // For now, return the structure
    return {
      decayingPages: [],
      note: 'Requires date-range comparison - implement in API',
      analyzedAt: new Date().toISOString()
    };
  }

  /**
   * Get comprehensive SEO health score
   */
  async getHealthScore() {
    const [coverage, performance] = await Promise.all([
      this.getCoverageReport({ limit: 100 }),
      this.getPerformanceSummary({ days: 28 })
    ]);

    // Calculate health score (0-100)
    const indexScore = Math.min(100, (coverage.summary.indexed / Math.max(coverage.summary.total, 1)) * 100);
    const ctrScore = Math.min(100, performance.summary.avgCTR * 1000); // 10% CTR = 100
    const positionScore = Math.max(0, 100 - (performance.summary.avgPosition * 5)); // Position 1 = 95, Position 20 = 0
    const clickScore = Math.min(100, performance.summary.totalClicks / 10); // 1000 clicks = 100

    const overallScore = Math.round(
      (indexScore * 0.3) +
      (ctrScore * 0.2) +
      (positionScore * 0.3) +
      (clickScore * 0.2)
    );

    return {
      overall: overallScore,
      breakdown: {
        indexation: Math.round(indexScore),
        ctr: Math.round(ctrScore),
        rankings: Math.round(positionScore),
        traffic: Math.round(clickScore)
      },
      summary: {
        totalPages: coverage.summary.total,
        indexedPages: coverage.summary.indexed,
        totalClicks: performance.summary.totalClicks,
        avgPosition: performance.summary.avgPosition
      },
      grade: this.scoreToGrade(overallScore),
      calculatedAt: new Date().toISOString()
    };
  }

  scoreToGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
  }

  // ============================================================
  // INTERNAL HELPERS
  // ============================================================

  async fetch(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const method = options.method || 'GET';

    this.log(`${method} ${url}`);

    let lastError;
    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers
          },
          body: options.body,
          timeout: this.timeout
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();

      } catch (error) {
        lastError = error;
        this.log(`Attempt ${attempt}/${this.retries} failed: ${error.message}`);

        if (attempt < this.retries) {
          // Exponential backoff
          await this.sleep(1000 * Math.pow(2, attempt - 1));
        }
      }
    }

    throw lastError;
  }

  log(message) {
    if (this.debug) {
      console.log(`[GSC] ${message}`);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Default instance
export const gsc = new GSCClient();

// Quick access functions
export const checkIndex = (url) => gsc.checkIndexStatus(url);
export const getCoverage = (opts) => gsc.getCoverageReport(opts);
export const getPerformance = (opts) => gsc.getPerformanceSummary(opts);
export const bulkCheck = (urls) => gsc.bulkInspect(urls);
export const getHealthScore = () => gsc.getHealthScore();
export const findCTROpportunities = (opts) => gsc.findCTROpportunities(opts);
export const findPageTwoKeywords = (opts) => gsc.findPageTwoKeywords(opts);

export default GSCClient;
