/**
 * SEO Performance Monitoring Service - NEXUS Framework
 *
 * Tracks SEO improvements and provides actionable insights
 */

import { nexusify } from '../nexus/core.js';
import gscService from './gsc-service.js';

// ============================================================================
// SEO HEALTH SCORING
// ============================================================================

/**
 * Calculate SEO health score (0-100)
 */
function calculateSEOHealth(data) {
  let score = 0;

  // Position score (40 points max)
  if (data.avgPosition <= 3) score += 40;
  else if (data.avgPosition <= 5) score += 35;
  else if (data.avgPosition <= 10) score += 25;
  else if (data.avgPosition <= 20) score += 10;
  else score += 5;

  // CTR score (30 points max)
  if (data.avgCTR >= 5) score += 30;
  else if (data.avgCTR >= 3) score += 25;
  else if (data.avgCTR >= 2) score += 20;
  else if (data.avgCTR >= 1) score += 10;
  else score += 5;

  // Top 10 keywords score (20 points max)
  const top10Ratio = data.top10Rankings / data.keywordsTracked;
  if (top10Ratio >= 0.5) score += 20;
  else if (top10Ratio >= 0.3) score += 15;
  else if (top10Ratio >= 0.2) score += 10;
  else score += 5;

  // Traffic score (10 points max)
  if (data.totalClicks >= 1000) score += 10;
  else if (data.totalClicks >= 500) score += 8;
  else if (data.totalClicks >= 100) score += 5;
  else score += 2;

  return Math.min(score, 100);
}

/**
 * Get SEO recommendations based on data
 */
function getSEORecommendations(data) {
  const recommendations = [];

  // Position recommendations
  if (data.avgPosition > 10) {
    recommendations.push({
      priority: 'HIGH',
      issue: 'Poor average ranking position',
      recommendation: 'Optimize H1 tags with primary keywords and improve content quality',
      expectedImpact: '+5-15 positions'
    });
  }

  // CTR recommendations
  if (data.avgCTR < 2) {
    recommendations.push({
      priority: 'HIGH',
      issue: 'Low click-through rate',
      recommendation: 'Improve meta descriptions and title tags to be more compelling',
      expectedImpact: '+50-100% CTR increase'
    });
  }

  // Top 10 keywords
  if (data.top10Rankings < 5) {
    recommendations.push({
      priority: 'MEDIUM',
      issue: 'Few top 10 rankings',
      recommendation: 'Create content targeting long-tail keywords with low competition',
      expectedImpact: '+10-20 top 10 keywords in 3 months'
    });
  }

  // Traffic volume
  if (data.totalClicks < 100) {
    recommendations.push({
      priority: 'HIGH',
      issue: 'Low organic traffic volume',
      recommendation: 'Expand content library and build backlinks from industry sites',
      expectedImpact: '+200-500% traffic in 6 months'
    });
  }

  // Keyword diversity
  if (data.keywordsTracked < 50) {
    recommendations.push({
      priority: 'MEDIUM',
      issue: 'Limited keyword coverage',
      recommendation: 'Publish comprehensive guides targeting "business coaching [topic]" queries',
      expectedImpact: '+50-100 ranking keywords in 3 months'
    });
  }

  return recommendations;
}

/**
 * Detect ranking anomalies (sudden drops or spikes)
 */
function detectAnomalies(current, previous) {
  const anomalies = [];

  // Check for significant position changes
  if (previous && current.avgPosition) {
    const positionChange = current.avgPosition - previous.avgPosition;
    if (positionChange > 5) {
      anomalies.push({
        type: 'RANKING_DROP',
        severity: 'HIGH',
        message: `Average position dropped by ${positionChange.toFixed(1)} positions`,
        recommendation: 'Check for manual penalties or algorithm updates'
      });
    } else if (positionChange < -5) {
      anomalies.push({
        type: 'RANKING_SPIKE',
        severity: 'POSITIVE',
        message: `Average position improved by ${Math.abs(positionChange).toFixed(1)} positions`,
        recommendation: 'Analyze what content changes drove this improvement'
      });
    }
  }

  // Check for CTR anomalies
  if (previous && current.avgCTR) {
    const ctrChange = ((current.avgCTR - previous.avgCTR) / previous.avgCTR) * 100;
    if (ctrChange < -20) {
      anomalies.push({
        type: 'CTR_DROP',
        severity: 'MEDIUM',
        message: `CTR dropped by ${Math.abs(ctrChange).toFixed(1)}%`,
        recommendation: 'Review title tags and meta descriptions for engagement'
      });
    }
  }

  // Check for traffic drops
  if (previous && current.totalClicks) {
    const clickChange = ((current.totalClicks - previous.totalClicks) / previous.totalClicks) * 100;
    if (clickChange < -30) {
      anomalies.push({
        type: 'TRAFFIC_DROP',
        severity: 'CRITICAL',
        message: `Traffic dropped by ${Math.abs(clickChange).toFixed(1)}%`,
        recommendation: 'URGENT: Check for indexing issues, penalties, or technical problems'
      });
    }
  }

  return anomalies;
}

// ============================================================================
// NEXUS-WRAPPED MONITORING OPERATIONS
// ============================================================================

/**
 * Get comprehensive SEO health report
 *
 * NEXUS-STANDARD mode
 * - Cache: 1 hour (balance freshness with API limits)
 * - Provides scoring, recommendations, and anomaly detection
 */
const _getSEOHealthReportCore = async (input) => {
  const {
    oauth2Client,
    siteUrl = 'sc-domain:spearity.com'
  } = input._nexus ? input : input;

  // Get current period data
  const currentResult = await gscService.getGSCSummary({
    oauth2Client,
    siteUrl,
    days: 30
  });

  const current = currentResult.success ? currentResult.data.summary : null;

  if (!current) {
    throw new Error('Failed to fetch current SEO data');
  }

  // Calculate health score
  const healthScore = calculateSEOHealth(current);

  // Get recommendations
  const recommendations = getSEORecommendations(current);

  // Get previous period for comparison
  // Note: This is a simplified version - you'd need to implement historical tracking
  const previous = null; // Placeholder for historical data

  // Detect anomalies
  const anomalies = detectAnomalies(current, previous);

  console.log(`✅ SEO Health Score: ${healthScore}/100`);
  console.log(`📊 Recommendations: ${recommendations.length}`);
  console.log(`⚠️  Anomalies: ${anomalies.length}`);

  return {
    success: true,
    healthScore,
    grade: healthScore >= 80 ? 'A' : healthScore >= 60 ? 'B' : healthScore >= 40 ? 'C' : 'D',
    summary: current,
    recommendations,
    anomalies,
    trends: {
      avgPosition: current.avgPosition,
      avgCTR: current.avgCTR,
      totalClicks: current.totalClicks,
      top10Rankings: current.top10Rankings
    },
    timestamp: new Date().toISOString()
  };
};

export const getSEOHealthReport = nexusify(_getSEOHealthReportCore, {
  service: 'seo-health-report',
  mode: 'STANDARD',
  cacheKey: 'seo-health-report',
  cacheTTL: 3600 // 1 hour
});

/**
 * Track keyword performance over time
 *
 * NEXUS-STANDARD mode
 * - Identifies winners and losers
 * - Suggests optimization opportunities
 */
const _trackKeywordPerformanceCore = async (input) => {
  const {
    oauth2Client,
    siteUrl = 'sc-domain:spearity.com',
    limit = 50
  } = input._nexus ? input : input;

  // Get keywords
  const result = await gscService.getGSCKeywords({
    oauth2Client,
    siteUrl,
    limit,
    days: 30
  });

  if (!result.success) {
    throw new Error('Failed to fetch keyword data');
  }

  const keywords = result.data.keywords;

  // Categorize keywords
  const topPerformers = keywords.filter(k => parseFloat(k.position) <= 3);
  const goodRankings = keywords.filter(k => parseFloat(k.position) > 3 && parseFloat(k.position) <= 10);
  const needsWork = keywords.filter(k => parseFloat(k.position) > 10 && parseFloat(k.position) <= 20);
  const poorRankings = keywords.filter(k => parseFloat(k.position) > 20);

  // Calculate opportunities
  const opportunities = needsWork
    .filter(k => k.impressions > 10) // Has some visibility
    .sort((a, b) => b.impressions - a.impressions) // Sort by impressions
    .slice(0, 10); // Top 10 opportunities

  console.log(`✅ Keyword Performance:
    🥇 Top 3: ${topPerformers.length}
    👍 Top 10: ${goodRankings.length}
    ⚠️  Needs work: ${needsWork.length}
    ❌ Poor: ${poorRankings.length}
  `);

  return {
    success: true,
    summary: {
      total: keywords.length,
      topPerformers: topPerformers.length,
      goodRankings: goodRankings.length,
      needsWork: needsWork.length,
      poorRankings: poorRankings.length
    },
    categories: {
      topPerformers,
      goodRankings,
      needsWork: needsWork.slice(0, 20), // Limit to top 20
      poorRankings: poorRankings.slice(0, 20)
    },
    opportunities: opportunities.map(k => ({
      keyword: k.keyword,
      currentPosition: k.position,
      impressions: k.impressions,
      clicks: k.clicks,
      potential: `+${Math.round(k.impressions * 0.2)} clicks if moved to position 5`,
      recommendation: `Optimize content for "${k.keyword}" - currently position ${k.position}`
    }))
  };
};

export const trackKeywordPerformance = nexusify(_trackKeywordPerformanceCore, {
  service: 'keyword-performance-tracking',
  mode: 'STANDARD',
  cacheKey: 'keyword-performance',
  cacheTTL: 3600 // 1 hour
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getSEOHealthReport,
  trackKeywordPerformance,
  calculateSEOHealth,
  getSEORecommendations,
  detectAnomalies
};
