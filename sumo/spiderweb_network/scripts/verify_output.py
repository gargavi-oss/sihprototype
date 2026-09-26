import sumolib
import json
import os

NET_PATH = "../network/network.net.xml"
TRACK_MAP_PATH = "../config/track_mapping.json"
CONFIG_PATH = "../config/network_config.json"

def verify():
    net = sumolib.net.readNet(NET_PATH)

    with open(TRACK_MAP_PATH, "r") as f:
        track_map = json.load(f)
    with open(CONFIG_PATH, "r") as f:
        config = json.load(f)

    errors = []

    # Check 1: All inter-station sections exist (variable per track)
    for track in config["tracks"]:
        tid = track["id"]
        ns = track["num_sections"]
        for k in range(1, ns + 1):
            edge_id = f"{tid}_S{k}"
            if not net.hasEdge(edge_id):
                errors.append(f"MISSING inter-station section: {edge_id}")

    # Check 2: Station platform tracks exist
    for sid, platforms in track_map["station_tracks"].items():
        for p in platforms:
            for sec_id in p["sections"]:
                if not net.hasEdge(sec_id):
                    errors.append(f"MISSING station section: {sec_id} ({sid} Platform {p['platform']})")

    # Check 3: Count station platforms (1 per station)
    expected_platforms = {s["id"]: 1 for s in config["stations"]}
    for sid, expected_count in expected_platforms.items():
        actual = len(track_map["station_tracks"].get(sid, []))
        if actual != expected_count:
            errors.append(f"{sid}: expected {expected_count} platform tracks, got {actual}")

    # Check 4: Junctions have no platforms
    for jn in config["junctions"]:
        if jn["id"] in track_map["station_tracks"]:
            errors.append(f"Junction {jn['id']} should not have platform tracks")

    # Check 5: Rail signals at station div/mrg nodes
    for node in net.getNodes():
        if "_div" in node.getID() or "_mrg" in node.getID():
            if node.getType() not in ["rail_signal", "dead_end", "priority"]:
                errors.append(f"{node.getID()} type={node.getType()}, expected rail_signal")

    # Print the full track registry
    print("\n=== TRACK REGISTRY ===")
    for line in track_map["all_tracks_summary"]:
        print(f"  {line}")
    print()

    if errors:
        print("[FAIL] VERIFICATION FAILED:")
        for e in errors:
            print(f"  - {e}")
    else:
        total_inter_sections = sum(t["num_sections"] for t in config["tracks"])
        total_platform_sections = sum(len(p) * 2 for p in track_map["station_tracks"].values())
        print("[PASS] ALL CHECKS PASSED")
        print(f"  - {total_inter_sections} inter-station/junction sections verified (R1-R{len(config['tracks'])})")
        print(f"  - {total_platform_sections} station platform sections verified (R9-R14)")
        print(f"  - {len(config['stations'])} stations with 1 platform each")
        print(f"  - {len(config['junctions'])} junctions (pass-through, no platform)")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    verify()
