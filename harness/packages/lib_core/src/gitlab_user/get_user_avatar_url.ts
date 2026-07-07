export const getUserAvatarUrl = (avatarUrl: string, webUrl: string): string => {
  if (!avatarUrl) {
    return '';
  }
  // Check if avatarUrl is already a complete URL (starts with http://, https://, or data:image/)
  const isCompleteUrl =
    avatarUrl.startsWith('http://') ||
    avatarUrl.startsWith('https://') ||
    avatarUrl.startsWith('data:image/');

  if (isCompleteUrl) {
    return avatarUrl;
  }

  try {
    // It's a relative path, so extract the domain from webUrl and prefix the avatarUrl
    const webUrlObj = new URL(webUrl);
    return `${webUrlObj.origin}${avatarUrl}`;
  } catch {
    // the avatarUrl isn't complete URL and the webUrl isn't set we just return no avatar URL
    return '';
  }
};
