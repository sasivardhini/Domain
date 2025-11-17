# 🚀 Quick Start Guide - Domain Alert

## Deploy in 60 Seconds

### Option 1: Vercel (Easiest)

```bash
npm install -g vercel
vercel
```

Done! Your site is live.

### Option 2: Netlify Drop

1. Go to https://app.netlify.com/drop
2. Drag the entire folder
3. Done!

### Option 3: GitHub Pages

1. Push to GitHub
2. Settings → Pages → Enable
3. Done!

---

## Local Testing

Open `index.html` in your browser. That's it!

Or use:

```bash
python -m http.server 8000
```

Visit `http://localhost:8000`

---

## Add Affiliate Links (Make Money)

Edit `app.js` line 13-17:

```javascript
AFFILIATE_LINKS: {
    namecheap: 'https://www.namecheap.com/?aff=YOUR_ID_HERE',
    godaddy: 'https://www.godaddy.com/offers/default.aspx?isc=YOUR_ID_HERE',
    default: 'https://www.namecheap.com/?aff=YOUR_ID_HERE'
}
```

### Get Affiliate IDs:

- Namecheap: https://www.namecheap.com/affiliate/
- GoDaddy: https://www.godaddy.com/affiliate-programs

---

## How Users Use It

1. Enter domain → Click "Check Domain"
2. See expiry info → Click "Track This Domain"
3. Get alerts when domains are expiring soon

---

## Features

✅ Real-time RDAP lookups
✅ Local storage (no backend needed)
✅ Color-coded alerts
✅ Mobile responsive
✅ 100% free to run
✅ Privacy-focused

---

## Zero Cost Hosting

- **Vercel**: Free forever for personal projects
- **Netlify**: Free tier - 100GB/month
- **GitHub Pages**: Free for public repos
- **Cloudflare Pages**: Free unlimited

---

## Customization

### Change Logo

Edit `index.html` line 37:

```html
<span class="text-4xl">🌐</span>
<!-- Replace with your logo -->
```

### Change Colors

Edit Tailwind classes in `index.html`:

```html
bg-blue-600 → bg-purple-600
```

### Modify Alert Timings

Edit `app.js` line 8-12:

```javascript
ALERT_THRESHOLDS: {
    CRITICAL: 30,  // Change to your preference
    WARNING: 60,
    INFO: 90
}
```

---

## Need Help?

Check the full README.md for detailed documentation.

---

**That's it! You're ready to go.** 🎉
