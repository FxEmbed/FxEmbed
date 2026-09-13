import { expect, test } from 'vitest';
import { getActivitySocialProof } from '../packages/atmosphere/src/helpers/social-proof';
import { DataProvider } from '../packages/atmosphere/src/types/data-provider';
import type { APIStatus } from '../packages/atmosphere/src/types/api-status';

test('Twitter activity social proof keeps icons visible in linked engagement metrics', () => {
  const status = {
    id: '205052027259195393',
    provider: DataProvider.Twitter,
    replies: 138,
    reposts: 28900,
    likes: 71700
  } as APIStatus;

  expect(getActivitySocialProof(status, 'https://x.com')).toBe(
    '<b>💬 <a href="https://x.com/intent/tweet?in_reply_to=205052027259195393">138</a>&ensp;🔁 <a href="https://x.com/intent/retweet?tweet_id=205052027259195393">28.9K</a>&ensp;❤️ <a href="https://x.com/intent/like?tweet_id=205052027259195393">71.7K</a>&ensp;</b>'
  );
});
