---
description: Comprehensive guidelines for the SUMO Railway Simulation architecture, signalling, schedule generation, and maintenance events. Use these rules to ensure future additions do not conflict with the core simulation logic.
---

# SUMO Railway Simulation Architecture & Rules

This document outlines the core logic and structural rules developed for the railway simulation project. Adhere to these principles whenever modifying or expanding the codebase to prevent conflicts or deadlocks.

## 1. Single Platform Architecture
- **Topology Offset**: All stations must use a single platform layout. The `TOPOLOGY_OFFSETS` in `build_network.py` must remain `[0]` for all station types.
- **Routing**: Inter-station routes (`VALID_PATHS` in `generate_schedule.py`) must only connect valid downstream stations (e.g., A->B, A->C, A->D). Head-on collisions are avoided inherently by only generating uni-directional traffic flows.

## 2. Advanced Signalling: 2-Block Headway & Interlocking
The simulation uses a custom Absolute Block Signalling system in `run_simulation.py` to handle all conflict resolution natively, without relying on TraCI's brittle `setStop` mechanisms.
- **Occupancy Detection**: At every step, `edge_occupancy` dynamically tracks which vehicles (and maintenance crews) are on which track sections.
- **Interlocking (Junction Protection)**:
  - Vehicles are evaluated in priority order: moving vehicles first, stopped vehicles second.
  - A vehicle looks ahead 2 blocks (`edge_idx + 1` and `edge_idx + 2`).
  - If the blocks are physically occupied OR reserved by another moving train in the current time step, the vehicle is commanded to STOP.
- **Stopping Mechanism**: The system uses `traci.vehicle.setSpeed(veh_id, 0.0)` to safely decelerate a train to a halt before an occupied/reserved block. It uses `traci.vehicle.setSpeed(veh_id, -1.0)` to clear the stop and return speed control to SUMO's car-following model. 
- **NEVER use `setStop`**: Do not use `traci.vehicle.setStop` for dynamic signalling or collision avoidance, as it causes "not downstream" TraCI errors and permanent deadlocks if the train misses the braking window.

## 3. Maintenance Simulation
- Maintenance events are simulated as "Phantom Crews".
- Instead of adding complex speed limit overrides, maintenance is achieved by simply injecting `"MAINTENANCE_CREW"` into the `edge_occupancy` map for a specific block (`RX_SY`).
- The 2-Block Headway logic automatically detects this crew and safely halts any approaching trains, creating a natural, cascading queue block-by-block.
- Multiple random maintenance blocks can be simulated simultaneously using this approach.

## 4. Output Verification
- The 4D state matrix `T(n, i, k, t)` accurately logs the spatiotemporal state of the network. `n` = station, `i` = train, `k` = track section, `t` = time step (seconds).
- Any structural changes must pass `verify_output.py`. 

## 5. Conflict Testing
- To test the signalling and interlocking, explicitly generate schedules where multiple trains depart simultaneously from the same origin, or arrive simultaneously at a merging junction (e.g. `STN_D`). The signalling logic handles all convergence safely.
