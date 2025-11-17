/**
 * Domain Alert - Production-Ready Frontend Application
 * RDAP-based domain expiry checker with local storage
 */

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    STORAGE_KEY: 'domain_alert_tracked_domains',
    RDAP_BOOTSTRAP_URL: 'https://data.iana.org/rdap/dns.json',
    ALERT_THRESHOLDS: {
        CRITICAL: 30, // Days
        WARNING: 60,
        INFO: 90
    },
    AFFILIATE_LINKS: {
        namecheap: 'https://www.namecheap.com/?aff=123456', // Replace with your affiliate ID
        godaddy: 'https://www.godaddy.com/offers/default.aspx?isc=cjc1off30',
        default: 'https://www.namecheap.com/?aff=123456'
    }
};

// ============================================
// STATE MANAGEMENT
// ============================================

let rdapBootstrap = null;
let currentDomainData = null;

// ============================================
// RDAP API FUNCTIONS
// ============================================

/**
 * Fetch RDAP bootstrap data (cached in memory)
 */
async function fetchRDAPBootstrap() {
    if (rdapBootstrap) return rdapBootstrap;

    try {
        const response = await fetch(CONFIG.RDAP_BOOTSTRAP_URL);
        if (!response.ok) throw new Error('Failed to fetch RDAP bootstrap');
        rdapBootstrap = await response.json();
        return rdapBootstrap;
    } catch (error) {
        console.error('RDAP Bootstrap error:', error);
        throw new Error('Unable to connect to RDAP service');
    }
}

/**
 * Find RDAP server for a given TLD
 */
function findRDAPServer(tld) {
    if (!rdapBootstrap || !rdapBootstrap.services) {
        throw new Error('RDAP bootstrap data not loaded');
    }

    const normalizedTLD = tld.toLowerCase();

    for (const service of rdapBootstrap.services) {
        const [tlds, servers] = service;
        if (tlds.includes(normalizedTLD)) {
            return servers[0]; // Return first server
        }
    }

    throw new Error(`No RDAP server found for .${tld}`);
}

/**
 * Extract TLD from domain name
 */
function extractTLD(domain) {
    const parts = domain.split('.');
    if (parts.length < 2) {
        throw new Error('Invalid domain format');
    }
    return parts[parts.length - 1];
}

/**
 * Normalize domain name
 */
function normalizeDomain(domain) {
    return domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

/**
 * Fetch domain information via RDAP
 */
async function fetchDomainInfo(domain) {
    const normalizedDomain = normalizeDomain(domain);
    const tld = extractTLD(normalizedDomain);

    // Fetch bootstrap data
    await fetchRDAPBootstrap();

    // Find RDAP server
    const rdapServer = findRDAPServer(tld);

    // Query RDAP server
    const rdapURL = `${rdapServer}domain/${normalizedDomain}`;

    try {
        const response = await fetch(rdapURL);

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Domain not found or not registered');
            }
            throw new Error(`RDAP query failed: ${response.status}`);
        }

        const data = await response.json();
        return parseRDAPResponse(data, normalizedDomain);

    } catch (error) {
        console.error('RDAP query error:', error);
        throw error;
    }
}

/**
 * Parse RDAP response into usable format
 */
function parseRDAPResponse(data, domain) {
    const result = {
        domain: domain,
        status: 'Unknown',
        expiryDate: null,
        registrar: 'Unknown',
        rawData: data
    };

    // Extract status
    if (data.status && data.status.length > 0) {
        result.status = data.status.join(', ');
    }

    // Extract expiry date
    if (data.events) {
        const expiryEvent = data.events.find(event =>
            event.eventAction === 'expiration' || event.eventAction === 'expiry'
        );
        if (expiryEvent && expiryEvent.eventDate) {
            result.expiryDate = expiryEvent.eventDate;
        }
    }

    // Extract registrar
    if (data.entities) {
        const registrar = data.entities.find(entity =>
            entity.roles && entity.roles.includes('registrar')
        );
        if (registrar && registrar.vcardArray) {
            const vcard = registrar.vcardArray[1];
            const fnField = vcard.find(field => field[0] === 'fn');
            if (fnField) {
                result.registrar = fnField[3];
            }
        }
    }

    return result;
}

// ============================================
// STORAGE FUNCTIONS
// ============================================

/**
 * Get tracked domains from localStorage
 */
function getTrackedDomains() {
    try {
        const data = localStorage.getItem(CONFIG.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error reading from localStorage:', error);
        return [];
    }
}

/**
 * Save tracked domains to localStorage
 */
function saveTrackedDomains(domains) {
    try {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(domains));
        return true;
    } catch (error) {
        console.error('Error saving to localStorage:', error);
        alert('Failed to save domain. Storage might be full.');
        return false;
    }
}

/**
 * Add domain to tracked list
 */
function addTrackedDomain(domainData) {
    const domains = getTrackedDomains();

    // Check if domain already tracked
    const existingIndex = domains.findIndex(d => d.domain === domainData.domain);

    const trackedDomain = {
        domain: domainData.domain,
        status: domainData.status,
        expiryDate: domainData.expiryDate,
        registrar: domainData.registrar,
        addedAt: new Date().toISOString(),
        lastChecked: new Date().toISOString()
    };

    if (existingIndex >= 0) {
        // Update existing
        domains[existingIndex] = trackedDomain;
    } else {
        // Add new
        domains.push(trackedDomain);
    }

    return saveTrackedDomains(domains);
}

/**
 * Remove domain from tracked list
 */
function removeTrackedDomain(domain) {
    const domains = getTrackedDomains();
    const filtered = domains.filter(d => d.domain !== domain);
    return saveTrackedDomains(filtered);
}

/**
 * Clear all tracked domains
 */
function clearAllTrackedDomains() {
    return saveTrackedDomains([]);
}

// ============================================
// DATE & ALERT FUNCTIONS
// ============================================

/**
 * Calculate days until expiry
 */
function calculateDaysUntilExpiry(expiryDate) {
    if (!expiryDate) return null;

    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffTime = expiry - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
}

/**
 * Get alert level based on days until expiry
 */
function getAlertLevel(daysUntilExpiry) {
    if (daysUntilExpiry === null) return 'unknown';
    if (daysUntilExpiry < 0) return 'expired';
    if (daysUntilExpiry <= CONFIG.ALERT_THRESHOLDS.CRITICAL) return 'critical';
    if (daysUntilExpiry <= CONFIG.ALERT_THRESHOLDS.WARNING) return 'warning';
    if (daysUntilExpiry <= CONFIG.ALERT_THRESHOLDS.INFO) return 'info';
    return 'ok';
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    if (!dateString) return 'Unknown';

    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Check all tracked domains for alerts
 */
function checkForAlerts() {
    const domains = getTrackedDomains();
    let alertCount = 0;

    domains.forEach(domain => {
        const days = calculateDaysUntilExpiry(domain.expiryDate);
        const level = getAlertLevel(days);

        if (level === 'critical' || level === 'warning' || level === 'expired') {
            alertCount++;
        }
    });

    return alertCount;
}

// ============================================
// UI FUNCTIONS
// ============================================

/**
 * Show loading state
 */
function showLoading() {
    document.getElementById('loadingState').classList.remove('hidden');
    document.getElementById('errorMessage').classList.add('hidden');
    document.getElementById('domainInfo').classList.add('hidden');
    document.getElementById('checkBtn').disabled = true;
}

/**
 * Hide loading state
 */
function hideLoading() {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('checkBtn').disabled = false;
}

/**
 * Show error message
 */
function showError(message) {
    hideLoading();
    document.getElementById('errorText').textContent = message;
    document.getElementById('errorMessage').classList.remove('hidden');
    document.getElementById('domainInfo').classList.add('hidden');
}

/**
 * Display domain information
 */
function displayDomainInfo(domainData) {
    hideLoading();
    document.getElementById('errorMessage').classList.add('hidden');

    const daysUntilExpiry = calculateDaysUntilExpiry(domainData.expiryDate);
    const alertLevel = getAlertLevel(daysUntilExpiry);

    // Update fields
    document.getElementById('domainName').textContent = domainData.domain;
    document.getElementById('domainStatus').textContent = domainData.status;
    document.getElementById('expiryDate').textContent = formatDate(domainData.expiryDate);
    document.getElementById('registrar').textContent = domainData.registrar;

    // Days until expiry with color coding
    const daysElement = document.getElementById('daysUntilExpiry');
    if (daysUntilExpiry !== null) {
        daysElement.textContent = daysUntilExpiry + ' days';

        switch (alertLevel) {
            case 'expired':
                daysElement.className = 'text-lg font-semibold text-red-600';
                daysElement.textContent = 'EXPIRED';
                break;
            case 'critical':
                daysElement.className = 'text-lg font-semibold text-red-600';
                break;
            case 'warning':
                daysElement.className = 'text-lg font-semibold text-orange-600';
                break;
            case 'info':
                daysElement.className = 'text-lg font-semibold text-yellow-600';
                break;
            default:
                daysElement.className = 'text-lg font-semibold text-green-600';
        }
    } else {
        daysElement.textContent = 'Unknown';
        daysElement.className = 'text-lg font-semibold text-gray-600';
    }

    // Status color coding
    const statusElement = document.getElementById('domainStatus');
    if (domainData.status.toLowerCase().includes('active')) {
        statusElement.className = 'text-lg font-semibold text-green-600';
    } else {
        statusElement.className = 'text-lg font-semibold text-gray-900';
    }

    // Update renew link (affiliate link)
    const renewLink = document.getElementById('renewLink');
    renewLink.href = CONFIG.AFFILIATE_LINKS.default;

    // Show domain info section
    document.getElementById('domainInfo').classList.remove('hidden');

    // Store current domain data
    currentDomainData = domainData;
}

/**
 * Render tracked domains list
 */
function renderTrackedDomains() {
    const domains = getTrackedDomains();
    const emptyState = document.getElementById('emptyState');
    const domainsList = document.getElementById('domainsList');

    if (domains.length === 0) {
        emptyState.classList.remove('hidden');
        domainsList.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    domainsList.classList.remove('hidden');

    // Sort by expiry date (soonest first)
    const sortedDomains = domains.sort((a, b) => {
        const daysA = calculateDaysUntilExpiry(a.expiryDate);
        const daysB = calculateDaysUntilExpiry(b.expiryDate);
        if (daysA === null) return 1;
        if (daysB === null) return -1;
        return daysA - daysB;
    });

    // Render domains
    domainsList.innerHTML = sortedDomains.map(domain => {
        const daysUntilExpiry = calculateDaysUntilExpiry(domain.expiryDate);
        const alertLevel = getAlertLevel(daysUntilExpiry);

        let alertBadge = '';
        let borderColor = 'border-gray-200';

        switch (alertLevel) {
            case 'expired':
                alertBadge = '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">EXPIRED</span>';
                borderColor = 'border-red-300 bg-red-50';
                break;
            case 'critical':
                alertBadge = '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">⚠️ URGENT</span>';
                borderColor = 'border-red-300 bg-red-50';
                break;
            case 'warning':
                alertBadge = '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">⚠️ Soon</span>';
                borderColor = 'border-orange-300 bg-orange-50';
                break;
            case 'info':
                alertBadge = '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">📅 Upcoming</span>';
                borderColor = 'border-yellow-300';
                break;
            default:
                alertBadge = '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">✓ Good</span>';
                borderColor = 'border-gray-200';
        }

        const daysText = daysUntilExpiry !== null
            ? `${daysUntilExpiry} days`
            : 'Unknown';

        return `
            <div class="border ${borderColor} rounded-lg p-4 hover:shadow-md transition">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center space-x-2 mb-2">
                            <h3 class="font-semibold text-gray-900">${domain.domain}</h3>
                            ${alertBadge}
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-sm text-gray-600">
                            <div>
                                <span class="font-medium">Expires:</span>
                                ${formatDate(domain.expiryDate)}
                            </div>
                            <div>
                                <span class="font-medium">In:</span>
                                ${daysText}
                            </div>
                            <div class="col-span-2">
                                <span class="font-medium">Registrar:</span>
                                ${domain.registrar}
                            </div>
                        </div>
                    </div>
                    <button
                        onclick="removeDomain('${domain.domain}')"
                        class="ml-4 text-red-600 hover:text-red-700 font-medium text-sm"
                    >
                        Remove
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Update alert badge
    updateAlertBadge();
}

/**
 * Update alert badge in header
 */
function updateAlertBadge() {
    const alertCount = checkForAlerts();
    const alertBadge = document.getElementById('alertBadge');
    const alertCountElement = document.getElementById('alertCount');

    if (alertCount > 0) {
        alertCountElement.textContent = alertCount;
        alertBadge.classList.remove('hidden');
    } else {
        alertBadge.classList.add('hidden');
    }
}

// ============================================
// EVENT HANDLERS
// ============================================

/**
 * Handle domain check
 */
async function handleDomainCheck() {
    const input = document.getElementById('domainInput');
    const domain = input.value.trim();

    if (!domain) {
        showError('Please enter a domain name');
        return;
    }

    showLoading();

    try {
        const domainData = await fetchDomainInfo(domain);
        displayDomainInfo(domainData);
    } catch (error) {
        showError(error.message || 'Failed to check domain. Please try again.');
    }
}

/**
 * Handle track domain
 */
function handleTrackDomain() {
    if (!currentDomainData) {
        alert('Please check a domain first');
        return;
    }

    if (addTrackedDomain(currentDomainData)) {
        alert(`✓ ${currentDomainData.domain} is now being tracked!`);
        renderTrackedDomains();
    }
}

/**
 * Remove domain from tracking
 */
function removeDomain(domain) {
    if (confirm(`Remove ${domain} from tracking?`)) {
        removeTrackedDomain(domain);
        renderTrackedDomains();
    }
}

/**
 * Clear all tracked domains
 */
function handleClearAll() {
    const domains = getTrackedDomains();
    if (domains.length === 0) {
        alert('No domains to clear');
        return;
    }

    if (confirm(`Remove all ${domains.length} tracked domains?`)) {
        clearAllTrackedDomains();
        renderTrackedDomains();
        alert('All domains cleared');
    }
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize app
 */
function initApp() {
    // Event listeners
    document.getElementById('checkBtn').addEventListener('click', handleDomainCheck);
    document.getElementById('trackBtn').addEventListener('click', handleTrackDomain);
    document.getElementById('clearAllBtn').addEventListener('click', handleClearAll);

    // Enter key on input
    document.getElementById('domainInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleDomainCheck();
        }
    });

    // Render initial tracked domains
    renderTrackedDomains();

    console.log('Domain Alert initialized successfully');
}

// Make removeDomain available globally for onclick handlers
window.removeDomain = removeDomain;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
