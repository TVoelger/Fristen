# Architektur und nächste Schritte

## Gegenwärtiger Aufbau

| Bereich | Ort | Aufgabe |
|---|---|---|
| Datenmodell | `src/domain/model.ts` | Personen, Projekte, Verfahren, Fristen, persönliche Einstellungen und Abonnements |
| Datum und Uhrzeit | `src/domain/time.ts` | Kalendertage und explizite Uhrzeiten in Europe/Berlin, einschließlich Zeitumstellung |
| Projektoperationen | `src/domain/projects.ts` | Wirksame Partner, Bearbeitungsberechtigung im Rollenmodell und geprüfte Projektlöschung |
| Speicherung | `src/data/storage.ts` | Versioniertes Datenformat, Validierung und austauschbare Speicherschnittstelle |
| Beispieldaten | `src/data/demo.ts`, `seed.json` | Einmalig relativ zum Erststart datierte fiktive Verfahren |
| Oberfläche | `src/ui/` | Übernommenes kompaktes Layout und interaktive Formulare |
| Einstieg | `src/main.ts` | Daten laden und Oberfläche starten; Fehler beim Laden erhalten den vorhandenen Speicher |

Der Kern ist in TypeScript geschrieben. Die bestehende Oberfläche wurde zunächst als JavaScript-Modul übernommen, damit ihre abgestimmte Darstellung und die bisherigen Bedienabläufe erhalten bleiben. Weitere Fachoperationen können schrittweise aus diesem Modul in den typisierten Kern verschoben werden.

## Fachliche Festlegungen

- Ein Projekt ist ein optionaler übergeordneter Eintrag. Fristen ohne Projekt stehen auf derselben obersten Ebene.
- `partners: null` bedeutet bei einer Projektfrist die aktuelle Übernahme vom Projekt. Eine eigene Liste bedeutet eine ausdrückliche Abweichung.
- Ein Projekt kann ohne seine Fristen gelöscht werden. Zuvor werden wirksame Partnerangaben auf jeder betroffenen Frist ausdrücklich festgehalten. Auch bereits erledigte Fristen bleiben dabei erhalten.
- Beim Mitlöschen werden alle Fristen dieses Projekts erfasst, unabhängig von der aktuellen Ansicht. Jede nicht abschließend erledigte Frist zählt als offen, auch bei bereits gemeldeter Erledigung. Der Kern prüft vor dem Löschen erneut, dass die bestätigten offenen Fristen dem aktuellen Bestand entsprechen.
- Verknüpfte Fristen außerhalb des gelöschten Projekts bleiben erhalten. Lediglich die Verbindung zu einer mitgelöschten Bezugsfrist wird aufgelöst.
- Abonnements sind persönlich. Sie übertragen keine Verantwortung, keine Bearbeitungsrechte und werden nicht mit einer Assistenzvertretung weitergegeben.
- „Meine Fristen“ zeigt bei Anwälten eigene Arbeitszuordnungen. Assistenz sieht die betreuten Anwälte und aktive Vertretungen. Hinzu kommen persönliche Abonnements.
- „Übersicht“ zeigt Partnerverantwortung. Ein persönliches Abonnement erweitert diese Ansicht nicht.
- Standardmäßig zeigt ein voller Balken 42 verbleibende Kalendertage. Die persönliche Maximalspanne ist einstellbar. Interne Fristen sind blau. Bei anderen Fristen entscheidet das nächste offene Ziel, einschließlich interner Vorfrist, über Grün (>14 Tage), Orange (>7 Tage) und Rot (bis 7 Tage oder überfällig).
- Hauptdatum: `TT.MM.JJJJ (WT.)`, Uhrzeit nur bei ausdrücklicher Angabe daneben. Vorfrist am Balken: `TT.MM.` in Grau.
- Ohne ausdrückliche Kennzeichnung erscheint keine Kategorie. Nur Notfrist, Dringlichkeitsfrist und Vollziehungsfrist werden rot neben dem Aktenzeichen angezeigt.
- Fristberechnung aus Zustellung, Feiertagen oder Verfahrensrecht ist nicht implementiert. Eingegebene Fristdaten werden übernommen. Bei einer im Herbst doppelt vorkommenden Uhrzeit gilt technisch die erste Ausprägung, eine im Frühjahr nicht existierende Uhrzeit wird abgewiesen.

## Ausbau

1. **Gemeinsamer Datenbestand und Anmeldung.** Zentraler Dienst mit relationaler Datenbank, tatsächlicher Identitätsprüfung und serverseitigen Rollenrechten. Änderungen erhalten Versionen und einen nachvollziehbaren Verlauf. Fristenlöschung soll dort als dokumentierter Löschvorgang mit Wiederherstellung umgesetzt werden. Der gegenwärtige Profilwechsel ist ausschließlich eine Demo und keine Sicherheitsgrenze.
2. **Kanzleiabläufe konkretisieren.** Zuständigkeiten, Vertretungsregeln, Bestätigung der Fristerfassung und Erledigung sowie berechtigte Löschrollen abstimmen. Eine verpflichtende Identitätstrennung zwischen meldender und kontrollierender Person ist noch nicht implementiert.
3. **Outlook und AnNoText.** Tatsächlich verfügbare Schnittstellen und führenden Datenbestand klären. Kalenderereignisse mit stabilen Kennungen, nachvollziehbaren Übertragungszuständen und Wiederholungsversuchen aktualisieren. Im aktuellen Stand sind die Kalenderangaben reine Beispieldaten und lösen keine Übertragung aus.
4. **Windows-Verpackung.** Dieselbe gebaute Oberfläche in einem Desktop-Fenster verwenden, etwa mit Electron. Sichere Fensterkonfiguration, Installation, Updates und Anmeldung ergänzen. Der Desktop-Client verwendet denselben zentralen Datenbestand wie die Weboberfläche.

Die erste Version arbeitet lokal und synchron. Ihre Konflikterkennung verhindert typische Überschreibungen durch ein zweites Browserfenster, ist aber keine transaktionale Mehrbenutzerdatenbank. Benutzerverwaltung, zentrale Backups, Serverberechtigungen und ein revisionssicherer Verlauf gehören zum Ausbau vor dem Kanzleibetrieb.
