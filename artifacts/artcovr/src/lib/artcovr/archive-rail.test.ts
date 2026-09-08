import assert from "node:assert/strict";
import { test } from "node:test";
import { carouselCardSizeForViewport, carouselRailCardLeft, carouselRailTravel, makeJourneyConsts, journeyPhases, spiralLeadEntryX } from "../../components/parity/journey.ts";

test("archive rail starts flush left and reaches the same edge with its final card", () => {
  for (const count of [1, 2, 40, 92, 187]) {
    for (const height of [600, 844, 960, 1080, 1440]) {
      const size = carouselCardSizeForViewport(height);
      const gap = Math.round(size * 0.06);
      const travel = carouselRailTravel(count, size, gap);
      assert.equal(carouselRailCardLeft(0, size, gap, 0), 0);
      assert.equal(carouselRailCardLeft(count - 1, size, gap, travel), 0);
      for (let index = 0; index < count; index++) {
        assert.equal(carouselRailCardLeft(index, size, gap, index * (size + gap)), 0);
      }
    }
  }
});

test("left-aligned carousel and scaled spiral lead share an identical handoff pose", () => {
  for (const width of [390, 768, 998, 1069, 1440, 1920]) {
    for (const height of [600, 960, 1080]) {
      const size = carouselCardSizeForViewport(height);
      const leadCenter = width / 2 + spiralLeadEntryX(width, size);
      assert.equal(leadCenter - size / 2, 0, `${width} × ${height} entrance must be flush left`);
      const phases = journeyPhases(makeJourneyConsts(92).carouselEndP, makeJourneyConsts(92));
      assert.equal(phases.c, 1);
      assert.ok(Math.abs(phases.handoff - 0.5) < 0.00001);
    }
  }
});
