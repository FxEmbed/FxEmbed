import { Context } from 'hono';
import { AboutAccountQuery } from './graphql/queries';
import { validateAboutAccountQuery } from './graphql/validators';
import { graphQLOrchestrator, GraphQLOrchestratorResult } from './graphql/orchestrator';
import { mergeAboutAccountData } from './profile';

const collectScreenNames = (response: SocialThread): Map<string, string> => {
  const screenNames = new Map<string, string>();

  const addScreenName = (author?: APIUser | null) => {
    if (!author?.screen_name) {
      return;
    }
    const key = author.screen_name.toLowerCase();
    if (!screenNames.has(key)) {
      screenNames.set(key, author.screen_name);
    }
  };

  if (response.author) {
    addScreenName(response.author);
  }

  if (response.status?.author) {
    addScreenName(response.status.author);
  }

  response.thread?.forEach(status => {
    addScreenName(status.author);
  });

  return screenNames;
};

const applyAboutAccountData = (
  response: SocialThread,
  results: GraphQLOrchestratorResult
) => {
  const apply = (author?: APIUser | null) => {
    if (!author?.screen_name) {
      return;
    }
    const key = author.screen_name.toLowerCase();
    const aboutAccount = results[key]?.success
      ? (results[key].data as AboutAccountQueryResponse)
      : null;
    if (aboutAccount) {
      mergeAboutAccountData(author, aboutAccount);
    }
  };

  apply(response.author);
  apply(response.status?.author);
  response.thread?.forEach(status => apply(status.author));
};

export const attachAboutAccountData = async (
  c: Context,
  response: SocialThread
): Promise<SocialThread> => {
  const screenNames = collectScreenNames(response);

  if (screenNames.size === 0) {
    return response;
  }

  const requests = Array.from(screenNames.entries(), ([key, screenName]) => ({
    key,
    query: AboutAccountQuery,
    variables: { screenName },
    validator: validateAboutAccountQuery,
    required: false
  }));

  const results = await graphQLOrchestrator(c, requests);
  applyAboutAccountData(response, results);

  return response;
};
