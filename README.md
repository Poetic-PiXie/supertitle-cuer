# Supertitle Cuer (STQ)

Cue opera supertitles from the score: number the cues on your PDF score, pair them with slides, and run them to a projector with one key.

- **Mark cues on the score.** Open the score PDF and click where each title should appear. Cues are numbered automatically by their place in the score — page first, then row by row from the top, then left to right. A cue only counts as higher than its neighbor if its center is at least 1.5 × the cue radius above it; anything closer is on the same row. Clicking empty space un-highlights the current cue and slide (in Edit mode). Cue circle size is set in Settings (2–6, default 4). To fine-tune a cue, highlight it and use the arrow keys (5 px per press, 25 with Shift).
- **Combine several PDFs.** **PDFs** (above the score) adds another PDF before or after any part — say, Act 2 after Act 1 — and shows each part as a card you can drag to reorder. Cues travel with their pages and are renumbered to follow the new order, and their supertitles move with them so every pair stays matched; saving and printing keep the parts merged. Click or right-click a section heading for **Rename section…**, **Copy all slides**, or **Copy all slides + associated PDF**. Renaming the section leaves the original PDF filename intact; double-clicking its heading also starts a rename.
- **Pair them with slides.** Type titles in the slide list or import them from text, CSV, TSV or PowerPoint. Slide 1 goes with cue 1, and so on. **Add above** and **Add below** beside the selected slide insert an empty title on either side of it. Import can **fit text to the screen**: up to 6 lines on 16:9 and 4:3, 2 on the 6:1 strip — a sentence that doesn't fit in what's left of a slide starts there and continues on the next slide with “…” at both ends (it moves to the next slide whole only if fewer than two of its words would fit). **Shift+Return** puts a line break inside a slide.
- **Title layout by formula.** The text is the same size in every mode (137 px on an HD projector, 274 px in 4K): on the **6:1 strip** (a full-width band of height width/6), lines are 3/7 of the strip height and 3/70 apart with 5% top/bottom and 2% side margins; on **16:9** and the centered **4:3** area, lines are 137/1080 of the screen height, a tenth of that apart, with 47/540 top/bottom and 2% side margins. Titles are left-aligned by default (Settings → Alignment: left, center or right). **Side margins** in Settings go from 2% (the formula) to 6% of the width on each side, and **Vertical position** is a slider from top to bottom — on the 6:1 strip it moves the whole band on the projector — with a **Middle** button to re-center. **Text size** in Settings goes from 50% to 100% (100% = the formula, new projects start at 75%); at smaller sizes the lines and their gaps shrink together, a title keeps its 2 or 6 lines, and the freed height goes to the top and bottom margins. **Transition** (Cut, Soft Cut ⅙ s, Dissolve 1 s, Crossfade ⅔ s out + ⅔ s in) sets how one title gives way to the next; Blackout always cuts. The type size comes only from Settings, never from the amount of text: if a slide has more than fits, its box in the slide list turns red and the words that won't make it onto the screen are grayed out; the screens show only the lines that fit.
- **Flow mode** (¶ Flow, above the slides) lets you write the libretto as one continuous text. Typing and pasting into a slide preserve line breaks and move overflow forward, leaving earlier slides alone. At the start of a slide, **Backspace** (the Mac **Delete** key) joins it to the preceding slide, including across an automatic split or a manual break. **Return** makes a new slide; **Shift+Return** makes a line break. Flow switches off once the first cue is placed on the score, so cued slides never move.
- **Deleting is deliberate.** Deleting a supertitle asks whether to delete its cue too (off by default); deleting a cue on the score never touches the supertitles. Shift-click selects a range of supertitles to delete or move together: ▲/▼ (on any selected slide or in the selection bar) or dragging one of them moves the whole block. Clicking anywhere else ends the selection. Selecting a cue on the score moves keyboard focus away from slide text, so Delete/Backspace removes that cue with slides unlocked; clicking back into a slide restores text editing.
- **Reuse slides across projects.** Shift-click a range, then press **⌘C / Ctrl+C** or **Copy slides** in the selection bar. In the destination project, unlock slides in Edit mode, select the slide that should come before the copied block, and press **⌘V / Ctrl+V** or **Paste slides** beside it. Copies keep slide tags, cue colors and their source text/background colors. The destination's font, shape and text size determine wrapping; each copied slide remains one slide, with excess text grayed out instead of being split. A section-heading menu can copy all its titles, including waiting ones. **Copy all slides + associated PDF** also carries the score pages and cue links; pasting adds a new section after the selected PDF section, or at the end when no cue is selected. Reference recordings and cue timings stay with their original project.
- **Score on either side.** The ↔ button at the top of the slides panel swaps the score and the slides left and right; each computer remembers its choice.
- **See what the projector shows.** While the projector is on, the “Audience sees” preview mirrors the whole projector screen, with thin guide lines (on your screen only) marking the sides of the 4:3 area or the top and bottom of the 6:1 strip. On a PDF section's final cued slide, a red **Last Slide for this Section** label alerts the operator; the audience does not see it.
- **Keyboard in the slide list.** After clicking in the slide list, ↑/↓ step through the slides (after clicking the score, the arrows nudge the highlighted cue instead). While typing, ↑ on a slide's first line and ↓ on its last line continue into the neighboring slide.
- **Spelling.** Misspelled words get a red underline while you edit (the **✓abc** button above the slides, or **Edit → Check Spelling While Typing**, switches it off and on). Right-click a word for suggested fixes, **Learn** (add to your dictionary) or **Ignore**; in the desktop app, right-clicking a selected word also offers English synonyms, and on a Mac **Look Up** opens the system dictionary and thesaurus. The Mac uses its own spelling languages; on Windows, choose one in Settings → Spelling language.
- **Follow the music.** Supertitle Cuer can listen through a microphone during the show and count down while you cue manually. It learns the music from a **reference run** for each PDF: either **● Record** that part of a rehearsal or performance while you cue it, or **🔗 Link** an existing recording and cue along with it once (both on each PDF's card, and in **🎧 Follow**). A timed countdown stays visible when the match becomes uncertain, with a steady **⚠ Tentative** warning. If the audio stays quiet or unclear, the displayed value freezes and reads **Paused**. Each timed cue you press re-syncs it. The estimate can drift even without a warning; keep checking the score and cue manually. Recovery after a restart or cut can take time or fail. Reference runs and recordings made in the app are saved inside the project file.
- **Auto cueing.** **▶ Auto ▾** beside Follow offers **Auto recording…** and **Auto live (beta)**. It becomes available when the selected PDF section has a reference run and every cue is timed in order. Launching either mode shows that section's first title immediately, after a recording has loaded or live mode has started. Recording mode then plays the reference and changes later titles at their saved times; for a linked recording, choose the original file again when asked so STQ can verify its contents. Live mode follows the displayed numeric estimate, including a tentative estimate with its warning. Fresh estimates must agree on the due title for about 0.2 seconds. Silence or a paused estimate holds the current title; a forward estimate catches up, and Auto never goes backwards. Both start the section from the beginning and leave saved timings unchanged. Auto stops at the section's end; launch it again for each prepared section, and cue sections without a reference manually. Press **Space**, use the arrows or click a cue to take over; recording audio stops, while live mode returns to ordinary Follow. **Esc** or **Stop Auto** stops it. Watch the score throughout: live Auto does not guarantee an unattended performance, and matching can drift even without a warning.
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
- saves straight to your file with no browser prompts, and asks before closing with unsaved changes,
- offers **Recover** or **Start Fresh** if an interrupted session left unsaved work; after a normal close, it starts on the welcome screen.

## Credits

The English synonyms come from [WordNet 3.1](https://wordnet.princeton.edu/) (© Princeton University), built into `electron/thesaurus-en.txt.gz` by `scripts/build-thesaurus.py`.

## Building

Requires Node.js 22.

```
npm ci
npm test             # data, Flow, imports, saves and PDF lifecycle checks
npm run test:electron # desktop UI + cross-project transfer checks (requires a display)
npm start            # run the desktop app
npm run build:html   # build dist/Supertitle_Cuer.html only
npm run dist:mac     # Mac .dmg files (on a Mac)
npm run dist:win     # Windows installer (on Windows)
```

The app lives in `src/app.html`; the guide in `docs/manual/manual.html` (inlined into the app as Help). `scripts/manual-shots.py` remakes its screenshots from an example project, and `npx electron scripts/build-manual-pdf.js` builds `docs/Supertitle_Cuer_Manual.pdf`. `scripts/build-html.js` inlines pdf.js and pdf-lib into it to make the single-file version, and the desktop shell in `electron/` loads that same file.

**Releasing:** bump `version` in `package.json`, add `RELEASE-NOTES-<version>.md`, then on GitHub go to **Actions → Build & release → Run workflow**, tick **Publish a release**, and run it (pushing a tag such as `v1.0.1` works too). The audited 2.9.5 publication also starts when its release inputs or workflow are merged into `main`. GitHub Actions runs the regression suites, builds the Mac and Windows apps, and verifies the 2.9.5 runtime against the locally tested source and packaged-file hashes. The five downloads and checksum file are verified in a draft before publication. If that version already has a release, the workflow preserves its existing assets and release notes. Afterwards, update `version` and the two `sha256` values in `Casks/supertitle-cuer.rb` in [poetic-pixie/homebrew-tap](https://github.com/poetic-pixie/homebrew-tap) — the release's `SHA256SUMS.txt` lists them.
