# Extreme-altitude cluster root-cause audit

This is a SELECT-only forensic report. No production INSERT, UPDATE, DELETE,
backfill, restart, or release was performed.

## Result

The exact root cause is not objectively determinable from the retained data.
The strongest defensible conclusion is **multiple time-bounded ingest/decoder
conditions are present**: the pre-AC12 population already contains implausible
altitude jumps, while the known AC12 window adds a distinct repeated ~2x-like
signature. The current retained database contains no >80k point after
2026-09-27 10:28:46Z (12:28:46 CEST), so the alleged 10:47Z last extreme cannot
be independently verified from current `FlightPosition` rows.

## Phase counts

| Phase | Flights >80k | Points >80k | Flights >100k | Points >100k |
|---|---:|---:|---:|---:|
| PRE_AC12 09:05:00–09:41:25Z | 75 | 268 | 10 | 12 |
| KNOWN_AC12_WINDOW 09:41:25–10:28:52Z | 147 | 811 | 66 | 154 |
| POST_AC12_PRE_FIX 10:28:52–10:47:00Z | 0 | 0 | 0 | 0 |

The PRE phase is decisive against the claim that the entire cluster is the
known AC12 bug. Its retained sequences include ordinary airliners with smooth
lat/lon, ground speed and track but implausible altitude transitions. The
database cannot identify whether those values came from local Beast/readsb,
aircraft.json, ADSB.lol, or a merge.

## Timeline and lifecycle

The service restarted repeatedly at 10:59:38, 11:16:22, 11:21:40, 11:27:47,
11:41:25, 12:28:51, 13:06:57 and 13:10:56 CEST. Shutdown logs show aircraft
state stop, history drain, provider close, database close, and completion before
the next systemd start. This is evidence against stale AirRadar RAM surviving a
normal restart. At 11:19:18 CEST process 65372 emitted missing bundled `pino`
and `pg` module errors; it was stopped at 11:21:40.

The complete event list is in `extreme-altitude-timeline.json`.

## Provider and merge archaeology

Current code gives local position authority when available and treats position
as an atomic bundle in network merging. Local Beast/JSON altitude selection has
a 12,000 ft disagreement guard and field freshness. These safeguards describe
the current implementation; they do not prove the historical process had the
same code. Git history shows altitude/merge changes at 10:00:19, 11:31:10,
11:35:10, 11:38:12, 11:41:34, 12:07:20, 12:25:33 and 12:36:11 CEST. The
service log does not emit the loaded commit, so exact per-PID version mapping is
not available.

No raw Beast, readsb aircraft.json, ADSB.lol payload, source-switch event,
altitude-source disagreement, or duplicate-writer evidence was retained.

## Hypotheses

| Hypothesis | Support | Counter-evidence | Confidence |
|---|---|---|---|
| A. Known AC12 decoder bug | 154 of 193 retained >100k points lie in its affected window; known ~2x context exists | PRE phase has 268 >80k points before 09:41:25Z | High for part of KNOWN only |
| B. Another altitude decoder bug | PRE phase, impossible implied rates, ordinary airliner mix | No raw frame proves transform | Medium |
| C. Bad ADSB.lol data | Repeated provider timeout/error/recovery; network provider active | No row-level provider provenance or payload | Low–medium |
| D. Local/network merge bug | Historical merge/source provenance absent; smooth motion with altitude-only anomalies is compatible | Current merge is atomic/position-authoritative; no historical source trace | Low–medium |
| E. Stale state across reconnect | Provider reconnects are frequent | Clean AirRadar restart lifecycle and no durable stale-state trace | Low |
| F. Duplicate writer/release overlap | Many releases/restarts | No overlapping systemd PIDs or second writer evidenced | Low |
| G. Legitimate high altitude | Some values are sustained | Dominant ordinary airliner population and impossible transitions contradict it | Very low |
| H. Insufficient evidence | Missing raw/provider/commit provenance and POST rows | — | High as final overall conclusion |

## Classification disposition

No new production classification is applied. The prior conservative population
remains 336 Flights: 100 HIGHLY_SUSPICIOUS, 19 POSSIBLE, 217 UNKNOWN, zero
confirmed/near-certain and zero likely-legitimate. The known AC12 rows remain a
separate historical context; they must not be used to label every extreme row.

## Safety confirmation

Database writes: **NONE**  
Restart: **NONE**  
Release: **NONE**
