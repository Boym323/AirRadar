/** Read-only Flight Story boundary for the /flights/[id] experience. */
export {
  getHistoryFlight as getFlightStory,
  HistoryDatabaseUnavailableError,
  HISTORY_POSITION_LIMIT,
  sampleFlightPositions,
} from "@/lib/server/history";
export type {
  FlightStoryEvent,
  FlightStoryEventType,
  HistoryFlightDetail as FlightStory,
} from "@/lib/server/history";
