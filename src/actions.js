// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen. Each handler is
// keyed by the action `key` declared in the manifest `actions` field and
// resolves the multi-language message shown under the button (a thrown error
// is shown too).
//
// The façades are managed here: add, edit, remove. Each change re-publishes
// the discovered devices; the user then adds the new device from the
// Discovery tab of the integration to see its states.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  FacadeError,
  MAX_FACADES,
  facadeAzimuth,
  facadeFromFields,
  findFacade,
} from './facades.js';
import { NO_LOCATION, UNKNOWN_FACADE, localized, reasonLabel } from './i18n.js';

const logger = createLogger({ name: 'actions' });

/** Run a handler, turning a FacadeError into the message under the button. */
const guarded = (handler) => async (ctx, input) => {
  try {
    return await handler(ctx, input);
  } catch (err) {
    if (err instanceof FacadeError) {
      return err.userMessage;
    }
    throw err;
  }
};

/** Re-publish the devices and run a refresh so the new façade is computed. */
async function applyFacades(ctx, facades) {
  await ctx.store.update({ facades });
  await ctx.publishDevices();
  await ctx.controller.refresh({ reason: 'facades' }).catch(() => {});
}

export const ACTIONS = {
  add_facade: guarded(async (ctx, { fields }) => {
    const facades = ctx.controller.facades;
    if (facades.length >= MAX_FACADES) {
      return {
        en: `At most ${MAX_FACADES} façades: remove one first.`,
        fr: `${MAX_FACADES} façades au maximum : supprimez-en une d'abord.`,
        de: `Höchstens ${MAX_FACADES} Fassaden: Entfernen Sie zuerst eine.`,
        es: `Como máximo ${MAX_FACADES} fachadas: elimina una primero.`,
      };
    }
    const facade = facadeFromFields(fields);
    logger.info(`Action add_facade -> ${facade.name} (${facadeAzimuth(facade)}°)`);
    await applyFacades(ctx, [...facades, facade]);
    return {
      en: `Façade "${facade.name}" added (facing ${facadeAzimuth(facade)}°). Add its device from the Discovery tab.`,
      fr: `Façade « ${facade.name} » ajoutée (orientée ${facadeAzimuth(facade)}°). Ajoutez son appareil depuis l'onglet Découverte.`,
      de: `Fassade „${facade.name}“ hinzugefügt (Ausrichtung ${facadeAzimuth(facade)}°). Fügen Sie ihr Gerät über den Tab Erkennung hinzu.`,
      es: `Fachada «${facade.name}» añadida (orientada a ${facadeAzimuth(facade)}°). Añade su dispositivo desde la pestaña Descubrimiento.`,
    };
  }),

  edit_facade: guarded(async (ctx, { fields }) => {
    const facades = ctx.controller.facades;
    const current = findFacade(ctx.gladys, facades, fields.facade);
    if (!current) {
      return UNKNOWN_FACADE;
    }
    const facade = facadeFromFields(fields, current);
    logger.info(`Action edit_facade -> ${facade.name}`);
    await applyFacades(
      ctx,
      facades.map((f) => (f.id === facade.id ? facade : f)),
    );
    return {
      en: `Façade "${facade.name}" updated.`,
      fr: `Façade « ${facade.name} » mise à jour.`,
      de: `Fassade „${facade.name}“ aktualisiert.`,
      es: `Fachada «${facade.name}» actualizada.`,
    };
  }),

  remove_facade: guarded(async (ctx, { fields }) => {
    const facades = ctx.controller.facades;
    const facade = findFacade(ctx.gladys, facades, fields.facade);
    if (!facade) {
      return UNKNOWN_FACADE;
    }
    logger.info(`Action remove_facade -> ${facade.name}`);
    const runtime = { ...ctx.store.state.runtime };
    delete runtime[facade.id];
    await ctx.store.update({ runtime });
    await applyFacades(
      ctx,
      facades.filter((f) => f.id !== facade.id),
    );
    return {
      en: `Façade "${facade.name}" removed. Delete its device in Gladys too if you no longer need its history.`,
      fr: `Façade « ${facade.name} » supprimée. Supprimez aussi son appareil dans Gladys si vous n'avez plus besoin de son historique.`,
      de: `Fassade „${facade.name}“ entfernt. Löschen Sie auch ihr Gerät in Gladys, wenn Sie den Verlauf nicht mehr benötigen.`,
      es: `Fachada «${facade.name}» eliminada. Elimina también su dispositivo en Gladys si ya no necesitas su historial.`,
    };
  }),

  /** Refresh now and report the conditions and every façade's position. */
  async refresh_now(ctx) {
    logger.info('Action refresh_now');
    const { ok } = await ctx.controller.refresh({ reason: 'action' });
    if (!ok) {
      return NO_LOCATION;
    }
    const { controller } = ctx;
    const { sun, weather, location } = controller;
    const round = (value) => (value == null ? '?' : Math.round(value));
    const facadesText = (lang) =>
      controller.facades
        .map((facade) => {
          const runtime = controller.runtimeOf(facade);
          return `${facade.name} ${runtime.recommended ?? '-'} % (${reasonLabel(runtime.reason, lang)})`;
        })
        .join(', ');
    const sky = {
      en: `${location.name}: sun at ${round(sun.elevation)}° height, ${round(sun.azimuth)}° azimuth; ${round(weather.temperature)} °C, clouds ${round(weather.cloud_cover)} %, gusts ${round(weather.wind_gusts)} km/h.`,
      fr: `${location.name} : soleil à ${round(sun.elevation)}° de hauteur, azimut ${round(sun.azimuth)}° ; ${round(weather.temperature)} °C, nuages ${round(weather.cloud_cover)} %, rafales ${round(weather.wind_gusts)} km/h.`,
      de: `${location.name}: Sonne auf ${round(sun.elevation)}° Höhe, Azimut ${round(sun.azimuth)}°; ${round(weather.temperature)} °C, Wolken ${round(weather.cloud_cover)} %, Böen ${round(weather.wind_gusts)} km/h.`,
      es: `${location.name}: sol a ${round(sun.elevation)}° de altura, acimut ${round(sun.azimuth)}°; ${round(weather.temperature)} °C, nubes ${round(weather.cloud_cover)} %, ráfagas ${round(weather.wind_gusts)} km/h.`,
    };
    const offline = controller.weatherError
      ? {
          en: ' Open-Meteo unreachable: degraded mode.',
          fr: ' Open-Meteo injoignable : mode dégradé.',
          de: ' Open-Meteo nicht erreichbar: eingeschränkter Modus.',
          es: ' Open-Meteo inaccesible: modo degradado.',
        }
      : { en: '', fr: '', de: '', es: '' };
    return localized((lang) => {
      const list = facadesText(lang);
      return `${sky[lang]}${offline[lang]}${list ? ` ${list}.` : ''}`;
    });
  },
};
