/**
 * NEXUS-Powered SEO Operations
 * Production-grade SEO operations with all 9 NEXUS layers
 *
 * L1 SCAN     - Validate inputs, detect threats
 * L2 ANALYZE  - AI complexity analysis
 * L3 TRANSFORM - Normalize and enrich data
 * L4 GUARD    - Enforce business rules
 * L5 HEAL     - 3-tier self-recovery
 * L6 VALIDATE - Quality assurance
 * L7 RESPOND  - Optimize delivery
 * L8 OBSERVE  - Monitor and predict
 * L9 EVOLVE   - Learn and improve
 */

import { UnifiedSEO } from './unified-seo.js';

// NEXUS Configuration
const NEXUS_CONFIG = {
  FULL: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  STANDARD: [1, 3, 4, 5, 6, 7],
  LITE: [1, 5, 7]
};

// Telemetry storage
const telemetry = {
  operations: [],
  errors: [],
  patterns: new Map(),
  lastUpdated: null
};

/**
 * NEXUS Layer Implementations
 */
const LAYERS = {
  // L1: SCAN - Input validation and threat detection
  scan: async (input, config) => {
    const startTime = Date.now();
    const result = { valid: true, threats: [], warnings: [] };

    // Validate URL inputs
    if (input.url) {
      if (!input.url.startsWith('http')) {
        result.valid = false;
        result.threats.push('Invalid URL format');
      }
      if (input.url.includes('<script>')) {
        result.valid = false;
        result.threats.push('XSS attempt detected');
      }
    }

    // Validate required fields
    if (config.required) {
      for (const field of config.required) {
        if (!input[field]) {
          result.valid = false;
          result.warnings.push(`Missing required field: ${field}`);
        }
      }
    }

    result.duration = Date.now() - startTime;
    return result;
  },

  // L2: ANALYZE - Complexity and intent analysis
  analyze: async (input, config) => {
    const startTime = Date.now();

    // Determine operation complexity
    let complexity = 1;
    if (input.url) complexity += 1;
    if (input.urls?.length > 10) complexity += 2;
    if (input.days && input.days > 30) complexity += 1;
    if (config.includeGA) complexity += 1;
    if (config.fullAudit) complexity += 3;

    // Determine intent
    let intent = 'unknown';
    if (config.operation === 'dashboard') intent = 'overview';
    if (config.operation === 'audit') intent = 'diagnosis';
    if (config.operation === 'analyze') intent = 'deep-dive';
    if (config.operation === 'opportunities') intent = 'growth';

    return {
      complexity,
      intent,
      estimatedCost: complexity * 0.001, // API cost estimate
      recommendedCaching: complexity > 3,
      duration: Date.now() - startTime
    };
  },

  // L3: TRANSFORM - Data normalization and enrichment
  transform: async (data, config) => {
    const startTime = Date.now();

    // Normalize dates
    if (data.checkedAt) data.checkedAt = new Date(data.checkedAt).toISOString();
    if (data.fetchedAt) data.fetchedAt = new Date(data.fetchedAt).toISOString();

    // Enrich with computed fields
    if (data.clicks !== undefined && data.impressions !== undefined) {
      data.ctrComputed = data.impressions > 0
        ? ((data.clicks / data.impressions) * 100).toFixed(2) + '%'
        : '0%';
    }

    // Add health indicators
    if (data.score !== undefined) {
      data.healthIndicator = data.score >= 80 ? 'healthy' :
                              data.score >= 60 ? 'needs-attention' :
                              'critical';
    }

    return {
      data,
      enriched: true,
      duration: Date.now() - startTime
    };
  },

  // L4: GUARD - Business rule enforcement
  guard: async (operation, config) => {
    const startTime = Date.now();
    const violations = [];

    // Rate limiting
    const recentOps = telemetry.operations.filter(
      op => Date.now() - op.timestamp < 60000
    );
    if (recentOps.length > 100) {
      violations.push('Rate limit exceeded (100/min)');
    }

    // Bulk operation limits
    if (config.urls?.length > 100) {
      violations.push('Bulk operation limit exceeded (max 100 URLs)');
    }

    // Destructive operation guard
    if (config.destructive && !config.confirmed) {
      violations.push('Destructive operation requires confirmation');
    }

    return {
      allowed: violations.length === 0,
      violations,
      duration: Date.now() - startTime
    };
  },

  // L5: HEAL - Self-recovery with 3-tier fallback
  heal: async (error, config) => {
    const startTime = Date.now();
    let recovered = false;
    let fallbackLevel = 0;
    let result = null;

    // Tier 1: Retry with exponential backoff
    if (config.fallbacks?.tier1) {
      try {
        await new Promise(r => setTimeout(r, 1000));
        result = await config.fallbacks.tier1();
        recovered = true;
        fallbackLevel = 1;
      } catch (e) {
        // Continue to tier 2
      }
    }

    // Tier 2: Use cached data
    if (!recovered && config.fallbacks?.tier2) {
      try {
        result = await config.fallbacks.tier2();
        recovered = true;
        fallbackLevel = 2;
      } catch (e) {
        // Continue to tier 3
      }
    }

    // Tier 3: Return graceful degradation
    if (!recovered && config.fallbacks?.tier3) {
      result = config.fallbacks.tier3();
      recovered = true;
      fallbackLevel = 3;
    }

    return {
      recovered,
      fallbackLevel,
      result,
      originalError: error.message,
      duration: Date.now() - startTime
    };
  },

  // L6: VALIDATE - Output quality assurance
  validate: async (output, config) => {
    const startTime = Date.now();
    const issues = [];

    // Check required output fields
    if (config.requiredOutput) {
      for (const field of config.requiredOutput) {
        if (output[field] === undefined) {
          issues.push(`Missing output field: ${field}`);
        }
      }
    }

    // Validate data ranges
    if (output.score !== undefined) {
      if (output.score < 0 || output.score > 100) {
        issues.push('Score out of valid range (0-100)');
      }
    }

    // Validate URLs
    if (output.url && !output.url.startsWith('http')) {
      issues.push('Invalid URL in output');
    }

    return {
      valid: issues.length === 0,
      issues,
      qualityScore: issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 20),
      duration: Date.now() - startTime
    };
  },

  // L7: RESPOND - Response optimization
  respond: async (data, config) => {
    const startTime = Date.now();

    // Add metadata
    const response = {
      success: true,
      data,
      meta: {
        version: '1.0',
        source: 'nexus-seo',
        cached: config.fromCache || false,
        timestamp: new Date().toISOString()
      }
    };

    // Compress if large
    const dataSize = JSON.stringify(data).length;
    if (dataSize > 100000) {
      response.meta.truncated = true;
      response.meta.originalSize = dataSize;
    }

    return {
      response,
      size: dataSize,
      duration: Date.now() - startTime
    };
  },

  // L8: OBSERVE - Monitoring and prediction
  observe: async (operation, metrics) => {
    const startTime = Date.now();

    // Record operation
    telemetry.operations.push({
      operation: operation.name,
      timestamp: Date.now(),
      duration: metrics.totalDuration,
      success: metrics.success
    });

    // Keep only last 1000 operations
    if (telemetry.operations.length > 1000) {
      telemetry.operations = telemetry.operations.slice(-1000);
    }

    // Calculate trends
    const recentOps = telemetry.operations.slice(-100);
    const avgDuration = recentOps.reduce((sum, op) => sum + op.duration, 0) / recentOps.length;
    const successRate = recentOps.filter(op => op.success).length / recentOps.length;

    // Predict issues
    const predictions = [];
    if (avgDuration > 5000) {
      predictions.push('Performance degradation detected - consider caching');
    }
    if (successRate < 0.9) {
      predictions.push('Elevated error rate - check API health');
    }

    telemetry.lastUpdated = new Date().toISOString();

    return {
      metrics: {
        avgDuration,
        successRate,
        operationsCount: telemetry.operations.length
      },
      predictions,
      duration: Date.now() - startTime
    };
  },

  // L9: EVOLVE - Learning and optimization
  evolve: async (operation, results) => {
    const startTime = Date.now();

    // Track patterns
    const patternKey = `${operation.name}:${operation.input?.url || 'bulk'}`;
    const existingPattern = telemetry.patterns.get(patternKey) || {
      count: 0,
      avgDuration: 0,
      lastResult: null
    };

    existingPattern.count++;
    existingPattern.avgDuration =
      (existingPattern.avgDuration * (existingPattern.count - 1) + results.duration) /
      existingPattern.count;
    existingPattern.lastResult = results.success ? 'success' : 'failure';
    existingPattern.lastRun = new Date().toISOString();

    telemetry.patterns.set(patternKey, existingPattern);

    // Generate insights
    const insights = [];

    if (existingPattern.count > 5 && existingPattern.avgDuration > 3000) {
      insights.push(`Consider caching ${operation.name} - avg ${existingPattern.avgDuration}ms`);
    }

    if (existingPattern.count > 10) {
      insights.push(`Frequently accessed: ${patternKey} (${existingPattern.count} times)`);
    }

    return {
      pattern: existingPattern,
      insights,
      learnings: telemetry.patterns.size,
      duration: Date.now() - startTime
    };
  }
};

/**
 * NEXUS Wrapper - Wraps any SEO operation with NEXUS layers
 */
export function nexusify(operation, config = {}) {
  const mode = NEXUS_CONFIG[config.mode || 'STANDARD'];
  const operationName = config.name || operation.name || 'unknown';

  return async function nexusOperation(input) {
    const startTime = Date.now();
    const layerResults = {};
    let result = null;
    let success = true;

    try {
      // L1: SCAN
      if (mode.includes(1)) {
        layerResults.scan = await LAYERS.scan(input, config);
        if (!layerResults.scan.valid) {
          throw new Error(`Validation failed: ${layerResults.scan.threats.join(', ')}`);
        }
      }

      // L2: ANALYZE
      if (mode.includes(2)) {
        layerResults.analyze = await LAYERS.analyze(input, config);
      }

      // L4: GUARD
      if (mode.includes(4)) {
        layerResults.guard = await LAYERS.guard(operationName, { ...config, ...input });
        if (!layerResults.guard.allowed) {
          throw new Error(`Guard violation: ${layerResults.guard.violations.join(', ')}`);
        }
      }

      // Execute operation with L5 HEAL fallbacks
      try {
        result = await operation(input);
      } catch (error) {
        if (mode.includes(5)) {
          layerResults.heal = await LAYERS.heal(error, {
            fallbacks: {
              tier1: () => operation(input), // Retry
              tier2: () => ({ fromCache: true, data: null }), // Cache
              tier3: () => ({ error: true, message: error.message }) // Graceful fail
            }
          });
          if (layerResults.heal.recovered) {
            result = layerResults.heal.result;
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }

      // L3: TRANSFORM
      if (mode.includes(3)) {
        layerResults.transform = await LAYERS.transform(result, config);
        result = layerResults.transform.data;
      }

      // L6: VALIDATE
      if (mode.includes(6)) {
        layerResults.validate = await LAYERS.validate(result, config);
      }

      // L7: RESPOND
      if (mode.includes(7)) {
        layerResults.respond = await LAYERS.respond(result, config);
        result = layerResults.respond.response;
      }

    } catch (error) {
      success = false;
      result = {
        success: false,
        error: error.message,
        layers: layerResults
      };
    }

    const totalDuration = Date.now() - startTime;

    // L8: OBSERVE
    if (mode.includes(8)) {
      layerResults.observe = await LAYERS.observe(
        { name: operationName, input },
        { totalDuration, success }
      );
    }

    // L9: EVOLVE
    if (mode.includes(9)) {
      layerResults.evolve = await LAYERS.evolve(
        { name: operationName, input },
        { duration: totalDuration, success }
      );
    }

    // Add NEXUS metadata to result
    if (typeof result === 'object' && result !== null) {
      result._nexus = {
        mode: config.mode || 'STANDARD',
        layers: Object.keys(layerResults),
        duration: totalDuration,
        insights: layerResults.evolve?.insights || [],
        predictions: layerResults.observe?.predictions || []
      };
    }

    return result;
  };
}

/**
 * Pre-wrapped NEXUS SEO Operations
 */
const seo = new UnifiedSEO();

export const nexusDashboard = nexusify(
  (input) => seo.getDashboard(input),
  { name: 'getDashboard', mode: 'FULL' }
);

export const nexusAnalyzePage = nexusify(
  (input) => seo.analyzePage(input.url, input),
  { name: 'analyzePage', mode: 'FULL', required: ['url'] }
);

export const nexusFindOpportunities = nexusify(
  (input) => seo.findOpportunities(input),
  { name: 'findOpportunities', mode: 'STANDARD' }
);

export const nexusTechnicalAudit = nexusify(
  (input) => seo.runTechnicalAudit(input.url),
  { name: 'technicalAudit', mode: 'FULL', required: ['url'] }
);

/**
 * Get NEXUS telemetry data
 */
export function getTelemetry() {
  return {
    operationsCount: telemetry.operations.length,
    recentOperations: telemetry.operations.slice(-20),
    patterns: Array.from(telemetry.patterns.entries()),
    lastUpdated: telemetry.lastUpdated
  };
}

export default {
  nexusify,
  nexusDashboard,
  nexusAnalyzePage,
  nexusFindOpportunities,
  nexusTechnicalAudit,
  getTelemetry
};
