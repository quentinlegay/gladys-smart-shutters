# Smart Shutters

Smart Shutters mueve tus persianas según el sol, las nubes, el calor y el
viento. La integración calcula la posición del sol en tu casa, lee el tiempo
de [Open-Meteo](https://open-meteo.com/) (gratis, sin cuenta, sin clave) e
indica a Gladys, para cada fachada de la casa, la posición que deberían tomar
sus persianas, y por qué.

No controla tus persianas directamente: dispara una escena con la posición
recomendada, y una escena de Gladys la aplica a tus persianas reales (Zigbee,
Z-Wave, MQTT, Matter…). Tú decides qué persianas siguen a cada fachada.

## Requisitos

- Gladys Assistant 5.2 o posterior.
- La ubicación de tu casa configurada en Gladys (**Ajustes → Casas**): la
  integración la pide al instalarse, sirve para situar el sol.
- Una conexión a internet para el tiempo. Sin ella, la integración sigue
  funcionando en modo degradado (ver [Sin conexión](#sin-conexión)).

## Puesta en marcha

1. Instala la integración y acepta el acceso a la ubicación de tus casas.
2. En la pantalla **Configuración**, revisa los ajustes (los valores por
   defecto sirven para la mayoría de las casas) y guarda.
3. Haz clic en **Añadir una fachada** para cada grupo de ventanas con la
   misma orientación: los ventanales del salón, los dormitorios, la cocina…
   Dale un nombre y una orientación. Para más precisión, introduce el
   **acimut exacto** de la fachada (la dirección hacia la que miran sus
   ventanas, en grados: 0 = norte, 90 = este, 180 = sur, 270 = oeste); una
   aplicación de brújula apoyada en la ventana te lo da.
4. Abre la pestaña **Descubrimiento** de la integración y añade el
   dispositivo **Sun & weather** y un dispositivo por fachada.
5. Crea una escena por fachada:
   - disparador: **Posición de persiana recomendada**, filtrado por la
     fachada;
   - acción: poner la posición de las persianas de esa fachada en la variable
     `{{triggerEvent.data.position}}` (0 % = cerrada, 100 % = abierta).

Eso es todo: a partir de ahora, las persianas siguen al cielo.

### Ajustes de una fachada

| Ajuste                       | Defecto | Significado                                                                |
| ---------------------------- | ------- | -------------------------------------------------------------------------- |
| Orientación / acimut         | Sur     | Hacia dónde miran las ventanas.                                            |
| Ángulo de apertura           | 80°     | Hasta dónde, a cada lado de la fachada, el sol entra aún en la habitación. |
| Altura mínima del sol        | 5°      | Por debajo, edificios, árboles o colinas tapan el sol.                     |
| Altura máxima del sol        | 90°     | Por encima, un balcón o alero da sombra a las ventanas (90 = sin alero).   |
| Posición antideslumbramiento | 30 %    | La posición contra el deslumbramiento, en días templados.                  |
| Posición calor               | 10 %    | La posición que deja el calor fuera, en días calurosos.                    |

Usa **Editar una fachada** para cambiarlos (un campo vacío mantiene su valor)
y **Eliminar una fachada** para quitar una.

## Cómo se elige la posición

Cada 10 minutos (el **intervalo de actualización**), para cada fachada, de la
regla más fuerte a la más débil:

1. **Viento** — ráfagas por encima del **umbral de ráfagas** (50 km/h): todas
   las fachadas pasan a la **posición viento** (100 % = totalmente subidas, lo
   que protege las persianas enrollables y las lamas exteriores). La
   protección termina cuando las ráfagas bajan del 80 % del umbral.
2. **Noche** — el sol está por debajo de la **altura de noche** (-4°, poco
   después de la puesta): la **posición de noche** (cerrada). Desactivable.
3. **Sol en la fachada** — el sol está dentro del ángulo de apertura y de las
   alturas de la fachada, la potencia que aporta a la fachada supera el
   **umbral de potencia solar** (200 W/m²) y el cielo no está cubierto
   (nubosidad por debajo del 80 %):
   - día caluroso (temperatura exterior igual o superior al **umbral de
     calor**, 25 °C, o máxima prevista del día que lo alcanza cuando
     **Anticipar los días calurosos** está activo): la **posición calor**;
   - día frío (por debajo del **umbral de frío**, 15 °C): abierta, el sol
     calienta la casa gratis;
   - entre ambos: la **posición antideslumbramiento**, si el
     **antideslumbramiento** está activo.
4. Si no (sin sol en la fachada, nubes): abierta.

Para que una nube pasajera no haga bailar las persianas:

- la sombra empieza en el umbral de potencia solar y termina al 75 % de él;
- se envía una nueva posición como mucho cada **retraso mínimo entre
  movimientos** (20 minutos), y solo si mueve las persianas al menos el
  **movimiento mínimo** (10 puntos);
- el viento y la noche se aplican siempre al instante.

La potencia en la fachada se calcula a partir de la radiación directa, difusa
y reflejada prevista por Open-Meteo y del ángulo entre el sol y la fachada:
una fachada sur recibe mucho menos a mediodía en verano que en invierno,
cuando el sol está bajo.

## Dispositivos

**Sun & weather**: altura y acimut del sol, irradiancia global (W/m²),
nubosidad, temperatura exterior, ráfagas de viento e índice UV.

**Un dispositivo por fachada**:

- **Recommended position** — lo que recomienda la automatización (0–100 %);
- **Automation** — un interruptor: apagado pausa la fachada (no se envía
  ninguna posición), encendido la reanuda;
- **Sun on the façade** — 1 cuando el sol alcanza las ventanas;
- **Irradiance on the façade** — potencia recibida (W/m²);
- **Reason** — por qué: protección viento, noche, protección calor,
  antideslumbramiento, sol bienvenido, nublado, sin sol en la fachada.

## Disparadores de escena

- **Posición de persiana recomendada** — la posición recomendada de una
  fachada ha cambiado (automatización activa). Filtros: fachada, motivo.
  Variables: `position`, `previous_position`, `reason`, `facade_name`,
  `irradiance`, `sun_elevation`.
- **Sol en una fachada** — el sol empieza o deja de alcanzar una fachada.
  Filtros: fachada, llega / se va. Variables: `phase`, `facade_name`,
  `sun_elevation`, `sun_azimuth`.
- **Protección contra el viento** — las ráfagas superan el umbral, o vuelven
  a bajar. Filtro: iniciada / terminada. Variables: `phase`, `wind_gusts`,
  `wind_speed`, `position`.
- **Día caluroso previsto** — la máxima prevista del día alcanza el umbral de
  calor (una vez al día, tras la salida del sol): cerrar las persianas
  temprano, avisar, poner los ventiladores… Variables: `temperature_max`,
  `temperature`.

## Acciones de escena

- **Obtener la posición recomendada** de una fachada: salidas `position`,
  `reason`, `reason_label`, `sun_on_facade`, `irradiance`, `automation`.
- **Pausar la automatización** de una fachada, o de todas si la fachada se
  deja vacía, durante una duración en minutos (0 = hasta reanudar): salidas
  `paused_count`, `resume_at`. Útil para irse de vacaciones, ver una película
  o echar la siesta.
- **Reanudar la automatización**: salidas `resumed_count` y, para una
  fachada, `position`, la recomendación actual, para aplicarla enseguida.

Reanudar nunca mueve las persianas por sí solo: usa la salida `position`, o
espera al próximo cambio de recomendación.

## Widgets del panel

- **Persianas de una fachada** — posición y potencia en la fachada (en
  directo), altura del sol, el motivo, la automatización, las posiciones
  previstas para las próximas 12 horas y un botón de pausa / reanudación.
- **Sol y tiempo** — altura del sol, nubes, temperatura, ráfagas e índice UV
  (en directo), la irradiancia prevista para las próximas 12 horas con la
  salida y la puesta del sol, la máxima del día y la protección viento.
- **Todas las persianas** — cada fachada con su posición y motivo, y botones
  para pausarlas o reanudarlas todas.

## Acciones de configuración

- **Añadir una fachada**, **Editar una fachada**, **Eliminar una fachada**.
- **Actualizar ahora** — lee el tiempo, recalcula cada fachada y muestra el
  resultado.

## Sin conexión

Cuando Open-Meteo no responde, los dispositivos muestran un punto naranja y:

- durante 3 horas, la integración usa la última previsión recibida;
- después supone un cielo despejado, calculado localmente: las persianas
  protegen del sol como en un día soleado, sin la temperatura (solo
  antideslumbramiento); la protección viento sigue como estaba.

Todo vuelve a la normalidad en la siguiente actualización correcta.

## Privacidad

El único dato que sale de tu casa es su ubicación, redondeada a unos 10 m,
enviada a Open-Meteo para obtener la previsión. Sin cuenta, sin clave, sin
ningún otro dato personal.

## Solución de problemas

- **«Ninguna casa de Gladys tiene coordenadas»**: indica la ubicación de tu
  casa en **Ajustes → Casas**, o elige una casa con ubicación en la
  configuración.
- **Los dispositivos no tienen valores**: añádelos desde la pestaña
  **Descubrimiento**; sus valores llegan en la siguiente actualización (o
  haz clic en **Actualizar ahora**).
- **Las persianas se cierran demasiado pronto o tarde**: ajusta el ángulo de
  apertura y las alturas del sol de la fachada, o el umbral de potencia
  solar.
- **Las persianas se mueven demasiado a menudo**: aumenta el retraso mínimo
  entre movimientos o el movimiento mínimo.
