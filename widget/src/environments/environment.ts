/**
 * Konfiguration des Widgets.
 *
 *  • apiUrl   — Basis-URL der Backend-API. Im Dev läuft alles über den
 *               Angular-Proxy (proxy.conf.json → localhost:8010), also reicht
 *               der relative Pfad "/api/v1".
 *  • venueId  — UUID des Raums/Venues, in den das Widget reserviert.
 *               Aktuell: „Hauptraum“ von „Salyseat Restaurant“ (angelegt am 06.11.2026).
 *               Die UUID findest du auch in der Admin-URL, sobald du einen
 *               Raum öffnest:  http://localhost:4300/raum/<UUID>
 *
 *  Override per URL möglich:  http://localhost:4301/?venue=<UUID>
 */
export const environment = {
  production: false,
  apiUrl: '/api/v1',
  venueId: '01a1b160-c05e-75fa-af94-33921014d179',
};
