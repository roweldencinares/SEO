// Shared Sidebar Component for Marketing SEO Dashboard
// Usage: Include this script in your HTML pages and call initSidebar(activePage)

function initSidebar(activePage = '/dashboard') {
    const sidebarHTML = `
        <div class="sidebar">
            <div class="sidebar-header">
                <div class="sidebar-logo">
                    <span class="logo-icon">📊</span> Spearity
                </div>
                <div class="sidebar-subtitle">Marketing Platform</div>
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

    // Initialize Clerk auth
    initializeAuth();
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

async function initializeAuth() {
    try {
        const clerk = window.Clerk;

        if (!clerk) {
            console.error('Clerk not loaded');
            setTimeout(initializeAuth, 100);
            return;
        }

        await clerk.load();

        // Check if user is authenticated
        if (!clerk.user) {
            // Not signed in, redirect to sign-in page
            window.location.href = '/sign-in';
            return;
        }

        // User is authenticated
        const user = clerk.user;
        console.log('Authenticated as:', user.primaryEmailAddress?.emailAddress);

        // Update user info in sidebar
        const userName = user.firstName || user.emailAddresses[0]?.emailAddress || 'User';
        const userEmail = user.primaryEmailAddress?.emailAddress || user.emailAddresses[0]?.emailAddress || '';
        const userImageUrl = user.imageUrl;

        const userNameEl = document.getElementById('userName');
        const userEmailEl = document.getElementById('userEmail');
        const userImageEl = document.getElementById('userImage');
        const userInitialsEl = document.getElementById('userInitials');

        if (userNameEl) {
            userNameEl.textContent = userName;
        }

        if (userEmailEl) {
            userEmailEl.textContent = userEmail;
        }

        // Display user image or initials
        if (userImageUrl && userImageEl && userInitialsEl) {
            userImageEl.src = userImageUrl;
            userImageEl.style.display = 'block';
            userInitialsEl.style.display = 'none';
        } else if (userInitialsEl) {
            const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            userInitialsEl.textContent = initials;
        }

        // Sign out button functionality
        const signOutBtn = document.getElementById('signOutBtn');
        if (signOutBtn) {
            signOutBtn.addEventListener('click', async () => {
                try {
                    await clerk.signOut();
                    window.location.href = '/sign-in';
                } catch (err) {
                    console.error('Error signing out:', err);
                    alert('Failed to sign out. Please try again.');
                }
            });
        }
    } catch (err) {
        console.error('Error loading Clerk:', err);
        // On error, redirect to sign-in
        window.location.href = '/sign-in';
    }
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Sidebar will be initialized by calling initSidebar(activePage) in each page
    });
}
