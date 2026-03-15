import { constructTwitterThread } from '../../../providers/twitter/conversation';
import { Constants } from '../../../constants';
import { userAPI } from '../../../providers/twitter/profile';
import { attachAboutAccountData } from '../../../providers/twitter/aboutAccount';
import { searchAPI } from '../../../providers/twitter/search';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import { Context } from 'hono';

const shouldIncludeAboutAccount = (c: Context) => {
  const val = c.req.query('about_account') ?? c.req.query('aboutAccount');
  return val === '1' || val === 'true';
};

export const statusAPIRequest = async (c: Context) => {
  const id = c.req.param('id') as string;

  let processedResponse = await constructTwitterThread(id, false, c, undefined, undefined);
  if (processedResponse.code === 200 && shouldIncludeAboutAccount(c)) {
    processedResponse = await attachAboutAccountData(c, processedResponse);
  }

  c.status(processedResponse.code as ContentfulStatusCode);
  // Add every header from Constants.API_RESPONSE_HEADERS
  for (const [header, value] of Object.entries(Constants.API_RESPONSE_HEADERS)) {
    c.header(header, value);
  }
  return c.json(processedResponse);
};

export const threadAPIRequest = async (c: Context) => {
  const id = c.req.param('id') as string;

  let processedResponse = await constructTwitterThread(id, true, c, undefined);
  if (processedResponse.code === 200 && shouldIncludeAboutAccount(c)) {
    processedResponse = await attachAboutAccountData(c, processedResponse);
  }

  c.status(processedResponse.code as ContentfulStatusCode);
  // Add every header from Constants.API_RESPONSE_HEADERS
  for (const [header, value] of Object.entries(Constants.API_RESPONSE_HEADERS)) {
    c.header(header, value);
  }
  return c.json(processedResponse);
};

export const profileAPIRequest = async (c: Context) => {
  const handle = c.req.param('handle') as string;

  const profileResponse = await userAPI(handle, c);

  c.status(profileResponse.code as ContentfulStatusCode);
  // Add every header from Constants.API_RESPONSE_HEADERS
  for (const [header, value] of Object.entries(Constants.API_RESPONSE_HEADERS)) {
    c.header(header, value);
  }
  return c.json(profileResponse);
};

export const searchAPIRequest = async (c: Context) => {
  const query = c.req.query('q');

  if (!query) {
    c.status(400);
    for (const [header, value] of Object.entries(Constants.API_RESPONSE_HEADERS)) {
      c.header(header, value);
    }
    return c.json({ code: 400, message: 'Missing required query parameter: q' });
  }

  const rawFeed = c.req.query('feed') ?? 'latest';
  const feed = (['latest', 'top', 'media'] as const).includes(rawFeed as 'latest' | 'top' | 'media')
    ? (rawFeed as 'latest' | 'top' | 'media')
    : 'latest';

  const rawCount = parseInt(c.req.query('count') ?? '30', 10);
  const count = Number.isNaN(rawCount) ? 30 : Math.min(Math.max(rawCount, 1), 100);

  const cursor = c.req.query('cursor') ?? null;

  const searchResponse = await searchAPI(query, feed, count, cursor, c);

  c.status(searchResponse.code as ContentfulStatusCode);
  for (const [header, value] of Object.entries(Constants.API_RESPONSE_HEADERS)) {
    c.header(header, value);
  }
  return c.json(searchResponse);
};
