/**
 * NEXUS-Powered Entity Graph System (Database-Backed)
 *
 * Handles:
 * - Entity creation and management (Person, Organization, Service, Location)
 * - Relationship mapping between entities
 * - Schema.org integration
 * - Entity-based routing for subdomains
 * - Automatic interlink generation
 * - PostgreSQL/Supabase persistence
 */

import { nexusify } from './nexus/core.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
            schema_properties: schemaProperties
        };

        const { data, error } = await supabase
            .from('entities')
            .insert([entity])
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to create entity: ${error.message}`);
        }

        return {
            entity: data,
            schema: generateSchemaOrg(data)
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
        const { data: entity, error } = await supabase
            .from('entities')
            .select('*')
            .eq('id', entityId)
            .single();

        if (error || !entity) {
            throw new Error(`Entity not found: ${entityId}`);
        }

        // Get all relationships for this entity
        const { data: relationships } = await supabase
            .from('entity_relationships')
            .select('*')
            .or(`from_entity_id.eq.${entityId},to_entity_id.eq.${entityId}`);

        // Get related entities
        const relatedEntities = await getRelatedEntities(entityId);

        return {
            entity,
            relationships: relationships || [],
            relatedEntities,
            schema: generateSchemaOrg(entity)
        };
    },
    {
        service: 'entity-graph',
        mode: 'STANDARD',
        cacheKey: null
    }
);

/**
 * Update entity
 */
const updateEntity = nexusify(
    async (params) => {
        const { entityId, updates } = params;

        // Remove id and type from updates (cannot be changed)
        const { id, type, ...allowedUpdates } = updates;

        const { data, error } = await supabase
            .from('entities')
            .update(allowedUpdates)
            .eq('id', entityId)
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to update entity: ${error.message}`);
        }

        return {
            entity: data,
            schema: generateSchemaOrg(data)
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
        // Get relationships count before deletion
        const { count: relationshipsCount } = await supabase
            .from('entity_relationships')
            .select('*', { count: 'exact', head: true })
            .or(`from_entity_id.eq.${entityId},to_entity_id.eq.${entityId}`);

        const { error } = await supabase
            .from('entities')
            .delete()
            .eq('id', entityId);

        if (error) {
            throw new Error(`Failed to delete entity: ${error.message}`);
        }

        return {
            deleted: true,
            entityId,
            relationshipsRemoved: relationshipsCount || 0
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

        let query = supabase.from('entities').select('*');

        if (type) {
            query = query.eq('type', type);
        }

        if (subdomain) {
            query = query.eq('subdomain', subdomain);
        }

        query = query.limit(limit).order('created_at', { ascending: false });

        const { data, error } = await query;

        if (error) {
            throw new Error(`Failed to list entities: ${error.message}`);
        }

        return {
            entities: data || [],
            total: data?.length || 0,
            filters: { type, subdomain, limit }
        };
    },
    {
        service: 'entity-graph',
        mode: 'STANDARD',
        cacheKey: null,
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
        const { data: fromEntity } = await supabase
            .from('entities')
            .select('*')
            .eq('id', from)
            .single();

        const { data: toEntity } = await supabase
            .from('entities')
            .select('*')
            .eq('id', to)
            .single();

        if (!fromEntity) {
            throw new Error(`Source entity not found: ${from}`);
        }
        if (!toEntity) {
            throw new Error(`Target entity not found: ${to}`);
        }

        const relationshipId = `${from}:${type}:${to}`;

        const { data, error } = await supabase
            .from('entity_relationships')
            .insert([{
                id: relationshipId,
                from_entity_id: from,
                to_entity_id: to,
                type,
                metadata
            }])
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to create relationship: ${error.message}`);
        }

        return {
            relationship: data,
            fromEntity,
            toEntity
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
        const { data: outgoing } = await supabase
            .from('entity_relationships')
            .select('*')
            .eq('from_entity_id', entityId);

        const { data: incoming } = await supabase
            .from('entity_relationships')
            .select('*')
            .eq('to_entity_id', entityId);

        return {
            entityId,
            outgoing: outgoing || [],
            incoming: incoming || [],
            total: (outgoing?.length || 0) + (incoming?.length || 0)
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
        const { data: relationship } = await supabase
            .from('entity_relationships')
            .select('*')
            .eq('id', relationshipId)
            .single();

        if (!relationship) {
            throw new Error(`Relationship not found: ${relationshipId}`);
        }

        const { error } = await supabase
            .from('entity_relationships')
            .delete()
            .eq('id', relationshipId);

        if (error) {
            throw new Error(`Failed to delete relationship: ${error.message}`);
        }

        return {
            deleted: true,
            relationshipId,
            from: relationship.from_entity_id,
            to: relationship.to_entity_id
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
    const { data: relationships } = await supabase
        .from('entity_relationships')
        .select('*')
        .or(`from_entity_id.eq.${entityId},to_entity_id.eq.${entityId}`);

    if (!relationships || relationships.length === 0) {
        return [];
    }

    const relatedIds = new Set();
    relationships.forEach(rel => {
        if (rel.from_entity_id === entityId) relatedIds.add(rel.to_entity_id);
        if (rel.to_entity_id === entityId) relatedIds.add(rel.from_entity_id);
    });

    const { data: entities } = await supabase
        .from('entities')
        .select('*')
        .in('id', Array.from(relatedIds));

    return entities || [];
}

/**
 * Find path between two entities
 */
const findPath = nexusify(
    async (params) => {
        const { fromId, toId, maxDepth = 5 } = params;

        // Verify entities exist
        const { data: fromEntity } = await supabase
            .from('entities')
            .select('*')
            .eq('id', fromId)
            .single();

        const { data: toEntity } = await supabase
            .from('entities')
            .select('*')
            .eq('id', toId)
            .single();

        if (!fromEntity || !toEntity) {
            throw new Error('Both entities must exist');
        }

        // Get all relationships for BFS
        const { data: allRelationships } = await supabase
            .from('entity_relationships')
            .select('*');

        // BFS to find shortest path
        const queue = [[fromId]];
        const visited = new Set([fromId]);

        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];

            if (current === toId) {
                // Fetch entity details for path
                const { data: pathEntities } = await supabase
                    .from('entities')
                    .select('*')
                    .in('id', path);

                // Order entities by path
                const orderedEntities = path.map(id =>
                    pathEntities.find(e => e.id === id)
                );

                return {
                    found: true,
                    path: orderedEntities,
                    length: path.length - 1
                };
            }

            if (path.length >= maxDepth) continue;

            // Get neighbors
            allRelationships.forEach(rel => {
                let neighbor = null;
                if (rel.from_entity_id === current) neighbor = rel.to_entity_id;
                if (rel.to_entity_id === current) neighbor = rel.from_entity_id;

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
        const { data: entity } = await supabase
            .from('entities')
            .select('*')
            .eq('id', entityId)
            .single();

        if (!entity) {
            throw new Error(`Entity not found: ${entityId}`);
        }

        // Get all relationships
        const { data: allRelationships } = await supabase
            .from('entity_relationships')
            .select('*');

        const cluster = new Set([entityId]);
        const queue = [entityId];

        while (queue.length > 0) {
            const current = queue.shift();

            allRelationships.forEach(rel => {
                let neighbor = null;
                if (rel.from_entity_id === current) neighbor = rel.to_entity_id;
                if (rel.to_entity_id === current) neighbor = rel.from_entity_id;

                if (neighbor && !cluster.has(neighbor)) {
                    cluster.add(neighbor);
                    queue.push(neighbor);
                }
            });
        }

        const { data: clusterEntities } = await supabase
            .from('entities')
            .select('*')
            .in('id', Array.from(cluster));

        return {
            entityId,
            clusterSize: cluster.size,
            entities: clusterEntities || []
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
        const { data, error } = await supabase
            .from('entities')
            .select('*')
            .eq('subdomain', subdomain)
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(`Failed to get entities: ${error.message}`);
        }

        return {
            subdomain,
            count: data?.length || 0,
            entities: data || []
        };
    },
    {
        service: 'entity-graph',
        mode: 'STANDARD',
        cacheKey: null,
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

    // Add type-specific properties from metadata
    switch (entity.type) {
        case ENTITY_TYPES.PERSON:
            if (entity.metadata?.jobTitle) baseSchema.jobTitle = entity.metadata.jobTitle;
            if (entity.metadata?.email) baseSchema.email = entity.metadata.email;
            break;

        case ENTITY_TYPES.ORGANIZATION:
            if (entity.metadata?.logo) baseSchema.logo = entity.metadata.logo;
            if (entity.metadata?.address) baseSchema.address = entity.metadata.address;
            break;

        case ENTITY_TYPES.SERVICE:
            if (entity.metadata?.provider) baseSchema.provider = entity.metadata.provider;
            if (entity.metadata?.price) baseSchema.offers = {
                '@type': 'Offer',
                price: entity.metadata.price,
                priceCurrency: entity.metadata.currency || 'USD'
            };
            break;

        case ENTITY_TYPES.LOCATION:
            if (entity.metadata?.address) {
                baseSchema.address = {
                    '@type': 'PostalAddress',
                    ...entity.metadata.address
                };
            }
            if (entity.metadata?.geo) baseSchema.geo = entity.metadata.geo;
            break;
    }

    // Merge custom schema properties
    Object.assign(baseSchema, entity.schema_properties || {});

    return baseSchema;
}

/**
 * Generate Schema.org with relationships
 */
const generateSchemaWithRelationships = nexusify(
    async (entityId) => {
        const { data: entity } = await supabase
            .from('entities')
            .select('*')
            .eq('id', entityId)
            .single();

        if (!entity) {
            throw new Error(`Entity not found: ${entityId}`);
        }

        const schema = generateSchemaOrg(entity);

        // Get outgoing relationships
        const { data: relationships } = await supabase
            .from('entity_relationships')
            .select('*, to_entity:entities!entity_relationships_to_entity_id_fkey(*)')
            .eq('from_entity_id', entityId);

        if (relationships) {
            relationships.forEach(rel => {
                const targetEntity = rel.to_entity;
                if (targetEntity) {
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
            });
        }

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
        const { data: entity } = await supabase
            .from('entities')
            .select('*')
            .eq('id', entityId)
            .single();

        if (!entity) {
            throw new Error(`Entity not found: ${entityId}`);
        }

        // Get all related entities through relationships
        const { data: relationships } = await supabase
            .from('entity_relationships')
            .select(`
                *,
                from_entity:entities!entity_relationships_from_entity_id_fkey(*),
                to_entity:entities!entity_relationships_to_entity_id_fkey(*)
            `)
            .or(`from_entity_id.eq.${entityId},to_entity_id.eq.${entityId}`);

        const interlinks = [];

        if (relationships) {
            relationships.forEach(rel => {
                const relatedEntity = rel.from_entity_id === entityId ? rel.to_entity : rel.from_entity;

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
            });
        }

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
        let query = supabase.from('entities').select('*');

        if (subdomain) {
            query = query.eq('subdomain', subdomain);
        }

        const { data: entities } = await query;

        const sitemapEntries = (entities || []).map(entity => ({
            loc: entity.url,
            lastmod: entity.updated_at,
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
        cacheKey: null,
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
        const { count: totalEntities } = await supabase
            .from('entities')
            .select('*', { count: 'exact', head: true });

        const { count: totalRelationships } = await supabase
            .from('entity_relationships')
            .select('*', { count: 'exact', head: true });

        const { data: entities } = await supabase
            .from('entities')
            .select('type, subdomain');

        const stats = {
            totalEntities: totalEntities || 0,
            totalRelationships: totalRelationships || 0,
            entityTypes: {},
            subdomains: {},
            avgRelationshipsPerEntity: 0
        };

        // Count by type and subdomain
        if (entities) {
            entities.forEach(entity => {
                stats.entityTypes[entity.type] = (stats.entityTypes[entity.type] || 0) + 1;
                stats.subdomains[entity.subdomain] = (stats.subdomains[entity.subdomain] || 0) + 1;
            });
        }

        // Calculate average relationships
        if (totalEntities > 0 && totalRelationships > 0) {
            stats.avgRelationshipsPerEntity = (totalRelationships * 2) / totalEntities;
        }

        return stats;
    },
    {
        service: 'entity-graph',
        mode: 'LITE',
        cacheKey: null,
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
