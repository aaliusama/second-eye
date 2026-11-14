# README product film

## Current inline film

The README now embeds `second-eye-film.webp` directly, following the animated-WebP approach used by the reference repository [omarjku/Mixymatchy](https://github.com/omarjku/Mixymatchy). It animates in the page without an MP4 link or a separate video player. This is a recorded product film, not a live application session. Animated images do not provide video playback controls.

Source: the newer `video/film/out/final-product-demo-1080p.mp4`, modified 14 November at 14:09, measured at 158.3 seconds. Export: 1000 px wide, 8 fps, animated WebP, quality 60, looping, silent. On-screen captions remain in the frames. A `picture` source selects the existing still for reduced-motion preferences, and a visible still-image link is provided.

```sh
ffmpeg -i video/film/out/final-product-demo-1080p.mp4 -vf "fps=8,scale=1000:-2:flags=lanczos" -c:v libwebp_anim -quality 60 -compression_level 4 -loop 0 -an docs/assets/readme/second-eye-film.webp
```

The film retains its own cited industry-survey slide; that figure is not a Second Eye evaluation result or a measured saving. Product evaluation remains the synthetic 15-case scenario shown in the film. Captures predate some current technical views and do not include the unmerged Unit 204 PR.

## Earlier MP4 export (retained, no longer linked from README)

The previous README used a static preview linked to a repository-hosted MP4. The original export and its provenance below are retained; the current README has no MP4 call to action.

- **Published asset:** `second-eye-demo-silent.mp4`
- **Preview:** `product-film-poster.jpg`, extracted at 00:18 from the existing film
- **Local source:** `video/film/out/final-product-demo-1080p.mp4`
- **Source duration:** 138.4 seconds (2:18), measured with ffprobe; source documentation describes a later 2:38 cut, which is not the artifact exported here
- **Output:** 1920 × 1080, H.264, yuv420p, fast-start MP4; no audio stream
- **Verified export:** 138.3 seconds, 13,835,978 bytes; one video stream, zero audio streams; full-file ffmpeg decode completed without errors
- **Content:** earlier application captures, captions, camera motion and an illustrated opening; simulated site data; 15-case golden evaluation

The local source already existed, so the Remotion composition was not rerendered. A separate silent distribution copy was exported; the original master and source project were left unchanged. This does not include the unmerged Unit 204 depth PR or its 18-case scenario. The film is not being designated as the final submission video.

Recreate from the repository root, with ffmpeg installed:

```sh
ffmpeg -i video/film/out/final-product-demo-1080p.mp4 -map 0:v:0 -c:v libx264 -crf 24 -preset medium -pix_fmt yuv420p -an -movflags +faststart docs/assets/readme/second-eye-demo-silent.mp4
ffmpeg -ss 18 -i video/film/out/final-product-demo-1080p.mp4 -frames:v 1 docs/assets/readme/product-film-poster.jpg
ffprobe -v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height -of json docs/assets/readme/second-eye-demo-silent.mp4
```

Validation: sampled frames across the source were inspected as a contact sheet. This is not a frame-by-frame review of a final submission take. Output stream metadata and full-file decoding are checked separately during export.
