import { DataProvider } from '../types/data-provider.js';
import type { APITwitterStatus } from '../types/api-schemas.js';
import type { APIStatus, APITikTokStatus } from '../types/api-status.js';
import { formatNumber } from './format-number.js';

export const getSocialProof = (status: APIStatus): string | null => {
  let views = 0;

  if (status.provider === DataProvider.Twitter || status.provider === DataProvider.TikTok) {
    views = (status as APITwitterStatus | APITikTokStatus).views || 0;
  }
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

/**
 * @param twitterRoot e.g. `https://x.com` — used for Twitter intent links only
 */
export const getActivitySocialProof = (status: APIStatus, twitterRoot: string): string | null => {
  let views = 0;

  if (status.provider === DataProvider.Twitter || status.provider === DataProvider.TikTok) {
    views = (status as APITwitterStatus | APITikTokStatus).views || 0;
  }
  if (status.likes > 0 || status.reposts > 0 || status.replies > 0 || (views ? views > 0 : false)) {
    let authorText = '';
    if (status.replies > 0) {
      if (status.provider === DataProvider.Twitter) {
        authorText += `💬 <a href="${twitterRoot}/intent/tweet?in_reply_to=${status.id}">${formatNumber(status.replies)}</a>&ensp;`;
      } else {
        authorText += `💬 ${formatNumber(status.replies)}&ensp;`;
      }
    }
    if (status.reposts > 0) {
      if (status.provider === DataProvider.Twitter) {
        authorText += `🔁 <a href="${twitterRoot}/intent/retweet?tweet_id=${status.id}">${formatNumber(status.reposts)}</a>&ensp;`;
      } else {
        authorText += `🔁 ${formatNumber(status.reposts)}&ensp;`;
      }
    }
    if (status.likes > 0) {
      if (status.provider === DataProvider.Twitter) {
        authorText += `❤️ <a href="${twitterRoot}/intent/like?tweet_id=${status.id}">${formatNumber(status.likes)}</a>&ensp;`;
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

export const getSocialTextIV = (status: APITwitterStatus): string | null => {
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
