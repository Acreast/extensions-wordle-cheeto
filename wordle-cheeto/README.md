# Wordle Cheeto

A Chrome/Edge Manifest V3 extension that reads the visible NYT Wordle board and filters a local five-letter word list into recommendations.

## Files

- `manifest.json` registers the extension, popup, background service worker, and Wordle content script.
- `content.js` observes Wordle tiles and sends completed guesses plus color feedback to the background worker.
- `background.js` loads `words.json`, applies Wordle-style duplicate-letter filtering, and ranks remaining candidates.
- `popup.html`, `popup.css`, and `popup.js` render guesses, remaining candidate count, recommendations, and a candidate preview.
- `words.txt` is the source word list.
- `words.json` is the extension-ready generated word list.

## Load The Extension

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the downloaded folder "wordle-cheeto" and open.
5. Open NYT Wordle, make a guess, then open the extension popup.

## Regenerate `words.json`

Run this from the project folder after editing `words.txt`:

```powershell
$words = Get-Content words.txt | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ -match '^[a-z]{5}$' } | Sort-Object -Unique
$json = $words | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'words.json'), $json, [System.Text.UTF8Encoding]::new($false))
```
