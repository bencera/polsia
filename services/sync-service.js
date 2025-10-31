const {
  findProfileByLateId,
  createProfile,
  updateProfile,
  getProfilesByUserId,
  findSocialAccountByLateId,
  createSocialAccount,
  updateSocialAccount,
  getSocialAccountsByUserId
} = require('../db');
const lateApiService = require('./late-api-service');

class SyncService {
  async syncWithLate(userId) {
    try {
      console.log('Starting Late.dev sync for user:', userId);

      // Fetch all profiles from Late.dev
      const profiles = await lateApiService.getProfiles();

      // Ensure profiles is an array
      const profileArray = Array.isArray(profiles) ? profiles : [];
      console.log(`Found ${profileArray.length} profiles on Late.dev`);

      const syncResults = {
        profiles: [],
        accounts: [],
        errors: []
      };

      // If no profiles, try to get accounts directly (Late.dev might not use profiles)
      if (profileArray.length === 0) {
        console.log('No profiles found, trying to fetch accounts directly...');
        const accounts = await lateApiService.getAccounts();

        if (accounts && accounts.length > 0) {
          // Create a default profile for accounts without profiles
          const defaultProfile = await this.getOrCreateDefaultProfile(userId);

          for (const lateAccount of accounts) {
            try {
              const socialAccount = await this.syncAccount(lateAccount, defaultProfile.id);
              syncResults.accounts.push({
                lateAccountId: lateAccount._id || lateAccount.id,
                platform: lateAccount.platform,
                username: lateAccount.username || lateAccount.displayName || lateAccount.name,
                accountId: socialAccount.id
              });
            } catch (error) {
              console.error(`Error syncing account ${lateAccount.username}:`, error);
              syncResults.errors.push({
                type: 'account',
                account: lateAccount.username || lateAccount.name,
                error: error.message
              });
            }
          }
        }
        return syncResults;
      }

      for (const profile of profileArray) {
        try {
          // Create or update profile for each Late.dev profile
          const localProfile = await this.syncProfile(userId, profile);
          syncResults.profiles.push({
            profileId: profile._id || profile.id,
            profileName: profile.name,
            localProfileId: localProfile.id,
            localProfileName: localProfile.name
          });

          // Fetch and sync accounts for this profile
          const profileId = profile._id || profile.id;
          const accounts = await lateApiService.getAccounts(profileId);
          console.log(`Found ${accounts.length} accounts for profile ${profile.name}`);

          for (const lateAccount of accounts) {
            try {
              const socialAccount = await this.syncAccount(lateAccount, localProfile.id);
              syncResults.accounts.push({
                lateAccountId: lateAccount._id || lateAccount.id,
                platform: lateAccount.platform,
                username: lateAccount.username || lateAccount.displayName,
                accountId: socialAccount.id
              });
            } catch (error) {
              console.error(`Error syncing account ${lateAccount.username}:`, error);
              syncResults.errors.push({
                type: 'account',
                account: lateAccount.username,
                error: error.message
              });
            }
          }
        } catch (error) {
          console.error(`Error syncing profile ${profile.name}:`, error);
          syncResults.errors.push({
            type: 'profile',
            profile: profile.name,
            error: error.message
          });
        }
      }

      console.log('Sync completed:', syncResults);
      return syncResults;
    } catch (error) {
      console.error('Sync failed:', error);
      throw error;
    }
  }

  async syncProfile(userId, lateProfile) {
    const profileId = lateProfile._id || lateProfile.id;

    console.log(`[syncProfile] Looking for profile with userId=${userId}, lateProfileId=${profileId}`);

    // Check if profile already exists with this Late profile ID
    let profile = await findProfileByLateId(userId, profileId);

    console.log(`[syncProfile] Found existing profile:`, profile ? `ID ${profile.id}: ${profile.name}` : 'none');

    if (profile) {
      // Update existing profile
      profile = await updateProfile(profile.id, userId, {
        name: lateProfile.name || profile.name,
        late_profile_id: profileId
      });
      console.log(`Updated profile: ${profile.name}`);
    } else {
      // Create new profile with fallback name
      const profileName = lateProfile.name || `Profile ${profileId.slice(-8)}`;
      profile = await createProfile(userId, {
        name: profileName,
        description: `Synced from Late.dev profile`,
        late_profile_id: profileId
      });
      console.log(`Created new profile: ${profile.name}`);
    }

    return profile;
  }

  async syncAccount(lateAccount, profileId) {
    const platform = this.mapLatePlatformToDB(lateAccount.platform);
    const accountId = lateAccount._id || lateAccount.id;
    const username = lateAccount.username || lateAccount.displayName || lateAccount.name;

    // Check if account already exists with this Late account ID
    let socialAccount = await findSocialAccountByLateId(accountId);

    if (socialAccount) {
      // Update existing account
      socialAccount = await updateSocialAccount(socialAccount.id, {
        account_handle: username,
        platform,
        late_account_id: accountId,
        is_active: true
      });
      console.log(`Updated account: ${socialAccount.account_handle} (${platform})`);
    } else {
      // Create new account
      socialAccount = await createSocialAccount(profileId, {
        platform,
        account_handle: username,
        late_account_id: accountId,
        is_active: true
      });
      console.log(`Created new account: ${socialAccount.account_handle} (${platform})`);
    }

    return socialAccount;
  }

  async syncSpecificProfile(userId, lateProfileId) {
    try {
      console.log(`Starting Late.dev sync for user ${userId}, profile ${lateProfileId}`);

      // Fetch only the specific profile
      const lateProfile = await lateApiService.getProfile(lateProfileId);

      if (!lateProfile) {
        throw new Error(`Profile ${lateProfileId} not found on Late.dev`);
      }

      console.log('Late.dev profile response:', JSON.stringify(lateProfile, null, 2));

      // Ensure profile has required fields with fallbacks
      const profileData = {
        ...lateProfile,
        _id: lateProfile._id || lateProfile.id || lateProfileId,
        name: lateProfile.name || lateProfile.title || `Profile ${lateProfileId.slice(-8)}`
      };

      const syncResults = {
        profile: null,
        accounts: [],
        errors: []
      };

      // Sync the profile
      try {
        const localProfile = await this.syncProfile(userId, profileData);
        syncResults.profile = {
          profileId: profileData._id,
          profileName: profileData.name,
          localProfileId: localProfile.id,
          localProfileName: localProfile.name
        };

        // Fetch and sync accounts for this specific profile
        const accounts = await lateApiService.getAccounts(lateProfileId);
        console.log(`Found ${accounts.length} accounts for profile ${profileData.name}`);

        for (const lateAccount of accounts) {
          try {
            const socialAccount = await this.syncAccount(lateAccount, localProfile.id);
            syncResults.accounts.push({
              lateAccountId: lateAccount._id || lateAccount.id,
              platform: lateAccount.platform,
              username: lateAccount.username || lateAccount.displayName,
              accountId: socialAccount.id
            });
          } catch (error) {
            console.error(`Error syncing account ${lateAccount.username}:`, error);
            syncResults.errors.push({
              type: 'account',
              account: lateAccount.username,
              error: error.message
            });
          }
        }
      } catch (error) {
        console.error(`Error syncing profile ${profileData.name}:`, error);
        syncResults.errors.push({
          type: 'profile',
          profile: profileData.name,
          error: error.message
        });
      }

      console.log('Specific profile sync completed:', syncResults);
      return syncResults;
    } catch (error) {
      console.error('Specific profile sync failed:', error);
      throw error;
    }
  }

  mapLatePlatformToDB(latePlatform) {
    const platformMap = {
      'twitter': 'TWITTER',
      'x': 'TWITTER',
      'instagram': 'INSTAGRAM',
      'tiktok': 'TIKTOK',
      'linkedin': 'LINKEDIN',
      'facebook': 'FACEBOOK',
      'youtube': 'YOUTUBE',
      'threads': 'THREADS',
      'reddit': 'REDDIT'
    };

    return platformMap[latePlatform.toLowerCase()] || 'TWITTER';
  }

  async getSyncStatus(userId) {
    const profiles = await getProfilesByUserId(userId);
    const accounts = await getSocialAccountsByUserId(userId);

    const syncedProfiles = profiles.filter(p => p.late_profile_id !== null);
    const syncedAccounts = accounts.filter(a => a.late_account_id !== null);

    const unlinkedProfiles = profiles.filter(p => p.late_profile_id === null);
    const unlinkedAccounts = accounts.filter(a => a.late_account_id === null);

    return {
      synced: {
        profiles: syncedProfiles.length,
        accounts: syncedAccounts.length
      },
      unlinked: {
        profiles: unlinkedProfiles.length,
        accounts: unlinkedAccounts.length
      },
      details: {
        syncedProfiles,
        syncedAccounts,
        unlinkedProfiles,
        unlinkedAccounts
      }
    };
  }

  async unlinkProfile(profileId, userId) {
    const profile = await updateProfile(profileId, userId, {
      late_profile_id: null
    });

    // Also unlink all accounts in this profile
    const accounts = await getSocialAccountsByProfileId(profileId, userId);
    for (const account of accounts) {
      await updateSocialAccount(account.id, {
        late_account_id: null
      });
    }

    return profile;
  }

  async getOrCreateDefaultProfile(userId) {
    const profiles = await getProfilesByUserId(userId);
    let defaultProfile = profiles.find(p => p.name === 'Late.dev Synced Accounts');

    if (!defaultProfile) {
      defaultProfile = await createProfile(userId, {
        name: 'Late.dev Synced Accounts',
        description: 'Automatically created for Late.dev accounts'
      });
    }

    return defaultProfile;
  }
}

module.exports = new SyncService();
