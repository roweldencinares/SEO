/**
 * NEXUS-Powered Subdomain Router
 *
 * Handles:
 * - Subdomain cluster definitions (4-10 clusters)
 * - Entity-based routing logic
 * - Automatic cross-linking between clusters
 * - Content injection and optimization
 * - Subdomain health monitoring
 */

import { nexusify } from './nexus/core.js';
import * as entityGraph from './entity-graph-db.js'; // Database-backed version

// ============================================================================
// SUBDOMAIN CLUSTER DEFINITIONS
// ============================================================================

const SUBDOMAIN_CLUSTERS = {
    MAIN: {
        subdomain: 'www',
        name: 'Main Site',
        purpose: 'Homepage, About, Contact',
        entityTypes: ['Organization'],
        priority: 'highest'
    },
    COACHING: {
        subdomain: 'coaching',
        name: 'Coaching Services',
        purpose: 'Coaching programs, sessions, testimonials',
        entityTypes: ['Service', 'Person'],
        priority: 'high'
    },
    RESOURCES: {
        subdomain: 'resources',
        name: 'Resources Hub',
        purpose: 'Blog, guides, tools, downloads',
        entityTypes: ['Article', 'HowTo'],
        priority: 'high'
    },
    EVENTS: {
        subdomain: 'events',
        name: 'Events & Workshops',
        purpose: 'Workshops, webinars, conferences',
        entityTypes: ['Event'],
        priority: 'medium'
    },
    LOCATIONS: {
        subdomain: 'locations',
        name: 'Locations',
        purpose: 'Office locations, service areas',
        entityTypes: ['Location'],
        priority: 'medium'
    },
    TEAM: {
        subdomain: 'team',
        name: 'Team Directory',
        purpose: 'Team members, coaches, experts',
        entityTypes: ['Person'],
        priority: 'medium'
    },
    PRODUCTS: {
        subdomain: 'shop',
        name: 'Products & Tools',
        purpose: 'Digital products, courses, tools',
        entityTypes: ['Product'],
        priority: 'medium'
    },
    SUPPORT: {
        subdomain: 'help',
        name: 'Help Center',
        purpose: 'FAQs, documentation, support',
        entityTypes: ['FAQPage', 'HowTo'],
        priority: 'low'
    }
};

// ============================================================================
// SUBDOMAIN ROUTING
// ============================================================================

/**
 * Determine optimal subdomain for an entity
 */
const routeEntity = nexusify(
    async (entity) => {
        // Find matching cluster based on entity type
        const matchingClusters = Object.values(SUBDOMAIN_CLUSTERS)
            .filter(cluster => cluster.entityTypes.includes(entity.type))
            .sort((a, b) => {
                const priorityOrder = { highest: 0, high: 1, medium: 2, low: 3 };
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            });

        const suggestedCluster = matchingClusters[0] || SUBDOMAIN_CLUSTERS.MAIN;

        return {
            entity: entity.id,
            entityType: entity.type,
            suggestedSubdomain: suggestedCluster.subdomain,
            suggestedUrl: `https://${suggestedCluster.subdomain}.spearity.com/${entity.id}`,
            cluster: suggestedCluster,
            alternativeClusters: matchingClusters.slice(1)
        };
    },
    {
        service: 'subdomain-router',
        mode: 'LITE'
    }
);

/**
 * Get all entities for a subdomain cluster
 */
const getClusterEntities = nexusify(
    async (subdomain) => {
        const cluster = Object.values(SUBDOMAIN_CLUSTERS)
            .find(c => c.subdomain === subdomain);

        if (!cluster) {
            throw new Error(`Subdomain cluster not found: ${subdomain}`);
        }

        const result = await entityGraph.getEntitiesBySubdomain({ input: subdomain });

        return {
            cluster,
            entities: result.data.entities,
            count: result.data.count
        };
    },
    {
        service: 'subdomain-router',
        mode: 'STANDARD',
        cacheKey: null, // Cache disabled for dynamic subdomain
        cacheTTL: 300
    }
);

/**
 * Get subdomain health metrics
 */
const getSubdomainHealth = nexusify(
    async (subdomain) => {
        const cluster = Object.values(SUBDOMAIN_CLUSTERS)
            .find(c => c.subdomain === subdomain);

        if (!cluster) {
            throw new Error(`Subdomain cluster not found: ${subdomain}`);
        }

        const entitiesResult = await entityGraph.getEntitiesBySubdomain({ input: subdomain });
        const entities = entitiesResult.data.entities;

        // Calculate health metrics
        const totalInterlinks = entities.reduce((sum, entity) => {
            const interlinksResult = entityGraph.generateInterlinks({ input: entity.id });
            return sum + (interlinksResult.data?.count || 0);
        }, 0);

        const avgInterlinksPerEntity = entities.length > 0 ? totalInterlinks / entities.length : 0;

        const health = {
            subdomain,
            entityCount: entities.length,
            totalInterlinks,
            avgInterlinksPerEntity: avgInterlinksPerEntity.toFixed(2),
            status: entities.length > 0 ? 'active' : 'empty',
            coverage: cluster.entityTypes.reduce((cov, type) => {
                cov[type] = entities.filter(e => e.type === type).length;
                return cov;
            }, {})
        };

        return health;
    },
    {
        service: 'subdomain-router',
        mode: 'STANDARD'
    }
);

// ============================================================================
// CROSS-CLUSTER INTERLINK RULES
// ============================================================================

const INTERLINK_RULES = [
    {
        name: 'Main to Services',
        from: 'www',
        to: 'coaching',
        condition: (fromEntity, toEntity) => toEntity.type === 'Service',
        anchorTemplate: 'Explore our {name} services'
    },
    {
        name: 'Services to Team',
        from: 'coaching',
        to: 'team',
        condition: (fromEntity, toEntity) => toEntity.type === 'Person',
        anchorTemplate: 'Meet {name}, your coach'
    },
    {
        name: 'Services to Resources',
        from: 'coaching',
        to: 'resources',
        condition: (fromEntity, toEntity) => toEntity.type === 'Article',
        anchorTemplate: 'Read: {name}'
    },
    {
        name: 'Resources to Services',
        from: 'resources',
        to: 'coaching',
        condition: (fromEntity, toEntity) => toEntity.type === 'Service',
        anchorTemplate: 'Get started with {name}'
    },
    {
        name: 'Team to Services',
        from: 'team',
        to: 'coaching',
        condition: (fromEntity, toEntity) => toEntity.type === 'Service',
        anchorTemplate: '{name} coaching program'
    },
    {
        name: 'Services to Locations',
        from: 'coaching',
        to: 'locations',
        condition: (fromEntity, toEntity) => toEntity.type === 'Location',
        anchorTemplate: 'Available at {name}'
    },
    {
        name: 'All to Support',
        from: '*',
        to: 'help',
        condition: (fromEntity, toEntity) => toEntity.type === 'FAQPage',
        anchorTemplate: 'FAQs about {name}'
    }
];

/**
 * Generate cross-cluster interlinks for an entity
 */
const generateCrossClusterLinks = nexusify(
    async (entityId) => {
        const entityResult = await entityGraph.getEntity({ input: entityId });
        const entity = entityResult.data.entity;
        const relatedEntities = entityResult.data.relatedEntities;

        const crossLinks = [];

        // Apply interlink rules
        INTERLINK_RULES.forEach(rule => {
            // Check if rule applies to this entity's subdomain
            if (rule.from !== '*' && rule.from !== entity.subdomain) {
                return;
            }

            // Find matching related entities
            relatedEntities.forEach(relatedEntity => {
                if (relatedEntity.subdomain === rule.to && rule.condition(entity, relatedEntity)) {
                    crossLinks.push({
                        url: relatedEntity.url,
                        title: relatedEntity.name,
                        anchor: rule.anchorTemplate.replace('{name}', relatedEntity.name),
                        fromSubdomain: entity.subdomain,
                        toSubdomain: relatedEntity.subdomain,
                        rule: rule.name
                    });
                }
            });
        });

        return {
            entityId,
            entitySubdomain: entity.subdomain,
            crossLinks,
            count: crossLinks.length
        };
    },
    {
        service: 'subdomain-router',
        mode: 'STANDARD'
    }
);

/**
 * Get all cross-cluster links for a subdomain
 */
const getSubdomainCrossLinks = nexusify(
    async (subdomain) => {
        const entitiesResult = await entityGraph.getEntitiesBySubdomain({ input: subdomain });
        const entities = entitiesResult.data.entities;

        const allCrossLinks = [];

        for (const entity of entities) {
            const linksResult = await generateCrossClusterLinks({ input: entity.id });
            allCrossLinks.push({
                entity: entity.id,
                links: linksResult.data.crossLinks
            });
        }

        // Calculate statistics
        const totalLinks = allCrossLinks.reduce((sum, item) => sum + item.links.length, 0);
        const linksByTargetSubdomain = {};

        allCrossLinks.forEach(item => {
            item.links.forEach(link => {
                linksByTargetSubdomain[link.toSubdomain] = (linksByTargetSubdomain[link.toSubdomain] || 0) + 1;
            });
        });

        return {
            subdomain,
            entities: allCrossLinks,
            totalCrossLinks: totalLinks,
            linksByTargetSubdomain
        };
    },
    {
        service: 'subdomain-router',
        mode: 'STANDARD',
        cacheKey: null, // Cache disabled for dynamic subdomain
        cacheTTL: 600
    }
);

// ============================================================================
// CONTENT INJECTION
// ============================================================================

/**
 * Inject interlinks into HTML content
 */
const injectInterlinks = nexusify(
    async (params) => {
        const { html, entityId } = params;

        if (!html || !entityId) {
            throw new Error('HTML content and entityId required');
        }

        // Get interlinks for this entity
        const linksResult = await generateCrossClusterLinks({ input: entityId });
        const crossLinks = linksResult.data.crossLinks;

        if (crossLinks.length === 0) {
            return {
                originalHtml: html,
                modifiedHtml: html,
                linksInjected: 0
            };
        }

        let modifiedHtml = html;

        // Build interlinks section
        const interlinksSection = `
        <div class="entity-interlinks" style="
            margin: 40px 0;
            padding: 20px;
            background: #f7fafc;
            border-left: 4px solid #667eea;
            border-radius: 8px;
        ">
            <h3 style="margin: 0 0 15px 0; color: #1a202c;">Related Content</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
                ${crossLinks.map(link => `
                    <li style="margin-bottom: 10px;">
                        <a href="${link.url}" style="
                            color: #667eea;
                            text-decoration: none;
                            font-weight: 600;
                        ">${link.anchor}</a>
                        <span style="color: #718096; font-size: 14px;"> • ${link.toSubdomain}.spearity.com</span>
                    </li>
                `).join('')}
            </ul>
        </div>
        `;

        // Inject before closing </body> or </main> or at end
        if (modifiedHtml.includes('</main>')) {
            modifiedHtml = modifiedHtml.replace('</main>', `${interlinksSection}</main>`);
        } else if (modifiedHtml.includes('</body>')) {
            modifiedHtml = modifiedHtml.replace('</body>', `${interlinksSection}</body>`);
        } else {
            modifiedHtml += interlinksSection;
        }

        return {
            originalHtml: html,
            modifiedHtml,
            linksInjected: crossLinks.length,
            links: crossLinks
        };
    },
    {
        service: 'subdomain-router',
        mode: 'STANDARD'
    }
);

/**
 * Generate breadcrumb navigation
 */
const generateBreadcrumbs = nexusify(
    async (entityId) => {
        const entityResult = await entityGraph.getEntity({ input: entityId });
        const entity = entityResult.data.entity;

        const cluster = Object.values(SUBDOMAIN_CLUSTERS)
            .find(c => c.subdomain === entity.subdomain) || SUBDOMAIN_CLUSTERS.MAIN;

        const breadcrumbs = [
            {
                name: 'Home',
                url: 'https://www.spearity.com'
            },
            {
                name: cluster.name,
                url: `https://${cluster.subdomain}.spearity.com`
            },
            {
                name: entity.name,
                url: entity.url
            }
        ];

        // Generate Schema.org BreadcrumbList
        const breadcrumbSchema = {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: breadcrumbs.map((crumb, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name: crumb.name,
                item: crumb.url
            }))
        };

        return {
            breadcrumbs,
            schema: breadcrumbSchema
        };
    },
    {
        service: 'subdomain-router',
        mode: 'LITE'
    }
);

// ============================================================================
// SUBDOMAIN ANALYTICS
// ============================================================================

/**
 * Generate subdomain cluster report
 */
const generateClusterReport = nexusify(
    async () => {
        const clusterReports = [];

        for (const [key, cluster] of Object.entries(SUBDOMAIN_CLUSTERS)) {
            const healthResult = await getSubdomainHealth({ input: cluster.subdomain });
            const crossLinksResult = await getSubdomainCrossLinks({ input: cluster.subdomain });

            clusterReports.push({
                cluster: key,
                subdomain: cluster.subdomain,
                name: cluster.name,
                purpose: cluster.purpose,
                health: healthResult.data,
                crossLinks: {
                    total: crossLinksResult.data.totalCrossLinks,
                    byTarget: crossLinksResult.data.linksByTargetSubdomain
                }
            });
        }

        // Calculate overall statistics
        const totalEntities = clusterReports.reduce((sum, report) => sum + report.health.entityCount, 0);
        const totalCrossLinks = clusterReports.reduce((sum, report) => sum + report.crossLinks.total, 0);
        const activeClusters = clusterReports.filter(r => r.health.status === 'active').length;

        return {
            clusters: clusterReports,
            summary: {
                totalClusters: clusterReports.length,
                activeClusters,
                totalEntities,
                totalCrossLinks,
                avgEntitiesPerCluster: (totalEntities / clusterReports.length).toFixed(2),
                avgCrossLinksPerCluster: (totalCrossLinks / clusterReports.length).toFixed(2)
            }
        };
    },
    {
        service: 'subdomain-router',
        mode: 'FULL',
        cacheKey: 'cluster-report',
        cacheTTL: 600
    }
);

/**
 * Suggest subdomain improvements
 */
const suggestImprovements = nexusify(
    async (subdomain) => {
        const healthResult = await getSubdomainHealth({ input: subdomain });
        const health = healthResult.data;

        const suggestions = [];

        // Check entity count
        if (health.entityCount === 0) {
            suggestions.push({
                severity: 'high',
                issue: 'No entities found',
                suggestion: 'Add entities to this subdomain cluster',
                action: 'create_entity'
            });
        } else if (health.entityCount < 3) {
            suggestions.push({
                severity: 'medium',
                issue: 'Low entity count',
                suggestion: 'Add more entities to improve content depth',
                action: 'create_entity'
            });
        }

        // Check interlink health
        if (health.avgInterlinksPerEntity < 2) {
            suggestions.push({
                severity: 'medium',
                issue: 'Low interlink density',
                suggestion: 'Create more relationships between entities',
                action: 'create_relationships'
            });
        }

        // Check entity type coverage
        const cluster = Object.values(SUBDOMAIN_CLUSTERS)
            .find(c => c.subdomain === subdomain);

        if (cluster) {
            cluster.entityTypes.forEach(type => {
                if (health.coverage[type] === 0) {
                    suggestions.push({
                        severity: 'low',
                        issue: `Missing ${type} entities`,
                        suggestion: `Add ${type} entities to match cluster purpose`,
                        action: 'create_entity',
                        entityType: type
                    });
                }
            });
        }

        return {
            subdomain,
            health: health.status,
            suggestions,
            improvementScore: suggestions.length === 0 ? 100 : Math.max(0, 100 - (suggestions.length * 15))
        };
    },
    {
        service: 'subdomain-router',
        mode: 'STANDARD'
    }
);

// ============================================================================
// EXPORTS
// ============================================================================

export {
    // Routing
    routeEntity,
    getClusterEntities,
    getSubdomainHealth,

    // Interlinks
    generateCrossClusterLinks,
    getSubdomainCrossLinks,

    // Content Injection
    injectInterlinks,
    generateBreadcrumbs,

    // Analytics
    generateClusterReport,
    suggestImprovements,

    // Constants
    SUBDOMAIN_CLUSTERS,
    INTERLINK_RULES
};

export default {
    routeEntity,
    getClusterEntities,
    getSubdomainHealth,
    generateCrossClusterLinks,
    getSubdomainCrossLinks,
    injectInterlinks,
    generateBreadcrumbs,
    generateClusterReport,
    suggestImprovements,
    SUBDOMAIN_CLUSTERS,
    INTERLINK_RULES
};
