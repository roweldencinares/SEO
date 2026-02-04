/**
 * Google Analytics 4 Service - NEXUS Framework Integration
 *
 * Handles GA4 Data API queries for real-time data, reports, and summary metrics
 * with intelligent caching and performance optimization
 */

import { google } from 'googleapis';
import fs from 'fs';
import { nexusify } from '../nexus/core.js';

// ============================================================================
// GA4 CLIENT INITIALIZATION
// ============================================================================

/**
 * Initialize Google Analytics Data API client
 *
 * Supports two modes:
 * 1. Base64 encoded credentials (Vercel/Production)
 * 2. File-based credentials (Local development)
 */
export async function initializeGA4Client() {
  try {
    const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID;
    const GA4_CREDENTIALS_PATH = process.env.GA4_CREDENTIALS_JSON || './google-analytics-credentials.json';
    const GA4_CREDENTIALS_BASE64 = process.env.GA4_CREDENTIALS_JSON_BASE64;

    console.log('🔍 Checking GA4 setup:', {
      hasPropertyId: !!GA4_PROPERTY_ID,
      propertyId: GA4_PROPERTY_ID,
      credentialsPath: GA4_CREDENTIALS_PATH,
      fileExists: fs.existsSync(GA4_CREDENTIALS_PATH),
      hasBase64Creds: !!GA4_CREDENTIALS_BASE64
    });

    let auth;

    // Option 1: Use base64 encoded credentials (Vercel)
    if (GA4_PROPERTY_ID && GA4_CREDENTIALS_BASE64) {
      console.log('📦 Using base64 encoded credentials from environment');
      const credentials = JSON.parse(
        Buffer.from(GA4_CREDENTIALS_BASE64, 'base64').toString('utf-8')
      );
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
      });
    }
    // Option 2: Use credentials file (Local)
    else if (GA4_PROPERTY_ID && fs.existsSync(GA4_CREDENTIALS_PATH)) {
      console.log('📁 Using credentials file from disk');
      auth = new google.auth.GoogleAuth({
        keyFile: GA4_CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
      });
    } else {
      console.log('⚠️ Google Analytics credentials not found');
      return null;
    }

    if (auth) {
      const analyticsDataClient = google.analyticsdata({ version: 'v1beta', auth });
      console.log('✅ Google Analytics Data API configured');

      // Test the connection
      try {
        const testResponse = await analyticsDataClient.properties.runReport({
          property: `properties/${GA4_PROPERTY_ID}`,
          requestBody: {
            dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
            metrics: [{ name: 'activeUsers' }]
          }
        });
        console.log('✅ GA4 API connection test successful!');
      } catch (testError) {
        console.error('⚠️ GA4 API test failed:', testError.message);
      }

      return analyticsDataClient;
    } else {
      console.log('⚠️ Google Analytics credentials not found or GA4_PROPERTY_ID not set');
      return null;
    }
  } catch (error) {
    console.error('❌ Error loading GA credentials:', error.message);
    return null;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validate GA4 client is initialized
 */
function validateGA4Client(analyticsDataClient) {
  if (!analyticsDataClient) {
    throw new Error('Google Analytics not configured');
  }
  return true;
}

// ============================================================================
// NEXUS-WRAPPED GA4 OPERATIONS
// ============================================================================

/**
 * Get GA4 real-time data (active users, page views)
 *
 * NEXUS-LITE mode (real-time data, short cache)
 * - Cache: 60 seconds (balance freshness vs API limits)
 * - Fallback: Return cached data or empty result
 *
 * @param {Object} input - { analyticsDataClient, propertyId, limit }
 */
const _getGA4RealtimeCore = async (input) => {
  const {
    analyticsDataClient,
    propertyId = process.env.GA4_PROPERTY_ID,
    limit = 10
  } = input._nexus ? input : input;

  // Validate client
  validateGA4Client(analyticsDataClient);

  const response = await analyticsDataClient.properties.runRealtimeReport({
    property: `properties/${propertyId}`,
    requestBody: {
      metrics: [
        { name: 'activeUsers' },
        { name: 'screenPageViews' }
      ],
      dimensions: [{ name: 'pagePath' }],
      limit: parseInt(limit)
    }
  });

  // Extract active users count
  let activeUsers = 0;
  let pageViews = 0;

  if (response.data.rows && response.data.rows.length > 0) {
    // Sum across all rows
    response.data.rows.forEach(row => {
      activeUsers += parseInt(row.metricValues[0].value || 0);
      pageViews += parseInt(row.metricValues[1].value || 0);
    });
  }

  console.log(`✅ GA4 Realtime: ${activeUsers} active users, ${pageViews} page views`);

  return {
    authenticated: true,
    success: true,
    summary: {
      activeUsers,
      pageViews
    },
    data: response.data,
    timestamp: new Date().toISOString()
  };
};

export const getGA4Realtime = nexusify(_getGA4RealtimeCore, {
  service: 'ga4-realtime',
  mode: 'LITE',
  cacheKey: 'ga4-realtime',
  cacheTTL: 60 // 1 minute (real-time data)
});

/**
 * Get GA4 analytics report (custom date range, metrics, dimensions)
 *
 * NEXUS-STANDARD mode
 * - Cache: 30 minutes (reduce API quota usage)
 * - Supports flexible querying
 *
 * @param {Object} input - { analyticsDataClient, propertyId, startDate, endDate, metrics, dimensions }
 */
const _getGA4ReportCore = async (input) => {
  const {
    analyticsDataClient,
    propertyId = process.env.GA4_PROPERTY_ID,
    startDate = '30daysAgo',
    endDate = 'today',
    metrics = 'sessions,totalUsers,screenPageViews',
    dimensions = 'date'
  } = input._nexus ? input : input;

  // Validate client
  validateGA4Client(analyticsDataClient);

  // Parse metrics and dimensions
  const metricsArray = metrics.split(',').map(m => ({ name: m.trim() }));
  const dimensionsArray = dimensions.split(',').map(d => ({ name: d.trim() }));

  const response = await analyticsDataClient.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      metrics: metricsArray,
      dimensions: dimensionsArray,
      orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }]
    }
  });

  const rowCount = response.data.rows?.length || 0;

  console.log(`✅ GA4 Report: ${rowCount} rows retrieved`);

  return {
    authenticated: true,
    success: true,
    data: response.data,
    rowCount,
    query: {
      startDate,
      endDate,
      metrics: metricsArray,
      dimensions: dimensionsArray
    }
  };
};

export const getGA4Report = nexusify(_getGA4ReportCore, {
  service: 'ga4-report',
  mode: 'STANDARD',
  cacheKey: null, // Dynamic based on query params
  cacheTTL: 1800 // 30 minutes
});

/**
 * Get GA4 summary metrics (sessions, users, pageviews, bounce rate, etc.)
 *
 * NEXUS-STANDARD mode
 * - Cache: 3 hours (summary data for dashboards)
 * - Provides aggregated metrics
 *
 * @param {Object} input - { analyticsDataClient, propertyId, days }
 */
const _getGA4SummaryCore = async (input) => {
  const {
    analyticsDataClient,
    propertyId = process.env.GA4_PROPERTY_ID,
    days = 30
  } = input._nexus ? input : input;

  // Validate client
  validateGA4Client(analyticsDataClient);

  const startDate = `${days}daysAgo`;

  const response = await analyticsDataClient.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate: 'today' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' },
        { name: 'bounceRate' }
      ]
    }
  });

  // Extract metrics
  const metrics = {};
  if (response.data.rows && response.data.rows[0]) {
    response.data.metricHeaders.forEach((header, index) => {
      metrics[header.name] = response.data.rows[0].metricValues[index].value;
    });
  }

  const summary = {
    sessions: parseInt(metrics.sessions || 0),
    users: parseInt(metrics.totalUsers || 0),
    pageViews: parseInt(metrics.screenPageViews || 0),
    avgSessionDuration: parseFloat(metrics.averageSessionDuration || 0).toFixed(2),
    bounceRate: parseFloat((metrics.bounceRate || 0) * 100).toFixed(2)
  };

  console.log(`✅ GA4 Summary: ${summary.sessions} sessions, ${summary.users} users`);

  return {
    authenticated: true,
    success: true,
    summary,
    dateRange: {
      startDate,
      endDate: 'today'
    }
  };
};

export const getGA4Summary = nexusify(_getGA4SummaryCore, {
  service: 'ga4-summary',
  mode: 'STANDARD',
  cacheKey: 'ga4-summary-30day',
  cacheTTL: 10800 // 3 hours
});

/**
 * Get GA4 top pages by traffic
 *
 * NEXUS-STANDARD mode
 * - Cache: 1 hour
 * - Returns most visited pages
 *
 * @param {Object} input - { analyticsDataClient, propertyId, days, limit }
 */
const _getGA4TopPagesCore = async (input) => {
  const {
    analyticsDataClient,
    propertyId = process.env.GA4_PROPERTY_ID,
    days = 30,
    limit = 10
  } = input._nexus ? input : input;

  // Validate client
  validateGA4Client(analyticsDataClient);

  const startDate = `${days}daysAgo`;

  const response = await analyticsDataClient.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate: 'today' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'activeUsers' }
      ],
      dimensions: [{ name: 'pagePath' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: parseInt(limit)
    }
  });

  // Transform rows
  const pages = (response.data.rows || []).map(row => ({
    pagePath: row.dimensionValues[0].value,
    pageViews: parseInt(row.metricValues[0].value || 0),
    users: parseInt(row.metricValues[1].value || 0)
  }));

  console.log(`✅ GA4 Top Pages: ${pages.length} pages retrieved`);

  return {
    authenticated: true,
    success: true,
    count: pages.length,
    pages,
    dateRange: {
      startDate,
      endDate: 'today'
    }
  };
};

export const getGA4TopPages = nexusify(_getGA4TopPagesCore, {
  service: 'ga4-top-pages',
  mode: 'STANDARD',
  cacheKey: 'ga4-top-pages-30day',
  cacheTTL: 3600 // 1 hour
});

/**
 * Check GA4 connectivity and authentication status
 *
 * NEXUS-LITE mode (health check)
 * - Cache: 10 minutes
 * - Returns authentication status
 *
 * @param {Object} input - { analyticsDataClient, propertyId }
 */
const _checkGA4StatusCore = async (input) => {
  const {
    analyticsDataClient,
    propertyId = process.env.GA4_PROPERTY_ID
  } = input._nexus ? input : input;

  if (!analyticsDataClient) {
    return {
      connected: false,
      authenticated: false,
      message: 'Google Analytics not configured'
    };
  }

  try {
    // Test API call
    const response = await analyticsDataClient.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [{ name: 'activeUsers' }]
      }
    });

    return {
      connected: true,
      authenticated: response.status === 200,
      propertyId,
      message: 'GA4 API connected successfully'
    };
  } catch (error) {
    return {
      connected: false,
      authenticated: false,
      error: error.message,
      message: 'Failed to connect to GA4 API'
    };
  }
};

export const checkGA4Status = nexusify(_checkGA4StatusCore, {
  service: 'ga4-status-check',
  mode: 'LITE',
  cacheKey: 'ga4-status',
  cacheTTL: 600 // 10 minutes
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // NEXUS-wrapped operations
  getGA4Realtime,
  getGA4Report,
  getGA4Summary,
  getGA4TopPages,
  checkGA4Status,

  // Utilities
  initializeGA4Client,
  validateGA4Client
};
