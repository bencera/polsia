# Meta Ads OAuth Setup Guide

This guide will walk you through setting up Meta (Facebook) Ads OAuth integration for Polsia.

## Prerequisites

- A Facebook account
- A Facebook Business account (if managing business ad accounts)
- Access to Meta for Developers dashboard

## Step 1: Create a Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Click **"My Apps"** in the top right corner
3. Click **"Create App"**
4. Select **"Business"** as the app type
5. Fill in the app details:
   - **App Name**: `Polsia - Meta Ads Integration` (or your preferred name)
   - **App Contact Email**: Your email address
   - **Business Account**: Select your business account (if applicable)
6. Click **"Create App"**

## Step 2: Configure OAuth Settings

1. From your app dashboard, go to **Settings** → **Basic**
2. Note down your **App ID** and **App Secret** (you'll need these for `.env`)
3. Scroll down to **App Domains** and add:
   - For development: `localhost`
   - For production: `polsia.ai` (or your domain)

## Step 3: Add Facebook Login Product

1. In the left sidebar, click **"Add Product"**
2. Find **"Facebook Login"** and click **"Set Up"**
3. Choose **"Web"** as your platform
4. In the Facebook Login settings:
   - Go to **Settings** under Facebook Login
   - Add your **Valid OAuth Redirect URIs**:
     - Development: `http://localhost:3000/api/auth/meta-ads/callback`
     - Production: `https://polsia.ai/api/auth/meta-ads/callback` (or your domain)
   - Enable **"Login with the JavaScript SDK"** and **"Web OAuth Login"**

## Step 4: Request Marketing API Permissions

1. Go to **App Review** → **Permissions and Features**
2. Request the following permissions (required for Polsia):

   **Standard Access Permissions:**
   - `ads_read` - Read ads data
   - `ads_management` - Manage ads, ad sets, and campaigns
   - `business_management` - Access business settings and ad accounts
   - `pages_show_list` - Show list of Pages you manage
   - `pages_read_engagement` - Read engagement data from Pages

3. Click **"Request Advanced Access"** for each permission
4. Fill out the required information:
   - **Why do you need this permission?**: Explain that Polsia is an AI-powered automation platform that helps users manage their Meta Ads campaigns
   - **How will you use this permission?**: Describe that users will connect their ad accounts to allow AI agents to read performance data and manage campaigns on their behalf

> **Note**: Standard Access is sufficient for testing during development. Advanced Access is required for production use with all users.

## Step 5: Add Test Users (Development Only)

For development and testing before App Review:

1. Go to **Roles** → **Test Users**
2. Click **"Add Test Users"**
3. Create test users with ad account access
4. Use these test accounts to test the OAuth flow

## Step 6: Configure Environment Variables

Add the following to your `.env` file:

```bash
# Meta (Facebook) Ads OAuth Configuration
META_APP_ID=your-app-id-here
META_APP_SECRET=your-app-secret-here
META_CALLBACK_URL=http://localhost:3000/api/auth/meta-ads/callback
```

For production, update `META_CALLBACK_URL` to use your production domain:
```bash
META_CALLBACK_URL=https://polsia.ai/api/auth/meta-ads/callback
```

## Step 7: Set Up Business Manager (Optional but Recommended)

For managing client ad accounts:

1. Go to [Meta Business Suite](https://business.facebook.com/)
2. Create a Business Manager if you don't have one
3. Add your ad accounts:
   - Go to **Business Settings** → **Accounts** → **Ad Accounts**
   - Click **"Add"** → **"Add an Ad Account"**
4. Your app will be able to access ad accounts you have permission to manage

## Testing the Integration

1. Start your Polsia server: `npm start`
2. Navigate to the Connections page in Polsia
3. Click **"Connect Meta Ads"**
4. You'll be redirected to Facebook to authorize the app
5. Grant all requested permissions
6. You'll be redirected back to Polsia with a success message

## Troubleshooting

### "App Not Set Up" Error
- Make sure Facebook Login product is added to your app
- Verify OAuth redirect URIs are correctly configured
- Check that your app is not in Development Mode restrictions

### "Missing Permissions" Error
- Verify all required permissions are requested in App Review
- For development, ensure you're using a test user or developer account
- Check that the user has access to the ad accounts they're trying to connect

### Token Expires Too Quickly
- Polsia automatically exchanges short-lived tokens (1 hour) for long-lived tokens (60 days)
- If tokens still expire, check that `offline_access` equivalent (refresh capability) is working
- Tokens will automatically refresh before expiry

## API Version

Polsia uses Meta Marketing API **v21.0** (current stable version as of implementation).

To update to a newer version in the future:
1. Check [Meta Marketing API Changelog](https://developers.facebook.com/docs/marketing-api/changelog)
2. Update the API version in `/routes/meta-ads-oauth.js`
3. Test all OAuth and API calls

## Security Notes

- **Never commit** your `META_APP_SECRET` to version control
- Store all tokens encrypted in the database (Polsia handles this automatically)
- Tokens are encrypted using AES-256-GCM encryption
- CSRF protection is implemented using cryptographic state tokens
- All OAuth state tokens expire after 10 minutes

## Resources

- [Meta for Developers Portal](https://developers.facebook.com/)
- [Meta Marketing API Documentation](https://developers.facebook.com/docs/marketing-api)
- [OAuth 2.0 for Facebook Login](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow)
- [Marketing API Permissions](https://developers.facebook.com/docs/marketing-api/overview/authorization)

## Support

If you encounter issues:
1. Check the server logs for detailed error messages
2. Verify your `.env` configuration
3. Ensure your Meta App is properly configured
4. Check that the user has appropriate permissions to the ad accounts
