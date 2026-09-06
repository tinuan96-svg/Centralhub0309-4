/**
 * Centralized AI Model Configuration Hierarchy
 */
export const AI_CONFIG = {
  // Canonical Model Buckets
  MODELS: {
    // 1. FAST: For deterministic extraction, simple matching, and low-cost operations
    FAST: process.env.OPENAI_MODEL_FAST || 'gpt-4o-mini',

    // 2. DEFAULT: Standard model for Customer Care, Sales Assistant, and standard generation
    DEFAULT: process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o',

    // 3. REASONING: Advanced model for complex logic, multi-step reasoning, and high-accuracy tasks
    REASONING: process.env.OPENAI_MODEL_REASONING || 'gpt-4o',
  },

  // Feature-Specific Assignments (with fallbacks)
  FEATURES: {
    CUSTOMER_CARE: process.env.OPENAI_MODEL_CUSTOMER_CARE || process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o',
    SALES_ASSISTANT: process.env.OPENAI_MODEL_SALES_AI || process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o',
    COMPETITOR_MATCHING: process.env.OPENAI_MODEL_COMPETITOR_MATCHING || process.env.OPENAI_MODEL_FAST || 'gpt-4o-mini',
    PRODUCT_EXTRACTION: process.env.OPENAI_MODEL_PRODUCT_EXTRACTION || process.env.OPENAI_MODEL_FAST || 'gpt-4o-mini',
    SEO_GENERATION: process.env.OPENAI_MODEL_SEO_GENERATION || process.env.OPENAI_MODEL_FAST || 'gpt-4o-mini',
    PROMOTION_EXPLANATION: process.env.OPENAI_MODEL_PROMOTION_EXPLANATION || process.env.OPENAI_MODEL_FAST || 'gpt-4o-mini',
  },

  DEFAULT_TEMPERATURE: 0.7,
  MAX_TOKENS_EXTRACTION: 1000,
};
