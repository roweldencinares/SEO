/**
 * NEXUS-Powered Entity Graph System
 *
 * Handles:
 * - Entity creation and management (Person, Organization, Service, Location)
 * - Relationship mapping between entities
 * - Schema.org integration
 * - Entity-based routing for subdomains
 * - Automatic interlink generation
 */

import { nexusify } from './nexus/core.js';

// ============================================================================
// ENTITY TYPES & SCHEMA
// ============================================================================

const ENTITY_TYPES = {
    PERSON: 'Person',
    ORGANIZATION: 'Organization',
    SERVICE: 'Service',
    LOCATION: 'Location',
    PRODUCT: 'Product',
    ARTICLE: 'Article',
    FAQ: 'FAQPage',
    HOW_TO: 'HowTo'
};

const RELATIONSHIP_TYPES = {
    WORKS_FOR: 'worksFor',
    OFFERS: 'offers',
    LOCATED_AT: 'locatedAt',
    ABOUT: 'about',
    AUTHOR: 'author',
    MENTIONS: 'mentions',
    PROVIDES: 'provides',
    SERVES: 'serves'
};

// In-memory entity store (upgrade to database in production)
const entities = new Map();
const relationships = new Map();

// ============================================================================
// ENTITY CRUD OPERATIONS
// ============================================================================

/**
 * Create a new entity
 */
const createEntity = nexusify(
    async (entityData) => {
        const {
            id,
            type,
            name,
            description,
            url,
            subdomain,
            metadata = {},
            schemaProperties = {}
        } = entityData;

        if (!id || !type || !name) {
            throw new Error('Entity must have id, type, and name');
        }

        if (!Object.values(ENTITY_TYPES).includes(type)) {
            throw new Error(`Invalid entity type: ${type}`);
        }

        const entity = {
            id,
            type,
            name,
            description,
            url: url || `https://${subdomain || 'www'}.spearity.com/${id}`,
            subdomain: subdomain || 'www',
            metadata,
            schemaProperties,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        entities.set(id, entity);

        return {
            entity,
            schema: generateSchemaOrg(entity)
        };
    },
    {
        service: 'entity-graph',
        mode: 'FULL'
    }
);

/**
 * Get entity by ID
 */
const getEntity = nexusify(
    async (entityId) => {
        const entity = entities.get(entityId);

        if (!entity) {
            throw new Error(`Entity not found: ${entityId}`);
        }

        // Get all relationships for this entity
        const entityRelationships = Array.from(relationships.values())
            .filter(rel => rel.from === entityId || rel.to === entityId);

        return {
            entity,
            relationships: entityRelationships,
            relatedEntities: await getRelatedEntities(entityId),
            schema: generateSchemaOrg(entity)
        };
    },
    {
        service: 'entity-graph',
        mode: 'STANDARD',
        cacheKey: null // Always fetch fresh
    }
);

/**
 * Update entity
 */
const updateEntity = nexusify(
    async (params) => {
        const { entityId, updates } = params;

        const entity = entities.get(entityId);
        if (!entity) {
            throw new Error(`Entity not found: ${entityId}`);
        }

        const updatedEntity = {
            ...entity,
            ...updates,
            id: entity.id, // Prevent ID change
            type: entity.type, // Prevent type change
            updatedAt: new Date().toISOString()
        };

        entities.set(entityId, updatedEntity);

        return {
            entity: updatedEntity,
            schema: generateSchemaOrg(updatedEntity)
        };
    },
    {
        service: 'entity-graph',
        mode: 'FULL'
    }
);

/**
 * Delete entity
 */
const deleteEntity = nexusify(
    async (entityId) => {
        const entity = entities.get(entityId);
        if (!entity) {
            throw new Error(`Entity not found: ${entityId}`);
        }

        // Remove all relationships involving this entity
        const relatedRelationships = Array.from(relationships.entries())
            .filter(([_, rel]) => rel.from === entityId || rel.to === entityId);

        relatedRelationships.forEach(([relId]) => {
            relationships.delete(relId);
        });

        entities.delete(entityId);

        return {
            deleted: true,
            entityId,
            relationshipsRemoved: relatedRelationships.length
        };
    },
    {
        service: 'entity-graph',
        mode: 'FULL'
    }
);

/**
 * List all entities with filters
 */
const listEntities = nexusify(
    async (filters = {}) => {
        const { type, subdomain, limit = 100 } = filters;

        let entityList = Array.from(entities.values());

        // Apply filters
        if (type) {
            entityList = entityList.filter(e => e.type === type);
        }

        if (subdomain) {
            entityList = entityList.filter(e => e.subdomain === subdomain);
        }

        // Limit results
        entityList = entityList.slice(0, limit);

        return {
            entities: entityList,
            total: entityList.length,
            filters: { type, subdomain, limit }
        };
    },
    {
        service: 'entity-graph',
        mode: 'STANDARD',
        cacheKey: 'entity-list',
        cacheTTL: 300
    }
);

// ============================================================================
// RELATIONSHIP MANAGEMENT
// ============================================================================

/**
 * Create relationship between entities
 */
const createRelationship = nexusify(
    async (relationshipData) => {
        const { from, to, type, metadata = {} } = relationshipData;

        if (!from || !to || !type) {
            throw new Error('Relationship must have from, to, and type');
        }

        if (!Object.values(RELATIONSHIP_TYPES).includes(type)) {
            throw new Error(`Invalid relationship type: ${type}`);
        }

        // Verify entities exist
        if (!entities.has(from)) {
            throw new Error(`Source entity not found: ${from}`);
        }
        if (!entities.has(to)) {
            throw new Error(`Target entity not found: ${to}`);
        }

        const relationshipId = `${from}:${type}:${to}`;

        const relationship = {
            id: relationshipId,
            from,
            to,
            type,
            metadata,
            createdAt: new Date().toISOString()
        };

        relationships.set(relationshipId, relationship);

        return {
            relationship,
            fromEntity: entities.get(from),
            toEntity: entities.get(to)
        };
    },
    {
        service: 'entity-graph',
        mode: 'FULL'
    }
);

/**
 * Get relationships for an entity
 */
const getRelationships = nexusify(
    async (entityId) => {
        const outgoing = Array.from(relationships.values())
            .filter(rel => rel.from === entityId);

        const incoming = Array.from(relationships.values())
            .filter(rel => rel.to === entityId);

        return {
            entityId,
            outgoing,
            incoming,
            total: outgoing.length + incoming.length
        };
    },
    {
        service: 'entity-graph',
        mode: 'STANDARD'
    }
);

/**
 * Delete relationship
 */
const deleteRelationship = nexusify(
    async (relationshipId) => {
        const relationship = relationships.get(relationshipId);
        if (!relationship) {
            throw new Error(`Relationship not found: ${relationshipId}`);
        }

        relationships.delete(relationshipId);

        return {
            deleted: true,
            relationshipId,
            from: relationship.from,
            to: relationship.to
        };
    },
    {
        service: 'entity-graph',
        mode: 'FULL'
    }
);

// ============================================================================
// ENTITY GRAPH QUERIES
// ============================================================================

/**
 * Get related entities (1-hop neighbors)
 */
async function getRelatedEntities(entityId) {
    const relatedIds = new Set();

    relationships.forEach(rel => {
        if (rel.from === entityId) relatedIds.add(rel.to);
        if (rel.to === entityId) relatedIds.add(rel.from);
    });

    return Array.from(relatedIds).map(id => entities.get(id)).filter(Boolean);
}

/**
 * Find path between two entities
 */
const findPath = nexusify(
    async (params) => {
        const { fromId, toId, maxDepth = 5 } = params;

        if (!entities.has(fromId) || !entities.has(toId)) {
            throw new Error('Both entities must exist');
        }

        // BFS to find shortest path
        const queue = [[fromId]];
        const visited = new Set([fromId]);

        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];

            if (current === toId) {
                return {
                    found: true,
                    path: path.map(id => entities.get(id)),
                    length: path.length - 1
                };
            }

            if (path.length >= maxDepth) continue;

            // Get neighbors
            relationships.forEach(rel => {
                let neighbor = null;
                if (rel.from === current) neighbor = rel.to;
                if (rel.to === current) neighbor = rel.from;

                if (neighbor && !visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push([...path, neighbor]);
                }
            });
        }

        return {
            found: false,
            path: [],
            length: -1
        };
    },
    {
        service: 'entity-graph',
        mode: 'STANDARD'
    }
);

/**
 * Get entity cluster (all connected entities)
 */
const getEntityCluster = nexusify(
    async (entityId) => {
        if (!entities.has(entityId)) {
            throw new Error(`Entity not found: ${entityId}`);
        }

        const cluster = new Set([entityId]);
        const queue = [entityId];

        while (queue.length > 0) {
            const current = queue.shift();

            relationships.forEach(rel => {
                let neighbor = null;
                if (rel.from === current) neighbor = rel.to;
                if (rel.to === current) neighbor = rel.from;

                if (neighbor && !cluster.has(neighbor)) {
                    cluster.add(neighbor);
                    queue.push(neighbor);
                }
            });
        }

        return {
            entityId,
            clusterSize: cluster.size,
            entities: Array.from(cluster).map(id => entities.get(id))
        };
    },
    {
        service: 'entity-graph',
        mode: 'STANDARD'
    }
);

/**
 * Get entities by subdomain
 */
const getEntitiesBySubdomain = nexusify(
    async (subdomain) => {
        const subdomainEntities = Array.from(entities.values())
            .filter(e => e.subdomain === subdomain);

        return {
            subdomain,
            count: subdomainEntities.length,
            entities: subdomainEntities
        };
    },
    {
        service: 'entity-graph',
        mode: 'STANDARD',
        cacheKey: null, // Cache disabled for dynamic subdomain
        cacheTTL: 300
    }
);

// ============================================================================
// SCHEMA.ORG GENERATION
// ============================================================================

/**
 * Generate Schema.org JSON-LD for an entity
 */
function generateSchemaOrg(entity) {
    const baseSchema = {
        '@context': 'https://schema.org',
        '@type': entity.type,
        '@id': entity.url,
        name: entity.name,
        url: entity.url
    };

    if (entity.description) {
        baseSchema.description = entity.description;
    }

    // Add type-specific properties
    switch (entity.type) {
        case ENTITY_TYPES.PERSON:
            if (entity.metadata.jobTitle) baseSchema.jobTitle = entity.metadata.jobTitle;
            if (entity.metadata.email) baseSchema.email = entity.metadata.email;
            break;

        case ENTITY_TYPES.ORGANIZATION:
            if (entity.metadata.logo) baseSchema.logo = entity.metadata.logo;
            if (entity.metadata.address) baseSchema.address = entity.metadata.address;
            break;

        case ENTITY_TYPES.SERVICE:
            if (entity.metadata.provider) baseSchema.provider = entity.metadata.provider;
            if (entity.metadata.price) baseSchema.offers = {
                '@type': 'Offer',
                price: entity.metadata.price,
                priceCurrency: entity.metadata.currency || 'USD'
            };
            break;

        case ENTITY_TYPES.LOCATION:
            if (entity.metadata.address) {
                baseSchema.address = {
                    '@type': 'PostalAddress',
                    ...entity.metadata.address
                };
            }
            if (entity.metadata.geo) baseSchema.geo = entity.metadata.geo;
            break;
    }

    // Merge custom schema properties
    Object.assign(baseSchema, entity.schemaProperties);

    return baseSchema;
}

/**
 * Generate Schema.org with relationships
 */
const generateSchemaWithRelationships = nexusify(
    async (entityId) => {
        const entity = entities.get(entityId);
        if (!entity) {
            throw new Error(`Entity not found: ${entityId}`);
        }

        const schema = generateSchemaOrg(entity);

        // Add relationships as Schema.org properties
        relationships.forEach(rel => {
            if (rel.from === entityId) {
                const targetEntity = entities.get(rel.to);
                if (targetEntity) {
                    // Map relationship types to Schema.org properties
                    switch (rel.type) {
                        case RELATIONSHIP_TYPES.WORKS_FOR:
                            schema.worksFor = generateSchemaOrg(targetEntity);
                            break;
                        case RELATIONSHIP_TYPES.OFFERS:
                            if (!schema.offers) schema.offers = [];
                            schema.offers.push(generateSchemaOrg(targetEntity));
                            break;
                        case RELATIONSHIP_TYPES.LOCATED_AT:
                            schema.location = generateSchemaOrg(targetEntity);
                            break;
                        case RELATIONSHIP_TYPES.AUTHOR:
                            schema.author = generateSchemaOrg(targetEntity);
                            break;
                        case RELATIONSHIP_TYPES.MENTIONS:
                            if (!schema.mentions) schema.mentions = [];
                            schema.mentions.push(generateSchemaOrg(targetEntity));
                            break;
                    }
                }
            }
        });

        return schema;
    },
    {
        service: 'entity-graph',
        mode: 'STANDARD'
    }
);

// ============================================================================
// INTERLINK GENERATION
// ============================================================================

/**
 * Generate interlinks for an entity
 */
const generateInterlinks = nexusify(
    async (entityId) => {
        const entity = entities.get(entityId);
        if (!entity) {
            throw new Error(`Entity not found: ${entityId}`);
        }

        const interlinks = [];

        // Find related entities
        relationships.forEach(rel => {
            if (rel.from === entityId || rel.to === entityId) {
                const relatedId = rel.from === entityId ? rel.to : rel.from;
                const relatedEntity = entities.get(relatedId);

                if (relatedEntity) {
                    interlinks.push({
                        url: relatedEntity.url,
                        title: relatedEntity.name,
                        relationship: rel.type,
                        subdomain: relatedEntity.subdomain,
                        type: relatedEntity.type,
                        anchorText: generateAnchorText(rel.type, relatedEntity)
                    });
                }
            }
        });

        return {
            entityId,
            entityUrl: entity.url,
            interlinks,
            count: interlinks.length
        };
    },
    {
        service: 'entity-graph',
        mode: 'STANDARD'
    }
);

/**
 * Generate appropriate anchor text based on relationship
 */
function generateAnchorText(relationshipType, targetEntity) {
    switch (relationshipType) {
        case RELATIONSHIP_TYPES.OFFERS:
            return `Learn about ${targetEntity.name}`;
        case RELATIONSHIP_TYPES.WORKS_FOR:
            return `Meet our team at ${targetEntity.name}`;
        case RELATIONSHIP_TYPES.LOCATED_AT:
            return `Visit us at ${targetEntity.name}`;
        case RELATIONSHIP_TYPES.AUTHOR:
            return `Written by ${targetEntity.name}`;
        case RELATIONSHIP_TYPES.ABOUT:
            return `More about ${targetEntity.name}`;
        default:
            return targetEntity.name;
    }
}

/**
 * Generate sitemap with entity-based organization
 */
const generateEntitySitemap = nexusify(
    async (subdomain) => {
        const subdomainEntities = subdomain
            ? Array.from(entities.values()).filter(e => e.subdomain === subdomain)
            : Array.from(entities.values());

        const sitemapEntries = subdomainEntities.map(entity => ({
            loc: entity.url,
            lastmod: entity.updatedAt,
            changefreq: 'weekly',
            priority: entity.type === ENTITY_TYPES.ORGANIZATION ? '1.0' :
                     entity.type === ENTITY_TYPES.SERVICE ? '0.8' :
                     entity.type === ENTITY_TYPES.ARTICLE ? '0.6' : '0.5'
        }));

        return {
            subdomain: subdomain || 'all',
            entries: sitemapEntries,
            count: sitemapEntries.length
        };
    },
    {
        service: 'entity-graph',
        mode: 'STANDARD',
        cacheKey: null, // Cache disabled for dynamic subdomain
        cacheTTL: 3600
    }
);

// ============================================================================
// ANALYTICS & INSIGHTS
// ============================================================================

/**
 * Get entity graph statistics
 */
const getGraphStats = nexusify(
    async () => {
        const stats = {
            totalEntities: entities.size,
            totalRelationships: relationships.size,
            entityTypes: {},
            subdomains: {},
            avgRelationshipsPerEntity: 0
        };

        // Count by type
        entities.forEach(entity => {
            stats.entityTypes[entity.type] = (stats.entityTypes[entity.type] || 0) + 1;
            stats.subdomains[entity.subdomain] = (stats.subdomains[entity.subdomain] || 0) + 1;
        });

        // Calculate average relationships
        const entityRelationshipCounts = new Map();
        relationships.forEach(rel => {
            entityRelationshipCounts.set(rel.from, (entityRelationshipCounts.get(rel.from) || 0) + 1);
            entityRelationshipCounts.set(rel.to, (entityRelationshipCounts.get(rel.to) || 0) + 1);
        });

        stats.avgRelationshipsPerEntity = entities.size > 0
            ? Array.from(entityRelationshipCounts.values()).reduce((a, b) => a + b, 0) / entities.size
            : 0;

        return stats;
    },
    {
        service: 'entity-graph',
        mode: 'LITE',
        cacheKey: 'graph-stats',
        cacheTTL: 300
    }
);

// ============================================================================
// EXPORTS
// ============================================================================

export {
    // Entity CRUD
    createEntity,
    getEntity,
    updateEntity,
    deleteEntity,
    listEntities,

    // Relationships
    createRelationship,
    getRelationships,
    deleteRelationship,

    // Queries
    findPath,
    getEntityCluster,
    getEntitiesBySubdomain,

    // Schema
    generateSchemaWithRelationships,

    // Interlinks
    generateInterlinks,
    generateEntitySitemap,

    // Analytics
    getGraphStats,

    // Constants
    ENTITY_TYPES,
    RELATIONSHIP_TYPES
};

export default {
    createEntity,
    getEntity,
    updateEntity,
    deleteEntity,
    listEntities,
    createRelationship,
    getRelationships,
    deleteRelationship,
    findPath,
    getEntityCluster,
    getEntitiesBySubdomain,
    generateSchemaWithRelationships,
    generateInterlinks,
    generateEntitySitemap,
    getGraphStats,
    ENTITY_TYPES,
    RELATIONSHIP_TYPES
};
