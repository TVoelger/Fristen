# Fristen

Erste startbare Webversion der gemeinsamen Fristenübersicht. Die Oberfläche entspricht dem im Gespräch entwickelten Entwurf und ist für eine spätere Desktop-Verpackung vorbereitet.

**Stand 0.1:** lokale Testversion mit Beispieldaten. Änderungen werden im jeweiligen Browser gespeichert. Der Profilwechsel dient zum Erproben der Rollen und ist noch keine Anmeldung. Es gibt noch keinen zentralen Kanzleidatenbestand und keine Verbindung zu AnNoText oder Outlook. Für echte Kanzleifristen ist dieser Entwicklungsstand noch nicht vorgesehen.

## Unter Windows starten

Voraussetzungen: Git und [Node.js 24 oder neuer](https://nodejs.org/en/download).

Wenn `C:\Fristen-Tool` bereits das lokale Repository ist und `origin` auf dieses GitHub-Repository zeigt, in PowerShell ausführen:

```powershell
cd C:\Fristen-Tool
git pull origin main
npm ci
npm start
```

Anschließend [http://127.0.0.1:5173](http://127.0.0.1:5173) öffnen. Das Terminal während der Nutzung geöffnet lassen. Mit `Strg+C` beenden.

Für den täglichen Start `Start-Fristen.cmd` doppelt anklicken. Die Startdatei prüft bei jedem Neustart GitHub, übernimmt neue Änderungen auf `main`, richtet bei Bedarf die Pakete ein und öffnet den Browser. Bereits laufende Versionen werden durch diesen Startmechanismus nicht im Hintergrund aktualisiert.

Läuft Fristen bereits auf Port 5173, öffnet die Startdatei die vorhandene Anwendung im Browser. Sie startet keinen zweiten Server. Ein anderer oder nicht erkennbarer Dienst auf diesem Port wird gemeldet.

Die automatische Aktualisierung führt nur Fast-Forward-Updates aus. Bei lokalen Dateiänderungen, einem anderen Entwicklungszweig oder einem fehlgeschlagenen Abgleich startet sie mit dem vorhandenen Stand. Es werden keine lokalen Änderungen verworfen oder automatisch zusammengeführt. Wenn Pakete erstmals oder nach einer Änderung eingerichtet werden müssen, ist dafür eine funktionierende npm-Verbindung erforderlich.

Wer noch die erste Startdatei besitzt, übernimmt die automatische Aktualisierung einmalig in einem zusätzlichen PowerShell-Fenster:

```powershell
git -C "C:\Fristen-Tool" pull --ff-only origin main
```

Anschließend das bisherige Startfenster schließen und `Start-Fristen.cmd` neu öffnen. Künftig genügt dieser Doppelklick für Aktualisierung und Start.

Ist der Ordner noch kein Git-Repository, kann das Projekt in einen neuen Ordner geklont werden:

```powershell
git clone https://github.com/TVoelger/Fristen.git C:\Fristen-Tool
```

Git überschreibt dabei keinen bereits gefüllten Zielordner. Die Dateien sollten nicht zusätzlich über einen ZIP-Download in ein bestehendes Repository kopiert werden.

## Enthaltene Funktionen

- Fristdetails und Einstellungen öffnen sich in einem Dialogfenster über der Übersicht. Auch Bearbeitungen und Projektformulare bleiben im Fenster. Schließen über das Kreuz, Escape oder den Hintergrund; Ansicht, aufgeklappte Projekte und Scrollposition bleiben erhalten. Nicht gespeicherte Eingaben werden beim Schließen verworfen.
- „Meine Fristen“: zugeordnete/betreute Fristen, zeitlich aktive Assistenzvertretungen und persönliche Abonnements.
- „Fristen Kanzlei“: alle offenen Fristen; einzelne Fristen per Lesezeichen abonnieren. Abonnieren ändert keine Zuständigkeiten oder Bearbeitungsrechte.
- „Übersicht“ für Partner: Fristen mit ihrer wirksamen Partnerverantwortung. Projektvorgaben werden übernommen, individuelle Abweichungen berücksichtigt.
- Projekte anlegen, per Klick auf ihren Namen umbenennen und Partner ändern.
- Projekt löschen: Fristen behalten und auf die oberste Ebene verschieben oder sämtliche zugeordneten Fristen mitlöschen. Offene Fristen erfordern eine zusätzliche Bestätigung mit Auflistung. Auch bereits erledigte und im aktuellen Filter ausgeblendete Fristen zählen zum Projekt.
- Neue Fristen und Verfahren anlegen; Fristen zwischen Projekten und der obersten Ebene verschieben; mehrere zuständige Anwälte und Partner auswählen.
- Persönliche Kürzel-/Namensanzeige, Balkenspanne und Assistenzzuordnungen.
- Fristenbalken mit standardmäßig sechs Wochen, Plus bei längerer Laufzeit und interner Vorfrist mit blauem Abschnitt sowie grauem Datum unter der Markierung.
- Interne Fristen abschließen; externe Erledigung melden und anschließend bestätigen.
- Speicherung bei Änderungen, Prüfung des Datenformats beim Laden sowie Erkennung eines zwischenzeitlich in einem anderen Fenster geänderten Arbeitsstands.

Bei neuer Erstbenutzung werden die Beispieldaten relativ zum aktuellen Berliner Datum angelegt. Ein gespeicherter Datenbestand wird beim nächsten Start nicht umdatiert. Die Speicherung gehört zur aufgerufenen Adresse: `localhost` und `127.0.0.1` sind unterschiedliche Speicherorte. Das Löschen der Browserdaten entfernt auch diesen lokalen Testbestand.

## Entwicklung und Prüfung

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

`npm run build` erzeugt die Anwendung in `dist/`. `npm run preview` startet eine lokale Vorschau dieses Builds auf Port 4173. Wegen der anderen Adresse ist ihr Browserspeicher getrennt vom Entwicklungsserver.

Die Tests prüfen unter anderem den Erhalt von Fristen beim Auflösen eines Projekts, das bestätigungspflichtige Mitlöschen offener Fristen, Partnerübernahmen, Datumsgrenzen mit Sommer-/Winterzeit und die Speicherung. Oberflächentests decken die wesentlichen Bedienabläufe ab.

## Spätere Windows-Anwendung

Die Oberfläche verwendet reguläre Browsertechnik und keine Funktionen aus ChatGPT. Beispielsweise kann [Electron](https://www.electronjs.org/docs/latest/) den Build später in einem eigenen Programmfenster ausführen. Installation, Updates, Betriebssystem-Anmeldung und sichere Desktop-Anbindungen werden in diesem Schritt ergänzt. Die erste Version enthält noch keinen Windows-Installer.

Für gemeinsame Kanzleidaten nutzen Web- und Desktop-Oberfläche später denselben zentralen Dienst. Der lokale Speicher wird dafür hinter der vorhandenen Speicherschnittstelle ersetzt. Die weitere Aufteilung steht in [docs/architecture.md](docs/architecture.md).
