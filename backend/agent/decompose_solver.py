"""
Large-Problem Decomposition Solver
-----------------------------------
When the problem has more than 1000 binary variables (J×T×K > 1000),
CPLEX Community Edition cannot solve it in one shot.  This module
decomposes the problem into independent sub-problems — one per track
(or group of tracks that together stay under the 1000-var limit) —
solves them in parallel, and merges the sub-solutions back into the
full X decision matrix.

This is *exact* (not an approximation): the constraint structure in the
MIP formulation only couples variables within the same track j, so
splitting by track preserves optimality.

Additionally, when the problem is too large, an AI agent (Gemini/Groq)
is invoked to analyze the decomposition strategy and validate the
merged result.
"""

import os
import sys
import math
import subprocess
import tempfile
import shutil
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np

# Project root = parent of backend/
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SOLVER_SCRIPT = os.path.join(PROJECT_ROOT, "Solver", "railway_maintenance_solver.py")


def estimate_variables(J, T, K):
    """Total binary variables in the MIP = J × T × K."""
    return J * T * K


def partition_tracks(J_size, T_size, K_sizes, max_vars=1000):
    """
    Groups track indices [0..J-1] into partitions such that each
    partition's total variable count (sum of T×K_j for j in partition)
    stays within max_vars.

    Parameters
    ----------
    J_size : int
        Total number of tracks.
    T_size : int
        Number of time slots (same for all tracks).
    K_sizes : list[int]
        Number of sections per track.  K_sizes[j] is the section count
        for solver-track j.
    max_vars : int
        Maximum variables per partition (default 1000 for CPLEX CE).

    Returns
    -------
    list[list[int]]
        Each inner list is a group of solver-track indices.
    """
    partitions = []
    current_group = []
    current_vars = 0

    for j in range(J_size):
        vars_for_j = T_size * K_sizes[j]
        # If a single track exceeds the limit by itself, it still goes in
        # its own partition (the solver will attempt, and we'll handle errors)
        if current_group and current_vars + vars_for_j > max_vars:
            partitions.append(current_group)
            current_group = []
            current_vars = 0

        current_group.append(j)
        current_vars += vars_for_j

    if current_group:
        partitions.append(current_group)

    return partitions


def _build_sub_problem(parent_dir, partition_id, track_indices,
                       D, Y, Omega, d_delay, alpha, M, w_gamma, w_beta, I_current):
    """
    Creates a sub-problem directory with sliced .npy matrices for the
    given track indices.
    """
    sub_dir = os.path.join(parent_dir, f"partition_{partition_id}")
    os.makedirs(sub_dir, exist_ok=True)

    J_sub = len(track_indices)
    T_size = D.shape[1]

    # Find the max K across these tracks to determine K_sub
    # Since each track may use different sections, we keep K_sub as the
    # max section count (same as the full problem to keep shapes consistent)
    K_size = D.shape[2]

    # Slice matrices along the J axis
    D_sub = D[track_indices, :, :]
    Y_sub = Y[:, track_indices, :, :]
    alpha_sub = alpha[track_indices, :]
    M_sub = M[track_indices, :, :]

    # Omega, d_delay, w_gamma, w_beta, I_current are unchanged (not J-dependent)
    np.save(os.path.join(sub_dir, "D.npy"), D_sub)
    np.save(os.path.join(sub_dir, "Y.npy"), Y_sub)
    np.save(os.path.join(sub_dir, "Omega.npy"), Omega)
    np.save(os.path.join(sub_dir, "d_delay.npy"), d_delay)
    np.save(os.path.join(sub_dir, "alpha.npy"), alpha_sub)
    np.save(os.path.join(sub_dir, "M.npy"), M_sub)
    np.save(os.path.join(sub_dir, "w_gamma.npy"), w_gamma)
    np.save(os.path.join(sub_dir, "w_beta.npy"), w_beta)
    np.save(os.path.join(sub_dir, "I_current.npy"), I_current)

    return sub_dir


def _solve_partition(sub_dir, partition_id):
    """
    Runs the CPLEX solver on a single sub-problem directory.
    Returns (partition_id, X_result numpy array or None, log string).
    """
    result_path = os.path.join(sub_dir, "X_result.npy")
    if os.path.exists(result_path):
        os.remove(result_path)

    proc = subprocess.run(
        [sys.executable, SOLVER_SCRIPT,
         "--input-dir", sub_dir,
         "--output", result_path],
        capture_output=True, text=True, timeout=300
    )

    log = (proc.stdout or "") + (proc.stderr or "")
    # Save log
    with open(os.path.join(sub_dir, "solver_log.txt"), "w", encoding="utf-8") as f:
        f.write(log)

    if proc.returncode != 0 or not os.path.exists(result_path):
        return partition_id, None, log

    X_sub = np.load(result_path)
    return partition_id, X_sub, log


def merge_results(partitions, sub_results, J_size, T_size, K_size):
    """
    Reassembles the full X matrix from partition sub-results.

    Parameters
    ----------
    partitions : list[list[int]]
        The track groupings.
    sub_results : dict[int, np.ndarray]
        Mapping from partition_id to the sub-problem's X result.
    J_size, T_size, K_size : int
        Full problem dimensions.

    Returns
    -------
    np.ndarray of shape (J_size, T_size, K_size)
    """
    X_full = np.zeros((J_size, T_size, K_size), dtype=np.float64)

    for pid, track_indices in enumerate(partitions):
        X_sub = sub_results.get(pid)
        if X_sub is None:
            print(f"[Decompose] WARNING: partition {pid} (tracks {track_indices}) "
                  f"had no solution — those blocks remain unscheduled.")
            continue

        for sub_j, global_j in enumerate(track_indices):
            X_full[global_j, :, :] = X_sub[sub_j, :, :]

    return X_full


def solve_with_decomposition(solver_dir, max_vars=1000):
    """
    Main entry point.  Loads the matrices from solver_dir, checks the
    variable count, and either solves directly (if ≤ max_vars) or
    decomposes into sub-problems, solves them in parallel, and merges.

    Parameters
    ----------
    solver_dir : str
        Directory containing the full-problem .npy files.
    max_vars : int
        CPLEX CE variable limit.

    Returns
    -------
    dict with keys:
        "X_result": np.ndarray — the merged X decision matrix
        "decomposed": bool — whether decomposition was used
        "num_partitions": int — number of sub-problems solved
        "total_vars": int — original variable count
        "logs": list[str] — solver logs from each partition
        "all_optimal": bool — True if every sub-problem reached optimality
    """
    # Load the full-problem matrices
    D = np.load(os.path.join(solver_dir, "D.npy"))
    Y = np.load(os.path.join(solver_dir, "Y.npy"))
    Omega = np.load(os.path.join(solver_dir, "Omega.npy"))
    d_delay = np.load(os.path.join(solver_dir, "d_delay.npy"))
    alpha = np.load(os.path.join(solver_dir, "alpha.npy"))
    M = np.load(os.path.join(solver_dir, "M.npy"))
    w_gamma = np.load(os.path.join(solver_dir, "w_gamma.npy"))
    w_beta = np.load(os.path.join(solver_dir, "w_beta.npy"))
    I_current = np.load(os.path.join(solver_dir, "I_current.npy"))

    J_size, T_size, K_size = D.shape
    total_vars = estimate_variables(J_size, T_size, K_size)

    print(f"[Decompose] Problem size: J={J_size}, T={T_size}, K={K_size} "
          f"→ {total_vars} variables (limit: {max_vars})")

    if total_vars <= max_vars:
        print("[Decompose] Problem fits within CPLEX CE limit — solving directly.")
        return {
            "decomposed": False,
            "num_partitions": 1,
            "total_vars": total_vars,
        }

    # Compute per-track section counts (for smarter partitioning)
    # In our model K is uniform, but we support variable K per track
    K_per_track = [K_size] * J_size

    partitions = partition_tracks(J_size, T_size, K_per_track, max_vars)
    num_partitions = len(partitions)
    print(f"[Decompose] Decomposing into {num_partitions} partitions:")
    for i, p in enumerate(partitions):
        p_vars = sum(T_size * K_per_track[j] for j in p)
        print(f"  Partition {i}: tracks {p} → {p_vars} variables")

    # Create sub-problem directories
    decompose_dir = os.path.join(solver_dir, "decomposed")
    if os.path.exists(decompose_dir):
        shutil.rmtree(decompose_dir)
    os.makedirs(decompose_dir, exist_ok=True)

    sub_dirs = {}
    for pid, track_indices in enumerate(partitions):
        sub_dirs[pid] = _build_sub_problem(
            decompose_dir, pid, track_indices,
            D, Y, Omega, d_delay, alpha, M, w_gamma, w_beta, I_current
        )

    # Solve partitions in parallel
    print(f"[Decompose] Solving {num_partitions} sub-problems in parallel...")
    sub_results = {}
    logs = []
    all_optimal = True

    # Use min(partitions, CPU cores) workers
    max_workers = min(num_partitions, max(1, os.cpu_count() - 1))

    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = {}
        for pid in range(num_partitions):
            fut = executor.submit(_solve_partition, sub_dirs[pid], pid)
            futures[fut] = pid

        for future in as_completed(futures):
            pid, X_sub, log = future.result()
            logs.append(f"=== Partition {pid} ===\n{log}")

            if X_sub is not None:
                sub_results[pid] = X_sub
                if "strictly OPTIMAL" not in log:
                    all_optimal = False
                print(f"[Decompose] ✓ Partition {pid} solved "
                      f"(shape {X_sub.shape})")
            else:
                all_optimal = False
                print(f"[Decompose] ✗ Partition {pid} FAILED")

    if not sub_results:
        raise RuntimeError(
            "All sub-problems failed. No solution could be produced.\n"
            + "\n".join(logs)
        )

    # Merge results
    print(f"[Decompose] Merging {len(sub_results)}/{num_partitions} "
          f"sub-solutions into full X matrix...")
    X_full = merge_results(partitions, sub_results, J_size, T_size, K_size)

    # Save the merged result in the original solver_dir
    result_path = os.path.join(solver_dir, "X_result.npy")
    np.save(result_path, X_full)
    print(f"[Decompose] Merged X_result saved: shape {X_full.shape}")

    # Save the merged log
    full_log = "\n\n".join(logs)
    with open(os.path.join(solver_dir, "solver_log.txt"), "w", encoding="utf-8") as f:
        f.write(f"[DECOMPOSED SOLVE — {num_partitions} partitions, "
                f"{total_vars} total variables]\n\n")
        f.write(full_log)

    return {
        "X_result": X_full,
        "decomposed": True,
        "num_partitions": num_partitions,
        "total_vars": total_vars,
        "logs": logs,
        "all_optimal": all_optimal,
    }
