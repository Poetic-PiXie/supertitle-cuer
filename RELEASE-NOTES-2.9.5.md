# Supertitle Cuer 2.9.5

This release brings the 2.9 editor, section tools, Follow guidance and Auto modes to the public Mac and Windows builds, including the latest cue-selection fix.

## Editing and sections

- Selecting a cue on the score now transfers keyboard focus out of slide text. Delete or Backspace removes that cue while slides remain unlocked. Clicking back into slide text restores normal editing.
- Flow-mode pastes preserve the target slide and explicit line breaks, with overflow flowing forward. Backspace at the start joins the preceding slide.
- Slide cards and audience preview share text wrapping. Cross-project slide copies retain source colors and show overflow using the destination layout.
- Add Above joins Add Below. Section headings offer Rename, Copy all slides, and Copy all slides + associated PDF.
- A red operator-only indicator marks the last cued slide of each PDF section.

## Follow and Auto

- Numeric countdowns stay visible with a steady tentative warning when matching is uncertain; quiet or unclear audio can pause the estimate.
- Auto recording plays the verified reference and advances at saved cue times. Auto live (beta) follows the displayed music estimate. Each section starts explicitly and stops at its own end; sections without a prepared reference remain manual.
- Launch either mode from the section heading or the Auto menu. Space, arrows or clicking a cue take over manually. Live following can drift and needs operator supervision.

## Reliability

- Safer project saves, recovery and recording operations; bounded PDF rendering for larger programs.
- Mac Quit now completes after the unsaved-work check. Cue dragging follows the visible marker after selection.
- Regression checks cover cue focus and Undo, editing, transfers, saves, audio lifecycle, Auto, and mixed 10- and 20-PDF programs.

## Downloads

- Apple Silicon Mac: `Supertitle_Cuer-2.9.5-arm64.dmg`
- Intel Mac: `Supertitle_Cuer-2.9.5-x64.dmg`
- Windows 64-bit: `Supertitle_Cuer-Setup-2.9.5.exe`
- Standalone browser app: `Supertitle_Cuer.html`
- User guide: `Supertitle_Cuer_Manual.pdf`

`SHA256SUMS.txt` lists the checksums for these five downloads.

Mac packages use ad hoc signatures and are not notarized with an Apple Developer ID. The Windows installer is unsigned. Apple Silicon runtime tests passed; Intel Mac and Windows packages were verified structurally and for payload integrity, without a hardware run on those platforms. Live Follow and Auto remain beta assistance.
