import { Constants } from '../constants';
import { DataProvider } from '../enum';
import { APIStatus, APITikTokStatus, APITwitterStatus } from '../types/types';
import { formatNumber } from './utils';

export const getSocialProof = (status: APIStatus): string | null => {
  let views = 0;

  if (status.provider === DataProvider.Twitter || status.provider === DataProvider.TikTok) {
    views = (status as APITwitterStatus | APITikTokStatus).views || 0;
  }
  /* Build out reply, repost, like counts */
  if (status.likes > 0 || status.reposts > 0 || status.replies > 0 || (views ? views > 0 : false)) {
    let authorText = '';
    if (status.replies > 0) {
      authorText += `💬 ${formatNumber(status.replies)}   `;
    }
    if (status.reposts > 0) {
      authorText += `🔁 ${formatNumber(status.reposts)}   `;
    }
    if (status.likes > 0) {
      authorText += `❤️ ${formatNumber(status.likes)}   `;
    }
    if (views && views > 0) {
      authorText += `👁️ ${formatNumber(views)}   `;
    }
    authorText = authorText.trim();

    return authorText;
  }

  return null;
};

export const getActivitySocialProof = (status: APIStatus): string | null => {
  let views = 0;

  if (status.provider === DataProvider.Twitter || status.provider === DataProvider.TikTok) {
    views = (status as APITwitterStatus | APITikTokStatus).views || 0;
  }
  /* Build out reply, repost, like counts */
  if (status.likes > 0 || status.reposts > 0 || status.replies > 0 || (views ? views > 0 : false)) {
    let authorText = '';
    if (status.replies > 0) {
      if (status.provider === DataProvider.Twitter) {
        authorText += `<a href="${Constants.TWITTER_ROOT}/intent/tweet?in_reply_to=${status.id}">💬</a> ${formatNumber(status.replies)}&ensp;`;
      } else {
        authorText += `💬 ${formatNumber(status.replies)}&ensp;`;
      }
    }
    if (status.reposts > 0) {
      if (status.provider === DataProvider.Twitter) {
        authorText += `<a href="${Constants.TWITTER_ROOT}/intent/retweet?tweet_id=${status.id}">🔁</a> ${formatNumber(status.reposts)}&ensp;`;
      } else {
        authorText += `🔁 ${formatNumber(status.reposts)}&ensp;`;
      }
    }
    if (status.likes > 0) {
      if (status.provider === DataProvider.Twitter) {
        authorText += `<a href="${Constants.TWITTER_ROOT}/intent/like?tweet_id=${status.id}">❤️</a> ${formatNumber(status.likes)}&ensp;`;
      } else {
        authorText += `❤️ ${formatNumber(status.likes)}&ensp;`;
      }
    }
    if (views && views > 0) {
      authorText += `👁️ ${formatNumber(views)}&ensp;`;
    }
    authorText = `<b>${authorText.trim()}</b>`;

    return authorText;
  }

  return null;
};

/* The embed "author" text we populate with replies, reposts, and likes unless it's a video */
export const getSocialTextIV = (status: APITwitterStatus): string | null => {
  /* Build out reply, repost, like counts */
  if (status.likes > 0 || status.reposts > 0 || status.replies > 0) {
    let authorText = '';
    if (status.replies > 0) {
      authorText += `💬 ${formatNumber(status.replies)} `;
    }
    if (status.reposts > 0) {
      authorText += `🔁 ${formatNumber(status.reposts)} `;
    }
    if (status.likes > 0) {
      authorText += `❤️ ${formatNumber(status.likes)} `;
    }
    if (status.views && status.views > 0) {
      authorText += `👁️ ${formatNumber(status.views)} `;
    }
    authorText = authorText.trim();

    return authorText;
  }

  return null;
};
