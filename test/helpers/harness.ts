/* eslint-disable no-case-declarations */
// Test harness: optional TwitterProxy Fetcher mocks X API responses (in-process proxy uses CREDENTIAL_KEY in prod).
export default {
  TwitterProxy: {
    fetch: async (request: string) => {
      // get start of API base
      // examples starters:
      // https://x.com/i/api/graphql
      // https://twitter.com/i/api/graphql
      // https://api.twitter.com/graphql
      // https://api.x.com/graphql
      const url = new URL(request);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const graphqlIdx = pathParts.indexOf('graphql');
      const apiMethod =
        graphqlIdx >= 0 && pathParts[graphqlIdx + 2] ? pathParts[graphqlIdx + 2] : null;
      if (!apiMethod) {
        throw new Error(`Invalid request: ${url}`);
      }
      const variables = JSON.parse(decodeURIComponent(url.searchParams.get('variables') ?? '{}'));
      console.log('Method:', apiMethod);
      console.log('Variables:', variables);

      switch (apiMethod) {
        case 'UserByScreenName':
          const screenName = variables.screen_name;
          // load mock based on screen name
          try {
            const mock = await import(`../mocks/UserByScreenName/${screenName}.json`);
            console.log('Mock data:', mock);
            return new Response(JSON.stringify(mock));
          } catch (error) {
            console.error('Error loading mock:', error);
            return new Response(JSON.stringify({ data: {} }));
          }
        case 'UserResultByScreenName':
          const screenNameResult = variables.screen_name;
          // load mock based on screen name
          try {
            const mock = await import(`../mocks/UserResultByScreenName/${screenNameResult}.json`);
            console.log('Mock data:', mock);
            return new Response(JSON.stringify(mock));
          } catch (error) {
            console.error('Error loading mock:', error);
            return new Response(JSON.stringify({ data: {} }));
          }
        case 'TweetDetail':
        case 'ConversationTimeline': {
          const focalTweetId = variables.focalTweetId ?? variables.focal_tweet_id;
          // Reply pages (a cursor is set) load `<id>.cursor.json`, if there is one
          const suffix = variables.cursor ? '.cursor' : '';
          // load mock based on tweet id
          try {
            const mock = await import(`../mocks/TweetDetail/${focalTweetId}${suffix}.json`);
            console.log('Mock data:', mock);
            return new Response(JSON.stringify(mock));
          } catch (error) {
            console.error('Error loading mock:', error);
          }
          return new Response(JSON.stringify({ data: {} }));
        }
        case 'TweetResultByRestId':
          const tweetId = variables.tweetId;
          // load mock based on tweet id
          try {
            const mock = await import(`../mocks/TweetResultByRestId/${tweetId}.json`);
            console.log('Mock data:', mock);
            return new Response(JSON.stringify(mock));
          } catch (error) {
            console.error('Error loading mock:', error);
          }
          return new Response(JSON.stringify({ data: {} }));
        case 'TweetResultsByRestIds':
          const tweetIds = Array.isArray(variables.tweetIds)
            ? variables.tweetIds
            : [variables.tweetIds];
          const filename = tweetIds[0];
          // load mock based on tweet id
          try {
            const mock = await import(`../mocks/TweetResultsByRestIds/${filename}.json`);
            console.log('Mock data:', mock);
            return new Response(JSON.stringify(mock));
          } catch (error) {
            console.error('Error loading mock:', error);
          }
          return new Response(JSON.stringify({ data: {} }));
        case 'TweetResultsByIdsQuery':
          // load mock based on tweet ids
          try {
            const ids = Array.isArray(variables.rest_ids)
              ? variables.rest_ids
              : [variables.rest_ids];
            const filename = ids[0];
            const mock = await import(`../mocks/TweetResultsByIds/${filename}.json`);
            console.log('Mock data:', mock);
            return new Response(JSON.stringify(mock));
          } catch (error) {
            console.error('Error loading mock:', error);
          }
          return new Response(JSON.stringify({ data: {} }));
        case 'AboutAccountQuery':
          const screenNameAbout = variables.screenName;
          // load mock based on screen name
          try {
            const mock = await import(`../mocks/AboutAccountQuery/${screenNameAbout}.json`);
            console.log('Mock data:', mock);
            return new Response(JSON.stringify(mock));
          } catch (error) {
            console.error('Error loading mock:', error);
            return new Response(JSON.stringify({ data: {} }));
          }
        case 'SearchTimeline':
          const rawQuery = variables.rawQuery ?? 'neo';
          const searchFilename = String(rawQuery).replace(/[^a-zA-Z0-9_-]/g, '_');
          try {
            const mock = await import(`../mocks/SearchTimeline/${searchFilename}.json`);
            return new Response(JSON.stringify(mock));
          } catch (error) {
            console.error('Error loading SearchTimeline mock:', error);
            return new Response(
              JSON.stringify({
                data: {
                  search_by_raw_query: {
                    search_timeline: { timeline: { instructions: [] } }
                  }
                }
              })
            );
          }
        case 'ExplorePage':
          try {
            const exploreMock = await import('../mocks/ExplorePage/default.json');
            return new Response(JSON.stringify(exploreMock));
          } catch (error) {
            console.error('Error loading ExplorePage mock:', error);
            return new Response(
              JSON.stringify({
                data: { explore_page: { body: { timelines: [] } } }
              })
            );
          }
        case 'GenericTimelineById':
          try {
            const timelineMock = await import('../mocks/GenericTimelineById/default.json');
            return new Response(JSON.stringify(timelineMock));
          } catch (error) {
            console.error('Error loading GenericTimelineById mock:', error);
            return new Response(
              JSON.stringify({
                data: { timeline: { timeline: { instructions: [] } } }
              })
            );
          }
        case 'UserTweets':
        case 'UserMedia':
        case 'UserArticlesTweets':
          const tweetsUserId = variables.userId;
          try {
            const tweetsModule = await import(`../mocks/UserTweets/${tweetsUserId}.json`);
            const tweetsMock =
              'default' in tweetsModule && tweetsModule.default
                ? tweetsModule.default
                : tweetsModule;
            return new Response(JSON.stringify(tweetsMock));
          } catch (error) {
            console.error('Error loading UserTweets mock:', error);
            return new Response(
              JSON.stringify({
                data: {
                  user: {
                    result: {
                      timeline: { timeline: { instructions: [] } }
                    }
                  }
                }
              })
            );
          }
        case 'ProfileTimeline': {
          const restId = variables.rest_id as string;
          try {
            const tweetsModule = await import(`../mocks/UserTweets/${restId}.json`);
            const tweetsMock = (
              'default' in tweetsModule && tweetsModule.default
                ? tweetsModule.default
                : tweetsModule
            ) as {
              data?: { user?: { result?: { timeline?: { timeline?: unknown } } } };
            };
            const inner = tweetsMock.data?.user?.result?.timeline?.timeline;
            const wrapped = {
              data: {
                user_result_by_rest_id: {
                  rest_id: restId,
                  result: {
                    __typename: 'User',
                    profile_timeline_v2: {
                      id: 'mock-profile-timeline',
                      timeline: inner ?? { instructions: [] }
                    }
                  }
                }
              }
            };
            return new Response(JSON.stringify(wrapped));
          } catch (error) {
            console.error('Error loading ProfileTimeline mock:', error);
            return new Response(
              JSON.stringify({
                data: {
                  user_result_by_rest_id: {
                    rest_id: restId,
                    result: {
                      __typename: 'User',
                      profile_timeline_v2: {
                        timeline: { instructions: [] }
                      }
                    }
                  }
                }
              })
            );
          }
        }
        case 'ProfileArticlesTimeline': {
          const articlesRestId = variables.rest_id as string;
          try {
            const tweetsModule = await import(`../mocks/UserTweets/${articlesRestId}.json`);
            const tweetsMock = (
              'default' in tweetsModule && tweetsModule.default
                ? tweetsModule.default
                : tweetsModule
            ) as {
              data?: { user?: { result?: { timeline?: { timeline?: unknown } } } };
            };
            const inner = tweetsMock.data?.user?.result?.timeline?.timeline;
            const wrappedArticles = {
              data: {
                user_result_by_rest_id: {
                  rest_id: articlesRestId,
                  result: {
                    __typename: 'User',
                    profile_articles_timeline: {
                      id: 'mock-profile-articles-timeline',
                      timeline: inner ?? { instructions: [] }
                    }
                  }
                }
              }
            };
            return new Response(JSON.stringify(wrappedArticles));
          } catch (error) {
            console.error('Error loading ProfileArticlesTimeline mock:', error);
            return new Response(
              JSON.stringify({
                data: {
                  user_result_by_rest_id: {
                    rest_id: articlesRestId,
                    result: {
                      __typename: 'User',
                      profile_articles_timeline: {
                        timeline: { instructions: [] }
                      }
                    }
                  }
                }
              })
            );
          }
        }
        case 'Followers':
        case 'Following': {
          const userId = variables.userId as string;
          try {
            const mod = await import(`../mocks/FollowGraph/${userId}.json`);
            const payload =
              'default' in mod && mod.default ? (mod.default as Record<string, unknown>) : mod;
            return new Response(JSON.stringify(payload));
          } catch (error) {
            console.error('Error loading FollowGraph mock:', error);
            return new Response(
              JSON.stringify({
                data: {
                  user: {
                    result: {
                      __typename: 'User',
                      timeline: { timeline: { instructions: [] } }
                    }
                  }
                }
              })
            );
          }
        }
        case 'FollowersByUserIDTimeline': {
          const restId = variables.rest_id as string;
          try {
            const mod = await import(`../mocks/FollowGraph/${restId}.json`);
            const payload = ('default' in mod && mod.default ? mod.default : mod) as {
              data?: {
                user?: { result?: { timeline?: { timeline?: { instructions?: unknown[] } } } };
              };
            };
            const instructions = payload.data?.user?.result?.timeline?.timeline?.instructions ?? [];
            return new Response(
              JSON.stringify({
                data: {
                  user_result_by_rest_id: {
                    result: {
                      __typename: 'User',
                      followers_timeline: {
                        timeline: { instructions }
                      }
                    }
                  }
                }
              })
            );
          } catch (error) {
            console.error('Error loading FollowersByUserIDTimeline mock:', error);
            return new Response(
              JSON.stringify({
                data: {
                  user_result_by_rest_id: {
                    result: {
                      __typename: 'User',
                      followers_timeline: { timeline: { instructions: [] } }
                    }
                  }
                }
              })
            );
          }
        }
        case 'FollowingByUserIDTimeline': {
          const restId = variables.rest_id as string;
          try {
            const mod = await import(`../mocks/FollowGraph/${restId}.json`);
            const payload = ('default' in mod && mod.default ? mod.default : mod) as {
              data?: {
                user?: { result?: { timeline?: { timeline?: { instructions?: unknown[] } } } };
              };
            };
            const instructions = payload.data?.user?.result?.timeline?.timeline?.instructions ?? [];
            return new Response(
              JSON.stringify({
                data: {
                  user_result_by_rest_id: {
                    result: {
                      __typename: 'User',
                      following_timeline: {
                        timeline: { instructions }
                      }
                    }
                  }
                }
              })
            );
          } catch (error) {
            console.error('Error loading FollowingByUserIDTimeline mock:', error);
            return new Response(
              JSON.stringify({
                data: {
                  user_result_by_rest_id: {
                    result: {
                      __typename: 'User',
                      following_timeline: { timeline: { instructions: [] } }
                    }
                  }
                }
              })
            );
          }
        }
        default:
          throw new Error('Invalid request');
      }
    }
  }
};
