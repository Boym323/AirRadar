import { describe, expect, it } from "vitest";
import { AtcPredictionValidation } from "@/lib/server/atc-prediction-validation";

describe("ATC prediction validation", () => {
  it("confirms a prediction only after the actual sector transition", () => {
    const validation = new AtcPredictionValidation();
    validation.observeCurrentSector("ABC", "A", 0);
    validation.observePrediction({ hex: "ABC", currentSector: "A", predictedSector: "B", predictedEtaSeconds: 60, now: 1_000 });
    validation.observeCurrentSector("ABC", "B", 61_000);
    validation.observeCurrentSector("ABC", "B", 61_000);
    expect(validation.getSnapshot()).toMatchObject({ created: 1, confirmed: 1, wrong: 0, transitionWithoutPrediction: 0, medianEtaErrorSeconds: 0, medianLeadTimeSeconds: 60 });
  });

  it("classifies a transition to another sector as wrong", () => {
    const validation = new AtcPredictionValidation();
    validation.observeCurrentSector("ABC", "A", 0);
    validation.observePrediction({ hex: "ABC", currentSector: "A", predictedSector: "B", predictedEtaSeconds: 60, now: 1_000 });
    validation.observeCurrentSector("ABC", "C", 61_000);
    validation.observeCurrentSector("ABC", "C", 62_000);
    expect(validation.getSnapshot()).toMatchObject({ created: 1, confirmed: 0, wrong: 1 });
  });

  it("counts a changed prediction once and confirms the replacement", () => {
    const validation = new AtcPredictionValidation();
    validation.observeCurrentSector("ABC", "A", 0);
    validation.observePrediction({ hex: "ABC", currentSector: "A", predictedSector: "B", predictedEtaSeconds: 60, now: 1_000 });
    validation.observePrediction({ hex: "ABC", currentSector: "A", predictedSector: "C", predictedEtaSeconds: 90, now: 2_000 });
    validation.observeCurrentSector("ABC", "C", 92_000);
    validation.observeCurrentSector("ABC", "C", 93_000);
    expect(validation.getSnapshot()).toMatchObject({ created: 1, updated: 1, changed: 1, confirmed: 1, wrong: 0 });
  });

  it("classifies every evaluation into one attempt outcome", () => {
    const validation = new AtcPredictionValidation();
    validation.observeCurrentSector("ABC", "A", 0);
    validation.observePrediction({ hex: "ABC", currentSector: "A", predictedSector: "B", predictedEtaSeconds: 60, now: 1_000 });
    validation.observePrediction({ hex: "ABC", currentSector: "A", predictedSector: "B", predictedEtaSeconds: 60, now: 2_000 });
    validation.observePrediction({ hex: "ABC", currentSector: "A", predictedSector: "C", predictedEtaSeconds: 90, now: 3_000 });
    validation.observePrediction({ hex: "ABC", currentSector: "A", predictedSector: null, predictedEtaSeconds: null, suppressionReason: "slow", now: 4_000 });
    const snapshot = validation.getSnapshot();
    expect(snapshot).toMatchObject({ attempts: 4, created: 1, retained: 1, updated: 1, suppressed: 1 });
    expect(snapshot.attempts).toBe(snapshot.created + snapshot.suppressed + snapshot.retained + snapshot.updated);
    expect(snapshot.attemptOutcomes).toEqual({ created: 1, suppressed: 1, retained: 1, updated: 1 });
  });

  it("fails closed into the existing other suppression reason", () => {
    const validation = new AtcPredictionValidation();
    validation.observePrediction({ hex: "ABC", currentSector: "A", predictedSector: null, predictedEtaSeconds: null });
    expect(validation.getSnapshot()).toMatchObject({ attempts: 1, suppressed: 1, suppressionReasons: { other: 1 } });
  });

  it("expires an old prediction without deleting current-sector tracking", () => {
    const validation = new AtcPredictionValidation();
    validation.observeCurrentSector("ABC", "A", 0);
    validation.observePrediction({ hex: "ABC", currentSector: "A", predictedSector: "B", predictedEtaSeconds: 60, now: 1_000 });

    validation.getSnapshot(302_000);
    expect(validation.getCurrentSector("ABC")).toBe("A");
    expect(validation.getSnapshot(302_000).activeStates).toBe(1);

    validation.observeCurrentSector("ABC", "B", 303_000);
    validation.observeCurrentSector("ABC", "B", 304_000);
    expect(validation.getSnapshot(304_000)).toMatchObject({
      confirmed: 0,
      wrong: 0,
      transitionWithoutPrediction: 1,
      activeStates: 1,
    });
  });

  it("records suppression reasons and does not double count an unchanged transition", () => {
    const validation = new AtcPredictionValidation();
    validation.observePrediction({ hex: "ABC", currentSector: "A", predictedSector: null, predictedEtaSeconds: null, suppressionReason: "slow", now: 1_000 });
    validation.observeCurrentSector("ABC", "A", 2_000);
    validation.observeCurrentSector("ABC", "B", 3_000);
    validation.observeCurrentSector("ABC", "B", 4_000);
    expect(validation.getSnapshot()).toMatchObject({ attempts: 1, suppressed: 1, transitionWithoutPrediction: 1 });
    expect(validation.getSnapshot().suppressionReasons.slow).toBe(1);
  });
});
