# Supertitle Cuer

Cue opera supertitles from the score: number the cues on your PDF score, pair them with slides, and run them to a projector with one key.

- **Mark cues on the score.** Open the score PDF and click where each title should appear. Cues are numbered automatically by their place in the score — page first, then top to bottom, then left to right.
- **Combine several PDFs.** **PDFs** (above the score) adds another PDF before or after any part — say, Act 2 after Act 1 — and shows each part as a card you can drag to reorder. Cues travel with their pages and are renumbered to follow the new order; saving and printing keep the parts merged.
- **Pair them with slides.** Type titles in the slide list or import them from text or a CSV. Slide 1 goes with cue 1, and so on. Import can **fit text to the screen**: up to 6 lines on 16:9 and 4:3, 2 on the 6:1 strip, at your title size — sentences stay together, and a sentence too long for one slide continues on the next with “…” at both ends.
- **Flow mode** (¶ Flow, above the slides) lets you write the libretto as one continuous text that fills slides by itself as you type. It switches off (and locks) once the first cue is placed on the score, so cued slides never move.
- **Deleting is deliberate.** Deleting a supertitle asks whether to delete its cue too (off by default); deleting a cue on the score never touches the supertitles. Shift-click selects a range of supertitles to delete together.
- **Run the show.** In Show mode, press → / Space (or a presentation clicker) to advance. The current cue glows on the score, the next one pulses, and the title goes to the projector window. **B** blanks the screen.
- **One file per production.** Projects are saved as `.supertitles` files that hold the score, the cues, the slides and the display settings. **File → Save As PDF** stores the same project as a `.pdf` instead — it opens in any PDF viewer and still reopens here with everything editable. **File → Export Printable Score** writes a plain PDF with the numbered cues and a cue sheet, for the booth binder.

## Install

**Mac (Homebrew)**

```
brew install --cask poetic-pixie/tap/supertitle-cuer
```

Updates: `brew upgrade --cask supertitle-cuer`

Or download the `.dmg` from [Releases](https://github.com/poetic-pixie/supertitle-cuer/releases) (`arm64` for Apple Silicon, `x64` for Intel Macs), drag the app to Applications, and run once in Terminal:

```
xattr -dr com.apple.quarantine "/Applications/Supertitle Cuer.app"
```

(The app isn't signed with an Apple Developer ID, so macOS blocks it until that quarantine flag is removed. The Homebrew cask does this for you.)

**Windows**

Download `Supertitle_Cuer-Setup-<version>.exe` from [Releases](https://github.com/poetic-pixie/supertitle-cuer/releases) and run it. If Windows shows “Windows protected your PC”, click **More info → Run anyway**.

**No install**

`Supertitle_Cuer.html` (also on the Releases page) is the whole app in one file. Double-click it to run it in Google Chrome on any computer. It opens and saves the same `.supertitles` files.

## Desktop app extras

Compared with the single HTML file, the desktop app:

- opens `.supertitles` files when you double-click them,
- puts the projector window full screen on the second screen by itself (**View → Move Projector to Second Screen** if needed),
- keeps the computer and screens awake while in Show mode,
- saves straight to your file with no browser prompts, and asks before closing with unsaved changes.

## Building

Requires Node.js 22.

```
npm ci
npm start            # run the desktop app
npm run build:html   # build dist/Supertitle_Cuer.html only
npm run dist:mac     # Mac .dmg files (on a Mac)
npm run dist:win     # Windows installer (on Windows)
```

The app lives in `src/app.html`. `scripts/build-html.js` inlines pdf.js and pdf-lib into it to make the single-file version, and the desktop shell in `electron/` loads that same file.

**Releasing:** bump `version` in `package.json`, then on GitHub go to **Actions → Build & release → Run workflow**, tick **Publish a release**, and run it (pushing a tag such as `v1.0.1` works too). GitHub Actions builds the Mac and Windows apps and publishes them with the HTML file on the Releases page. Afterwards, update `version` and the two `sha256` values in `Casks/supertitle-cuer.rb` in [poetic-pixie/homebrew-tap](https://github.com/poetic-pixie/homebrew-tap) — the release's `SHA256SUMS.txt` lists them.
