import os
import traci
import numpy as np
import json
import random

CONFIG_PATH = "../config/network_config.json"
SUMO_CONFIG_PATH = "../config/simulation.sumocfg"

NUM_TRAINS = 20
NUM_TRACKS = 18
MAX_SECTIONS = 13
SIM_DURATION = 120

def parse_edge_id(edge_id):
    clean_id = edge_id.lstrip('-')
    if '_' not in clean_id:
        return None, None
    parts = clean_id.split('_')
    if len(parts) != 2 or not parts[0].startswith('R') or not parts[1].startswith('S'):
        return None, None
    
    try:
        j = int(parts[0][1:]) - 1
        k = int(parts[1][1:]) - 1
        return j, k
    except ValueError:
        return None, None

def run():
    # Override with SUMO_BINARY=sumo for headless runs (default: GUI)
    import sumolib
    sumo_binary = sumolib.checkBinary(os.environ.get("SUMO_BINARY", "sumo-gui"))
    traci.start([sumo_binary, "-c", SUMO_CONFIG_PATH])
    
    # Force each edge to take exactly 1 second to cross
    for edge_id in traci.edge.getIDList():
        if edge_id.startswith("R"):
            try:
                lane_id = edge_id + "_0"
                length = traci.lane.getLength(lane_id)
                traci.edge.setMaxSpeed(edge_id, length) # 1 sec per section
            except:
                pass
    
    T_out = np.zeros((NUM_TRAINS, NUM_TRACKS, MAX_SECTIONS, SIM_DURATION), dtype=np.int8)

    # ================================================================
    # Maintenance Event Configuration: Read from input matrices
    # ================================================================
    X_matrix = np.load("../input/X_matrix.npy")
    alpha_matrix = np.load("../input/alpha_matrix.npy")
    D_matrix = np.load("../input/D_matrix.npy")

    maintenance_events = []
    ev_id = 0

    active_blocks = np.argwhere(X_matrix == 1)
    
    for j, i, k in active_blocks:
        track_id = f"R{j+1}"
        block = f"{track_id}_S{k+1}"
        
        start = int(i)
        duration = int(D_matrix[j, k])
        
        alpha_val = int(alpha_matrix[j, k])
        m_type = "power" if alpha_val == 1 else "traffic"
        
        maintenance_events.append({
            "start": start, "end": start + duration,
            "block": block, "active": False, "id": ev_id,
            "type": m_type, "alpha": alpha_val
        })
        ev_id += 1

    print(f"\nScheduled {len(maintenance_events)} maintenance events:")
    for ev in maintenance_events:
        print(f"  [{ev['type'].upper()}] Block {ev['block']}: {ev['start']}s - {ev['end']}s ({ev['end']-ev['start']}s)")

    # Track dynamic block stops for the interlocking system
    active_block_stops = {}

    # Trajectory log for the web live map (read-only observation; does not
    # influence signalling). One frame per simulation step.
    trajectory_frames = []
    block_log = {ev["id"]: {"block": ev["block"], "type": ev["type"],
                            "planned_start": ev["start"], "planned_end": ev["end"],
                            "actual_start": None, "actual_end": None}
                 for ev in maintenance_events}

    step = 0
    while traci.simulation.getMinExpectedNumber() > 0:
        traci.simulationStep()

        # --- Maintenance Event Logic ---
        active_maint_blocks = []
        for ev in maintenance_events:
            if not ev["active"] and step >= ev["start"] and step < ev["end"]:
                # To prevent trains stopping suddenly due to sudden spawns,
                # we wait to activate maintenance until no train is within 1 block of it.
                safe_to_activate = True
                for veh_id in traci.vehicle.getIDList():
                    try:
                        v_route = traci.vehicle.getRoute(veh_id)
                        v_idx = traci.vehicle.getRouteIndex(veh_id)
                        for offset in [0, 1]:
                            if v_idx + offset < len(v_route) and v_route[v_idx + offset] == ev["block"]:
                                safe_to_activate = False
                                break
                    except:
                        pass
                
                if safe_to_activate:
                    ev["active"] = True
                    block_log[ev["id"]]["actual_start"] = step
                    print(f"\n[{step}s] MAINTENANCE ALERT: Block {ev['block']} is now under service!")
                    try:
                        lane_id = f"{ev['block']}_0"
                        shape = traci.lane.getShape(lane_id)
                        color = (255, 0, 0, 255) if ev["type"] == "power" else (0, 0, 255, 255)
                        traci.polygon.add(
                            f"maint_poly_{ev['id']}", shape,
                            color=color, fill=False, lineWidth=30, layer=100
                        )
                    except Exception:
                        pass
                else:
                    # Delay start time by 10 seconds to check again later
                    ev["start"] += 10
                    ev["end"] += 10

            elif ev["active"] and step >= ev["end"]:
                ev["active"] = False
                block_log[ev["id"]]["actual_end"] = step
                print(f"\n[{step}s] MAINTENANCE CLEARED: Block {ev['block']} service complete.")
                try:
                    traci.polygon.remove(f"maint_poly_{ev['id']}")
                except:
                    pass
            if ev["active"]:
                active_maint_blocks.append(ev["block"])
        # -------------------------------

        # ================================================================
        # Block Spacing / 2-Block Headway / Interlocking Logic
        # ================================================================
        edge_occupancy = {}
        for veh_id in traci.vehicle.getIDList():
            edge = traci.vehicle.getRoadID(veh_id)
            if edge not in edge_occupancy:
                edge_occupancy[edge] = []
            edge_occupancy[edge].append(veh_id)

        # Inject maintenance crews as phantom occupants
        for ev in maintenance_events:
            if ev["active"]:
                m_block = ev["block"]
                if m_block not in edge_occupancy:
                    edge_occupancy[m_block] = []
                occupant_type = "MAINTENANCE_CREW_POWER" if ev["type"] == "power" else "MAINTENANCE_CREW_TRAFFIC"
                edge_occupancy[m_block].append(occupant_type)

        # Block Reservation set (interlocking)
        reserved_blocks = set()

        # Sort vehicles: moving vehicles get priority over stopped vehicles
        all_vehicles = list(traci.vehicle.getIDList())
        all_vehicles.sort(key=lambda v: 1 if v in active_block_stops else 0)

        for veh_id in all_vehicles:
            try:
                route = traci.vehicle.getRoute(veh_id)
                edge_idx = traci.vehicle.getRouteIndex(veh_id)

                # 1. Absolute Block: Check current block for trains ahead
                occupied_ahead = None
                my_pos = traci.vehicle.getLanePosition(veh_id)
                current_edge = route[edge_idx]
                
                occupants = edge_occupancy.get(current_edge, [])
                for other_v in occupants:
                    if other_v != veh_id and not other_v.startswith("MAINTENANCE_CREW"):
                        try:
                            other_pos = traci.vehicle.getLanePosition(other_v)
                            if other_pos > my_pos:
                                occupied_ahead = current_edge
                                break
                        except:
                            pass
                    elif other_v.startswith("MAINTENANCE_CREW"):
                        if other_v == "MAINTENANCE_CREW_POWER":
                            v_type = traci.vehicle.getTypeID(veh_id)
                            if v_type == "train_electrified":
                                occupied_ahead = current_edge
                                break
                        else:
                            occupied_ahead = current_edge
                            break

                # 2. Look ahead exactly 1 block for other conditions (consistent 0-block gap)
                blocks_to_reserve = []
                if not occupied_ahead:
                    blocks_ahead = []
                    for offset in [1]:
                        if edge_idx + offset < len(route):
                            blocks_ahead.append((offset, route[edge_idx + offset]))

                    for offset, b_edge in blocks_ahead:
                        occupants = edge_occupancy.get(b_edge, [])
                        other_occupants = [v for v in occupants if v != veh_id]
                        
                        stops_for_block = False
                        for occupant in other_occupants:
                            if occupant == "MAINTENANCE_CREW_POWER":
                                v_type = traci.vehicle.getTypeID(veh_id)
                                if v_type == "train_electrified":
                                    stops_for_block = True
                                    break
                            else:
                                stops_for_block = True
                                break
                                
                        if b_edge in reserved_blocks:
                            stops_for_block = True
                            
                        if stops_for_block:
                            # Trigger stop 1 block before (0 empty blocks)
                            occupied_ahead = b_edge
                            break
                        
                        blocks_to_reserve.append(b_edge)

                if occupied_ahead:
                    if occupied_ahead == current_edge:
                        # Emergency: another train is ahead in the exact same block! Stop instantly.
                        traci.vehicle.setSpeed(veh_id, 0.0)
                        if veh_id not in active_block_stops:
                            active_block_stops[veh_id] = True
                            print(f"[{step}s] EMERGENCY STOP: Train {veh_id} halted instantly in {current_edge}.")
                    else:
                        # Normal RED signal: Proceed to the end of the current block and stop there.
                        lane_id = traci.vehicle.getLaneID(veh_id)
                        lane_length = traci.lane.getLength(lane_id)
                        stop_pos = max(10.0, lane_length - 70.0)
                        
                        if my_pos >= stop_pos:
                            traci.vehicle.setSpeed(veh_id, 0.0)
                            if veh_id not in active_block_stops:
                                active_block_stops[veh_id] = True
                                print(f"[{step}s] Signal: Train {veh_id} stopped at end of {current_edge} (obstacle at {occupied_ahead}).")
                        else:
                            # Approach the red signal slowly
                            traci.vehicle.setSpeed(veh_id, 10.0)
                else:
                    # Clear to proceed. Reserve next blocks.
                    for b_edge in blocks_to_reserve:
                        reserved_blocks.add(b_edge)
                        
                    traci.vehicle.setSpeed(veh_id, -1.0)
                    if veh_id in active_block_stops:
                        del active_block_stops[veh_id]
                        # Only resume if we actually stopped it
                        # traci.vehicle.resume(veh_id) is not needed if we use setSpeed
                        print(f"[{step}s] Signal: Train {veh_id} cleared to proceed.")
            except Exception:
                pass
        # ================================================================

        # Populate the 4D matrix T_out[n, j, k, t]
        for veh_id in traci.vehicle.getIDList():
            edge_id = traci.vehicle.getRoadID(veh_id)
            j, k = parse_edge_id(edge_id)

            if j is not None and k is not None:
                try:
                    train_idx = int(veh_id.split("_")[1]) - 1  # 0-indexed
                except (IndexError, ValueError):
                    continue

                if train_idx < NUM_TRAINS and step < T_out.shape[3]:
                    T_out[train_idx][j][k][step] = 1

        frame = {"t": step, "blocks": [ev["id"] for ev in maintenance_events if ev["active"]], "trains": []}
        for veh_id in traci.vehicle.getIDList():
            try:
                x, y = traci.vehicle.getPosition(veh_id)
                frame["trains"].append({
                    "id": veh_id,
                    "x": round(x, 1), "y": round(y, 1),
                    "angle": round(traci.vehicle.getAngle(veh_id), 1),
                    "edge": traci.vehicle.getRoadID(veh_id),
                    "speed": round(traci.vehicle.getSpeed(veh_id), 1),
                    "held": veh_id in active_block_stops,
                    "type": traci.vehicle.getTypeID(veh_id),
                })
            except Exception:
                pass
        trajectory_frames.append(frame)

        step += 1

    traci.close()

    # Save the matrix
    os.makedirs("../output", exist_ok=True)
    np.save("../output/T_matrix.npy", T_out)
    for ev in maintenance_events:  # blocks still active when the run ended
        if ev["active"] and block_log[ev["id"]]["actual_end"] is None:
            block_log[ev["id"]]["actual_end"] = step
    with open("../output/trajectory.json", "w") as f:
        json.dump({"steps": step, "frames": trajectory_frames,
                   "blocks": [dict(id=k, **v) for k, v in block_log.items()]}, f, separators=(",", ":"))
    print(f"Simulation finished. 4D matrix T({T_out.shape}) saved to output/T_matrix.npy.")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    run()
