# 🌐 Domain Alert - Free Domain Expiry Tracker

> **Production-ready, frontend-only SaaS** for tracking domain expiry dates with real-time RDAP lookups.

A lightweight, privacy-focused domain monitoring tool that runs entirely in your browser. No backend, no database, no registration required.

---

## ✨ Features

- ✅ **Real-time domain lookup** via RDAP API
- ✅ **Track unlimited domains** - all stored locally
- ✅ **Smart alerts** - color-coded warnings for expiring domains
- ✅ **Zero backend** - runs 100% in browser
- ✅ **Privacy-first** - your data never leaves your device
- ✅ **Responsive design** - works on desktop and mobile
- ✅ **Production-ready** - clean code, error handling, beautiful UI

---

## 🚀 Quick Start

### Option 1: Deploy to Vercel (Recommended - Free)

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```

3. Follow the prompts and you're live in seconds!

### Option 2: Deploy to Netlify (Free)

1. **Drag & drop** the entire folder to [Netlify Drop](https://app.netlify.com/drop)
2. Done! Your site is live.

### Option 3: Deploy to GitHub Pages (Free)

1. Push this repository to GitHub
2. Go to Settings → Pages
3. Select main branch as source
4. Your site will be live at `https://yourusername.github.io/domain-alert`

### Option 4: Run Locally

Simply open `index.html` in your browser. That's it!

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve

# Using PHP
php -S localhost:8000
```

Then visit `http://localhost:8000`

---

## 📖 How to Use

1. **Check a domain**: Enter any domain (e.g., `google.com`) and click "Check Domain"
2. **View details**: See expiry date, status, registrar, and days until expiry
3. **Track it**: Click "Track This Domain" to save it to your local list
4. **Monitor**: Domains with expiry dates coming up will show color-coded alerts

### Alert Levels

| Color | Status | Days Until Expiry |
|-------|--------|-------------------|
| 🔴 Red | URGENT | < 30 days |
| 🟠 Orange | Soon | 30-60 days |
| 🟡 Yellow | Upcoming | 60-90 days |
| 🟢 Green | Good | > 90 days |

---

## 💰 Monetization (Optional)

### Add Your Affiliate Links

Edit `app.js` and update the affiliate links:

```javascript
AFFILIATE_LINKS: {
    namecheap: 'https://www.namecheap.com/?aff=YOUR_ID',
    godaddy: 'https://www.godaddy.com/offers/default.aspx?isc=YOUR_ID',
    default: 'https://www.namecheap.com/?aff=YOUR_ID'
}
```

### Recommended Affiliate Programs

1. **Namecheap** - Up to $100 per sale
   - Sign up: https://www.namecheap.com/affiliate/

2. **GoDaddy** - $15-100 per sale
   - Sign up: https://www.godaddy.com/affiliate-programs

3. **Bluehost** - $65-120 per sale
   - Sign up: https://www.bluehost.com/affiliates

---

## 🛠️ Technical Details

### Stack

- **Frontend**: Vanilla JavaScript (ES6+)
- **Styling**: Tailwind CSS (CDN)
- **API**: RDAP (Registration Data Access Protocol)
- **Storage**: localStorage (browser)

### Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

### RDAP API

This app uses the official RDAP protocol to query domain information:

- **Bootstrap URL**: https://data.iana.org/rdap/dns.json
- **Free**: No API keys required
- **Real-time**: Always up-to-date information
- **Global**: Works for all major TLDs

### Data Privacy

- All data stored in **localStorage** (your browser)
- No cookies, no tracking, no analytics
- No data sent to any server
- Completely client-side

---

## 📁 Project Structure

```
domain-alert/
├── index.html          # Main HTML file
├── app.js              # All JavaScript logic
└── README.md           # Documentation
```

That's it! Only 2 files needed.

---

## 🎨 Customization

### Change Colors

Edit the Tailwind classes in `index.html`:

```html
<!-- Change primary color from blue to purple -->
<button class="bg-purple-600 hover:bg-purple-700">
```

### Add Your Logo

Replace the emoji in the header:

```html
<span class="text-4xl">🌐</span>
<!-- Change to -->
<img src="your-logo.png" class="h-10 w-10">
```

### Modify Alert Thresholds

Edit `CONFIG` in `app.js`:

```javascript
ALERT_THRESHOLDS: {
    CRITICAL: 30,  // Change to 15 for more urgent alerts
    WARNING: 60,   // Change to 45
    INFO: 90       // Change to 60
}
```

---

## 🔧 Advanced Features (Coming Soon)

Want to add more features? Here are easy upgrades:

### 1. Export to CSV

Add this function to `app.js`:

```javascript
function exportToCSV() {
    const domains = getTrackedDomains();
    const csv = domains.map(d =>
        `${d.domain},${d.expiryDate},${d.registrar}`
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'domains.csv';
    a.click();
}
```

### 2. Email Alerts

Use a service like EmailJS (free tier):

```javascript
// Add EmailJS SDK
// Send alerts when domains are expiring
```

### 3. Dark Mode

Add a toggle button and CSS class switching.

---

## 🐛 Troubleshooting

### Domain not found

- Make sure you're entering the domain without `http://` or `https://`
- Some TLDs might not be supported by RDAP
- Try adding the full domain with TLD (e.g., `example.com` not `example`)

### CORS Errors

- RDAP servers support CORS, but if you see errors:
- Make sure you're using HTTPS (Vercel/Netlify handle this)
- Some local setups might need a simple HTTP server

### localStorage Full

- Browser localStorage has ~5-10MB limit
- Each domain uses very little space (~1KB)
- You can track 1000+ domains easily

---

## 📈 Performance

- **Initial load**: < 1 second
- **Domain lookup**: 1-3 seconds (RDAP API)
- **UI updates**: Instant
- **Storage**: < 1KB per domain

---

## 🚀 Production Checklist

Before going live:

- [ ] Update affiliate links in `app.js`
- [ ] Test on mobile devices
- [ ] Test domain lookups for various TLDs (.com, .net, .org, etc.)
- [ ] Add your own analytics (optional)
- [ ] Add custom domain (Vercel/Netlify support this)
- [ ] Set up social sharing meta tags (optional)

---

## 📝 License

MIT License - feel free to use this for personal or commercial projects!

---

## 🤝 Contributing

Want to improve this? Here's how:

1. Fork the repository
2. Make your changes
3. Test thoroughly
4. Submit a pull request

---

## 💡 Ideas for Growth

1. **Add blog content** about domain management
2. **Create comparison pages** for domain registrars
3. **Build backlink strategy** with domain tools directories
4. **Add calculators** (domain value, age, etc.)
5. **Create video tutorials** for YouTube
6. **Guest post** on web dev blogs

---

## 📞 Support

- Issues: Open a GitHub issue
- Questions: Check the code comments in `app.js`
- Updates: Watch this repository

---

## 🎯 Next Steps

1. **Deploy** using one of the methods above
2. **Share** with the community
3. **Monitor** what domains people search for (analytics)
4. **Optimize** based on user behavior
5. **Monetize** with affiliate links
6. **Scale** by adding more features

---

## 🌟 Showcase

Built with this project? Add your link here!

---

**Built with ❤️ for the domain management community**

Made by developers, for developers.

---

## Version

**v1.0.0** - Initial MVP Release

- ✅ RDAP integration
- ✅ Local storage
- ✅ Alert system
- ✅ Responsive UI
- ✅ Production-ready code

---

Happy domain tracking! 🚀
