// -----------------------------------------------------------------------------
// Wiring of the integration: every SDK handler is registered here, before
// `connect()`. Kept apart from index.js so the tests drive the whole
// integration against the SDK's fake Gladys, with a fake Open-Meteo `fetch`.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { ACTIONS } from './actions.js';
import { normalizeConfig } from './config.js';
import { ShutterController } from './controller.js';
import { FACADE_FEATURE, buildDiscoveredDevices, facadeIds } from './facades.js';
import { SCENE_ACTIONS } from './scenes.js';
import { createStore } from './store.js';
import { createWeatherClient } from './weather.js';
import { WIDGETS, refreshWidgets } from './widgets.js';

const logger = createLogger({ name: 'app' });

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch] - Open-Meteo HTTP client (tests: a fake).
 * @param {() => number} [options.now]
 * @param {ReturnType<typeof createStore>} [options.store]
 */
export function createApp(gladys, { fetch, now = Date.now, store } = {}) {
  let config = normalizeConfig();
  const getConfig = () => config;
  store ??= createStore();

  const controller = new ShutterController({
    gladys,
    store,
    weatherClient: createWeatherClient({ fetch, now }),
    getConfig,
    now,
    onRefreshed: refreshWidgets,
  });
  const publishDevices = () =>
    gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, store.state.facades));
  const ctx = { gladys, store, controller, getConfig, publishDevices };

  // --- Discovery --------------------------------------------------------------
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> publishing the devices');
    await publishDevices();
  });

  // A device created by the user: its features exist now, publish the values
  // (the SDK forgot them, so publishChangedStates sends them all).
  gladys.onDeviceCreated(() => controller.republish());

  // --- Command: the automation switch of a façade -----------------------------
  gladys.onSetValue(async (device, feature, value) => {
    const facade = controller.facades.find(
      (f) => facadeIds(gladys, f).feature(FACADE_FEATURE.AUTOMATION) === feature.external_id,
    );
    if (!facade) {
      // Throw: the SDK sends a success:false acknowledgement to Gladys.
      throw new Error(`No command handler for ${feature.external_id}`);
    }
    logger.info(`Automation of ${facade.name} <- ${value}`);
    if (Number(value) === 1) {
      await controller.resume([facade]);
    } else {
      await controller.pause([facade], 0);
    }
  });

  // --- Manifest actions, scene actions, widgets -------------------------------
  for (const [key, handler] of Object.entries(ACTIONS)) {
    gladys.onAction(key, (fields) => handler(ctx, { fields }));
  }
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(ctx, { fields }));
  }
  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(ctx, request));
    if (typeof widget.action === 'function') {
      gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
        widget.action(ctx, { actionKey, params, settings }),
      );
    }
  }

  // --- Configuration ------------------------------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> applying the new configuration');
    config = normalizeConfig(newConfig);
    // The refresh interval may have changed: restart the timer.
    controller.start();
    await controller.refresh({ reason: 'config' }).catch(() => {});
  });

  // --- Connection lifecycle -----------------------------------------------------
  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      await store.load();
      await publishDevices();
      controller.start();
      // A failed first refresh is retried by the timer: the connection itself
      // must not fail.
      await controller.refresh({ reason: 'startup' }).catch((err) => {
        logger.error('First refresh failed', err);
      });
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
          de: 'Die Initialisierung ist fehlgeschlagen, prüfen Sie die Logs der Integration.',
          es: 'La inicialización ha fallado, consulta los registros de la integración.',
        })
        .catch(() => {});
    }
  });

  gladys.on('disconnected', () => controller.stop());

  return {
    ctx,
    shutdown() {
      controller.stop();
    },
  };
}
