# README product film

The README uses a static preview linked to a repository-hosted MP4. The image remains readable without motion, and the video opens only when the viewer chooses it. This is a linked video, not a claim of inline playback in every Markdown renderer.

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
