# AirRadar V6 — retired 3D radar and retained aviation media QA

The optional 3D radar, terrain, aircraft meshes, licensed GLB loader and real-device 3D probe described by the historical acceptance plan were retired in the approved 2026-10-18 batch. Their runtime code, download path, GPU checks and browser gate were removed.

Aviation Media remains a separate feature: official YouTube-nocookie per-video embeds are created only after user interaction, arbitrary player URLs are rejected, and the original publisher link remains available when embedding is unavailable. The active production CI gate retains consent, exact iframe endpoint and fallback checks for Aviation Media and the separate Presentation Mode.
