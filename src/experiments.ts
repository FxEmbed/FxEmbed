export enum Experiment {
  ELONGATOR_BY_DEFAULT = 'ELONGATOR_BY_DEFAULT',
  ELONGATOR_PROFILE_API = 'ELONGATOR_PROFILE_API',
  TWEET_DETAIL_API = 'TWEET_DETAIL_API',
  TRANSCODE_GIFS = 'TRANSCODE_GIFS',
  IV_FORCE_THREAD_UNROLL = 'IV_FORCE_THREAD_UNROLL',
  VIDEO_REDIRECT_WORKAROUND = 'VIDEO_REDIRECT_WORKAROUND',
  ACTIVITY_EMBED = 'ACTIVITY_EMBED',
  USE_TRAFFIC_CONTROL = 'USE_TRAFFIC_CONTROL',
  BROADCAST_STREAM_API = 'BROADCAST_STREAM_API',
  KITCHENSINK_MEDIA = 'KITCHENSINK_MEDIA'
}

type ExperimentConfig = {
  name: string;
  description: string;
  percentage: number;
};

const Experiments: { [key in Experiment]: ExperimentConfig } = {
  [Experiment.ELONGATOR_BY_DEFAULT]: {
    name: 'Elongator by default',
    description: 'Enable Elongator by default (guest token lockout bypass)',
    percentage: 1
  },
  [Experiment.ELONGATOR_PROFILE_API]: {
    name: 'Elongator profile API',
    description: 'Use Elongator to load profiles',
    percentage: 1
  },
  [Experiment.TWEET_DETAIL_API]: {
    name: 'Tweet detail API',
    description: 'Use Tweet Detail API (where available with elongator)',
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
  [Experiment.USE_TRAFFIC_CONTROL]: {
    name: 'Enable Traffic Control',
    description: 'Use the Traffic Control web app to direct human traffic to app or web',
    percentage: 0
  },
  [Experiment.BROADCAST_STREAM_API]: {
    name: 'Broadcast Stream',
    description: 'Use FxTwitter Stream to load X/Twitter broadcasts',
    percentage: 0
  },
  [Experiment.KITCHENSINK_MEDIA]: {
    name: 'KitchenSink transcoder',
    description: 'Use KitchenSink transcoder server',
    percentage: 0
  }
};

export const experimentCheck = (experiment: Experiment, condition = true) => {
  console.log(`Checking experiment ${experiment}`);
  const experimentEnabled = Experiments[experiment].percentage > Math.random() && condition;
  console.log(`Experiment ${experiment} enabled: ${experimentEnabled}`);
  return experimentEnabled;
};
