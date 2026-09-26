import os
import sys
import numpy as np
from agent.csv_parser import parse_department_csvs, parse_schedule_csv, parse_delay_csv
from agent.matrix_builder import build_solver_matrices, expand_to_sumo_format

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    tdms = os.path.join(base_dir, "demo_data", "tdms_blocks.csv")
    smms = os.path.join(base_dir, "demo_data", "smms_blocks.csv")
    tds = os.path.join(base_dir, "demo_data", "tds_blocks.csv")
    sched = os.path.join(base_dir, "demo_data", "train_schedule.csv")
    delay = os.path.join(base_dir, "demo_data", "train_delay.csv")
    solver_dir = os.path.join(base_dir, "..", "solver_workspace")
    
    # 1. Parse
    blocks = parse_department_csvs(tdms, smms, tds)
    trains = parse_schedule_csv(sched)
    delays = parse_delay_csv(delay)
    
    print(f"Parsed {len(blocks)} blocks, {len(trains)} trains")
    for b in blocks:
        print(f"  Block: R{b['track']+1}_S{b['section']+1} dur={b['duration']} deadline={b['deadline']} type={b['type']}")
    
    # 2. Build solver matrices
    index_maps = build_solver_matrices(blocks, trains, delays, solver_dir)
    print(f"\nIndex maps: {index_maps}")
    
    # 3. Run solver
    import subprocess
    result_path = os.path.abspath(os.path.join(solver_dir, "X_result.npy"))
    solver_script = os.path.abspath(os.path.join(base_dir, "..", "Solver", "railway_maintenance_solver.py"))
    subprocess.run([sys.executable, solver_script, "--input-dir", os.path.abspath(solver_dir), "--output", result_path], check=True)
    
    # 4. Expand to SUMO format (staging)
    staging_dir = os.path.abspath(os.path.join(solver_dir, "sumo_input"))
    expand_to_sumo_format(result_path, blocks, trains, delays, index_maps, staging_dir)
    
    # 5. Verify SUMO X_matrix
    X_sumo = np.load(os.path.join(staging_dir, "X_matrix.npy"))
    print(f"\n=== SUMO X_matrix verification ===")
    print(f"Shape: {X_sumo.shape}")
    print(f"Total X=1 entries: {np.count_nonzero(X_sumo)}")
    
    active = np.argwhere(X_sumo == 1)
    print(f"\nMaintenance events that run_simulation.py will create ({len(active)}):")
    D_sumo = np.load(os.path.join(staging_dir, "D_matrix.npy"))
    alpha_sumo = np.load(os.path.join(staging_dir, "alpha_matrix.npy"))
    for j, i, k in active:
        duration = D_sumo[j, k]
        alpha = alpha_sumo[j, k]
        m_type = "POWER" if alpha == 1 else "TRAFFIC"
        print(f"  [{m_type}] R{j+1}_S{k+1}: start={i}s, end={i+duration}s, duration={duration}s")
    
    print(f"\n=== Expected: exactly {len(blocks)} events ===")
    assert len(active) == len(blocks), f"FAIL: Expected {len(blocks)} events, got {len(active)}"
    print("PASS: Correct number of maintenance events!")

if __name__ == "__main__":
    main()
