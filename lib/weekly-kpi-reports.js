/**
 * Weekly Indexation KPI Reports
 * Automated reporting system for SEO metrics
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// WEEKLY KPI TRACKER
// ============================================================================

export class WeeklyKPIReporter {
  constructor() {
    this.reportDir = path.join(__dirname, '../reports');

    // Create reports directory if it doesn't exist
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  /**
   * Generate weekly KPI report
   * @param {Object} data - Data sources (GSC, Bing, Schema audit, etc.)
   * @returns {Promise<Object>} Report data
   */
  async generateWeeklyReport(data) {
    const week = this.getWeekNumber();
    const today = new Date();

    const report = {
      week: week,
      date: today.toISOString().split('T')[0],
      timestamp: today,

      // INDEXATION METRICS
      indexation: {
        google: {
          totalIndexed: data.google?.indexed || 0,
          newThisWeek: data.google?.newThisWeek || 0,
          deindexedThisWeek: data.google?.deindexed || 0,
          coverage: data.google?.coverage || 'N/A',
          validPages: data.google?.validPages || 0,
          errors: data.google?.errors || 0
        },
        bing: {
          totalIndexed: data.bing?.indexed || 0,
          newThisWeek: data.bing?.newThisWeek || 0,
          deindexedThisWeek: data.bing?.deindexed || 0,
          coverage: data.bing?.coverage || 'N/A',
          crawledUrls: data.bing?.crawled || 0,
          blockedUrls: data.bing?.blocked || 0
        },
        gap: {
          count: (data.google?.indexed || 0) - (data.bing?.indexed || 0),
          percentage: this.calculatePercentage(
            (data.google?.indexed || 0) - (data.bing?.indexed || 0),
            data.google?.indexed || 1
          )
        }
      },

      // TECHNICAL HEALTH
      technicalHealth: {
        canonicalIssues: data.canonical?.issues || 0,
        missingCanonicals: data.canonical?.missing || 0,
        canonicalChains: data.canonical?.chains || 0,
        schemaErrors: data.schema?.errors || 0,
        missingSchema: data.schema?.missing || 0,
        validSchema: data.schema?.valid || 0,
        crawlErrors: (data.google?.errors || 0) + (data.bing?.errors || 0),
        robotsBlocked: data.bing?.blocked || 0,
        duplicateContent: data.duplicates || 0
      },

      // PERFORMANCE METRICS
      performance: {
        avgLoadTime: data.performance?.avgLoadTime || 'N/A',
        coreWebVitals: data.performance?.cwv || 'N/A',
        mobileUsability: data.performance?.mobile || 'N/A',
        pageSpeedScore: data.performance?.score || 'N/A'
      },

      // SEARCH PERFORMANCE (Google)
      searchPerformance: {
        clicks: data.gsc?.clicks || 0,
        impressions: data.gsc?.impressions || 0,
        ctr: data.gsc?.ctr || '0%',
        avgPosition: data.gsc?.position || 0,
        topQueries: data.gsc?.topQueries || [],
        topPages: data.gsc?.topPages || []
      },

      // WEEK-OVER-WEEK CHANGES
      weekOverWeek: this.calculateWeekOverWeek(data.previous, data.current),

      // RECOMMENDATIONS
      recommendations: this.generateRecommendations(data),

      // HEALTH SCORE (0-100)
      healthScore: this.calculateHealthScore(data)
    };

    // Save report
    const filename = `weekly-kpi-${week}-${today.toISOString().split('T')[0]}.json`;
    const filepath = path.join(this.reportDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));

    console.log(`[KPI Report] Saved to ${filename}`);

    return report;
  }

  /**
   * Calculate week-over-week changes
   */
  calculateWeekOverWeek(previous, current) {
    if (!previous || !current) {
      return {
        indexedPages: 'N/A',
        organicTraffic: 'N/A',
        avgPosition: 'N/A',
        schemaPages: 'N/A'
      };
    }

    return {
      indexedPages: this.formatChange(previous.indexed, current.indexed),
      organicTraffic: this.formatChange(previous.clicks, current.clicks),
      avgPosition: this.formatPositionChange(previous.position, current.position),
      schemaPages: this.formatChange(previous.schemaPages, current.schemaPages)
    };
  }

  /**
   * Format change as percentage
   */
  formatChange(oldVal, newVal) {
    if (!oldVal || oldVal === 0) return 'N/A';

    const change = ((newVal - oldVal) / oldVal) * 100;
    const sign = change > 0 ? '+' : '';

    return `${sign}${change.toFixed(1)}%`;
  }

  /**
   * Format position change (lower is better)
   */
  formatPositionChange(oldPos, newPos) {
    if (!oldPos || !newPos) return 'N/A';

    const change = oldPos - newPos; // Positive = improvement
    const sign = change > 0 ? '-' : '+';

    return `${sign}${Math.abs(change).toFixed(1)} (${change > 0 ? 'improved' : 'declined'})`;
  }

  /**
   * Calculate percentage
   */
  calculatePercentage(part, total) {
    if (!total || total === 0) return '0%';
    return `${((part / total) * 100).toFixed(1)}%`;
  }

  /**
   * Generate recommendations based on data
   */
  generateRecommendations(data) {
    const recommendations = [];

    // Indexation recommendations
    if (data.bing?.indexed < data.google?.indexed * 0.7) {
      recommendations.push({
        priority: 'high',
        category: 'indexation',
        issue: 'Bing indexation significantly lower than Google',
        action: 'Submit sitemap to Bing and verify robots.txt'
      });
    }

    // Canonical recommendations
    if (data.canonical?.issues > 10) {
      recommendations.push({
        priority: 'critical',
        category: 'technical',
        issue: `${data.canonical.issues} canonical tag issues detected`,
        action: 'Run canonical auto-fix script'
      });
    }

    // Schema recommendations
    if (data.schema?.missing > 20) {
      recommendations.push({
        priority: 'high',
        category: 'schema',
        issue: `${data.schema.missing} pages missing schema markup`,
        action: 'Add Organization, Service, and BlogPosting schemas'
      });
    }

    // Search performance recommendations
    if (data.gsc?.position > 20) {
      recommendations.push({
        priority: 'medium',
        category: 'rankings',
        issue: 'Average position above 20',
        action: 'Review and optimize on-page SEO for target keywords'
      });
    }

    // Core Web Vitals
    if (data.performance?.cwv === 'FAIL' || data.performance?.cwv === 'NEEDS_IMPROVEMENT') {
      recommendations.push({
        priority: 'high',
        category: 'performance',
        issue: 'Core Web Vitals need improvement',
        action: 'Optimize images, reduce JavaScript, improve LCP'
      });
    }

    return recommendations;
  }

  /**
   * Calculate overall health score (0-100)
   */
  calculateHealthScore(data) {
    let score = 100;

    // Indexation health (30 points)
    const coverage = parseFloat(data.google?.coverage) || 0;
    score -= (100 - coverage) * 0.3;

    // Technical health (30 points)
    const canonicalIssues = data.canonical?.issues || 0;
    if (canonicalIssues > 0) score -= Math.min(canonicalIssues / 2, 15);

    const schemaIssues = data.schema?.missing || 0;
    if (schemaIssues > 0) score -= Math.min(schemaIssues / 5, 15);

    // Performance (20 points)
    if (data.performance?.cwv === 'FAIL') score -= 20;
    else if (data.performance?.cwv === 'NEEDS_IMPROVEMENT') score -= 10;

    // Search performance (20 points)
    const position = data.gsc?.position || 50;
    if (position > 20) score -= Math.min((position - 20) / 2, 20);

    return Math.max(0, Math.round(score));
  }

  /**
   * Get week number of year
   */
  getWeekNumber() {
    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
    const pastDaysOfYear = (today - firstDayOfYear) / 86400000;

    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * Get latest report
   */
  getLatestReport() {
    try {
      const files = fs.readdirSync(this.reportDir)
        .filter(f => f.startsWith('weekly-kpi-'))
        .sort()
        .reverse();

      if (files.length === 0) return null;

      const latestFile = files[0];
      const content = fs.readFileSync(path.join(this.reportDir, latestFile), 'utf8');

      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get report history (last N reports)
   */
  getReportHistory(count = 10) {
    try {
      const files = fs.readdirSync(this.reportDir)
        .filter(f => f.startsWith('weekly-kpi-'))
        .sort()
        .reverse()
        .slice(0, count);

      return files.map(file => {
        const content = fs.readFileSync(path.join(this.reportDir, file), 'utf8');
        return JSON.parse(content);
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Generate text summary for email/Slack
   */
  generateTextSummary(report) {
    const lines = [
      `📊 WEEKLY SEO KPI REPORT - Week ${report.week}`,
      `Date: ${report.date}`,
      `Health Score: ${report.healthScore}/100 ${this.getHealthEmoji(report.healthScore)}`,
      '',
      '🔍 INDEXATION:',
      `  Google: ${report.indexation.google.totalIndexed} pages (${report.indexation.google.coverage} coverage)`,
      `  Bing: ${report.indexation.bing.totalIndexed} pages (${report.indexation.bing.coverage} coverage)`,
      `  Gap: ${report.indexation.gap.count} pages (${report.indexation.gap.percentage})`,
      '',
      '🔧 TECHNICAL HEALTH:',
      `  Canonical issues: ${report.technicalHealth.canonicalIssues}`,
      `  Schema errors: ${report.technicalHealth.schemaErrors}`,
      `  Crawl errors: ${report.technicalHealth.crawlErrors}`,
      '',
      '📈 SEARCH PERFORMANCE:',
      `  Clicks: ${report.searchPerformance.clicks}`,
      `  Impressions: ${report.searchPerformance.impressions}`,
      `  CTR: ${report.searchPerformance.ctr}`,
      `  Avg Position: ${report.searchPerformance.avgPosition}`,
      '',
      '📊 WEEK-OVER-WEEK:',
      `  Indexed pages: ${report.weekOverWeek.indexedPages}`,
      `  Organic traffic: ${report.weekOverWeek.organicTraffic}`,
      `  Avg position: ${report.weekOverWeek.avgPosition}`,
      ''
    ];

    if (report.recommendations.length > 0) {
      lines.push('⚠️  RECOMMENDATIONS:');
      report.recommendations.forEach((rec, i) => {
        lines.push(`  ${i + 1}. [${rec.priority.toUpperCase()}] ${rec.issue}`);
        lines.push(`     → ${rec.action}`);
      });
    } else {
      lines.push('✅ No critical issues detected!');
    }

    return lines.join('\n');
  }

  /**
   * Get health emoji
   */
  getHealthEmoji(score) {
    if (score >= 90) return '✅';
    if (score >= 70) return '🟢';
    if (score >= 50) return '🟡';
    if (score >= 30) return '🟠';
    return '🔴';
  }
}

// ============================================================================
// SCHEDULED REPORTING
// ============================================================================

/**
 * Schedule weekly reports (use with node-cron)
 */
export function scheduleWeeklyReports(dataFetcher) {
  // This would be used with node-cron in simple-server.js
  // Example: cron.schedule('0 9 * * 1', async () => { ... })

  return async () => {
    const reporter = new WeeklyKPIReporter();

    // Fetch all necessary data
    const data = await dataFetcher();

    // Generate report
    const report = await reporter.generateWeeklyReport(data);

    // Generate text summary
    const summary = reporter.generateTextSummary(report);

    console.log('\n' + summary + '\n');

    return { report, summary };
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  WeeklyKPIReporter,
  scheduleWeeklyReports
};
