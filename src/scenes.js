// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+). Each handler is keyed
// by the action `key`, receives the RESOLVED fields (scene variables
// substituted, defaults applied, validated by the core) and returns the
// declared `outputs` for the following actions of the scene. Throwing fails
// that action only: the scene logs it and continues.
//
// No handler fires a scene trigger, directly or through a refresh: a scene
// bound to that trigger would loop through the integration.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { findFacade } from './facades.js';
import { NO_FACADE, UNKNOWN_FACADE, reasonLabel } from './i18n.js';

const logger = createLogger({ name: 'scenes' });

/** The façade a scene field designates; every façade when it is empty. */
export function selectFacades(ctx, deviceExternalId) {
  const { facades } = ctx.controller;
  if (!deviceExternalId) {
    if (facades.length === 0) {
      throw new Error(NO_FACADE.en);
    }
    return facades;
  }
  const facade = findFacade(ctx.gladys, facades, deviceExternalId);
  if (!facade) {
    throw new Error(UNKNOWN_FACADE.en);
  }
  return [facade];
}

export const SCENE_ACTIONS = {
  /** What the automation recommends for a façade right now. */
  async get_recommendation(ctx, { fields }) {
    const [facade] = selectFacades(ctx, fields.facade || null);
    const { controller } = ctx;
    const decision = controller.decisions[facade.id];
    const runtime = controller.runtimeOf(facade);
    if (!decision) {
      throw new Error('No recommendation yet: the first refresh has not run.');
    }
    logger.info(`Scene action get_recommendation <- ${facade.name}`);
    return {
      position: runtime.recommended ?? decision.position,
      reason: decision.reason,
      reason_label: reasonLabel(decision.reason, 'en'),
      sun_on_facade: decision.sun_on_facade,
      irradiance: decision.irradiance,
      automation: controller.isAutomatic(facade),
    };
  },

  /** Pause the automation (holidays, a film, a nap), optionally for a while. */
  async pause_automation(ctx, { fields }) {
    const facades = selectFacades(ctx, fields.facade || null);
    const minutes = Math.max(0, Math.min(10080, Number(fields.duration) || 0));
    const until = await ctx.controller.pause(facades, minutes);
    logger.info(`Scene action pause_automation <- ${facades.length} façade(s), ${minutes} min`);
    return {
      paused_count: facades.length,
      resume_at: until ? new Date(until).toISOString() : '',
    };
  },

  /**
   * Resume the automation. The position returned (one façade only) lets the
   * scene apply the current recommendation at once.
   */
  async resume_automation(ctx, { fields }) {
    const facades = selectFacades(ctx, fields.facade || null);
    await ctx.controller.resume(facades);
    logger.info(`Scene action resume_automation <- ${facades.length} façade(s)`);
    const decision = facades.length === 1 ? ctx.controller.decisions[facades[0].id] : null;
    return {
      resumed_count: facades.length,
      position: decision?.position ?? null,
    };
  },
};
