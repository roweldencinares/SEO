// Shared Sidebar Component for Marketing SEO Dashboard
// Usage: Include this script in your HTML pages and call initSidebar(activePage)

function initSidebar(activePage = '/dashboard') {
    const sidebarHTML = `
        <div class="sidebar">
            <div class="sidebar-header">
                <div class="sidebar-logo">
                    <span class="logo-icon">🤖</span> SEO Agents
                </div>
                <div class="sidebar-subtitle">Multi-Site Dashboard</div>
            </div>

            <ul class="sidebar-nav">
                <li><a href="/dashboard" class="${activePage === '/dashboard' ? 'active' : ''}"><span class="icon">🏠</span> Dashboard</a></li>

                <!-- SEO Analysis Section (Collapsible) -->
                <li>
                    <div class="parent-item ${['/seo', '/keywords', '/competitors', '/local-listing', '/ai-discovery', '/website-audit'].includes(activePage) ? 'active expanded' : ''}" data-section="seo-analysis">
                        <div class="parent-content">
                            <span class="icon">📈</span>
                            <span>SEO Analysis</span>
                        </div>
                        <span class="arrow">▼</span>
                    </div>
                    <ul class="sub-menu ${['/seo', '/keywords', '/competitors', '/local-listing', '/ai-discovery', '/website-audit'].includes(activePage) ? 'expanded' : ''}">
                        <li><a href="/seo" class="${activePage === '/seo' ? 'active' : ''}">Search Performance</a></li>
                        <li><a href="/website-audit" class="${activePage === '/website-audit' ? 'active' : ''}">🔍 Website Audit</a></li>
                        <li><a href="/keywords" class="${activePage === '/keywords' ? 'active' : ''}">Keywords</a></li>
                        <li><a href="/ai-discovery" class="${activePage === '/ai-discovery' ? 'active' : ''}">🎯 AI Discovery</a></li>
                        <li><a href="/competitors" class="${activePage === '/competitors' ? 'active' : ''}">Competitors</a></li>
                        <li><a href="/local-listing" class="${activePage === '/local-listing' ? 'active' : ''}">Local Listing</a></li>
                    </ul>
                </li>

                <!-- Pro SEO Tools Section (Collapsible) -->
                <li>
                    <div class="parent-item ${['/indexation-control', '/sitemap-automation', '/deindex-recovery', '/entity-management'].includes(activePage) ? 'active expanded' : ''}" data-section="pro-seo-tools">
                        <div class="parent-content">
                            <span class="icon">⚡</span>
                            <span>Pro SEO Tools</span>
                        </div>
                        <span class="arrow">▼</span>
                    </div>
                    <ul class="sub-menu ${['/indexation-control', '/sitemap-automation', '/deindex-recovery', '/entity-management'].includes(activePage) ? 'expanded' : ''}">
                        <li><a href="/indexation-control" class="${activePage === '/indexation-control' ? 'active' : ''}">🛡️ Indexation Control</a></li>
                        <li><a href="/sitemap-automation" class="${activePage === '/sitemap-automation' ? 'active' : ''}">🗺️ Sitemap Automation</a></li>
                        <li><a href="/deindex-recovery" class="${activePage === '/deindex-recovery' ? 'active' : ''}">🚨 Deindex Recovery</a></li>
                        <li><a href="/entity-management" class="${activePage === '/entity-management' ? 'active' : ''}">🌐 Entity Management</a></li>
                    </ul>
                </li>

                <!-- SEO Agents Section (Collapsible) -->
                <li>
                    <div class="parent-item ${['/seo-agents'].includes(activePage) ? 'active expanded' : ''}" data-section="seo-agents">
                        <div class="parent-content">
                            <span class="icon">🤖</span>
                            <span>SEO Agents</span>
                        </div>
                        <span class="arrow">▼</span>
                    </div>
                    <ul class="sub-menu ${['/seo-agents'].includes(activePage) ? 'expanded' : ''}">
                        <li><a href="/seo-agents" class="${activePage === '/seo-agents' ? 'active' : ''}">🎯 Agent Dashboard</a></li>
                    </ul>
                </li>

                <li><a href="/actions" class="${activePage === '/actions' ? 'active' : ''}"><span class="icon">📋</span> Action Plan</a></li>
                <li><a href="/progress" class="${activePage === '/progress' ? 'active' : ''}"><span class="icon">📊</span> Progress Tracking</a></li>
                <li><a href="/alerts" class="${activePage === '/alerts' ? 'active' : ''}"><span class="icon">🔔</span> Alerts</a></li>
                <li><a href="/integrations" class="${activePage === '/integrations' ? 'active' : ''}"><span class="icon">🔌</span> Integrations</a></li>
                <li><a href="/email-campaigns" class="${activePage === '/email-campaigns' ? 'active' : ''}"><span class="icon">📧</span> Email Campaigns</a></li>
                <li><a href="#"><span class="icon">📱</span> Social Media</a></li>
                <li><a href="#"><span class="icon">📝</span> Content</a></li>
                <li><a href="#"><span class="icon">📊</span> Reports</a></li>
            </ul>

            <div class="sidebar-footer">
                <div class="user-profile">
                    <div class="user-avatar" id="userAvatar">
                        <img id="userImage" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: none;" alt="User" />
                        <span id="userInitials">U</span>
                    </div>
                    <div class="user-info">
                        <div class="user-name" id="userName">Loading...</div>
                        <div class="user-email" id="userEmail">user@example.com</div>
                    </div>
                </div>
                <button id="signOutBtn" class="sign-out-button">
                    <span class="sign-out-icon">🚪</span>
                    <span>Sign Out</span>
                </button>
            </div>
        </div>
    `;

    // Insert sidebar into body
    document.body.insertAdjacentHTML('afterbegin', sidebarHTML);

    // Initialize collapsible sections
    initCollapsibleSections();

    // Initialize user display (no auth required)
    initializeUser();
}

function initCollapsibleSections() {
    const parentItems = document.querySelectorAll('.parent-item');

    parentItems.forEach(parentItem => {
        parentItem.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
            const subMenu = this.nextElementSibling;

            // Toggle expanded class
            this.classList.toggle('expanded');
            if (subMenu && subMenu.classList.contains('sub-menu')) {
                subMenu.classList.toggle('expanded');
            }

            // Save state to localStorage
            const isExpanded = this.classList.contains('expanded');
            localStorage.setItem(`sidebar-${section}`, isExpanded);
        });

        // Restore state from localStorage
        const section = parentItem.getAttribute('data-section');
        const savedState = localStorage.getItem(`sidebar-${section}`);

        if (savedState === 'true' && !parentItem.classList.contains('expanded')) {
            parentItem.classList.add('expanded');
            const subMenu = parentItem.nextElementSibling;
            if (subMenu && subMenu.classList.contains('sub-menu')) {
                subMenu.classList.add('expanded');
            }
        }
    });
}

function initializeUser() {
    // Set default user info (no authentication required)
    const userNameEl = document.getElementById('userName');
    const userEmailEl = document.getElementById('userEmail');
    const userInitialsEl = document.getElementById('userInitials');

    if (userNameEl) {
        userNameEl.textContent = 'SEO User';
    }

    if (userEmailEl) {
        userEmailEl.textContent = 'seo@agents.local';
    }

    if (userInitialsEl) {
        userInitialsEl.textContent = 'SE';
    }

    // Hide sign out button (no auth)
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.style.display = 'none';
    }
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Sidebar will be initialized by calling initSidebar(activePage) in each page
    });
}
