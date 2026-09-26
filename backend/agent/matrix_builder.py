import numpy as np
import os

def parse_section(sec_str):
    """Parses 'R3_S5' -> (2, 4)"""
    parts = sec_str.split('_')
    j = int(parts[0][1:]) - 1
    k = int(parts[1][1:]) - 1
    return j, k

def build_solver_matrices(blocks, trains, delays, output_dir):
    """
    Builds the compressed matrices for CPLEX to respect the 1000 variable limit.
    Saves to output_dir and returns the index mapping dicts.
    """
    # 1. Compress index mapping
    block_tracks = sorted(set(b["track"] for b in blocks))
    block_sections_per_track = {}
    for b in blocks:
        if b["track"] not in block_sections_per_track:
            block_sections_per_track[b["track"]] = set()
        block_sections_per_track[b["track"]].add(b["section"])
        
    J_solver = len(block_tracks)
    K_solver = max(len(secs) for secs in block_sections_per_track.values()) if block_sections_per_track else 1
    T_solver = 120
    N = 9
    Gamma = 2
    
    # 2. Build Maps
    track_to_solver_j = {t: i for i, t in enumerate(block_tracks)}
    section_to_solver_k = {}
    for j_real, secs in block_sections_per_track.items():
        sorted_secs = sorted(secs)
        for k_idx, k_real in enumerate(sorted_secs):
            section_to_solver_k[(j_real, k_real)] = k_idx
            
    # Verify variable limit
    num_vars = J_solver * T_solver * K_solver
    if num_vars > 1000:
        raise ValueError(f"Too many variables for CPLEX community edition: {num_vars} > 1000")
        
    # 3. Build D.npy
    D = np.zeros((J_solver, T_solver, K_solver), dtype=np.float64)
    for b in blocks:
        j_s = track_to_solver_j[b["track"]]
        k_s = section_to_solver_k[(b["track"], b["section"])]
        D[j_s, :, k_s] = b["duration"]
        
    # 4. Build Y.npy (Planned Schedule)
    Y = np.zeros((N, J_solver, T_solver, K_solver), dtype=np.float64)
    for n, train in enumerate(trains):
        for t_str, sec_str in train["schedule"].items():
            t = int(t_str)
            j_real, k_real = parse_section(sec_str)
            if j_real in track_to_solver_j and (j_real, k_real) in section_to_solver_k:
                j_s = track_to_solver_j[j_real]
                k_s = section_to_solver_k[(j_real, k_real)]
                if t < T_solver:
                    Y[n, j_s, t, k_s] = 1
            
    # 5. Build Omega.npy
    engine_map = {"D": 0, "H": 1, "E": 2}
    Omega = np.zeros((N, 3, Gamma), dtype=np.float64)
    for n, train in enumerate(trains):
        b_idx = engine_map[train["engine_type"]]
        g_idx = train["category"] - 1
        Omega[n, b_idx, g_idx] = 1
        
    # 6. Build d_delay.npy
    d_delay = np.zeros(N, dtype=np.float64)
    for n, train in enumerate(trains):
        d_delay[n] = delays.get(train["train_id"], 0)
        
    # 7. Build alpha.npy
    alpha = np.zeros((J_solver, K_solver), dtype=np.float64)
    for b in blocks:
        j_s = track_to_solver_j[b["track"]]
        k_s = section_to_solver_k[(b["track"], b["section"])]
        alpha[j_s, k_s] = b["alpha"]
        
    # 8. Build M.npy
    M = np.zeros((J_solver, T_solver, K_solver), dtype=np.float64)
    for b in blocks:
        j_s = track_to_solver_j[b["track"]]
        k_s = section_to_solver_k[(b["track"], b["section"])]
        deadline_t = min(b["deadline"], T_solver - 1)
        M[j_s, deadline_t, k_s] = 1
        
    # 9. Build scalars
    w_gamma = np.array([2.0, 3.0], dtype=np.float64)
    w_beta = np.array([1.5, 1.0, 2.5], dtype=np.float64)
    I_current = np.array(0)
    
    # Save all
    os.makedirs(output_dir, exist_ok=True)
    np.save(os.path.join(output_dir, "D.npy"), D)
    np.save(os.path.join(output_dir, "Y.npy"), Y)
    np.save(os.path.join(output_dir, "Omega.npy"), Omega)
    np.save(os.path.join(output_dir, "d_delay.npy"), d_delay)
    np.save(os.path.join(output_dir, "alpha.npy"), alpha)
    np.save(os.path.join(output_dir, "M.npy"), M)
    np.save(os.path.join(output_dir, "w_gamma.npy"), w_gamma)
    np.save(os.path.join(output_dir, "w_beta.npy"), w_beta)
    np.save(os.path.join(output_dir, "I_current.npy"), I_current)
    
    return {
        "track_to_solver_j": track_to_solver_j,
        "section_to_solver_k": section_to_solver_k,
        "T_solver": T_solver
    }

def expand_to_sumo_format(X_solver_path, blocks, trains, delays, index_maps, output_dir):
    """
    Expands the X matrix to full SUMO grid and prepares all SUMO inputs.
    """
    X_solver = np.load(X_solver_path)
    track_to_solver_j = index_maps["track_to_solver_j"]
    section_to_solver_k = index_maps["section_to_solver_k"]
    T_solver = index_maps["T_solver"]
    
    N = 9
    
    # SUMO Dimensions
    J_sumo = 18
    K_sumo = 13
    SIM_DUR = 120
    
    # 1. Expand X_matrix — CRITICAL: run_simulation.py creates one maintenance event
    #    per X=1 entry. We must set EXACTLY ONE X=1 per (track, section) block,
    #    at the earliest start time the solver chose. D_matrix provides the duration.
    X_sumo = np.zeros((J_sumo, SIM_DUR, K_sumo), dtype=np.int8)
    for j_real, j_s in track_to_solver_j.items():
        for (jk_real, k_s) in section_to_solver_k.items():
            if jk_real[0] == j_real:
                k_real = jk_real[1]
                # Find the FIRST time the solver set X=1 for this (j,k)
                active_times = np.where(X_solver[j_s, :, k_s] >= 0.5)[0]
                if len(active_times) > 0:
                    first_start = int(active_times[0])
                    if first_start < SIM_DUR:
                        X_sumo[j_real, first_start, k_real] = 1
                        
    # 2. Build SUMO Y_matrix (Z matrix actually, shifted by delay)
    Y_sumo = np.zeros((N, J_sumo, SIM_DUR, K_sumo), dtype=np.int8)
    for n, train in enumerate(trains):
        delay = delays.get(train["train_id"], 0)
        for t_str, sec_str in train["schedule"].items():
            t = int(t_str) + delay
            j_real, k_real = parse_section(sec_str)
            if t < SIM_DUR:
                Y_sumo[n, j_real, t, k_real] = 1
            
    # 3. Build SUMO alpha_matrix
    alpha_sumo = np.zeros((J_sumo, K_sumo), dtype=np.int8)
    for b in blocks:
        alpha_sumo[b["track"], b["section"]] = b["alpha"]
        
    # 4. Build SUMO D_matrix
    D_sumo = np.zeros((J_sumo, K_sumo), dtype=np.int32)
    for b in blocks:
        D_sumo[b["track"], b["section"]] = b["duration"]
        
    # 5. Build SUMO omega_matrix
    # SUMO ordering: 0=diesel, 1=electric, 2=hybrid
    sumo_engine_map = {"D": 0, "E": 1, "H": 2}
    omega_sumo = np.zeros((N, 3), dtype=np.int8)
    for n, train in enumerate(trains):
        b_idx = sumo_engine_map[train["engine_type"]]
        omega_sumo[n, b_idx] = 1
        
    # Save all
    os.makedirs(output_dir, exist_ok=True)
    np.save(os.path.join(output_dir, "X_matrix.npy"), X_sumo)
    np.save(os.path.join(output_dir, "Y_matrix.npy"), Y_sumo)
    np.save(os.path.join(output_dir, "alpha_matrix.npy"), alpha_sumo)
    np.save(os.path.join(output_dir, "D_matrix.npy"), D_sumo)
    np.save(os.path.join(output_dir, "omega_matrix.npy"), omega_sumo)
