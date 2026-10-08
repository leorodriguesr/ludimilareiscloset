import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { showcaseVideos } from "./showcase-videos";

describe("showcaseVideos", () => {
  it("lista os cinco arquivos da vitrine", () => {
    assert.equal(showcaseVideos.length, 5);
    assert.deepEqual(
      showcaseVideos.map((video) => video.src),
      [
        "/videos/look-01.mp4",
        "/videos/look-02.mp4",
        "/videos/look-03.mp4",
        "/videos/look-04.mp4",
        "/videos/look-05.mp4",
      ],
    );
  });
});
