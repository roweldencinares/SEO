/**
 * Google Search Console Service - NEXUS Framework Integration
 *
 * Handles GSC API queries for keywords, pages, and summary metrics
 * with intelligent caching and rate limit protection
 */

import { google } from 'googleapis';
import { nexusify } from '../nexus/core.js';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get date string for X days ago in YYYY-MM-DD format
 */
function getDateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Validate OAuth client has valid credentials
 */
function validateOAuthClient(oauth2Client) {
  if (!oauth2Client) {
    throw new Error('OAuth client not configured');
  }

  if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
    throw new Error('Not authenticated - missing access token');
  }

  return true;
}

// ============================================================================
// NEXUS-WRAPPED GSC OPERATIONS
// ============================================================================

/**
 * Get top keywords from Google Search Console
 *
 * NEXUS-STANDARD mode
 * - Cache: 1 hour (GSC data updates slowly, avoid rate limits)
 * - Fallback 1: Return cached data even if stale
 * - Fallback 2: Return empty keywords array
 * - Rate limit protection: Google GSC has 100 queries/day per property
 *
 * @param {Object} input - { oauth2Client, siteUrl, limit, days }
 */
const _getGSCKeywordsCore = async (input) => {
  const {
    oauth2Client,
    siteUrl = 'sc-domain:example.com',
    limit = 100,
    days = 30
  } = input._nexus ? input : input;

  // Validate authentication
  validateOAuthClient(oauth2Client);

  const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });

  // Query GSC API
  const requestBody = {
    startDate: getDateDaysAgo(days),
    endDate: getDateDaysAgo(0),
    dimensions: ['query'],
    rowLimit: 25000 // Get all keywords first, then sort
  };

  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody
  });

  const rows = response.data.rows || [];

  // Transform and sort by best position (ascending)
  const keywords = rows
    .map(row => ({
      keyword: row.keys[0],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: ((row.ctr || 0) * 100).toFixed(2),
      position: (row.position || 0).toFixed(1),
      positionNum: row.position || 999 // For sorting
    }))
    .sort((a, b) => a.positionNum - b.positionNum) // Best ranking first
    .slice(0, parseInt(limit));

  console.log(`✅ Retrieved ${keywords.length} keywords from GSC`);

  return {
    authenticated: true,
    success: true,
    count: keywords.length,
    keywords,
    dateRange: {
      startDate: getDateDaysAgo(days),
      endDate: getDateDaysAgo(0)
    }
  };
};

export const getGSCKeywords = nexusify(_getGSCKeywordsCore, {
  service: 'gsc-keywords',
  mode: 'STANDARD',
  cacheKey: 'gsc-keywords-30day',
  cacheTTL: 3600 // 1 hour
});

/**
 * Get GSC summary metrics (total clicks, impressions, avg position, etc.)
 *
 * NEXUS-STANDARD mode
 * - Cache: 1 hour
 * - Provides dashboard overview metrics
 *
 * @param {Object} input - { oauth2Client, siteUrl, days }
 */
const _getGSCSummaryCore = async (input) => {
  const {
    oauth2Client,
    siteUrl = 'sc-domain:example.com',
    days = 30
  } = input._nexus ? input : input;

  // Validate authentication
  validateOAuthClient(oauth2Client);

  const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });

  // Query GSC API
  const requestBody = {
    startDate: getDateDaysAgo(days),
    endDate: getDateDaysAgo(0),
    dimensions: ['query'],
    rowLimit: 1000
  };

  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody
  });

  const rows = response.data.rows || [];

  // Calculate summary metrics
  let totalClicks = 0;
  let totalImpressions = 0;
  let totalPosition = 0;
  let top10Count = 0;

  rows.forEach(row => {
    totalClicks += row.clicks || 0;
    totalImpressions += row.impressions || 0;
    totalPosition += row.position || 0;
    if (row.position && row.position <= 10) {
      top10Count++;
    }
  });

  const avgPosition = rows.length > 0 ? (totalPosition / rows.length).toFixed(1) : 0;
  const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : 0;

  console.log(`✅ GSC Summary: ${totalClicks} clicks, ${totalImpressions} impressions`);

  return {
    authenticated: true,
    success: true,
    summary: {
      keywordsTracked: rows.length,
      top10Rankings: top10Count,
      avgPosition: parseFloat(avgPosition),
      totalClicks,
      totalImpressions,
      avgCTR: parseFloat(avgCTR)
    },
    dateRange: {
      startDate: getDateDaysAgo(days),
      endDate: getDateDaysAgo(0)
    }
  };
};

export const getGSCSummary = nexusify(_getGSCSummaryCore, {
  service: 'gsc-summary',
  mode: 'STANDARD',
  cacheKey: 'gsc-summary-30day',
  cacheTTL: 3600 // 1 hour
});

/**
 * Get top performing pages from GSC with trend comparison
 *
 * NEXUS-STANDARD mode
 * - Cache: 1 hour
 * - Compares current period vs previous period
 * - Shows growth trends
 *
 * @param {Object} input - { oauth2Client, siteUrl, limit }
 */
const _getGSCPagesCore = async (input) => {
  const {
    oauth2Client,
    siteUrl = 'sc-domain:example.com',
    limit = 10
  } = input._nexus ? input : input;

  // Validate authentication
  validateOAuthClient(oauth2Client);

  const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });

  // Get current period (last 30 days)
  const currentPeriod = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: getDateDaysAgo(30),
      endDate: getDateDaysAgo(0),
      dimensions: ['page'],
      rowLimit: parseInt(limit)
    }
  });

  // Get previous period (31-60 days ago) for trend comparison
  const previousPeriod = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: getDateDaysAgo(60),
      endDate: getDateDaysAgo(31),
      dimensions: ['page'],
      rowLimit: parseInt(limit)
    }
  });

  const currentRows = currentPeriod.data.rows || [];
  const previousMap = new Map();

  (previousPeriod.data.rows || []).forEach(row => {
    previousMap.set(row.keys[0], row);
  });

  // Transform and calculate trends
  const pages = currentRows.map(row => {
    const pageUrl = row.keys[0];
    const previous = previousMap.get(pageUrl);

    const clicksChange = previous
      ? (((row.clicks - previous.clicks) / previous.clicks) * 100).toFixed(1)
      : 0;

    return {
      page: pageUrl,
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: ((row.ctr || 0) * 100).toFixed(2),
      position: (row.position || 0).toFixed(1),
      trend: parseFloat(clicksChange)
    };
  });

  console.log(`✅ Retrieved ${pages.length} pages with trends from GSC`);

  return {
    authenticated: true,
    success: true,
    count: pages.length,
    pages,
    dateRange: {
      current: {
        startDate: getDateDaysAgo(30),
        endDate: getDateDaysAgo(0)
      },
      previous: {
        startDate: getDateDaysAgo(60),
        endDate: getDateDaysAgo(31)
      }
    }
  };
};

export const getGSCPages = nexusify(_getGSCPagesCore, {
  service: 'gsc-pages',
  mode: 'STANDARD',
  cacheKey: 'gsc-pages-30day',
  cacheTTL: 3600 // 1 hour
});

/**
 * Get list of verified sites in Search Console
 *
 * NEXUS-LITE mode (simple query)
 * - Cache: 24 hours (sites rarely change)
 *
 * @param {Object} input - { oauth2Client }
 */
const _getGSCSitesCore = async (input) => {
  const { oauth2Client } = input._nexus ? input : input;

  // Validate authentication
  validateOAuthClient(oauth2Client);

  const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });

  const response = await searchconsole.sites.list();
  const sites = response.data.siteEntry || [];

  console.log(`✅ Retrieved ${sites.length} verified sites from GSC`);

  return {
    authenticated: true,
    success: true,
    count: sites.length,
    sites: sites.map(site => ({
      siteUrl: site.siteUrl,
      permissionLevel: site.permissionLevel
    }))
  };
};

export const getGSCSites = nexusify(_getGSCSitesCore, {
  service: 'gsc-sites',
  mode: 'LITE',
  cacheKey: 'gsc-sites',
  cacheTTL: 86400 // 24 hours
});

/**
 * Get detailed analytics data from GSC (custom query)
 *
 * NEXUS-STANDARD mode
 * - Cache: 30 minutes
 * - Supports custom dimensions and date ranges
 *
 * @param {Object} input - { oauth2Client, siteUrl, dimensions, startDate, endDate, rowLimit }
 */
const _getGSCAnalyticsCore = async (input) => {
  const {
    oauth2Client,
    siteUrl = 'sc-domain:example.com',
    dimensions = ['query'],
    startDate = getDateDaysAgo(7),
    endDate = getDateDaysAgo(0),
    rowLimit = 1000
  } = input._nexus ? input : input;

  // Validate authentication
  validateOAuthClient(oauth2Client);

  const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });

  const requestBody = {
    startDate,
    endDate,
    dimensions,
    rowLimit
  };

  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody
  });

  const rows = response.data.rows || [];

  console.log(`✅ Retrieved ${rows.length} analytics rows from GSC`);

  return {
    authenticated: true,
    success: true,
    count: rows.length,
    rows: rows.map(row => ({
      keys: row.keys,
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: ((row.ctr || 0) * 100).toFixed(2),
      position: (row.position || 0).toFixed(1)
    })),
    query: {
      dimensions,
      startDate,
      endDate,
      rowLimit
    }
  };
};

export const getGSCAnalytics = nexusify(_getGSCAnalyticsCore, {
  service: 'gsc-analytics',
  mode: 'STANDARD',
  cacheKey: null, // Dynamic based on query params
  cacheTTL: 1800 // 30 minutes
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getGSCKeywords,
  getGSCSummary,
  getGSCPages,
  getGSCSites,
  getGSCAnalytics,

  // Utilities
  getDateDaysAgo,
  validateOAuthClient
};
