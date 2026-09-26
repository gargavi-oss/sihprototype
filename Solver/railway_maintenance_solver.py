"""
Railway Maintenance Optimization Solver
----------------------------------------
Reads ALL problem data as raw NumPy matrices from .npy files in an
input directory (no hardcoded/dummy data, no JSON), builds and solves
the MIP with docplex (IBM CPLEX), and writes the resulting X^j_ik
decision matrix to an output .npy file.

Expected files inside --input-dir (each a plain .npy array, already
shaped as a matrix -- no flat/OPL-style reshaping is done):

    D.npy         shape (J, T, K)   -- maintenance duration per (track, time, section)
    Y.npy         shape (N, J, T, K)-- train schedule (train, track, time, section)
    Omega.npy     shape (N, Beta, Gamma) -- train-to-(beta,gamma) mapping
    d_delay.npy   shape (N,)        -- delay per train
    alpha.npy     shape (J, K)      -- alpha weight per (track, section)
    M.npy         shape (J, T, K)   -- deadline indicator (1 at deadline time index)
    w_gamma.npy   shape (Gamma,)    -- gamma weights
    w_beta.npy    shape (Beta,)     -- beta weights
    I_current.npy scalar (0-d) array -- current time index to start scheduling from

All sizes (J_size, T_size, K_size, N_size, Beta_size, Gamma_size) are
inferred directly from the array shapes above.

Usage:
    python railway_maintenance_solver.py --input-dir ./data --output X_result.npy
"""

import argparse
import sys
from pathlib import Path

import numpy as np
from docplex.mp.model import Model


def optimize_railway_maintenance(T_size, J_size, K_size, I_current,
                                  D, Y, Omega, d_delay, alpha, M, w_gamma, w_beta):
    """
    Solves the Railway Maintenance Optimization problem with docplex/CPLEX.
    Derives Z internally based on d^n. X^j_ik is solved as a binary
    (integer) decision variable, matching the formulation exactly.
    """
    print("Deriving variables and pre-computing matrices...")

    N_size = Y.shape[0]
    Beta_size = Omega.shape[1]
    Gamma_size = Omega.shape[2]

    # ---------------------------------------------------------
    # 1. DERIVE Z FROM Y AND d^n (Shift schedule by delay)
    # ---------------------------------------------------------
    Z = np.zeros_like(Y)
    for n in range(N_size):
        delay = int(d_delay[n])
        if delay < T_size:
            Z[n, :, delay:, :] = Y[n, :, :T_size - delay, :]

    # ---------------------------------------------------------
    # 2. MATRIX COMPUTATIONS
    # ---------------------------------------------------------
    rho = np.einsum('njik,nbg->jkibg', Z, Omega)
    delta = np.zeros((J_size, K_size, T_size, Beta_size, Gamma_size))

    for j in range(J_size):
        for k in range(K_size):
            for i in range(T_size):
                D_val = int(D[j, i, k])
                i_prime_end = min(T_size, i + D_val + 1)

                Z_sum_window = np.sum(Z[:, j, i:i_prime_end, k], axis=1)
                min_Z = np.minimum(1, Z_sum_window)

                weighted_delay = (d_delay + D_val) * min_Z
                delta[j, k, i, :, :] = np.einsum('nbg,n->bg', Omega, weighted_delay)

    cost_term = rho * delta * w_gamma.reshape(1, 1, 1, 1, -1) * w_beta.reshape(1, 1, 1, -1, 1)

    term_DH = np.sum(cost_term[:, :, :, [0, 2], :], axis=(3, 4))
    term_E = np.sum(cost_term[:, :, :, [1], :], axis=(3, 4))

    alpha_reshaped = alpha[:, :, np.newaxis]
    inner_cost_matrix = (alpha_reshaped * term_DH) + term_E

    C = np.zeros((J_size, T_size, K_size))
    for j in range(J_size):
        for k in range(K_size):
            deadline_idxs = np.where(M[j, :, k] == 1)[0]
            if len(deadline_idxs) == 0:
                continue
            i_prime = int(deadline_idxs[0])

            for i in range(I_current, i_prime + 1):
                D_val = int(D[j, i, k])
                i_prime_end = min(T_size, i + D_val)
                cost_sum = np.sum(inner_cost_matrix[j, k, i:i_prime_end])
                C[j, i, k] = cost_sum

    # ---------------------------------------------------------
    # 3. IBM CPLEX SOLVER (MIP, X binary)
    # ---------------------------------------------------------
    print("Building CPLEX Model...")
    mdl = Model(name='Railway_Maintenance')
    X = mdl.binary_var_cube(J_size, T_size, K_size, name='X')

    n_vars = J_size * T_size * K_size
    print(f"Model size: {n_vars} binary variables")

    mdl.minimize(mdl.sum(C[j, i, k] * X[j, i, k]
                          for j in range(J_size)
                          for i in range(I_current, T_size)
                          for k in range(K_size)))

    n_constraints = 0
    for j in range(J_size):
        for k in range(K_size):
            for i_prime in range(I_current, T_size):
                if M[j, i_prime, k] == 1:
                    mdl.add_constraint(mdl.sum(X[j, i, k] for i in range(I_current, i_prime + 1)) >= 1,
                                        ctname=f"Req_{j}_{i_prime}_{k}")
                    n_constraints += 1
    print(f"Model size: {n_constraints} constraints")

    print("Solving the Binary MIP Model with docplex/CPLEX...")
    solution = mdl.solve(log_output=True)

    # ---------------------------------------------------------
    # 4. OUTPUT EXTRACTION & OPTIMALITY CHECK
    # ---------------------------------------------------------
    if solution:
        solve_status = mdl.get_solve_status()
        detailed_status = mdl.solve_details.status

        print("\n" + "=" * 45)
        print("          CPLEX OPTIMALITY CHECK")
        print("=" * 45)
        print(f"Solve Status Enum : {solve_status}")
        print(f"Detailed Status   : {detailed_status}")

        if 'optimal' in detailed_status.lower():
            print(">>> SUCCESS: CPLEX confirms this is strictly OPTIMAL.")
        else:
            print(">>> WARNING: Solution is feasible, but not proven optimal.")

        print(f"Objective Value   : {solution.get_objective_value()}")
        print("=" * 45 + "\n")

        X_opt = np.zeros((J_size, T_size, K_size))
        for j in range(J_size):
            for i in range(T_size):
                for k in range(K_size):
                    X_opt[j, i, k] = solution.get_value(X[j, i, k])

        is_integral = np.all(np.isclose(X_opt, 0) | np.isclose(X_opt, 1))
        print(f"Integrality Check : X values are strictly 0/1 -> {is_integral}")

        return X_opt
    else:
        print("\nNo feasible solution found.")
        return None


def load_npy_inputs(input_dir):
    """
    Loads every required matrix as a raw .npy array from input_dir.
    No reshaping, no flat-array conversion, no defaults -- each file
    must already be a properly-shaped NumPy matrix. Sizes are inferred
    from array shapes.
    """
    input_dir = Path(input_dir)
    required_files = ["D.npy", "Y.npy", "Omega.npy", "d_delay.npy",
                       "alpha.npy", "M.npy", "w_gamma.npy", "w_beta.npy", "I_current.npy"]

    missing = [f for f in required_files if not (input_dir / f).exists()]
    if missing:
        raise FileNotFoundError(f"Missing required .npy file(s) in '{input_dir}': {missing}")

    D = np.load(input_dir / "D.npy")
    Y = np.load(input_dir / "Y.npy")
    Omega = np.load(input_dir / "Omega.npy")
    d_delay = np.load(input_dir / "d_delay.npy")
    alpha = np.load(input_dir / "alpha.npy")
    M = np.load(input_dir / "M.npy")
    w_gamma = np.load(input_dir / "w_gamma.npy")
    w_beta = np.load(input_dir / "w_beta.npy")
    I_current = int(np.load(input_dir / "I_current.npy"))

    # Infer sizes from shapes
    J_size, T_size, K_size = D.shape
    N_size = Y.shape[0]

    # Basic shape validation against inferred sizes
    checks = {
        "Y": (Y.shape, (N_size, J_size, T_size, K_size)),
        "alpha": (alpha.shape, (J_size, K_size)),
        "M": (M.shape, (J_size, T_size, K_size)),
        "d_delay": (d_delay.shape, (N_size,)),
    }
    for name, (actual, expected) in checks.items():
        if tuple(actual) != tuple(expected):
            raise ValueError(f"'{name}.npy' has shape {actual}, expected {expected} "
                              f"(inferred from D.npy / Y.npy)")

    Beta_size, Gamma_size = Omega.shape[1], Omega.shape[2]
    if w_gamma.shape != (Gamma_size,):
        raise ValueError(f"'w_gamma.npy' has shape {w_gamma.shape}, expected ({Gamma_size},)")
    if w_beta.shape != (Beta_size,):
        raise ValueError(f"'w_beta.npy' has shape {w_beta.shape}, expected ({Beta_size},)")

    return {
        "T_size": T_size, "J_size": J_size, "K_size": K_size,
        "I_current": I_current, "D": D, "Y": Y, "Omega": Omega,
        "d_delay": d_delay, "alpha": alpha, "M": M,
        "w_gamma": w_gamma, "w_beta": w_beta
    }


def main():
    parser = argparse.ArgumentParser(description="Railway Maintenance MIP solver (docplex/CPLEX, .npy in/out)")
    parser.add_argument("--input-dir", "-i", required=True, help="Directory containing the input .npy matrix files")
    parser.add_argument("--output", "-o", default="X_result.npy", help="Path to write the output X matrix (.npy)")
    args = parser.parse_args()

    try:
        params = load_npy_inputs(args.input_dir)
    except (FileNotFoundError, ValueError) as e:
        print(f"ERROR loading input directory '{args.input_dir}': {e}", file=sys.stderr)
        sys.exit(1)

    X_opt = optimize_railway_maintenance(
        params["T_size"], params["J_size"], params["K_size"], params["I_current"],
        params["D"], params["Y"], params["Omega"], params["d_delay"],
        params["alpha"], params["M"], params["w_gamma"], params["w_beta"]
    )

    if X_opt is None:
        print("No solution to write.", file=sys.stderr)
        sys.exit(2)

    np.save(args.output, X_opt)
    print(f"Result matrix written to: {args.output}  (shape {X_opt.shape})")

    print("--- Final X^j_ik Decision Matrix (per track) ---")
    for j in range(params["J_size"]):
        print(f"\nTrack {j} Maintenance Schedule (Rows = Time, Cols = Section):")
        print(np.round(X_opt[j], 2))


if __name__ == '__main__':
    main()
