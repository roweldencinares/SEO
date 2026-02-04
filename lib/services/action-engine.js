/**
 * Action Engine - Turn SEO Data into Actionable Insights
 *
 * Analyzes SEO monitoring data and generates prioritized action items
 * with clear ROI estimates and implementation guidance
 */

import { nexusify } from '../nexus/core.js';
import gscService from './gsc-service.js';

// ============================================================================
// ACTION GENERATION ENGINE
// ============================================================================

/**
 * Analyze SEO data and generate prioritized actions
 */
function generateActions(gscData, previousData = null) {
  const actions = [];
  const { keywords, summary } = gscData;

  // Priority scoring: 0-100 (higher = more urgent/impactful)
  const calculatePriority = (impact, effort, urgency) => {
    return Math.round((impact * 0.5 + urgency * 0.3 - effort * 0.2));
  };

  // ==========================================
  // 1. LOW-HANGING FRUIT (High priority)
  // ==========================================

  // Keywords on page 2 (positions 11-20) with high impressions
  const page2Keywords = keywords.filter(k => {
    const pos = parseFloat(k.position);
    return pos > 10 && pos <= 20 && k.impressions > 100;
  });

  if (page2Keywords.length > 0) {
    const topOpportunity = page2Keywords.sort((a, b) => b.impressions - a.impressions)[0];
    const potentialClicks = Math.round(topOpportunity.impressions * 0.15); // 15% CTR at position 5

    actions.push({
      id: 'low-hanging-fruit-1',
      category: 'Quick Wins',
      priority: calculatePriority(90, 30, 80), // Impact: 90, Effort: 30, Urgency: 80
      title: `Push "${topOpportunity.keyword}" to Page 1`,
      description: `Currently at position ${topOpportunity.position} with ${topOpportunity.impressions} impressions. Moving to top 10 could add ${potentialClicks} clicks/month.`,
      actions: [
        `Add "${topOpportunity.keyword}" to H1 or H2 tag on the ranking page`,
        `Create 500-word content section specifically about this topic`,
        `Build 2-3 internal links pointing to this page with keyword anchor text`,
        `Add FAQ schema markup answering "${topOpportunity.keyword}" questions`
      ],
      estimatedROI: {
        clicks: potentialClicks,
        leads: Math.round(potentialClicks * 0.05), // 5% conversion
        timeline: '2-4 weeks'
      },
      effort: 'Low (2-3 hours)',
      assignTo: 'Content Team',
      trackingMetric: `Position for "${topOpportunity.keyword}"`,
      currentValue: topOpportunity.position,
      targetValue: '10 or better'
    });
  }

  // ==========================================
  // 2. CONTENT GAPS (Medium-High priority)
  // ==========================================

  // Keywords with impressions but zero clicks (visibility but no engagement)
  const zeroClickKeywords = keywords.filter(k => k.impressions > 50 && k.clicks === 0);

  if (zeroClickKeywords.length > 0) {
    const topZeroClick = zeroClickKeywords.sort((a, b) => b.impressions - a.impressions)[0];

    actions.push({
      id: 'content-gap-1',
      category: 'Content Optimization',
      priority: calculatePriority(75, 40, 70),
      title: `Fix CTR for "${topZeroClick.keyword}"`,
      description: `Getting ${topZeroClick.impressions} impressions at position ${topZeroClick.position} but ZERO clicks. Title/meta needs optimization.`,
      actions: [
        `Rewrite meta title to include "${topZeroClick.keyword}" at the start`,
        `Create compelling meta description with clear value proposition`,
        `Add power words: "Ultimate Guide", "Step-by-Step", "Free Template"`,
        `Include year (2025) in title to show freshness`,
        `Test title with CoSchedule Headline Analyzer`
      ],
      estimatedROI: {
        clicks: Math.round(topZeroClick.impressions * 0.03), // 3% CTR improvement
        leads: Math.round(topZeroClick.impressions * 0.03 * 0.05),
        timeline: '1-2 weeks'
      },
      effort: 'Very Low (30 minutes)',
      assignTo: 'Marketing',
      trackingMetric: `CTR for "${topZeroClick.keyword}"`,
      currentValue: '0%',
      targetValue: '3%+'
    });
  }

  // ==========================================
  // 3. TOP 3 OPPORTUNITIES (Protect rankings)
  // ==========================================

  const top3Keywords = keywords.filter(k => parseFloat(k.position) <= 3);

  if (top3Keywords.length > 0 && top3Keywords.length < 5) {
    actions.push({
      id: 'protect-rankings-1',
      category: 'Protect Rankings',
      priority: calculatePriority(85, 20, 60),
      title: `Expand Top 3 Rankings (Currently: ${top3Keywords.length})`,
      description: `Only ${top3Keywords.length} keywords in top 3. Competitors are targeting these positions.`,
      actions: [
        `Update top-ranking pages with fresh content (add 200-300 words)`,
        `Add current statistics and data (2025 numbers)`,
        `Build 5 new backlinks to top-performing pages`,
        `Create supporting blog posts linking to top pages`,
        `Add video content or infographics to enhance engagement`
      ],
      estimatedROI: {
        clicks: '+20-30 from maintaining positions',
        leads: '2-3 additional leads/month',
        timeline: 'Ongoing monthly'
      },
      effort: 'Medium (4-6 hours/month)',
      assignTo: 'Content + SEO Team',
      trackingMetric: 'Number of top 3 rankings',
      currentValue: top3Keywords.length,
      targetValue: '10+'
    });
  }

  // ==========================================
  // 4. LOCAL SEO (High priority for local business)
  // ==========================================

  const localKeywords = keywords.filter(k =>
    k.keyword.toLowerCase().includes('milwaukee') ||
    k.keyword.toLowerCase().includes('wisconsin')
  );

  if (localKeywords.length < 10) {
    actions.push({
      id: 'local-listing-1',
      category: 'Local Listing',
      priority: calculatePriority(95, 50, 90),
      title: 'Strengthen Local SEO Presence',
      description: `Only ${localKeywords.length} location-based keywords ranking. Missing huge local market opportunity.`,
      actions: [
        `Create "Business Coaching Milwaukee" landing page`,
        `Add Milwaukee-specific content to homepage (neighborhoods, case studies)`,
        `Claim and optimize Google Business Profile`,
        `Get 10 backlinks from Milwaukee business directories`,
        `Add location schema markup to all pages`,
        `Create blog: "Top 10 Milwaukee Businesses That Scaled with Coaching"`
      ],
      estimatedROI: {
        clicks: '+50-100 from local searches',
        leads: '5-10 qualified local leads/month',
        timeline: '1-3 months'
      },
      effort: 'High (20-30 hours)',
      assignTo: 'Content + SEO Team',
      trackingMetric: 'Local keyword rankings',
      currentValue: localKeywords.length,
      targetValue: '25+'
    });
  }

  // ==========================================
  // 5. TRAFFIC DROP ALERT (Critical priority)
  // ==========================================

  if (previousData && summary) {
    const clickChange = ((summary.totalClicks - previousData.totalClicks) / previousData.totalClicks) * 100;

    if (clickChange < -20) {
      actions.push({
        id: 'traffic-drop-alert',
        category: 'URGENT: Traffic Drop',
        priority: 100, // Maximum priority
        title: `🚨 Traffic Down ${Math.abs(clickChange).toFixed(1)}% - Investigate Immediately`,
        description: `Traffic dropped from ${previousData.totalClicks} to ${summary.totalClicks} clicks. Potential penalty or technical issue.`,
        actions: [
          `Run site audit for technical issues (broken links, indexing, crawl errors)`,
          `Check Google Search Console for manual penalties`,
          `Verify robots.txt isn't blocking important pages`,
          `Check for algorithm updates (Google Search Status Dashboard)`,
          `Review top 10 ranking pages for unexpected drops`,
          `Analyze competitor movements (did they jump ahead?)`
        ],
        estimatedROI: {
          clicks: 'Recover lost traffic',
          leads: 'Prevent lead loss',
          timeline: 'Immediate action required'
        },
        effort: 'High (urgent)',
        assignTo: 'SEO Team Lead',
        trackingMetric: 'Total clicks',
        currentValue: summary.totalClicks,
        targetValue: previousData.totalClicks
      });
    }
  }

  // ==========================================
  // 6. BRAND VS NON-BRAND OPTIMIZATION
  // ==========================================

  const brandKeywords = keywords.filter(k => k.keyword.toLowerCase().includes('spearity'));
  const brandClicks = brandKeywords.reduce((sum, k) => sum + k.clicks, 0);
  const totalClicks = keywords.reduce((sum, k) => sum + k.clicks, 0);
  const brandPercentage = (brandClicks / totalClicks) * 100;

  if (brandPercentage > 60) {
    actions.push({
      id: 'brand-dependence-1',
      category: 'Strategic Growth',
      priority: calculatePriority(70, 60, 50),
      title: `Reduce Brand Dependence (Currently ${brandPercentage.toFixed(0)}%)`,
      description: `${brandPercentage.toFixed(0)}% of traffic is brand searches. Need to rank for industry keywords to grow.`,
      actions: [
        `Target "business coaching" keywords without brand name`,
        `Create pillar content: "Complete Guide to Business Coaching"`,
        `Build topical authority: 10 blog posts on coaching topics`,
        `Guest post on industry sites to build backlinks`,
        `Create comparison content: "Business Coach vs Consultant"`,
        `Target long-tail keywords: "how to choose a business coach"`
      ],
      estimatedROI: {
        clicks: '+100-200 from non-brand keywords',
        leads: '10-20 new market leads/month',
        timeline: '3-6 months'
      },
      effort: 'Very High (40+ hours)',
      assignTo: 'Content Strategy Team',
      trackingMetric: 'Non-brand traffic percentage',
      currentValue: `${(100 - brandPercentage).toFixed(0)}%`,
      targetValue: '60%+'
    });
  }

  // ==========================================
  // 7. TECHNICAL SEO IMPROVEMENTS
  // ==========================================

  if (summary.avgCTR < 3) {
    actions.push({
      id: 'technical-ctr-1',
      category: 'Technical SEO',
      priority: calculatePriority(80, 30, 65),
      title: `Low Overall CTR (${summary.avgCTR}%) - Optimize Snippets`,
      description: `Average CTR is ${summary.avgCTR}%, industry standard is 3-5%. Leaving clicks on the table.`,
      actions: [
        `Add FAQ schema to top 20 pages`,
        `Implement review schema (star ratings in search results)`,
        `Optimize all meta descriptions (155 characters, include CTA)`,
        `Test different title formats (brackets, questions, numbers)`,
        `Add breadcrumb schema for better visual display`,
        `Use rich snippets (HowTo, Article schema)`
      ],
      estimatedROI: {
        clicks: `+${Math.round((summary.totalImpressions * 0.01))} clicks/month (1% CTR improvement)`,
        leads: Math.round(summary.totalImpressions * 0.01 * 0.05),
        timeline: '2-4 weeks'
      },
      effort: 'Medium (8-12 hours)',
      assignTo: 'Developer + SEO Team',
      trackingMetric: 'Average CTR',
      currentValue: `${summary.avgCTR}%`,
      targetValue: '4%+'
    });
  }

  // Sort by priority
  return actions.sort((a, b) => b.priority - a.priority);
}

/**
 * Calculate progress towards goals
 */
function calculateProgress(currentData, goals) {
  const progress = {};

  goals.forEach(goal => {
    const { metric, target, baseline } = goal;
    const current = currentData[metric];

    if (current !== undefined && baseline !== undefined && target !== undefined) {
      const totalChange = target - baseline;
      const currentChange = current - baseline;
      const percentage = Math.min(Math.round((currentChange / totalChange) * 100), 100);

      progress[goal.id] = {
        current,
        target,
        baseline,
        percentage: Math.max(percentage, 0),
        status: percentage >= 100 ? 'completed' : percentage >= 75 ? 'on-track' : percentage >= 50 ? 'progressing' : 'at-risk'
      };
    }
  });

  return progress;
}

// ============================================================================
// NEXUS-WRAPPED OPERATIONS
// ============================================================================

/**
 * Get actionable insights dashboard
 *
 * NEXUS-STANDARD mode
 * - Analyzes SEO data and generates prioritized action items
 * - Provides ROI estimates and implementation guidance
 * - Tracks progress towards goals
 */
const _getActionDashboardCore = async (input) => {
  const {
    oauth2Client,
    siteUrl = 'sc-domain:example.com',
    previousData = null
  } = input._nexus ? input : input;

  // Get current keyword data
  const keywordsResult = await gscService.getGSCKeywords({
    oauth2Client,
    siteUrl,
    limit: 100,
    days: 30
  });

  // Get summary data
  const summaryResult = await gscService.getGSCSummary({
    oauth2Client,
    siteUrl,
    days: 30
  });

  if (!keywordsResult.success || !summaryResult.success) {
    throw new Error('Failed to fetch SEO data');
  }

  const gscData = {
    keywords: keywordsResult.data.keywords,
    summary: summaryResult.data.summary
  };

  // Generate actions
  const actions = generateActions(gscData, previousData);

  // Calculate potential impact
  const totalPotentialClicks = actions.reduce((sum, action) => {
    const clicks = action.estimatedROI.clicks;
    return sum + (typeof clicks === 'string' ? parseInt(clicks.match(/\d+/)?.[0] || 0) : clicks);
  }, 0);

  const totalPotentialLeads = actions.reduce((sum, action) => {
    const leads = action.estimatedROI.leads;
    return sum + (typeof leads === 'string' ? parseInt(leads.match(/\d+/)?.[0] || 0) : leads);
  }, 0);

  console.log(`✅ Generated ${actions.length} prioritized actions`);
  console.log(`📈 Potential impact: +${totalPotentialClicks} clicks, +${totalPotentialLeads} leads`);

  return {
    success: true,
    actions,
    summary: {
      totalActions: actions.length,
      criticalActions: actions.filter(a => a.priority >= 90).length,
      highPriorityActions: actions.filter(a => a.priority >= 70 && a.priority < 90).length,
      mediumPriorityActions: actions.filter(a => a.priority >= 50 && a.priority < 70).length,
      totalPotentialClicks,
      totalPotentialLeads
    },
    currentMetrics: {
      totalClicks: gscData.summary.totalClicks,
      avgPosition: gscData.summary.avgPosition,
      avgCTR: gscData.summary.avgCTR,
      top10Rankings: gscData.summary.top10Rankings,
      totalKeywords: gscData.keywords.length
    },
    timestamp: new Date().toISOString()
  };
};

export const getActionDashboard = nexusify(_getActionDashboardCore, {
  service: 'action-dashboard',
  mode: 'STANDARD',
  cacheKey: 'action-dashboard',
  cacheTTL: 3600 // 1 hour
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getActionDashboard,
  generateActions,
  calculateProgress
};
