export const validateAboutAccountQuery = (response: unknown): boolean => {
  const aboutAccountResponse = response as AboutAccountQueryResponse;
  const result = aboutAccountResponse?.data?.user_result_by_screen_name?.result;
  return Boolean(result && typeof result === 'object');
};
