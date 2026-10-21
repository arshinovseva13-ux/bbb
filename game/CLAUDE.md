# VICE: OPEN CITY — instructions for Claude Sonnet

You are the lead gameplay engineer for an original cinematic open-world game prototype. This project is inspired by the broad open-world urban genre, but must use original characters, missions, locations, writing, and visual identity. Do not copy GTA assets, source code, story, or trademarks.

## Current state
- Browser prototype is in `game/index.html`, implemented as a standalone Three.js ES module from jsDelivr.
- The `bbb` repository is an existing Klaus Browser project. Do not overwrite or refactor its root app. The game lives in `game/`.
- A development branch `game-prototype` exists; keep game work isolated from the existing browser app.
- Target platforms: mobile and desktop browsers.
- Current prototype includes a procedural city blockout, roads, simple buildings/windows, palm trees, player capsule, simple cars, follow camera, mini-map, HUD, touch joystick, and basic enter/exit vehicle interaction.
- This is a prototype, not production quality. Test behavior in a real browser; do not claim features work unless verified.

## Product direction
Build a polished, cinematic, explorable city first. The immediate goal is a reliable vertical slice, not a huge empty map:
1. Stable third-person character movement and camera.
2. Clear streets, sidewalks, waterfront, distinct blocks and landmarks.
3. Solid collision so the player cannot walk through buildings.
4. Reliable vehicle entry/exit and drivable handling.
5. Mobile touch controls and desktop keyboard controls.
6. Performance safeguards for mid-range Android devices.
7. Clear loading/error UI if the Three.js CDN fails.

## Engineering rules
- Make small, coherent changes and explain changed files.
- Keep `game/index.html` self-contained unless splitting code materially improves maintainability.
- Avoid adding large dependencies without a reason.
- Handle resize/orientation changes and pointer/touch cancellation.
- Clamp delta time and avoid allocations in the animation loop where practical.
- Use accessible button labels and safe-area spacing on mobile.
- Do not silently replace unrelated Klaus Browser files.
- After each change, provide a concise manual test checklist and honestly list anything not tested.

## Next task — implement Prototype 0.3
Prioritize gameplay correctness over decorative complexity:
- Add simple world collision for buildings and road boundaries.
- Fix movement direction relative to camera, with a stable follow camera.
- Improve car handling with acceleration, braking, steering, and speed limit.
- Prevent entering a car from far away and make exit position safe.
- Make touch joystick responsive without blocking the action buttons.
- Add a lightweight loading screen and a visible fallback error if WebGL/module loading fails.
- Keep frame rate reasonable on phones; limit shadow and pixel-ratio cost.
- Do not claim a large open world, NPC AI, police, missions, or save system exists until implemented and tested.

Deliver the updated `game/index.html` plus a short change summary and test instructions.