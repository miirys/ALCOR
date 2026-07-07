/**
 * Tries to parse the project full path from a provided web_url value
 * This is because the search results REST results do not include project path, which we want to display.
 *
 * @param webUrl The full web_url for the item
 * @param pathPart The path part of the item, e.g. `merge_requests` or `issues`
 */
export function tryParseProjectPathFromWebUrl(webUrl: string): string {
  try {
    const { pathname } = new URL(webUrl);
    const separatorIndex = pathname.indexOf(`/-/`);
    if (separatorIndex === -1) {
      return ''; // Unexpected path format
    }
    const projectPath = pathname.substring(0, separatorIndex);
    return projectPath.startsWith('/') ? projectPath.slice(1) : projectPath;
  } catch {
    // Best effort, nothing to do if the webUrl is in an unexpected format
    return '';
  }
}
