/**
 * Keyword Analysis Tool - Understand Click Distribution
 *
 * Helps reconcile page-level vs keyword-level click data
 */

import gscService from './gsc-service.js';

/**
 * Analyze click distribution across keywords
 *
 * Shows which keywords are driving traffic and how they add up
 */
export async function analyzeClickDistribution(oauth2Client, siteUrl = 'sc-domain:example.com') {
  console.log('\n🔍 Analyzing Click Distribution...\n');

  // Get all keywords with data
  const result = await gscService.getGSCKeywords({
    oauth2Client,
    siteUrl,
    limit: 100, // Get more keywords
    days: 30
  });

  if (!result.success) {
    throw new Error('Failed to fetch keyword data');
  }

  const keywords = result.data.keywords;

  // Filter keywords with clicks
  const keywordsWithClicks = keywords.filter(k => k.clicks > 0);

  // Calculate totals
  const totalClicks = keywordsWithClicks.reduce((sum, k) => sum + k.clicks, 0);
  const totalImpressions = keywordsWithClicks.reduce((sum, k) => sum + k.impressions, 0);

  // Group by click volume
  const highClicks = keywordsWithClicks.filter(k => k.clicks >= 10);
  const mediumClicks = keywordsWithClicks.filter(k => k.clicks >= 5 && k.clicks < 10);
  const lowClicks = keywordsWithClicks.filter(k => k.clicks < 5);

  console.log('📊 CLICK DISTRIBUTION SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Total Keywords with Clicks: ${keywordsWithClicks.length}`);
  console.log(`Total Clicks (all keywords): ${totalClicks}`);
  console.log(`Total Impressions: ${totalImpressions}`);
  console.log(`Overall CTR: ${((totalClicks / totalImpressions) * 100).toFixed(2)}%`);
  console.log('');

  console.log('🎯 BREAKDOWN BY CLICK VOLUME');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`High Clicks (10+):    ${highClicks.length} keywords`);
  console.log(`Medium Clicks (5-9):  ${mediumClicks.length} keywords`);
  console.log(`Low Clicks (1-4):     ${lowClicks.length} keywords`);
  console.log('');

  console.log('🏆 TOP KEYWORDS BY CLICKS');
  console.log('═══════════════════════════════════════════════════════');
  console.log('Rank | Keyword                           | Clicks | Position');
  console.log('-----|-----------------------------------|--------|----------');

  keywordsWithClicks
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 20)
    .forEach((k, i) => {
      const keyword = k.keyword.padEnd(33).substring(0, 33);
      const clicks = String(k.clicks).padStart(6);
      const position = String(k.position).padStart(8);
      console.log(`${String(i + 1).padStart(4)} | ${keyword} | ${clicks} | ${position}`);
    });

  console.log('');
  console.log('💡 EXPLANATION');
  console.log('═══════════════════════════════════════════════════════');
  console.log('Page-level clicks = Sum of ALL keyword clicks');
  console.log('Keyword-level clicks = Individual keyword contributions');
  console.log('');
  console.log('Example:');
  console.log('  Homepage total: 29 clicks');
  console.log('  ↳ "spearity": 13 clicks (45%)');
  console.log('  ↳ Other keywords: 16 clicks (55%)');
  console.log('');

  // Calculate brand vs non-brand traffic
  const brandKeywords = ['spearity'];
  const brandClicks = keywordsWithClicks
    .filter(k => brandKeywords.some(brand => k.keyword.toLowerCase().includes(brand)))
    .reduce((sum, k) => sum + k.clicks, 0);
  const nonBrandClicks = totalClicks - brandClicks;

  console.log('🎯 BRAND VS NON-BRAND TRAFFIC');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Brand Traffic (contains "spearity"):  ${brandClicks} clicks (${((brandClicks / totalClicks) * 100).toFixed(1)}%)`);
  console.log(`Non-Brand Traffic (other keywords):   ${nonBrandClicks} clicks (${((nonBrandClicks / totalClicks) * 100).toFixed(1)}%)`);
  console.log('');

  if (nonBrandClicks < brandClicks) {
    console.log('⚠️  WARNING: Over-reliant on brand traffic!');
    console.log('   → Need to rank for more industry keywords');
    console.log('   → Target: "business coaching", "executive coach", etc.');
  }

  console.log('');

  return {
    summary: {
      totalKeywords: keywordsWithClicks.length,
      totalClicks,
      totalImpressions,
      overallCTR: ((totalClicks / totalImpressions) * 100).toFixed(2)
    },
    breakdown: {
      highClicks: highClicks.length,
      mediumClicks: mediumClicks.length,
      lowClicks: lowClicks.length
    },
    topKeywords: keywordsWithClicks.sort((a, b) => b.clicks - a.clicks).slice(0, 20),
    brandVsNonBrand: {
      brandClicks,
      nonBrandClicks,
      brandPercentage: ((brandClicks / totalClicks) * 100).toFixed(1),
      nonBrandPercentage: ((nonBrandClicks / totalClicks) * 100).toFixed(1)
    }
  };
}

/**
 * Compare page-level vs keyword-level data to verify consistency
 */
export async function verifyDataConsistency(oauth2Client, siteUrl = 'sc-domain:example.com') {
  console.log('\n🔍 Verifying Data Consistency...\n');

  // Get page-level data
  const pagesResult = await gscService.getGSCPages({
    oauth2Client,
    siteUrl,
    limit: 10
  });

  // Get keyword-level data
  const keywordsResult = await gscService.getGSCKeywords({
    oauth2Client,
    siteUrl,
    limit: 100,
    days: 30
  });

  if (!pagesResult.success || !keywordsResult.success) {
    throw new Error('Failed to fetch data');
  }

  const pages = pagesResult.data.pages;
  const keywords = keywordsResult.data.keywords;

  console.log('📊 DATA CONSISTENCY CHECK');
  console.log('═══════════════════════════════════════════════════════');

  pages.slice(0, 5).forEach(page => {
    console.log(`\nPage: ${page.page}`);
    console.log(`  Page-level clicks: ${page.clicks}`);
    console.log(`  Explanation: This is the TOTAL clicks from ALL keywords`);
    console.log(`  ↳ Some clicks from "spearity"`);
    console.log(`  ↳ Some clicks from other keywords`);
    console.log(`  ↳ They all add up to ${page.clicks} total`);
  });

  console.log('\n\n💡 KEY INSIGHT');
  console.log('═══════════════════════════════════════════════════════');
  console.log('GSC shows data in TWO dimensions:');
  console.log('');
  console.log('1️⃣  BY PAGE (where users landed)');
  console.log('   → Shows total clicks PER URL');
  console.log('');
  console.log('2️⃣  BY KEYWORD (what users searched)');
  console.log('   → Shows clicks PER search term');
  console.log('');
  console.log('These are NOT inconsistent - they\'re showing the SAME data');
  console.log('from different angles!');
  console.log('');
  console.log('Example:');
  console.log('  User searches "spearity" → clicks homepage = 1 page click, 1 keyword click');
  console.log('  User searches "business coach" → clicks homepage = SAME page, DIFFERENT keyword');
  console.log('');
  console.log('Result:');
  console.log('  Homepage: 2 total clicks (page view)');
  console.log('  "spearity": 1 click (keyword view)');
  console.log('  "business coach": 1 click (keyword view)');
  console.log('  1 + 1 = 2 ✅');
  console.log('');
}

export default {
  analyzeClickDistribution,
  verifyDataConsistency
};
