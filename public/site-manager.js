/**
 * Universal Site Manager
 * Manages multi-site selection across all dashboard pages
 */

const SiteManager = {
    STORAGE_KEY: 'seo_sites',
    CURRENT_SITE_KEY: 'seo_current_site',

    // Get all saved sites
    getSites() {
        try {
            const sites = localStorage.getItem(this.STORAGE_KEY);
            return sites ? JSON.parse(sites) : [];
        } catch {
            return [];
        }
    },

    // Save sites
    saveSites(sites) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sites));
    },

    // Add a new site
    addSite(site) {
        const sites = this.getSites();

        // Normalize URL
        let url = site.url || site;
        if (typeof url === 'string') {
            if (!url.startsWith('http')) url = 'https://' + url;
            url = url.replace(/\/$/, ''); // Remove trailing slash
        }

        // Check if already exists
        if (sites.find(s => s.url === url)) {
            return { success: false, error: 'Site already exists' };
        }

        const newSite = {
            id: Date.now().toString(),
            url: url,
            name: site.name || new URL(url).hostname.replace('www.', ''),
            gscProperty: site.gscProperty || `sc-domain:${new URL(url).hostname.replace('www.', '')}`,
            ga4Property: site.ga4Property || '',
            addedAt: new Date().toISOString()
        };

        sites.push(newSite);
        this.saveSites(sites);

        // Set as current if first site
        if (sites.length === 1) {
            this.setCurrentSite(newSite.id);
        }

        return { success: true, site: newSite };
    },

    // Remove a site
    removeSite(siteId) {
        let sites = this.getSites();
        sites = sites.filter(s => s.id !== siteId);
        this.saveSites(sites);

        // If removed current site, switch to another
        if (this.getCurrentSiteId() === siteId && sites.length > 0) {
            this.setCurrentSite(sites[0].id);
        }
    },

    // Get current site ID
    getCurrentSiteId() {
        return localStorage.getItem(this.CURRENT_SITE_KEY);
    },

    // Set current site
    setCurrentSite(siteId) {
        localStorage.setItem(this.CURRENT_SITE_KEY, siteId);
        // Dispatch event for listeners
        window.dispatchEvent(new CustomEvent('siteChanged', { detail: { siteId } }));
    },

    // Get current site object
    getCurrentSite() {
        const siteId = this.getCurrentSiteId();
        const sites = this.getSites();
        return sites.find(s => s.id === siteId) || sites[0] || null;
    },

    // Get current site URL
    getCurrentSiteUrl() {
        const site = this.getCurrentSite();
        return site ? site.url : null;
    },

    // Get current GSC property
    getCurrentGSCProperty() {
        const site = this.getCurrentSite();
        return site ? site.gscProperty : null;
    },

    // Build API URL with current site
    buildApiUrl(endpoint, params = {}) {
        const site = this.getCurrentSite();
        if (site) {
            params.site = site.url;
            params.gsc = site.gscProperty;
        }
        const queryString = new URLSearchParams(params).toString();
        return queryString ? `${endpoint}?${queryString}` : endpoint;
    },

    // Create site selector dropdown HTML
    createSiteSelector(containerId, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const sites = this.getSites();
        const currentSite = this.getCurrentSite();

        container.innerHTML = `
            <div class="site-selector-wrapper" style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                <label style="font-weight: 600; color: #4a5568;">
                    🌐 Current Site:
                </label>
                <select id="site-dropdown" class="site-dropdown" style="
                    padding: 10px 15px;
                    border: 2px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 14px;
                    min-width: 250px;
                    cursor: pointer;
                ">
                    ${sites.length === 0 ? '<option value="">No sites added</option>' : ''}
                    ${sites.map(s => `
                        <option value="${s.id}" ${currentSite && currentSite.id === s.id ? 'selected' : ''}>
                            ${s.name} (${s.url})
                        </option>
                    `).join('')}
                </select>
                <button id="add-site-btn" style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                ">➕ Add Site</button>
                ${options.showRefresh ? `
                    <button id="refresh-data-btn" style="
                        background: #48bb78;
                        color: white;
                        padding: 10px 20px;
                        border: none;
                        border-radius: 8px;
                        font-weight: 600;
                        cursor: pointer;
                    ">🔄 Refresh</button>
                ` : ''}
            </div>
        `;

        // Site change handler
        const dropdown = document.getElementById('site-dropdown');
        dropdown?.addEventListener('change', (e) => {
            this.setCurrentSite(e.target.value);
            if (options.onSiteChange) options.onSiteChange(this.getCurrentSite());
            if (options.autoReload) window.location.reload();
        });

        // Add site handler
        document.getElementById('add-site-btn')?.addEventListener('click', () => {
            this.showAddSiteModal(options.onSiteAdded);
        });

        // Refresh handler
        document.getElementById('refresh-data-btn')?.addEventListener('click', () => {
            if (options.onRefresh) options.onRefresh();
            else window.location.reload();
        });
    },

    // Show add site modal
    showAddSiteModal(callback) {
        // Remove existing modal
        document.getElementById('add-site-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'add-site-modal';
        modal.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            ">
                <div style="
                    background: white;
                    padding: 30px;
                    border-radius: 15px;
                    width: 90%;
                    max-width: 500px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                ">
                    <h2 style="margin: 0 0 20px 0; color: #2d3748;">➕ Add New Site</h2>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Website URL *</label>
                        <input type="url" id="new-site-url" placeholder="https://example.com" style="
                            width: 100%;
                            padding: 12px;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 14px;
                            box-sizing: border-box;
                        ">
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Site Name (optional)</label>
                        <input type="text" id="new-site-name" placeholder="My Website" style="
                            width: 100%;
                            padding: 12px;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 14px;
                            box-sizing: border-box;
                        ">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">GSC Property (optional)</label>
                        <input type="text" id="new-site-gsc" placeholder="sc-domain:example.com" style="
                            width: 100%;
                            padding: 12px;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 14px;
                            box-sizing: border-box;
                        ">
                        <small style="color: #718096;">Leave blank to auto-detect from URL</small>
                    </div>

                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button id="cancel-add-site" style="
                            padding: 12px 24px;
                            border: 2px solid #e2e8f0;
                            background: white;
                            border-radius: 8px;
                            cursor: pointer;
                            font-weight: 600;
                        ">Cancel</button>
                        <button id="confirm-add-site" style="
                            padding: 12px 24px;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-weight: 600;
                        ">Add Site</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Cancel handler
        document.getElementById('cancel-add-site').addEventListener('click', () => {
            modal.remove();
        });

        // Confirm handler
        document.getElementById('confirm-add-site').addEventListener('click', () => {
            const url = document.getElementById('new-site-url').value.trim();
            const name = document.getElementById('new-site-name').value.trim();
            const gsc = document.getElementById('new-site-gsc').value.trim();

            if (!url) {
                alert('Please enter a website URL');
                return;
            }

            const result = this.addSite({
                url,
                name: name || undefined,
                gscProperty: gsc || undefined
            });

            if (result.success) {
                modal.remove();
                if (callback) callback(result.site);
                window.location.reload();
            } else {
                alert(result.error);
            }
        });

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal.firstElementChild) {
                modal.remove();
            }
        });
    },

    // Initialize on page load
    init(options = {}) {
        // Add default site if none exist
        if (this.getSites().length === 0 && options.defaultSite) {
            this.addSite(options.defaultSite);
        }

        // Create selector if container specified
        if (options.selectorContainer) {
            this.createSiteSelector(options.selectorContainer, options);
        }

        return this.getCurrentSite();
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SiteManager;
}
