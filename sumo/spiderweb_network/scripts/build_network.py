import json
import os
import subprocess
import numpy as np

CONFIG_PATH = "../config/network_config.json"
NODES_PATH = "../network/nodes.nod.xml"
EDGES_PATH = "../network/edges.edg.xml"
TYPES_PATH = "../network/types.type.xml"
ADDITIONAL_PATH = "../config/additional.add.xml"
ROUTES_PATH = "../config/routes.rou.xml"
NET_UNBIDI_PATH = "../network/network_unidirectional.net.xml"
NET_BIDI_PATH = "../network/network.net.xml"
SUMO_CONFIG_PATH = "../config/simulation.sumocfg"
TRACK_MAP_PATH = "../config/track_mapping.json"

# Single platform per station
TOPOLOGY_OFFSETS = [0]

def load_config():
    with open(CONFIG_PATH, "r") as f:
        return json.load(f)

def write_xml(filepath, root_tag, elements):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w") as f:
        f.write(f"<{root_tag}>\n")
        for e in elements:
            f.write(f"    {e}\n")
        f.write(f"</{root_tag}>\n")

def generate_types(config):
    elements = [
        f'<type id="rail_track" numLanes="1" speed="{config["max_speed_ms"]}" allow="{config["vehicle_class"]}" />'
    ]
    write_xml(TYPES_PATH, "types", elements)

def get_entity_pos(config, entity_id):
    """Get x,y position of a station or junction."""
    for stn in config["stations"]:
        if stn["id"] == entity_id:
            return stn["x"], stn["y"]
    for jn in config["junctions"]:
        if jn["id"] == entity_id:
            return jn["x"], jn["y"]
    return 0, 0

def generate_nodes_and_edges(config):
    nodes = []
    edges = []
    additional = []

    stn_map = {}   # station_id -> station config (with div_id, mrg_id)
    jn_set = set() # junction IDs

    # Platform R-numbers start after inter-station tracks
    next_r = len(config["tracks"]) + 1

    STATION_TRACKS = {}
    ALL_TRACKS = {}

    # Register inter-station tracks
    for track in config["tracks"]:
        ns = track["num_sections"]
        ALL_TRACKS[track["id"]] = {
            "type": "inter_station",
            "from": track["from"],
            "to": track["to"],
            "sections": ns,
            "section_ids": [f'{track["id"]}_S{k}' for k in range(1, ns + 1)]
        }

    # 1. Generate Junction Nodes (simple pass-through, no platform)
    for jn in config["junctions"]:
        jn_set.add(jn["id"])
        nodes.append(f'<node id="{jn["id"]}" x="{jn["x"]}" y="{jn["y"]}" type="rail_signal" />')

    # 2. Generate Station Nodes & Platform Edges
    for stn in config["stations"]:
        sid = stn["id"]
        cx, cy = stn["x"], stn["y"]

        div_x = cx - 300
        mrg_x = cx + 300

        nodes.append(f'<node id="{sid}_div" x="{div_x}" y="{cy}" type="rail_signal" />')
        nodes.append(f'<node id="{sid}_mrg" x="{mrg_x}" y="{cy}" type="rail_signal" />')
        stn["div_id"] = f"{sid}_div"
        stn["mrg_id"] = f"{sid}_mrg"
        stn_map[sid] = stn

        station_track_list = []

        for p_idx, y_offset in enumerate(TOPOLOGY_OFFSETS):
            p_num = p_idx + 1
            r_id = f"R{next_r}"
            next_r += 1

            pid = f"{sid}_P{p_num}"
            py = cy + y_offset

            nodes.append(f'<node id="{pid}" x="{cx}" y="{py}" type="rail_signal" />')

            edge_in = f"{r_id}_S1"
            edge_out = f"{r_id}_S2"

            edges.append(f'<edge id="{edge_in}" from="{stn["div_id"]}" to="{pid}" type="rail_track" />')
            edges.append(f'<edge id="{edge_out}" from="{pid}" to="{stn["mrg_id"]}" type="rail_track" />')

            additional.append(
                f'<trainStop id="{sid}_stop_P{p_num}" lane="{edge_in}_0" '
                f'startPos="10" endPos="250" name="{stn["name"]} - P{p_num}" />'
            )

            track_info = {
                "r_id": r_id,
                "platform_num": p_num,
                "station_id": sid,
                "station_name": stn["name"],
                "type": "station_platform",
                "sections": 2,
                "section_ids": [edge_in, edge_out],
                "train_stop_id": f"{sid}_stop_P{p_num}"
            }
            station_track_list.append(track_info)
            ALL_TRACKS[r_id] = track_info

        STATION_TRACKS[sid] = station_track_list

    # 3. Generate Inter-Station/Junction Track Sections
    for track in config["tracks"]:
        track_id = track["id"]
        from_id = track["from"]
        to_id = track["to"]
        num_sections = track["num_sections"]

        # Get coordinates for linspace interpolation
        src_x, src_y = get_entity_pos(config, from_id)
        dst_x, dst_y = get_entity_pos(config, to_id)

        xs = np.linspace(src_x, dst_x, num_sections + 1)
        ys = np.linspace(src_y, dst_y, num_sections + 1)

        # Resolve SUMO node IDs for track endpoints
        if from_id in stn_map:
            n_start = stn_map[from_id]["mrg_id"]
        else:
            n_start = from_id  # junction node directly

        if to_id in stn_map:
            n_end = stn_map[to_id]["div_id"]
        else:
            n_end = to_id  # junction node directly

        # Intermediate section boundary nodes
        for k in range(1, num_sections):
            nx, ny = xs[k], ys[k]
            nid = f"{track_id}_n{k}"
            nodes.append(f'<node id="{nid}" x="{nx}" y="{ny}" type="rail_signal" />')

        # Section edges
        section_length = config["section_length_m"]
        for k in range(num_sections):
            section_k = k + 1
            eid = f"{track_id}_S{section_k}"

            if k == 0:
                n_from = n_start
            else:
                n_from = f"{track_id}_n{k}"

            if k == num_sections - 1:
                n_to = n_end
            else:
                n_to = f"{track_id}_n{k+1}"

            edges.append(
                f'<edge id="{eid}" from="{n_from}" to="{n_to}" '
                f'type="rail_track" length="{section_length}" />'
            )

    write_xml(NODES_PATH, "nodes", nodes)
    write_xml(EDGES_PATH, "edges", edges)

    unique_additional = list(dict.fromkeys(additional))
    write_xml(ADDITIONAL_PATH, "additional", unique_additional)

    # 4. Save the track mapping
    track_map = {
        "inter_station_tracks": {},
        "station_tracks": {},
        "all_tracks_summary": []
    }

    for track in config["tracks"]:
        tid = track["id"]
        ns = track["num_sections"]
        track_map["inter_station_tracks"][tid] = {
            "from": track["from"],
            "to": track["to"],
            "sections": [f"{tid}_S{k}" for k in range(1, ns + 1)],
            "num_sections": ns
        }

    for sid, tracks in STATION_TRACKS.items():
        track_map["station_tracks"][sid] = []
        for t in tracks:
            track_map["station_tracks"][sid].append({
                "r_id": t["r_id"],
                "platform": t["platform_num"],
                "sections": t["section_ids"],
                "num_sections": 2,
                "train_stop": t["train_stop_id"]
            })

    for tid in sorted(ALL_TRACKS.keys(), key=lambda x: int(x.replace("R", ""))):
        info = ALL_TRACKS[tid]
        if info["type"] == "inter_station":
            track_map["all_tracks_summary"].append(
                f'{tid}: Track {info["from"]} -> {info["to"]} '
                f'({info["sections"]} sections: {tid}_S1 to {tid}_S{info["sections"]})'
            )
        else:
            track_map["all_tracks_summary"].append(
                f'{tid}: Station platform at {info["station_id"]} Platform {info["platform_num"]} '
                f'(2 sections: {tid}_S1, {tid}_S2)'
            )

    os.makedirs(os.path.dirname(TRACK_MAP_PATH), exist_ok=True)
    with open(TRACK_MAP_PATH, "w") as f:
        json.dump(track_map, f, indent=2)

    print("\n=== TRACK MAPPING ===")
    for line in track_map["all_tracks_summary"]:
        print(f"  {line}")
    print(f"\nTrack mapping saved to {TRACK_MAP_PATH}")

    return STATION_TRACKS, ALL_TRACKS

def build_network():
    print("Compiling unidirectional network...")
    subprocess.run([
        "netconvert",
        f"--node-files={NODES_PATH}",
        f"--edge-files={EDGES_PATH}",
        f"--type-files={TYPES_PATH}",
        f"--output-file={NET_UNBIDI_PATH}"
    ], check=True)

    print("Converting to bidirectional network...")
    subprocess.run([
        "netconvert",
        f"--sumo-net-file={NET_UNBIDI_PATH}",
        "--railway.topology.all-bidi=true",
        "--railway.topology.repair=true",
        f"--output-file={NET_BIDI_PATH}"
    ], check=True)
    print(f"Network built successfully: {NET_BIDI_PATH}")

def generate_sumocfg():
    cfg = [
        '<input>',
        f'    <net-file value="../network/{os.path.basename(NET_BIDI_PATH)}" />',
        f'    <route-files value="{os.path.basename(ROUTES_PATH)}" />',
        f'    <additional-files value="{os.path.basename(ADDITIONAL_PATH)}" />',
        '</input>',
        '<time>',
        '    <begin value="0" />',
        '    <end value="7200" />',
        '</time>',
        '<processing>',
        '    <collision.action value="warn" />',
        '    <time-to-teleport value="-1" />',
        '</processing>',
        '<report>',
        '    <verbose value="true" />',
        '</report>'
    ]
    write_xml(SUMO_CONFIG_PATH, "configuration", cfg)

def generate_placeholder_routes():
    routes = [
        '<vType id="train_type" vClass="rail" length="100" maxSpeed="33.3" '
        'accel="1.0" decel="1.5" color="0,80,180" guiShape="rail" />',
        '<!-- Routes will be generated by generate_schedule.py -->'
    ]
    write_xml(ROUTES_PATH, "routes", routes)

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    config = load_config()
    generate_types(config)
    generate_nodes_and_edges(config)
    generate_placeholder_routes()
    generate_sumocfg()
    build_network()
