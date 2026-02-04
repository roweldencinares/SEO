/**
 * SEO Agents Library
 * Unified exports for all SEO agent functionality
 *
 * Usage:
 *   import { seo, gsc, ga4 } from './lib/seo-agents';
 *   import { nexusDashboard } from './lib/seo-agents';
 */

// Core Clients
export { GSCClient, gsc, checkIndex, getCoverage, getPerformance, bulkCheck, getHealthScore } from './gsc-client.js';
export { GA4Client, ga4, getTraffic, getTopPages, getSources, getOrganic, getDevices } from './ga-client.js';
export { UnifiedSEO, seo, getDashboard, analyzePage, findOpportunities, technicalAudit } from './unified-seo.js';

// NEXUS-Powered Operations
export {
  nexusify,
  nexusDashboard,
  nexusAnalyzePage,
  nexusFindOpportunities,
  nexusTechnicalAudit,
  getTelemetry
} from './nexus-seo.js';

// Version
export const VERSION = '1.0.0';

// Quick Reference
export const AGENTS = {
  s1: 'technical-seo-agent',
  s2: 'schema-agent',
  s3: 'content-agent',
  s4: 'gsc-agent',
  s5: 'wordpress-agent',
  s6: 'indexation-agent',
  seo: 'seo-orchestrator'
};

/**
 * Initialize all SEO agents with configuration
 * @param {object} config - Configuration options
 */
export function initSEOAgents(config = {}) {
  const { GSCClient } = require('./gsc-client.js');
  const { GA4Client } = require('./ga-client.js');
  const { UnifiedSEO } = require('./unified-seo.js');

  return {
    gsc: new GSCClient(config.gsc),
    ga4: new GA4Client(config.ga4),
    seo: new UnifiedSEO(config)
  };
}

console.log(`[SEO Agents] Library loaded v${VERSION}`);
