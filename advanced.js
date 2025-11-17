/**
 * Domain Alert Pro - Advanced Domain Monitoring Application
 * Features: RDAP, DNS Lookup, Subdomain Discovery, Bulk Checker, Dark Mode, Export/Import
 */

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    STORAGE_KEY: 'domain_alert_pro_domains',
    SETTINGS_KEY: 'domain_alert_pro_settings',
    RDAP_BOOTSTRAP_URL: 'https://data.iana.org/rdap/dns.json',
    DNS_SERVERS: {
        google: 'https://dns.google/resolve',
        cloudflare: 'https://cloudflare-dns.com/dns-query'
    },
    CRT_SH_URL: 'https://crt.sh',
    ALERT_THRESHOLDS: {
        CRITICAL: 30,
        WARNING: 60,
        INFO: 90
    },
    AFFILIATE_LINKS: {
        namecheap: 'https://www.namecheap.com/?aff=123456',
        godaddy: 'https://www.godaddy.com/offers/default.aspx?isc=cjc1off30',
        cloudflare: 'https://www.cloudflare.com/products/registrar/',
        default: 'https://www.namecheap.com/?aff=123456'
    },
    MULTI_TLDS: ['com', 'net', 'org', 'io', 'co', 'app', 'dev', 'ai']
};

// ============================================
// STATE MANAGEMENT
// ============================================

let rdapBootstrap = null;
let currentDomainData = null;
let bulkResults = [];
let settings = {
    darkMode: false,
    autoRefresh: false,
    notifications: false,
    thresholds: {
        critical: 30,
        warning: 60,
        info: 90
    }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');

    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-orange-500',
        info: 'bg-blue-500'
    };

    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    toast.className = `${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2 fade-in`;
    toast.innerHTML = `
        <span class="font-bold">${icons[type]}</span>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Normalize domain name
 */
function normalizeDomain(domain) {
    return domain.toLowerCase().trim()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0];
}

/**
 * Extract TLD from domain
 */
function extractTLD(domain) {
    const parts = domain.split('.');
    if (parts.length < 2) throw new Error('Invalid domain format');
    return parts[parts.length - 1];
}

/**
 * Format date
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
 * Calculate days until expiry
 */
function calculateDaysUntilExpiry(expiryDate) {
    if (!expiryDate) return null;
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffTime = expiry - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Get alert level based on days
 */
function getAlertLevel(daysUntilExpiry) {
    if (daysUntilExpiry === null) return 'unknown';
    if (daysUntilExpiry < 0) return 'expired';
    if (daysUntilExpiry <= settings.thresholds.critical) return 'critical';
    if (daysUntilExpiry <= settings.thresholds.warning) return 'warning';
    if (daysUntilExpiry <= settings.thresholds.info) return 'info';
    return 'ok';
}

// ============================================
// STORAGE FUNCTIONS
// ============================================

function getTrackedDomains() {
    try {
        const data = localStorage.getItem(CONFIG.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error reading domains:', error);
        return [];
    }
}

function saveTrackedDomains(domains) {
    try {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(domains));
        return true;
    } catch (error) {
        console.error('Error saving domains:', error);
        showToast('Failed to save domains', 'error');
        return false;
    }
}

function addTrackedDomain(domainData) {
    const domains = getTrackedDomains();
    const existingIndex = domains.findIndex(d => d.domain === domainData.domain);

    const trackedDomain = {
        ...domainData,
        addedAt: existingIndex >= 0 ? domains[existingIndex].addedAt : new Date().toISOString(),
        lastChecked: new Date().toISOString(),
        category: existingIndex >= 0 ? domains[existingIndex].category : 'uncategorized',
        tags: existingIndex >= 0 ? domains[existingIndex].tags : []
    };

    if (existingIndex >= 0) {
        domains[existingIndex] = trackedDomain;
    } else {
        domains.push(trackedDomain);
    }

    saveTrackedDomains(domains);
    return true;
}

function removeTrackedDomain(domain) {
    const domains = getTrackedDomains();
    const filtered = domains.filter(d => d.domain !== domain);
    return saveTrackedDomains(filtered);
}

function clearAllTrackedDomains() {
    return saveTrackedDomains([]);
}

function loadSettings() {
    try {
        const saved = localStorage.getItem(CONFIG.SETTINGS_KEY);
        if (saved) {
            settings = { ...settings, ...JSON.parse(saved) };
        }
        // Update CONFIG thresholds
        CONFIG.ALERT_THRESHOLDS = settings.thresholds;
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

function saveSettings() {
    try {
        localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify(settings));
        // Update CONFIG thresholds
        CONFIG.ALERT_THRESHOLDS = settings.thresholds;
        showToast('Settings saved successfully', 'success');
        return true;
    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Failed to save settings', 'error');
        return false;
    }
}

// ============================================
// RDAP FUNCTIONS
// ============================================

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

function findRDAPServer(tld) {
    if (!rdapBootstrap || !rdapBootstrap.services) {
        throw new Error('RDAP bootstrap data not loaded');
    }

    const normalizedTLD = tld.toLowerCase();

    for (const service of rdapBootstrap.services) {
        const [tlds, servers] = service;
        if (tlds.includes(normalizedTLD)) {
            return servers[0];
        }
    }

    throw new Error(`No RDAP server found for .${tld}`);
}

async function fetchDomainInfo(domain) {
    const normalizedDomain = normalizeDomain(domain);
    const tld = extractTLD(normalizedDomain);

    await fetchRDAPBootstrap();
    const rdapServer = findRDAPServer(tld);
    const rdapURL = `${rdapServer}domain/${normalizedDomain}`;

    try {
        const response = await fetch(rdapURL);

        if (!response.ok) {
            if (response.status === 404) {
                return {
                    domain: normalizedDomain,
                    status: 'Available',
                    expiryDate: null,
                    registrar: 'Not registered',
                    isAvailable: true
                };
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

function parseRDAPResponse(data, domain) {
    const result = {
        domain: domain,
        status: 'Unknown',
        expiryDate: null,
        registrar: 'Unknown',
        createdDate: null,
        updatedDate: null,
        nameservers: [],
        isAvailable: false,
        rawData: data
    };

    if (data.status && data.status.length > 0) {
        result.status = data.status.join(', ');
    }

    if (data.events) {
        const expiryEvent = data.events.find(e =>
            e.eventAction === 'expiration' || e.eventAction === 'expiry'
        );
        if (expiryEvent) result.expiryDate = expiryEvent.eventDate;

        const createdEvent = data.events.find(e => e.eventAction === 'registration');
        if (createdEvent) result.createdDate = createdEvent.eventDate;

        const updatedEvent = data.events.find(e => e.eventAction === 'last changed');
        if (updatedEvent) result.updatedDate = updatedEvent.eventDate;
    }

    if (data.entities) {
        const registrar = data.entities.find(e =>
            e.roles && e.roles.includes('registrar')
        );
        if (registrar && registrar.vcardArray) {
            const vcard = registrar.vcardArray[1];
            const fnField = vcard.find(field => field[0] === 'fn');
            if (fnField) result.registrar = fnField[3];
        }
    }

    if (data.nameservers) {
        result.nameservers = data.nameservers.map(ns => ns.ldhName);
    }

    return result;
}

// ============================================
// DNS LOOKUP FUNCTIONS
// ============================================

async function dnsLookup(domain, recordType = 'A') {
    const normalizedDomain = normalizeDomain(domain);

    try {
        const url = `${CONFIG.DNS_SERVERS.google}?name=${normalizedDomain}&type=${recordType}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('DNS lookup failed');
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('DNS lookup error:', error);
        throw error;
    }
}

async function getAllDNSRecords(domain) {
    const recordTypes = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA'];
    const results = {};

    for (const type of recordTypes) {
        try {
            const data = await dnsLookup(domain, type);
            if (data.Answer && data.Answer.length > 0) {
                results[type] = data.Answer.map(answer => ({
                    name: answer.name,
                    type: answer.type,
                    data: answer.data,
                    ttl: answer.TTL
                }));
            }
        } catch (error) {
            results[type] = [];
        }
    }

    return results;
}

// ============================================
// SUBDOMAIN DISCOVERY
// ============================================

async function findSubdomains(domain) {
    const normalizedDomain = normalizeDomain(domain);

    try {
        const response = await fetch(`${CONFIG.CRT_SH_URL}/?q=%.${normalizedDomain}&output=json`);

        if (!response.ok) {
            throw new Error('Subdomain discovery failed');
        }

        const data = await response.json();
        const subdomains = new Set();

        data.forEach(cert => {
            if (cert.name_value) {
                const names = cert.name_value.split('\n');
                names.forEach(name => {
                    if (name.includes(normalizedDomain) && !name.startsWith('*')) {
                        subdomains.add(name.toLowerCase());
                    }
                });
            }
        });

        return Array.from(subdomains).sort();
    } catch (error) {
        console.error('Subdomain discovery error:', error);
        throw error;
    }
}

// ============================================
// BULK OPERATIONS
// ============================================

async function checkBulkDomains(domains, progressCallback) {
    const results = [];
    const total = domains.length;

    for (let i = 0; i < domains.length; i++) {
        try {
            const domainInfo = await fetchDomainInfo(domains[i]);
            results.push({
                success: true,
                data: domainInfo
            });
        } catch (error) {
            results.push({
                success: false,
                domain: domains[i],
                error: error.message
            });
        }

        if (progressCallback) {
            progressCallback(i + 1, total);
        }

        // Rate limiting - wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
}

// ============================================
// EXPORT / IMPORT
// ============================================

function exportToCSV() {
    const domains = getTrackedDomains();

    if (domains.length === 0) {
        showToast('No domains to export', 'warning');
        return;
    }

    const headers = ['Domain', 'Status', 'Expiry Date', 'Days Until Expiry', 'Registrar', 'Category', 'Added At'];
    const rows = domains.map(d => {
        const days = calculateDaysUntilExpiry(d.expiryDate);
        return [
            d.domain,
            d.status,
            d.expiryDate || 'N/A',
            days !== null ? days : 'N/A',
            d.registrar,
            d.category || 'uncategorized',
            d.addedAt
        ];
    });

    const csv = [headers, ...rows].map(row =>
        row.map(cell => `"${cell}"`).join(',')
    ).join('\n');

    downloadFile(csv, 'domain-alert-export.csv', 'text/csv');
    showToast('Exported to CSV successfully', 'success');
}

function exportToJSON() {
    const domains = getTrackedDomains();

    if (domains.length === 0) {
        showToast('No domains to export', 'warning');
        return;
    }

    const json = JSON.stringify(domains, null, 2);
    downloadFile(json, 'domain-alert-export.json', 'application/json');
    showToast('Exported to JSON successfully', 'success');
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function importFromCSV(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split('\n').filter(line => line.trim());
                const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());

                const domains = [];

                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());

                    if (values[0]) {
                        domains.push({
                            domain: values[0],
                            status: values[1] || 'Unknown',
                            expiryDate: values[2] !== 'N/A' ? values[2] : null,
                            registrar: values[4] || 'Unknown',
                            category: values[5] || 'uncategorized',
                            addedAt: values[6] || new Date().toISOString(),
                            lastChecked: new Date().toISOString()
                        });
                    }
                }

                const existing = getTrackedDomains();
                const merged = [...existing];

                domains.forEach(newDomain => {
                    const existingIndex = merged.findIndex(d => d.domain === newDomain.domain);
                    if (existingIndex >= 0) {
                        merged[existingIndex] = { ...merged[existingIndex], ...newDomain };
                    } else {
                        merged.push(newDomain);
                    }
                });

                saveTrackedDomains(merged);
                showToast(`Imported ${domains.length} domains successfully`, 'success');
                resolve(domains.length);
            } catch (error) {
                showToast('Failed to parse CSV file', 'error');
                reject(error);
            }
        };

        reader.onerror = () => {
            showToast('Failed to read file', 'error');
            reject(reader.error);
        };

        reader.readAsText(file);
    });
}

// ============================================
// DARK MODE
// ============================================

function toggleDarkMode() {
    settings.darkMode = !settings.darkMode;
    applyDarkMode();
    saveSettings();
}

function applyDarkMode() {
    const html = document.documentElement;
    const icon = document.getElementById('darkModeIcon');

    if (settings.darkMode) {
        html.classList.add('dark');
        icon.textContent = '☀️';
    } else {
        html.classList.remove('dark');
        icon.textContent = '🌙';
    }
}

// ============================================
// NOTIFICATIONS
// ============================================

function requestNotificationPermission() {
    if (!('Notification' in window)) {
        showToast('Notifications not supported', 'error');
        return;
    }

    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            settings.notifications = true;
            saveSettings();
            showToast('Notifications enabled', 'success');
            document.getElementById('notificationBtn').classList.add('hidden');
        }
    });
}

function sendNotification(title, body) {
    if (!settings.notifications || Notification.permission !== 'granted') return;

    new Notification(title, {
        body: body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚀</text></svg>'
    });
}

function checkAndNotify() {
    const domains = getTrackedDomains();
    let criticalCount = 0;

    domains.forEach(domain => {
        const days = calculateDaysUntilExpiry(domain.expiryDate);
        if (days !== null && days <= CONFIG.ALERT_THRESHOLDS.CRITICAL && days > 0) {
            criticalCount++;
        }
    });

    if (criticalCount > 0) {
        sendNotification(
            'Domain Expiry Alert',
            `You have ${criticalCount} domain(s) expiring within ${CONFIG.ALERT_THRESHOLDS.CRITICAL} days!`
        );
    }
}

// ============================================
// UI FUNCTIONS
// ============================================

function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });

    // Show selected tab
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');

    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('tab-active', 'text-blue-600', 'dark:text-blue-400');
        btn.classList.add('text-gray-600', 'dark:text-gray-400');
    });

    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    activeBtn.classList.add('tab-active');
    activeBtn.classList.remove('text-gray-600', 'dark:text-gray-400');

    // Render charts when analytics tab is opened
    if (tabName === 'analytics') {
        setTimeout(() => {
            renderExpiryChart();
            renderRegistrarChart();
            updatePortfolioAnalytics();
        }, 100);
    }
}

function updateStatistics() {
    const domains = getTrackedDomains();

    document.getElementById('stat-total').textContent = domains.length;

    let expiring = 0;
    let healthy = 0;
    const categories = new Set();

    domains.forEach(domain => {
        const days = calculateDaysUntilExpiry(domain.expiryDate);
        const level = getAlertLevel(days);

        if (level === 'critical' || level === 'warning') {
            expiring++;
        } else if (level === 'ok') {
            healthy++;
        }

        if (domain.category) {
            categories.add(domain.category);
        }
    });

    document.getElementById('stat-expiring').textContent = expiring;
    document.getElementById('stat-healthy').textContent = healthy;
    document.getElementById('stat-categories').textContent = categories.size;

    // Update alert badge
    const alertBadge = document.getElementById('alertBadge');
    const alertCount = document.getElementById('alertCount');

    if (expiring > 0) {
        alertCount.textContent = expiring;
        alertBadge.classList.remove('hidden');
    } else {
        alertBadge.classList.add('hidden');
    }
}

function renderDomainsList(domainsToRender = null) {
    const domains = domainsToRender || getTrackedDomains();
    const emptyState = document.getElementById('emptyState');
    const domainsList = document.getElementById('domainsList');

    if (domains.length === 0) {
        emptyState.classList.remove('hidden');
        domainsList.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    domainsList.classList.remove('hidden');

    // Sort by expiry date
    const sortedDomains = domains.sort((a, b) => {
        const daysA = calculateDaysUntilExpiry(a.expiryDate);
        const daysB = calculateDaysUntilExpiry(b.expiryDate);
        if (daysA === null) return 1;
        if (daysB === null) return -1;
        return daysA - daysB;
    });

    domainsList.innerHTML = sortedDomains.map(domain => {
        const days = calculateDaysUntilExpiry(domain.expiryDate);
        const level = getAlertLevel(days);

        let alertBadge = '';
        let borderColor = 'border-gray-200 dark:border-gray-700';

        switch (level) {
            case 'expired':
                alertBadge = '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">EXPIRED</span>';
                borderColor = 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20';
                break;
            case 'critical':
                alertBadge = '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">⚠️ URGENT</span>';
                borderColor = 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20';
                break;
            case 'warning':
                alertBadge = '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">⚠️ Soon</span>';
                borderColor = 'border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20';
                break;
            case 'info':
                alertBadge = '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">📅 Upcoming</span>';
                borderColor = 'border-yellow-300 dark:border-yellow-800';
                break;
            default:
                alertBadge = '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">✓ Good</span>';
                borderColor = 'border-gray-200 dark:border-gray-700';
        }

        const daysText = days !== null ? `${days} days` : 'Unknown';

        return `
            <div class="border ${borderColor} rounded-lg p-4 hover:shadow-md transition">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center space-x-2 mb-2">
                            <h3 class="font-semibold text-gray-900 dark:text-white">${domain.domain}</h3>
                            ${alertBadge}
                            ${domain.category ? `<span class="px-2 py-1 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">${domain.category}</span>` : ''}
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <div><span class="font-medium">Expires:</span> ${formatDate(domain.expiryDate)}</div>
                            <div><span class="font-medium">In:</span> ${daysText}</div>
                            <div class="col-span-2"><span class="font-medium">Registrar:</span> ${domain.registrar}</div>
                        </div>
                    </div>
                    <div class="ml-4 flex flex-col space-y-2">
                        <button
                            onclick="recheckDomain('${domain.domain}')"
                            class="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium"
                        >
                            🔄 Recheck
                        </button>
                        <button
                            onclick="removeDomain('${domain.domain}')"
                            class="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm font-medium"
                        >
                            ✕ Remove
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    updateStatistics();
}

function displayDomainInfo(domainData) {
    const days = calculateDaysUntilExpiry(domainData.expiryDate);
    const level = getAlertLevel(days);

    let alertColor = 'text-gray-900 dark:text-white';
    let daysText = 'Unknown';

    if (days !== null) {
        daysText = `${days} days`;
        switch (level) {
            case 'expired':
                alertColor = 'text-red-600 dark:text-red-400';
                daysText = 'EXPIRED';
                break;
            case 'critical':
                alertColor = 'text-red-600 dark:text-red-400';
                break;
            case 'warning':
                alertColor = 'text-orange-600 dark:text-orange-400';
                break;
            case 'info':
                alertColor = 'text-yellow-600 dark:text-yellow-400';
                break;
            default:
                alertColor = 'text-green-600 dark:text-green-400';
        }
    }

    const statusColor = domainData.status.toLowerCase().includes('active') ?
        'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white';

    const infoHTML = `
        <div class="border-t dark:border-gray-700 pt-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">Domain Name</p>
                    <p class="text-lg font-semibold text-gray-900 dark:text-white">${domainData.domain}</p>
                </div>
                <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">Status</p>
                    <p class="text-lg font-semibold ${statusColor}">${domainData.status}</p>
                </div>
                <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">Expiry Date</p>
                    <p class="text-lg font-semibold text-gray-900 dark:text-white">${formatDate(domainData.expiryDate)}</p>
                </div>
                <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">Days Until Expiry</p>
                    <p class="text-lg font-semibold ${alertColor}">${daysText}</p>
                </div>
                <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg md:col-span-2">
                    <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">Registrar</p>
                    <p class="text-lg font-semibold text-gray-900 dark:text-white">${domainData.registrar}</p>
                </div>
                ${domainData.createdDate ? `
                <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">Created Date</p>
                    <p class="text-lg font-semibold text-gray-900 dark:text-white">${formatDate(domainData.createdDate)}</p>
                </div>
                ` : ''}
                ${domainData.updatedDate ? `
                <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">Last Updated</p>
                    <p class="text-lg font-semibold text-gray-900 dark:text-white">${formatDate(domainData.updatedDate)}</p>
                </div>
                ` : ''}
            </div>

            <div class="mt-4 flex gap-3">
                ${!domainData.isAvailable ? `
                <button
                    id="trackBtn"
                    class="flex-1 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition shadow-md hover:shadow-lg"
                >
                    ⭐ Track This Domain
                </button>
                ` : ''}
                <a
                    href="${CONFIG.AFFILIATE_LINKS.default}"
                    target="_blank"
                    class="flex-1 px-6 py-3 bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-700 transition shadow-md hover:shadow-lg text-center"
                >
                    ${domainData.isAvailable ? '🛒 Register Domain' : '🔗 Renew Domain'}
                </a>
            </div>
        </div>
    `;

    document.getElementById('domainInfo').innerHTML = infoHTML;
    document.getElementById('domainInfo').classList.remove('hidden');

    // Re-attach event listener
    const trackBtn = document.getElementById('trackBtn');
    if (trackBtn) {
        trackBtn.addEventListener('click', () => handleTrackDomain(domainData));
    }

    currentDomainData = domainData;
}

function displayDNSResults(dnsData) {
    const resultsDiv = document.getElementById('dnsResults');
    let html = '';

    for (const [recordType, records] of Object.entries(dnsData)) {
        if (records && records.length > 0) {
            html += `
                <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h3 class="font-semibold text-gray-900 dark:text-white mb-3">${recordType} Records</h3>
                    <div class="space-y-2">
                        ${records.map(record => `
                            <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded dns-record">
                                <div class="text-gray-900 dark:text-white font-mono">${record.data}</div>
                                <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">TTL: ${record.ttl}s</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    }

    if (html === '') {
        html = '<p class="text-gray-600 dark:text-gray-400">No DNS records found.</p>';
    }

    resultsDiv.innerHTML = html;
    resultsDiv.classList.remove('hidden');
}

function displaySubdomainResults(subdomains) {
    const resultsDiv = document.getElementById('subdomainResults');

    if (subdomains.length === 0) {
        resultsDiv.innerHTML = '<p class="text-gray-600 dark:text-gray-400">No subdomains found.</p>';
    } else {
        resultsDiv.innerHTML = `
            <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="font-semibold text-gray-900 dark:text-white">Found ${subdomains.length} subdomains</h3>
                    <button
                        onclick="copySubdomains()"
                        class="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
                    >
                        📋 Copy All
                    </button>
                </div>
                <div class="space-y-1 max-h-96 overflow-y-auto">
                    ${subdomains.map(subdomain => `
                        <div class="bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded text-sm font-mono text-gray-900 dark:text-white">
                            ${subdomain}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    resultsDiv.classList.remove('hidden');

    // Store for copy function
    window.currentSubdomains = subdomains;
}

// ============================================
// EVENT HANDLERS
// ============================================

async function handleDomainCheck() {
    const input = document.getElementById('domainInput');
    const domain = input.value.trim();

    if (!domain) {
        showToast('Please enter a domain name', 'warning');
        return;
    }

    document.getElementById('loadingState').classList.remove('hidden');
    document.getElementById('errorMessage').classList.add('hidden');
    document.getElementById('domainInfo').classList.add('hidden');

    try {
        const domainData = await fetchDomainInfo(domain);
        displayDomainInfo(domainData);
        document.getElementById('loadingState').classList.add('hidden');
    } catch (error) {
        document.getElementById('loadingState').classList.add('hidden');
        document.getElementById('errorText').textContent = error.message;
        document.getElementById('errorMessage').classList.remove('hidden');
    }
}

function handleTrackDomain(domainData) {
    if (!domainData) {
        showToast('No domain data available', 'error');
        return;
    }

    addTrackedDomain(domainData);
    showToast(`✓ ${domainData.domain} is now being tracked!`, 'success');
    renderDomainsList();
    updateStatistics();
}

async function recheckDomain(domain) {
    showToast('Rechecking domain...', 'info');

    try {
        const domainData = await fetchDomainInfo(domain);
        addTrackedDomain(domainData);
        renderDomainsList();
        showToast(`✓ ${domain} updated successfully`, 'success');
    } catch (error) {
        showToast(`Failed to recheck ${domain}`, 'error');
    }
}

function removeDomain(domain) {
    if (confirm(`Remove ${domain} from tracking?`)) {
        removeTrackedDomain(domain);
        renderDomainsList();
        showToast(`Removed ${domain}`, 'success');
    }
}

function handleClearAll() {
    const domains = getTrackedDomains();
    if (domains.length === 0) {
        showToast('No domains to clear', 'warning');
        return;
    }

    if (confirm(`Remove all ${domains.length} tracked domains?`)) {
        clearAllTrackedDomains();
        renderDomainsList();
        showToast('All domains cleared', 'success');
    }
}

async function handleDNSLookup() {
    const input = document.getElementById('dnsInput');
    const domain = input.value.trim();

    if (!domain) {
        showToast('Please enter a domain name', 'warning');
        return;
    }

    document.getElementById('dnsLoadingState').classList.remove('hidden');
    document.getElementById('dnsResults').classList.add('hidden');

    try {
        const dnsData = await getAllDNSRecords(domain);
        displayDNSResults(dnsData);
        document.getElementById('dnsLoadingState').classList.add('hidden');
        showToast('DNS lookup completed', 'success');
    } catch (error) {
        document.getElementById('dnsLoadingState').classList.add('hidden');
        showToast('DNS lookup failed', 'error');
    }
}

async function handleSubdomainFind() {
    const input = document.getElementById('subdomainInput');
    const domain = input.value.trim();

    if (!domain) {
        showToast('Please enter a domain name', 'warning');
        return;
    }

    document.getElementById('subdomainLoadingState').classList.remove('hidden');
    document.getElementById('subdomainResults').classList.add('hidden');

    try {
        const subdomains = await findSubdomains(domain);
        displaySubdomainResults(subdomains);
        document.getElementById('subdomainLoadingState').classList.add('hidden');
        showToast(`Found ${subdomains.length} subdomains`, 'success');
    } catch (error) {
        document.getElementById('subdomainLoadingState').classList.add('hidden');
        showToast('Subdomain discovery failed', 'error');
    }
}

async function handleBulkCheck() {
    const textarea = document.getElementById('bulkInput');
    const domainsText = textarea.value.trim();

    if (!domainsText) {
        showToast('Please enter at least one domain', 'warning');
        return;
    }

    const domains = domainsText.split('\n')
        .map(d => d.trim())
        .filter(d => d.length > 0);

    if (domains.length === 0) {
        showToast('No valid domains entered', 'warning');
        return;
    }

    // Show progress
    document.getElementById('bulkProgress').classList.remove('hidden');
    document.getElementById('bulkResults').classList.add('hidden');

    bulkResults = await checkBulkDomains(domains, (current, total) => {
        const percent = (current / total) * 100;
        document.getElementById('bulkProgressBar').style.width = `${percent}%`;
        document.getElementById('bulkProgressText').textContent = `${current} / ${total}`;
    });

    // Display results
    displayBulkResults();

    document.getElementById('bulkTrackAllBtn').classList.remove('hidden');
    document.getElementById('bulkExportBtn').classList.remove('hidden');

    showToast(`Checked ${domains.length} domains`, 'success');
}

function displayBulkResults() {
    const resultsDiv = document.getElementById('bulkResults');

    const html = bulkResults.map(result => {
        if (!result.success) {
            return `
                <div class="border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="font-semibold text-red-900 dark:text-red-200">${result.domain}</p>
                            <p class="text-sm text-red-700 dark:text-red-300">${result.error}</p>
                        </div>
                        <span class="text-red-600 dark:text-red-400">✕</span>
                    </div>
                </div>
            `;
        }

        const domain = result.data;
        const days = calculateDaysUntilExpiry(domain.expiryDate);
        const level = getAlertLevel(days);

        let borderColor = 'border-gray-200 dark:border-gray-700';
        let bgColor = 'bg-white dark:bg-gray-800';

        if (level === 'critical' || level === 'expired') {
            borderColor = 'border-red-300 dark:border-red-800';
            bgColor = 'bg-red-50 dark:bg-red-900/20';
        } else if (level === 'warning') {
            borderColor = 'border-orange-300 dark:border-orange-800';
            bgColor = 'bg-orange-50 dark:bg-orange-900/20';
        }

        return `
            <div class="border ${borderColor} ${bgColor} rounded-lg p-4">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <p class="font-semibold text-gray-900 dark:text-white mb-1">${domain.domain}</p>
                        <div class="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <div>Status: ${domain.status}</div>
                            <div>Expires: ${formatDate(domain.expiryDate)}</div>
                            <div>Registrar: ${domain.registrar}</div>
                            <div>Days left: ${days !== null ? days : 'N/A'}</div>
                        </div>
                    </div>
                    <span class="text-green-600 dark:text-green-400">✓</span>
                </div>
            </div>
        `;
    }).join('');

    resultsDiv.innerHTML = html;
    resultsDiv.classList.remove('hidden');
}

function handleBulkTrackAll() {
    let tracked = 0;

    bulkResults.forEach(result => {
        if (result.success && !result.data.isAvailable) {
            addTrackedDomain(result.data);
            tracked++;
        }
    });

    renderDomainsList();
    showToast(`Tracked ${tracked} domains successfully`, 'success');
}

function handleBulkExport() {
    if (bulkResults.length === 0) {
        showToast('No results to export', 'warning');
        return;
    }

    const headers = ['Domain', 'Status', 'Expiry Date', 'Days Until Expiry', 'Registrar'];
    const rows = bulkResults
        .filter(r => r.success)
        .map(r => {
            const d = r.data;
            const days = calculateDaysUntilExpiry(d.expiryDate);
            return [
                d.domain,
                d.status,
                d.expiryDate || 'N/A',
                days !== null ? days : 'N/A',
                d.registrar
            ];
        });

    const csv = [headers, ...rows].map(row =>
        row.map(cell => `"${cell}"`).join(',')
    ).join('\n');

    downloadFile(csv, 'bulk-check-results.csv', 'text/csv');
    showToast('Results exported to CSV', 'success');
}

async function handleMultiTLDCheck() {
    const input = document.getElementById('domainInput');
    const domain = input.value.trim();

    if (!domain) {
        showToast('Please enter a domain name', 'warning');
        return;
    }

    // Extract base name without TLD
    const normalized = normalizeDomain(domain);
    const parts = normalized.split('.');
    const baseName = parts.slice(0, -1).join('.');

    if (!baseName) {
        showToast('Invalid domain format', 'error');
        return;
    }

    document.getElementById('loadingState').classList.remove('hidden');
    document.getElementById('multiTldResults').classList.add('hidden');

    const results = [];

    for (const tld of CONFIG.MULTI_TLDS) {
        const testDomain = `${baseName}.${tld}`;
        try {
            const info = await fetchDomainInfo(testDomain);
            results.push({
                tld,
                domain: testDomain,
                available: info.isAvailable,
                data: info
            });
        } catch (error) {
            results.push({
                tld,
                domain: testDomain,
                available: false,
                error: error.message
            });
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    displayMultiTLDResults(results);
    document.getElementById('loadingState').classList.add('hidden');
}

function displayMultiTLDResults(results) {
    const resultsDiv = document.getElementById('multiTldResults');

    const html = `
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Multi-TLD Availability Check</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                ${results.map(result => {
                    const bgColor = result.available ?
                        'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-800' :
                        'bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600';

                    const textColor = result.available ?
                        'text-green-800 dark:text-green-200' :
                        'text-gray-800 dark:text-gray-300';

                    const status = result.available ? '✓ Available' : '✕ Taken';

                    return `
                        <div class="border ${bgColor} rounded-lg p-3">
                            <div class="flex items-center justify-between">
                                <span class="font-semibold ${textColor}">.${result.tld}</span>
                                <span class="text-sm ${textColor}">${status}</span>
                            </div>
                            ${result.available ? `
                                <a href="${CONFIG.AFFILIATE_LINKS.default}" target="_blank" class="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block">
                                    Register →
                                </a>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    resultsDiv.innerHTML = html;
    resultsDiv.classList.remove('hidden');
}

async function handleDomainAge() {
    const input = document.getElementById('ageInput');
    const domain = input.value.trim();

    if (!domain) {
        showToast('Please enter a domain name', 'warning');
        return;
    }

    try {
        const domainData = await fetchDomainInfo(domain);

        if (!domainData.createdDate) {
            showToast('Creation date not available', 'warning');
            return;
        }

        const createdDate = new Date(domainData.createdDate);
        const now = new Date();
        const ageMs = now - createdDate;
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        const ageYears = Math.floor(ageDays / 365);
        const ageMonths = Math.floor((ageDays % 365) / 30);

        const resultDiv = document.getElementById('ageResult');
        resultDiv.innerHTML = `
            <h4 class="font-semibold text-gray-900 dark:text-white mb-2">${domain}</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">Created: ${formatDate(domainData.createdDate)}</p>
            <p class="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">${ageYears} years, ${ageMonths} months</p>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">${ageDays} days old</p>
        `;
        resultDiv.classList.remove('hidden');
    } catch (error) {
        showToast('Failed to calculate domain age', 'error');
    }
}

function handleSearchFilter() {
    const searchTerm = document.getElementById('searchDomains').value.toLowerCase();
    const categoryFilter = document.getElementById('filterCategory').value;
    const statusFilter = document.getElementById('filterStatus').value;

    let domains = getTrackedDomains();

    // Apply search
    if (searchTerm) {
        domains = domains.filter(d =>
            d.domain.toLowerCase().includes(searchTerm) ||
            d.registrar.toLowerCase().includes(searchTerm)
        );
    }

    // Apply category filter
    if (categoryFilter) {
        domains = domains.filter(d => d.category === categoryFilter);
    }

    // Apply status filter
    if (statusFilter) {
        domains = domains.filter(d => {
            const days = calculateDaysUntilExpiry(d.expiryDate);
            const level = getAlertLevel(days);
            return level === statusFilter;
        });
    }

    renderDomainsList(domains);
}

async function handleRefreshAll() {
    const domains = getTrackedDomains();

    if (domains.length === 0) {
        showToast('No domains to refresh', 'warning');
        return;
    }

    showToast('Refreshing all domains...', 'info');

    let refreshed = 0;
    const total = domains.length;

    for (const domain of domains) {
        try {
            const updated = await fetchDomainInfo(domain.domain);
            addTrackedDomain(updated);
            refreshed++;
        } catch (error) {
            console.error(`Failed to refresh ${domain.domain}:`, error);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    renderDomainsList();
    showToast(`Refreshed ${refreshed} of ${total} domains`, 'success');
}

function handleImport() {
    const fileInput = document.getElementById('importFile');
    fileInput.click();
}

function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    importFromCSV(file).then(() => {
        renderDomainsList();
        event.target.value = ''; // Reset file input
    }).catch(error => {
        console.error('Import error:', error);
    });
}

function copySubdomains() {
    if (!window.currentSubdomains) return;

    const text = window.currentSubdomains.join('\n');
    navigator.clipboard.writeText(text).then(() => {
        showToast('Subdomains copied to clipboard', 'success');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
}

function handleSaveSettings() {
    settings.thresholds.critical = parseInt(document.getElementById('thresholdCritical').value);
    settings.thresholds.warning = parseInt(document.getElementById('thresholdWarning').value);
    settings.thresholds.info = parseInt(document.getElementById('thresholdInfo').value);

    settings.autoRefresh = document.getElementById('autoRefreshToggle').checked;
    settings.notifications = document.getElementById('notificationsToggle').checked;

    saveSettings();
    renderDomainsList(); // Re-render with new thresholds
}

function loadSettingsUI() {
    document.getElementById('thresholdCritical').value = settings.thresholds.critical;
    document.getElementById('thresholdWarning').value = settings.thresholds.warning;
    document.getElementById('thresholdInfo').value = settings.thresholds.info;

    document.getElementById('autoRefreshToggle').checked = settings.autoRefresh;
    document.getElementById('notificationsToggle').checked = settings.notifications;
}

// ============================================
// SSL CERTIFICATE FUNCTIONS
// ============================================

async function checkSSL(domain) {
    const normalizedDomain = normalizeDomain(domain);

    try {
        // Use crt.sh to get certificate info
        const response = await fetch(`${CONFIG.CRT_SH_URL}/?q=${normalizedDomain}&output=json`);

        if (!response.ok) {
            throw new Error('SSL check failed');
        }

        const data = await response.json();

        if (data.length === 0) {
            return {
                domain: normalizedDomain,
                hasSSL: false,
                message: 'No SSL certificates found'
            };
        }

        // Get the most recent certificate
        const latestCert = data.reduce((latest, cert) => {
            const certDate = new Date(cert.entry_timestamp);
            const latestDate = new Date(latest.entry_timestamp);
            return certDate > latestDate ? cert : latest;
        });

        return {
            domain: normalizedDomain,
            hasSSL: true,
            issuer: latestCert.issuer_name,
            notBefore: latestCert.not_before,
            notAfter: latestCert.not_after,
            commonName: latestCert.common_name,
            serialNumber: latestCert.serial_number,
            entryTimestamp: latestCert.entry_timestamp
        };
    } catch (error) {
        console.error('SSL check error:', error);
        throw error;
    }
}

async function handleSSLCheck() {
    const input = document.getElementById('sslInput');
    const domain = input.value.trim();

    if (!domain) {
        showToast('Please enter a domain name', 'warning');
        return;
    }

    document.getElementById('sslLoadingState').classList.remove('hidden');
    document.getElementById('sslResults').classList.add('hidden');

    try {
        const sslData = await checkSSL(domain);
        displaySSLResults(sslData);
        document.getElementById('sslLoadingState').classList.add('hidden');
        showToast('SSL check completed', 'success');
    } catch (error) {
        document.getElementById('sslLoadingState').classList.add('hidden');
        showToast('SSL check failed', 'error');
    }
}

function displaySSLResults(sslData) {
    const resultsDiv = document.getElementById('sslResults');

    if (!sslData.hasSSL) {
        resultsDiv.innerHTML = `
            <div class="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-800 rounded-lg p-4">
                <p class="text-yellow-800 dark:text-yellow-200">${sslData.message}</p>
            </div>
        `;
    } else {
        const notAfter = new Date(sslData.notAfter);
        const now = new Date();
        const daysUntilExpiry = Math.ceil((notAfter - now) / (1000 * 60 * 60 * 24));

        let expiryColor = 'text-green-600 dark:text-green-400';
        let expiryBg = 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-800';

        if (daysUntilExpiry < 0) {
            expiryColor = 'text-red-600 dark:text-red-400';
            expiryBg = 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-800';
        } else if (daysUntilExpiry < 30) {
            expiryColor = 'text-orange-600 dark:text-orange-400';
            expiryBg = 'bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-800';
        }

        resultsDiv.innerHTML = `
            <div class="border ${expiryBg} rounded-lg p-6">
                <h4 class="font-semibold text-gray-900 dark:text-white mb-4">SSL Certificate Details</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="bg-white dark:bg-gray-700 p-3 rounded">
                        <p class="text-sm text-gray-600 dark:text-gray-400">Common Name</p>
                        <p class="font-semibold text-gray-900 dark:text-white">${sslData.commonName}</p>
                    </div>
                    <div class="bg-white dark:bg-gray-700 p-3 rounded">
                        <p class="text-sm text-gray-600 dark:text-gray-400">Days Until Expiry</p>
                        <p class="font-semibold ${expiryColor}">${daysUntilExpiry} days</p>
                    </div>
                    <div class="bg-white dark:bg-gray-700 p-3 rounded">
                        <p class="text-sm text-gray-600 dark:text-gray-400">Valid From</p>
                        <p class="font-semibold text-gray-900 dark:text-white">${formatDate(sslData.notBefore)}</p>
                    </div>
                    <div class="bg-white dark:bg-gray-700 p-3 rounded">
                        <p class="text-sm text-gray-600 dark:text-gray-400">Valid Until</p>
                        <p class="font-semibold text-gray-900 dark:text-white">${formatDate(sslData.notAfter)}</p>
                    </div>
                    <div class="bg-white dark:bg-gray-700 p-3 rounded md:col-span-2">
                        <p class="text-sm text-gray-600 dark:text-gray-400">Issuer</p>
                        <p class="font-semibold text-gray-900 dark:text-white text-xs break-all">${sslData.issuer}</p>
                    </div>
                </div>
            </div>
        `;
    }

    resultsDiv.classList.remove('hidden');
}

// ============================================
// EMAIL SECURITY FUNCTIONS
// ============================================

async function checkEmailSecurity(domain) {
    const normalizedDomain = normalizeDomain(domain);
    const results = {
        domain: normalizedDomain,
        mx: [],
        spf: null,
        dmarc: null,
        hasMX: false,
        hasSPF: false,
        hasDMARC: false
    };

    try {
        // Check MX records
        const mxData = await dnsLookup(normalizedDomain, 'MX');
        if (mxData.Answer && mxData.Answer.length > 0) {
            results.hasMX = true;
            results.mx = mxData.Answer.map(record => record.data);
        }

        // Check SPF record (TXT)
        const txtData = await dnsLookup(normalizedDomain, 'TXT');
        if (txtData.Answer && txtData.Answer.length > 0) {
            const spfRecord = txtData.Answer.find(record =>
                record.data.includes('v=spf1')
            );
            if (spfRecord) {
                results.hasSPF = true;
                results.spf = spfRecord.data;
            }
        }

        // Check DMARC record
        const dmarcData = await dnsLookup(`_dmarc.${normalizedDomain}`, 'TXT');
        if (dmarcData.Answer && dmarcData.Answer.length > 0) {
            const dmarcRecord = dmarcData.Answer.find(record =>
                record.data.includes('v=DMARC1')
            );
            if (dmarcRecord) {
                results.hasDMARC = true;
                results.dmarc = dmarcRecord.data;
            }
        }

        return results;
    } catch (error) {
        console.error('Email security check error:', error);
        throw error;
    }
}

async function handleEmailSecurityCheck() {
    const input = document.getElementById('emailSecInput');
    const domain = input.value.trim();

    if (!domain) {
        showToast('Please enter a domain name', 'warning');
        return;
    }

    document.getElementById('emailSecLoadingState').classList.remove('hidden');
    document.getElementById('emailSecResults').classList.add('hidden');

    try {
        const emailData = await checkEmailSecurity(domain);
        displayEmailSecurityResults(emailData);
        document.getElementById('emailSecLoadingState').classList.add('hidden');
        showToast('Email security check completed', 'success');
    } catch (error) {
        document.getElementById('emailSecLoadingState').classList.add('hidden');
        showToast('Email security check failed', 'error');
    }
}

function displayEmailSecurityResults(emailData) {
    const resultsDiv = document.getElementById('emailSecResults');

    const scoreTotal = (emailData.hasMX ? 1 : 0) + (emailData.hasSPF ? 1 : 0) + (emailData.hasDMARC ? 1 : 0);
    const scorePercent = Math.round((scoreTotal / 3) * 100);

    let scoreColor = 'text-red-600 dark:text-red-400';
    let scoreBg = 'bg-red-100 dark:bg-red-900';

    if (scorePercent >= 66) {
        scoreColor = 'text-green-600 dark:text-green-400';
        scoreBg = 'bg-green-100 dark:bg-green-900';
    } else if (scorePercent >= 33) {
        scoreColor = 'text-orange-600 dark:text-orange-400';
        scoreBg = 'bg-orange-100 dark:bg-orange-900';
    }

    resultsDiv.innerHTML = `
        <div class="space-y-4">
            <!-- Score Card -->
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center ${scoreBg}">
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">Email Security Score</p>
                <p class="text-4xl font-bold ${scoreColor}">${scorePercent}%</p>
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">${scoreTotal} of 3 checks passed</p>
            </div>

            <!-- MX Records -->
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                    <h5 class="font-semibold text-gray-900 dark:text-white">MX Records (Mail Servers)</h5>
                    <span class="${emailData.hasMX ? 'text-green-600' : 'text-red-600'}">${emailData.hasMX ? '✓' : '✕'}</span>
                </div>
                ${emailData.hasMX ? `
                    <div class="space-y-1">
                        ${emailData.mx.map(mx => `
                            <p class="text-sm font-mono bg-gray-50 dark:bg-gray-700 p-2 rounded text-gray-900 dark:text-white">${mx}</p>
                        `).join('')}
                    </div>
                ` : '<p class="text-sm text-red-600 dark:text-red-400">No MX records found</p>'}
            </div>

            <!-- SPF Record -->
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                    <h5 class="font-semibold text-gray-900 dark:text-white">SPF Record</h5>
                    <span class="${emailData.hasSPF ? 'text-green-600' : 'text-red-600'}">${emailData.hasSPF ? '✓' : '✕'}</span>
                </div>
                ${emailData.hasSPF ? `
                    <p class="text-sm font-mono bg-gray-50 dark:bg-gray-700 p-2 rounded text-gray-900 dark:text-white break-all">${emailData.spf}</p>
                ` : '<p class="text-sm text-red-600 dark:text-red-400">No SPF record found</p>'}
            </div>

            <!-- DMARC Record -->
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                    <h5 class="font-semibold text-gray-900 dark:text-white">DMARC Record</h5>
                    <span class="${emailData.hasDMARC ? 'text-green-600' : 'text-red-600'}">${emailData.hasDMARC ? '✓' : '✕'}</span>
                </div>
                ${emailData.hasDMARC ? `
                    <p class="text-sm font-mono bg-gray-50 dark:bg-gray-700 p-2 rounded text-gray-900 dark:text-white break-all">${emailData.dmarc}</p>
                ` : '<p class="text-sm text-red-600 dark:text-red-400">No DMARC record found</p>'}
            </div>
        </div>
    `;

    resultsDiv.classList.remove('hidden');
}

// ============================================
// SECURITY HEADERS FUNCTIONS
// ============================================

async function checkSecurityHeaders(domain) {
    const normalizedDomain = normalizeDomain(domain);

    try {
        // Use SecurityHeaders.com API or manual fetch
        const url = `https://${normalizedDomain}`;
        const response = await fetch(url, {mode: 'cors'});

        const headers = {
            'strict-transport-security': response.headers.get('strict-transport-security'),
            'content-security-policy': response.headers.get('content-security-policy'),
            'x-frame-options': response.headers.get('x-frame-options'),
            'x-content-type-options': response.headers.get('x-content-type-options'),
            'referrer-policy': response.headers.get('referrer-policy'),
            'permissions-policy': response.headers.get('permissions-policy')
        };

        return {
            domain: normalizedDomain,
            headers: headers,
            hasHSTS: !!headers['strict-transport-security'],
            hasCSP: !!headers['content-security-policy'],
            hasXFrame: !!headers['x-frame-options'],
            hasXContent: !!headers['x-content-type-options'],
            hasReferrer: !!headers['referrer-policy'],
            hasPermissions: !!headers['permissions-policy']
        };
    } catch (error) {
        console.error('Security headers check error:', error);
        throw error;
    }
}

async function handleSecurityCheck() {
    const input = document.getElementById('securityInput');
    const domain = input.value.trim();

    if (!domain) {
        showToast('Please enter a domain name', 'warning');
        return;
    }

    document.getElementById('securityLoadingState').classList.remove('hidden');
    document.getElementById('securityResults').classList.add('hidden');

    try {
        const securityData = await checkSecurityHeaders(domain);
        displaySecurityResults(securityData);
        document.getElementById('securityLoadingState').classList.add('hidden');
        showToast('Security check completed', 'success');
    } catch (error) {
        document.getElementById('securityLoadingState').classList.add('hidden');
        document.getElementById('securityResults').innerHTML = `
            <div class="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-800 rounded-lg p-4">
                <p class="text-yellow-800 dark:text-yellow-200">⚠️ Unable to check security headers due to CORS restrictions.</p>
                <p class="text-sm text-yellow-700 dark:text-yellow-300 mt-2">This is a browser security feature. The website may still have proper security headers.</p>
            </div>
        `;
        document.getElementById('securityResults').classList.remove('hidden');
    }
}

function displaySecurityResults(securityData) {
    const resultsDiv = document.getElementById('securityResults');

    const scoreTotal = (securityData.hasHSTS ? 1 : 0) + (securityData.hasCSP ? 1 : 0) +
                       (securityData.hasXFrame ? 1 : 0) + (securityData.hasXContent ? 1 : 0) +
                       (securityData.hasReferrer ? 1 : 0) + (securityData.hasPermissions ? 1 : 0);

    const headers = [
        {name: 'Strict-Transport-Security (HSTS)', key: 'strict-transport-security', has: securityData.hasHSTS},
        {name: 'Content-Security-Policy (CSP)', key: 'content-security-policy', has: securityData.hasCSP},
        {name: 'X-Frame-Options', key: 'x-frame-options', has: securityData.hasXFrame},
        {name: 'X-Content-Type-Options', key: 'x-content-type-options', has: securityData.hasXContent},
        {name: 'Referrer-Policy', key: 'referrer-policy', has: securityData.hasReferrer},
        {name: 'Permissions-Policy', key: 'permissions-policy', has: securityData.hasPermissions}
    ];

    resultsDiv.innerHTML = `
        <div class="space-y-3">
            ${headers.map(header => `
                <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div class="flex items-center justify-between mb-2">
                        <h5 class="font-semibold text-gray-900 dark:text-white">${header.name}</h5>
                        <span class="${header.has ? 'text-green-600' : 'text-red-600'}">${header.has ? '✓ Present' : '✕ Missing'}</span>
                    </div>
                    ${header.has && securityData.headers[header.key] ? `
                        <p class="text-xs font-mono bg-gray-50 dark:bg-gray-700 p-2 rounded text-gray-900 dark:text-white break-all">${securityData.headers[header.key]}</p>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    `;

    resultsDiv.classList.remove('hidden');
}

// ============================================
// DOMAIN COMPARISON FUNCTIONS
// ============================================

async function compareDomains(domain1, domain2) {
    try {
        const [data1, data2] = await Promise.all([
            fetchDomainInfo(domain1),
            fetchDomainInfo(domain2)
        ]);

        return {domain1: data1, domain2: data2};
    } catch (error) {
        console.error('Domain comparison error:', error);
        throw error;
    }
}

async function handleCompare() {
    const domain1 = document.getElementById('compareInput1').value.trim();
    const domain2 = document.getElementById('compareInput2').value.trim();

    if (!domain1 || !domain2) {
        showToast('Please enter both domains', 'warning');
        return;
    }

    document.getElementById('compareLoadingState').classList.remove('hidden');
    document.getElementById('compareResults').classList.add('hidden');

    try {
        const comparison = await compareDomains(domain1, domain2);
        displayComparisonResults(comparison);
        document.getElementById('compareLoadingState').classList.add('hidden');
        showToast('Comparison completed', 'success');
    } catch (error) {
        document.getElementById('compareLoadingState').classList.add('hidden');
        showToast('Comparison failed', 'error');
    }
}

function displayComparisonResults(comparison) {
    const resultsDiv = document.getElementById('compareResults');

    const fields = [
        {label: 'Domain', key: 'domain'},
        {label: 'Status', key: 'status'},
        {label: 'Expiry Date', key: 'expiryDate', format: formatDate},
        {label: 'Created Date', key: 'createdDate', format: formatDate},
        {label: 'Registrar', key: 'registrar'},
        {label: 'Days Until Expiry', key: 'expiryDate', custom: (d) => {
            const days = calculateDaysUntilExpiry(d.expiryDate);
            return days !== null ? `${days} days` : 'Unknown';
        }}
    ];

    resultsDiv.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full border-collapse">
                <thead>
                    <tr class="bg-gray-100 dark:bg-gray-700">
                        <th class="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-gray-900 dark:text-white">Attribute</th>
                        <th class="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-gray-900 dark:text-white">${comparison.domain1.domain}</th>
                        <th class="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-gray-900 dark:text-white">${comparison.domain2.domain}</th>
                    </tr>
                </thead>
                <tbody>
                    ${fields.map(field => {
                        let val1, val2;

                        if (field.custom) {
                            val1 = field.custom(comparison.domain1);
                            val2 = field.custom(comparison.domain2);
                        } else {
                            val1 = comparison.domain1[field.key] || 'N/A';
                            val2 = comparison.domain2[field.key] || 'N/A';

                            if (field.format) {
                                val1 = val1 !== 'N/A' ? field.format(val1) : val1;
                                val2 = val2 !== 'N/A' ? field.format(val2) : val2;
                            }
                        }

                        return `
                            <tr>
                                <td class="border border-gray-300 dark:border-gray-600 px-4 py-2 font-semibold text-gray-900 dark:text-white">${field.label}</td>
                                <td class="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">${val1}</td>
                                <td class="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">${val2}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    resultsDiv.classList.remove('hidden');
}

// ============================================
// ANALYTICS & CHARTS FUNCTIONS
// ============================================

function renderExpiryChart() {
    const domains = getTrackedDomains();

    if (domains.length === 0) {
        document.getElementById('expiryChart').parentElement.innerHTML = `
            <p class="text-center text-gray-600 dark:text-gray-400 py-12">No domains tracked yet</p>
        `;
        return;
    }

    // Group domains by expiry month
    const expiryByMonth = {};

    domains.forEach(domain => {
        if (domain.expiryDate) {
            const date = new Date(domain.expiryDate);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            if (!expiryByMonth[monthKey]) {
                expiryByMonth[monthKey] = 0;
            }
            expiryByMonth[monthKey]++;
        }
    });

    // Sort by month
    const sortedMonths = Object.keys(expiryByMonth).sort();
    const counts = sortedMonths.map(month => expiryByMonth[month]);

    const ctx = document.getElementById('expiryChart').getContext('2d');

    if (window.expiryChartInstance) {
        window.expiryChartInstance.destroy();
    }

    window.expiryChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedMonths,
            datasets: [{
                label: 'Domains Expiring',
                data: counts,
                backgroundColor: 'rgba(59, 130, 246, 0.5)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

function renderRegistrarChart() {
    const domains = getTrackedDomains();
    const registrarCounts = {};

    domains.forEach(domain => {
        const registrar = domain.registrar || 'Unknown';
        if (!registrarCounts[registrar]) {
            registrarCounts[registrar] = 0;
        }
        registrarCounts[registrar]++;
    });

    const sorted = Object.entries(registrarCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const chartDiv = document.getElementById('registrarChart');

    if (sorted.length === 0) {
        chartDiv.innerHTML = `<p class="text-center text-gray-600 dark:text-gray-400">No data available</p>`;
        return;
    }

    chartDiv.innerHTML = sorted.map(([registrar, count]) => {
        const percent = (count / domains.length) * 100;
        return `
            <div class="mb-3">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-gray-900 dark:text-white">${registrar}</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">${count} (${percent.toFixed(1)}%)</span>
                </div>
                <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div class="bg-blue-600 h-2 rounded-full" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function updatePortfolioAnalytics() {
    const domains = getTrackedDomains();

    if (domains.length === 0) {
        document.getElementById('avgAge').textContent = '0 years';
        document.getElementById('portfolioValue').textContent = '$0';
        document.getElementById('totalRegistrars').textContent = '0';
        return;
    }

    // Calculate average age
    let totalAge = 0;
    let ageCount = 0;

    domains.forEach(domain => {
        if (domain.createdDate) {
            const created = new Date(domain.createdDate);
            const now = new Date();
            const ageMs = now - created;
            const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365);
            totalAge += ageYears;
            ageCount++;
        }
    });

    const avgAge = ageCount > 0 ? (totalAge / ageCount).toFixed(1) : 0;

    // Estimate portfolio value (rough estimate: $10 per domain + $5 per year of age)
    const estValue = domains.length * 10 + (totalAge * 5);

    // Count unique registrars
    const registrars = new Set();
    domains.forEach(d => {
        if (d.registrar) registrars.add(d.registrar);
    });

    document.getElementById('avgAge').textContent = `${avgAge} years`;
    document.getElementById('portfolioValue').textContent = `$${Math.round(estValue)}`;
    document.getElementById('totalRegistrars').textContent = registrars.size;
}

// ============================================
// CALENDAR EXPORT FUNCTIONS
// ============================================

function generateICS(domains, expiringOnly = false) {
    let filtered = domains;

    if (expiringOnly) {
        filtered = domains.filter(d => {
            const days = calculateDaysUntilExpiry(d.expiryDate);
            return days !== null && days <= CONFIG.ALERT_THRESHOLDS.WARNING;
        });
    }

    const events = filtered.map(domain => {
        if (!domain.expiryDate) return null;

        const expiryDate = new Date(domain.expiryDate);
        const reminderDate = new Date(expiryDate);
        reminderDate.setDate(reminderDate.getDate() - 30); // 30 days before

        const formatDateForICS = (date) => {
            return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        };

        return `BEGIN:VEVENT
UID:${domain.domain}-${Date.now()}@domain-alert-pro
DTSTAMP:${formatDateForICS(new Date())}
DTSTART:${formatDateForICS(expiryDate)}
SUMMARY:Domain Expiry: ${domain.domain}
DESCRIPTION:Domain ${domain.domain} expires on this date. Registrar: ${domain.registrar}
STATUS:CONFIRMED
BEGIN:VALARM
TRIGGER:-P30D
DESCRIPTION:Domain ${domain.domain} expires in 30 days
ACTION:DISPLAY
END:VALARM
END:VEVENT`;
    }).filter(e => e !== null);

    if (events.length === 0) {
        showToast('No domains with expiry dates to export', 'warning');
        return null;
    }

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Domain Alert Pro//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Domain Expiry Reminders
X-WR-TIMEZONE:UTC
${events.join('\n')}
END:VCALENDAR`;

    return icsContent;
}

function handleICSExport(expiringOnly = false) {
    const domains = getTrackedDomains();

    if (domains.length === 0) {
        showToast('No domains to export', 'warning');
        return;
    }

    const icsContent = generateICS(domains, expiringOnly);

    if (!icsContent) return;

    const filename = expiringOnly ? 'domain-expiry-alerts.ics' : 'domain-expiry-all.ics';
    downloadFile(icsContent, filename, 'text/calendar');

    showToast(`Calendar file exported: ${filename}`, 'success');
}

// ============================================
// INITIALIZATION
// ============================================

function initApp() {
    // Load settings
    loadSettings();
    applyDarkMode();
    loadSettingsUI();

    // Tab switching
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    // Dark mode toggle
    document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);

    // Notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        document.getElementById('notificationBtn').classList.remove('hidden');
    }
    document.getElementById('notificationBtn').addEventListener('click', requestNotificationPermission);

    // Domain Checker
    document.getElementById('checkBtn').addEventListener('click', handleDomainCheck);
    document.getElementById('domainInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleDomainCheck();
    });
    document.getElementById('checkMultiTldBtn').addEventListener('click', handleMultiTLDCheck);

    // DNS Lookup
    document.getElementById('dnsLookupBtn').addEventListener('click', handleDNSLookup);
    document.getElementById('dnsInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleDNSLookup();
    });

    // Subdomain Finder
    document.getElementById('subdomainFindBtn').addEventListener('click', handleSubdomainFind);
    document.getElementById('subdomainInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSubdomainFind();
    });

    // Bulk Checker
    document.getElementById('bulkCheckBtn').addEventListener('click', handleBulkCheck);
    document.getElementById('bulkTrackAllBtn').addEventListener('click', handleBulkTrackAll);
    document.getElementById('bulkExportBtn').addEventListener('click', handleBulkExport);

    // Domain Age
    document.getElementById('ageCheckBtn').addEventListener('click', handleDomainAge);

    // Dashboard
    document.getElementById('clearAllBtn').addEventListener('click', handleClearAll);
    document.getElementById('exportCsvBtn').addEventListener('click', exportToCSV);
    document.getElementById('exportJsonBtn').addEventListener('click', exportToJSON);
    document.getElementById('importBtn').addEventListener('click', handleImport);
    document.getElementById('importFile').addEventListener('change', handleImportFile);
    document.getElementById('refreshAllBtn').addEventListener('click', handleRefreshAll);

    // Search and Filter
    document.getElementById('searchDomains').addEventListener('input', handleSearchFilter);
    document.getElementById('filterCategory').addEventListener('change', handleSearchFilter);
    document.getElementById('filterStatus').addEventListener('change', handleSearchFilter);

    // Settings
    document.getElementById('saveSettingsBtn').addEventListener('click', handleSaveSettings);

    // SSL Checker
    document.getElementById('sslCheckBtn').addEventListener('click', handleSSLCheck);
    document.getElementById('sslInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSSLCheck();
    });

    // Security Checks
    document.getElementById('securityCheckBtn').addEventListener('click', handleSecurityCheck);
    document.getElementById('emailSecCheckBtn').addEventListener('click', handleEmailSecurityCheck);
    document.getElementById('compareBtn').addEventListener('click', handleCompare);

    // Analytics
    document.getElementById('exportIcsBtn').addEventListener('click', () => handleICSExport(false));
    document.getElementById('exportIcsExpiringBtn').addEventListener('click', () => handleICSExport(true));

    // Initial render
    renderDomainsList();
    updateStatistics();

    // Auto-refresh if enabled
    if (settings.autoRefresh) {
        const domains = getTrackedDomains();
        if (domains.length > 0 && domains.length <= 10) {
            handleRefreshAll();
        }
    }

    // Check for notifications
    checkAndNotify();

    // Update category filter options
    updateCategoryFilter();

    console.log('Domain Alert Pro initialized successfully');
}

function updateCategoryFilter() {
    const domains = getTrackedDomains();
    const categories = new Set();

    domains.forEach(d => {
        if (d.category) categories.add(d.category);
    });

    const select = document.getElementById('filterCategory');
    const currentValue = select.value;

    // Keep "All Categories" option
    select.innerHTML = '<option value="">All Categories</option>';

    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
        select.appendChild(option);
    });

    select.value = currentValue;
}

// Make functions available globally
window.removeDomain = removeDomain;
window.recheckDomain = recheckDomain;
window.copySubdomains = copySubdomains;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
