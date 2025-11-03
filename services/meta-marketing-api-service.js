/**
 * Meta Marketing API Service
 * Client for interacting with Meta (Facebook) Marketing API
 * Provides read-only access to ad account data, campaigns, ad sets, ads, and insights
 */

const axios = require('axios');

const META_API_VERSION = 'v21.0';
const META_API_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

class MetaMarketingAPIClient {
  constructor(accessToken, adAccountId) {
    if (!accessToken) {
      throw new Error('Access token is required');
    }
    if (!adAccountId) {
      throw new Error('Ad account ID is required');
    }

    this.accessToken = accessToken;
    // Ensure ad account ID has 'act_' prefix
    this.adAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    this.apiUrl = META_API_BASE_URL;
  }

  /**
   * Make authenticated request to Meta API
   */
  async makeRequest(endpoint, params = {}) {
    try {
      const response = await axios.get(`${this.apiUrl}${endpoint}`, {
        params: {
          access_token: this.accessToken,
          ...params
        }
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      const errorCode = error.response?.data?.error?.code;
      throw new Error(`Meta API Error${errorCode ? ` (${errorCode})` : ''}: ${errorMessage}`);
    }
  }

  /**
   * Get ad account details
   */
  async getAdAccount() {
    return this.makeRequest(`/${this.adAccountId}`, {
      fields: 'id,name,account_id,account_status,currency,timezone_name,business,owner,amount_spent,balance,spend_cap,age,created_time,disable_reason'
    });
  }

  /**
   * Get ad account insights (performance metrics)
   * @param {Object} options - Options for the insights query
   * @param {string} options.datePreset - Date range preset ('today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month')
   * @param {string} options.timeRange - Custom time range as JSON string: {"since":"2024-01-01","until":"2024-01-31"}
   * @param {string[]} options.fields - Metrics to fetch (default: comprehensive set)
   * @param {string} options.level - Aggregation level ('account', 'campaign', 'adset', 'ad')
   * @param {number} options.limit - Max results (default: 100)
   */
  async getAdAccountInsights(options = {}) {
    const {
      datePreset = 'last_7d',
      timeRange,
      fields = [
        'impressions',
        'reach',
        'frequency',
        'clicks',
        'spend',
        'cpc',
        'cpm',
        'cpp',
        'ctr',
        'actions',
        'conversions',
        'cost_per_action_type',
        'cost_per_conversion',
        'conversion_values',
        'purchase_roas'
      ],
      level = 'account',
      limit = 100
    } = options;

    const params = {
      fields: fields.join(','),
      level,
      limit
    };

    if (timeRange) {
      params.time_range = timeRange;
    } else {
      params.date_preset = datePreset;
    }

    return this.makeRequest(`/${this.adAccountId}/insights`, params);
  }

  /**
   * List all campaigns in the ad account
   */
  async listCampaigns(options = {}) {
    const {
      fields = [
        'id',
        'name',
        'objective',
        'status',
        'effective_status',
        'configured_status',
        'daily_budget',
        'lifetime_budget',
        'budget_remaining',
        'buying_type',
        'created_time',
        'start_time',
        'stop_time',
        'updated_time'
      ],
      limit = 100,
      filtering
    } = options;

    const params = {
      fields: fields.join(','),
      limit
    };

    if (filtering) {
      params.filtering = JSON.stringify(filtering);
    }

    return this.makeRequest(`/${this.adAccountId}/campaigns`, params);
  }

  /**
   * Get campaign details
   */
  async getCampaign(campaignId, fields) {
    const defaultFields = [
      'id',
      'name',
      'objective',
      'status',
      'effective_status',
      'configured_status',
      'daily_budget',
      'lifetime_budget',
      'budget_remaining',
      'buying_type',
      'created_time',
      'start_time',
      'stop_time',
      'updated_time',
      'spend_cap',
      'bid_strategy'
    ];

    return this.makeRequest(`/${campaignId}`, {
      fields: (fields || defaultFields).join(',')
    });
  }

  /**
   * Get campaign insights
   */
  async getCampaignInsights(campaignId, options = {}) {
    const {
      datePreset = 'last_7d',
      timeRange,
      fields = [
        'impressions',
        'reach',
        'frequency',
        'clicks',
        'spend',
        'cpc',
        'cpm',
        'ctr',
        'actions',
        'conversions',
        'cost_per_action_type',
        'cost_per_conversion',
        'conversion_values',
        'purchase_roas'
      ]
    } = options;

    const params = {
      fields: fields.join(',')
    };

    if (timeRange) {
      params.time_range = timeRange;
    } else {
      params.date_preset = datePreset;
    }

    return this.makeRequest(`/${campaignId}/insights`, params);
  }

  /**
   * List ad sets in the ad account
   */
  async listAdSets(options = {}) {
    const {
      campaignId,
      fields = [
        'id',
        'name',
        'status',
        'effective_status',
        'configured_status',
        'campaign_id',
        'daily_budget',
        'lifetime_budget',
        'budget_remaining',
        'optimization_goal',
        'billing_event',
        'bid_amount',
        'created_time',
        'start_time',
        'end_time',
        'updated_time'
      ],
      limit = 100,
      filtering
    } = options;

    const params = {
      fields: fields.join(','),
      limit
    };

    if (filtering) {
      params.filtering = JSON.stringify(filtering);
    }

    const endpoint = campaignId
      ? `/${campaignId}/adsets`
      : `/${this.adAccountId}/adsets`;

    return this.makeRequest(endpoint, params);
  }

  /**
   * Get ad set details including targeting
   */
  async getAdSet(adSetId, includeTargeting = true) {
    const fields = [
      'id',
      'name',
      'status',
      'effective_status',
      'configured_status',
      'campaign_id',
      'daily_budget',
      'lifetime_budget',
      'budget_remaining',
      'optimization_goal',
      'billing_event',
      'bid_amount',
      'created_time',
      'start_time',
      'end_time',
      'updated_time'
    ];

    if (includeTargeting) {
      fields.push('targeting');
    }

    return this.makeRequest(`/${adSetId}`, {
      fields: fields.join(',')
    });
  }

  /**
   * Get ad set insights
   */
  async getAdSetInsights(adSetId, options = {}) {
    const {
      datePreset = 'last_7d',
      timeRange,
      fields = [
        'impressions',
        'reach',
        'frequency',
        'clicks',
        'spend',
        'cpc',
        'cpm',
        'ctr',
        'actions',
        'conversions',
        'cost_per_action_type',
        'cost_per_conversion',
        'conversion_values'
      ]
    } = options;

    const params = {
      fields: fields.join(',')
    };

    if (timeRange) {
      params.time_range = timeRange;
    } else {
      params.date_preset = datePreset;
    }

    return this.makeRequest(`/${adSetId}/insights`, params);
  }

  /**
   * List ads in the ad account
   */
  async listAds(options = {}) {
    const {
      adSetId,
      campaignId,
      fields = [
        'id',
        'name',
        'status',
        'effective_status',
        'configured_status',
        'adset_id',
        'campaign_id',
        'created_time',
        'updated_time'
      ],
      limit = 100,
      filtering
    } = options;

    const params = {
      fields: fields.join(','),
      limit
    };

    if (filtering) {
      params.filtering = JSON.stringify(filtering);
    }

    let endpoint;
    if (adSetId) {
      endpoint = `/${adSetId}/ads`;
    } else if (campaignId) {
      endpoint = `/${campaignId}/ads`;
    } else {
      endpoint = `/${this.adAccountId}/ads`;
    }

    return this.makeRequest(endpoint, params);
  }

  /**
   * Get ad details including creative
   */
  async getAd(adId, includeCreative = true) {
    const fields = [
      'id',
      'name',
      'status',
      'effective_status',
      'configured_status',
      'adset_id',
      'campaign_id',
      'created_time',
      'updated_time'
    ];

    if (includeCreative) {
      fields.push('creative');
    }

    return this.makeRequest(`/${adId}`, {
      fields: fields.join(',')
    });
  }

  /**
   * Get ad creative details
   */
  async getAdCreative(creativeId) {
    return this.makeRequest(`/${creativeId}`, {
      fields: 'id,name,title,body,image_url,video_id,thumbnail_url,link_url,call_to_action_type,object_story_spec'
    });
  }

  /**
   * Get ad insights
   */
  async getAdInsights(adId, options = {}) {
    const {
      datePreset = 'last_7d',
      timeRange,
      fields = [
        'impressions',
        'reach',
        'frequency',
        'clicks',
        'spend',
        'cpc',
        'cpm',
        'ctr',
        'actions',
        'conversions',
        'cost_per_action_type',
        'cost_per_conversion'
      ]
    } = options;

    const params = {
      fields: fields.join(',')
    };

    if (timeRange) {
      params.time_range = timeRange;
    } else {
      params.date_preset = datePreset;
    }

    return this.makeRequest(`/${adId}/insights`, params);
  }

  /**
   * List custom audiences
   */
  async listCustomAudiences(options = {}) {
    const {
      fields = [
        'id',
        'name',
        'description',
        'subtype',
        'approximate_count',
        'data_source',
        'delivery_status',
        'operation_status',
        'time_created',
        'time_updated'
      ],
      limit = 100
    } = options;

    return this.makeRequest(`/${this.adAccountId}/customaudiences`, {
      fields: fields.join(','),
      limit
    });
  }

  /**
   * List saved audiences (targeting templates)
   */
  async listSavedAudiences(options = {}) {
    const {
      fields = [
        'id',
        'name',
        'targeting',
        'approximate_count',
        'time_created',
        'time_updated'
      ],
      limit = 100
    } = options;

    return this.makeRequest(`/${this.adAccountId}/saved_audiences`, {
      fields: fields.join(','),
      limit
    });
  }

  /**
   * Get delivery estimate for targeting
   */
  async getDeliveryEstimate(targeting, optimizationGoal = 'REACH') {
    return this.makeRequest(`/${this.adAccountId}/delivery_estimate`, {
      targeting_spec: JSON.stringify(targeting),
      optimization_goal: optimizationGoal
    });
  }

  /**
   * Get breakdowns for insights (age, gender, country, placement, etc.)
   */
  async getInsightsWithBreakdowns(options = {}) {
    const {
      level = 'account',
      breakdowns = ['age', 'gender'],
      datePreset = 'last_7d',
      timeRange,
      fields = [
        'impressions',
        'reach',
        'clicks',
        'spend',
        'cpc',
        'cpm',
        'ctr'
      ],
      limit = 100
    } = options;

    const params = {
      level,
      breakdowns: breakdowns.join(','),
      fields: fields.join(','),
      limit
    };

    if (timeRange) {
      params.time_range = timeRange;
    } else {
      params.date_preset = datePreset;
    }

    return this.makeRequest(`/${this.adAccountId}/insights`, params);
  }
}

module.exports = { MetaMarketingAPIClient };
