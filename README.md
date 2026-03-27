# KSeF Web App

Frontend-only web application for Polish KSeF (Krajowy System e-Faktur) invoice management.

## Features

- **Generate Invoices**: Create KSeF-compliant XML invoices in the browser
- **Download from KSeF**: Authenticate and download invoices from the KSeF API
- **Convert to PDF**: Transform XML invoices into PDF format using the ksef-pdf-generator
- **Contacts Management**: Store seller and buyer information in localStorage
- **Settings**: Configure KSeF environment, credentials, and CORS proxy

## Tech Stack

- React 18 + TypeScript
- Vite
- TailwindCSS
- React Router
- Lucide React (icons)
- JSZip (for export handling)
- Web Crypto API (for encryption)
- ksef-pdf-generator (PDF conversion)

## Installation

```bash
cd ksef-web
npm install
```

## Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173/ksef-web/`

## Build

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Deployment to GitHub Pages

1. Push your code to a GitHub repository
2. Enable GitHub Pages in repository settings (Source: GitHub Actions)
3. The GitHub Actions workflow will automatically build and deploy on push to main

Alternatively, deploy manually:

```bash
npm run build
# Upload the dist/ folder to your hosting provider
```

## Configuration

### Settings Page

Configure the following in the Settings page:

- **KSeF Environment**: TEST, DEMO, or PROD
- **NIP**: Your tax identification number
- **KSeF Token**: Authentication token from KSeF
- **CORS Proxy URL** (optional): Required if KSeF API doesn't support CORS

### CORS Proxy

Since KSeF API may not support CORS for browser requests, you may need a CORS proxy. Options:

1. Use a public CORS proxy (not recommended for production)
2. Deploy your own CORS proxy (e.g., using cors-anywhere)
3. Use a serverless function as a proxy

Example CORS proxy URL format: `https://your-proxy.com/`

The app will append the KSeF API URL to this proxy URL.

## Usage

### 1. Configure Settings

- Go to Settings page
- Enter your NIP and KSeF token
- Select the appropriate environment (TEST for development)
- Optionally configure CORS proxy

### 2. Manage Contacts

- Go to Contacts page
- Configure seller information (your company details)
- Add buyer contacts for quick invoice generation
- Export/import contacts as JSON

### 3. Generate Invoice

- Go to Generate Invoice page
- Select a buyer from your contacts
- Enter invoice number (e.g., FV/2026/03/001)
- Add line items with descriptions, quantities, prices, and VAT rates
- Click "Generate and download XML"

### 4. Download from KSeF

- Go to Download from KSeF page
- Click "Authenticate" to connect to KSeF API
- Select date range and subject type
- Click "Search" to list invoices
- Download individual invoices or use "Export all" for bulk download

### 5. Convert to PDF

- Go to Convert to PDF page
- Upload a KSeF XML file
- Optionally add KSeF number and QR code URL
- Click "Convert to PDF"

## Project Structure

```
ksef-web/
├── src/
│   ├── lib/
│   │   ├── ksef/
│   │   │   ├── types.ts          # TypeScript types for KSeF data structures
│   │   │   ├── constants.ts      # KSeF API endpoints and constants
│   │   │   ├── xml-generator.ts  # XML generation using browser DOM API
│   │   │   ├── crypto.ts         # Web Crypto API helpers
│   │   │   └── client.ts         # KSeF API client (fetch-based)
│   │   ├── contacts.ts           # Contacts management (localStorage)
│   │   ├── settings.ts           # App settings (localStorage)
│   │   └── storage.ts            # localStorage utilities
│   ├── components/
│   │   └── layout/
│   │       └── Layout.tsx        # Main layout with navigation
│   ├── pages/
│   │   ├── GenerateInvoice.tsx   # Invoice generation page
│   │   ├── DownloadInvoices.tsx  # KSeF download page
│   │   ├── ConvertToPDF.tsx      # PDF conversion page
│   │   ├── Contacts.tsx          # Contacts management page
│   │   └── Settings.tsx          # Settings page
│   ├── App.tsx                   # Main app with routing
│   ├── main.tsx                  # Entry point
│   └── index.css                 # Global styles
├── public/                       # Static assets
├── index.html                    # HTML template
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── vite.config.ts                # Vite config
└── tailwind.config.js            # TailwindCSS config
```

## Security Notes

- All data is stored in browser localStorage (not encrypted)
- KSeF tokens are stored in localStorage - clear browser data when done
- CORS proxy may see your API requests - use trusted proxies only
- For production use, consider implementing additional security measures

## Browser Compatibility

Requires a modern browser with support for:
- Web Crypto API
- ES2020+ JavaScript features
- localStorage
- Fetch API

Tested on:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

This project is for educational and development purposes.

## Related Projects

- [ksef-pdf-generator](../ksef-pdf-generator/) - PDF generation library
- [ksef-docs](../ksef-docs/) - KSeF API documentation

## Troubleshooting

### CORS Errors

If you see CORS errors when connecting to KSeF API:
1. Configure a CORS proxy in Settings
2. Ensure the proxy URL ends with `/`
3. Test with the TEST environment first

### Authentication Failures

- Verify your NIP and KSeF token are correct
- Check that you're using the correct environment
- Ensure your token hasn't expired

### PDF Generation Issues

- Verify the XML file is valid KSeF format
- Check browser console for detailed error messages
- Ensure the ksef-pdf-generator library is properly loaded

## Contributing

This is a personal project, but suggestions and improvements are welcome.
