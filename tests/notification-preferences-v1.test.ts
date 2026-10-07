import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  notificationPreferenceKeyForEvent,
  parseNotificationPreferencePatch,
  parseNotificationPreferenceValues,
} from "@/lib/notification-preferences";
import {
  MemoryNotificationPreferencesStore,
  channelsForNotificationMode,
} from "@/lib/server/notification-preferences";

describe("Notification Preferences V1", () => {
  it("keeps noise-control defaults while preserving explicit alert lanes", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual({
      watchlist: "PUSH",
      emergency: "PUSH",
      firstSeen: "CENTER_ONLY",
      receptionRecord: "CENTER_ONLY",
      flightIntelligence: "PUSH",
      predictive: "PUSH",
    });
  });

  it("classifies canonical event families into independent preferences", () => {
    expect(notificationPreferenceKeyForEvent("new_aircraft")).toBe("firstSeen");
    expect(notificationPreferenceKeyForEvent("reception_record")).toBe("receptionRecord");
    expect(notificationPreferenceKeyForEvent("emergency_7700")).toBe("emergency");
    expect(notificationPreferenceKeyForEvent("intelligence_go_around")).toBe("flightIntelligence");
    expect(notificationPreferenceKeyForEvent("predictive_eta")).toBe("predictive");
    expect(notificationPreferenceKeyForEvent("entered_radius")).toBe("watchlist");
    expect(notificationPreferenceKeyForEvent("weather_proximity")).toBeNull();
  });

  it("validates complete values and bounded partial updates", () => {
    expect(parseNotificationPreferenceValues(DEFAULT_NOTIFICATION_PREFERENCES)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(parseNotificationPreferenceValues({ ...DEFAULT_NOTIFICATION_PREFERENCES, firstSeen: "LOUD" })).toBeNull();
    expect(parseNotificationPreferencePatch({ firstSeen: "PUSH" })).toEqual({ firstSeen: "PUSH" });
    expect(parseNotificationPreferencePatch({ unknown: "PUSH" })).toBeNull();
  });

  it("updates preferences without mutating unrelated defaults", () => {
    const store = new MemoryNotificationPreferencesStore();
    const next = store.update({ firstSeen: "PUSH", receptionRecord: "OFF" });
    expect(next.values.firstSeen).toBe("PUSH");
    expect(next.values.receptionRecord).toBe("OFF");
    expect(next.values.emergency).toBe("PUSH");
    expect(next.updatedAt).not.toBeNull();
  });

  it("maps durable delivery modes to provider channels", () => {
    expect(channelsForNotificationMode("PUSH", ["IN_APP", "PUSHOVER"])).toEqual(["IN_APP", "PUSHOVER"]);
    expect(channelsForNotificationMode("CENTER_ONLY", ["IN_APP", "PUSHOVER"])).toEqual([]);
    expect(channelsForNotificationMode("OFF", ["PUSHOVER"])).toBeNull();
  });
});
