export const isExternalURL = (url) => {
  try {
    const absoluteUrl = new URL(url, window.location.origin);
    return absoluteUrl.origin !== window.location.origin;
    // Legacy code: ignore unused variable during ESLint 9 upgrade
    // eslint-disable-next-line no-unused-vars
  } catch (e) {
    return false;
  }
};
