# Supertitle Cuer (STQ)

Cue opera supertitles from the score: number the cues on your PDF score, pair them with slides, and run them to a projector with one key.

- **Mark cues on the score.** Open the score PDF and click where each title should appear. Cues are numbered automatically by their place in the score — page first, then row by row from the top, then left to right. A cue only counts as higher than its neighbour if its centre is at least 1.5 × the cue radius above it; anything closer is on the same row. Clicking empty space un-highlights the current cue and slide (in Edit mode). Cue circle size is set in Settings (2–6, default 4). To fine-tune a cue, highlight it and use the arrow keys (5 px per press, 25 with Shift).
- **Combine several PDFs.** **PDFs** (above the score) adds another PDF before or after any part — say, Act 2 after Act 1 — and shows each part as a card you can drag to reorder. Cues travel with their pages and are renumbered to follow the new order, and their supertitles move with them so every pair stays matched; saving and printing keep the parts merged.
- **Pair them with slides.** Type titles in the slide list or import them from text or a CSV. Slide 1 goes with cue 1, and so on. Import can **fit text to the screen**: up to 6 lines on 16:9 and 4:3, 2 on the 6:1 strip — a sentence that doesn't fit in what's left of a slide starts there and continues on the next slide with “…” at both ends (it moves to the next slide whole only if fewer than two of its words would fit). **Shift+Return** puts a line break inside a slide.
- **Title layout by formula.** The text is the same size in every mode (137 px on an HD projector, 274 px in 4K): on the **6:1 strip** (a full-width band of height width/6), lines are 3/7 of the strip height and 3/70 apart with 5% top/bottom and 2% side margins; on **16:9** and the centred **4:3** area, lines are 137/1080 of the screen height, a tenth of that apart, with 47/540 top/bottom and 2% side margins. Titles are left-aligned by default (Settings → Alignment: left, center or right). **Side margins** in Settings go from 2% (the formula) to 6% of the width on each side, and **Vertical position** is a slider from top to bottom — on the 6:1 strip it moves the whole band on the projector — with a **Middle** button to re-centre. **Text size** in Settings goes from 75% to 100% (100% = the formula); at smaller sizes the freed height is shared evenly between the margins and the line gaps. The type size comes only from Settings, never from the amount of text: if a slide has more than fits, its box in the slide list turns red and the words that won't make it onto the screen are greyed out; the screens show only the lines that fit.
- **Flow mode** (¶ Flow, above the slides) lets you write the libretto as one continuous text that fills slides by itself as you type. It switches off (and locks) once the first cue is placed on the score, so cued slides never move.
- **Deleting is deliberate.** Deleting a supertitle asks whether to delete its cue too (off by default); deleting a cue on the score never touches the supertitles. Shift-click selects a range of supertitles to delete or move together: ▲/▼ (on any selected slide or in the selection bar) or dragging one of them moves the whole block. Clicking anywhere else ends the selection.
- **Score on either side.** The ↔ button at the top of the slides panel swaps the score and the slides left and right; each computer remembers its choice.
- **See what the projector shows.** While the projector is on, the “Audience sees” preview mirrors the whole projector screen, with thin guide lines (on your screen only) marking the sides of the 4:3 area or the top and bottom of the 6:1 strip.
- **Keyboard in the slide list.** After clicking in the slide list, ↑/↓ step through the slides (after clicking the score, the arrows nudge the highlighted cue instead). While typing, ↑ on a slide's first line and ↓ on its last line continue into the neighbouring slide.
- **Spelling.** Misspelled words get a red underline while you edit (the **✓abc** button above the slides, or **Edit → Check Spelling While Typing**, switches it off and on). Right-click a word for suggested fixes, **Learn** (add to your dictionary) or **Ignore**; in the desktop app, right-clicking a selected word also offers English synonyms, and on a Mac **Look Up** opens the system dictionary and thesaurus. The Mac uses its own spelling languages; on Windows, choose one in Settings → Spelling language.
- **Follow the music (new in 2.0).** Supertitle Cuer can listen through a microphone during the show and count down to the next cue — it never changes a title by itself. It learns the music from a **reference run** for each PDF: either **● Record** that part of a rehearsal or performance while you cue it, or **🔗 Link** an existing recording and cue along with it once (both on each PDF's card, and in **🎧 Follow**). Each cue you press re-syncs it, it waits through pauses and applause, and after a restart or a cut it finds its place again by itself within a few seconds. The reference runs (and recordings made in the app) are saved inside the project file.
- **Run the show.** In Show mode, press → / Space (or a presentation clicker) to advance. The current cue glows on the score, the next one pulses, and the title goes to the projector window. **B** blanks the screen.
- **One file per production.** Projects are saved as `.supertitles` files that hold the score, the cues, the slides and the display settings. **File → Save As PDF** stores the same project as a `.pdf` instead — it opens in any PDF viewer and still reopens here with everything editable. **File → Export Printable Score** writes a plain PDF with the numbered cues and a cue sheet, for the booth binder.

## Help

**❔ Help** in the app (or F1, ⌘? / Ctrl+?) opens a searchable guide to every button and panel, with a Quick Start. The same guide is a PDF: [Supertitle_Cuer_Manual.pdf](https://github.com/Poetic-PiXie/supertitle-cuer/releases/latest/download/Supertitle_Cuer_Manual.pdf) (also in `docs/`).

## Install

**Mac** — one line in Terminal.

*If you already have Homebrew:*

```
brew install --cask poetic-pixie/tap/supertitle-cuer && xattr -dr com.apple.quarantine "/Applications/Supertitle Cuer.app"
```

*If you don't have Homebrew yet* (installs Homebrew, then the app):

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" && eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv)" && brew install --cask poetic-pixie/tap/supertitle-cuer && xattr -dr com.apple.quarantine "/Applications/Supertitle Cuer.app"
```

Updates: `brew update && brew upgrade --cask supertitle-cuer`

Or download the `.dmg` from [Releases](https://github.com/poetic-pixie/supertitle-cuer/releases) (`arm64` for Apple Silicon, `x64` for Intel Macs), drag the app to Applications, and run once in Terminal:

```
xattr -dr com.apple.quarantine "/Applications/Supertitle Cuer.app"
```

(The app isn't signed with an Apple Developer ID, so macOS blocks it until that quarantine flag is removed.)

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

## Credits

The English synonyms come from [WordNet 3.1](https://wordnet.princeton.edu/) (© Princeton University), built into `electron/thesaurus-en.txt.gz` by `scripts/build-thesaurus.py`.

## Building

Requires Node.js 22.

```
npm ci
npm start            # run the desktop app
npm run build:html   # build dist/Supertitle_Cuer.html only
npm run dist:mac     # Mac .dmg files (on a Mac)
npm run dist:win     # Windows installer (on Windows)
```

The app lives in `src/app.html`; the guide in `docs/manual/manual.html` (inlined into the app as Help). `scripts/manual-shots.py` remakes its screenshots from an example project, and `npx electron scripts/build-manual-pdf.js` builds `docs/Supertitle_Cuer_Manual.pdf`. `scripts/build-html.js` inlines pdf.js and pdf-lib into it to make the single-file version, and the desktop shell in `electron/` loads that same file.

**Releasing:** bump `version` in `package.json`, then on GitHub go to **Actions → Build & release → Run workflow**, tick **Publish a release**, and run it (pushing a tag such as `v1.0.1` works too). GitHub Actions builds the Mac and Windows apps and publishes them with the HTML file on the Releases page. Afterwards, update `version` and the two `sha256` values in `Casks/supertitle-cuer.rb` in [poetic-pixie/homebrew-tap](https://github.com/poetic-pixie/homebrew-tap) — the release's `SHA256SUMS.txt` lists them.
