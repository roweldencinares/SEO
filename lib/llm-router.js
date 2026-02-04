/**
 * LLM Router - Intelligent Multi-Provider LLM Routing System
 *
 * Supports: Claude/Anthropic, Groq, Gemini, OpenAI, OpenRouter, Moonshot
 * Features: Cost tracking, failover, rate limiting, response time optimization
 *
 * Usage:
 *   const router = new LLMRouter();
 *   const response = await router.route('Your prompt here', { priority: 'cost' });
 */

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// PROVIDER CONFIGURATIONS
// ============================================================================

const PROVIDER_CONFIG = {
  anthropic: {
    name: 'Anthropic (Claude)',
    costPer1kInput: 0.003,    // $3 per million input tokens
    costPer1kOutput: 0.015,   // $15 per million output tokens
    rateLimit: 50,            // requests per minute
    avgLatency: 450,          // milliseconds
    model: 'claude-3-5-sonnet-20241022',
    quality: 'high',
    enabled: !!process.env.ANTHROPIC_API_KEY
  },

  groq: {
    name: 'Groq (FREE)',
    costPer1kInput: 0.0,      // FREE!
    costPer1kOutput: 0.0,     // FREE!
    rateLimit: 30,            // requests per minute (free tier)
    avgLatency: 200,          // Very fast!
    model: 'llama-3.3-70b-versatile',
    quality: 'medium-high',
    enabled: !!process.env.GROQ_API_KEY
  },

  gemini: {
    name: 'Google Gemini',
    costPer1kInput: 0.00015,  // $0.15 per million input tokens (Gemini Pro)
    costPer1kOutput: 0.0006,  // $0.60 per million output tokens
    rateLimit: 60,            // requests per minute
    avgLatency: 600,          // milliseconds
    model: 'gemini-1.5-pro',
    quality: 'high',
    enabled: !!process.env.GOOGLE_GEMINI_API_KEY || !!process.env.GEMINI_API_KEY
  },

  openai: {
    name: 'OpenAI (GPT-4)',
    costPer1kInput: 0.01,     // $10 per million input tokens (GPT-4)
    costPer1kOutput: 0.03,    // $30 per million output tokens
    rateLimit: 40,            // requests per minute
    avgLatency: 500,          // milliseconds
    model: 'gpt-4-turbo-preview',
    quality: 'high',
    enabled: !!process.env.OPENAI_API_KEY
  },

  openrouter: {
    name: 'OpenRouter',
    costPer1kInput: 0.002,    // Varies by model, average
    costPer1kOutput: 0.006,   // Varies by model
    rateLimit: 100,           // requests per minute
    avgLatency: 800,          // milliseconds
    model: 'anthropic/claude-3.5-sonnet',
    quality: 'high',
    enabled: !!process.env.OPENROUTER_API_KEY
  },

  moonshot: {
    name: 'Moonshot/Kimi',
    costPer1kInput: 0.0005,   // Very cheap
    costPer1kOutput: 0.002,   // Very cheap
    rateLimit: 60,            // requests per minute
    avgLatency: 700,          // milliseconds
    model: 'moonshot-v1-8k',
    quality: 'medium',
    enabled: !!process.env.MOONSHOT_API_KEY
  }
};

// ============================================================================
// LLM ROUTER CLASS
// ============================================================================

export class LLMRouter {
  constructor(config = {}) {
    this.config = {
      dailyCostCap: config.dailyCostCap || 5.00,      // $5/day default
      perRequestCostCap: config.perRequestCostCap || 0.10,  // $0.10 per request
      defaultPriority: config.defaultPriority || 'balanced',
      logLevel: config.logLevel || 'info',
      enableFallback: config.enableFallback !== false,
      ...config
    };

    // Request logs and metrics
    this.requestLog = [];
    this.rateLimitCounters = {};
    this.providerStats = {};

    // Initialize provider stats
    for (const provider of Object.keys(PROVIDER_CONFIG)) {
      this.providerStats[provider] = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalCost: 0,
        avgLatency: PROVIDER_CONFIG[provider].avgLatency,
        lastUsed: null
      };
    }

    // Initialize API clients
    this.initializeClients();
  }

  /**
   * Initialize API clients for all providers
   */
  initializeClients() {
    this.clients = {};

    // Anthropic/Claude
    if (process.env.ANTHROPIC_API_KEY) {
      this.clients.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }

    // Gemini
    if (process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY) {
      const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      this.clients.gemini = new GoogleGenerativeAI(apiKey);
    }

    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      this.clients.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }

    // OpenRouter, Groq, Moonshot use axios (REST APIs)
  }

  /**
   * Main routing method
   * @param {string} prompt - The prompt to send to LLM
   * @param {Object} options - Routing options
   * @returns {Promise<Object>} Response with data, cost, metrics
   */
  async route(prompt, options = {}) {
    const startTime = Date.now();

    // L1: SCAN - Validate input and check cost caps
    const validation = this.validateRequest(prompt, options);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        metrics: { duration: Date.now() - startTime }
      };
    }

    // L2: ANALYZE - Select optimal provider
    const provider = this.selectProvider(options);

    if (!provider) {
      return {
        success: false,
        error: 'No available providers. Check API keys in .env',
        metrics: { duration: Date.now() - startTime }
      };
    }

    // L3: TRANSFORM - Format request
    const request = this.formatRequest(prompt, provider, options);

    // L4: GUARD - Check rate limits
    if (this.isRateLimited(provider)) {
      if (this.config.enableFallback) {
        return await this.fallbackRoute(prompt, options, provider);
      } else {
        return {
          success: false,
          error: `Rate limited on ${provider}`,
          metrics: { duration: Date.now() - startTime }
        };
      }
    }

    // L5: HEAL - Execute with retry and fallback
    try {
      const response = await this.executeRequest(provider, request);

      // L6: VALIDATE - Check response quality
      if (!this.isValidResponse(response)) {
        if (this.config.enableFallback) {
          return await this.fallbackRoute(prompt, options, provider);
        } else {
          return {
            success: false,
            error: 'Invalid response from provider',
            metrics: { duration: Date.now() - startTime }
          };
        }
      }

      // L7: RESPOND - Calculate cost and format response
      const cost = this.calculateCost(response, provider);
      const latency = Date.now() - startTime;

      // L8: OBSERVE - Log metrics
      this.logRequest({
        provider,
        prompt: prompt.substring(0, 100),
        latency,
        cost,
        tokens: response.usage,
        timestamp: new Date(),
        success: true
      });

      // L9: EVOLVE - Update provider stats
      this.updateProviderStats(provider, latency, cost, true);

      return {
        success: true,
        data: response.content,
        provider,
        model: PROVIDER_CONFIG[provider].model,
        cost,
        metrics: {
          latency,
          inputTokens: response.usage?.input_tokens || response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.output_tokens || response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0
        }
      };

    } catch (error) {
      this.updateProviderStats(provider, Date.now() - startTime, 0, false);

      if (this.config.enableFallback) {
        return await this.fallbackRoute(prompt, options, provider);
      } else {
        return {
          success: false,
          error: error.message,
          provider,
          metrics: { duration: Date.now() - startTime }
        };
      }
    }
  }

  /**
   * Validate request before routing
   */
  validateRequest(prompt, options) {
    if (!prompt || typeof prompt !== 'string') {
      return { valid: false, error: 'Prompt must be a non-empty string' };
    }

    if (prompt.length > 100000) {
      return { valid: false, error: 'Prompt too long (max 100k characters)' };
    }

    // Check daily cost cap
    const todayCost = this.getTodayCost();
    if (todayCost >= this.config.dailyCostCap) {
      return {
        valid: false,
        error: `Daily cost cap reached ($${this.config.dailyCostCap}). Used: $${todayCost.toFixed(4)}`
      };
    }

    return { valid: true };
  }

  /**
   * Select optimal provider based on requirements
   */
  selectProvider(options = {}) {
    const priority = options.priority || this.config.defaultPriority;
    const excludeProviders = options.excludeProviders || [];

    // Get available providers
    const available = Object.keys(PROVIDER_CONFIG).filter(p =>
      PROVIDER_CONFIG[p].enabled && !excludeProviders.includes(p)
    );

    if (available.length === 0) {
      return null;
    }

    // Specific provider requested
    if (options.provider && available.includes(options.provider)) {
      return options.provider;
    }

    // Select based on priority
    switch (priority) {
      case 'cost':
        // Use cheapest (Groq is FREE!)
        if (available.includes('groq')) return 'groq';
        if (available.includes('gemini')) return 'gemini';
        if (available.includes('moonshot')) return 'moonshot';
        return available[0];

      case 'speed':
        // Use fastest
        if (available.includes('groq')) return 'groq';
        if (available.includes('anthropic')) return 'anthropic';
        return available[0];

      case 'quality':
        // Use highest quality
        if (available.includes('anthropic')) return 'anthropic';
        if (available.includes('openai')) return 'openai';
        if (available.includes('gemini')) return 'gemini';
        return available[0];

      case 'balanced':
      default:
        // Balance cost, speed, quality
        if (available.includes('gemini')) return 'gemini';
        if (available.includes('groq')) return 'groq';
        if (available.includes('anthropic')) return 'anthropic';
        return available[0];
    }
  }

  /**
   * Format request for specific provider
   */
  formatRequest(prompt, provider, options) {
    const maxTokens = options.maxTokens || 1024;
    const temperature = options.temperature || 0.7;

    return {
      prompt,
      maxTokens,
      temperature,
      provider,
      model: options.model || PROVIDER_CONFIG[provider].model
    };
  }

  /**
   * Execute request to provider
   */
  async executeRequest(provider, request) {
    const { prompt, maxTokens, temperature, model } = request;

    switch (provider) {
      case 'anthropic':
        return await this.callAnthropic(prompt, maxTokens, temperature);

      case 'groq':
        return await this.callGroq(prompt, maxTokens, temperature);

      case 'gemini':
        return await this.callGemini(prompt, maxTokens, temperature);

      case 'openai':
        return await this.callOpenAI(prompt, maxTokens, temperature);

      case 'openrouter':
        return await this.callOpenRouter(prompt, maxTokens, temperature, model);

      case 'moonshot':
        return await this.callMoonshot(prompt, maxTokens, temperature);

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Call Anthropic/Claude API
   */
  async callAnthropic(prompt, maxTokens, temperature) {
    const message = await this.clients.anthropic.messages.create({
      model: PROVIDER_CONFIG.anthropic.model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }]
    });

    return {
      content: message.content[0].text,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
        total_tokens: message.usage.input_tokens + message.usage.output_tokens
      }
    };
  }

  /**
   * Call Groq API
   */
  async callGroq(prompt, maxTokens, temperature) {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: PROVIDER_CONFIG.groq.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    return {
      content: response.data.choices[0].message.content,
      usage: response.data.usage
    };
  }

  /**
   * Call Google Gemini API
   */
  async callGemini(prompt, maxTokens, temperature) {
    const model = this.clients.gemini.getGenerativeModel({
      model: PROVIDER_CONFIG.gemini.model
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature
      }
    });

    const response = result.response;

    return {
      content: response.text(),
      usage: {
        input_tokens: response.usageMetadata?.promptTokenCount || 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: response.usageMetadata?.totalTokenCount || 0
      }
    };
  }

  /**
   * Call OpenAI API
   */
  async callOpenAI(prompt, maxTokens, temperature) {
    const completion = await this.clients.openai.chat.completions.create({
      model: PROVIDER_CONFIG.openai.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature
    });

    return {
      content: completion.choices[0].message.content,
      usage: completion.usage
    };
  }

  /**
   * Call OpenRouter API
   */
  async callOpenRouter(prompt, maxTokens, temperature, model) {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: model || PROVIDER_CONFIG.openrouter.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    return {
      content: response.data.choices[0].message.content,
      usage: response.data.usage
    };
  }

  /**
   * Call Moonshot/Kimi API
   */
  async callMoonshot(prompt, maxTokens, temperature) {
    const response = await axios.post(
      'https://api.moonshot.cn/v1/chat/completions',
      {
        model: PROVIDER_CONFIG.moonshot.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.MOONSHOT_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    return {
      content: response.data.choices[0].message.content,
      usage: response.data.usage
    };
  }

  /**
   * Fallback to alternative provider
   */
  async fallbackRoute(prompt, options, failedProvider) {
    const excludeProviders = [...(options.excludeProviders || []), failedProvider];

    return await this.route(prompt, {
      ...options,
      excludeProviders
    });
  }

  /**
   * Check if provider is rate limited
   */
  isRateLimited(provider) {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute

    if (!this.rateLimitCounters[provider]) {
      this.rateLimitCounters[provider] = { count: 0, windowStart: now };
      return false;
    }

    const counter = this.rateLimitCounters[provider];

    // Reset counter if window expired
    if (now - counter.windowStart > windowMs) {
      counter.count = 0;
      counter.windowStart = now;
      return false;
    }

    // Check if limit exceeded
    if (counter.count >= PROVIDER_CONFIG[provider].rateLimit) {
      return true;
    }

    counter.count++;
    return false;
  }

  /**
   * Validate response from provider
   */
  isValidResponse(response) {
    return response && response.content && response.content.length > 0;
  }

  /**
   * Calculate cost of request
   */
  calculateCost(response, provider) {
    const config = PROVIDER_CONFIG[provider];
    const inputTokens = response.usage?.input_tokens || response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.output_tokens || response.usage?.completion_tokens || 0;

    const inputCost = (inputTokens / 1000) * config.costPer1kInput;
    const outputCost = (outputTokens / 1000) * config.costPer1kOutput;

    return inputCost + outputCost;
  }

  /**
   * Get today's total cost
   */
  getTodayCost() {
    const today = new Date().toDateString();

    return this.requestLog
      .filter(log => new Date(log.timestamp).toDateString() === today)
      .reduce((sum, log) => sum + log.cost, 0);
  }

  /**
   * Log request
   */
  logRequest(logEntry) {
    this.requestLog.push(logEntry);

    // Keep only last 1000 logs
    if (this.requestLog.length > 1000) {
      this.requestLog = this.requestLog.slice(-1000);
    }

    if (this.config.logLevel === 'debug' || this.config.logLevel === 'info') {
      console.log(`[LLM Router] ${logEntry.provider} | ${logEntry.latency}ms | $${logEntry.cost.toFixed(6)}`);
    }
  }

  /**
   * Update provider statistics
   */
  updateProviderStats(provider, latency, cost, success) {
    const stats = this.providerStats[provider];

    stats.totalRequests++;

    if (success) {
      stats.successfulRequests++;
    } else {
      stats.failedRequests++;
    }

    stats.totalCost += cost;
    stats.avgLatency = (stats.avgLatency + latency) / 2;
    stats.lastUsed = new Date();
  }

  /**
   * Get router statistics
   */
  getStats() {
    const totalCost = Object.values(this.providerStats).reduce((sum, stats) => sum + stats.totalCost, 0);
    const totalRequests = Object.values(this.providerStats).reduce((sum, stats) => sum + stats.totalRequests, 0);

    return {
      totalRequests,
      totalCost,
      todayCost: this.getTodayCost(),
      costCap: this.config.dailyCostCap,
      providers: this.providerStats,
      recentLogs: this.requestLog.slice(-10)
    };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default LLMRouter;
