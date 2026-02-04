/**
 * Schema WordPress Integration
 * Manages JSON-LD schema injection into WordPress pages via REST API
 */

import { headers, WORDPRESS_URL } from '../wp-api.js';
import { generateSchema, renderSchemaTag, validateSchema } from './schema-generator.js';

// ============================================================================
// WORDPRESS SCHEMA MANAGEMENT
// ============================================================================

/**
 * Add schema to WordPress page/post
 * @param {number} pageId - WordPress page/post ID
 * @param {Object} schema - JSON-LD schema object
 * @param {string} method - 'custom_field' or 'content_injection'
 * @returns {Promise<Object>} Result
 */
export async function addSchemaToPage(pageId, schema, method = 'custom_field') {
  try {
    // Validate schema first
    const validation = validateSchema(schema);

    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors
      };
    }

    if (method === 'custom_field') {
      // Store schema in custom field (recommended)
      return await addSchemaViaCustomField(pageId, schema);
    } else {
      // Inject into content (alternative)
      return await addSchemaViaContent(pageId, schema);
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Add schema via WordPress custom field
 * @param {number} pageId - Page/post ID
 * @param {Object} schema - Schema object
 * @returns {Promise<Object>} Result
 */
async function addSchemaViaCustomField(pageId, schema) {
  const schemaJson = JSON.stringify(schema);

  const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/pages/${pageId}`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      meta: {
        _schema_org_json: schemaJson
      }
    })
  });

  const data = await response.json();

  if (response.ok) {
    return {
      success: true,
      pageId: pageId,
      schema: schema,
      method: 'custom_field'
    };
  } else {
    return {
      success: false,
      error: data.message || 'Failed to add schema'
    };
  }
}

/**
 * Add schema by injecting into page content
 * @param {number} pageId - Page/post ID
 * @param {Object} schema - Schema object
 * @returns {Promise<Object>} Result
 */
async function addSchemaViaContent(pageId, schema) {
  // Get current content
  const getResponse = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/pages/${pageId}`, {
    headers: headers
  });

  const page = await getResponse.json();
  const currentContent = page.content.rendered;

  // Remove existing schema if present
  const cleanContent = currentContent.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/g,
    ''
  );

  // Add new schema at the end
  const schemaTag = renderSchemaTag(schema);
  const newContent = cleanContent + '\n\n' + schemaTag;

  // Update page
  const updateResponse = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/pages/${pageId}`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      content: newContent
    })
  });

  const data = await updateResponse.json();

  if (updateResponse.ok) {
    return {
      success: true,
      pageId: pageId,
      schema: schema,
      method: 'content_injection'
    };
  } else {
    return {
      success: false,
      error: data.message || 'Failed to inject schema'
    };
  }
}

/**
 * Get schema from WordPress page
 * @param {number} pageId - Page/post ID
 * @returns {Promise<Object|null>} Schema object or null
 */
export async function getSchemaFromPage(pageId) {
  try {
    const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/pages/${pageId}`, {
      headers: headers
    });

    const page = await response.json();

    // Try custom field first
    if (page.meta && page.meta._schema_org_json) {
      return JSON.parse(page.meta._schema_org_json);
    }

    // Try extracting from content
    const content = page.content.rendered;
    const schemaMatch = content.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);

    if (schemaMatch) {
      return JSON.parse(schemaMatch[1]);
    }

    return null;
  } catch (error) {
    console.error('Error getting schema:', error);
    return null;
  }
}

/**
 * Remove schema from WordPress page
 * @param {number} pageId - Page/post ID
 * @returns {Promise<Object>} Result
 */
export async function removeSchemaFromPage(pageId) {
  try {
    // Remove custom field
    const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/pages/${pageId}`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        meta: {
          _schema_org_json: ''
        }
      })
    });

    const data = await response.json();

    if (response.ok) {
      return {
        success: true,
        pageId: pageId
      };
    } else {
      return {
        success: false,
        error: data.message
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Add Organization schema to homepage
 * @returns {Promise<Object>} Result
 */
export async function addOrganizationSchemaToHomepage() {
  // Get homepage (usually ID 2 in WordPress)
  const pagesResponse = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/pages?per_page=100`, {
    headers: headers
  });

  const pages = await pagesResponse.json();
  const homepage = pages.find(p => p.slug === 'home' || p.slug === '' || p.type === 'page' && p.parent === 0);

  if (!homepage) {
    return {
      success: false,
      error: 'Homepage not found'
    };
  }

  const schema = generateSchema('Organization', {
    name: 'Spearity',
    url: 'https://www.spearity.com',
    description: 'Leadership and business coaching services in Milwaukee, Wisconsin'
  });

  return await addSchemaToPage(homepage.id, schema);
}

/**
 * Add Service schema to all service pages
 * @param {Array} servicePages - Array of {pageId, name, description}
 * @returns {Promise<Array>} Results
 */
export async function addServiceSchemaToPages(servicePages) {
  const results = [];

  for (const page of servicePages) {
    const schema = generateSchema('Service', {
      name: page.name,
      description: page.description,
      url: page.url || `https://www.spearity.com/${page.slug}`
    });

    const result = await addSchemaToPage(page.pageId, schema);
    results.push({
      pageId: page.pageId,
      name: page.name,
      ...result
    });
  }

  return results;
}

/**
 * Add FAQ schema to FAQ page
 * @param {number} pageId - FAQ page ID
 * @param {Array} questions - Array of {question, answer}
 * @returns {Promise<Object>} Result
 */
export async function addFAQSchemaToPage(pageId, questions) {
  const schema = generateSchema('FAQ', { questions });
  return await addSchemaToPage(pageId, schema);
}

/**
 * Add BlogPosting schema to all blog posts
 * @param {Array} postIds - Array of post IDs (optional, will fetch all if not provided)
 * @returns {Promise<Array>} Results
 */
export async function addBlogSchemaToAllPosts(postIds = null) {
  // Get all posts if not provided
  let posts;

  if (!postIds) {
    const postsResponse = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100`, {
      headers: headers
    });
    posts = await postsResponse.json();
  } else {
    posts = await Promise.all(
      postIds.map(id =>
        fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${id}`, { headers }).then(r => r.json())
      )
    );
  }

  const results = [];

  for (const post of posts) {
    const schema = generateSchema('BlogPosting', {
      headline: post.title.rendered,
      description: post.excerpt.rendered.replace(/<[^>]*>/g, '').substring(0, 160),
      datePublished: post.date,
      dateModified: post.modified,
      url: post.link,
      image: post.featured_media ? await getMediaUrl(post.featured_media) : undefined
    });

    const result = await addSchemaToPage(post.id, schema);
    results.push({
      postId: post.id,
      title: post.title.rendered,
      ...result
    });
  }

  return results;
}

/**
 * Get media URL from media ID
 * @param {number} mediaId - WordPress media ID
 * @returns {Promise<string|null>} Media URL
 */
async function getMediaUrl(mediaId) {
  try {
    const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/media/${mediaId}`, {
      headers: headers
    });
    const media = await response.json();
    return media.source_url;
  } catch (error) {
    return null;
  }
}

// ============================================================================
// SCHEMA AUDIT
// ============================================================================

/**
 * Audit all pages for schema markup
 * @returns {Promise<Object>} Audit results
 */
export async function auditAllSchemas() {
  // Get all pages
  const pagesResponse = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/pages?per_page=100`, {
    headers: headers
  });
  const pages = await pagesResponse.json();

  // Get all posts
  const postsResponse = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100`, {
    headers: headers
  });
  const posts = await postsResponse.json();

  const allPages = [...pages, ...posts];

  const results = {
    total: allPages.length,
    withSchema: 0,
    withoutSchema: 0,
    invalid: 0,
    pages: []
  };

  for (const page of allPages) {
    const schema = await getSchemaFromPage(page.id);

    let status = 'none';
    let validation = null;

    if (schema) {
      results.withSchema++;
      validation = validateSchema(schema);

      if (validation.valid) {
        status = 'valid';
      } else {
        status = 'invalid';
        results.invalid++;
      }
    } else {
      results.withoutSchema++;
    }

    results.pages.push({
      id: page.id,
      title: page.title.rendered,
      url: page.link,
      status: status,
      schemaType: schema ? schema['@type'] : null,
      validation: validation,
      hasSchema: !!schema
    });
  }

  return results;
}

/**
 * Get recommended schemas for a page based on content
 * @param {number} pageId - Page ID
 * @returns {Promise<Object>} Recommendations
 */
export async function getSchemaRecommendations(pageId) {
  const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/pages/${pageId}`, {
    headers: headers
  });

  const page = await response.json();
  const title = page.title.rendered.toLowerCase();
  const content = page.content.rendered.toLowerCase();
  const slug = page.slug;

  const recommendations = [];

  // Homepage → Organization
  if (slug === 'home' || slug === '' || page.parent === 0) {
    recommendations.push({
      type: 'Organization',
      priority: 'high',
      reason: 'This appears to be the homepage'
    });
  }

  // Service pages
  if (title.includes('coaching') || title.includes('service') || content.includes('our services')) {
    recommendations.push({
      type: 'Service',
      priority: 'high',
      reason: 'This appears to be a service page'
    });
  }

  // FAQ pages
  if (title.includes('faq') || title.includes('question') || content.includes('<dt>') || content.includes('?')) {
    recommendations.push({
      type: 'FAQ',
      priority: 'high',
      reason: 'This appears to contain FAQs'
    });
  }

  // How-to guides
  if (title.includes('how to') || title.includes('guide') || content.includes('step 1')) {
    recommendations.push({
      type: 'HowTo',
      priority: 'medium',
      reason: 'This appears to be a how-to guide'
    });
  }

  // Blog posts
  if (page.type === 'post') {
    recommendations.push({
      type: 'BlogPosting',
      priority: 'high',
      reason: 'This is a blog post'
    });
  }

  // Contact/about pages
  if (title.includes('contact') || title.includes('about')) {
    recommendations.push({
      type: 'Organization',
      priority: 'medium',
      reason: 'Contact/about pages benefit from Organization schema'
    });
  }

  return {
    pageId: pageId,
    title: page.title.rendered,
    recommendations: recommendations
  };
}

// Export all functions
export default {
  addSchemaToPage,
  getSchemaFromPage,
  removeSchemaFromPage,
  addOrganizationSchemaToHomepage,
  addServiceSchemaToPages,
  addFAQSchemaToPage,
  addBlogSchemaToAllPosts,
  auditAllSchemas,
  getSchemaRecommendations
};
