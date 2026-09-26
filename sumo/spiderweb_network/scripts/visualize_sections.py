import matplotlib.pyplot as plt
import json
import numpy as np
import os

CONFIG_PATH = "../config/network_config.json"
OUTPUT_IMAGE = "../network_sections.png"

def visualize_network():
    with open(CONFIG_PATH) as f:
        config = json.load(f)

    fig, ax = plt.subplots(1, 1, figsize=(20, 14))

    colors = [
        '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728',
        '#9467bd', '#8c564b', '#e377c2', '#7f7f7f'
    ]

    # Build entity position map
    entity_pos = {}
    for stn in config["stations"]:
        entity_pos[stn["id"]] = (stn["x"], stn["y"])
    for jn in config["junctions"]:
        entity_pos[jn["id"]] = (jn["x"], jn["y"])

    # Draw stations as squares
    for stn in config["stations"]:
        ax.plot(stn["x"], stn["y"], 's', color='darkblue', markersize=18, zorder=5)
        ax.annotate(
            f'{stn["id"]}\n({stn["name"]})',
            (stn["x"], stn["y"] + 900),
            fontsize=10, ha='center', fontweight='bold'
        )

    # Draw junctions as red diamonds
    for jn in config["junctions"]:
        ax.plot(jn["x"], jn["y"], 'D', color='red', markersize=14, zorder=5)
        ax.annotate(
            jn["id"],
            (jn["x"], jn["y"] + 700),
            fontsize=10, ha='center', fontweight='bold', color='red'
        )

    # Draw tracks with section divisions
    for i, track in enumerate(config["tracks"]):
        color = colors[i % len(colors)]
        src_x, src_y = entity_pos[track["from"]]
        dst_x, dst_y = entity_pos[track["to"]]
        ns = track["num_sections"]

        xs = np.linspace(src_x, dst_x, ns + 1)
        ys = np.linspace(src_y, dst_y, ns + 1)

        for k in range(ns):
            ax.plot([xs[k], xs[k+1]], [ys[k], ys[k+1]], color=color, linewidth=3, zorder=2)
            ax.plot(xs[k], ys[k], '|', color='black', markersize=8, zorder=3)

            mid_x = (xs[k] + xs[k+1]) / 2
            mid_y = (ys[k] + ys[k+1]) / 2

            dx = xs[k+1] - xs[k]
            dy = ys[k+1] - ys[k]
            length = np.sqrt(dx**2 + dy**2)
            if length > 0:
                px, py = -dy/length * 400, dx/length * 400
            else:
                px, py = 0, 400

            track_num = track["id"].replace("R", "")
            ax.annotate(
                f'R{track_num}_S{k+1}', (mid_x + px, mid_y + py),
                fontsize=7, color=color, ha='center', va='center',
                bbox=dict(facecolor='white', edgecolor='none', alpha=0.7, pad=1)
            )

        # Track label at midpoint
        mid_track_x = (src_x + dst_x) / 2
        mid_track_y = (src_y + dst_y) / 2
        ax.annotate(
            f'{track["id"]} ({ns} sec)',
            (mid_track_x, mid_track_y - 800),
            fontsize=11, fontweight='bold', color='black', ha='center',
            bbox=dict(facecolor='white', edgecolor=color, boxstyle='round,pad=0.2')
        )

    ax.set_title("Spiderweb Railway Network - Tracks and Sections", fontsize=16)
    ax.set_xlabel("X coordinate (m)")
    ax.set_ylabel("Y coordinate (m)")
    ax.grid(True, linestyle='--', alpha=0.6)
    ax.set_aspect('equal', 'datalim')

    plt.tight_layout()
    plt.savefig(OUTPUT_IMAGE, dpi=150)
    print(f"Visualization saved to {OUTPUT_IMAGE}")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    visualize_network()
