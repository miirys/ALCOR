import fs from 'node:fs';

// Lazy loader for cloakbrowser: the original module imported `launch`
// statically, which forced the (native, heavy) browser dependency to be
// resolvable at module load. Embedded in duox-cli, only the REST/pool-state
// paths run at startup; the browser is launched lazily inside the group
// create / trial-activate / delete methods. Deferring the import keeps
// GroupPoolManager constructable (and the credit-ledger switch path usable)
// without cloakbrowser installed, while preserving behaviour when it is.
let _launch;
async function launch(opts) {
  if (!_launch) {
    ({ launch: _launch } = await import('cloakbrowser/puppeteer'));
  }
  return _launch(opts);
}

const ERROR_SCREENSHOT_PATH =
  '/home/maddie/.gemini/antigravity/brain/cf7f11ea-0bc8-438f-92dc-e77a091abc13/error.png';

/**
 * Parsed Netscape cookies from a file.
 * Netscape format: domain | flag | path | secure | expiration | name | value
 */
export function parseNetscapeCookies(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Cookies file not found at: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const cookies = [];

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 7) continue;

    const domain = parts[0];
    const pathVal = parts[2];
    const secure = parts[3] === 'TRUE';
    const expires = parseInt(parts[4], 10);
    const name = parts[5];
    const value = parts[6];

    // Only set cookies for gitlab.com domains to avoid bloat and speed up page loads
    if (domain.includes('gitlab.com')) {
      cookies.push({
        name,
        value,
        domain: domain.startsWith('.') ? domain : `.${domain}`,
        path: pathVal,
        secure,
        expires: expires > 0 ? expires : undefined,
      });
    }
  }
  return cookies;
}

/**
 * Automates GitLab interactions using cloakbrowser.
 */
export class GitLabAutomator {
  #config;
  #log;

  constructor(config, log) {
    this.#config = config;
    this.#log = log;
  }

  /**
   * Lists the user's existing top-level 'duo-pool-*' groups via REST so the
   * pool can ADOPT already-created groups instead of creating new ones (which
   * fails once the account hits its group limit). Returns [{id, path, numericId}].
   */
  /**
   * List projects owned by a group via REST. Used to find or reuse a scratch
   * project for path-b workflow creation (`Only project-level workflow is
   * supported`).
   */
  async listProjectsInGroup(token, baseUrl, groupNumericId) {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const url = new URL(`api/v4/groups/${groupNumericId}/projects`, base);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('archived', 'false');
    url.searchParams.set('with_shared', 'false');
    let res;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'duo-bridge/0.7.2',
        },
      });
    } catch (err) {
      this.#log.warn(`Could not list projects in group ${groupNumericId}: ${err.message}`);
      return [];
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      this.#log.warn(
        `listProjectsInGroup(${groupNumericId}) returned ${res.status}: ${txt.slice(0, 200)}`,
      );
      return [];
    }
    const data = await res.json().catch(() => []);
    if (!Array.isArray(data)) return [];
    return data.map((p) => ({
      id: p.id,
      name: p.name,
      path: p.path,
      pathWithNamespace: p.path_with_namespace,
      defaultBranch: p.default_branch,
    }));
  }

  /**
   * Create a private project inside the given group namespace via REST. Used
   * lazily by the pool manager to satisfy GitLab's project-level workflow
   * requirement without asking the user to create anything by hand.
   */
  async createProjectInGroup(
    token,
    baseUrl,
    groupNumericId,
    {
      name = 'duo-bridge-scratch',
      description = 'Auto-created by duo-bridge; do not delete.',
    } = {},
  ) {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const url = new URL('api/v4/projects', base);
    const body = {
      name,
      path: name,
      namespace_id: groupNumericId,
      visibility: 'private',
      description,
      initialize_with_readme: true,
      default_branch: 'main',
    };
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'duo-bridge/0.7.2',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(`createProjectInGroup(${groupNumericId}) network error: ${err.message}`);
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(
        `createProjectInGroup(${groupNumericId}) failed (${res.status}): ${txt.slice(0, 300)}`,
      );
    }
    const p = await res.json();
    return {
      id: p.id,
      name: p.name,
      path: p.path,
      pathWithNamespace: p.path_with_namespace,
      defaultBranch: p.default_branch,
    };
  }

  async listOwnedDuoPoolGroups(token, baseUrl) {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const url = new URL('api/v4/groups', base);
    url.searchParams.set('owned', 'true');
    url.searchParams.set('top_level_only', 'true');
    url.searchParams.set('per_page', '100');
    url.searchParams.set('search', 'duo-pool');
    let res;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'duo-bridge/0.1.0',
        },
      });
    } catch (err) {
      // Throw (do not swallow) so callers can distinguish a genuine "zero groups"
      // result from a transient listing failure. The pool reconciler relies on
      // this: it must NOT prune tracked groups just because a request flaked.
      throw new Error(`Could not list existing groups: ${err.message}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Listing existing groups returned ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json().catch(() => []);
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (g) =>
          typeof g.full_path === 'string' &&
          g.full_path.indexOf('duo-pool-') === 0 &&
          g.full_path.indexOf('deletion_scheduled') === -1 &&
          !g.marked_for_deletion_on &&
          !g.marked_for_deletion_at,
      )
      .map((g) => ({ id: g.full_path, path: g.full_path, numericId: g.id }));
  }

  /**
   * Creates a new GitLab group.
   * Tries REST API first (fastest). If that fails (e.g. 403 Forbidden), falls back to browser-based UI automation!
   */
  async createGroup(token, baseUrl) {
    const rand = Math.random().toString(36).substring(2, 7);
    const groupName = `duo-pool-${rand}`;

    try {
      const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      const url = new URL('api/v4/groups', base);

      this.#log.info(`Attempting to create new group '${groupName}' via REST API...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'duo-bridge/0.1.0',
        },
        body: JSON.stringify({
          name: groupName,
          path: groupName,
          visibility: 'private',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        this.#log.info(`Group successfully created via API. ID: ${data.id}, Path: ${data.path}`);
        return { groupId: data.id, groupPath: data.path };
      }

      const text = await res.text();
      this.#log.warn(
        `GitLab Group Creation via API returned non-2xx (${res.status}): ${text}. Falling back to browser-based creation...`,
      );
    } catch (apiError) {
      this.#log.warn(
        `GitLab Group Creation via API encountered network/permission error: ${apiError.message}. Falling back to browser-based creation...`,
      );
    }

    // Fallback: Browser-based UI automation
    return this.createGroupViaBrowser(groupName, token, baseUrl);
  }

  /**
   * Creates a group using cloakbrowser UI clicks.
   */
  async createGroupViaBrowser(groupName, token, baseUrl) {
    this.#log.info(`Creating group '${groupName}' via browser UI automation...`);
    const cookies = parseNetscapeCookies(
      this.#config.cookiesPath || `${process.cwd()}/cookies.txt`,
    );

    const browser = await launch({
      headless: this.#config.headless,
      humanize: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    if (typeof page.setViewport === 'function') {
      await page.setViewport({ width: 1280, height: 800 });
    } else if (typeof page.setViewportSize === 'function') {
      await page.setViewportSize({ width: 1280, height: 800 });
    }

    try {
      if (typeof page.setCookie === 'function') {
        await page.setCookie(...cookies);
      } else if (browser.contexts && typeof browser.contexts === 'function') {
        const contexts = browser.contexts();
        if (contexts && contexts.length > 0) {
          await contexts[0].addCookies(cookies);
        }
      } else if (browser.context && typeof browser.context === 'function') {
        await browser.context().addCookies(cookies);
      } else if (typeof browser.addCookies === 'function') {
        await browser.addCookies(cookies);
      } else {
        this.#log.warn(
          'Could not find standard cookie setting function. Trying fallback on first context...',
        );
        const contexts = browser.contexts ? browser.contexts() : [];
        if (contexts.length > 0) {
          await contexts[0].addCookies(cookies);
        } else {
          throw new Error('No cookie setting method found on page or browser context.');
        }
      }

      // Navigate to group creation page
      this.#log.info('Navigating to New Group page...');
      await page.goto('https://gitlab.com/groups/new#create-group-pane', {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      // Click "Create group" panel/tab if needed
      const panelBtn = await page.$('[data-testid="create-group-button"]');
      if (panelBtn) await panelBtn.click();

      // Wait for input and type name
      await page.waitForSelector(
        'input[id="group_name"], input[name="group[name]"], [data-testid="group-name-field"]',
        { timeout: 15000 },
      );
      await page.type(
        'input[id="group_name"], input[name="group[name]"], [data-testid="group-name-field"]',
        groupName,
      );

      // Submit form
      const submitBtn = await page.$(
        'input[type="submit"], button[type="submit"], button[data-testid="create-group-button"]',
      );
      if (submitBtn) {
        this.#log.info('Submitting group creation form...');
        await submitBtn.click();
      } else {
        await page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) form.submit();
        });
      }

      // Wait 3 seconds to see if a personalization/onboarding screen appears
      this.#log.info('Checking if personalization/onboarding questionnaire appeared...');
      await new Promise((r) => setTimeout(r, 3000));

      // Check for radio buttons or "Who will be using this group?" text
      const questionnaireVisible = await page.evaluate(() => {
        return (
          document.body.textContent.includes('personalize your GitLab experience') ||
          document.body.textContent.includes('Who will be using this group') ||
          !!document.querySelector('input[type="radio"]')
        );
      });

      if (questionnaireVisible) {
        this.#log.info('Personalization questionnaire detected. Answering questions...');
        try {
          // Click "Just me" or first radio button
          await page.evaluate(() => {
            const radio =
              document.querySelector('input[type="radio"][value="just_me"]') ||
              document.querySelector('input[type="radio"][value="personal"]') ||
              document.querySelector('input[type="radio"]');
            if (radio) {
              radio.click();
            } else {
              // try by label text
              const labels = Array.from(document.querySelectorAll('label'));
              const justMeLabel = labels.find(
                (l) =>
                  l.textContent.toLowerCase().includes('just me') ||
                  l.textContent.toLowerCase().includes('company'),
              );
              if (justMeLabel) justMeLabel.click();
            }
          });

          // Wait a bit
          await new Promise((r) => setTimeout(r, 500));

          // Click the final "Create group" button inside the questionnaire container
          this.#log.info('Clicking final "Create group" button...');
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const createBtn = btns.find((b) => b.textContent.trim() === 'Create group');
            if (createBtn) createBtn.click();
          });
        } catch (questErr) {
          this.#log.warn(`Failed to fill questionnaire automatically: ${questErr.message}`);
        }
      }

      // Now wait for navigation to complete
      this.#log.info('Waiting for redirection to the new group...');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});

      // We should now be redirected to the group home page (e.g. /duo-pool-xxxx)
      const currentUrl = page.url();
      this.#log.info(`Redirected to: ${currentUrl}`);

      let groupPath = groupName;
      try {
        const urlObj = new URL(currentUrl);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
          groupPath = pathParts[0] === 'groups' ? pathParts[1] || groupName : pathParts[0];
        }
      } catch (urlErr) {
        this.#log.warn(`Failed to parse URL ${currentUrl}: ${urlErr.message}`);
      }

      // Extract the Group ID from the page context
      let groupId = await page.evaluate(() => {
        return (
          document.body.getAttribute('data-group-id') ||
          document.querySelector('[data-group]')?.getAttribute('data-group') ||
          window.gl?.groupId ||
          null
        );
      });

      // If we couldn't find it on the page directly, let's look it up via API (fetching details is usually allowed even if creation is blocked)
      if (!groupId) {
        this.#log.info(`Looking up Group ID for path '${groupPath}' via REST API...`);
        try {
          const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
          const lookupUrl = new URL(`api/v4/groups/${encodeURIComponent(groupPath)}`, base);
          const res = await fetch(lookupUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            groupId = data.id;
          }
        } catch (lookupError) {
          this.#log.warn(`Could not resolve group ID via API: ${lookupError.message}`);
        }
      }

      // Authoritatively verify the group actually exists via the REST API before
      // reporting success. The browser can land on the generic /groups listing
      // (or a questionnaire dead-end) without actually creating the group, which
      // previously produced phantom pool entries.
      let verifiedId = null;
      let verifiedPath = groupPath;
      {
        const vbase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        const vLookupUrl = new URL(`api/v4/groups/${encodeURIComponent(groupPath)}`, vbase);
        for (let vAttempt = 1; vAttempt <= 5; vAttempt++) {
          try {
            const vRes = await fetch(vLookupUrl, { headers: { Authorization: `Bearer ${token}` } });
            if (vRes.ok) {
              const vData = await vRes.json();
              if (vData && vData.id) {
                verifiedId = vData.id;
                verifiedPath = vData.full_path || vData.path || groupPath;
                break;
              }
            }
          } catch (verifyErr) {
            this.#log.warn(
              `Group existence check attempt ${vAttempt} failed: ${verifyErr.message}`,
            );
          }
          if (vAttempt < 5) await new Promise((r) => setTimeout(r, 2000));
        }
      }

      if (!verifiedId) {
        throw new Error(
          `Group '${groupName}' was NOT actually created (no matching group via API after the browser flow; last URL: ${currentUrl}). Aborting to avoid a phantom pool entry.`,
        );
      }

      this.#log.info(
        `Successfully created and verified group via browser UI fallback. Path: ${verifiedPath}, ID: ${verifiedId}`,
      );
      return { groupId: verifiedId, groupPath: verifiedPath };
    } catch (error) {
      this.#log.error(`Error during browser-based group creation: ${error.message}`);
      await page.screenshot({ path: ERROR_SCREENSHOT_PATH }).catch(() => {});
      throw error;
    } finally {
      await browser.close();
    }
  }

  /**
   * Uses cloakbrowser with your session cookies to:
   * 1. Navigate to the billing/trial start page for the newly created group.
   * 2. Fill the trial form (Company name, region, employees, etc.) with mock details.
   * 3. Navigate to Group Settings > GitLab Duo, click "Configure", enable experimental settings, and save.
   */
  async activateTrialAndDuo(groupId, groupPath) {
    this.#log.info(`Starting browser automation to activate Duo Trial for group: ${groupPath}`);

    const cookies = parseNetscapeCookies(
      this.#config.cookiesPath || `${process.cwd()}/cookies.txt`,
    );
    this.#log.debug(`Loaded ${cookies.length} cookies for gitlab.com`);

    const browser = await launch({
      headless: this.#config.headless,
      humanize: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    if (typeof page.setViewport === 'function') {
      await page.setViewport({ width: 1280, height: 800 });
    } else if (typeof page.setViewportSize === 'function') {
      await page.setViewportSize({ width: 1280, height: 800 });
    }

    try {
      await page.setCookie(...cookies);

      // Step 1: Wait 1 second, then navigate to Usage Quotas page
      this.#log.info('Waiting 1 second before visiting Usage Quotas page...');
      await new Promise((r) => setTimeout(r, 1000));
      const quotasUrl = `https://gitlab.com/groups/${groupPath}/-/usage_quotas#seats-quota-tab`;
      this.#log.info(`Navigating to Usage Quotas: ${quotasUrl}`);
      await page.goto(quotasUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      // Wait 1 second on Usage Quotas page
      this.#log.info('Waiting 1 second on Usage Quotas page...');
      await new Promise((r) => setTimeout(r, 1000));

      // Step 2: Navigate to Billings page
      const billingsUrl = `https://gitlab.com/groups/${groupPath}/-/billings`;
      this.#log.info(`Navigating to Billings: ${billingsUrl}`);
      await page.goto(billingsUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      // Wait 1 second on Billings page
      this.#log.info('Waiting 1 second on Billings page...');
      await new Promise((r) => setTimeout(r, 1000));

      // Step 3: Find and click the "Try for free" button under Ultimate plan, or fall back to direct navigation
      this.#log.info('Locating "Try for free" button on Billings page...');
      let clickedTryForFree = false;
      try {
        const buttons = await page.$$('button, a');
        for (const btn of buttons) {
          const text = await page.evaluate((el) => el.textContent.trim().toLowerCase(), btn);
          if (text.includes('try for free')) {
            this.#log.info('Found "Try for free" button. Clicking it...');
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
              btn.click(),
            ]);
            clickedTryForFree = true;
            break;
          }
        }
      } catch (clickErr) {
        this.#log.warn(`Could not click "Try for free" button via UI: ${clickErr.message}`);
      }

      if (!clickedTryForFree) {
        // IMPORTANT: never force-navigate to the trials/new URL directly - doing
        // so invalidates the user's session cookies. The trial MUST be claimed via
        // the "Try for free" button on the billings page only.
        throw new Error(
          `Could not find the "Try for free" button on the billings page for '${groupPath}'. Aborting trial activation to avoid force-navigation (which would invalidate session cookies).`,
        );
      }

      // Check if we are logged in
      const loginButton = await page.$('input[data-testid="sign-in-button"]');
      if (loginButton) {
        throw new Error(
          'GitLab cookies are invalid or expired. Please update cookies(4).txt with a fresh login session.',
        );
      }

      this.#log.info('Filling out the GitLab Trial Form...');

      // Fill Company Name (required). GitLab's trial form is Vue-controlled, so a
      // plain .type() into a mismatched selector silently no-ops and the form then
      // blocks submission client-side (no navigation) - the exact "clicked Activate
      // but billing still shows Try for free" failure. Try the known ids, then fall
      // back to locating the input by its "Company name" label, and set the value
      // via the native setter so Vue registers it.
      const companySelector =
        'input[id="company_name"], input[name="company_name"], [data-testid="company_name-field"], [data-testid="company-name-field"]';
      await page.waitForSelector(companySelector, { timeout: 15000 }).catch(() => {});
      const companyValue = `DuoPoolCorp-${Math.random().toString(36).substring(2, 6)}`;
      const companyFilled = await page.evaluate((val) => {
        const setVal = (el) => {
          if (!el) return false;
          const proto = Object.getPrototypeOf(el);
          const desc = Object.getOwnPropertyDescriptor(proto, 'value');
          if (desc && desc.set) desc.set.call(el, val);
          else el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return true;
        };
        let el = document.querySelector(
          'input[id="company_name"], input[name="company_name"], [data-testid="company_name-field"], [data-testid="company-name-field"]',
        );
        if (!el) {
          const lbl = Array.from(document.querySelectorAll('label')).find((l) =>
            /company name/i.test(l.textContent || ''),
          );
          if (lbl) {
            const forId = lbl.getAttribute('for');
            if (forId) el = document.getElementById(forId);
            if (!el) {
              const grp = lbl.closest('div');
              if (grp) el = grp.querySelector('input[type="text"], input:not([type])');
            }
          }
        }
        return setVal(el);
      }, companyValue);
      if (companyFilled) {
        this.#log.info('Filled company name field.');
      } else {
        this.#log.warn('Could not locate the company name field on the trial form.');
      }

      // Select Company Size (Employees)
      const employeesSelect = await page.$(
        'select[id="company_size"], select[name="company_size"], select[data-testid="company-size-dropdown"]',
      );
      if (employeesSelect) {
        await employeesSelect.select('1-99');
      }

      // Select Country/Region
      this.#log.info('Selecting Country/Region...');
      try {
        const dropdownSelector =
          '[data-testid="country-dropdown"] [data-testid="base-dropdown-toggle"], [data-testid="country-dropdown"] button';
        await page.waitForSelector(dropdownSelector, { timeout: 10000 });
        const trigger = await page.$(dropdownSelector);
        if (trigger) {
          await trigger.click();
          this.#log.info('Clicked country dropdown trigger. Waiting for search/list options...');

          // Wait for search input inside the dropdown to be visible
          const searchInputSelector =
            '[data-testid="country-dropdown"] [data-testid="listbox-search-input"], [data-testid="listbox-search-input"]';
          await page
            .waitForSelector(searchInputSelector, { visible: true, timeout: 5000 })
            .catch(() => {});
          const searchInput = await page.$(searchInputSelector);
          if (searchInput) {
            this.#log.info('Found search input inside country dropdown. Typing "India"...');
            await searchInput.click({ clickCount: 3 });
            await searchInput.type('India', { delay: 50 });
            await new Promise((r) => setTimeout(r, 1000));
          }

          const optionSelector = '[data-testid="listbox-item-IN"]';
          await page.waitForSelector(optionSelector, { visible: true, timeout: 5000 });
          const option = await page.$(optionSelector);
          if (option) {
            await option.click();
            this.#log.info('Successfully clicked India option.');
          } else {
            throw new Error('Could not find list option element for India.');
          }
        } else {
          throw new Error('Could not find country dropdown trigger.');
        }
      } catch (err) {
        this.#log.warn(
          `Robust country selection failed: ${err.message}. Trying direct/eval fallback...`,
        );
        try {
          await page.evaluate(() => {
            const btn = document.querySelector(
              '[data-testid="country-dropdown"] button, [data-testid="country-dropdown"] [data-testid="base-dropdown-toggle"]',
            );
            if (btn) btn.click();
          });
          await new Promise((r) => setTimeout(r, 1000));
          await page.evaluate(() => {
            const search = document.querySelector(
              '[data-testid="country-dropdown"] [data-testid="listbox-search-input"], [data-testid="listbox-search-input"]',
            );
            if (search) {
              search.value = 'India';
              search.dispatchEvent(new Event('input', { bubbles: true }));
              search.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
          await new Promise((r) => setTimeout(r, 1000));
          await page.evaluate(() => {
            const opt = document.querySelector('[data-testid="listbox-item-IN"]');
            if (opt) opt.click();
          });
        } catch (fError) {
          this.#log.warn(`Failsafe country select failed: ${fError.message}`);
        }
      }

      // Add a 2 second delay after country selection before activating
      this.#log.info(
        'Waiting 2 seconds for the "Activate my trial" button to refresh after country selection...',
      );
      await new Promise((r) => setTimeout(r, 2000));

      // FINAL ENSURE: the form blocks submission (client-side, no navigation) when a
      // required field is empty. Re-check Company name and Country, and re-select the
      // country via the listbox if it did not register, before we submit.
      const readCountrySet = () =>
        page.evaluate(() => {
          const toggle = document.querySelector(
            '[data-testid="country-dropdown"] [data-testid="base-dropdown-toggle"], [data-testid="country-dropdown"] button, [data-testid="country-dropdown"] [role="button"]',
          );
          const t = ((toggle && toggle.textContent) || '').toLowerCase().trim();
          return t.length > 0 && !t.includes('select a country');
        });
      let countryOk = await readCountrySet();
      if (!countryOk) {
        this.#log.warn('Country not registered after first pass; retrying country selection...');
        try {
          const trigger = await page.$(
            '[data-testid="country-dropdown"] [data-testid="base-dropdown-toggle"], [data-testid="country-dropdown"] button',
          );
          if (trigger) {
            await trigger.click();
            await new Promise((r) => setTimeout(r, 800));
            const search = await page.$(
              '[data-testid="country-dropdown"] [data-testid="listbox-search-input"], [data-testid="listbox-search-input"]',
            );
            if (search) {
              await search.click({ clickCount: 3 });
              await search.type('India', { delay: 40 });
              await new Promise((r) => setTimeout(r, 800));
            }
            const opt = await page.$('[data-testid="listbox-item-IN"]');
            if (opt) {
              await opt.click();
              await new Promise((r) => setTimeout(r, 500));
            }
          }
        } catch (e) {
          this.#log.warn(`Country retry failed: ${e.message}`);
        }
        countryOk = await readCountrySet();
      }
      const companyOk = await page.evaluate(() => {
        const el = document.querySelector(
          'input[id="company_name"], input[name="company_name"], [data-testid="company_name-field"], [data-testid="company-name-field"]',
        );
        return !!(el && el.value && el.value.trim().length > 0);
      });
      this.#log.info(
        `Trial form readiness -> company: ${companyOk ? 'set' : 'MISSING'}, country: ${countryOk ? 'set' : 'MISSING'}.`,
      );
      if (!companyOk || !countryOk) {
        throw new Error(
          `Trial form for '${groupPath}' is missing required field(s): ${[!companyOk ? 'company name' : null, !countryOk ? 'country' : null].filter(Boolean).join(', ')}. The form blocks submission until these are filled; the trial was NOT activated.`,
        );
      }

      // Check "I agree to the trial terms" checkbox (older form variants only).
      const agreementCheckbox = await page.$(
        'input[type="checkbox"][name="trial_agreement"], input[id="trial_agreement"]',
      );
      if (agreementCheckbox) {
        await page.evaluate((el) => el.click(), agreementCheckbox);
      }

      // Submit the trial form. The trial page can contain several
      // <button type="submit"> elements (nav search, etc.); blindly clicking the
      // first one clicks nothing useful and then stalls the whole flow on a 30s
      // navigation timeout (exactly the failure seen before, where the submit
      // never happened yet every later step was logged as "successful"). Match
      // the button by its visible action text and require that it is enabled.
      this.#log.info('Submitting trial form...');
      const clickTrialButton = async (labelRegexSource) => {
        return await page.evaluate((src) => {
          const re = new RegExp(src, 'i');
          const candidates = Array.from(
            document.querySelectorAll('button, input[type="submit"], a[role="button"]'),
          );
          const btn = candidates.find((b) => {
            const label = (b.textContent || b.value || '').trim();
            const disabled = b.disabled || b.getAttribute('aria-disabled') === 'true';
            const visible = b.getClientRects().length > 0;
            return re.test(label) && !disabled && visible;
          });
          if (btn) {
            btn.click();
            return (btn.textContent || btn.value || 'submit').trim();
          }
          return null;
        }, labelRegexSource);
      };

      const primaryLabels =
        'activate my trial|start a free trial|start free trial|start your free trial|start trial';
      let submittedLabel = await clickTrialButton(primaryLabels);
      if (!submittedLabel) {
        // Last resort: submit the first real form on the page.
        const formSubmitted = await page.evaluate(() => {
          const form = document.querySelector('form');
          if (!form) return false;
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
          else form.submit();
          return true;
        });
        if (!formSubmitted) {
          throw new Error(
            `Could not find a trial submit button ("Activate my trial"/"Continue") on the trial form for '${groupPath}'; the trial was NOT activated.`,
          );
        }
        submittedLabel = 'form.submit()';
      }
      this.#log.info(
        `Clicked trial submit control ('${submittedLabel}'). Waiting for the form to advance...`,
      );
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));

      // This trial form is single-step: with all required fields set, clicking
      // "Activate my trial" navigates away. If we're still on the trials form, the
      // submit was rejected by validation - surface the real reason and retry once
      // rather than blindly re-clicking (the old behavior that silently looped and
      // reported a phantom "second step").
      const stillOnForm = await page.evaluate(
        () =>
          /\/trials?\b/.test(location.pathname) ||
          !!document.querySelector(
            'input[id="company_name"], input[name="company_name"], [data-testid="country-dropdown"]',
          ),
      );
      if (stillOnForm) {
        const formError = await page.evaluate(() => {
          const err = document.querySelector(
            '.gl-alert-danger, [role="alert"], .invalid-feedback, .gl-field-error',
          );
          return err ? (err.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200) : '';
        });
        this.#log.warn(
          `Trial form still present after submit${formError ? ` (validation: "${formError}")` : ''}; retrying submit once.`,
        );
        await new Promise((r) => setTimeout(r, 1500));
        const retryLabel = await clickTrialButton('activate my trial');
        if (retryLabel) {
          await page
            .waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
            .catch(() => {});
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      // HONESTY GATE: confirm the trial actually activated before claiming
      // success or continuing to the Duo config / seat / namespace steps, all of
      // which silently no-op when there is no active trial.
      const trialActive = await this.#verifyTrialActive(page, groupPath);
      if (!trialActive) {
        throw new Error(
          `Trial submission for '${groupPath}' did not produce an active Ultimate/Duo trial (billing page shows no active trial). The trial was NOT activated; refusing to report success.`,
        );
      }
      this.#log.info(`Verified: group '${groupPath}' now has an active GitLab Ultimate/Duo trial.`);

      this.#log.info(
        'Trial activated. Navigating directly to Group GitLab Duo Configuration page...',
      );

      // 2. Navigate directly to Group Settings > GitLab Duo > Configuration
      const duoSettingsUrl = `https://gitlab.com/groups/${groupPath}/-/settings/gitlab_duo/configuration`;
      this.#log.info(`Navigating to GitLab Duo configuration: ${duoSettingsUrl}`);
      await page.goto(duoSettingsUrl, { waitUntil: 'networkidle2', timeout: 45000 });

      // Scroll to the very bottom
      this.#log.info('Scrolling to bottom of configuration page...');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise((r) => setTimeout(r, 1000));

      // Enable "Turn on experiment and beta GitLab Duo features" checkbox
      this.#log.info('Locating and toggling experiment and beta features checkbox...');
      const checkedResult = await page.evaluate(() => {
        // 1. Try direct ID first
        let labelSpan = document.getElementById('duo-experiment-checkbox-label');

        // 2. Fallback to text matching on label/span/p elements (avoiding high-level divs!)
        if (!labelSpan) {
          const textElements = Array.from(document.querySelectorAll('label, span, p, label *'));
          labelSpan = textElements.find((el) => {
            const txt = el.textContent.toLowerCase();
            return (
              txt.includes('turn on experiment and beta gitlab duo features') ||
              (txt.includes('turn on experiment') && txt.includes('beta gitlab duo'))
            );
          });
        }

        if (!labelSpan) {
          return { found: false, reason: 'Label element not found' };
        }

        // 3. Find the associated label and checkbox
        let labelElement = null;
        if (labelSpan.tagName === 'LABEL') {
          labelElement = labelSpan;
        } else {
          labelElement = labelSpan.closest('label');
        }

        let checkbox = null;
        if (labelElement && labelElement.htmlFor) {
          checkbox = document.getElementById(labelElement.htmlFor);
        }

        if (!checkbox && labelElement) {
          checkbox = labelElement.querySelector('input[type="checkbox"]');
        }

        if (!checkbox) {
          // If we couldn't find it via label, check the closest checkbox inside parent/siblings
          let current = labelSpan;
          for (let i = 0; i < 4; i++) {
            if (!current) break;
            checkbox = current.querySelector('input[type="checkbox"]');
            if (checkbox) break;
            const sib = current.parentNode?.querySelector('input[type="checkbox"]');
            if (sib) {
              checkbox = sib;
              break;
            }
            current = current.parentElement;
          }
        }

        // Last fallback: find input checkbox with matching attributes
        if (!checkbox) {
          const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
          checkbox = checkboxes.find((cb) => {
            const id = cb.id?.toLowerCase() || '';
            const name = cb.name?.toLowerCase() || '';
            if (
              id.includes('experiment') ||
              id.includes('beta') ||
              name.includes('experiment') ||
              name.includes('beta')
            ) {
              return true;
            }
            // Check if any associated label has the text
            const associatedLabel = document.querySelector(`label[for="${cb.id}"]`);
            if (associatedLabel) {
              const txt = associatedLabel.textContent.toLowerCase();
              return (
                txt.includes('turn on experiment and beta gitlab duo features') ||
                (txt.includes('turn on experiment') && txt.includes('beta gitlab duo'))
              );
            }
            return false;
          });
        }

        if (checkbox) {
          checkbox.setAttribute('data-target-experimental-checkbox', 'true');

          if (checkbox.checked) {
            return { found: true, alreadyChecked: true };
          }

          // Set target label to click
          let elementToClick = 'checkbox';
          if (labelElement) {
            labelElement.setAttribute('data-target-experimental-label', 'true');
            elementToClick = 'label';
          } else {
            const associatedLabel = document.querySelector(`label[for="${checkbox.id}"]`);
            if (associatedLabel) {
              associatedLabel.setAttribute('data-target-experimental-label', 'true');
              elementToClick = 'label';
            }
          }

          return {
            found: true,
            alreadyChecked: false,
            elementToClick,
            checkboxId: checkbox.id,
          };
        }

        return { found: false, reason: 'Checkbox not found' };
      });

      if (checkedResult.found && !checkedResult.alreadyChecked) {
        if (checkedResult.elementToClick === 'label') {
          this.#log.info('Clicking the experimental features label natively...');
          await page.click('[data-target-experimental-label="true"]').catch(() => {});
        } else {
          this.#log.info('Clicking the experimental features checkbox natively...');
          await page.click('[data-target-experimental-checkbox="true"]').catch(() => {});
        }

        // Wait a bit and verify
        await new Promise((r) => setTimeout(r, 1000));
        let isChecked = await page.evaluate(() => {
          const cb = document.querySelector('[data-target-experimental-checkbox="true"]');
          return cb ? cb.checked : false;
        });

        if (!isChecked) {
          this.#log.warn(
            'Checkbox was still not checked after native click. Simulating direct click on checkbox...',
          );
          await page.click('[data-target-experimental-checkbox="true"]').catch(() => {});
          await new Promise((r) => setTimeout(r, 1000));
          isChecked = await page.evaluate(() => {
            const cb = document.querySelector('[data-target-experimental-checkbox="true"]');
            return cb ? cb.checked : false;
          });
        }

        if (!isChecked) {
          this.#log.warn(
            'Checkbox was still not checked after direct click. Forcing state via JS and dispatching click/change events...',
          );
          await page.evaluate(() => {
            const cb = document.querySelector('[data-target-experimental-checkbox="true"]');
            if (cb) {
              cb.checked = true;
              cb.dispatchEvent(new Event('click', { bubbles: true }));
              cb.dispatchEvent(new Event('change', { bubbles: true }));
              cb.dispatchEvent(new Event('input', { bubbles: true }));
            }
          });
        } else {
          this.#log.info('Successfully verified checkbox is toggled ON.');
        }
      } else if (checkedResult.alreadyChecked) {
        this.#log.info('Experiment and beta features checkbox is already toggled ON.');
      } else {
        this.#log.warn(
          `Could not locate or toggle experiment and beta features checkbox. Reason: ${checkedResult.reason || 'Unknown'}`,
        );
      }

      // Save configurations
      this.#log.info('Locating save button...');
      let saveBtn = await page.$(
        'button[type="submit"], input[type="submit"], button[data-testid="save-duo-settings"]',
      );
      if (!saveBtn) {
        const foundBtn = await page.evaluateHandle(() => {
          const btns = Array.from(
            document.querySelectorAll('button, input[type="button"], input[type="submit"]'),
          );
          return btns.find(
            (b) =>
              b.textContent.toLowerCase().includes('save changes') ||
              (b.value && b.value.toLowerCase().includes('save changes')),
          );
        });
        if (foundBtn) {
          saveBtn = foundBtn.asElement();
        }
      }

      if (saveBtn) {
        // Fallback: Force enable the button in case it thinks nothing changed
        await page.evaluate((btn) => {
          btn.removeAttribute('disabled');
          btn.disabled = false;
        }, saveBtn);

        this.#log.info('Saving changes...');
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
          saveBtn.click(),
        ]);
      } else {
        this.#log.info('Attempting to click Save changes button via page evaluate...');
        const clicked = await page.evaluate(() => {
          const btns = Array.from(
            document.querySelectorAll('button, input[type="button"], input[type="submit"], a'),
          );
          const btn = btns.find((b) => {
            const txt = (b.textContent || b.value || '').toLowerCase();
            return txt.includes('save changes') || txt.includes('save') || txt.includes('submit');
          });
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        });
        if (clicked) {
          await page
            .waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 })
            .catch(() => {});
        } else {
          this.#log.warn('Could not locate save changes button. Trying form submit fallback...');
          await page.evaluate(() => {
            const form = document.querySelector('form');
            if (form) form.submit();
          });
          await page
            .waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 })
            .catch(() => {});
        }
      }

      this.#log.info(`GitLab Duo configurations successfully saved for group '${groupPath}'!`);

      // 2.5 Programmatic Seat Assignment for the Owner/Creator account
      try {
        await this.assignSeatToOwner(page, groupPath);
      } catch (seatErr) {
        this.#log.error(`Failed to assign seat to owner: ${seatErr.message}`);
      }

      // 3. Set as Default GitLab Duo Namespace in Preferences
      this.#log.info('Navigating to profile preferences to set default Duo namespace...');
      const prefUrl = 'https://gitlab.com/-/profile/preferences';
      await page.goto(prefUrl, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});

      let selectionSuccess = false;
      const maxPreferenceRetries = 4;
      for (let attempt = 1; attempt <= maxPreferenceRetries; attempt++) {
        if (attempt > 1) {
          this.#log.info(
            `Option not found yet. Sync might be in progress. Retrying attempt ${attempt}/${maxPreferenceRetries} (waiting 5s)...`,
          );
          await new Promise((r) => setTimeout(r, 5000));
          this.#log.info('Reloading preferences page...');
          await page.reload({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
        }

        const isSettingVisible = await page.evaluate(() => {
          return document.body.textContent.includes('Default GitLab Duo namespace');
        });

        if (isSettingVisible) {
          this.#log.info(
            'Duo namespace preferences dropdown is visible. Selecting the new group...',
          );
          await page.evaluate(() => {
            const select = document.querySelector('select#user_duo_default_namespace_id');
            if (select) {
              select.scrollIntoView({ block: 'center' });
              return;
            }
            const el = Array.from(document.querySelectorAll('*'))
              .reverse()
              .find((e) => e.textContent && e.textContent.includes('Default GitLab Duo namespace'));
            if (el) el.scrollIntoView({ block: 'center' });
          });
          await new Promise((r) => setTimeout(r, 1500));

          const selected = await page.evaluate(async (targetPath) => {
            // Robust selection: check native select element directly first
            const selectDirect = document.querySelector('select#user_duo_default_namespace_id');
            if (selectDirect) {
              const option = Array.from(selectDirect.options).find(
                (o) => o.text.includes(targetPath) || o.value.includes(targetPath),
              );
              if (option) {
                selectDirect.value = option.value;
                selectDirect.dispatchEvent(new Event('input', { bubbles: true }));
                selectDirect.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
            }

            // Fallback to container-based search
            const containers = Array.from(
              document.querySelectorAll('div, section, fieldset, li, tr'),
            );
            const container = containers.reverse().find((c) => {
              const text = c.textContent || '';
              return (
                text.includes('Default GitLab Duo namespace') &&
                c.querySelector('button, select, input')
              );
            });

            if (!container) return false;

            const select = container.querySelector('select');
            if (select) {
              const option = Array.from(select.options).find(
                (o) => o.text.includes(targetPath) || o.value.includes(targetPath),
              );
              if (option) {
                select.value = option.value;
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
            }

            const button = container.querySelector('button');
            if (button) {
              button.click();
              await new Promise((r) => setTimeout(r, 1500));

              const dropdownItems = Array.from(
                document.querySelectorAll(
                  '[role="option"], [data-testid="listbox-item"], [data-testid="listbox-item-text"], .gl-new-dropdown-item, .dropdown-item, li button, li a, [role="menuitem"]',
                ),
              );
              let targetItem = dropdownItems.find(
                (item) => item.textContent && item.textContent.trim().includes(targetPath),
              );

              if (!targetItem) {
                const activeMenus = Array.from(
                  document.querySelectorAll(
                    '[role="listbox"], [role="menu"], .dropdown-menu, .gl-new-dropdown',
                  ),
                );
                for (const menu of activeMenus) {
                  const clickables = Array.from(
                    menu.querySelectorAll('li, button, a, [role="option"], span'),
                  );
                  const found = clickables.find(
                    (item) => item.textContent && item.textContent.trim().includes(targetPath),
                  );
                  if (found) {
                    targetItem = found;
                    break;
                  }
                }
              }

              if (targetItem) {
                targetItem.click();
                return true;
              }
            }

            return false;
          }, groupPath);

          if (selected) {
            this.#log.info(
              `Successfully selected group '${groupPath}' as the default Duo namespace.`,
            );
            this.#log.info('Saving preferences...');
            await page.evaluate(() => {
              const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
              const saveBtn = btns.find((b) =>
                b.textContent.toLowerCase().includes('save changes'),
              );
              if (saveBtn) saveBtn.click();
            });
            await page
              .waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 })
              .catch(() => {});
            this.#log.info('Preferences successfully saved!');
            selectionSuccess = true;
            break;
          }
        } else {
          this.#log.info(
            'Default GitLab Duo namespace dropdown is not visible. This might be because only one group currently has Duo Trial.',
          );
        }
      }

      if (!selectionSuccess) {
        this.#log.warn(
          `Could not locate namespace option for '${groupPath}' in the dropdown after multiple attempts.`,
        );
      }
    } catch (error) {
      this.#log.error(`Error during browser automation: ${error.message}`);
      await page.screenshot({ path: ERROR_SCREENSHOT_PATH }).catch(() => {});
      throw error;
    } finally {
      await browser.close();
    }
  }

  /**
   * Reads a group's billing page and returns true only when it shows an active
   * Ultimate/Duo trial. Used as an honesty gate so trial activation never
   * reports success when GitLab did not actually start the trial.
   */
  async #verifyTrialActive(page, groupPath) {
    const billingsUrl = `https://gitlab.com/groups/${groupPath}/-/billings`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(billingsUrl, { waitUntil: 'networkidle2', timeout: 45000 });
      } catch (navErr) {
        this.#log.warn(
          `verifyTrialActive: could not load billing page for '${groupPath}' (attempt ${attempt}/3): ${navErr.message}`,
        );
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      const signal = await page.evaluate(() => {
        const text = (document.body.textContent || '').toLowerCase();
        const activeSignals = [
          'on a trial of gitlab ultimate',
          'your group is on a trial',
          'this trial ends on',
          'left in trial',
        ];
        const inactiveSignals = [
          'try for free',
          'start a free gitlab duo enterprise trial',
          'start a free trial of ultimate',
        ];
        return {
          active: activeSignals.some((s) => text.includes(s)),
          inactive: inactiveSignals.some((s) => text.includes(s)),
        };
      });

      if (signal.active) return true;
      this.#log.info(
        `verifyTrialActive: no active-trial signal yet for '${groupPath}' (attempt ${attempt}/3)${signal.inactive ? ' (billing page still shows "Try for free")' : ''}; waiting before recheck...`,
      );
      await new Promise((r) => setTimeout(r, 5000));
    }
    return false;
  }

  /**
   * Navigates to group settings, locates "Assign seats" button, types username, selects the option, and assigns a seat.
   */
  async assignSeatToOwner(page, groupPath) {
    this.#log.info(
      `Navigating to GitLab Duo settings page for group '${groupPath}' to assign seat...`,
    );
    const seatsUrl = `https://gitlab.com/groups/${groupPath}/-/settings/gitlab_duo`;
    await page.goto(seatsUrl, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});

    // Wait for the Vue page to load
    await new Promise((r) => setTimeout(r, 4000));

    // Click "Assign seats" button
    this.#log.info('Locating and clicking "Assign seats" button...');
    const clickedAssign = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a, span, div'));
      const btn = btns.find((b) => {
        const text = (b.textContent || '').toLowerCase().trim();
        return text === 'assign seats' || text === 'assign seat' || text.includes('assign seats');
      });
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (!clickedAssign) {
      this.#log.warn(
        'Could not find or click "Assign seats" button. Maybe seat is already assigned or page loaded differently.',
      );
      await page
        .screenshot({ path: `${ERROR_SCREENSHOT_PATH}_assign_seats_not_found.png` })
        .catch(() => {});
      return;
    }

    // Wait for the dropdown/modal search input to appear
    await new Promise((r) => setTimeout(r, 2000));

    // Focus and type "brbrchuigg"
    this.#log.info('Locating search input in assignment modal...');
    const focusedInput = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input[type="text"], input[type="search"], [role="searchbox"]'),
      );
      const visible = inputs.find((i) => {
        const rect = i.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (visible) {
        visible.focus();
        return true;
      }
      return false;
    });

    if (focusedInput) {
      this.#log.info('Typing username into search input...');
      await page.keyboard.type('brbrchuigg');
      await new Promise((r) => setTimeout(r, 2500)); // wait for search results to fetch

      // Select the user option from search results
      this.#log.info('Selecting user option matching "brbrchuigg"...');
      const clickedUser = await page.evaluate(() => {
        const items = Array.from(
          document.querySelectorAll('li, [role="option"], button, a, div, span'),
        );
        const userItem = items.find((item) => {
          const text = (item.textContent || '').toLowerCase();
          const rect = item.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          return isVisible && (text.includes('brbrchuigg') || text.includes('brbr chuigg'));
        });
        if (userItem) {
          userItem.click();
          return true;
        }
        return false;
      });

      if (clickedUser) {
        this.#log.info('User selected. Clicking Assign button to confirm...');
        await new Promise((r) => setTimeout(r, 1000));

        const confirmed = await page.evaluate(() => {
          const btns = Array.from(
            document.querySelectorAll('button, input[type="submit"], input[type="button"]'),
          );
          const confirmBtn = btns.find((b) => {
            const txt = (b.textContent || b.value || '').toLowerCase().trim();
            const rect = b.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0;
            return (
              isVisible &&
              (txt === 'assign' ||
                txt === 'assign seat' ||
                txt === 'assign seats' ||
                txt.includes('assign'))
            );
          });
          if (confirmBtn) {
            confirmBtn.click();
            return true;
          }
          return false;
        });

        if (confirmed) {
          this.#log.info('Seat assigned successfully!');
          await new Promise((r) => setTimeout(r, 3000)); // Wait for assignment to persist
        } else {
          this.#log.warn('Could not click confirmation assign button.');
        }
      } else {
        this.#log.warn('Could not find user option matching "brbrchuigg" in search results.');
      }
    } else {
      this.#log.warn('Could not find visible search input in the assign seats modal.');
    }

    await page
      .screenshot({ path: `${ERROR_SCREENSHOT_PATH}_seat_assignment_done.png` })
      .catch(() => {});
  }

  /**
   * Sets the default GitLab Duo namespace in profile preferences.
   */
  /**
   * Resolves the numeric namespace id for a group full path via GraphQL.
   */
  async getNamespaceNumericId(token, baseUrl, fullPath) {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const url = new URL('api/graphql', base);
    const query = 'query duoBridgeNsId($p: ID!) { group(fullPath: $p) { id } }';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'duo-bridge/0.1.0',
      },
      body: JSON.stringify({ query, variables: { p: fullPath } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const json = await res.json();
    if (json && json.errors && json.errors.length) {
      throw new Error(json.errors.map((e) => e.message).join('; '));
    }
    const gid = json && json.data && json.data.group ? json.data.group.id : null;
    if (!gid) return null;
    const mm = String(gid).match(/(\d+)\s*$/);
    return mm ? Number(mm[1]) : null;
  }

  /**
   * Sets the user's default Duo namespace via GraphQL (no browser, definitive).
   */
  async setDefaultDuoNamespaceViaGraphQL(token, baseUrl, numericId) {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const url = new URL('api/graphql', base);
    const query =
      'mutation duoBridgeSetNs($id: Int) { userPreferencesUpdate(input: { duoDefaultNamespaceId: $id }) { errors } }';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'duo-bridge/0.1.0',
      },
      body: JSON.stringify({ query, variables: { id: numericId } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const json = await res.json();
    if (json && json.errors && json.errors.length) {
      throw new Error(json.errors.map((e) => e.message).join('; '));
    }
    const errs =
      json && json.data && json.data.userPreferencesUpdate
        ? json.data.userPreferencesUpdate.errors
        : null;
    if (errs && errs.length) throw new Error(errs.join('; '));
    return true;
  }

  async setNamespacePreference(groupPath) {
    this.#log.info(
      `Starting browser automation to set Default GitLab Duo namespace to: ${groupPath}`,
    );
    let selectionSuccess = false;

    const cookies = parseNetscapeCookies(
      this.#config.cookiesPath || `${process.cwd()}/cookies.txt`,
    );
    this.#log.debug(`Loaded ${cookies.length} cookies for gitlab.com`);

    const browser = await launch({
      headless: this.#config.headless,
      humanize: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    if (typeof page.setViewport === 'function') {
      await page.setViewport({ width: 1280, height: 800 });
    } else if (typeof page.setViewportSize === 'function') {
      await page.setViewportSize({ width: 1280, height: 800 });
    }

    try {
      await page.setCookie(...cookies);

      const prefUrl = 'https://gitlab.com/-/profile/preferences';
      this.#log.info(`Navigating to profile preferences: ${prefUrl}`);
      await page.goto(prefUrl, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});

      const maxPreferenceRetries = 4;
      for (let attempt = 1; attempt <= maxPreferenceRetries; attempt++) {
        if (attempt > 1) {
          this.#log.info(
            `Option not found yet. Sync might be in progress. Retrying attempt ${attempt}/${maxPreferenceRetries} (waiting 5s)...`,
          );
          await new Promise((r) => setTimeout(r, 5000));
          this.#log.info('Reloading preferences page...');
          await page.reload({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
        }

        const isSettingVisible = await page.evaluate(() => {
          return document.body.textContent.includes('Default GitLab Duo namespace');
        });

        if (isSettingVisible) {
          this.#log.info(
            'Duo namespace preferences dropdown is visible. Selecting the new group...',
          );
          await page.evaluate(() => {
            const select = document.querySelector('select#user_duo_default_namespace_id');
            if (select) {
              select.scrollIntoView({ block: 'center' });
              return;
            }
            const el = Array.from(document.querySelectorAll('*'))
              .reverse()
              .find((e) => e.textContent && e.textContent.includes('Default GitLab Duo namespace'));
            if (el) el.scrollIntoView({ block: 'center' });
          });
          await new Promise((r) => setTimeout(r, 1500));

          const selected = await page.evaluate(async (targetPath) => {
            // Robust selection: check native select element directly first
            const selectDirect = document.querySelector('select#user_duo_default_namespace_id');
            if (selectDirect) {
              const option = Array.from(selectDirect.options).find(
                (o) => o.text.includes(targetPath) || o.value.includes(targetPath),
              );
              if (option) {
                selectDirect.value = option.value;
                selectDirect.dispatchEvent(new Event('input', { bubbles: true }));
                selectDirect.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
            }

            // Fallback to container-based search
            const containers = Array.from(
              document.querySelectorAll('div, section, fieldset, li, tr'),
            );
            const container = containers.reverse().find((c) => {
              const text = c.textContent || '';
              return (
                text.includes('Default GitLab Duo namespace') &&
                c.querySelector('button, select, input')
              );
            });

            if (!container) return false;

            const select = container.querySelector('select');
            if (select) {
              const option = Array.from(select.options).find(
                (o) => o.text.includes(targetPath) || o.value.includes(targetPath),
              );
              if (option) {
                select.value = option.value;
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
            }

            const button = container.querySelector('button');
            if (button) {
              button.click();
              await new Promise((r) => setTimeout(r, 1500));

              const dropdownItems = Array.from(
                document.querySelectorAll(
                  '[role="option"], [data-testid="listbox-item"], [data-testid="listbox-item-text"], .gl-new-dropdown-item, .dropdown-item, li button, li a, [role="menuitem"]',
                ),
              );
              let targetItem = dropdownItems.find(
                (item) => item.textContent && item.textContent.trim().includes(targetPath),
              );

              if (!targetItem) {
                const activeMenus = Array.from(
                  document.querySelectorAll(
                    '[role="listbox"], [role="menu"], .dropdown-menu, .gl-new-dropdown',
                  ),
                );
                for (const menu of activeMenus) {
                  const clickables = Array.from(
                    menu.querySelectorAll('li, button, a, [role="option"], span'),
                  );
                  const found = clickables.find(
                    (item) => item.textContent && item.textContent.trim().includes(targetPath),
                  );
                  if (found) {
                    targetItem = found;
                    break;
                  }
                }
              }

              if (targetItem) {
                targetItem.click();
                return true;
              }
            }

            return false;
          }, groupPath);

          if (selected) {
            this.#log.info(
              `Successfully selected group '${groupPath}' as the default Duo namespace.`,
            );
            this.#log.info('Saving preferences...');
            await page.evaluate(() => {
              const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
              const saveBtn = btns.find((b) =>
                b.textContent.toLowerCase().includes('save changes'),
              );
              if (saveBtn) saveBtn.click();
            });
            await page
              .waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 })
              .catch(() => {});
            this.#log.info('Preferences successfully saved!');
            selectionSuccess = true;
            break;
          }
        } else {
          this.#log.info(
            'Default GitLab Duo namespace dropdown is not visible. This might be because only one group currently has Duo Trial.',
          );
        }
      }

      if (!selectionSuccess) {
        this.#log.warn(
          `Could not locate namespace option for '${groupPath}' in the dropdown after multiple attempts.`,
        );
      }
    } catch (error) {
      this.#log.error(`Error during browser preference automation: ${error.message}`);
    } finally {
      await browser.close().catch(() => {});
    }
    // Never report success when the option was never found/selected. Throwing
    // lets ensureDefaultNamespace log an honest failure instead of pretending a
    // dead namespace was set (which is how a manually-deleted group silently
    // stayed 'active').
    if (!selectionSuccess) {
      throw new Error(
        `Could not set default Duo namespace to '${groupPath}' via preferences UI (option not found in dropdown).`,
      );
    }
    return true;
  }

  /**
   * Deletes a group immediately.
   * Tries REST API first. If that fails (e.g. 403 Forbidden), falls back to browser-based UI deletion!
   */
  async deleteGroupImmediately(groupId, groupPath, token, baseUrl) {
    try {
      const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

      // Step 1: Schedule the group for deletion (pending deletion)
      const urlSchedule = new URL(`api/v4/groups/${groupId}`, base);
      this.#log.info(`Scheduling group ${groupPath} (${groupId}) for deletion via API...`);
      let res = await fetch(urlSchedule, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'duo-bridge/0.1.0',
        },
      });

      if (res.ok || res.status === 404) {
        this.#log.info(
          `Group ${groupPath} successfully scheduled for deletion via API. Running browser-based permanent deletion to confirm...`,
        );
      } else {
        const text = await res.text().catch(() => '');
        this.#log.warn(
          `API deletion returned non-2xx (${res.status}): ${text}. Falling back to browser-based deletion...`,
        );
      }
    } catch (apiError) {
      this.#log.warn(
        `API deletion encountered network error: ${apiError.message}. Falling back to browser-based deletion...`,
      );
    }

    // Always run the definitive browser-based deletion to permanently expunge and verify it's gone
    await this.deleteGroupViaBrowser(groupId, groupPath);
  }

  /**
   * Deletes a group via browser UI clicks using your session.
   */
  async deleteGroupViaBrowser(groupId, groupPath) {
    this.#log.info(`Deleting group '${groupPath}' via browser UI automation...`);
    const cookies = parseNetscapeCookies(
      this.#config.cookiesPath || `${process.cwd()}/cookies.txt`,
    );

    const browser = await launch({
      headless: this.#config.headless,
      humanize: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    if (typeof page.setViewport === 'function') {
      await page.setViewport({ width: 1280, height: 800 });
    } else if (typeof page.setViewportSize === 'function') {
      await page.setViewportSize({ width: 1280, height: 800 });
    }

    try {
      await page.setCookie(...cookies);

      // Navigate to Group General Settings page
      const editUrl = `https://gitlab.com/groups/${groupPath}/-/edit`;
      this.#log.info(`Navigating to Group Settings edit page: ${editUrl}`);
      const editNavResponse = await page
        .goto(editUrl, { waitUntil: 'networkidle2', timeout: 30000 })
        .catch(() => null);

      if (editNavResponse && editNavResponse.status() !== 404) {
        // Click "Advanced" expand button if general settings sections are collapsed
        await page.evaluate(() => {
          const expandBtns = Array.from(document.querySelectorAll('button'));
          const advancedBtn = expandBtns.find(
            (b) =>
              b.textContent.toLowerCase().includes('expand') &&
              b.closest('#js-general-settings-section'),
          );
          if (advancedBtn) advancedBtn.click();
        });

        // Click the Delete Group button
        const deleteSelector =
          'button[data-testid="remove-group-button"], button[id="delete-group-button"]';
        const deleteBtn = await page
          .waitForSelector(deleteSelector, { timeout: 10000 })
          .catch(() => null);
        if (deleteBtn) {
          await deleteBtn.click();

          // Confirm Deletion in the modal
          const nameConfirmationInput =
            'input[id="confirm_name_input"], input[data-testid="confirm-name-input"]';
          await page.waitForSelector(nameConfirmationInput, { timeout: 5000 }).catch(() => {});
          const confirmInput = await page.$(nameConfirmationInput);
          if (confirmInput) {
            await confirmInput.type(groupPath);
          }

          // Click confirm button inside the deletion modal
          const confirmBtnSelector =
            'button[data-testid="confirm-remove-group-button"], button[id="confirm-delete-button"]';
          const confirmBtn = await page.$(confirmBtnSelector);
          if (confirmBtn) {
            this.#log.info('Confirming deletion inside modal...');
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
              confirmBtn.click(),
            ]);
          }
        }
      }

      this.#log.info(
        `Group '${groupPath}' successfully scheduled for deletion. Moving to permanent inactive deletion...`,
      );

      // Wait a few seconds for scheduling/renaming to settle
      await new Promise((r) => setTimeout(r, 5000));

      // Navigate to inactive groups dashboard to permanently delete it
      this.#log.info('Navigating to inactive groups dashboard to permanently delete...');
      await page.goto('https://gitlab.com/dashboard/groups/inactive', {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      // Let's wait a moment for the list to load
      await page
        .waitForSelector('ul, [data-testid="group-list-item"], .group-row, .gl-card', {
          timeout: 15000,
        })
        .catch(() => {});

      this.#log.info('Dynamically locating the deletion scheduled row and its actual path...');
      const matchResult = await page.evaluate((gPath) => {
        const searchStr = `${gPath}-deletion_scheduled-`;
        const items = Array.from(
          document.querySelectorAll('li, [data-testid="group-list-item"], .group-row'),
        );
        for (const item of items) {
          const text = item.textContent || '';
          if (text.includes(searchStr)) {
            const links = Array.from(item.querySelectorAll('a'));
            let resolvedPath = '';
            for (const link of links) {
              const linkText = link.textContent?.trim() || '';
              if (linkText.includes(searchStr)) {
                resolvedPath = linkText;
                break;
              }
            }
            if (!resolvedPath) {
              const regex = new RegExp(`${gPath}-deletion_scheduled-\\d+`);
              const match = text.match(regex);
              if (match) {
                resolvedPath = match[0];
              }
            }
            if (!resolvedPath) {
              resolvedPath = text.split(/\s+/).find((w) => w.includes(searchStr)) || '';
            }

            resolvedPath = resolvedPath.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9_\-]+$/g, '');

            if (resolvedPath) {
              const button = (function () {
                // The row's actions kebab (⋮) is the TRAILING dropdown toggle, not
                // the first button in the row (that is the subgroup-expand caret).
                // The old selector matched plain `button` too, so querySelector
                // returned the FIRST button and we clicked the caret — the actions
                // menu never opened and 'Delete permanently' never appeared.
                const preferred = item.querySelector(
                  '[data-testid="groups-list-item-actions"] [data-testid="base-dropdown-toggle"], [data-testid="group-actions-dropdown"], [data-testid="groups-projects-more-actions-dropdown"], button[aria-label="More actions"], button[aria-label*="actions" i]',
                );
                if (preferred) return preferred;
                const toggles = Array.from(
                  item.querySelectorAll(
                    '[data-testid="base-dropdown-toggle"], button.dropdown-toggle, button[aria-haspopup="true"], button[aria-haspopup="menu"]',
                  ),
                );
                if (toggles.length) return toggles[toggles.length - 1];
                const rowButtons = Array.from(item.querySelectorAll('button'));
                return rowButtons.length ? rowButtons[rowButtons.length - 1] : null;
              })();
              if (button) {
                button.setAttribute('data-target-delete-btn', 'true');
                return { success: true, resolvedPath };
              }
            }
          }
        }
        return { success: false };
      }, groupPath);

      if (!matchResult.success) {
        throw new Error(
          `Could not find deletion-scheduled group row matching prefix: ${groupPath}-deletion_scheduled-`,
        );
      }

      const { resolvedPath } = matchResult;
      this.#log.info(`Found scheduled group path: '${resolvedPath}'`);

      // Open the row actions menu and drive the confirmation modal robustly
      // (retries the menu, matches every Pajamas modal variant).
      await this.#performDeletePermanently(page, resolvedPath);

      // 5. Deletion is usually an XHR + list re-render, NOT a navigation.
      // Wait for the row to disappear instead of waitForNavigation.
      this.#log.info('Waiting for the group row to disappear from the list...');
      await page
        .waitForSelector(`::-p-text(${resolvedPath})`, { hidden: true, timeout: 30000 })
        .catch(() => {});

      const stillExists = await page.$(`::-p-text(${resolvedPath})`);
      if (stillExists) {
        const deletionInProgress = await page.evaluate((path) => {
          const row = Array.from(
            document.querySelectorAll('li, [data-testid="group-list-item"], .group-row'),
          ).find((r) => r.textContent.includes(path));
          return row ? row.textContent.toLowerCase().includes('deletion in progress') : false;
        }, resolvedPath);

        if (deletionInProgress) {
          this.#log.info(
            `Group permanent deletion is successfully initiated ('Deletion in progress' badge is active).`,
          );
        } else {
          throw new Error(
            'Group is still present in inactive groups list — permanent deletion did not complete.',
          );
        }
      }

      this.#log.info(`Group '${groupPath}' permanently deleted successfully.`);
    } catch (error) {
      this.#log.error(`Error during browser-based group deletion fallback: ${error.message}`);
      await page.screenshot({ path: ERROR_SCREENSHOT_PATH }).catch(() => {});
      throw error;
    } finally {
      await browser.close();
    }
  }

  /**
   * Opens a marked row's actions menu and drives GitLab's "Delete permanently"
   * confirmation modal to completion. Resilient to body-portal dropdowns, the
   * several Pajamas modal variants, and menus that close without opening the
   * modal on the first click. Throws if the modal never appears so callers can
   * decide whether to skip or retry. The row must already be marked with
   * `data-target-delete-btn="true"` on its actions button.
   */
  /**
   * Enumerates every plausible actions toggle in the marked inactive-dashboard
   * row and clicks each until GitLab's "Delete permanently" item becomes
   * visible. Returns a handle to that item, or null if none of the toggles
   * revealed it. Replaces the previous single-guessed-selector approach that
   * kept clicking the wrong control (the subgroup-expand caret).
   */
  async #openRowActionsMenuThenFindDelete(page) {
    // v0.8.4.2: try the CONFIRMED inactive-dashboard kebab first before enumerating.
    // Anchor from gitlab-scrape-20260706/reports/inactive-delete-row-elements.json:
    //   <div data-testid="groups-list-item-actions"> <button data-testid="base-dropdown-toggle">Actions</button>
    // Menu item renders in body-portal panel [data-testid="base-dropdown-menu"] as
    //   <li data-testid="disclosure-dropdown-item"> <button> Delete permanently </button>
    const hasConfirmed = await page.evaluate(() => {
      document
        .querySelectorAll('[data-confirmed-kebab]')
        .forEach((e) => e.removeAttribute('data-confirmed-kebab'));
      document
        .querySelectorAll('[data-delete-item]')
        .forEach((e) => e.removeAttribute('data-delete-item'));
      const marked = document.querySelector('[data-target-delete-btn="true"]');
      const row =
        marked &&
        marked.closest(
          'li[data-testid^="groups-list-item-"], li, [data-testid="group-list-item"], .group-row, tr',
        );
      if (!row) return false;
      const kebab = row.querySelector(
        '[data-testid="groups-list-item-actions"] [data-testid="base-dropdown-toggle"]',
      );
      if (!kebab) return false;
      kebab.setAttribute('data-confirmed-kebab', 'true');
      return true;
    });
    if (hasConfirmed) {
      const kebab = await page.$('[data-confirmed-kebab="true"]');
      if (kebab) {
        await kebab.click().catch(() => {});
        await new Promise((r) => setTimeout(r, 900));
        const gotItem = await page.evaluate(() => {
          const scope = document.querySelectorAll(
            '[data-testid="base-dropdown-menu"] [data-testid="disclosure-dropdown-item"]',
          );
          const pool = scope.length
            ? Array.from(scope)
            : Array.from(document.querySelectorAll('[data-testid="disclosure-dropdown-item"]'));
          const el = pool.find(
            (e) =>
              /^\s*delete\s+permanently\s*$/i.test(e.textContent || '') &&
              (e.offsetWidth || e.offsetHeight || e.getClientRects().length),
          );
          if (!el) return false;
          const inner = el.querySelector('button, a') || el;
          inner.setAttribute('data-delete-item', 'true');
          return true;
        });
        if (gotItem) return await page.$('[data-delete-item="true"]');
        await page.keyboard.press('Escape').catch(() => {});
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // Fallback (v0.8.4.1 behaviour): enumerate every plausible actions toggle
    // in the row and click each until "Delete permanently" appears.
    const count = await page.evaluate(() => {
      document
        .querySelectorAll('[data-menu-cand]')
        .forEach((e) => e.removeAttribute('data-menu-cand'));
      document
        .querySelectorAll('[data-delete-item]')
        .forEach((e) => e.removeAttribute('data-delete-item'));
      const marked = document.querySelector('[data-target-delete-btn="true"]');
      const row =
        marked &&
        marked.closest(
          'li[data-testid^="groups-list-item-"], li, [data-testid="group-list-item"], .group-row, tr',
        );
      if (!row) return 0;
      const seen = new Set();
      const cands = [];
      const push = (el) => {
        if (el && !seen.has(el)) {
          seen.add(el);
          cands.push(el);
        }
      };
      row
        .querySelectorAll(
          '[data-testid="groups-list-item-actions"] [data-testid="base-dropdown-toggle"], [data-testid="group-actions-dropdown"], [data-testid="groups-projects-more-actions-dropdown"], button[aria-label*="actions" i], button[aria-haspopup], [data-testid="base-dropdown-toggle"], button.dropdown-toggle',
        )
        .forEach(push);
      // Trailing buttons last, reversed so the kebab (far right) is tried first.
      Array.from(row.querySelectorAll('button')).reverse().forEach(push);
      cands.forEach((el, i) => el.setAttribute('data-menu-cand', String(i)));
      return cands.length;
    });
    for (let i = 0; i < count; i++) {
      const handle = await page.$(`[data-menu-cand="${i}"]`);
      if (!handle) continue;
      await handle.click().catch(() => {});
      await new Promise((r) => setTimeout(r, 1200));
      const found = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll(
            'a, button, [role="menuitem"], [data-testid="disclosure-dropdown-item"], .gl-new-dropdown-item, .dropdown-item',
          ),
        );
        const el = els.find(
          (e) =>
            /delete\s+permanently/i.test(e.textContent || '') &&
            (e.offsetWidth || e.offsetHeight || e.getClientRects().length),
        );
        if (el) {
          el.setAttribute('data-delete-item', 'true');
          return true;
        }
        return false;
      });
      if (found) return await page.$('[data-delete-item="true"]');
      await page.keyboard.press('Escape').catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
    }
    return null;
  }

  async #performDeletePermanently(page, resolvedPath) {
    // Match any tag (some GitLab versions render the kebab toggle as a non-button element).
    const menuBtn = '[data-target-delete-btn="true"]';
    // GitLab has shipped several modal shells over versions; match them all.
    // v0.8.4.2: confirmed body-portal modal first (from menus/inactive-delete-confirm_permanently_modal.html):
    //   <div id="delete-modal-XX" role="dialog" aria-modal="true" class="modal fade show gl-block gl-modal">
    const modalSelector =
      'div[id^="delete-modal-"][role="dialog"][aria-modal="true"], div[role="dialog"][aria-modal="true"].gl-modal, [role="dialog"], .gl-modal, .modal.show, [data-testid="delete-modal"], [data-testid="remove-group-modal"], [data-testid="confirm-danger-modal"], [data-testid="confirm-delete-modal"]';

    // Dismiss any stray overlay left open by a previous iteration.
    await page.keyboard.press('Escape').catch(() => {});
    await new Promise((r) => setTimeout(r, 200));

    // One-time rich DOM diagnostics: my sandbox has no live GitLab, so if the
    // menu still won't open this dumps the exact row markup + menu contents so a
    // single real run reveals the precise selector to target.
    const dumpDiagnostics = async (label) => {
      try {
        const info = await page.evaluate(() => {
          const trunc = (s, n) =>
            String(s == null ? '' : s)
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, n);
          const describe = (el) =>
            el
              ? {
                  tag: el.tagName,
                  testid: el.getAttribute('data-testid'),
                  aria: el.getAttribute('aria-label'),
                  haspopup: el.getAttribute('aria-haspopup'),
                  expanded: el.getAttribute('aria-expanded'),
                  cls: trunc(el.getAttribute('class'), 80),
                  text: trunc(el.textContent, 40),
                }
              : null;
          const marked = document.querySelector('[data-target-delete-btn="true"]');
          const row =
            marked && marked.closest('li, [data-testid="group-list-item"], .group-row, tr');
          const deleteEls = Array.from(
            document.querySelectorAll(
              'a, button, [role="menuitem"], [data-testid="disclosure-dropdown-item"], span, li',
            ),
          )
            .filter((e) => /delete/i.test(e.textContent || ''))
            .slice(0, 8)
            .map((e) => ({
              tag: e.tagName,
              testid: e.getAttribute('data-testid'),
              text: trunc(e.textContent, 40),
              vis: !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length),
            }));
          const openMenus = Array.from(
            document.querySelectorAll(
              '[data-testid="base-dropdown-menu"], [role="menu"], .gl-new-dropdown-panel, .dropdown-menu.show',
            ),
          )
            .slice(0, 3)
            .map((m) => trunc(m.textContent, 160));
          return {
            marked: describe(marked),
            rowButtons: row
              ? Array.from(row.querySelectorAll('button, a[role="button"], [data-testid]'))
                  .slice(0, 25)
                  .map(describe)
              : null,
            rowHtml: row ? trunc(row.outerHTML, 2000) : '(row not found)',
            deleteEls,
            openMenus,
          };
        });
        this.#log.warn(`[delete-diagnostics ${label}] ${JSON.stringify(info)}`);
      } catch (e) {
        this.#log.warn(`[delete-diagnostics ${label}] failed: ${e.message}`);
      }
    };

    let dialog = null;
    for (let attempt = 1; attempt <= 3 && !dialog; attempt++) {
      if (attempt === 1) await dumpDiagnostics('before-open');
      // Try every plausible actions toggle in the row until "Delete permanently"
      // shows, rather than betting on a single selector.
      const item = await this.#openRowActionsMenuThenFindDelete(page);
      if (!item) {
        if (attempt === 1) await dumpDiagnostics('after-open-fail');
        this.#log.warn(
          `"Delete permanently" menu item not visible (attempt ${attempt}/3); retrying...`,
        );
        await page.keyboard.press('Escape').catch(() => {});
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      await new Promise((r) => setTimeout(r, 250));
      await item.click().catch(() => {});

      dialog = await page
        .waitForSelector(modalSelector, { visible: true, timeout: 8000 })
        .catch(() => null);
      if (!dialog) {
        this.#log.warn(`Confirmation modal did not appear (attempt ${attempt}/3); retrying...`);
        await page.keyboard.press('Escape').catch(() => {});
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    if (!dialog) {
      throw new Error('confirmation modal never appeared after 3 attempts');
    }

    // Type the confirmation path into the modal's text input (scoped to the
    // dialog so we never grab a page-level search box).
    // v0.8.4.2: confirmed path input first (data-testid="confirm-name-field" / #confirm_name_input).
    const input = await dialog.waitForSelector(
      'input[data-testid="confirm-name-field"], input#confirm_name_input, input[type="text"], input:not([type]), input[type="search"]',
      { visible: true, timeout: 8000 },
    );
    await input.click({ clickCount: 3 });
    await input.type(resolvedPath, { delay: 10 });
    this.#log.info(`Typed confirmation text: ${resolvedPath}`);

    // Tick the acknowledgement checkbox if the modal has one.
    // v0.8.4.2: confirmed acknowledgement checkbox (single .custom-control-input in .gl-form-checkbox).
    const checkbox = await dialog.$(
      '.gl-form-checkbox input[type="checkbox"], input[type="checkbox"].custom-control-input, input[type="checkbox"]',
    );
    if (checkbox && !(await checkbox.evaluate((c) => c.checked))) {
      await checkbox.click();
    }
    await new Promise((r) => setTimeout(r, 500));

    // Confirm — prefer an enabled button scoped to the dialog; fall back to text.
    this.#log.info('Submitting final permanent deletion form...');
    const confirmed = await dialog.evaluate((el) => {
      // v0.8.4.2: prefer confirmed [data-testid="confirm-delete-button"] first (the red "Yes, delete group").
      const testid = el.querySelector('button[data-testid="confirm-delete-button"]');
      if (testid && !testid.disabled) {
        testid.click();
        return true;
      }
      const btns = Array.from(el.querySelectorAll('button'));
      const target = btns.find(
        (b) =>
          /yes, *delete|delete group|delete project|delete container|confirm/i.test(
            b.textContent || '',
          ) && !b.disabled,
      );
      if (target) {
        target.click();
        return true;
      }
      return false;
    });
    if (!confirmed) {
      await page
        .locator(
          '::-p-text(Yes, delete group), ::-p-text(Yes, delete container), ::-p-text(Confirm)',
        )
        .click()
        .catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  /**
   * Sweeps the inactive groups dashboard and permanently deletes all duo-pool scheduled deletion groups.
   */
  async cleanUpAllInactiveGroups() {
    this.#log.info('Starting a thorough sweep of inactive groups for permanent cleanup...');
    const cookies = parseNetscapeCookies(
      this.#config.cookiesPath || `${process.cwd()}/cookies.txt`,
    );

    const browser = await launch({
      headless: this.#config.headless,
      humanize: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    if (typeof page.setViewport === 'function') {
      await page.setViewport({ width: 1280, height: 800 });
    } else if (typeof page.setViewportSize === 'function') {
      await page.setViewportSize({ width: 1280, height: 800 });
    }

    try {
      await page.setCookie(...cookies);

      this.#log.info(
        'Navigating to inactive groups dashboard: https://gitlab.com/dashboard/groups/inactive',
      );
      await page.goto('https://gitlab.com/dashboard/groups/inactive', {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      // Guard against reprocessing the same row forever if a deletion silently
      // fails to remove it from the list.
      const attempted = new Set();
      for (;;) {
        await page
          .waitForSelector('ul, [data-testid="group-list-item"], .group-row, .gl-card', {
            timeout: 15000,
          })
          .catch(() => {});

        this.#log.info('Scanning for any pending deletion duo-pool groups...');
        const matchResult = await page.evaluate(() => {
          const items = Array.from(
            document.querySelectorAll('li, [data-testid="group-list-item"], .group-row'),
          );
          for (const item of items) {
            const text = item.textContent || '';
            if (text.includes('duo-pool-') && text.includes('deletion_scheduled-')) {
              const links = Array.from(item.querySelectorAll('a'));
              let resolvedPath = '';
              for (const link of links) {
                const linkText = link.textContent?.trim() || '';
                if (linkText.includes('duo-pool-') && linkText.includes('deletion_scheduled-')) {
                  resolvedPath = linkText;
                  break;
                }
              }
              if (!resolvedPath) {
                const regex = /duo-pool-[a-zA-Z0-9_\-]+-deletion_scheduled-\d+/;
                const match = text.match(regex);
                if (match) {
                  resolvedPath = match[0];
                }
              }
              if (!resolvedPath) {
                resolvedPath =
                  text
                    .split(/\s+/)
                    .find((w) => w.includes('duo-pool-') && w.includes('deletion_scheduled-')) ||
                  '';
              }

              resolvedPath = resolvedPath.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9_\-]+$/g, '');

              if (resolvedPath) {
                const button = (function () {
                  // The row's actions kebab (⋮) is the TRAILING dropdown toggle, not
                  // the first button in the row (that is the subgroup-expand caret).
                  // The old selector matched plain `button` too, so querySelector
                  // returned the FIRST button and we clicked the caret — the actions
                  // menu never opened and 'Delete permanently' never appeared.
                  const preferred = item.querySelector(
                    '[data-testid="groups-list-item-actions"] [data-testid="base-dropdown-toggle"], [data-testid="group-actions-dropdown"], [data-testid="groups-projects-more-actions-dropdown"], button[aria-label="More actions"], button[aria-label*="actions" i]',
                  );
                  if (preferred) return preferred;
                  const toggles = Array.from(
                    item.querySelectorAll(
                      '[data-testid="base-dropdown-toggle"], button.dropdown-toggle, button[aria-haspopup="true"], button[aria-haspopup="menu"]',
                    ),
                  );
                  if (toggles.length) return toggles[toggles.length - 1];
                  const rowButtons = Array.from(item.querySelectorAll('button'));
                  return rowButtons.length ? rowButtons[rowButtons.length - 1] : null;
                })();
                if (button) {
                  button.setAttribute('data-target-delete-btn', 'true');
                  return { found: true, resolvedPath };
                }
              }
            }
          }
          return { found: false };
        });

        if (!matchResult.found) {
          this.#log.info('No remaining duo-pool pending deletion groups found in sweep.');
          break;
        }

        const { resolvedPath } = matchResult;
        if (attempted.has(resolvedPath)) {
          this.#log.warn(
            `Already attempted deletion of '${resolvedPath}' once this sweep; stopping to avoid a loop. It will be retried on the next sweep run.`,
          );
          break;
        }
        attempted.add(resolvedPath);
        this.#log.info(`Sweeping/Deleting pending deletion group: '${resolvedPath}'`);

        // Isolate each deletion: one failed modal must not abort the whole sweep.
        try {
          await this.#performDeletePermanently(page, resolvedPath);
          // Wait for row to disappear
          await page
            .waitForSelector(`::-p-text(${resolvedPath})`, { hidden: true, timeout: 30000 })
            .catch(() => {});
        } catch (delErr) {
          this.#log.warn(
            `Permanent deletion of '${resolvedPath}' failed this pass (${delErr.message}); continuing sweep.`,
          );
        }

        await new Promise((r) => setTimeout(r, 3000));
        await page.goto('https://gitlab.com/dashboard/groups/inactive', {
          waitUntil: 'networkidle2',
          timeout: 60000,
        });
      }
    } catch (error) {
      this.#log.error(`Sweep failed with error: ${error.message}`);
      await page.screenshot({ path: ERROR_SCREENSHOT_PATH }).catch(() => {});
    } finally {
      await browser.close().catch(() => {});
    }
  }
}
