/**
 * Canonical Tag Audit & Implementation System
 * Detects and fixes canonical tag issues across WordPress site
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { headers, WORDPRESS_URL } from '../wp-api.js';

// ============================================================================
// CANONICAL AUDIT FUNCTIONS
// ============================================================================

/**
 * Audit all pages for canonical tag issues
 * @param {string} siteUrl - Base URL to audit
 * @param {Array} pageUrls - Optional list of URLs (will fetch if not provided)
 * @returns {Promise<Object>} Audit results
 */
export async function auditCanonicals(siteUrl, pageUrls = null) {
  console.log('[Canonical Audit] Starting audit...');

  //  L1: SCAN - Get list of pages to audit
  const urls = pageUrls || await getPageUrlsFromWordPress();

  const results = {
    total: urls.length,
    issues: [],
    summary: {
      missing: 0,
      incorrect: 0,
      chains: 0,
      nonSelfReferencing: 0,
      valid: 0
    }
  };

  // L2: ANALYZE - Check each page
  for (const url of urls) {
    try {
      const check = await checkCanonical(url);

      if (check.issues.length > 0) {
        results.issues.push({
          url,
          ...check
        });

        // Categorize issues
        check.issues.forEach(issue => {
          if (issue.includes('missing')) results.summary.missing++;
          if (issue.includes('incorrect') || issue.includes('non-self-referencing')) {
            results.summary.nonSelfReferencing++;
          }
          if (issue.includes('chain')) results.summary.chains++;
        });
      } else {
        results.summary.valid++;
      }

    } catch (error) {
      results.issues.push({
        url,
        issues: [`Error checking URL: ${error.message}`],
        severity: 'error'
      });
    }
  }

  console.log(`[Canonical Audit] Complete: ${results.summary.valid} valid, ${results.issues.length} with issues`);

  return results;
}

/**
 * Check canonical tag on a single page
 * @param {string} url - Page URL to check
 * @returns {Promise<Object>} Check results
 */
export async function checkCanonical(url) {
  const response = await axios.get(url, {
    timeout: 10000,
    headers: {
      'User-Agent': 'SEO-Audit-Bot/1.0'
    }
  });

  const $ = cheerio.load(response.data);

  const canonicalTag = $('link[rel="canonical"]').attr('href');
  const issues = [];
  const warnings = [];

  // L3: TRANSFORM - Normalize URLs
  const normalizedUrl = normalizeUrl(url);
  const normalizedCanonical = canonicalTag ? normalizeUrl(canonicalTag) : null;

  // L4: GUARD - Check for issues
  if (!canonicalTag) {
    issues.push('missing_canonical');
  } else if (normalizedCanonical !== normalizedUrl) {
    issues.push('non_self_referencing_canonical');
    warnings.push(`Expected: ${normalizedUrl}, Found: ${normalizedCanonical}`);
  }

  // Check for canonical chains (canonical points to another page with different canonical)
  if (canonicalTag && normalizedCanonical !== normalizedUrl) {
    try {
      const canonicalPageCheck = await checkCanonicalSimple(canonicalTag);

      if (canonicalPageCheck.canonical && normalizeUrl(canonicalPageCheck.canonical) !== normalizedCanonical) {
        issues.push('canonical_chain');
        warnings.push(`Chain detected: ${url} → ${canonicalTag} → ${canonicalPageCheck.canonical}`);
      }
    } catch (error) {
      warnings.push(`Could not verify canonical chain: ${error.message}`);
    }
  }

  // Check for HTTPS/HTTP mismatch
  if (canonicalTag && url.startsWith('https://') && canonicalTag.startsWith('http://')) {
    issues.push('http_https_mismatch');
    warnings.push('Canonical uses HTTP while page is HTTPS');
  }

  return {
    canonical: canonicalTag,
    issues,
    warnings,
    severity: issues.length > 0 ? (issues.includes('canonical_chain') ? 'critical' : 'high') : 'none'
  };
}

/**
 * Quick canonical check (doesn't recurse)
 * @param {string} url - URL to check
 * @returns {Promise<Object>} Canonical URL
 */
async function checkCanonicalSimple(url) {
  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'User-Agent': 'SEO-Audit-Bot/1.0' }
    });

    const $ = cheerio.load(response.data);
    return { canonical: $('link[rel="canonical"]').attr('href') };
  } catch (error) {
    return { canonical: null };
  }
}

/**
 * Normalize URL for comparison
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);

    // Remove trailing slash
    let path = parsed.pathname;
    if (path.endsWith('/') && path.length > 1) {
      path = path.slice(0, -1);
    }

    // Remove default ports
    const port = (parsed.port === '80' || parsed.port === '443') ? '' : `:${parsed.port}`;

    // Lowercase domain
    const domain = parsed.hostname.toLowerCase();

    return `${parsed.protocol}//${domain}${port}${path}${parsed.search}`;
  } catch (error) {
    return url;
  }
}

// ============================================================================
// WORDPRESS INTEGRATION
// ============================================================================

/**
 * Get all page URLs from WordPress
 * @returns {Promise<Array>} List of URLs
 */
async function getPageUrlsFromWordPress() {
  const urls = [];

  // Get pages
  const pagesResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/pages?per_page=100`, {
    headers
  });

  urls.push(...pagesResponse.data.map(p => p.link));

  // Get posts
  const postsResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100`, {
    headers
  });

  urls.push(...postsResponse.data.map(p => p.link));

  return urls;
}

/**
 * Add canonical tag to WordPress page
 * @param {number} pageId - Page ID
 * @param {string} canonicalUrl - Canonical URL
 * @returns {Promise<Object>} Result
 */
export async function addCanonicalToPage(pageId, canonicalUrl) {
  try {
    // Using Yoast SEO or Rank Math meta fields
    const response = await axios.post(
      `${WORDPRESS_URL}/wp-json/wp/v2/pages/${pageId}`,
      {
        meta: {
          _yoast_wpseo_canonical: canonicalUrl, // Yoast
          rank_math_canonical_url: canonicalUrl  // Rank Math
        }
      },
      { headers }
    );

    return {
      success: true,
      pageId,
      canonical: canonicalUrl
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Auto-fix canonical issues
 * @param {Array} issues - Issues from audit
 * @returns {Promise<Array>} Fix results
 */
export async function autoFixCanonicalIssues(issues) {
  const results = [];

  for (const issue of issues) {
    if (issue.issues.includes('missing_canonical') || issue.issues.includes('non_self_referencing_canonical')) {
      // Get page ID from URL
      const pageId = await getPageIdFromUrl(issue.url);

      if (pageId) {
        const fix = await addCanonicalToPage(pageId, issue.url);
        results.push({
          url: issue.url,
          pageId,
          fixed: fix.success,
          action: 'added_canonical'
        });
      } else {
        results.push({
          url: issue.url,
          fixed: false,
          error: 'Could not find page ID'
        });
      }
    }
  }

  return results;
}

/**
 * Get WordPress page ID from URL
 * @param {string} url - Page URL
 * @returns {Promise<number|null>} Page ID
 */
async function getPageIdFromUrl(url) {
  try {
    // Try pages first
    const pagesResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/pages?per_page=100`, {
      headers
    });

    const page = pagesResponse.data.find(p => normalizeUrl(p.link) === normalizeUrl(url));
    if (page) return page.id;

    // Try posts
    const postsResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100`, {
      headers
    });

    const post = postsResponse.data.find(p => normalizeUrl(p.link) === normalizeUrl(url));
    if (post) return post.id;

    return null;
  } catch (error) {
    return null;
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  auditCanonicals,
  checkCanonical,
  addCanonicalToPage,
  autoFixCanonicalIssues
};
