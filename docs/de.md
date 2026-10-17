# Smart Shutters

Smart Shutters steuert Ihre Rollläden nach Sonne, Wolken, Hitze und Wind. Die
Integration berechnet den Sonnenstand an Ihrem Haus, liest das Wetter von
[Open-Meteo](https://open-meteo.com/) (kostenlos, ohne Konto, ohne Schlüssel)
und teilt Gladys für jede Fassade des Hauses mit, welche Position ihre
Rollläden einnehmen sollten, und warum.

Sie steuert Ihre Rollläden nicht direkt: Sie löst eine Szene mit der
empfohlenen Position aus, und eine Gladys-Szene wendet sie auf Ihre echten
Rollläden an (Zigbee, Z-Wave, MQTT, Matter…). Sie behalten die volle Kontrolle
darüber, welche Rollläden welcher Fassade folgen.

## Voraussetzungen

- Gladys Assistant 5.2 oder neuer.
- Der Standort Ihres Hauses in Gladys (**Einstellungen → Häuser**): Die
  Integration fragt bei der Installation danach, er bestimmt den Sonnenstand.
- Eine Internetverbindung für das Wetter. Ohne sie arbeitet die Integration im
  eingeschränkten Modus weiter (siehe [Offline](#offline)).

## Einrichtung

1. Installieren Sie die Integration und erlauben Sie den Zugriff auf den
   Standort Ihrer Häuser.
2. Prüfen Sie im Bildschirm **Konfiguration** die Einstellungen (die
   Standardwerte passen für die meisten Häuser) und speichern Sie.
3. Klicken Sie für jede Gruppe gleich ausgerichteter Fenster auf **Fassade
   hinzufügen**: die Wohnzimmerfenster, die Schlafzimmer, die Küche… Geben Sie
   ihr einen Namen und eine Ausrichtung. Für mehr Genauigkeit geben Sie den
   **genauen Azimut** der Fassade ein (die Richtung, in die ihre Fenster
   zeigen, in Grad: 0 = Nord, 90 = Ost, 180 = Süd, 270 = West); eine
   Kompass-App, flach an das Fenster gehalten, liefert ihn.
4. Öffnen Sie den Tab **Erkennung** der Integration und fügen Sie das Gerät
   **Sun & weather** sowie ein Gerät pro Fassade hinzu.
5. Erstellen Sie eine Szene pro Fassade:
   - Auslöser: **Rollladenposition empfohlen**, gefiltert auf die Fassade;
   - Aktion: die Position der Rollläden dieser Fassade auf die Variable
     `{{triggerEvent.data.position}}` setzen (0 % = geschlossen,
     100 % = offen).

Das ist alles: Ab jetzt folgen die Rollläden dem Himmel.

### Einstellungen einer Fassade

| Einstellung          | Standard | Bedeutung                                                                   |
| -------------------- | -------- | --------------------------------------------------------------------------- |
| Ausrichtung / Azimut | Süden    | Wohin die Fenster zeigen.                                                   |
| Öffnungswinkel       | 80°      | Wie weit seitlich der Fassade die Sonne noch in den Raum scheint.           |
| Minimale Sonnenhöhe  | 5°       | Darunter verdecken Gebäude, Bäume oder Hügel die Sonne.                     |
| Maximale Sonnenhöhe  | 90°      | Darüber beschattet ein Balkon oder Vordach die Fenster (90 = kein Vordach). |
| Blendschutz-Position | 30 %     | Die Position gegen Blendung an milden Tagen.                                |
| Hitze-Position       | 10 %     | Die Position, die an heißen Tagen die Hitze draußen hält.                   |

Mit **Fassade bearbeiten** ändern Sie sie (ein leeres Feld behält seinen
Wert), mit **Fassade entfernen** löschen Sie eine.

## Wie die Position gewählt wird

Alle 10 Minuten (das **Aktualisierungsintervall**), für jede Fassade, von der
stärksten zur schwächsten Regel:

1. **Wind** — Böen über der **Böenschwelle** (50 km/h): Alle Fassaden fahren
   in die **Wind-Position** (100 % = ganz hochgefahren, das schützt Rollläden
   und Raffstores). Der Schutz endet, wenn die Böen unter 80 % der Schwelle
   fallen.
2. **Nacht** — die Sonne steht unter der **Nachthöhe** (-4°, kurz nach
   Sonnenuntergang): die **Nacht-Position** (geschlossen). Abschaltbar.
3. **Sonne auf der Fassade** — die Sonne liegt im Öffnungswinkel und in den
   Sonnenhöhen der Fassade, die Leistung auf der Fassade überschreitet die
   **Schwelle der Sonnenleistung** (200 W/m²) und der Himmel ist nicht bedeckt
   (Bewölkung unter 80 %):
   - heißer Tag (Außentemperatur mindestens auf der **Hitzeschwelle**, 25 °C,
     oder heutige Höchstvorhersage, die sie erreicht, wenn **Heiße Tage
     vorwegnehmen** aktiv ist): die **Hitze-Position**;
   - kalter Tag (unter der **Kälteschwelle**, 15 °C): offen, die Sonne heizt
     das Haus kostenlos;
   - dazwischen: die **Blendschutz-Position**, wenn der **Blendschutz** aktiv
     ist.
4. Sonst (keine Sonne auf der Fassade, Wolken): offen.

Damit eine vorbeiziehende Wolke die Rollläden nicht tanzen lässt:

- die Beschattung beginnt an der Schwelle der Sonnenleistung und endet bei
  75 % davon;
- eine neue Position wird höchstens alle **Mindestabstände zwischen Fahrten**
  (20 Minuten) gesendet, und nur wenn sie die Rollläden um mindestens die
  **minimale Bewegung** (10 Punkte) bewegt;
- Wind und Nacht gelten immer sofort.

Die Leistung auf der Fassade wird aus der von Open-Meteo vorhergesagten
direkten, diffusen und reflektierten Strahlung und dem Winkel zwischen Sonne
und Fassade berechnet: Eine Südfassade erhält mittags im Sommer viel weniger
als im Winter, wenn die Sonne tief steht.

## Geräte

**Sun & weather**: Sonnenhöhe und -azimut, Globalstrahlung (W/m²), Bewölkung,
Außentemperatur, Windböen und UV-Index.

**Ein Gerät pro Fassade**:

- **Recommended position** — was die Automatik empfiehlt (0–100 %);
- **Automation** — ein Schalter: aus pausiert die Fassade (keine Position
  wird gesendet), an setzt sie fort;
- **Sun on the façade** — 1, wenn die Sonne die Fenster erreicht;
- **Irradiance on the façade** — empfangene Leistung (W/m²);
- **Reason** — warum: Windschutz, Nacht, Hitzeschutz, Blendschutz, Sonne
  erwünscht, bewölkt, keine Sonne auf der Fassade.

## Szenen-Auslöser

- **Rollladenposition empfohlen** — die empfohlene Position einer Fassade hat
  sich geändert (Automatik aktiv). Filter: Fassade, Grund. Variablen:
  `position`, `previous_position`, `reason`, `facade_name`, `irradiance`,
  `sun_elevation`.
- **Sonne auf einer Fassade** — die Sonne beginnt oder hört auf, eine
  Fassade zu erreichen. Filter: Fassade, gekommen / gegangen. Variablen:
  `phase`, `facade_name`, `sun_elevation`, `sun_azimuth`.
- **Windschutz** — die Böen überschreiten die Schwelle oder fallen wieder
  darunter. Filter: begonnen / beendet. Variablen: `phase`, `wind_gusts`,
  `wind_speed`, `position`.
- **Heißer Tag vorhergesagt** — die heutige Höchstvorhersage erreicht die
  Hitzeschwelle (einmal täglich, nach Sonnenaufgang): Rollläden früh
  schließen, benachrichtigen, Ventilatoren starten… Variablen:
  `temperature_max`, `temperature`.

## Szenen-Aktionen

- **Empfohlene Position abrufen** für eine Fassade: Ausgaben `position`,
  `reason`, `reason_label`, `sun_on_facade`, `irradiance`, `automation`.
- **Automatik pausieren** für eine Fassade, oder alle, wenn die Fassade leer
  bleibt, für eine Dauer in Minuten (0 = bis zur Fortsetzung): Ausgaben
  `paused_count`, `resume_at`. Praktisch für den Urlaub, einen Film oder ein
  Nickerchen.
- **Automatik fortsetzen**: Ausgaben `resumed_count` und, für eine Fassade,
  `position`, die aktuelle Empfehlung, um sie sofort anzuwenden.

Das Fortsetzen bewegt die Rollläden nie von selbst: Nutzen Sie die Ausgabe
`position` oder warten Sie auf die nächste Änderung der Empfehlung.

## Dashboard-Widgets

- **Rollläden einer Fassade** — Position und Leistung auf der Fassade (live),
  Sonnenhöhe, der Grund, die Automatik, die erwarteten Positionen der
  nächsten 12 Stunden und eine Pause- / Fortsetzen-Schaltfläche.
- **Sonne und Wetter** — Sonnenhöhe, Wolken, Temperatur, Böen und UV-Index
  (live), die erwartete Einstrahlung der nächsten 12 Stunden mit Sonnenauf-
  und -untergang, der heutige Höchstwert und der Windschutz.
- **Alle Rollläden** — jede Fassade mit Position und Grund, und
  Schaltflächen, um alle zu pausieren oder fortzusetzen.

## Konfigurationsaktionen

- **Fassade hinzufügen**, **Fassade bearbeiten**, **Fassade entfernen**.
- **Jetzt aktualisieren** — liest das Wetter, berechnet jede Fassade neu und
  zeigt das Ergebnis.

## Offline

Wenn Open-Meteo nicht erreichbar ist, zeigen die Geräte einen orangefarbenen
Punkt und:

- 3 Stunden lang nutzt die Integration die letzte erhaltene Vorhersage;
- danach nimmt sie einen klaren Himmel an, lokal berechnet: Die Rollläden
  schützen vor der Sonne wie bei schönem Wetter, ohne die Temperatur (nur
  Blendschutz); der Windschutz bleibt, wie er war.

Beim nächsten erfolgreichen Abruf ist alles wieder normal.

## Datenschutz

Die einzigen Daten, die Ihr Haus verlassen, sind sein Standort, auf etwa
10 m gerundet, an Open-Meteo gesendet, um die Vorhersage zu erhalten. Kein
Konto, kein Schlüssel, keine anderen persönlichen Daten.

## Fehlerbehebung

- **„Kein Gladys-Haus hat Koordinaten“**: Legen Sie den Standort Ihres
  Hauses unter **Einstellungen → Häuser** fest, oder wählen Sie in der
  Konfiguration ein Haus mit Standort.
- **Die Geräte haben keine Werte**: Fügen Sie sie über den Tab **Erkennung**
  hinzu; ihre Werte kommen bei der nächsten Aktualisierung (oder klicken Sie
  auf **Jetzt aktualisieren**).
- **Die Rollläden schließen zu früh oder zu spät**: Passen Sie den
  Öffnungswinkel und die Sonnenhöhen der Fassade an, oder die Schwelle der
  Sonnenleistung.
- **Die Rollläden fahren zu oft**: Erhöhen Sie den Mindestabstand zwischen
  Fahrten oder die minimale Bewegung.
