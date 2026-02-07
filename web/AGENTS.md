# In-Game UX Principles

1. Keep layout geometry stable during interaction.
- Core rows (especially header/control rows) should keep a fixed height.
- Interaction state changes should not push the map or shift surrounding layout.

2. Prefer map-local actions over global panel expansion.
- Contextual actions (like attack resolution) should appear near the selected map location.
- Popups should appear only when the user has enough selection context to act.

3. Maximize map visibility and preserve aspect ratio.
- Treat the map as the primary surface.
- Use a strict landscape frame and avoid hidden height clamps that prevent growth on wider screens.

4. Match overlays to the rendered image area, not just the container.
- When using `object-contain`, project anchors into the actual drawn image rect.
- Territory markers, edges, and contextual popups must align with the visual map at all viewport sizes.

5. Reduce instructional copy; prioritize signal over narration.
- Assume users understand basic Risk flow.
- Remove repetitive helper text from primary UI.
- Use concise labels and tooltips for ambiguity, not persistent explanatory paragraphs.

6. Separate safe vs destructive keyboard shortcuts.
- Safe actions can use single-key shortcuts.
- Destructive/phase-ending actions require `Cmd/Ctrl` modifiers.
- Keep shortcuts predictable and phase-aware.

7. Clicking empty map space should clear transient selection state.
- Territory clicks should select.
- Background clicks should reset source/target highlights.
- This keeps interaction state easy to recover without extra controls.

8. Design for compactness first, then add only high-value chrome.
- Minimize vertical padding and duplicate stats in the top action area.
- Keep a single control row where possible: phase + current phase actions + history controls.
