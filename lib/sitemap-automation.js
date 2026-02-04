/**
 * NEXUS-Powered Sitemap Automation
 *
 * Handles:
 * - Automatic sitemap submission to Bing + Google
 * - Sitemap change detection
 * - Submission verification
 * - Weekly health checks
 */

import { nexusify } from './nexus/core.js';
import crypto from 'crypto';

// ============================================================================
// SITEMAP DETECTION
// ============================================================================

/**
 * Fetch and hash sitemap for change detection
 */
const fetchSitemapHash = nexusify(
  async (sitemapUrl) => {
    const response = await fetch(sitemapUrl);
    const content = await response.text();

    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // Extract URL count
    const urlMatches = content.match(/<loc>/g) || [];
    const urlCount = urlMatches.length;

    return {
      url: sitemapUrl,
      hash,
      urlCount,
      lastModified: response.headers.get('last-modified'),
      timestamp: new Date().toISOString()
    };
  },
  {
    service: 'sitemap-automation',
    mode: 'STANDARD',
    cacheKey: null // Always fetch fresh
  }
);

/**
 * Detect if sitemap has changed since last check
 */
const detectSitemapChanges = nexusify(
  async (params) => {
    const { sitemapUrl, previousHash } = params;

    const current = await fetchSitemapHash({ input: sitemapUrl });

    const hasChanged = previousHash && current.data.hash !== previousHash;

    return {
      changed: hasChanged,
      currentHash: current.data.hash,
      previousHash,
      urlCount: current.data.urlCount,
      needsSubmission: hasChanged || !previousHash
    };
  },
  {
    service: 'sitemap-automation',
    mode: 'LITE'
  }
);

// ============================================================================
// GOOGLE SEARCH CONSOLE SUBMISSION
// ============================================================================

/**
 * Submit sitemap to Google Search Console
 */
const submitToGoogle = nexusify(
  async (params) => {
    const { sitemapUrl, siteUrl, accessToken } = params;

    try {
      const response = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Submission failed');
      }

      return {
        success: true,
        platform: 'google',
        sitemapUrl,
        submittedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        platform: 'google',
        sitemapUrl,
        error: error.message
      };
    }
  },
  {
    service: 'sitemap-automation',
    mode: 'FULL'
  }
);

/**
 * Verify Google sitemap submission status
 */
const verifyGoogleSubmission = nexusify(
  async (params) => {
    const { sitemapUrl, siteUrl, accessToken } = params;

    try {
      const response = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Sitemap not found or not submitted');
      }

      const data = await response.json();

      return {
        platform: 'google',
        submitted: true,
        lastSubmitted: data.lastSubmitted,
        lastDownloaded: data.lastDownloaded,
        errors: data.errors || 0,
        warnings: data.warnings || 0,
        urlsSubmitted: data.contents?.[0]?.submitted || 0,
        urlsIndexed: data.contents?.[0]?.indexed || 0
      };
    } catch (error) {
      return {
        platform: 'google',
        submitted: false,
        error: error.message
      };
    }
  },
  {
    service: 'sitemap-automation',
    mode: 'STANDARD',
    cacheKey: null
  }
);

// ============================================================================
// BING WEBMASTER TOOLS SUBMISSION
// ============================================================================

/**
 * Submit sitemap to Bing Webmaster Tools
 */
const submitToBing = nexusify(
  async (params) => {
    const { sitemapUrl, siteUrl, apiKey } = params;

    try {
      const response = await fetch(
        `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            siteUrl: siteUrl,
            urlList: [sitemapUrl]
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.Message || 'Submission failed');
      }

      const data = await response.json();

      return {
        success: true,
        platform: 'bing',
        sitemapUrl,
        submittedAt: new Date().toISOString(),
        response: data
      };
    } catch (error) {
      return {
        success: false,
        platform: 'bing',
        sitemapUrl,
        error: error.message
      };
    }
  },
  {
    service: 'sitemap-automation',
    mode: 'FULL'
  }
);

/**
 * Get Bing sitemap status
 */
const verifyBingSubmission = nexusify(
  async (params) => {
    const { siteUrl, apiKey } = params;

    try {
      const response = await fetch(
        `https://ssl.bing.com/webmaster/api.svc/json/GetSitemaps?siteUrl=${encodeURIComponent(siteUrl)}&apikey=${apiKey}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch Bing sitemap status');
      }

      const data = await response.json();
      const sitemaps = data.d || [];

      return {
        platform: 'bing',
        submitted: sitemaps.length > 0,
        sitemaps: sitemaps.map(s => ({
          url: s.Url,
          lastSubmitted: s.LastSubmitDate,
          urlCount: s.UrlCount,
          status: s.Status
        }))
      };
    } catch (error) {
      return {
        platform: 'bing',
        submitted: false,
        error: error.message
      };
    }
  },
  {
    service: 'sitemap-automation',
    mode: 'STANDARD',
    cacheKey: null
  }
);

// ============================================================================
// UNIFIED SUBMISSION
// ============================================================================

/**
 * Submit sitemap to both Google and Bing
 */
const submitToAllPlatforms = nexusify(
  async (config) => {
    const {
      sitemapUrl,
      siteUrl,
      google: { accessToken } = {},
      bing: { apiKey } = {}
    } = config;

    const results = [];

    // Submit to Google
    if (accessToken) {
      const googleResult = await submitToGoogle({
        input: { sitemapUrl, siteUrl, accessToken }
      });
      results.push(googleResult.data);
    } else {
      results.push({
        success: false,
        platform: 'google',
        error: 'No access token provided'
      });
    }

    // Submit to Bing
    if (apiKey) {
      const bingResult = await submitToBing({
        input: { sitemapUrl, siteUrl, apiKey }
      });
      results.push(bingResult.data);
    } else {
      results.push({
        success: false,
        platform: 'bing',
        error: 'No API key provided'
      });
    }

    return {
      sitemapUrl,
      submissions: results,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      timestamp: new Date().toISOString()
    };
  },
  {
    service: 'sitemap-automation',
    mode: 'FULL'
  }
);

/**
 * Verify sitemap status on all platforms
 */
const verifyAllPlatforms = nexusify(
  async (config) => {
    const {
      sitemapUrl,
      siteUrl,
      google: { accessToken } = {},
      bing: { apiKey } = {}
    } = config;

    const results = [];

    // Verify Google
    if (accessToken) {
      const googleResult = await verifyGoogleSubmission({
        input: { sitemapUrl, siteUrl, accessToken }
      });
      results.push(googleResult.data);
    }

    // Verify Bing
    if (apiKey) {
      const bingResult = await verifyBingSubmission({
        input: { siteUrl, apiKey }
      });
      results.push(bingResult.data);
    }

    return {
      sitemapUrl,
      platforms: results,
      allSubmitted: results.every(r => r.submitted),
      timestamp: new Date().toISOString()
    };
  },
  {
    service: 'sitemap-automation',
    mode: 'STANDARD',
    cacheKey: 'sitemap-verification',
    cacheTTL: 3600 // Cache for 1 hour
  }
);

// ============================================================================
// AUTOMATED MONITORING
// ============================================================================

/**
 * Check if sitemap needs resubmission (for cron job)
 */
const checkResubmissionNeeded = nexusify(
  async (config) => {
    const {
      sitemapUrl,
      previousHash,
      lastSubmitted,
      resubmitAfterDays = 7
    } = config;

    // Check for changes
    const changeCheck = await detectSitemapChanges({
      input: { sitemapUrl, previousHash }
    });

    // Check time-based resubmission
    const daysSinceSubmission = lastSubmitted
      ? (Date.now() - new Date(lastSubmitted).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    const timeBasedResubmit = daysSinceSubmission >= resubmitAfterDays;

    const needsResubmission = changeCheck.data.needsSubmission || timeBasedResubmit;

    return {
      needsResubmission,
      reasons: [
        changeCheck.data.changed && 'Sitemap content changed',
        !previousHash && 'First submission',
        timeBasedResubmit && `${Math.floor(daysSinceSubmission)} days since last submission`
      ].filter(Boolean),
      currentHash: changeCheck.data.currentHash,
      urlCount: changeCheck.data.urlCount
    };
  },
  {
    service: 'sitemap-automation',
    mode: 'STANDARD'
  }
);

/**
 * Weekly health report for sitemap submissions
 */
const generateWeeklyReport = nexusify(
  async (config) => {
    const { sitemapUrl, siteUrl, google, bing } = config;

    // Verify all platforms
    const verification = await verifyAllPlatforms({
      input: { sitemapUrl, siteUrl, google, bing }
    });

    // Get current sitemap hash
    const sitemapHash = await fetchSitemapHash({ input: sitemapUrl });

    const report = {
      week: new Date().toISOString().split('T')[0],
      sitemapUrl,
      urlCount: sitemapHash.data.urlCount,
      platforms: verification.data.platforms,
      health: verification.data.allSubmitted ? 'healthy' : 'issues_detected',
      recommendations: []
    };

    // Add recommendations
    verification.data.platforms.forEach(platform => {
      if (!platform.submitted) {
        report.recommendations.push({
          platform: platform.platform,
          action: 'submit',
          reason: platform.error || 'Not submitted'
        });
      }

      if (platform.errors > 0) {
        report.recommendations.push({
          platform: platform.platform,
          action: 'fix_errors',
          reason: `${platform.errors} errors detected`
        });
      }

      if (platform.urlsIndexed && platform.urlsSubmitted) {
        const indexRate = (platform.urlsIndexed / platform.urlsSubmitted) * 100;
        if (indexRate < 80) {
          report.recommendations.push({
            platform: platform.platform,
            action: 'investigate_indexation',
            reason: `Only ${indexRate.toFixed(1)}% of URLs indexed`
          });
        }
      }
    });

    return report;
  },
  {
    service: 'sitemap-automation',
    mode: 'FULL'
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export {
  fetchSitemapHash,
  detectSitemapChanges,
  submitToGoogle,
  verifyGoogleSubmission,
  submitToBing,
  verifyBingSubmission,
  submitToAllPlatforms,
  verifyAllPlatforms,
  checkResubmissionNeeded,
  generateWeeklyReport
};

export default {
  fetchSitemapHash,
  detectSitemapChanges,
  submitToGoogle,
  verifyGoogleSubmission,
  submitToBing,
  verifyBingSubmission,
  submitToAllPlatforms,
  verifyAllPlatforms,
  checkResubmissionNeeded,
  generateWeeklyReport
};
