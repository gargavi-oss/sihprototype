import os
import numpy as np
import random

def create_dummy_inputs():
    os.makedirs("../input", exist_ok=True)
    
    NUM_TRACKS = 18
    MAX_SECTIONS = 13
    NUM_TRAINS = 20
    SIM_DURATION = 7200
    
    # 1. X: Block schedule (j, i, k) -> (NUM_TRACKS, SIM_DURATION, MAX_SECTIONS)
    # 2. alpha: Block type (j, k) -> (NUM_TRACKS, MAX_SECTIONS)
    # 3. D: Block duration (j, k) -> (NUM_TRACKS, MAX_SECTIONS)
    
    X = np.zeros((NUM_TRACKS, SIM_DURATION, MAX_SECTIONS), dtype=np.int8)
    alpha = np.zeros((NUM_TRACKS, MAX_SECTIONS), dtype=np.int8)
    D = np.zeros((NUM_TRACKS, MAX_SECTIONS), dtype=np.int32)
    
    # Event 1: Power block on R3_S3 (red block)
    j_ev1 = 2  # R3
    k_ev1 = 2  # S3
    i_start1 = 100
    duration1 = 3000
    X[j_ev1, i_start1, k_ev1] = 1
    alpha[j_ev1, k_ev1] = 1  # power block
    D[j_ev1, k_ev1] = duration1

    # Event 2: Power block on R3_S7 (red block)
    j_ev2 = 2  # R3
    k_ev2 = 6  # S7
    i_start2 = 150
    duration2 = 3000
    X[j_ev2, i_start2, k_ev2] = 1
    alpha[j_ev2, k_ev2] = 1  # power block
    D[j_ev2, k_ev2] = duration2
    
    # 4. Y: Train schedule (n, j, i, k) -> (NUM_TRAINS, NUM_TRACKS, SIM_DURATION, MAX_SECTIONS)
    Y = np.zeros((NUM_TRAINS, NUM_TRACKS, SIM_DURATION, MAX_SECTIONS), dtype=np.int8)
    
    # Define track section counts (based on config)
    TRACK_SECS = {
        "R1": 5, "R2": 6, "R3": 11, "R4": 4, "R5": 9, "R6": 5, "R7": 8, "R8": 7, "R9": 7, "R10": 6,
        "R11": 2, "R12": 2, "R13": 2, "R14": 2, "R15": 2, "R16": 2, "R17": 2, "R18": 2
    }
    
    VALID_PATHS = {
        "STN_A": [
            (["STN_A", "STN_E"], ["R11", "R1", "R3", "R4", "R15"]),
            (["STN_A", "STN_G"], ["R11", "R1", "R3", "R9", "R17"]),
            (["STN_A", "STN_C"], ["R11", "R1", "R3", "R5", "R6", "R13"]),
        ],
        "STN_B": [
            (["STN_B", "STN_E"], ["R12", "R2", "R3", "R4", "R15"]),
            (["STN_B", "STN_G"], ["R12", "R2", "R3", "R9", "R17"]),
            (["STN_B", "STN_C"], ["R12", "R2", "R3", "R5", "R6", "R13"]),
        ]
    }
    
    current_time = 0
    
    for n in range(NUM_TRAINS):
        start_station = "STN_A" if n % 2 == 0 else "STN_B"
        
        # Send trains every 40 seconds to cause congestion and trigger signals
        depart_time = current_time
        current_time += 40
            
        path_choice = random.choice(VALID_PATHS[start_station])
        _, track_seq = path_choice
        
        t = depart_time
        for track_id in track_seq:
            j = int(track_id.replace("R", "")) - 1
            num_secs = TRACK_SECS[track_id]
            for k in range(num_secs):
                if t < SIM_DURATION:
                    Y[n, j, t, k] = 1
                t += 10
                
    # 5. omega: Engine type (n, beta) -> (NUM_TRAINS, 3)
    omega = np.zeros((NUM_TRAINS, 3), dtype=np.int8)
    for n in range(NUM_TRAINS):
        if n % 3 == 0:
            omega[n, 0] = 1 # diesel (can pass power blocks)
        elif n % 3 == 1:
            omega[n, 1] = 1 # electrified (stops at power blocks)
        else:
            omega[n, 2] = 1 # hybrid (can pass power blocks)
            
    np.save("../input/X_matrix.npy", X)
    np.save("../input/alpha_matrix.npy", alpha)
    np.save("../input/D_matrix.npy", D)
    np.save("../input/Y_matrix.npy", Y)
    np.save("../input/omega_matrix.npy", omega)
    print("Successfully generated dummy inputs in ../input/")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    create_dummy_inputs()
