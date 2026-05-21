export enum Experiment {
  TWEET_DETAIL_API = 'TWEET_DETAIL_API',
  TRANSCODE_GIFS = 'TRANSCODE_GIFS',
  IV_FORCE_THREAD_UNROLL = 'IV_FORCE_THREAD_UNROLL',
  VIDEO_REDIRECT_WORKAROUND = 'VIDEO_REDIRECT_WORKAROUND',
  ACTIVITY_EMBED = 'ACTIVITY_EMBED',
  BROADCAST_STREAM_API = 'BROADCAST_STREAM_API',
  KITCHENSINK_VIDEO = 'KITCHENSINK_VIDEO',
  KITCHENSINK_GIF = 'KITCHENSINK_GIF',
  USE_HORIZON_WEB = 'USE_HORIZON_WEB',
  ENABLE_CUSTOM_BRANDING = 'ENABLE_CUSTOM_BRANDING',
  TELEGRAM_PBS_PROXY = 'TELEGRAM_PBS_PROXY'
}

type ExperimentConfig = {
  name: string;
  description: string;
  percentage: number;
};

const Experiments: { [key in Experiment]: ExperimentConfig } = {
  [Experiment.TWEET_DETAIL_API]: {
    name: 'Tweet detail API',
    description: 'Use Tweet Detail API (where available with account proxy)',
    percentage: 1
  },
  [Experiment.TRANSCODE_GIFS]: {
    name: 'Transcode GIFs',
    description: 'Transcode GIFs for Discord, etc.',
    percentage: 1
  },
  [Experiment.IV_FORCE_THREAD_UNROLL]: {
    name: 'IV force thread unroll',
    description: 'Force thread unroll for Telegram Instant View',
    percentage: 1
  },
  [Experiment.VIDEO_REDIRECT_WORKAROUND]: {
    name: 'Video redirect workaround',
    description: 'Workaround for video playback issues on Telegram/Discord',
    percentage: 1
  },
  [Experiment.ACTIVITY_EMBED]: {
    name: 'Discord activity embed',
    description: 'Use activity embed for Discord',
    percentage: 1
  },
  [Experiment.BROADCAST_STREAM_API]: {
    name: 'Broadcast Stream',
    description: 'Use FxTwitter Stream to load X/Twitter broadcasts',
    percentage: 0
  },
  [Experiment.KITCHENSINK_VIDEO]: {
    name: 'KitchenSink video transcoder',
    description: 'Use KitchenSink video transcoder server',
    percentage: 0
  },
  [Experiment.KITCHENSINK_GIF]: {
    name: 'KitchenSink GIF transcoder',
    description: 'Use KitchenSink GIF transcoder server',
    percentage: 1
  },
  [Experiment.USE_HORIZON_WEB]: {
    name: 'Use Horizon Web',
    description: 'Use Horizon Web to load X/Twitter pages',
    percentage: 0
  },
  [Experiment.ENABLE_CUSTOM_BRANDING]: {
    name: 'Enable custom branding',
    description: 'Enable custom branding',
    percentage: 0
  },
  [Experiment.TELEGRAM_PBS_PROXY]: {
    name: 'Telegram PBS proxy',
    description: 'Proxy pbs.twimg.com post photos through PBS proxy for Telegram',
    percentage: 1
  }
};

export const experimentCheck = (experiment: Experiment, condition = true) => {
  const experimentEnabled = Experiments[experiment].percentage > Math.random() && condition;
  // console.log(
  //   `Experiment check: ${experiment} (resolved to ${experimentEnabled ? 'true' : 'false'})`
  // );
  return experimentEnabled;
};
