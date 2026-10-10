# AirRadar V6 — 3D aircraft, aviation media and GPU acceptance

## Implemented
- Built-in **low-poly 3D models** (not licensed manufacturer CAD or photorealistic GLTF). Airbus A318–A321/A20N/A21N, Boeing 737/737 MAX/777/787/747, A330/A350/A380, regional jets, Cessna/Piper light aircraft and helicopters use bounded profile-based geometry. Real fuselage volume, swept and thick wings, wingtip devices, nacelles, cockpit/cabin glazing and tail differences; unknown ICAO types use a generic fallback.
- Rendering remains opt-in and capped at 12 aircraft. No model downloads, texture atlases, database calls or new SSE streams.
- Aviation Media uses official YouTube-nocookie **per-video** embedded players on a user click. Standard YouTube videos and live video IDs work only if the publisher allows embedding. Arbitrary player URLs, playlists, channels and other sites stay external links. AirRadar does not copy, restream or extract streams.
- Supported embeds preserve the direct original link if a provider refuses third-party playback, blocks age-restricted content, or uses geographic controls. No autoplay before user interaction; only one player is mounted.
- Real-world streaming availability/licensing is controlled by the original publisher. Verify each airport camera has a lawful source; a public URL alone does not establish a license.

## Automated QA (GitHub Actions)
The targeted V6 PR Chromium gate exercises 1366px desktop and 390px mobile **emulation** (not physical devices):
- Opt-in DEM and WebGL2 aircraft custom layer, GPU context availability, renderer identity and screenshot artifact.
- Presentation Mode.
- Explicit Aviation Media playback consent, exact trusted iframe endpoint, direct external fallback and screenshots without a network request to YouTube during tests.

CI may use SwiftShader. Passing CI **does not certify physical GPU acceleration or mobile battery/thermal limits**.

## Acceptance on REAL hardware
Use a development/production URL that serves the tested commit:

1. Desktop: enable hardware acceleration in Chrome or Chromium on a real GPU and run:
   `AIRRADAR_URL=https://airradar.pomykal.cz node scripts/verify-v6-3d-device.mjs --require-hardware`
2. Android: enable USB debugging and Chrome remote debugging. From a trusted development machine with `adb`:
   `adb forward tcp:9222 localabstract:chrome_devtools_remote`
   Then run:
   `AIRRADAR_DEVICE_CDP=http://127.0.0.1:9222 AIRRADAR_URL=https://airradar.pomykal.cz node scripts/verify-v6-3d-device.mjs --require-hardware`
   Verify manually that the connected CDP target belongs to the actual phone, not a local emulator.
3. iOS Safari: the Chromium CDP script **cannot** validate iOS Safari. Use Safari Web Inspector on a real iPhone/iPad; check enable/disable 3D, aircraft meshes, zoom/follow, context loss, visual correctness, fps, battery and throttling. Record screenshots and device / iOS details separately.
4. Compare a low-end and high-end phone, desktop discrete GPU and integrated GPU. Switch 2D → 3D → 2D, move/follow aircraft, background/resume, try poor network and loss of terrain tiles. 2D fallback must remain usable.
5. Archive `artifacts/v6-gpu-device/report.json` and `3d-active.png` with recorded browser/device identification. Review p50/p95 render intervals and context loss before marking a hardware matrix PASS. When GPU identity is hidden, the automated hardware assertion intentionally fails rather than asserting success.

The real-device script measures MapLibre render callbacks with 90 repaints and returns to 2D; it is a **probe**, not a claim of testing devices that are not connected.

## Source/provider constraints
- Official embed docs: https://developers.google.com/youtube/player_parameters
- Player integrity: https://developers.google.com/youtube/terms/required-minimum-functionality
- Publisher control and embed restrictions: https://support.google.com/youtube/answer/171780
- No embedding for arbitrary airport sites or ATC audio feeds without explicit compatible provider permission and technical API.
