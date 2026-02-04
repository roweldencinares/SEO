#!/usr/bin/env node

/**
 * SEO Agents Easy Setup
 * Run: node lib/seo-agents/setup.js
 *
 * This script verifies your environment and sets up the SEO agent system.
 */

import { GSCClient } from './gsc-client.js';
import { GA4Client } from './ga-client.js';
import { UnifiedSEO } from './unified-seo.js';

console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                    SEO AGENTS SETUP WIZARD                        ║
║                  Google Search Console + GA4                       ║
╚═══════════════════════════════════════════════════════════════════╝
`);

async function checkGSCConnection() {
  console.log('\n1️⃣  Checking Google Search Console Connection...\n');

  const gsc = new GSCClient({ debug: true });

  try {
    const health = await gsc.getHealthScore();

    if (health.overall !== undefined) {
      console.log('   ✅ GSC Connection: SUCCESS');
      console.log(`   📊 Health Score: ${health.overall} (${health.grade})`);
      console.log(`   📄 Indexed Pages: ${health.summary.indexedPages}`);
      console.log(`   🖱️  Total Clicks: ${health.summary.totalClicks}`);
      return true;
    }
  } catch (error) {
    console.log('   ❌ GSC Connection: FAILED');
    console.log(`   Error: ${error.message}`);
    console.log('\n   To fix:');
    console.log('   1. Ensure your GSC API endpoints are deployed');
    console.log('   2. Check GSC_API_URL environment variable');
    console.log('   3. Verify Google Search Console API credentials');
    return false;
  }
}

async function checkGA4Connection() {
  console.log('\n2️⃣  Checking Google Analytics 4 Connection...\n');

  const ga4 = new GA4Client({ debug: true });

  if (!process.env.GA4_PROPERTY_ID) {
    console.log('   ⚠️  GA4 Connection: NOT CONFIGURED');
    console.log('   GA4_PROPERTY_ID not set in environment');
    console.log('\n   To configure GA4:');
    console.log('   1. Get your GA4 Property ID from Google Analytics');
    console.log('   2. Add to .env: GA4_PROPERTY_ID=123456789');
    console.log('   3. Set up Service Account credentials');
    console.log('\n   Using mock data for now...');
    return false;
  }

  try {
    const traffic = await ga4.getTrafficOverview({ startDate: '7daysAgo' });

    if (traffic.sessions !== undefined) {
      console.log('   ✅ GA4 Connection: SUCCESS');
      console.log(`   👥 Sessions: ${traffic.sessions}`);
      console.log(`   📈 Users: ${traffic.users}`);
      console.log(`   📄 Pageviews: ${traffic.pageviews}`);
      return true;
    }
  } catch (error) {
    console.log('   ❌ GA4 Connection: FAILED');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function testUnifiedSEO() {
  console.log('\n3️⃣  Testing Unified SEO System...\n');

  const seo = new UnifiedSEO({ debug: true });

  try {
    // Test technical audit
    const audit = await seo.runTechnicalAudit('https://www.spearity.com');

    console.log('   ✅ Technical Audit: SUCCESS');
    console.log(`   📊 Score: ${audit.score} (${audit.grade})`);
    console.log(`   ✅ Passed: ${audit.summary.passed} checks`);
    console.log(`   ❌ Issues: ${audit.summary.issues} found`);

    if (audit.issues.length > 0) {
      console.log('\n   Top Issues:');
      audit.issues.slice(0, 3).forEach((issue, i) => {
        console.log(`   ${i + 1}. [${issue.severity}] ${issue.issue}`);
      });
    }

    return true;
  } catch (error) {
    console.log('   ❌ Unified SEO: FAILED');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function showQuickStart() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                        QUICK START GUIDE                          ║
╚═══════════════════════════════════════════════════════════════════╝

📌 SEO Agent Shortcuts (add to CLAUDE.md):

   seo  - SEO Orchestrator (master coordinator)
   s1   - Technical SEO Agent
   s2   - Schema Agent
   s3   - Content Agent
   s4   - GSC Agent
   s5   - WordPress Agent
   s6   - Indexation Agent

📌 Command Examples:

   "seo audit"              Full site audit
   "seo health"             Get health score
   "s1 check robots"        Check robots.txt
   "s2 add faq"             Add FAQ schema
   "s3 optimize titles"     Optimize page titles
   "s4 coverage"            Get indexation report
   "s5 list pages"          List WordPress pages
   "s6 submit url"          Submit for indexing

📌 Code Usage:

   import { seo, gsc, ga4 } from './lib/seo-agents';

   // Get full dashboard
   const dashboard = await seo.getDashboard();

   // Check specific page
   const pageAnalysis = await seo.analyzePage('https://example.com/page');

   // Find opportunities
   const opportunities = await seo.findOpportunities();

📌 NEXUS-Powered Operations:

   import { nexusDashboard, nexusAnalyzePage } from './lib/seo-agents';

   // Production-grade with all 9 NEXUS layers
   const result = await nexusDashboard({ days: 28 });

╔═══════════════════════════════════════════════════════════════════╗
║                         SETUP COMPLETE                            ║
╚═══════════════════════════════════════════════════════════════════╝
`);
}

async function showEnvironmentVars() {
  console.log('\n4️⃣  Environment Variables Status:\n');

  const vars = [
    { name: 'GSC_API_URL', value: process.env.GSC_API_URL, required: true },
    { name: 'GA4_PROPERTY_ID', value: process.env.GA4_PROPERTY_ID, required: false },
    { name: 'WORDPRESS_URL', value: process.env.WORDPRESS_URL, required: true },
    { name: 'WP_USERNAME', value: process.env.WP_USERNAME ? '***' : undefined, required: true },
    { name: 'WP_APP_PASSWORD', value: process.env.WP_APP_PASSWORD ? '***' : undefined, required: true },
    { name: 'GOOGLE_APPLICATION_CREDENTIALS', value: process.env.GOOGLE_APPLICATION_CREDENTIALS, required: false }
  ];

  vars.forEach(v => {
    const status = v.value ? '✅' : (v.required ? '❌' : '⚠️');
    const display = v.value || 'NOT SET';
    console.log(`   ${status} ${v.name}: ${display}`);
  });

  const missingRequired = vars.filter(v => v.required && !v.value);
  if (missingRequired.length > 0) {
    console.log('\n   ⚠️  Missing required variables:');
    missingRequired.forEach(v => {
      console.log(`      - ${v.name}`);
    });
  }
}

async function main() {
  // Load environment variables
  try {
    const dotenv = await import('dotenv');
    dotenv.config();
  } catch (e) {
    // dotenv not available, continue with existing env
  }

  await showEnvironmentVars();

  const gscOk = await checkGSCConnection();
  const ga4Ok = await checkGA4Connection();
  const seoOk = await testUnifiedSEO();

  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                       CONNECTION SUMMARY                          ║
╚═══════════════════════════════════════════════════════════════════╝

   GSC Connection:      ${gscOk ? '✅ READY' : '❌ NOT READY'}
   GA4 Connection:      ${ga4Ok ? '✅ READY' : '⚠️  USING MOCK DATA'}
   Unified SEO System:  ${seoOk ? '✅ READY' : '❌ NOT READY'}

`);

  if (gscOk || seoOk) {
    await showQuickStart();
  } else {
    console.log('   Please fix the connection issues above and run setup again.');
    console.log('   Run: node lib/seo-agents/setup.js\n');
  }
}

main().catch(console.error);
