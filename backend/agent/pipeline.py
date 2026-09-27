import os
import sys
import subprocess
import numpy as np
import shutil

from agent.csv_parser import parse_department_csvs, parse_schedule_csv, parse_delay_csv
from agent.matrix_builder import build_solver_matrices, expand_to_sumo_format
from agent.decompose_solver import solve_with_decomposition, estimate_variables

# Project root = parent of backend/ (independent of the current working directory)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

def run_solve_pipeline(tdms_csv, smms_csv, tds_csv, schedule_csv, delay_csv, solver_dir):
    """
    Parses inputs, builds solver matrices, and runs the CPLEX solver.
    Automatically decomposes the problem into parallel sub-problems
    if the variable count exceeds the CPLEX Community Edition limit (1000).
    """
    # 1. Parse CSVs
    blocks = parse_department_csvs(tdms_csv, smms_csv, tds_csv)
    trains = parse_schedule_csv(schedule_csv)
    delays = parse_delay_csv(delay_csv)
    
    # 2. Build compressed Solver matrices
    index_maps = build_solver_matrices(blocks, trains, delays, solver_dir)
    
    # 3. Check variable count and decide solver strategy
    D = np.load(os.path.join(solver_dir, "D.npy"))
    J_size, T_size, K_size = D.shape
    total_vars = estimate_variables(J_size, T_size, K_size)
    
    if total_vars > 1000:
        # ---- DECOMPOSITION PATH ----
        print(f"[Pipeline] Problem has {total_vars} variables (> 1000 CPLEX CE limit)")
        print(f"[Pipeline] Activating decomposition solver — split, parallel solve, merge")
        
        decomp_result = solve_with_decomposition(solver_dir, max_vars=1000)
        
        # Attach decomposition metadata to index_maps for downstream reporting
        index_maps["_decomposed"] = True
        index_maps["_num_partitions"] = decomp_result["num_partitions"]
        index_maps["_total_vars"] = decomp_result["total_vars"]
        index_maps["_all_optimal"] = decomp_result.get("all_optimal", False)
        
        print(f"[Pipeline] Decomposition complete: {decomp_result['num_partitions']} partitions, "
              f"all optimal: {decomp_result.get('all_optimal', False)}")
    else:
        # ---- DIRECT SOLVER PATH (original behavior) ----
        result_path = os.path.abspath(os.path.join(solver_dir, "X_result.npy"))
        solver_script = os.path.join(PROJECT_ROOT, "Solver", "railway_maintenance_solver.py")
        
        print(f"[Pipeline] Problem has {total_vars} variables — solving directly")
        print(f"Running solver from: {solver_script}")
        
        if os.path.exists(result_path):
            os.remove(result_path)
        proc = subprocess.run([
            sys.executable, solver_script,
            "--input-dir", os.path.abspath(solver_dir),
            "--output", result_path
        ], capture_output=True, text=True)
        print(proc.stdout)
        if proc.stderr:
            print(proc.stderr)
        with open(os.path.join(solver_dir, "solver_log.txt"), "w", encoding="utf-8") as f:
            f.write(proc.stdout or "")
        if proc.returncode != 0:
            raise RuntimeError("Solver exited with an error:\n" + (proc.stderr or proc.stdout)[-800:])
        
        index_maps["_decomposed"] = False
    
    # Check if successful
    result_path = os.path.join(solver_dir, "X_result.npy")
    if not os.path.exists(result_path):
        raise RuntimeError("Solver failed to produce X_result.npy")
        
    return index_maps, blocks, trains, delays

def run_simulate_pipeline(index_maps, blocks, trains, delays, solver_dir, headless=False):
    """
    Expands results for SUMO, generates routes, and launches simulation.
    """
    result_path = os.path.abspath(os.path.join(solver_dir, "X_result.npy"))
    sumo_input_dir = os.path.join(PROJECT_ROOT, "sumo", "spiderweb_network", "input")
    sumo_scripts_dir = os.path.join(PROJECT_ROOT, "sumo", "spiderweb_network", "scripts")
    
    # 1. Expand X to SUMO format and prepare SUMO inputs in staging dir
    staging_dir = os.path.abspath(os.path.join(solver_dir, "sumo_input"))
    os.makedirs(staging_dir, exist_ok=True)
    expand_to_sumo_format(result_path, blocks, trains, delays, index_maps, staging_dir)
    
    # 2. Backup existing SUMO inputs and copy new ones
    os.makedirs(sumo_input_dir, exist_ok=True)
    print("Backing up and replacing SUMO inputs...")
    for filename in ["X_matrix.npy", "Y_matrix.npy", "alpha_matrix.npy", "D_matrix.npy", "omega_matrix.npy"]:
        dest_path = os.path.join(sumo_input_dir, filename)
        if os.path.exists(dest_path):
            shutil.copy2(dest_path, dest_path + ".bak")
        shutil.copy2(os.path.join(staging_dir, filename), dest_path)
    
    # 2. Generate SUMO routes
    print("Generating SUMO routes...")
    gen_script = os.path.join(sumo_scripts_dir, "generate_schedule.py")
    subprocess.run([sys.executable, gen_script], cwd=sumo_scripts_dir, check=True)
    
    # 3. Run SUMO simulation
    print("Starting SUMO simulation...")
    sim_script = os.path.join(sumo_scripts_dir, "run_simulation.py")
    env = dict(os.environ)
    if headless:
        env["SUMO_BINARY"] = "sumo"  # no GUI window — used by the web live map
    subprocess.run([sys.executable, sim_script], cwd=sumo_scripts_dir, env=env)
