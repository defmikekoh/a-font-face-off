# Slider read/write batching experiment

## Decision

Keep the current slider handlers. This candidate did not produce a consistent improvement: single-panel Body Contact and Face-off synchronous work increased about 7–13%, while TMI and multi-panel results were mixed. Frame timing did not improve consistently. No production code was changed.

Tested September 15, 2026 against revision `e743d9f`. Four repetitions per variant/workload are exploratory evidence, not a precise estimate of user-visible latency.

## Method

Note10 RF8M81WSL1V, Firefox Nightly 158.0a1. Same debug-off instrumented extension/session. Current and batched handlers alternated AB/BA across four repetitions per workload. 80 input events per panel over 40 frames; one or all panels, line-height and synthetic wdth axis. Local Roboto excludes download time. Each drag settles for 350 ms before checking storage.

The experimental flush snapshots all pending panels before writing previews, then starts button checks. Immediate persistence is unchanged. The current implementation interleaves each panel’s config read, preview writes, and button check. This experiment tests DOM read/write ordering, not storage batching.

Sync work is input dispatch plus synchronous flush time (including the synchronous portion of button checks). It excludes later async storage/button work, browser rendering and paint. Frame intervals are animation-frame callback timestamps, not physical touch latency. Multi-panel input is a stress case; ordinary dragging changes one slider.

## Results

| Workload (mode/panels/control) | Sync work ms, current → batched | Change | Flush ms, current → batched | p95 frame ms, current → batched |
|---|---:|---:|---:|---:|
| body-contact/1/line-height | 72.0 → 79.5 | 10.4% | 15.5 → 19.0 | 16.7 → 16.7 |
| body-contact/1/wdth | 63.5 → 71.5 | 12.6% | 13.5 → 19.5 | 16.7 → 16.7 |
| third-man-in/1/line-height | 73.5 → 71.0 | -3.4% | 18.0 → 15.5 | 16.7 → 16.7 |
| third-man-in/1/wdth | 77.0 → 76.5 | -0.6% | 19.0 → 16.5 | 16.7 → 16.7 |
| third-man-in/3/line-height | 128.5 → 143.5 | 11.7% | 29.5 → 25.5 | 16.7 → 31.8 |
| third-man-in/3/wdth | 138.0 → 129.0 | -6.5% | 33.0 → 23.0 | 33.4 → 16.7 |
| faceoff/1/line-height | 64.0 → 71.0 | 10.9% | 11.5 → 14.5 | 16.7 → 16.7 |
| faceoff/1/wdth | 76.0 → 81.0 | 6.6% | 14.0 → 19.5 | 16.7 → 16.7 |
| faceoff/2/line-height | 97.5 → 98.0 | 0.5% | 17.5 → 17.0 | 16.7 → 16.7 |
| faceoff/2/wdth | 97.0 → 102.5 | 5.7% | 19.0 → 17.0 | 16.7 → 16.7 |

All 80 cases retained matching final configuration, persisted state, preview CSS and storage-write counts between variants.

Artifacts: [raw results](../../ztemp/slider-batching/results.json), [probe with experimental implementation](../../ztemp/slider-batching/probe.js), [packager](../../ztemp/slider-batching/prepare.cjs), [Android runner](../../ztemp/slider-batching-run.cjs).

Raw artifacts are local, gitignored experiment files under `ztemp/slider-batching/`.
