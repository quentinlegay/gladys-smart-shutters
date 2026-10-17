// -----------------------------------------------------------------------------
// User-facing texts shared by the actions, the widgets and the device states,
// in the four languages of the integration (en, fr, de, es).
// -----------------------------------------------------------------------------

import { REASONS } from './engine.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/** Build a multi-language object from a function of the language. */
export const localized = (build) =>
  Object.fromEntries(LANGUAGES.map((lang) => [lang, build(lang)]));

/** The text of a multi-language object in a language, English as fallback. */
export const textIn = (texts, language) => texts[language] ?? texts.en;

export const REASON_LABELS = {
  [REASONS.WIND]: {
    en: 'Wind protection',
    fr: 'Protection vent',
    de: 'Windschutz',
    es: 'Protección viento',
  },
  [REASONS.NIGHT]: { en: 'Night', fr: 'Nuit', de: 'Nacht', es: 'Noche' },
  [REASONS.HEAT]: {
    en: 'Heat protection',
    fr: 'Protection chaleur',
    de: 'Hitzeschutz',
    es: 'Protección calor',
  },
  [REASONS.GLARE]: {
    en: 'Glare protection',
    fr: 'Anti-éblouissement',
    de: 'Blendschutz',
    es: 'Antideslumbramiento',
  },
  [REASONS.SOLAR_GAIN]: {
    en: 'Sun let in',
    fr: 'Soleil bienvenu',
    de: 'Sonne erwünscht',
    es: 'Sol bienvenido',
  },
  [REASONS.CLOUDY]: { en: 'Cloudy', fr: 'Nuageux', de: 'Bewölkt', es: 'Nublado' },
  [REASONS.NO_SUN]: {
    en: 'No sun on the façade',
    fr: 'Pas de soleil sur la façade',
    de: 'Keine Sonne auf der Fassade',
    es: 'Sin sol en la fachada',
  },
};

export const reasonLabel = (reason, language = 'en') =>
  REASON_LABELS[reason] ? textIn(REASON_LABELS[reason], language) : reason;

export const PAUSED = {
  en: 'Paused',
  fr: 'En pause',
  de: 'Pausiert',
  es: 'En pausa',
};

export const AUTOMATIC = {
  en: 'Automatic',
  fr: 'Automatique',
  de: 'Automatisch',
  es: 'Automático',
};

/** "HH:MM" in the time zone of the house. */
export function formatTime(ms, timeZone = 'UTC') {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    }).format(ms);
  } catch {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(ms);
  }
}

export const NO_LOCATION = {
  en: 'No Gladys house has coordinates: set the location of your house in Gladys (Settings → Houses).',
  fr: "Aucune maison Gladys n'a de coordonnées : renseignez la position de votre maison dans Gladys (Paramètres → Maisons).",
  de: 'Kein Gladys-Haus hat Koordinaten: Legen Sie den Standort Ihres Hauses in Gladys fest (Einstellungen → Häuser).',
  es: 'Ninguna casa de Gladys tiene coordenadas: indica la ubicación de tu casa en Gladys (Ajustes → Casas).',
};

export const NO_FACADE = {
  en: 'No façade yet: add one with the "Add a façade" action.',
  fr: "Aucune façade pour l'instant : ajoutez-en une avec l'action « Ajouter une façade ».",
  de: 'Noch keine Fassade: Fügen Sie eine mit der Aktion „Fassade hinzufügen“ hinzu.',
  es: 'Todavía no hay fachadas: añade una con la acción «Añadir una fachada».',
};

export const UNKNOWN_FACADE = {
  en: 'Unknown façade: pick one of the façades of the integration.',
  fr: "Façade inconnue : choisissez l'une des façades de l'intégration.",
  de: 'Unbekannte Fassade: Wählen Sie eine der Fassaden der Integration.',
  es: 'Fachada desconocida: elige una de las fachadas de la integración.',
};
