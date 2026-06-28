import { GraphQLQuery } from './request.js';
import type { TwitterGqlFeatureKey } from './features.js';

const rwebTweetFeatureKeys = [
  'rweb_video_screen_enabled',
  'profile_label_improvements_pcf_label_in_post_enabled',
  'responsive_web_profile_redirect_enabled',
  'rweb_tipjar_consumption_enabled',
  'verified_phone_label_enabled',
  'creator_subscriptions_tweet_preview_api_enabled',
  'responsive_web_graphql_timeline_navigation_enabled',
  'responsive_web_graphql_skip_user_profile_image_extensions_enabled',
  'premium_content_api_read_enabled',
  'communities_web_enable_tweet_community_results_fetch',
  'c9s_tweet_anatomy_moderator_badge_enabled',
  'responsive_web_grok_analyze_button_fetch_trends_enabled',
  'responsive_web_grok_analyze_post_followups_enabled',
  'responsive_web_jetfuel_frame',
  'responsive_web_grok_share_attachment_enabled',
  'responsive_web_grok_annotations_enabled',
  'articles_preview_enabled',
  'responsive_web_edit_tweet_api_enabled',
  'graphql_is_translatable_rweb_tweet_is_translatable_enabled',
  'view_counts_everywhere_api_enabled',
  'longform_notetweets_consumption_enabled',
  'responsive_web_twitter_article_tweet_consumption_enabled',
  'content_disclosure_indicator_enabled',
  'content_disclosure_ai_generated_indicator_enabled',
  'responsive_web_grok_show_grok_translated_post',
  'responsive_web_grok_analysis_button_from_backend',
  'post_ctas_fetch_enabled',
  'freedom_of_speech_not_reach_fetch_enabled',
  'standardized_nudges_misinfo',
  'tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled',
  'longform_notetweets_rich_text_read_enabled',
  'longform_notetweets_inline_media_enabled',
  'responsive_web_grok_image_annotation_enabled',
  'responsive_web_grok_imagine_annotation_enabled',
  'responsive_web_grok_community_note_auto_translation_is_enabled',
  'responsive_web_enhance_cards_enabled',
  'tweet_awards_web_tipping_enabled'
] as const satisfies readonly TwitterGqlFeatureKey[];

const rwebUserFeatureKeys = [
  'hidden_profile_subscriptions_enabled',
  'profile_label_improvements_pcf_label_in_post_enabled',
  'responsive_web_profile_redirect_enabled',
  'rweb_tipjar_consumption_enabled',
  'verified_phone_label_enabled',
  'subscriptions_verification_info_is_identity_verified_enabled',
  'subscriptions_verification_info_verified_since_enabled',
  'highlights_tweets_tab_ui_enabled',
  'responsive_web_twitter_article_notes_tab_enabled',
  'subscriptions_feature_can_gift_premium',
  'creator_subscriptions_tweet_preview_api_enabled',
  'responsive_web_graphql_skip_user_profile_image_extensions_enabled',
  'responsive_web_graphql_timeline_navigation_enabled'
] as const satisfies readonly TwitterGqlFeatureKey[];

const iOSUserResultFeatureKeys = [
  'rito_safety_mode_features_enabled',
  'hidden_profile_subscriptions_enabled',
  'profile_foundations_has_spaces_graphql_enabled',
  'profile_label_improvements_pcf_settings_enabled',
  'articles_timeline_profile_tab_enabled',
  'subscriptions_feature_can_gift_premium',
  'immersive_video_status_linkable_timestamps',
  'profile_label_improvements_pcf_edit_profile_enabled',
  'ios_notifications_replies_mentions_device_follow_enabled'
] as const satisfies readonly TwitterGqlFeatureKey[];

const iOSTimelineFeatureKeys = [
  'ios_button_layout_fix_use_grok_annotations',
  'profile_foundations_has_spaces_graphql_enabled',
  'birdwatch_consumption_enabled',
  'ios_home_timeline_external_status_injections_fetch_tweet_facepile_enabled',
  'conversational_replies_ios_downvote_api_enabled',
  'graphql_unified_card_enabled',
  'ios_notifications_replies_mentions_device_follow_enabled',
  'grok_ios_tweet_detail_followups_enabled',
  'ios_tweet_detail_always_load_is_translatable',
  'tweet_context_is_enabled',
  'unified_cards_destination_url_params_enabled',
  'grok_translations_community_note_translation_is_enabled',
  'rito_safety_mode_features_enabled',
  'profile_label_improvements_pcf_edit_profile_enabled',
  'profile_label_improvements_pcf_settings_enabled',
  'view_counts_everywhere_api_enabled',
  'x_jetfuel_enable_frames_on_posts',
  'unified_cards_ad_metadata_container_dynamic_card_content_query_enabled',
  'grok_translations_community_note_auto_translation_is_enabled',
  'continue_watching_consume_graphql',
  'tweetypie_unmention_optimization_enabled',
  'grok_translations_post_auto_translation_is_enabled',
  'grok_ios_author_view_analyze_button_fetch_trends_enabled',
  'tweet_with_visibility_results_prefer_gql_media_interstitial_enabled',
  'ssp_ads_preroll_enabled',
  'grok_edit_with_grok_button_under_post_include_grok_image_annotation_in_graphql',
  'immersive_video_status_linkable_timestamps',
  'articles_preview_enabled',
  'articles_api_enabled',
  'c9s_tweet_anatomy_moderator_badge_enabled'
] as const satisfies readonly TwitterGqlFeatureKey[];

const androidTweetFeatureKeys = [
  'grok_translations_community_note_translation_is_enabled',
  'longform_notetweets_inline_media_enabled',
  'grok_android_analyze_trend_fetch_enabled',
  'super_follow_badge_privacy_enabled',
  'longform_notetweets_rich_text_read_enabled',
  'super_follow_user_api_enabled',
  'super_follow_tweet_api_enabled',
  'articles_api_enabled',
  'profile_label_improvements_pcf_label_in_profile_enabled',
  'premium_content_api_read_enabled',
  'grok_translations_community_note_auto_translation_is_enabled',
  'android_graphql_skip_api_media_color_palette',
  'creator_subscriptions_tweet_preview_api_enabled',
  'freedom_of_speech_not_reach_fetch_enabled',
  'tweetypie_unmention_optimization_enabled',
  'longform_notetweets_consumption_enabled',
  'subscriptions_verification_info_enabled',
  'grok_translations_post_auto_translation_is_enabled',
  'blue_business_profile_image_shape_enabled',
  'tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled',
  'immersive_video_status_linkable_timestamps',
  'profile_label_improvements_pcf_label_in_post_enabled',
  'super_follow_exclusive_tweet_notifications_enabled'
] as const satisfies readonly TwitterGqlFeatureKey[];

const androidUserFeatureKeys = [
  'profile_label_improvements_pcf_label_in_profile_enabled',
  'verified_phone_label_enabled',
  'super_follow_badge_privacy_enabled',
  'subscriptions_verification_info_enabled',
  'super_follow_user_api_enabled',
  'blue_business_profile_image_shape_enabled',
  'profile_label_improvements_pcf_label_in_post_enabled',
  'immersive_video_status_linkable_timestamps',
  'super_follow_exclusive_tweet_notifications_enabled'
] as const satisfies readonly TwitterGqlFeatureKey[];

export const TweetResultByRestIdQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'f2sagi1jweVHFkTUIHzmMQ',
  queryName: 'TweetResultByRestId',
  requiresAccount: false,
  variables: {
    withCommunity: false,
    includePromotedContent: false,
    withVoice: false
  },
  featureKeys: rwebTweetFeatureKeys,
  fieldToggles: {
    withArticleRichContentState: true,
    withArticlePlainText: false,
    withGrokAnalyze: false,
    withDisallowedReplyControls: false
  }
};

export const TweetResultsByRestIdsQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'B3F9uRHu_kwtjyEnZNyVAg',
  queryName: 'TweetResultsByRestIds',
  requiresAccount: true,
  variables: {
    withCommunity: false,
    includePromotedContent: false,
    withVoice: false
  },
  featureKeys: rwebTweetFeatureKeys,
  fieldToggles: {
    withArticleRichContentState: true
  }
};

export const TweetDetailQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'R9IzzyzQBV87-DOWpcvDmw',
  queryName: 'TweetDetail',
  requiresAccount: true,
  variables: {
    // focalTweetId: 0,
    with_rux_injections: false,
    rankingMode: 'Relevance', // | 'Recency' | 'Likes'
    includePromotedContent: false,
    withCommunity: false,
    withQuickPromoteEligibilityTweetFields: false,
    withBirdwatchNotes: true,
    withVoice: false,
    cursor: null
  },
  featureKeys: rwebTweetFeatureKeys,
  fieldToggles: {
    withArticleRichContentState: true,
    withArticlePlainText: false,
    withGrokAnalyze: false,
    withDisallowedReplyControls: false
  }
};

/** Captured from Twitter iPhone ConversationTimeline; higher rate limit than TweetDetail */
export const ConversationTimelineQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'b-bCN9RelT8k0fCr_s2BFg',
  queryName: 'ConversationTimeline',
  requiresAccount: true,
  variables: {
    include_grok_translated_bio: false,
    display_location: 'Default',
    ranking_mode: 'Relevance',
    cta_display_location: 'TweetDetails',
    include_unmention_info_override: false,
    is_member_target_user_id: '0',
    cursor: null,
    include_conversation_context: false,
    include_reply_device_follow: false,
    include_is_member: false,
    // controller_data: 'DAACDAABDAABCgABAAAAAAAAAAAKAAkW0pcLr1YgAQoACgAAAZ0uryT6AAAAAA==',
    include_pill_groups_in_modules: false,
    include_dm_muting: false,
    include_community_tweet_relationship: true,
    referrer: 'me',
    include_grok_analysis_button: true,
    include_professional: false,
    include_is_translatable: true,
    include_tweet_quick_promote_eligibility: false,
    include_cta: true,
    skip_author_community_relationship: false
  },
  featureKeys: iOSTimelineFeatureKeys
};

export const TweetResultsByIdsQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'q8hBgBMTfE_-_bEaJoeHMQ',
  queryName: 'TweetResultsByIdsQuery',
  requiresAccount: true,
  variables: {
    includeTweetImpression: true,
    includeHasBirdwatchNotes: false,
    includeEditPerspective: false,
    rest_ids: [],
    includeEditControl: true,
    includeCommunityTweetRelationship: true,
    includeTweetVisibilityNudge: true
  },
  featureKeys: androidTweetFeatureKeys
};

export const TweetResultByIdQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'XcmCoTco-zSOvAZESj78OQ',
  queryName: 'TweetResultByIdQuery',
  requiresAccount: true,
  variables: {
    includeTweetImpression: true,
    includeHasBirdwatchNotes: true,
    includeEditPerspective: false,
    includeEditControl: true,
    includeCommunityTweetRelationship: true,
    includeTweetVisibilityNudge: true
  },
  featureKeys: androidTweetFeatureKeys
};

export const UserByScreenNameQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'IGgvgiOx4QZndDHuD3x9TQ',
  queryName: 'UserByScreenName',
  requiresAccount: true,
  variables: {
    // screen_name: ''
  },
  featureKeys: rwebUserFeatureKeys,
  fieldToggles: {
    withAuxiliaryUserLabels: true
  }
};

export const UserResultByScreenNameQueryQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: '2DgQpAxdL3NfBVOokJ_XcA',
  queryName: 'UserResultByScreenNameQuery',
  requiresAccount: true,
  variables: {
    include_smart_block: true,
    includeTweetImpression: true,
    include_profile_info: true,
    includeTranslatableProfile: true,
    includeHasBirdwatchNotes: false,
    include_tipjar: true,
    includeEditPerspective: false,
    // screen_name: '',
    include_reply_device_follow: true,
    includeEditControl: true,
    include_verified_phone_status: false
  },
  featureKeys: androidUserFeatureKeys
};

export const UserResultByScreenNameQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: '1mhXYcVoS_46OrXj1yy1jg',
  queryName: 'UserResultByScreenName',
  requiresAccount: true,
  variables: {
    creator_subscriptions_email_share_enabled: true,
    include_grok_translated_bio: false,
    include_can_pay: false,
    include_highlights_info: true,
    include_professional: true,
    include_is_profile_translatable: true,
    include_business_account: true,
    include_creator_subscriptions_count: true,
    include_reply_device_follow: true,
    include_tipjar: true,
    include_dm_muting: false,
    include_hidden_profile_likes: true
    // screen_name: 'x'
  },
  featureKeys: iOSUserResultFeatureKeys
};

export const AboutAccountQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'zs_jFPFT78rBpXv9Z3U2YQ',
  queryName: 'AboutAccountQuery',
  requiresAccount: true,
  variables: {
    screenName: ''
  }
};

export const UserByRestIdQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'VQfQ9wwYdk6j_u2O4vt64Q',
  queryName: 'UserByRestId',
  requiresAccount: true,
  variables: {
    withGrokTranslatedBio: true
  },
  featureKeys: rwebUserFeatureKeys,
  fieldToggles: {
    withPayments: false,
    withAuxiliaryUserLabels: true
  }
};

export const UserResultByRestIdQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'Xe7WXUEMI2F7kK-kZSZoWA',
  queryName: 'UserResultByRestId',
  requiresAccount: true,
  variables: {
    creator_subscriptions_email_share_enabled: false,
    include_grok_translated_bio: false,
    include_can_pay: false,
    include_highlights_info: false,
    include_professional: true,
    include_is_profile_translatable: false,
    include_business_account: false,
    include_creator_subscriptions_count: false,
    include_reply_device_follow: true,
    include_tipjar: true,
    include_dm_muting: false,
    include_hidden_profile_likes: false
  },
  featureKeys: iOSUserResultFeatureKeys
};

export const UserProfileAboutQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'xT7-nTEDL_VgiUQXZDtuAA',
  queryName: 'UserProfileAbout',
  requiresAccount: true,
  variables: {}
};

export const SearchTimelineQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'Bcw3RzK-PatNAmbnw54hFw',
  queryName: 'SearchTimeline',
  requiresAccount: true,
  variables: {
    // rawQuery: '',
    // count: 20, // max 100
    querySource: 'typed_query'
    // product: 'Latest', // | 'Top' | 'Media',
    // cursor: null
  },
  featureKeys: rwebTweetFeatureKeys
};

export const ExplorePageQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'gvPZTpBkahm30iCwpnszng',
  queryName: 'ExplorePage',
  requiresAccount: true,
  variables: {
    cursor: ''
  },
  featureKeys: rwebTweetFeatureKeys
};

export const GenericTimelineByIdQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'vQ9kgVqJANpRIFMV5jq2aw',
  queryName: 'GenericTimelineById',
  requiresAccount: true,
  variables: {
    // timelineId set per request
    count: 20,
    withQuickPromoteEligibilityTweetFields: false
  },
  featureKeys: rwebTweetFeatureKeys
};

export const UserTweetsQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'O0epvwaQPUx-bT9YlqlL6w',
  queryName: 'UserTweets',
  requiresAccount: true,
  variables: {
    // userId: '',
    // count: 20,
    includePromotedContent: false,
    withQuickPromoteEligibilityTweetFields: false,
    withVoice: true,
    cursor: null
  },
  featureKeys: rwebTweetFeatureKeys
};

export const UserMediaQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'SjiAp7wyuCUBkKAJJObU8w',
  queryName: 'UserMedia',
  requiresAccount: true,
  variables: {
    includePromotedContent: false,
    withClientEventToken: false,
    withBirdwatchNotes: false,
    withVoice: true,
    cursor: null
  },
  featureKeys: rwebTweetFeatureKeys
};

export const ProfileTimelineQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: '3mLSzzCq-uKpJ3nqMdJBhQ',
  queryName: 'ProfileTimeline',
  requiresAccount: true,
  variables: {
    include_is_translatable: false,
    include_community_tweet_relationship: false,
    include_grok_analysis_button: true,
    include_cta: false,
    include_grok_translated_bio: false,
    include_tweet_quick_promote_eligibility: false,
    include_professional: false,
    include_conversation_context: false,
    skip_author_community_relationship: false,
    include_pill_groups_in_modules: false,
    include_is_member: false,
    autoplay_enabled: true,
    include_reply_device_follow: false,
    include_unmention_info_override: false,
    include_dm_muting: false,
    is_member_target_user_id: '0',
    // rest_id, count, cursor merged per request (cursor in variables when paginating)
    cursor: null
  },
  featureKeys: iOSTimelineFeatureKeys
};

export const ProfileArticlesTimelineQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'drYvmzuyAPDHcUp4PsKWUA',
  queryName: 'ProfileArticlesTimeline',
  requiresAccount: true,
  variables: {
    include_community_tweet_relationship: false,
    include_is_translatable: false,
    include_grok_analysis_button: false,
    include_cta: false,
    include_grok_translated_bio: false,
    include_tweet_quick_promote_eligibility: false,
    include_professional: false,
    include_is_member: false,
    skip_author_community_relationship: false,
    include_conversation_context: false,
    include_pill_groups_in_modules: false,
    include_reply_device_follow: false,
    include_unmention_info_override: false,
    include_dm_muting: false,
    is_member_target_user_id: '0',
    cursor: null
  },
  featureKeys: iOSTimelineFeatureKeys
};

export const UserArticlesTweetsQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'mgo2LHt5kJBnE73Lb0NgUA',
  queryName: 'UserArticlesTweets',
  requiresAccount: true,
  variables: {
    includePromotedContent: false,
    withQuickPromoteEligibilityTweetFields: false,
    withVoice: true,
    cursor: null
  },
  featureKeys: rwebTweetFeatureKeys,
  fieldToggles: {
    withArticlePlainText: false
  }
};

export const ProfileWithRepliesTimelineQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'vG_Yd3BEZTwSVlhdImQJSQ',
  queryName: 'ProfileWithRepliesTimeline',
  requiresAccount: true,
  variables: {
    include_is_translatable: false,
    include_community_tweet_relationship: false,
    include_grok_analysis_button: true,
    include_cta: false,
    include_grok_translated_bio: false,
    include_tweet_quick_promote_eligibility: false,
    include_professional: false,
    include_conversation_context: false,
    skip_author_community_relationship: false,
    include_pill_groups_in_modules: false,
    include_is_member: false,
    autoplay_enabled: true,
    include_reply_device_follow: false,
    include_unmention_info_override: false,
    include_dm_muting: false,
    is_member_target_user_id: '0',
    cursor: null
  },
  featureKeys: iOSTimelineFeatureKeys
};

export const UserTweetsAndRepliesQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'EJTxTKSH-byy7X46AhtKeA',
  queryName: 'UserTweetsAndReplies',
  requiresAccount: true,
  variables: {
    includePromotedContent: false,
    withCommunity: true,
    withVoice: true,
    cursor: null
  },
  featureKeys: rwebTweetFeatureKeys
};

export const FollowersQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: '-FpGYzBsUxUOecYYfso0yA',
  queryName: 'Followers',
  requiresAccount: true,
  variables: {
    userId: '',
    count: 20,
    includePromotedContent: false,
    withGrokTranslatedBio: false,
    cursor: null
  },
  featureKeys: rwebTweetFeatureKeys
};

export const FollowingQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'UCFedrkjMz7PeEAWCWhqFw',
  queryName: 'Following',
  requiresAccount: true,
  variables: {
    userId: '',
    count: 20,
    includePromotedContent: false,
    withGrokTranslatedBio: false,
    cursor: null
  },
  featureKeys: rwebTweetFeatureKeys
};

export const FollowersByUserIDTimelineQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'slCf5d-j2AwbrPoG2f3jxw',
  queryName: 'FollowersByUserIDTimeline',
  requiresAccount: true,
  variables: {
    include_community_tweet_relationship: false,
    include_grok_analysis_button: false,
    include_is_translatable: false,
    include_cta: false,
    include_grok_translated_bio: false,
    include_tweet_quick_promote_eligibility: false,
    include_professional: false,
    include_conversation_context: false,
    include_pill_groups_in_modules: false,
    include_is_member: false,
    skip_author_community_relationship: false,
    include_reply_device_follow: false,
    include_unmention_info_override: false,
    include_dm_muting: false,
    is_member_target_user_id: '0',
    rest_id: '',
    count: 20,
    cursor: null
  },
  featureKeys: iOSTimelineFeatureKeys
};

export const FollowingByUserIDTimelineQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'jzeKl5ueE7833XVJsrjvvw',
  queryName: 'FollowingByUserIDTimeline',
  requiresAccount: true,
  variables: {
    include_community_tweet_relationship: false,
    include_grok_analysis_button: false,
    include_is_translatable: false,
    include_cta: false,
    include_grok_translated_bio: false,
    include_tweet_quick_promote_eligibility: false,
    include_professional: false,
    include_conversation_context: false,
    include_pill_groups_in_modules: false,
    include_is_member: false,
    skip_author_community_relationship: false,
    include_reply_device_follow: false,
    include_unmention_info_override: false,
    include_dm_muting: false,
    is_member_target_user_id: '0',
    rest_id: '',
    count: 20,
    cursor: null
  },
  featureKeys: iOSTimelineFeatureKeys
};

export const RetweetersQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: 'IP-HpAizGX4VJzXENjnfMg',
  queryName: 'Retweeters',
  requiresAccount: true,
  variables: {
    tweetId: '',
    count: 20,
    enableRanking: true,
    includePromotedContent: false,
    cursor: null
  },
  featureKeys: rwebTweetFeatureKeys
};

export const RetweetersTimelineQuery: GraphQLQuery = {
  httpMethod: 'GET',
  queryId: '6ZUFFT1j8q0u_E3YxuIGsQ',
  queryName: 'RetweetersTimeline',
  requiresAccount: true,
  variables: {
    include_community_tweet_relationship: false,
    include_grok_analysis_button: false,
    include_cta: false,
    include_grok_translated_bio: false,
    tweet_id: '',
    include_tweet_quick_promote_eligibility: false,
    include_professional: false,
    include_conversation_context: false,
    skip_author_community_relationship: false,
    enable_ranking: true,
    include_pill_groups_in_modules: false,
    include_is_member: false,
    include_reply_device_follow: false,
    include_unmention_info_override: false,
    include_dm_muting: false,
    is_member_target_user_id: '0',
    include_is_translatable: false,
    count: 20,
    cursor: null
  },
  featureKeys: rwebTweetFeatureKeys
};
