/**
 * Lokale Datums-/Zeit-Helfer.
 *
 * WARNUNG: `new Date().toISOString()` liefert IMMER die UTC-Zeit, nicht die
 * lokale Zeit der Zeitzone des Nutzers. `.slice(0, 10)` bzw. `.slice(0, 16)`
 * darauf ergibt daher je nach Zeitzone und Uhrzeit einen falschen Kalendertag
 * (z. B. abends in Zeitzonen hinter UTC bereits der nächste Tag, oder
 * morgens in Zeitzonen vor UTC noch der vorherige Tag).
 *
 * Diese Funktionen liefern stattdessen das *lokale* Datum/die *lokale* Zeit
 * im gleichen "YYYY-MM-DD" bzw. "YYYY-MM-DDTHH:mm" Format — für alle
 * "heute"-Vergleiche (Erinnerungen, Notizen, Tischsperren, Öffnungszeiten,
 * Reservierungs-Filter etc.) verwenden.
 */

/** Lokales Datum als "YYYY-MM-DD". */
export function localDateIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lokales Datum + Uhrzeit (Minute) als "YYYY-MM-DDTHH:mm". */
export function localDateTimeIso(d: Date = new Date()): string {
  return `${localDateIso(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Lokales Datum + Uhrzeit (Minute) als "YYYY-MM-DD HH:mm" (Leerzeichen statt
 * "T") — passend zum Backend-Format von Reservierungs-Feldern wie
 * `starts_at`. Wichtig: NICHT localDateTimeIso() für Vergleiche mit
 * `starts_at` verwenden — das "T" sortiert lexikografisch nach dem
 * Leerzeichen, wodurch Vergleiche am selben Kalendertag falsche Ergebnisse
 * liefern.
 */
export function localDateTimeSpace(d: Date = new Date()): string {
  return `${localDateIso(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}