# 🚀 Free API Cheatsheet - Domain Monitoring

> Quick reference for all free APIs that work frontend-only

---

## 🔍 DNS Lookups

### Google DNS over HTTPS

```javascript
// Basic DNS lookup
fetch('https://dns.google/resolve?name=example.com&type=A')
  .then(r => r.json())
  .then(data => console.log(data.Answer));

// Record types: A, AAAA, MX, TXT, NS, CNAME, SOA, PTR, SRV, CAA
```

**Endpoint**: `https://dns.google/resolve`

**Parameters**:
- `name`: Domain name (required)
- `type`: Record type (default: A)
- `cd`: Disable DNSSEC validation (0 or 1)

**Rate Limit**: Unlimited
**Auth**: None
**CORS**: ✅ Enabled

---

### Cloudflare DNS over HTTPS

```javascript
// JSON format
fetch('https://cloudflare-dns.com/dns-query?name=example.com&type=A', {
  headers: { 'Accept': 'application/dns-json' }
})
  .then(r => r.json())
  .then(data => console.log(data));
```

**Endpoint**: `https://cloudflare-dns.com/dns-query`

**Parameters**:
- `name`: Domain name
- `type`: Record type

**Rate Limit**: Unlimited
**Auth**: None
**CORS**: ✅ Enabled
**Note**: Fastest DNS service in 2025

---

## 🔐 SSL & Subdomains

### crt.sh Certificate Transparency

```javascript
// Find subdomains
fetch('https://crt.sh/?q=%.example.com&output=json')
  .then(r => r.json())
  .then(certs => {
    const subdomains = [...new Set(
      certs.flatMap(c => c.name_value.split('\n'))
    )];
    console.log(subdomains);
  });

// Get SSL certificate details
fetch('https://crt.sh/?q=example.com&output=json')
  .then(r => r.json())
  .then(certs => {
    const latest = certs[0];
    console.log('Issuer:', latest.issuer_name);
    console.log('Expiry:', latest.not_after);
  });
```

**Endpoint**: `https://crt.sh/`

**Parameters**:
- `q`: Query (use %.domain.com for subdomains)
- `output`: json or html (default: html)

**Rate Limit**: Unlimited
**Auth**: None
**CORS**: ✅ Enabled

**Response Fields**:
- `name_value`: Certificate common names (subdomains)
- `issuer_name`: Certificate issuer
- `not_after`: Expiry date
- `entry_timestamp`: When cert was logged

---

## 🌍 WHOIS / RDAP

### whatismyip.net RDAP API

```javascript
// RDAP lookup
fetch('https://www.whatismyip.net/whois/?domain=example.com')
  .then(r => r.json())
  .then(data => console.log(data));
```

**Endpoint**: `https://www.whatismyip.net/whois/`

**Parameters**:
- `domain`: Domain name (required)

**Rate Limit**: 50 requests/minute per IP
**Auth**: None
**CORS**: ✅ Enabled

---

### IANA RDAP Bootstrap (Current Implementation)

```javascript
// Standard RDAP lookup
async function rdapLookup(domain) {
  // 1. Get bootstrap data
  const bootstrap = await fetch('https://data.iana.org/rdap/dns.json')
    .then(r => r.json());

  // 2. Find TLD server
  const tld = domain.split('.').pop();
  const servers = bootstrap.services
    .find(s => s[0].includes(tld))?.[1];

  if (!servers) throw new Error('TLD not supported');

  // 3. Query RDAP server
  const rdapUrl = `${servers[0]}domain/${domain}`;
  return fetch(rdapUrl).then(r => r.json());
}
```

**Bootstrap URL**: `https://data.iana.org/rdap/dns.json`

**Rate Limit**: Varies by TLD registry
**Auth**: None
**CORS**: ✅ Enabled (most registries)

---

## 📧 Email Security

### SPF Record Check

```javascript
// Check SPF via DNS TXT records
fetch('https://dns.google/resolve?name=example.com&type=TXT')
  .then(r => r.json())
  .then(data => {
    const spf = data.Answer?.find(r => r.data.includes('v=spf1'));
    console.log('SPF:', spf?.data);
  });
```

**What to look for**:
- `v=spf1`: SPF version identifier
- `include:_spf.google.com`: Include Google SPF
- `-all`: Fail all others (strict)
- `~all`: Soft fail (permissive)

---

### DMARC Record Check

```javascript
// Check DMARC at _dmarc subdomain
fetch('https://dns.google/resolve?name=_dmarc.example.com&type=TXT')
  .then(r => r.json())
  .then(data => {
    const dmarc = data.Answer?.find(r => r.data.includes('v=DMARC1'));
    console.log('DMARC:', dmarc?.data);
  });
```

**What to look for**:
- `v=DMARC1`: DMARC version
- `p=reject`: Reject policy (strict)
- `p=quarantine`: Quarantine policy (moderate)
- `p=none`: No policy (monitoring only)
- `rua=mailto:`: Aggregate report email

---

### MX Record Check

```javascript
// Check mail servers
fetch('https://dns.google/resolve?name=example.com&type=MX')
  .then(r => r.json())
  .then(data => {
    const mx = data.Answer?.map(r => ({
      priority: parseInt(r.data.split(' ')[0]),
      server: r.data.split(' ')[1]
    }));
    console.log('Mail Servers:', mx);
  });
```

---

## 🔒 Security Headers

### Mozilla HTTP Observatory

```javascript
// Scan security headers
async function scanSecurityHeaders(domain) {
  // 1. Start scan
  const scan = await fetch('https://observatory-api.mdn.mozilla.net/api/v2/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host: domain })
  }).then(r => r.json());

  // 2. Poll for results
  await new Promise(r => setTimeout(r, 5000)); // Wait 5s

  // 3. Get results
  const results = await fetch(
    `https://observatory-api.mdn.mozilla.net/api/v2/scan/${scan.scan_id}`
  ).then(r => r.json());

  return {
    grade: results.grade,
    score: results.score,
    tests: results.tests
  };
}
```

**Endpoint**: `https://observatory-api.mdn.mozilla.net/api/v2/scan`

**Method**: POST to start, GET to retrieve
**Rate Limit**: Unlimited (free)
**Auth**: None
**CORS**: ✅ Enabled

**Response**:
- `grade`: A+ to F
- `score`: 0-100+
- `tests`: Object with individual test results

---

## 🚀 Performance

### Google PageSpeed Insights

```javascript
// Get performance score
fetch('https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://example.com&category=performance&category=seo')
  .then(r => r.json())
  .then(data => {
    const perf = data.lighthouseResult.categories.performance.score * 100;
    const seo = data.lighthouseResult.categories.seo.score * 100;
    console.log('Performance:', perf, 'SEO:', seo);
  });
```

**Endpoint**: `https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed`

**Parameters**:
- `url`: Full URL with https:// (required)
- `category`: performance, accessibility, best-practices, seo, pwa
- `strategy`: mobile or desktop (default: mobile)
- `key`: API key (optional but recommended)

**Rate Limit**:
- Without key: Limited
- With key: 25,000/day (free)

**Get API Key**: https://developers.google.com/speed/docs/insights/v5/get-started

**CORS**: ✅ Enabled

---

## 🖼️ Website Screenshots

### Thum.io (1000/month free)

```html
<!-- Direct image URL - No JavaScript needed -->
<img src="https://image.thum.io/get/https://example.com" alt="Screenshot" />

<!-- Custom size -->
<img src="https://image.thum.io/get/width/800/crop/600/https://example.com" />
```

**URL Format**: `https://image.thum.io/get/[options]/[URL]`

**Options**:
- `width/800`: Set width to 800px
- `crop/600`: Crop height to 600px
- `auth/API_KEY`: Use API key (for more requests)

**Rate Limit**: 1,000 impressions/month (free, no signup)
**Auth**: None (optional for more quota)

---

### PagePeeker (Unlimited free)

```html
<!-- Direct image URL -->
<img src="https://api.pagepeeker.com/v2/thumbs.php?size=l&url=example.com" />
```

**URL Format**: `https://api.pagepeeker.com/v2/thumbs.php`

**Parameters**:
- `size`: s (small), m (medium), l (large), x (extra large)
- `url`: Domain or full URL

**Rate Limit**: Unlimited
**Auth**: None

---

## 🌍 IP Geolocation

### ip-api.com

```javascript
// Get IP location
fetch('http://ip-api.com/json/8.8.8.8')
  .then(r => r.json())
  .then(geo => {
    console.log(`${geo.city}, ${geo.country}`);
    console.log(`Lat: ${geo.lat}, Lon: ${geo.lon}`);
    console.log(`ISP: ${geo.isp}`);
  });

// Batch lookup (up to 100 IPs)
fetch('http://ip-api.com/batch', {
  method: 'POST',
  body: JSON.stringify([
    { query: '8.8.8.8' },
    { query: '1.1.1.1' }
  ])
})
  .then(r => r.json())
  .then(results => console.log(results));
```

**Endpoint**: `http://ip-api.com/json/[IP]`

**Rate Limit**: 45 requests/minute
**Auth**: None
**CORS**: ❌ HTTP only (CORS issues with HTTPS sites)

**Response Fields**:
- `country`, `countryCode`: Country info
- `city`, `regionName`: Location
- `lat`, `lon`: Coordinates
- `isp`, `org`, `as`: ISP information
- `timezone`: Timezone

---

### ipapi.co (HTTPS)

```javascript
// Get IP location (HTTPS)
fetch('https://ipapi.co/8.8.8.8/json/')
  .then(r => r.json())
  .then(geo => console.log(geo));
```

**Endpoint**: `https://ipapi.co/[IP]/json/`

**Rate Limit**: 1,000 requests/day
**Auth**: None (API key for more quota)
**CORS**: ✅ Enabled

---

## 🔄 Reverse IP Lookup

### HackerTarget

```javascript
// Find domains on same IP
fetch('https://api.hackertarget.com/reverseiplookup/?q=8.8.8.8')
  .then(r => r.text())
  .then(domains => {
    const domainList = domains.split('\n');
    console.log(domainList);
  });
```

**Endpoint**: `https://api.hackertarget.com/reverseiplookup/`

**Parameters**:
- `q`: IP address (required)

**Rate Limit**: 50 queries/day (free)
**Auth**: None
**CORS**: ✅ Enabled
**Response**: Plain text, one domain per line

---

## 📊 DNS Propagation

### ViewDNS.info API

```javascript
// Check DNS propagation
// Note: Requires API key (free tier available)
fetch('https://api.viewdns.info/propagation/?domain=example.com&recordtype=A&apikey=YOUR_KEY&output=json')
  .then(r => r.json())
  .then(data => console.log(data));
```

**Endpoint**: `https://api.viewdns.info/propagation/`

**Parameters**:
- `domain`: Domain name
- `recordtype`: A, AAAA, MX, etc.
- `apikey`: Free API key required
- `output`: json or xml

**Rate Limit**: Free tier available
**Auth**: API key required
**Get Key**: https://viewdns.info/api/

---

## 🛡️ Domain Reputation

### APIVoid (Web Interface)

```javascript
// No direct API without key, but web tool available
// Use for manual checks: https://www.apivoid.com/tools/domain-reputation-check/
```

**Web Tool**: https://www.apivoid.com/tools/domain-reputation-check/

**API**: Requires paid account

---

## 📝 Quick Reference Table

| Feature | API | Auth | Rate Limit | CORS |
|---------|-----|------|------------|------|
| DNS Lookup | Google DoH | ❌ None | ♾️ Unlimited | ✅ Yes |
| DNS Lookup | Cloudflare DoH | ❌ None | ♾️ Unlimited | ✅ Yes |
| Subdomains | crt.sh | ❌ None | ♾️ Unlimited | ✅ Yes |
| WHOIS/RDAP | whatismyip.net | ❌ None | 50/min | ✅ Yes |
| RDAP | IANA Bootstrap | ❌ None | Varies | ✅ Yes |
| Security Headers | Mozilla Observatory | ❌ None | ♾️ Unlimited | ✅ Yes |
| PageSpeed | Google PSI | ⚠️ Optional | 25k/day | ✅ Yes |
| Screenshot | Thum.io | ❌ None | 1k/month | ✅ Yes |
| Screenshot | PagePeeker | ❌ None | ♾️ Unlimited | ✅ Yes |
| IP Location | ip-api.com | ❌ None | 45/min | ❌ No (HTTP) |
| IP Location | ipapi.co | ❌ None | 1k/day | ✅ Yes |
| Reverse IP | HackerTarget | ❌ None | 50/day | ✅ Yes |
| DNS Propagation | ViewDNS.info | ✅ Required | Free tier | ✅ Yes |

---

## 🎯 Best Practices

### Rate Limiting

```javascript
// Simple rate limiter
class RateLimiter {
  constructor(maxRequests, perMs) {
    this.maxRequests = maxRequests;
    this.perMs = perMs;
    this.requests = [];
  }

  async throttle() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.perMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.perMs - (now - oldestRequest);
      await new Promise(r => setTimeout(r, waitTime));
      return this.throttle();
    }

    this.requests.push(now);
  }
}

// Usage
const limiter = new RateLimiter(10, 60000); // 10 requests per minute

async function apiCall() {
  await limiter.throttle();
  return fetch('https://api.example.com/...');
}
```

---

### Error Handling

```javascript
// Robust API call with retry
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error.message);

      if (i === retries - 1) throw error;

      // Exponential backoff
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}
```

---

### Caching

```javascript
// Simple cache with TTL
class APICache {
  constructor(ttlMs = 300000) { // 5 min default
    this.cache = new Map();
    this.ttl = ttlMs;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      expiry: Date.now() + this.ttl
    });
  }

  clear() {
    this.cache.clear();
  }
}

// Usage
const dnsCache = new APICache();

async function cachedDNSLookup(domain, type) {
  const key = `${domain}:${type}`;
  const cached = dnsCache.get(key);

  if (cached) return cached;

  const result = await fetch(`https://dns.google/resolve?name=${domain}&type=${type}`)
    .then(r => r.json());

  dnsCache.set(key, result);
  return result;
}
```

---

## 🔧 Common Patterns

### Parallel API Calls

```javascript
// Check multiple things at once
async function checkDomainComplete(domain) {
  const [rdap, dns, subdomains, emailSec] = await Promise.all([
    lookupDomain(domain),
    DNSLookup.getAllRecords(domain),
    SubdomainFinder.find(domain),
    EmailSecurity.checkAll(domain)
  ]);

  return { rdap, dns, subdomains, emailSec };
}
```

---

### Sequential with Progress

```javascript
// Check multiple domains one by one
async function checkMultipleWithProgress(domains, onProgress) {
  const results = [];

  for (let i = 0; i < domains.length; i++) {
    const domain = domains[i];

    try {
      const data = await lookupDomain(domain);
      results.push({ domain, success: true, data });
    } catch (error) {
      results.push({ domain, success: false, error: error.message });
    }

    onProgress(i + 1, domains.length, domain);

    // Rate limiting
    if (i < domains.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return results;
}

// Usage
checkMultipleWithProgress(
  ['google.com', 'github.com', 'example.com'],
  (current, total, domain) => {
    console.log(`Checking ${current}/${total}: ${domain}`);
  }
);
```

---

### Timeout Wrapper

```javascript
// Add timeout to any promise
function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
    )
  ]);
}

// Usage
const data = await withTimeout(
  fetch('https://api.example.com/slow'),
  5000 // 5 second timeout
);
```

---

## 🐛 Debugging

### Enable Debug Mode

```javascript
// Add to console:
localStorage.setItem('debug', 'true');
location.reload();

// In code:
const DEBUG = localStorage.getItem('debug') === 'true';

function log(...args) {
  if (DEBUG) console.log('[Domain Alert]', ...args);
}

log('DNS lookup started for:', domain);
```

---

### Test API Endpoints

```javascript
// Quick test function
async function testAPI(name, url) {
  console.group(`Testing: ${name}`);
  const start = Date.now();

  try {
    const response = await fetch(url);
    const data = await response.json();
    const duration = Date.now() - start;

    console.log('✅ Success');
    console.log('Duration:', duration, 'ms');
    console.log('Response:', data);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  console.groupEnd();
}

// Run tests
testAPI('Google DNS', 'https://dns.google/resolve?name=google.com&type=A');
testAPI('crt.sh', 'https://crt.sh/?q=google.com&output=json');
testAPI('Mozilla Observatory', 'https://observatory-api.mdn.mozilla.net/api/v2/scan?host=google.com');
```

---

## 📖 Additional Resources

- **Google DNS DoH**: https://developers.google.com/speed/public-dns/docs/doh
- **Cloudflare DoH**: https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/
- **RDAP Protocol**: https://www.iana.org/assignments/rdap-extensions/rdap-extensions.xhtml
- **Certificate Transparency**: https://certificate.transparency.dev/
- **Mozilla Observatory**: https://observatory.mozilla.org/faq/
- **PageSpeed Insights**: https://developers.google.com/speed/docs/insights/v5/get-started

---

**Last Updated**: 2025-11-17

**Note**: API rate limits and features may change. Always check official documentation.
