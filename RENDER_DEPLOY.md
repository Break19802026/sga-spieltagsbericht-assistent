# Render Deployment

## Dateien

Für Render brauchst du mindestens:

- `server.js`
- `sga_spieltagsbericht_assistent.html`
- `package.json`
- optional `examples/reports.md`

## Render Environment Variables

In Render unter **Environment** setzen:

- `APP_PASSWORD`: Passwort für alle Nutzer
- `SESSION_SECRET`: langer zufälliger Wert, z. B. 32+ Zeichen
- `OPENAI_API_KEY`: dein OpenAI API-Key
- `OPENAI_MODEL`: optional, Standard ist `gpt-5`

`HOST` muss auf Render nicht gesetzt werden. Der Server nutzt standardmäßig `0.0.0.0`.

## Render Settings

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`

## Stilbeispiele

Wenn die App den Ton alter Berichte berücksichtigen soll, gute Beispielberichte in `examples/reports.md` einfügen. Diese Texte werden nur als Stilreferenz an OpenAI gegeben.
