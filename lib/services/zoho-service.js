/**
 * Zoho CRM Service - NEXUS Framework Integration
 *
 * Handles lead creation, scoring, and OAuth token management
 * with 9-layer NEXUS resilience framework
 */

import axios from 'axios';
import { nexusify } from '../nexus/core.js';

// Token cache (in-memory)
let zohoAccessToken = null;
let tokenExpiry = 0;

// ============================================================================
// PURE FUNCTIONS (No NEXUS needed - simple utilities)
// ============================================================================

/**
 * Calculate lead score based on form data
 * Score range: 0-100 (40-100 in practice)
 *
 * Scoring rules:
 * - Base: 40 points
 * - Corporate email: +20, Personal email: +5
 * - Valid phone: +15
 * - Message length: 5-20 points
 * - High-intent keywords: +3 each
 */
export function calculateLeadScore(formData) {
  let score = 40;

  // Email quality
  if (formData.email && formData.email.match(/@(gmail|yahoo|hotmail)/i)) {
    score += 5; // Personal email
  } else if (formData.email && !formData.email.match(/@(gmail|yahoo|hotmail)/i)) {
    score += 20; // Corporate email
  }

  // Phone validation
  if (formData.phone && formData.phone.length >= 10) {
    score += 15;
  }

  // Message quality
  if (formData.message) {
    const len = formData.message.length;
    if (len > 200) score += 20;
    else if (len > 100) score += 15;
    else if (len > 50) score += 10;
    else score += 5;
  }

  // High-intent keyword matching
  const keywords = [
    'executive', 'coaching', 'business', 'growth', 'strategy',
    'revenue', 'consulting', 'leadership', 'help', 'interested',
    'schedule', 'meeting', 'call', 'discuss', 'hire'
  ];
  const matches = keywords.filter(kw =>
    (formData.message || '').toLowerCase().includes(kw)
  ).length;
  score += matches * 3;

  return Math.min(score, 100);
}

/**
 * Check if lead should be added to Zoho CRM
 *
 * Criteria:
 * - Lead score >= 50 (quality threshold)
 * - Valid email address
 * - Not spam keywords
 */
export function shouldAddToZoho(leadScore, formData) {
  // Score threshold
  if (leadScore < 50) {
    return false;
  }

  // Spam detection
  const spamKeywords = ['test', 'testing', 'asdf', 'qwerty'];
  if (spamKeywords.some(s => (formData.message || '').toLowerCase().includes(s))) {
    return false;
  }

  // Email validation
  if (!formData.email || !formData.email.includes('@')) {
    return false;
  }

  return true;
}

// ============================================================================
// NEXUS-WRAPPED OPERATIONS
// ============================================================================

/**
 * Get Zoho OAuth access token with automatic refresh
 *
 * NEXUS-LITE mode (simple token refresh, predictive caching)
 * - Cache: 55 minutes (before 60min expiry)
 * - Fallback 1: Return cached token even if expired (grace period)
 * - Fallback 2: Return null and log error
 * - Fallback 3: Throw error for upstream handling
 */
const _getZohoAccessTokenCore = async (input) => {
  console.log('🔐 getZohoAccessToken called:', {
    cachedToken: zohoAccessToken ? 'exists' : 'null',
    tokenExpiry: tokenExpiry,
    now: Date.now()
  });

  // Read credentials from environment
  const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
  const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
  const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;

  console.log('🔑 Environment check:', {
    hasClientId: !!ZOHO_CLIENT_ID,
    hasClientSecret: !!ZOHO_CLIENT_SECRET,
    hasRefreshToken: !!ZOHO_REFRESH_TOKEN,
    clientIdLength: ZOHO_CLIENT_ID?.length || 0,
    secretLength: ZOHO_CLIENT_SECRET?.length || 0,
    refreshLength: ZOHO_REFRESH_TOKEN?.length || 0
  });

  // Check cache AFTER reading env vars
  if (zohoAccessToken && tokenExpiry && Date.now() < tokenExpiry) {
    console.log('✅ Using cached token');
    return { token: zohoAccessToken, cached: true };
  }

  console.log('🔄 Refreshing Zoho token...');

  // Call Zoho OAuth endpoint
  const response = await axios.post(
    'https://accounts.zoho.com/oauth/v2/token',
    null,
    {
      params: {
        refresh_token: ZOHO_REFRESH_TOKEN,
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token'
      }
    }
  );

  // Update cache
  zohoAccessToken = response.data.access_token;
  tokenExpiry = Date.now() + (55 * 60 * 1000); // 55 minutes

  console.log('✅ Zoho token refreshed successfully');
  return { token: zohoAccessToken, cached: false };
};

export const getZohoAccessToken = nexusify(_getZohoAccessTokenCore, {
  service: 'zoho-oauth-token',
  mode: 'LITE', // Simple token refresh
  cacheKey: null, // Use custom caching (zohoAccessToken variable)
  cacheTTL: 3300 // 55 minutes
});

/**
 * Create lead in Zoho CRM with automatic scoring and validation
 *
 * NEXUS-STANDARD mode (production-critical operation)
 * - Validation: Email format, name parsing, lead score
 * - Healing: Token refresh retry, graceful degradation
 * - Monitoring: Track lead creation success rates
 * - NO CACHE (leads must be unique)
 */
const _createLeadInZohoCore = async (input) => {
  const { formData, leadScore } = input._nexus ? input : { formData: input.formData, leadScore: input.leadScore };

  console.log('🎯 createLeadInZoho called');

  // Step 1: Get access token
  let tokenResult;
  try {
    tokenResult = await getZohoAccessToken({ refresh: true });
  } catch (tokenError) {
    console.error('🔥 ERROR calling getZohoAccessToken():', tokenError.message);
    throw tokenError;
  }

  const token = tokenResult.success ? tokenResult.data.token : tokenResult.token;

  console.log('🔐 Token received:', {
    tokenExists: !!token,
    tokenType: typeof token,
    tokenLength: token?.length || 0,
    tokenPreview: token ? `${token.substring(0, 10)}...` : 'null/undefined'
  });

  if (!token) {
    const errMsg = '🚨 CRITICAL: Token is null/undefined after calling getZohoAccessToken()';
    console.error(errMsg);
    throw new Error(errMsg);
  }

  // Step 2: Parse name
  const nameParts = (formData.name || '').trim().split(' ');
  const firstName = nameParts[0] || 'Unknown';
  const lastName = nameParts.slice(1).join(' ') || '.';

  // Step 3: Build lead data
  const leadPriority = leadScore >= 75 ? 'High' : leadScore >= 60 ? 'Medium' : 'Normal';
  const leadData = {
    data: [{
      First_Name: firstName,
      Last_Name: lastName,
      Email: formData.email,
      Phone: formData.phone || 'Not Provided',
      Company: formData.company || 'Individual',
      Lead_Source: 'Website Contact Form',
      Lead_Status: 'Not Contacted',
      Description: `${formData.message || 'No message'}\n\n[Lead Score: ${leadScore}/100 | Priority: ${leadPriority} | Submitted: ${new Date().toLocaleString()}]`
    }]
  };

  console.log('📤 Sending to Zoho CRM...');

  // Step 4: Create lead via API
  const response = await axios.post(
    'https://www.zohoapis.com/crm/v2/Leads',
    leadData,
    {
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  // Step 5: Validate response
  if (response.data && response.data.data && response.data.data.length > 0) {
    const leadId = response.data.data[0].details.id;
    console.log(`✅ Lead created: ${leadId} (Score: ${leadScore}/100)`);

    return {
      success: true,
      leadId,
      leadScore,
      priority: leadPriority,
      firstName,
      lastName
    };
  }

  throw new Error('No lead data returned from Zoho API');
};

export const createLeadInZoho = nexusify(_createLeadInZohoCore, {
  service: 'zoho-lead-creation',
  mode: 'STANDARD', // Production-critical
  cacheKey: null, // Never cache lead creation!
  cacheTTL: 0
});

/**
 * Check Zoho CRM connectivity and authentication status
 *
 * NEXUS-LITE mode (health check)
 * - Cache: 5 minutes (reduce API calls)
 * - Fallback: Return last known status
 */
const _checkZohoStatusCore = async (input) => {
  try {
    const tokenResult = await getZohoAccessToken({ refresh: false });
    const token = tokenResult.success ? tokenResult.data.token : tokenResult.token;

    if (!token) {
      return {
        connected: false,
        authenticated: false,
        message: 'No access token available'
      };
    }

    // Test API call to Zoho (lightweight endpoint)
    const response = await axios.get(
      'https://www.zohoapis.com/crm/v2/settings/modules',
      {
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`
        }
      }
    );

    return {
      connected: true,
      authenticated: response.status === 200,
      modules: response.data.modules?.length || 0,
      message: 'Zoho CRM connected successfully'
    };
  } catch (error) {
    return {
      connected: false,
      authenticated: false,
      error: error.message,
      message: 'Failed to connect to Zoho CRM'
    };
  }
};

export const checkZohoStatus = nexusify(_checkZohoStatusCore, {
  service: 'zoho-status-check',
  mode: 'LITE',
  cacheKey: 'zoho-status',
  cacheTTL: 300 // 5 minutes
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // NEXUS-wrapped operations
  getZohoAccessToken,
  createLeadInZoho,
  checkZohoStatus,

  // Pure functions (no NEXUS)
  calculateLeadScore,
  shouldAddToZoho
};
