/**
 * JSON-LD Schema Generator
 * Generates Schema.org markup for SEO and AI Overviews
 * Supports: Organization, Service, FAQ, HowTo, LocalBusiness, BlogPosting
 */

// ============================================================================
// SCHEMA TEMPLATES
// ============================================================================

/**
 * Generate Organization Schema
 * @param {Object} data - Organization details
 * @returns {Object} JSON-LD schema
 */
export function generateOrganizationSchema(data) {
  const {
    name = 'Your Organization',
    url = '',
    logo = '',
    description = 'Your organization description',
    telephone = '',
    email = '',
    address = {
      streetAddress: '',
      addressLocality: '',
      addressRegion: '',
      postalCode: '',
      addressCountry: 'US'
    },
    sameAs = []
  } = data;

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": name,
    "url": url,
    "logo": logo,
    "description": description,
    "contactPoint": {
      "@type": "ContactPoint",
      "telephone": telephone,
      "email": email,
      "contactType": "Customer Service",
      "areaServed": "US",
      "availableLanguage": "English"
    },
    "address": {
      "@type": "PostalAddress",
      ...address
    },
    "sameAs": sameAs
  };
}

/**
 * Generate LocalBusiness Schema
 * @param {Object} data - Business details
 * @returns {Object} JSON-LD schema
 */
export function generateLocalBusinessSchema(data) {
  const {
    name = 'Your Site',
    image = 'https://www.example.com/wp-content/uploads/2024/business-photo.jpg',
    priceRange = '$$',
    telephone = '414-265-5755',
    address = {
      streetAddress: '313 N Plankinton Ave',
      addressLocality: 'Milwaukee',
      addressRegion: 'WI',
      postalCode: '53203',
      addressCountry: 'US'
    },
    geo = {
      latitude: 43.0389,
      longitude: -87.9065
    },
    openingHours = [
      'Mo-Fr 09:00-17:00'
    ],
    url = 'https://www.example.com'
  } = data;

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": name,
    "image": image,
    "@id": url,
    "url": url,
    "telephone": telephone,
    "priceRange": priceRange,
    "address": {
      "@type": "PostalAddress",
      ...address
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": geo.latitude,
      "longitude": geo.longitude
    },
    "openingHoursSpecification": openingHours.map(hours => {
      const [days, time] = hours.split(' ');
      const [open, close] = time.split('-');

      return {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": parseDaysOfWeek(days),
        "opens": open,
        "closes": close
      };
    })
  };
}

/**
 * Generate Service Schema
 * @param {Object} data - Service details
 * @returns {Object} JSON-LD schema
 */
export function generateServiceSchema(data) {
  const {
    name,
    description,
    provider = {
      "@type": "Organization",
      "name": "Your Site",
      "url": "https://www.example.com"
    },
    areaServed = {
      "@type": "City",
      "name": "Milwaukee",
      "containedIn": {
        "@type": "State",
        "name": "Wisconsin"
      }
    },
    category = 'Business Coaching',
    url
  } = data;

  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "serviceType": name,
    "name": name,
    "description": description,
    "provider": provider,
    "areaServed": areaServed,
    "category": category,
    "url": url
  };
}

/**
 * Generate ProfessionalService Schema (more specific than Service)
 * @param {Object} data - Professional service details
 * @returns {Object} JSON-LD schema
 */
export function generateProfessionalServiceSchema(data) {
  const baseSchema = generateServiceSchema(data);

  return {
    ...baseSchema,
    "@type": "ProfessionalService",
    "priceRange": data.priceRange || '$$'
  };
}

/**
 * Generate FAQ Schema
 * @param {Object} data - FAQ details
 * @returns {Object} JSON-LD schema
 */
export function generateFAQSchema(data) {
  const { questions } = data;

  if (!questions || questions.length === 0) {
    throw new Error('FAQ schema requires at least one question');
  }

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": questions.map(q => ({
      "@type": "Question",
      "name": q.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": q.answer
      }
    }))
  };
}

/**
 * Generate HowTo Schema
 * @param {Object} data - HowTo details
 * @returns {Object} JSON-LD schema
 */
export function generateHowToSchema(data) {
  const {
    name,
    description,
    totalTime = 'PT30M', // ISO 8601 duration format
    steps,
    image,
    estimatedCost,
    tool = [],
    supply = []
  } = data;

  if (!steps || steps.length === 0) {
    throw new Error('HowTo schema requires at least one step');
  }

  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": name,
    "description": description,
    "image": image,
    "totalTime": totalTime,
    "estimatedCost": estimatedCost ? {
      "@type": "MonetaryAmount",
      "currency": "USD",
      "value": estimatedCost
    } : undefined,
    "tool": tool.map(t => ({ "@type": "HowToTool", "name": t })),
    "supply": supply.map(s => ({ "@type": "HowToSupply", "name": s })),
    "step": steps.map((step, index) => ({
      "@type": "HowToStep",
      "position": index + 1,
      "name": step.name,
      "text": step.text,
      "image": step.image,
      "url": step.url
    }))
  };
}

/**
 * Generate BlogPosting Schema
 * @param {Object} data - Blog post details
 * @returns {Object} JSON-LD schema
 */
export function generateBlogPostingSchema(data) {
  const {
    headline,
    description,
    image,
    datePublished,
    dateModified,
    author = {
      "@type": "Organization",
      "name": "Your Site",
      "url": "https://www.example.com"
    },
    publisher = {
      "@type": "Organization",
      "name": "Your Site",
      "logo": {
        "@type": "ImageObject",
        "url": "https://www.example.com/wp-content/uploads/2024/logo.png"
      }
    },
    url,
    wordCount,
    keywords = []
  } = data;

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": headline,
    "description": description,
    "image": image,
    "datePublished": datePublished,
    "dateModified": dateModified || datePublished,
    "author": author,
    "publisher": publisher,
    "url": url,
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": url
    },
    "wordCount": wordCount,
    "keywords": keywords.join(', ')
  };
}

/**
 * Generate Article Schema
 * @param {Object} data - Article details
 * @returns {Object} JSON-LD schema
 */
export function generateArticleSchema(data) {
  const blogSchema = generateBlogPostingSchema(data);

  return {
    ...blogSchema,
    "@type": "Article",
    "articleSection": data.section || 'Business Coaching'
  };
}

/**
 * Generate Breadcrumb Schema
 * @param {Object} data - Breadcrumb trail
 * @returns {Object} JSON-LD schema
 */
export function generateBreadcrumbSchema(data) {
  const { items } = data;

  if (!items || items.length === 0) {
    throw new Error('Breadcrumb schema requires at least one item');
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": item.url
    }))
  };
}

/**
 * Generate Review Schema
 * @param {Object} data - Review details
 * @returns {Object} JSON-LD schema
 */
export function generateReviewSchema(data) {
  const {
    itemReviewed,
    reviewRating,
    author,
    reviewBody,
    datePublished
  } = data;

  return {
    "@context": "https://schema.org",
    "@type": "Review",
    "itemReviewed": {
      "@type": "Organization",
      "name": itemReviewed.name || "Your Site",
      "url": itemReviewed.url || "https://www.example.com"
    },
    "reviewRating": {
      "@type": "Rating",
      "ratingValue": reviewRating.value,
      "bestRating": reviewRating.best || 5
    },
    "author": {
      "@type": "Person",
      "name": author
    },
    "reviewBody": reviewBody,
    "datePublished": datePublished
  };
}

/**
 * Generate AggregateRating Schema
 * @param {Object} data - Rating details
 * @returns {Object} JSON-LD schema
 */
export function generateAggregateRatingSchema(data) {
  const {
    itemReviewed,
    ratingValue,
    ratingCount,
    reviewCount,
    bestRating = 5,
    worstRating = 1
  } = data;

  return {
    "@context": "https://schema.org",
    "@type": "AggregateRating",
    "itemReviewed": {
      "@type": "Organization",
      "name": itemReviewed.name || "Your Site"
    },
    "ratingValue": ratingValue,
    "ratingCount": ratingCount,
    "reviewCount": reviewCount,
    "bestRating": bestRating,
    "worstRating": worstRating
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse days of week shorthand (e.g., "Mo-Fr" to array)
 */
function parseDaysOfWeek(daysStr) {
  const dayMap = {
    'Mo': 'Monday',
    'Tu': 'Tuesday',
    'We': 'Wednesday',
    'Th': 'Thursday',
    'Fr': 'Friday',
    'Sa': 'Saturday',
    'Su': 'Sunday'
  };

  if (daysStr.includes('-')) {
    // Range like "Mo-Fr"
    const [start, end] = daysStr.split('-');
    const days = Object.keys(dayMap);
    const startIdx = days.indexOf(start);
    const endIdx = days.indexOf(end);

    return days.slice(startIdx, endIdx + 1).map(d => dayMap[d]);
  }

  // Single day or comma-separated
  return daysStr.split(',').map(d => dayMap[d.trim()]);
}

/**
 * Generate schema based on type
 * @param {string} type - Schema type
 * @param {Object} data - Schema data
 * @returns {Object} JSON-LD schema
 */
export function generateSchema(type, data) {
  const generators = {
    'Organization': generateOrganizationSchema,
    'LocalBusiness': generateLocalBusinessSchema,
    'Service': generateServiceSchema,
    'ProfessionalService': generateProfessionalServiceSchema,
    'FAQ': generateFAQSchema,
    'HowTo': generateHowToSchema,
    'BlogPosting': generateBlogPostingSchema,
    'Article': generateArticleSchema,
    'Breadcrumb': generateBreadcrumbSchema,
    'Review': generateReviewSchema,
    'AggregateRating': generateAggregateRatingSchema
  };

  const generator = generators[type];

  if (!generator) {
    throw new Error(`Unknown schema type: ${type}`);
  }

  return generator(data);
}

/**
 * Render schema as HTML script tag
 * @param {Object} schema - JSON-LD schema object
 * @returns {string} HTML script tag
 */
export function renderSchemaTag(schema) {
  return `<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>`;
}

/**
 * Validate schema structure (basic validation)
 * @param {Object} schema - JSON-LD schema
 * @returns {Object} Validation result
 */
export function validateSchema(schema) {
  const errors = [];
  const warnings = [];

  // Check required fields
  if (!schema['@context']) {
    errors.push('Missing @context field');
  }

  if (!schema['@type']) {
    errors.push('Missing @type field');
  }

  // Type-specific validation
  if (schema['@type'] === 'Organization') {
    if (!schema.name) errors.push('Organization requires name');
    if (!schema.url) warnings.push('Organization should have url');
  }

  if (schema['@type'] === 'Service') {
    if (!schema.serviceType && !schema.name) {
      errors.push('Service requires serviceType or name');
    }
  }

  if (schema['@type'] === 'FAQPage') {
    if (!schema.mainEntity || schema.mainEntity.length === 0) {
      errors.push('FAQPage requires at least one question');
    }
  }

  if (schema['@type'] === 'HowTo') {
    if (!schema.name) errors.push('HowTo requires name');
    if (!schema.step || schema.step.length === 0) {
      errors.push('HowTo requires at least one step');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ============================================================================
// EXPORT ALL GENERATORS
// ============================================================================

export default {
  generateOrganizationSchema,
  generateLocalBusinessSchema,
  generateServiceSchema,
  generateProfessionalServiceSchema,
  generateFAQSchema,
  generateHowToSchema,
  generateBlogPostingSchema,
  generateArticleSchema,
  generateBreadcrumbSchema,
  generateReviewSchema,
  generateAggregateRatingSchema,
  generateSchema,
  renderSchemaTag,
  validateSchema
};
