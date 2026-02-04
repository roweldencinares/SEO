/**
 * NEXUS-Powered Deindex Recovery System
 *
 * Handles:
 * - Indexation drop detection from GSC
 * - Automated diagnostic checklist
 * - Recovery action triggers
 * - Alert notifications
 * - Recovery tracking and reporting
 */

import { nexusify } from './nexus/core.js';

// ============================================================================
// INDEXATION MONITORING
// ============================================================================

/**
 * Fetch current index coverage from Google Search Console
 */
const fetchIndexCoverage = nexusify(
  async (params) => {
    const { siteUrl, accessToken, startDate, endDate } = params;

    try {
      // Fetch index coverage data
      const response = await fetch(
        `https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inspectionUrl: siteUrl,
            siteUrl: siteUrl
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch index coverage');
      }

      const data = await response.json();

      return {
        siteUrl,
        indexStatus: data.inspectionResult?.indexStatusResult?.verdict,
        coverageState: data.inspectionResult?.indexStatusResult?.coverageState,
        robotsTxtState: data.inspectionResult?.indexStatusResult?.robotsTxtState,
        indexingState: data.inspectionResult?.indexStatusResult?.indexingState,
        lastCrawl: data.inspectionResult?.indexStatusResult?.lastCrawlTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        siteUrl,
        error: error.message,
        indexStatus: 'unknown'
      };
    }
  },
  {
    service: 'deindex-recovery',
    mode: 'STANDARD',
    cacheKey: null // Always fetch fresh
  }
);

/**
 * Compare current vs historical index coverage to detect drops
 */
const detectIndexationDrop = nexusify(
  async (params) => {
    const {
      currentCoverage,
      historicalCoverage,
      threshold = 0.20 // 20% drop threshold
    } = params;

    const dropPercentage = historicalCoverage > 0
      ? ((historicalCoverage - currentCoverage) / historicalCoverage)
      : 0;

    const hasDrop = dropPercentage >= threshold;

    const severity = dropPercentage >= 0.50 ? 'critical' :
                     dropPercentage >= 0.30 ? 'high' :
                     dropPercentage >= 0.20 ? 'medium' : 'low';

    return {
      hasDrop,
      dropPercentage: (dropPercentage * 100).toFixed(2),
      severity,
      currentCoverage,
      historicalCoverage,
      pagesLost: historicalCoverage - currentCoverage,
      needsAction: hasDrop
    };
  },
  {
    service: 'deindex-recovery',
    mode: 'LITE'
  }
);

// ============================================================================
// DIAGNOSTIC CHECKLIST
// ============================================================================

/**
 * Run automated diagnostic checklist
 */
const runDiagnostics = nexusify(
  async (params) => {
    const { siteUrl, accessToken } = params;

    const diagnostics = {
      robotsTxt: { status: 'checking', issues: [] },
      sitemap: { status: 'checking', issues: [] },
      canonical: { status: 'checking', issues: [] },
      noindex: { status: 'checking', issues: [] },
      crawlErrors: { status: 'checking', issues: [] },
      serverErrors: { status: 'checking', issues: [] }
    };

    // 1. Check robots.txt
    try {
      const robotsResponse = await fetch(`${siteUrl}/robots.txt`);
      const robotsContent = await robotsResponse.text();

      if (robotsContent.includes('Disallow: /')) {
        diagnostics.robotsTxt.issues.push('Site may be blocked from crawling');
        diagnostics.robotsTxt.status = 'warning';
      } else {
        diagnostics.robotsTxt.status = 'ok';
      }
    } catch (error) {
      diagnostics.robotsTxt.issues.push('Could not fetch robots.txt');
      diagnostics.robotsTxt.status = 'error';
    }

    // 2. Check sitemap accessibility
    try {
      const sitemapResponse = await fetch(`${siteUrl}/sitemap.xml`);
      if (sitemapResponse.ok) {
        diagnostics.sitemap.status = 'ok';
      } else {
        diagnostics.sitemap.issues.push('Sitemap not accessible');
        diagnostics.sitemap.status = 'error';
      }
    } catch (error) {
      diagnostics.sitemap.issues.push('Could not fetch sitemap');
      diagnostics.sitemap.status = 'error';
    }

    // 3. Check homepage for noindex tags
    try {
      const homeResponse = await fetch(siteUrl);
      const homeHtml = await homeResponse.text();

      if (homeHtml.match(/<meta[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex[^"']*["']/i)) {
        diagnostics.noindex.issues.push('Homepage has noindex meta tag');
        diagnostics.noindex.status = 'critical';
      } else {
        diagnostics.noindex.status = 'ok';
      }
    } catch (error) {
      diagnostics.noindex.issues.push('Could not check homepage');
      diagnostics.noindex.status = 'error';
    }

    // 4. Check for server errors
    try {
      const statusResponse = await fetch(siteUrl, { method: 'HEAD' });
      if (statusResponse.status >= 500) {
        diagnostics.serverErrors.issues.push(`Server returning ${statusResponse.status}`);
        diagnostics.serverErrors.status = 'critical';
      } else {
        diagnostics.serverErrors.status = 'ok';
      }
    } catch (error) {
      diagnostics.serverErrors.issues.push('Could not reach server');
      diagnostics.serverErrors.status = 'critical';
    }

    // Summary
    const criticalCount = Object.values(diagnostics).filter(d => d.status === 'critical').length;
    const errorCount = Object.values(diagnostics).filter(d => d.status === 'error').length;
    const warningCount = Object.values(diagnostics).filter(d => d.status === 'warning').length;

    return {
      siteUrl,
      diagnostics,
      summary: {
        critical: criticalCount,
        errors: errorCount,
        warnings: warningCount,
        overallHealth: criticalCount > 0 ? 'critical' : errorCount > 0 ? 'unhealthy' : 'healthy'
      },
      timestamp: new Date().toISOString()
    };
  },
  {
    service: 'deindex-recovery',
    mode: 'FULL'
  }
);

// ============================================================================
// RECOVERY ACTIONS
// ============================================================================

/**
 * Generate recovery action plan based on diagnostics
 */
const generateRecoveryPlan = nexusify(
  async (diagnostics) => {
    const actions = [];

    // Robots.txt issues
    if (diagnostics.robotsTxt.status !== 'ok') {
      actions.push({
        priority: 'critical',
        action: 'fix_robots_txt',
        title: 'Fix robots.txt blocking',
        description: 'Remove or correct Disallow rules that block crawling',
        steps: [
          'Review robots.txt file',
          'Remove "Disallow: /" if present',
          'Ensure Googlebot is allowed',
          'Resubmit for crawling'
        ]
      });
    }

    // Sitemap issues
    if (diagnostics.sitemap.status !== 'ok') {
      actions.push({
        priority: 'high',
        action: 'fix_sitemap',
        title: 'Fix sitemap accessibility',
        description: 'Ensure sitemap.xml is accessible and properly formatted',
        steps: [
          'Verify sitemap.xml exists at root',
          'Check XML formatting',
          'Resubmit to GSC and Bing',
          'Verify submission in webmaster tools'
        ]
      });
    }

    // Noindex issues
    if (diagnostics.noindex.status === 'critical') {
      actions.push({
        priority: 'critical',
        action: 'remove_noindex',
        title: 'Remove noindex tags',
        description: 'Critical: Homepage or key pages have noindex tags',
        steps: [
          'Identify all pages with noindex tags',
          'Remove noindex from production pages',
          'Keep noindex only on admin/draft pages',
          'Request re-indexing via GSC'
        ]
      });
    }

    // Server errors
    if (diagnostics.serverErrors.status === 'critical') {
      actions.push({
        priority: 'critical',
        action: 'fix_server_errors',
        title: 'Resolve server errors',
        description: 'Site is returning 5xx errors',
        steps: [
          'Check server logs',
          'Identify error source',
          'Fix server configuration or code',
          'Monitor uptime'
        ]
      });
    }

    // Canonical issues
    if (diagnostics.canonical?.status !== 'ok') {
      actions.push({
        priority: 'medium',
        action: 'fix_canonical',
        title: 'Fix canonical tag issues',
        description: 'Canonical tags may be pointing to wrong URLs',
        steps: [
          'Audit all canonical tags',
          'Ensure self-referencing canonicals',
          'Fix any cross-domain canonical issues',
          'Use HTTPS in canonical URLs'
        ]
      });
    }

    // General recovery actions
    actions.push({
      priority: 'high',
      action: 'request_reindex',
      title: 'Request re-indexing',
      description: 'Ask Google to recrawl and re-index',
      steps: [
        'Go to Google Search Console',
        'Use URL Inspection tool',
        'Request indexing for key pages',
        'Submit updated sitemap'
      ]
    });

    return {
      actions: actions.sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }),
      estimatedRecoveryTime: actions.some(a => a.priority === 'critical') ? '2-4 weeks' : '1-2 weeks',
      timestamp: new Date().toISOString()
    };
  },
  {
    service: 'deindex-recovery',
    mode: 'STANDARD'
  }
);

/**
 * Execute automated recovery actions
 */
const executeRecoveryAction = nexusify(
  async (params) => {
    const { action, siteUrl, accessToken } = params;

    const result = {
      action,
      executed: false,
      steps: []
    };

    try {
      switch (action) {
        case 'request_reindex':
          // Request indexing via GSC API
          const indexResponse = await fetch(
            `https://indexing.googleapis.com/v3/urlNotifications:publish`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                url: siteUrl,
                type: 'URL_UPDATED'
              })
            }
          );

          if (indexResponse.ok) {
            result.executed = true;
            result.steps.push('Successfully requested re-indexing via GSC');
          } else {
            result.steps.push('Failed to request re-indexing');
          }
          break;

        case 'fix_robots_txt':
          result.steps.push('Manual action required: Review and fix robots.txt');
          break;

        case 'fix_sitemap':
          result.steps.push('Manual action required: Fix sitemap accessibility');
          break;

        case 'remove_noindex':
          result.steps.push('Manual action required: Remove noindex tags from production pages');
          break;

        case 'fix_server_errors':
          result.steps.push('Manual action required: Resolve server errors');
          break;

        default:
          result.steps.push('Unknown action type');
      }

      return result;
    } catch (error) {
      result.error = error.message;
      return result;
    }
  },
  {
    service: 'deindex-recovery',
    mode: 'FULL'
  }
);

// ============================================================================
// MONITORING & ALERTS
// ============================================================================

/**
 * Generate deindexation alert
 */
const generateAlert = nexusify(
  async (params) => {
    const { dropData, diagnostics, recoveryPlan } = params;

    const alert = {
      severity: dropData.severity,
      title: `Indexation Drop Detected: ${dropData.dropPercentage}%`,
      message: `Your site has lost ${dropData.pagesLost} indexed pages (${dropData.dropPercentage}% drop)`,
      currentCoverage: dropData.currentCoverage,
      historicalCoverage: dropData.historicalCoverage,
      criticalIssues: diagnostics?.data?.summary?.critical || diagnostics?.summary?.critical || 0,
      immediateActions: recoveryPlan.actions.filter(a => a.priority === 'critical'),
      estimatedRecoveryTime: recoveryPlan.estimatedRecoveryTime,
      alertedAt: new Date().toISOString()
    };

    return alert;
  },
  {
    service: 'deindex-recovery',
    mode: 'STANDARD'
  }
);

/**
 * Track recovery progress over time
 */
const trackRecoveryProgress = nexusify(
  async (params) => {
    const { siteUrl, baselineCoverage, checkpoints = [] } = params;

    // Calculate recovery percentage
    const latestCheckpoint = checkpoints[checkpoints.length - 1];
    const currentCoverage = latestCheckpoint?.coverage || 0;

    const recoveryPercentage = baselineCoverage > 0
      ? ((currentCoverage - checkpoints[0]?.coverage) / (baselineCoverage - checkpoints[0]?.coverage)) * 100
      : 0;

    // Determine recovery status
    const status = currentCoverage >= baselineCoverage * 0.95 ? 'recovered' :
                   recoveryPercentage > 50 ? 'recovering' :
                   recoveryPercentage > 0 ? 'partial_recovery' : 'no_progress';

    return {
      siteUrl,
      baselineCoverage,
      currentCoverage,
      recoveryPercentage: Math.max(0, recoveryPercentage).toFixed(2),
      status,
      checkpoints: checkpoints.length,
      daysInRecovery: checkpoints.length > 0
        ? Math.ceil((new Date() - new Date(checkpoints[0].date)) / (1000 * 60 * 60 * 24))
        : 0,
      trend: checkpoints.length >= 2
        ? checkpoints[checkpoints.length - 1].coverage > checkpoints[checkpoints.length - 2].coverage
          ? 'improving'
          : 'declining'
        : 'unknown'
    };
  },
  {
    service: 'deindex-recovery',
    mode: 'STANDARD'
  }
);

/**
 * Generate weekly recovery report
 */
const generateRecoveryReport = nexusify(
  async (params) => {
    const { siteUrl, accessToken, historicalData } = params;

    // Run diagnostics
    const diagnostics = await runDiagnostics({
      input: { siteUrl, accessToken }
    });

    // Fetch current coverage
    const coverage = await fetchIndexCoverage({
      input: { siteUrl, accessToken }
    });

    // Check for drop
    const baseline = historicalData?.baseline || 0;
    const drop = await detectIndexationDrop({
      input: {
        currentCoverage: coverage.data.indexStatus === 'PASS' ? baseline : 0,
        historicalCoverage: baseline
      }
    });

    const report = {
      week: new Date().toISOString().split('T')[0],
      siteUrl,
      health: diagnostics.data.summary.overallHealth,
      indexStatus: coverage.data.indexStatus,
      dropDetected: drop.data.hasDrop,
      criticalIssues: diagnostics.data.summary.critical,
      recommendations: []
    };

    if (drop.data.hasDrop) {
      const plan = await generateRecoveryPlan({ input: diagnostics.data });
      report.recommendations = plan.data.actions.slice(0, 3);
    }

    return report;
  },
  {
    service: 'deindex-recovery',
    mode: 'FULL'
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export {
  fetchIndexCoverage,
  detectIndexationDrop,
  runDiagnostics,
  generateRecoveryPlan,
  executeRecoveryAction,
  generateAlert,
  trackRecoveryProgress,
  generateRecoveryReport
};

export default {
  fetchIndexCoverage,
  detectIndexationDrop,
  runDiagnostics,
  generateRecoveryPlan,
  executeRecoveryAction,
  generateAlert,
  trackRecoveryProgress,
  generateRecoveryReport
};
