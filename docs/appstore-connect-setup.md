# App Store Connect Integration Setup Guide

This guide explains how to connect your Apple Developer account to Polsia for automated TestFlight management, app submissions, review monitoring, and analytics reporting.

## Overview

The App Store Connect integration uses **JWT (JSON Web Token) authentication** with your Apple Developer API credentials. This is different from OAuth - you'll provide an API Key ID, Issuer ID, and Private Key directly through the Polsia UI.

## Prerequisites

- Active Apple Developer account ($99/year)
- Account Holder or Admin access to App Store Connect
- Access to App Store Connect Integrations page

## Step 1: Create API Key in App Store Connect

### 1.1 Navigate to Integrations

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Sign in with your Apple Developer credentials
3. Navigate to **Users and Access** → **Integrations** (or [direct link](https://appstoreconnect.apple.com/access/integrations))

### 1.2 Generate Team API Key

1. Click on the **Team Keys** tab
2. Click **Generate API Key** (or the **+** button to add more)
3. Enter a descriptive **Key Name** (e.g., "Polsia Automation")
4. Select an **Access Role**:
   - **Admin**: Full access (recommended for complete automation)
   - **App Manager**: Manage apps, TestFlight, submissions (most common)
   - **Developer**: Development tasks, certificates, TestFlight
   - **Marketing**: Analytics and promotional content (read-only)
   - **Customer Support**: Customer reviews (read-only)

5. Click **Generate**

> ⚠️ **Important**: Choose the minimum access level required for your use case. Admin provides full access but may not be necessary.

### 1.3 Download Credentials

After generating the key, you'll see three pieces of information:

1. **Key ID**: 10-character alphanumeric string (e.g., `2X9R4HXF34`)
   - Copy this immediately

2. **Issuer ID**: UUID format (e.g., `57246542-96fe-1a63-e053-0824d011072a`)
   - Shown at the top of the Integrations page
   - Copy this as well

3. **Private Key (.p8 file)**:
   - Click **Download API Key** to download the `.p8` file
   - ⚠️ **This can only be downloaded ONCE**
   - Store it securely - you'll need its contents for Polsia

> 🔐 **Security Note**: The private key provides full API access within the assigned role. Treat it like a password. Apple will never show it again after download.

## Step 2: Connect in Polsia

### 2.1 Open Polsia Connections Page

1. Log into Polsia
2. Navigate to **Connections** page
3. Find the **App Store Connect** card
4. Click **Connect App Store Connect**

### 2.2 Enter Credentials

A modal will appear asking for three pieces of information:

**Key ID** (10 characters):
- Paste the Key ID you copied from App Store Connect
- Format: `2X9R4HXF34`

**Issuer ID** (UUID format):
- Paste the Issuer ID from the top of the Integrations page
- Format: `57246542-96fe-1a63-e053-0824d011072a`

**Private Key** (.p8 file contents):
- Open the downloaded `.p8` file in a text editor
- Copy the **entire contents** including:
  ```
  -----BEGIN PRIVATE KEY-----
  MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwd...
  -----END PRIVATE KEY-----
  ```
- Paste the complete key into the textarea

### 2.3 Validate & Connect

1. Click **Connect**
2. Polsia will validate your credentials by:
   - Generating a JWT token
   - Fetching your apps from App Store Connect
   - Verifying the connection works

3. If successful, you'll see:
   - "App Store Connect credentials connected successfully!"
   - Number of apps found in your account

4. Your credentials are now:
   - Encrypted with AES-256-GCM
   - Stored securely in the database
   - Never shown again (private key is encrypted)

## Step 3: Use Available Modules

Once connected, you can use these pre-built modules:

### 🧪 TestFlight Beta Manager
**Purpose**: Manage beta testers and build distribution

**Usage**: Provides comprehensive TestFlight status reports including:
- Available builds
- Current beta testers
- Beta testing groups
- Recommendations for testing coverage

**Frequency**: Manual (run on-demand)

### ⭐ App Store Review Monitor
**Purpose**: Monitor customer reviews and suggest responses

**Usage**: Analyzes recent App Store reviews and:
- Categorizes by sentiment (Positive, Negative, Neutral)
- Identifies bug reports and feature requests
- Drafts professional responses to negative reviews
- Provides actionable insights

**Frequency**: Daily (automatically runs once per day)

### 📝 App Metadata Updater
**Purpose**: Update app descriptions, keywords, and metadata

**Usage**:
- View current app metadata
- Update descriptions, keywords, promotional text
- Shows before/after comparisons
- Provides ASO (App Store Optimization) recommendations

**Frequency**: Manual (run when you need to update metadata)

### 📊 App Analytics Reporter
**Purpose**: Generate comprehensive performance reports

**Usage**: Analyzes:
- Downloads and active devices
- User engagement metrics (sessions, retention)
- App Store ratings and reviews
- Technical health (crash rates, performance)
- Trends and actionable recommendations

**Frequency**: Weekly (automatically runs once per week)

## Available Tools (for Custom Modules)

When creating custom modules with `mcpMounts: ['appstore_connect']`, you have access to 17 tools:

### App Management
- `list_apps` - List all your apps
- `get_app_details` - Get detailed app information
- `list_app_versions` - List versions for an app
- `update_app_metadata` - Update descriptions, keywords, etc.
- `submit_for_review` - Submit a version for App Review

### TestFlight
- `list_builds` - List available builds
- `get_build_details` - Get build information
- `list_beta_testers` - List beta testers
- `add_beta_tester` - Add a new beta tester
- `remove_beta_tester` - Remove a beta tester
- `list_beta_groups` - List beta testing groups

### Analytics & Reviews
- `get_app_analytics` - Fetch performance metrics
- `list_customer_reviews` - Get customer reviews
- `respond_to_review` - Reply to a customer review

### Pricing & Releases
- `get_app_pricing` - Get pricing information
- `configure_phased_release` - Set up gradual rollout

## Security Best Practices

### Key Storage
- ✅ Polsia encrypts your private key using AES-256-GCM
- ✅ Key ID and Issuer ID stored encrypted in database
- ✅ Tokens are generated on-demand (20-minute expiration)
- ✅ Never logged or exposed in API responses

### Access Control
- Use the **minimum access role** needed for your automation
- Consider using **App Manager** instead of **Admin** if you don't need full access
- Regularly audit which keys are active in App Store Connect

### Key Rotation
To rotate your API key:
1. Generate a new API key in App Store Connect
2. Disconnect old key in Polsia (Connections page)
3. Connect with new credentials
4. Revoke old key in App Store Connect (Users and Access → Integrations)

### Rate Limits
Apple enforces these limits:
- **3,600 requests per hour** per API key
- ~300-350 requests per minute
- Polsia handles rate limiting automatically

## Troubleshooting

### "Invalid credentials" error
- Verify Key ID is exactly 10 characters
- Verify Issuer ID is in UUID format
- Ensure private key includes `-----BEGIN PRIVATE KEY-----` header and `-----END PRIVATE KEY-----` footer
- Check for extra spaces or newlines when copying

### "Authentication failed" error
- Key may have been revoked in App Store Connect
- Check key status: Users and Access → Integrations → Team Keys
- Verify key has correct access role for requested operations

### "Rate limit exceeded" error
- Apple's API has strict rate limits
- Wait 60 seconds and try again
- Consider reducing module frequency

### Private key file lost
- You cannot re-download the same `.p8` file
- You must **generate a new API key** in App Store Connect
- Revoke the old key if you no longer have access to it

### Modules report "No connection found"
- Verify App Store Connect shows as "connected" on Connections page
- Try disconnecting and reconnecting
- Check server logs for MCP configuration errors

## API Documentation

For advanced usage and custom module development:

- **Official API Docs**: https://developer.apple.com/documentation/appstoreconnectapi
- **API Reference**: https://developer.apple.com/app-store-connect/api/
- **Creating API Keys**: https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api
- **Generating Tokens**: https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests

## Supported Operations

The integration supports:

### ✅ Fully Supported
- TestFlight management
- App metadata updates
- Customer reviews (read and respond)
- App analytics
- App submissions
- Pricing management
- Phased releases

### ⚠️ Limited Support
- In-App Purchases (basic operations)
- Provisioning (certificates, devices)
- Game Center

### ❌ Not Supported
- Screenshot/preview uploads (requires separate APIs)
- Binary uploads (requires Xcode/App Store Connect UI)
- Some advanced features (refer to API docs)

## FAQ

**Q: How often do tokens expire?**
A: Tokens are generated on-demand and expire after 20 minutes. Polsia handles regeneration automatically.

**Q: Can multiple users share the same API key?**
A: No. Each Polsia user should connect their own App Store Connect account with their own credentials.

**Q: Does this work with multiple apps?**
A: Yes! Once connected, you have access to all apps in your Apple Developer account.

**Q: Can I use this for app submissions?**
A: Yes, but binary uploads still require Xcode. This integration handles metadata, TestFlight, and submission workflows.

**Q: What if I need different access levels?**
A: You can generate multiple API keys with different roles in App Store Connect, but Polsia currently supports one connection per user.

**Q: Is this safe?**
A: Yes. Private keys are encrypted before storage, tokens are short-lived, and all communication uses HTTPS. Follow security best practices and use minimum required access roles.

## Support

If you encounter issues:

1. Check this guide's Troubleshooting section
2. Verify credentials in App Store Connect
3. Check Polsia server logs for detailed error messages
4. Review Apple's API Status page: https://developer.apple.com/system-status/

For assistance, contact your Polsia administrator or refer to the main documentation.

---

**Last Updated**: January 2025
**Compatible with**: App Store Connect API v3.4+
