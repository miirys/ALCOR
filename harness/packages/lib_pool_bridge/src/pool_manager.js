import fs from 'node:fs';
import { GitLabAutomator } from './gitlab_automation.js';

export class GroupPoolManager {
  #config;
  #log;
  #automator;
  #statePath;
  #state = null;
  #isRotating = false;
  #isEnsuringStandby = false;
  #isReconciling = false;
  #lastSetNamespaceId = null;
  // Last credentials provider seen on any entry point, so methods that take no
  // creds arg (e.g. pickReadyStandby) can still act.
  #credentialsProvider = null;
  // The credit ledger is the SINGLE SOURCE OF TRUTH for group fundedness — it
  // tracks per-group usage locally and persists it across restarts. The pool
  // never scrapes GitLab or queries a balance field; it reads ledger snapshots.
  #ledger = null;

  constructor(config, log) {
    this.#config = config;
    this.#log = log;
    // Allow an injected automator (used by tests to stub group ops without a
    // browser); default to the real cloakbrowser-backed one.
    this.#automator = config.automator || new GitLabAutomator(config, log);
    this.#statePath = config.groupsPoolPath || `${process.cwd()}/groups_pool.json`;
    this.#ledger = config.ledger || null;
    // Optional pre-loaded state (used by tests to seed the pool without going
    // through init()/file discovery). Real boot leaves this null and loads from
    // #statePath via init().
    this.#state = config.initialState || null;
  }

  /** Wire the credit ledger (source of truth for fundedness) after construction. */
  setLedger(ledger) {
    this.#ledger = ledger;
  }

  // --- fundedness, read from the ledger (never scraped) --------------------

  /** True when the ledger has marked this group exhausted (threshold or 402). */
  #isExhausted(groupId) {
    return this.#ledger?.getSnapshot?.(groupId)?.exhausted === true;
  }

  /**
   * A group is funded when the ledger has NOT exhausted it AND either has no
   * snapshot for it (adopted / no local history => assume funded) or its local
   * usage is still below the ledger's own threshold (21.6 of 24). Uses the
   * ledger's own creditsCap/thresholdCredits — nothing hardcoded here.
   */
  #isFunded(groupId) {
    if (this.#isExhausted(groupId)) return false;
    const snap = this.#ledger?.getSnapshot?.(groupId);
    if (!snap) return true; // unknown/adopted => assume funded
    return snap.creditsUsed < snap.thresholdCredits;
  }

  async init(credentialsProvider) {
    this.#credentialsProvider = credentialsProvider || this.#credentialsProvider;
    this.#load();

    // First, adopt any already-existing duo-pool-* groups on the account so we
    // reuse them instead of trying to create new ones (which fails at the group limit).
    try {
      await this.discoverAndAdoptGroups(credentialsProvider);
    } catch (err) {
      this.#log.warn(`Group discovery on init failed: ${err.message}`);
    }

    // If there is no active group, or the list is completely empty, initialize the first group!
    const active = this.getActiveGroup();
    if (!active) {
      this.#log.info('No active group found in the pool. Initializing the first group...');
      await this.rotateGroup(credentialsProvider);
    }

    // Make sure the user's default Duo namespace points at the active group so
    // direct-access tokens are billed to the right namespace.
    try {
      await this.ensureDefaultNamespace(credentialsProvider);
    } catch (err) {
      this.#log.error(`Failed to set default Duo namespace on init: ${err.message}`);
    }

    // Run background tasks sequentially to prevent Puppeteer resource clashing
    (async () => {
      try {
        await this.ensureStandbyGroups(credentialsProvider);
      } catch (err) {
        this.#log.error(`Failed to pre-populate standby groups on init: ${err.message}`);
      }
      // NOTE: no separate post-create sweep here anymore. ensureStandbyGroups()
      // now runs the inactive-groups sweep BEFORE it creates any group, so
      // pending-deletion groups (which still count against the account group
      // limit) are purged first and creation never hits the cap.
    })();
  }

  getActiveGroup() {
    if (!this.#state || !this.#state.groups) return null;
    return (
      this.#state.groups.find(
        (g) => g.id === this.#state.currentActiveId && g.status === 'active',
      ) || null
    );
  }

  /**
   * Ensures the user's default GitLab Duo namespace points at the current
   * active pool group. This is the namespace GitLab bills direct-access tokens
   * to, so it MUST match the active group or requests fail 402
   * USAGE_QUOTA_EXCEEDED against the wrong namespace.
   *
   * Preferred path: GraphQL userPreferencesUpdate(duoDefaultNamespaceId) -
   * cheap, headless, and never touches the browser (so it cannot invalidate
   * cookies). Falls back to the preferences-page browser automation only if the
   * GraphQL mutation is unavailable.
   */
  async ensureDefaultNamespace(credentialsProvider) {
    const active = this.getActiveGroup();
    if (!active || !active.path) {
      this.#log.warn('ensureDefaultNamespace: no active group; skipping.');
      return false;
    }
    const groupPath = active.path;

    let token = null;
    let baseUrl = null;
    try {
      ({ token, baseUrl } = await credentialsProvider.getCredentials());
    } catch (err) {
      this.#log.warn(`ensureDefaultNamespace: could not load credentials (${err.message}).`);
    }

    // Preferred: set the default namespace via GraphQL (no browser, definitive).
    if (token && baseUrl) {
      try {
        let numericId = active.numericId || null;
        if (!numericId) {
          numericId = await this.#automator.getNamespaceNumericId(token, baseUrl, groupPath);
          if (numericId) {
            active.numericId = numericId;
            this.#save();
          }
        }
        if (numericId) {
          await this.#automator.setDefaultDuoNamespaceViaGraphQL(token, baseUrl, numericId);
          this.#log.info(
            `Default Duo namespace set to '${groupPath}' (id ${numericId}) via GraphQL.`,
          );
          // Only wait when the namespace actually CHANGED. GitLab's AI gateway
          // needs a moment to propagate a default-namespace change before it
          // will bill direct-access tokens against the new namespace; minting a
          // token too soon still bills the old (possibly dead) namespace -> 402.
          if (this.#lastSetNamespaceId !== numericId) {
            this.#lastSetNamespaceId = numericId;
            const settleMs = Number(process.env.DUO_BRIDGE_NAMESPACE_SETTLE_MS) || 5000;
            if (settleMs > 0) {
              this.#log.info(
                `Waiting ${settleMs}ms for the default-namespace change to propagate to the AI gateway...`,
              );
              await new Promise((r) => setTimeout(r, settleMs));
            }
          }
          // The namespace change has been applied and (if changed) settled, so
          // the ledger may now safely treat this group as switch-ready.
          active.namespaceSettled = true;
          this.#save();
          return true;
        }
        this.#log.warn(
          `ensureDefaultNamespace: could not resolve numeric id for '${groupPath}'; falling back to preferences UI.`,
        );
      } catch (err) {
        this.#log.warn(
          `ensureDefaultNamespace: GraphQL update failed (${err.message}); falling back to preferences UI.`,
        );
      }
    }

    // Fallback: browser preferences automation.
    try {
      await this.#automator.setNamespacePreference(groupPath);
      this.#log.info(`Default Duo namespace set to '${groupPath}' via preferences UI (fallback).`);
      return true;
    } catch (err) {
      this.#log.error(`ensureDefaultNamespace failed for '${groupPath}': ${err.message}`);
      return false;
    }
  }

  /**
   * Discovers the user's already-existing duo-pool-* groups via the API and
   * adopts any not yet tracked in the pool. This lets the bridge reuse groups
   * created in a previous session (or manually) instead of creating new ones
   * and hitting the account group limit.
   */
  async discoverAndAdoptGroups(credentialsProvider) {
    let token = null;
    let baseUrl = null;
    try {
      ({ token, baseUrl } = await credentialsProvider.getCredentials());
    } catch (err) {
      this.#log.warn(`discoverAndAdoptGroups: could not load credentials (${err.message}).`);
      return 0;
    }
    let existing = [];
    try {
      existing = await this.#automator.listOwnedDuoPoolGroups(token, baseUrl);
    } catch (err) {
      this.#log.warn(`discoverAndAdoptGroups: listing failed (${err.message}).`);
      return 0;
    }
    if (!this.#state) this.#state = { groups: [], currentActiveId: null };
    if (!this.#state.groups) this.#state.groups = [];

    // Reconcile tracked state against reality. The listing above only returns
    // on success (it throws on network/HTTP errors), so it is authoritative:
    // any tracked group that is NOT in the live set has been removed out-of-band
    // (e.g. the user deleted it manually, or its trial expired). Drop those
    // instead of blindly reusing a dead namespace that GitLab will reject with
    // "Duo default namespace specified does not allow you to execute a workflow".
    const liveById = new Map(existing.map((g) => [g.id, g]));
    const liveByPath = new Map(existing.map((g) => [g.path, g]));
    const dropped = [];
    this.#state.groups = this.#state.groups.filter((g) => {
      if (liveById.has(g.id) || liveByPath.has(g.path)) return true;
      dropped.push(g.path || g.id);
      return false;
    });
    if (dropped.length) {
      this.#log.warn(
        `Reconcile: ${dropped.length} tracked group(s) no longer exist on the account and were dropped: ${dropped.join(', ')}.`,
      );
    }
    // If the active pointer references a group that is gone, clear it so the
    // pool re-selects a live standby (or creates a fresh one downstream).
    if (
      this.#state.currentActiveId &&
      !this.#state.groups.some((g) => g.id === this.#state.currentActiveId)
    ) {
      this.#log.warn(
        `Reconcile: active group '${this.#state.currentActiveId}' no longer exists; clearing the active pointer.`,
      );
      this.#state.currentActiveId = null;
    }

    if (!existing.length) {
      this.#log.info('No existing duo-pool-* groups found on the account.');
      this.#save();
      return 0;
    }
    let adopted = 0;
    for (const g of existing) {
      const known = this.#state.groups.find((x) => x.id === g.id || x.path === g.path);
      if (known) {
        if (!known.numericId && g.numericId) known.numericId = g.numericId;
        if (known.status !== 'active') known.status = 'active';
        continue;
      }
      this.#state.groups.push({
        id: g.id,
        path: g.path,
        numericId: g.numericId,
        status: 'active',
        createdAt: new Date().toISOString(),
        adopted: true,
      });
      adopted += 1;
      this.#log.info(`Adopted existing group '${g.path}' into the pool.`);
    }
    if (!this.getActiveGroup()) {
      const firstActive = this.#state.groups.find((x) => x.status === 'active');
      if (firstActive) {
        this.#state.currentActiveId = firstActive.id;
        this.#log.info(`Selected '${firstActive.path}' as the active group.`);
      }
    }
    this.#save();
    this.#log.info(
      `Group discovery: ${existing.length} on account, ${adopted} newly adopted, ${this.#state.groups.filter((x) => x.status === 'active').length} active in pool.`,
    );
    return existing.length;
  }

  getPoolState() {
    return this.#state;
  }

  /**
   * Ensures the given pool group has a scratch project we can use as
   * `project_id` for path-b workflow creation. GitLab currently rejects
   * namespace-only workflows with 422 `Only project-level workflow is
   * supported`, so every active group must own at least one project.
   *
   * Reuses an existing `duo-bridge-scratch` project if one is already owned by
   * the group; otherwise creates one via REST and persists its id on the
   * group entry in `groups_pool.json`.
   *
   * Returns { projectId, projectPath } or null on failure.
   */
  async ensureScratchProject(group, credentialsProvider) {
    if (!group) return null;
    if (group.projectId && group.projectPath) {
      return { projectId: group.projectId, projectPath: group.projectPath };
    }
    if (!group.numericId) {
      this.#log.warn(
        `ensureScratchProject: group '${group.path}' has no numericId yet; refusing to create project.`,
      );
      return null;
    }

    let token = null;
    let baseUrl = null;
    try {
      ({ token, baseUrl } = await credentialsProvider.getCredentials());
    } catch (err) {
      this.#log.warn(`ensureScratchProject: could not load credentials (${err.message}).`);
      return null;
    }

    // 1) look for an existing scratch project we can reuse
    try {
      const projects = await this.#automator.listProjectsInGroup(token, baseUrl, group.numericId);
      const preferredName = 'duo-bridge-scratch';
      const existing =
        projects.find((p) => p.name === preferredName || p.path === preferredName) || projects[0];
      if (existing) {
        group.projectId = existing.id;
        group.projectPath = existing.pathWithNamespace;
        this.#save();
        this.#log.info(
          `Reusing existing project '${existing.pathWithNamespace}' (id ${existing.id}) in group '${group.path}'.`,
        );
        return { projectId: existing.id, projectPath: existing.pathWithNamespace };
      }
    } catch (err) {
      this.#log.warn(
        `ensureScratchProject: listing projects in '${group.path}' failed (${err.message}). Will try to create.`,
      );
    }

    // 2) none found — create one
    try {
      const created = await this.#automator.createProjectInGroup(token, baseUrl, group.numericId);
      group.projectId = created.id;
      group.projectPath = created.pathWithNamespace;
      this.#save();
      this.#log.info(
        `Created scratch project '${created.pathWithNamespace}' (id ${created.id}) in group '${group.path}'.`,
      );
      return { projectId: created.id, projectPath: created.pathWithNamespace };
    } catch (err) {
      this.#log.error(
        `ensureScratchProject: could not create project in '${group.path}': ${err.message}`,
      );
      return null;
    }
  }

  /**
   * Returns the workflow target descriptor for the active pool group
   * (numeric namespace id + scratch project id), lazily creating the project
   * on first use. Routes call this immediately before createWorkflow.
   */
  async getActiveProject(credentialsProvider) {
    this.#credentialsProvider = credentialsProvider || this.#credentialsProvider;
    // Per-message gate: before handing back a workflow target, make sure the
    // active group's default namespace actually has credits (task 1). If it is
    // broke this switches to a funded ready standby and re-points the namespace.
    try {
      await this.ensureCreditWorthyActiveGroup(credentialsProvider);
    } catch (err) {
      this.#log.warn(`getActiveProject: credit-worthiness check failed: ${err.message}`);
    }
    const active = this.getActiveGroup();
    if (!active) return null;
    // resolve numericId if missing (defensive; discover normally sets it)
    if (!active.numericId && credentialsProvider) {
      try {
        const { token, baseUrl } = await credentialsProvider.getCredentials();
        const n = await this.#automator.getNamespaceNumericId(token, baseUrl, active.path);
        if (n) {
          active.numericId = n;
          this.#save();
        }
      } catch (err) {
        this.#log.warn(
          `getActiveProject: could not resolve numericId for '${active.path}': ${err.message}`,
        );
      }
    }
    const scratch = await this.ensureScratchProject(active, credentialsProvider);
    return {
      groupId: active.id,
      groupPath: active.path,
      numericId: active.numericId || null,
      projectId: scratch?.projectId || null,
      projectPath: scratch?.projectPath || null,
    };
  }

  // --- credit-aware provisioning (ledger-driven) --------------------------

  /**
   * Ensure the active group (and hence the default Duo namespace) is funded
   * before a workflow runs. Cheap: reads the local ledger, no network. When the
   * active group is exhausted/over-threshold, switches to a funded ready standby
   * and re-points the namespace; falls back to rotateGroup() (create fresh) only
   * when there is genuinely no funded standby.
   */
  async ensureCreditWorthyActiveGroup(credentialsProvider) {
    this.#credentialsProvider = credentialsProvider || this.#credentialsProvider;
    const active = this.getActiveGroup();
    if (!active) {
      // No active group at all — let rotation establish one.
      await this.rotateGroup(credentialsProvider);
      return this.getActiveGroup();
    }
    if (this.#isFunded(active.id)) return active;

    this.#log.warn(
      `Active group '${active.path}' is exhausted per the ledger; switching to a funded ready standby...`,
    );
    const standby = await this.pickReadyStandby();
    if (standby) {
      this.#log.info(`Switching active group to funded ready standby '${standby.path}'.`);
      // setActiveGroupById re-runs ensureDefaultNamespace(), which honours the
      // settle wait only when the namespace actually changes.
      await this.setActiveGroupById(standby.id, credentialsProvider);
      // Retire the exhausted group in the background so the pool refills.
      this.deleteAndReplace(active.id, credentialsProvider).catch((err) =>
        this.#log.error(
          `Background replace of exhausted group '${active.path}' failed: ${err.message}`,
        ),
      );
      return this.getActiveGroup();
    }

    this.#log.warn('No funded ready standby available; creating a fresh group (last resort)...');
    await this.rotateGroup(credentialsProvider);
    return this.getActiveGroup();
  }

  /**
   * Credit-aware sweep, driven ENTIRELY by the ledger. Drops/replaces a group
   * ONLY when the ledger says it is exhausted — an adopted group with no local
   * snapshot is assumed funded and never dropped (this kills the wipe-all loop).
   * "Wipe all and recreate" fires ONLY when EVERY group is ledger-exhausted.
   *
   * ponytail: no scrape, no GraphQL balance. If you ever want to reconcile
   * local drift against GitLab's real meter, the sanctioned path is the
   * ledger's calibrate(groupId, officialCreditsUsed) hook — OFF the hot path —
   * not a page scrape. (TODO: wire a periodic calibrate() if drift becomes an
   * issue; deliberately not built here.)
   */
  async reconcilePool(credentialsProvider) {
    this.#credentialsProvider = credentialsProvider || this.#credentialsProvider;
    if (this.#isReconciling) {
      this.#log.warn('reconcilePool already in progress; skipping duplicate run.');
      return;
    }
    this.#isReconciling = true;
    try {
      if (!this.#state || !this.#state.groups) this.#load();
      const active = this.#state.groups.filter((g) => g.status === 'active');
      const exhausted = active.filter((g) => this.#isExhausted(g.id));
      this.#log.info(
        `reconcilePool: ${active.length - exhausted.length} funded/unknown, ${exhausted.length} ledger-exhausted of ${active.length} active.`,
      );

      // Only wipe-all when EVERY active group is exhausted; never on unknown.
      const toDrop = exhausted.length === active.length ? active : exhausted;
      if (toDrop.length && toDrop.length === active.length) {
        this.#log.warn('reconcilePool: every group is ledger-exhausted; wiping and recreating.');
      }
      for (const g of toDrop) {
        // eslint-disable-next-line no-await-in-loop
        await this.deleteAndReplace(g.id, credentialsProvider).catch((err) =>
          this.#log.error(`reconcilePool: drop of exhausted '${g.path}' failed: ${err.message}`),
        );
      }

      // deleteAndReplace already refills, but ensure we end at 3 funded.
      await this.ensureStandbyGroups(credentialsProvider);
    } finally {
      this.#isReconciling = false;
    }
  }

  #load() {
    if (fs.existsSync(this.#statePath)) {
      try {
        const raw = fs.readFileSync(this.#statePath, 'utf8');
        this.#state = JSON.parse(raw);
        this.#log.info(
          `Loaded group pool from ${this.#statePath}. Active group ID: ${this.#state.currentActiveId}`,
        );
        return;
      } catch (error) {
        this.#log.error(
          `Failed to parse group pool state file: ${error.message}. Initializing empty.`,
        );
      }
    }

    this.#state = {
      groups: [],
      currentActiveId: null,
    };
    this.#save();
  }

  #save() {
    try {
      fs.writeFileSync(this.#statePath, JSON.stringify(this.#state, null, 2), 'utf8');
      this.#log.debug(`Saved group pool state to ${this.#statePath}`);
    } catch (error) {
      this.#log.error(`Failed to save group pool state: ${error.message}`);
    }
  }

  /**
   * Rotates from the current exhausted group to a fresh new one.
   * Handles immediate background cleanup of the exhausted group.
   */
  async rotateGroup(credentialsProvider) {
    this.#credentialsProvider = credentialsProvider || this.#credentialsProvider;
    if (this.#isRotating) {
      this.#log.warn('Group rotation is already in progress. Ignoring duplicate request.');
      return;
    }
    this.#isRotating = true;

    try {
      const { token, baseUrl } = await credentialsProvider.getCredentials();

      // 1. Identify and mark the old group as exhausted/pending deletion
      const oldActive = this.getActiveGroup();
      if (oldActive) {
        if (process.env.DUO_BRIDGE_MARK_EXHAUSTED === 'true') {
          this.#log.info(`Marking old group ${oldActive.path} (${oldActive.id}) as exhausted...`);
          oldActive.status = 'exhausted';
          this.#save();
        } else {
          this.#log.warn(
            `[safety] NOT marking '${oldActive.path}' exhausted. A 402 does not prove the group is out of credit. Enable with DUO_BRIDGE_MARK_EXHAUSTED=true.`,
          );
        }

        // DEBUG: only delete when explicitly enabled. Auto-delete on 402 has
        // destroyed credited groups. Set DUO_BRIDGE_DELETE_ON_ROTATE=true to
        // re-enable after the 402 root cause is fixed.
        if (process.env.DUO_BRIDGE_DELETE_ON_ROTATE === 'true') {
          this.#deleteGroupInBackground(oldActive.id, oldActive.path, token, baseUrl);
        } else {
          this.#log.warn(
            `[safety] Skipping deletion of '${oldActive.path}'. Enable with DUO_BRIDGE_DELETE_ON_ROTATE=true.`,
          );
        }
      }

      // 2. Keep total active/pending groups <= 3 to comply with GitLab limits
      this.#cleanupExcessGroups();

      // 3. Prefer an already-ready FUNDED standby (trial active + namespace
      // settled + credits). Creating-and-waiting is the last resort only.
      const standbyGroup = await this.pickReadyStandby();

      if (standbyGroup) {
        this.#log.info(
          `Found ready standby group in pool: ${standbyGroup.path}. Rotating instantly!`,
        );
        this.#state.currentActiveId = standbyGroup.id;
        this.#save();

        // Point the user's default Duo namespace at the new active group so
        // direct-access tokens bill against it (awaited: GraphQL, fast).
        try {
          await this.ensureDefaultNamespace(credentialsProvider);
        } catch (err) {
          this.#log.error(
            `Failed to update default Duo namespace after standby rotation: ${err.message}`,
          );
        }

        this.#log.info(`Successfully rotated instantly to standby group: ${standbyGroup.path}`);
      } else {
        this.#log.info('No standby active groups available in pool. Creating one synchronously...');
        // Create a fresh group
        const { groupId, groupPath } = await this.#automator.createGroup(token, baseUrl);

        // Run browser automation to activate trial and Duo features
        await this.#automator.activateTrialAndDuo(groupId, groupPath);

        // Add to state and set as current active group. trialActive is
        // persisted here because activateTrialAndDuo() above just succeeded;
        // the ledger's pickReadyStandby() requires it before adoption.
        const newGroup = {
          id: groupId,
          path: groupPath,
          status: 'active',
          trialActive: true,
          namespaceSettled: false,
          createdAt: new Date().toISOString(),
        };

        this.#state.groups.push(newGroup);
        this.#state.currentActiveId = groupId;
        this.#save();

        try {
          await this.ensureDefaultNamespace(credentialsProvider);
        } catch (err) {
          this.#log.error(
            `Failed to update default Duo namespace after new-group rotation: ${err.message}`,
          );
        }

        this.#log.info(`Successfully rotated to new active group: ${groupPath}`);
      }

      // 4. Replenish the standby pool in the background (non-blocking)
      setTimeout(() => {
        this.ensureStandbyGroups(credentialsProvider).catch((err) => {
          this.#log.error(`Background standby replenishment failed: ${err.message}`);
        });
      }, 1000);
    } catch (error) {
      this.#log.error(`Rotation failed: ${error.message}`);
      throw error;
    } finally {
      this.#isRotating = false;
    }
  }

  /**
   * Ensures up to 3 active groups exist in the pool (1 current active + 2 standby).
   */
  async ensureStandbyGroups(credentialsProvider) {
    // Guard against concurrent replenishment. init() runs a background sweep and
    // rotateGroup() also schedules a replenish; without this guard both fire at
    // once and create duplicate standby groups (burning through the group limit),
    // which is exactly what produced the double 'Creating standby group 2/3'.
    if (this.#isEnsuringStandby) {
      this.#log.warn('Standby replenishment already in progress; skipping this duplicate run.');
      return;
    }
    this.#isEnsuringStandby = true;
    try {
      await this.#ensureStandbyGroupsImpl(credentialsProvider);
    } finally {
      this.#isEnsuringStandby = false;
    }
  }

  async #ensureStandbyGroupsImpl(credentialsProvider) {
    this.#load();
    // Reconcile with reality first: adopt any existing groups before creating new ones.
    try {
      await this.discoverAndAdoptGroups(credentialsProvider);
    } catch (err) {
      this.#log.warn(`Group discovery during standby check failed: ${err.message}`);
    }
    const activeGroups = this.#state.groups.filter((g) => g.status === 'active');
    const targetCount = 3;

    // Pool health is "active AND funded" per the ledger. Groups with no ledger
    // snapshot (adopted/unknown) count as funded; only ledger-exhausted ones
    // don't. reconcilePool() is what drops the exhausted ones.
    const usableCount = activeGroups.filter((g) => !this.#isExhausted(g.id)).length;

    if (usableCount < targetCount) {
      // Sweep BEFORE creating. A group that is pending deletion still counts
      // against the account's group limit until it is permanently deleted, so
      // creating first can silently hit the cap (GitLab redirects to /groups and
      // the new group is never made). Permanently delete any pending-deletion
      // duo-pool groups first to free the slots we're about to fill.
      try {
        this.#log.info(
          'Sweeping inactive (pending-deletion) groups before creating standby groups...',
        );
        await this.#automator.cleanUpAllInactiveGroups();
      } catch (err) {
        this.#log.warn(`Pre-create inactive-groups sweep failed (continuing): ${err.message}`);
      }

      this.#log.info(
        `Pool has ${usableCount} funded/usable of ${activeGroups.length} active group(s), target is ${targetCount}. Creating standby groups...`,
      );

      for (let i = usableCount; i < targetCount; i++) {
        this.#log.info(`Creating standby group ${i + 1}/${targetCount}...`);
        try {
          const { token, baseUrl } = await credentialsProvider.getCredentials();

          const { groupId, groupPath } = await this.#automator.createGroup(token, baseUrl);
          await this.#automator.activateTrialAndDuo(groupId, groupPath);

          const newGroup = {
            id: groupId,
            path: groupPath,
            status: 'active',
            trialActive: true,
            namespaceSettled: false,
            createdAt: new Date().toISOString(),
          };

          this.#state.groups.push(newGroup);

          if (!this.#state.currentActiveId) {
            this.#state.currentActiveId = groupId;
          }

          this.#save();
          this.#log.info(`Standby group ${groupPath} successfully created and added to pool.`);
        } catch (error) {
          this.#log.error(`Failed to create standby group: ${error.message}`);
          break;
        }
      }
    } else {
      this.#log.info(
        `Standby pool is fully populated with ${activeGroups.length} active group(s).`,
      );
    }
  }

  #cleanupExcessGroups() {
    // Keeps only the last 5 groups in state list to keep history but clean up very old ones
    if (this.#state.groups.length > 5) {
      this.#state.groups = this.#state.groups.slice(-5);
      this.#save();
    }
  }

  #updatePreferencesInBackground(groupPath) {
    this.#log.info(`Triggering background profile preferences update for group: ${groupPath}...`);
    this.#automator
      .setNamespacePreference(groupPath)
      .then(() => {
        this.#log.info(`Background profile preferences update for group ${groupPath} completed.`);
      })
      .catch((error) => {
        this.#log.error(`Background preferences update failed for ${groupPath}: ${error.message}`);
      });
  }

  async #deleteGroupInBackground(groupId, groupPath, token, baseUrl) {
    this.#log.info(`Triggering background deletion for group: ${groupPath} (${groupId})...`);
    try {
      await this.#automator.deleteGroupImmediately(groupId, groupPath, token, baseUrl);

      // Update state to record that this group has been deleted
      if (this.#state && this.#state.groups) {
        const groupObj = this.#state.groups.find((g) => g.id === groupId);
        if (groupObj) {
          groupObj.status = 'deleted';
          this.#save();
        }
      }
      this.#log.info(`Background deletion of group ${groupPath} completed.`);
    } catch (error) {
      this.#log.error(`Background deletion failed for ${groupPath}: ${error.message}`);
    }
  }

  // --- Credit-ledger pool-switch contract ---------------------------------
  // Methods consumed by the ledger's PoolBridgeAdapter. See
  // deliverable/integration/03_wiring_bridge_pool_switch.md.

  /**
   * Returns the first pool group that is fully ready to serve: active, its
   * trial/Duo activated, its namespace change settled, and not the current
   * active group. This enforces the hard requirement that a switch never lands
   * on a group that cannot serve.
   */
  async pickReadyStandby() {
    if (!this.#state || !this.#state.groups) return null;
    // Existing readiness gates (status/trial/namespace) AND not ledger-exhausted:
    // a switch must never land on a group the ledger has already burned through.
    return (
      this.#state.groups.find(
        (g) =>
          g.status === 'active' &&
          g.trialActive === true &&
          g.namespaceSettled === true &&
          g.id !== this.#state.currentActiveId &&
          !this.#isExhausted(g.id),
      ) || null
    );
  }

  /**
   * Sets a specific group as the active one and repoints the user's default
   * Duo namespace at it. This is the explicit-id variant of the flow that
   * ensureDefaultNamespace() runs against getActiveGroup().
   */
  async setActiveGroupById(id, credentialsProvider) {
    if (!this.#state || !this.#state.groups) {
      this.#log.warn('setActiveGroupById: no pool state; skipping.');
      return false;
    }
    const group = this.#state.groups.find((g) => g.id === id && g.status === 'active');
    if (!group) {
      this.#log.warn(`setActiveGroupById: group '${id}' not found or not active; skipping.`);
      return false;
    }
    this.#state.currentActiveId = id;
    this.#save();
    try {
      return await this.ensureDefaultNamespace(credentialsProvider);
    } catch (err) {
      this.#log.error(
        `setActiveGroupById: failed to set default namespace for '${id}': ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Orchestrates delete-and-replace of an exhausted group: mark it deleting,
   * delete it via the existing background flow, then refill the standby pool
   * back to 3. Non-blocking replenishment is scheduled via ensureStandbyGroups.
   */
  async deleteAndReplace(id, credentialsProvider) {
    this.#credentialsProvider = credentialsProvider || this.#credentialsProvider;
    if (!this.#state || !this.#state.groups) return;
    const group = this.#state.groups.find((g) => g.id === id);
    if (group) {
      group.status = 'deleting';
      this.#save();
    }
    // Drop the ledger snapshot for the group we're removing, so a future group
    // reusing this id doesn't inherit its exhausted/usage state.
    this.#ledger?.forgetGroup?.(id);
    let token = null;
    let baseUrl = null;
    try {
      ({ token, baseUrl } = await credentialsProvider.getCredentials());
    } catch (err) {
      this.#log.warn(`deleteAndReplace: could not load credentials (${err.message}).`);
    }
    if (group && token && baseUrl) {
      await this.#deleteGroupInBackground(id, group.path, token, baseUrl);
    }
    try {
      await this.ensureStandbyGroups(credentialsProvider);
    } catch (err) {
      this.#log.error(`deleteAndReplace: standby refill failed for '${id}': ${err.message}`);
    }
  }
}
