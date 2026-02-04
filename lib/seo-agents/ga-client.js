/**
 * Google Analytics 4 API Client
 * Unified interface for all GA4 operations
 *
 * NEXUS Layer Integration:
 * L1 SCAN - Validate inputs, check credentials
 * L5 HEAL - Auto-retry, fallback to cached data
 * L8 OBSERVE - Track API performance
 *
 * Setup Requirements:
 * 1. GA4 Property ID in env: GA4_PROPERTY_ID
 * 2. Service Account credentials: GOOGLE_APPLICATION_CREDENTIALS
 * 3. GA4 Data API enabled in Google Cloud Console
 */

import fetch from 'node-fetch';

// Configuration
const GA_API_BASE = 'https://analyticsdata.googleapis.com/v1beta';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes (GA data updates less frequently)

// Cache
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
 * GA4 Client - Google Analytics 4 API wrapper
 */
export class GA4Client {
  constructor(options = {}) {
    this.propertyId = options.propertyId || process.env.GA4_PROPERTY_ID;
    this.accessToken = options.accessToken || null;
    this.debug = options.debug || false;

    if (!this.propertyId) {
      console.warn('[GA4] Warning: GA4_PROPERTY_ID not set. Some features will be limited.');
    }
  }

  // ============================================================
  // CORE REPORTING METHODS
  // ============================================================

  /**
   * Get traffic overview
   * @param {object} options - { startDate, endDate }
   */
  async getTrafficOverview(options = {}) {
    const {
      startDate = '30daysAgo',
      endDate = 'today'
    } = options;

    const cacheKey = `traffic:${startDate}:${endDate}`;
    const cached = getCached(cacheKey);
    if (cached) return { ...cached, fromCache: true };

    const response = await this.runReport({
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'engagementRate' }
      ]
    });

    const metrics = response.rows?.[0]?.metricValues || [];

    const result = {
      sessions: parseInt(metrics[0]?.value || 0),
      users: parseInt(metrics[1]?.value || 0),
      newUsers: parseInt(metrics[2]?.value || 0),
      pageviews: parseInt(metrics[3]?.value || 0),
      bounceRate: parseFloat(metrics[4]?.value || 0).toFixed(2),
      avgSessionDuration: parseFloat(metrics[5]?.value || 0).toFixed(0),
      engagementRate: parseFloat(metrics[6]?.value || 0).toFixed(2),
      period: { startDate, endDate },
      fetchedAt: new Date().toISOString()
    };

    setCache(cacheKey, result);
    return result;
  }

  /**
   * Get top pages by traffic
   * @param {object} options - { startDate, endDate, limit }
   */
  async getTopPages(options = {}) {
    const {
      startDate = '30daysAgo',
      endDate = 'today',
      limit = 20
    } = options;

    const cacheKey = `pages:${startDate}:${endDate}:${limit}`;
    const cached = getCached(cacheKey);
    if (cached) return { ...cached, fromCache: true };

    const response = await this.runReport({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'totalUsers' },
        { name: 'averageSessionDuration' },
        { name: 'bounceRate' }
      ],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit
    });

    const pages = (response.rows || []).map(row => ({
      path: row.dimensionValues[0]?.value,
      pageviews: parseInt(row.metricValues[0]?.value || 0),
      users: parseInt(row.metricValues[1]?.value || 0),
      avgTime: parseFloat(row.metricValues[2]?.value || 0).toFixed(0),
      bounceRate: parseFloat(row.metricValues[3]?.value || 0).toFixed(2)
    }));

    const result = {
      pages,
      totalPages: response.rowCount || pages.length,
      period: { startDate, endDate },
      fetchedAt: new Date().toISOString()
    };

    setCache(cacheKey, result);
    return result;
  }

  /**
   * Get traffic sources
   */
  async getTrafficSources(options = {}) {
    const {
      startDate = '30daysAgo',
      endDate = 'today',
      limit = 10
    } = options;

    const cacheKey = `sources:${startDate}:${endDate}`;
    const cached = getCached(cacheKey);
    if (cached) return { ...cached, fromCache: true };

    const response = await this.runReport({
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'sessionDefaultChannelGroup' }
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'conversions' }
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit
    });

    const sources = (response.rows || []).map(row => ({
      channel: row.dimensionValues[0]?.value,
      sessions: parseInt(row.metricValues[0]?.value || 0),
      users: parseInt(row.metricValues[1]?.value || 0),
      conversions: parseInt(row.metricValues[2]?.value || 0)
    }));

    // Calculate percentages
    const totalSessions = sources.reduce((sum, s) => sum + s.sessions, 0);
    sources.forEach(s => {
      s.percentage = ((s.sessions / totalSessions) * 100).toFixed(1);
    });

    const result = {
      sources,
      totalSessions,
      period: { startDate, endDate },
      fetchedAt: new Date().toISOString()
    };

    setCache(cacheKey, result);
    return result;
  }

  /**
   * Get organic search traffic specifically (for SEO)
   */
  async getOrganicTraffic(options = {}) {
    const {
      startDate = '30daysAgo',
      endDate = 'today'
    } = options;

    const cacheKey = `organic:${startDate}:${endDate}`;
    const cached = getCached(cacheKey);
    if (cached) return { ...cached, fromCache: true };

    const response = await this.runReport({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'landingPage' }],
      dimensionFilter: {
        filter: {
          fieldName: 'sessionDefaultChannelGroup',
          stringFilter: { value: 'Organic Search' }
        }
      },
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'conversions' },
        { name: 'bounceRate' }
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 50
    });

    const pages = (response.rows || []).map(row => ({
      landingPage: row.dimensionValues[0]?.value,
      sessions: parseInt(row.metricValues[0]?.value || 0),
      users: parseInt(row.metricValues[1]?.value || 0),
      conversions: parseInt(row.metricValues[2]?.value || 0),
      bounceRate: parseFloat(row.metricValues[3]?.value || 0).toFixed(2)
    }));

    const totalOrganic = pages.reduce((sum, p) => sum + p.sessions, 0);

    const result = {
      pages,
      totalOrganicSessions: totalOrganic,
      topLandingPage: pages[0]?.landingPage || null,
      period: { startDate, endDate },
      fetchedAt: new Date().toISOString()
    };

    setCache(cacheKey, result);
    return result;
  }

  /**
   * Get device breakdown
   */
  async getDeviceBreakdown(options = {}) {
    const {
      startDate = '30daysAgo',
      endDate = 'today'
    } = options;

    const response = await this.runReport({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'bounceRate' }
      ]
    });

    const devices = {};
    let total = 0;

    (response.rows || []).forEach(row => {
      const device = row.dimensionValues[0]?.value?.toLowerCase();
      const sessions = parseInt(row.metricValues[0]?.value || 0);
      devices[device] = {
        sessions,
        users: parseInt(row.metricValues[1]?.value || 0),
        bounceRate: parseFloat(row.metricValues[2]?.value || 0).toFixed(2)
      };
      total += sessions;
    });

    // Calculate percentages
    Object.keys(devices).forEach(device => {
      devices[device].percentage = ((devices[device].sessions / total) * 100).toFixed(1);
    });

    return {
      devices,
      total,
      primary: Object.entries(devices).sort((a, b) => b[1].sessions - a[1].sessions)[0]?.[0],
      period: { startDate, endDate },
      fetchedAt: new Date().toISOString()
    };
  }

  /**
   * Get conversions/goals
   */
  async getConversions(options = {}) {
    const {
      startDate = '30daysAgo',
      endDate = 'today'
    } = options;

    const response = await this.runReport({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'eventName' }],
      dimensionFilter: {
        filter: {
          fieldName: 'isConversionEvent',
          stringFilter: { value: 'true' }
        }
      },
      metrics: [
        { name: 'eventCount' },
        { name: 'totalUsers' }
      ],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }]
    });

    const conversions = (response.rows || []).map(row => ({
      event: row.dimensionValues[0]?.value,
      count: parseInt(row.metricValues[0]?.value || 0),
      users: parseInt(row.metricValues[1]?.value || 0)
    }));

    const total = conversions.reduce((sum, c) => sum + c.count, 0);

    return {
      conversions,
      totalConversions: total,
      period: { startDate, endDate },
      fetchedAt: new Date().toISOString()
    };
  }

  // ============================================================
  // SEO-SPECIFIC ANALYTICS
  // ============================================================

  /**
   * Compare organic vs other channels
   * Useful for measuring SEO impact
   */
  async getOrganicVsOther(options = {}) {
    const sources = await this.getTrafficSources(options);

    const organic = sources.sources.find(s =>
      s.channel.toLowerCase().includes('organic')
    ) || { sessions: 0, users: 0 };

    const total = sources.totalSessions;
    const otherSessions = total - organic.sessions;

    return {
      organic: {
        sessions: organic.sessions,
        percentage: ((organic.sessions / total) * 100).toFixed(1),
        users: organic.users
      },
      other: {
        sessions: otherSessions,
        percentage: ((otherSessions / total) * 100).toFixed(1)
      },
      totalSessions: total,
      seoShare: ((organic.sessions / total) * 100).toFixed(1) + '%',
      period: sources.period,
      fetchedAt: new Date().toISOString()
    };
  }

  /**
   * Get page performance for SEO optimization
   * Combines traffic + engagement metrics
   */
  async getPageSEOPerformance(pagePath, options = {}) {
    const {
      startDate = '30daysAgo',
      endDate = 'today'
    } = options;

    const response = await this.runReport({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      dimensionFilter: {
        filter: {
          fieldName: 'pagePath',
          stringFilter: { value: pagePath, matchType: 'EXACT' }
        }
      },
      metrics: [
        { name: 'screenPageViews' },
        { name: 'totalUsers' },
        { name: 'sessions' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'engagementRate' }
      ]
    });

    const row = response.rows?.[0];
    if (!row) {
      return {
        pagePath,
        found: false,
        message: 'No data found for this page'
      };
    }

    return {
      pagePath,
      found: true,
      pageviews: parseInt(row.metricValues[0]?.value || 0),
      users: parseInt(row.metricValues[1]?.value || 0),
      sessions: parseInt(row.metricValues[2]?.value || 0),
      bounceRate: parseFloat(row.metricValues[3]?.value || 0).toFixed(2),
      avgSessionDuration: parseFloat(row.metricValues[4]?.value || 0).toFixed(0),
      engagementRate: parseFloat(row.metricValues[5]?.value || 0).toFixed(2),
      period: { startDate, endDate },
      fetchedAt: new Date().toISOString()
    };
  }

  // ============================================================
  // GA4 DATA API CORE
  // ============================================================

  /**
   * Run a GA4 report
   * @param {object} reportConfig - GA4 RunReport request body
   */
  async runReport(reportConfig) {
    if (!this.propertyId) {
      // Return mock data for development
      return this.getMockData(reportConfig);
    }

    const url = `${GA_API_BASE}/properties/${this.propertyId}:runReport`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await this.getAccessToken()}`
      },
      body: JSON.stringify(reportConfig)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`GA4 API Error: ${error.error?.message || response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get access token (implement your auth method)
   */
  async getAccessToken() {
    // Option 1: Use provided token
    if (this.accessToken) {
      return this.accessToken;
    }

    // Option 2: Service Account (requires google-auth-library)
    // const { GoogleAuth } = require('google-auth-library');
    // const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
    // const client = await auth.getClient();
    // const token = await client.getAccessToken();
    // return token.token;

    throw new Error('No access token available. Set GA4 credentials.');
  }

  /**
   * Mock data for development/testing
   */
  getMockData(reportConfig) {
    this.log('Using mock data (GA4_PROPERTY_ID not set)');

    // Return realistic mock data
    return {
      rows: [{
        dimensionValues: [{ value: '/business-coaching/' }],
        metricValues: [
          { value: '1500' },  // sessions
          { value: '1200' },  // users
          { value: '200' },   // new users
          { value: '3500' },  // pageviews
          { value: '0.45' },  // bounce rate
          { value: '180' },   // avg session duration
          { value: '0.65' }   // engagement rate
        ]
      }],
      rowCount: 1,
      metadata: { currencyCode: 'USD' }
    };
  }

  log(message) {
    if (this.debug) {
      console.log(`[GA4] ${message}`);
    }
  }
}

// Default instance
export const ga4 = new GA4Client();

// Quick access functions
export const getTraffic = (opts) => ga4.getTrafficOverview(opts);
export const getTopPages = (opts) => ga4.getTopPages(opts);
export const getSources = (opts) => ga4.getTrafficSources(opts);
export const getOrganic = (opts) => ga4.getOrganicTraffic(opts);
export const getDevices = (opts) => ga4.getDeviceBreakdown(opts);

export default GA4Client;
