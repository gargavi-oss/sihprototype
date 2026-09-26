import os
import json
import random

CONFIG_PATH = "../config/network_config.json"
TRACK_MAP_PATH = "../config/track_mapping.json"
ROUTES_PATH = "../config/routes.rou.xml"

STATION_IDS = {"STN_A", "STN_B", "STN_C", "STN_D", "STN_E", "STN_F"}

def get_station_track(track_map, station_id):
    """Get the first (only) platform track for a station."""
    if station_id in track_map["station_tracks"] and len(track_map["station_tracks"][station_id]) > 0:
        return track_map["station_tracks"][station_id][0]
    return None

def build_route_edges(track_map, start_station, track_seq):
    """
    Build the SUMO edge list and stop list for a route.
    
    The train starts at start_station's platform, then traverses each track
    in track_seq. If a track's destination is a station (not a junction),
    the platform edges and a stop are automatically inserted.
    """
    edges = []
    stops = []
    visited_stations = set()

    # Add starting station platform
    stn_track = get_station_track(track_map, start_station)
    if stn_track:
        edges.extend(stn_track["sections"])
        stops.append(stn_track["train_stop"])
        visited_stations.add(start_station)

    # Traverse inter-station tracks
    for track_id in track_seq:
        track_info = track_map["inter_station_tracks"][track_id]
        edges.extend(track_info["sections"])

        # If destination is a station, add its platform and a stop
        dest = track_info["to"]
        if dest in STATION_IDS and dest not in visited_stations:
            stn_track = get_station_track(track_map, dest)
            if stn_track:
                edges.extend(stn_track["sections"])
                stops.append(stn_track["train_stop"])
                visited_stations.add(dest)

    return edges, stops

def generate_schedule():
    with open(CONFIG_PATH, "r") as f:
        config = json.load(f)
    with open(TRACK_MAP_PATH, "r") as f:
        track_map = json.load(f)

    import numpy as np

    Y = np.load("../input/Y_matrix.npy")
    omega = np.load("../input/omega_matrix.npy")

    num_trains = Y.shape[0]

    engine_types = ["train_diesel", "train_electrified", "train_hybrid"]

    routes_xml = [
        '<routes>',
        '    <vType id="train_diesel" vClass="rail" length="100" maxSpeed="500.0" accel="10000.0" decel="10000.0" color="0,80,180" guiShape="rail" />',
        '    <vType id="train_electrified" vClass="rail" length="100" maxSpeed="500.0" accel="10000.0" decel="10000.0" color="255,0,0" guiShape="rail" />',
        '    <vType id="train_hybrid" vClass="rail" length="100" maxSpeed="500.0" accel="10000.0" decel="10000.0" color="0,80,180" guiShape="rail" />'
    ]

    timetable = []

    for i in range(num_trains):
        train_id = f"train_{i+1:03d}"

        # Find all active sections for this train in Y[n, j, t, k] 
        active_indices = np.argwhere(Y[i] == 1)
        if len(active_indices) == 0:
            continue
            
        # Sort by time 't'
        active_indices = sorted(active_indices, key=lambda x: x[1])
        depart_time = int(active_indices[0][1])

        edges = []
        stops = []
        visited_stations = set()

        # Build route
        for j, t, k in active_indices:
            track_id = f"R{j+1}"
            sec_id = f"{track_id}_S{k+1}"
            
            if len(edges) == 0 or edges[-1] != sec_id:
                edges.append(sec_id)
                
                # Check if it's a station platform to add a stop
                for sid, platforms in track_map["station_tracks"].items():
                    if sid not in visited_stations:
                        for p in platforms:
                            if sec_id in p["sections"]:
                                stops.append(p["train_stop"])
                                visited_stations.add(sid)
                                break

        route_id = f"route_{train_id}"
        edges_str = " ".join(edges)
        routes_xml.append(f'    <route id="{route_id}" edges="{edges_str}" />')

        # Read engine type from omega matrix
        try:
            engine_idx = int(np.argmax(omega[i]))
            engine_type = engine_types[engine_idx]
        except:
            engine_type = "train_diesel"

        routes_xml.append(
            f'    <vehicle id="{train_id}" type="{engine_type}" '
            f'route="{route_id}" depart="{depart_time}">'
        )
        for stop in stops:
            routes_xml.append(f'        <stop trainStop="{stop}" duration="1" />')
        routes_xml.append(f'    </vehicle>')

        path_desc = f"Route of {len(edges)} sections"

        timetable.append({
            "train": train_id,
            "depart": depart_time,
            "path": path_desc
        })

    routes_xml.append('</routes>')

    os.makedirs(os.path.dirname(ROUTES_PATH), exist_ok=True)
    with open(ROUTES_PATH, "w") as f:
        f.write("\n".join(routes_xml))

    print(f"Successfully generated {num_trains} trains in {ROUTES_PATH}")

    print("\n" + "="*80)
    print("SCHEDULED TIMETABLE VIEW (T[n, i, k, t])")
    print(f"{'Train (i)':<12} | {'Depart (t)':<12} | {'Route':<50}")
    print("-" * 80)
    timetable.sort(key=lambda x: x["depart"])
    for entry in timetable:
        mins = entry["depart"] // 60
        secs = entry["depart"] % 60
        time_str = f"{mins:02d}:{secs:02d}"
        print(f"{entry['train']:<12} | {time_str:<12} | {entry['path']:<50}")
    print("="*80)

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    generate_schedule()
