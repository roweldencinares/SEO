/**
 * Bing Webmaster Tools API Integration
 * Manages Bing indexation, sitemaps, and comparison with Google
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BING_API_BASE = 'https://ssl.bing.com/webmaster/api.svc/json';
const SITE_URL = process.env.SITE_URL || 'https://www.example.com';

// ============================================================================
// BING WEBMASTER API CLASS
// ============================================================================

export class BingWebmasterAPI {
  constructor(apiKey = process.env.BING_WEBMASTER_API_KEY) {
    this.apiKey = apiKey;

    if (!this.apiKey) {
      console.warn('[Bing API] No API key found. Set BING_WEBMASTER_API_KEY in .env');
    }
  }

  /**
   * Check if API is configured
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Make API request to Bing
   */
  async request(endpoint, method = 'GET', data = null) {
    if (!this.isConfigured()) {
      throw new Error('Bing Webmaster API key not configured');
    }

    try {
      const response = await axios({
        method,
        url: `${BING_API_BASE}/${endpoint}`,
        params: method === 'GET' ? { ...data, apikey: this.apiKey } : { apikey: this.apiKey },
        data: method === 'POST' ? data : null,
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      return response.data;
    } catch (error) {
      console.error('[Bing API] Error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Submit URL to Bing for indexing
   * @param {string} url - URL to submit
   * @returns {Promise<Object>} Submission result
   */
  async submitUrl(url) {
    return await this.request('SubmitUrl', 'POST', {
      siteUrl: SITE_URL,
      url: url
    });
  }

  /**
   * Submit multiple URLs
   * @param {Array} urls - Array of URLs
   * @returns {Promise<Array>} Results
   */
  async submitUrls(urls) {
    const results = [];

    for (const url of urls) {
      try {
        const result = await this.submitUrl(url);
        results.push({ url, success: true, ...result });
      } catch (error) {
        results.push({ url, success: false, error: error.message });
      }

      // Rate limiting: 10 URLs per day for free tier
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  /**
   * Submit sitemap to Bing
   * @param {string} sitemapUrl - Sitemap URL
   * @returns {Promise<Object>} Result
   */
  async submitSitemap(sitemapUrl) {
    return await this.request('SubmitSitemap', 'POST', {
      siteUrl: SITE_URL,
      sitemapUrl: sitemapUrl
    });
  }

  /**
   * Get URL statistics
   * @returns {Promise<Object>} URL stats
   */
  async getUrlStats() {
    return await this.request('GetUrlsStats', 'GET', {
      siteUrl: SITE_URL
    });
  }

  /**
   * Get site crawl stats
   * @returns {Promise<Object>} Crawl stats
   */
  async getCrawlStats() {
    return await this.request('GetCrawlStats', 'GET', {
      siteUrl: SITE_URL
    });
  }

  /**
   * Get indexation summary
   * @returns {Promise<Object>} Summary
   */
  async getIndexSummary() {
    try {
      const stats = await this.getUrlStats();

      return {
        totalUrls: stats.TotalUrls || 0,
        indexedUrls: stats.IndexedUrls || 0,
        crawledUrls: stats.CrawledUrls || 0,
        blockedUrls: stats.BlockedUrls || 0,
        coverage: stats.TotalUrls > 0
          ? ((stats.IndexedUrls / stats.TotalUrls) * 100).toFixed(1) + '%'
          : '0%'
      };
    } catch (error) {
      return {
        totalUrls: 0,
        indexedUrls: 0,
        crawledUrls: 0,
        blockedUrls: 0,
        coverage: 'N/A',
        error: error.message
      };
    }
  }

  /**
   * Get crawl errors
   * @returns {Promise<Array>} List of errors
   */
  async getCrawlErrors() {
    try {
      return await this.request('GetCrawlIssues', 'GET', {
        siteUrl: SITE_URL
      });
    } catch (error) {
      return [];
    }
  }
}

// ============================================================================
// GOOGLE VS BING COMPARISON
// ============================================================================

/**
 * Compare indexation between Google and Bing
 * @param {Object} googleData - Google Search Console data
 * @param {Object} bingAPI - Bing API instance
 * @returns {Promise<Object>} Comparison
 */
export async function compareIndexation(googleData, bingAPI) {
  const bingData = await bingAPI.getIndexSummary();

  const comparison = {
    google: {
      indexed: googleData.indexed || 0,
      coverage: googleData.coverage || 'N/A'
    },
    bing: {
      indexed: bingData.indexedUrls || 0,
      coverage: bingData.coverage || 'N/A'
    },
    gap: {
      count: (googleData.indexed || 0) - (bingData.indexedUrls || 0),
      percentage: ((googleData.indexed || 0) > 0)
        ? (((googleData.indexed - bingData.indexedUrls) / googleData.indexed) * 100).toFixed(1) + '%'
        : 'N/A'
    },
    recommendations: []
  };

  // Generate recommendations
  if (comparison.gap.count > 50) {
    comparison.recommendations.push('Submit sitemap to Bing');
    comparison.recommendations.push('Check Bing crawl errors');
    comparison.recommendations.push('Verify robots.txt allows Bing bot');
  }

  if (bingData.blockedUrls > 0) {
    comparison.recommendations.push(`${bingData.blockedUrls} URLs blocked - check robots.txt`);
  }

  if (comparison.google.indexed > comparison.bing.indexed * 2) {
    comparison.recommendations.push('Significant Bing indexation gap - submit URLs manually');
  }

  return comparison;
}

/**
 * Get indexation comparison data
 * @param {Object} googleIndexed - Number of Google indexed pages
 * @returns {Promise<Object>} Comparison dashboard data
 */
export async function getIndexationDashboard(googleIndexed = 295) {
  const bing = new BingWebmasterAPI();

  if (!bing.isConfigured()) {
    return {
      configured: false,
      message: 'Bing API not configured. Add BING_WEBMASTER_API_KEY to .env',
      setupUrl: 'https://www.bing.com/webmasters'
    };
  }

  const bingSummary = await bing.getIndexSummary();
  const comparison = await compareIndexation({ indexed: googleIndexed }, bing);

  return {
    configured: true,
    google: comparison.google,
    bing: comparison.bing,
    gap: comparison.gap,
    recommendations: comparison.recommendations,
    bingDetails: bingSummary
  };
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Submit all sitemap URLs to Bing
 * @param {Array} sitemapUrls - Array of sitemap URLs
 * @returns {Promise<Array>} Results
 */
export async function submitAllSitemaps(sitemapUrls) {
  const bing = new BingWebmasterAPI();
  const results = [];

  for (const sitemapUrl of sitemapUrls) {
    try {
      const result = await bing.submitSitemap(sitemapUrl);
      results.push({
        sitemap: sitemapUrl,
        success: true,
        ...result
      });
    } catch (error) {
      results.push({
        sitemap: sitemapUrl,
        success: false,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Submit key pages to Bing for immediate indexing
 * @param {Array} urls - Important URLs to submit
 * @returns {Promise<Object>} Results
 */
export async function submitKeyPages(urls) {
  const bing = new BingWebmasterAPI();
  return await bing.submitUrls(urls);
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  BingWebmasterAPI,
  compareIndexation,
  getIndexationDashboard,
  submitAllSitemaps,
  submitKeyPages
};
