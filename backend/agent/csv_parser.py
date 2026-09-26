import csv

def parse_department_csvs(tdms_path, smms_path, tds_path):
    """
    Parses maintenance request CSVs from the 3 departments.
    Returns a unified list of block dictionaries.
    """
    blocks = []
    
    # Mapping of department to its specific alpha value (1 for power, 0 for traffic)
    dept_configs = [
        (tdms_path, "TDMS", 1),
        (smms_path, "SMMS", 0),
        (tds_path, "TDS", 0)
    ]
    
    for file_path, dept, alpha in dept_configs:
        try:
            with open(file_path, mode='r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Parse block data, converting to 0-indexed values for internal logic
                    blocks.append({
                        "track": int(row["track_id"]) - 1,
                        "section": int(row["section_id"]) - 1,
                        "duration": int(row["block_duration"]),
                        "deadline": int(row["deadline"]),
                        "alpha": alpha,  # Forced by department
                        "dept": dept,
                        "type": row.get("maintenance_type", "unknown")
                    })
        except FileNotFoundError:
            print(f"Warning: File not found: {file_path}")
            
    return blocks

def parse_schedule_csv(schedule_path):
    """
    Parses train schedule CSV with 120 time columns.
    Returns a list of dicts with train info and a 'schedule' dict mapping t (int) -> 'Rj_Sk'.
    """
    trains = []
    try:
        with open(schedule_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                train_info = {
                    "train_id": int(row["train_id"]),
                    "engine_type": row["engine_type"].strip(),
                    "category": int(row["category"]),
                    "schedule": {}
                }
                
                # Parse all time columns t0 to t119
                for t in range(120):
                    col = f"t{t}"
                    if col in row and row[col].strip():
                        train_info["schedule"][t] = row[col].strip()
                        
                trains.append(train_info)
    except FileNotFoundError:
        print(f"Warning: File not found: {schedule_path}")
    
    # Sort trains by ID to ensure consistent ordering
    return sorted(trains, key=lambda x: x["train_id"])

def parse_delay_csv(delay_path):
    """
    Parses train delay CSV. Returns a dictionary mapping train_id to delay.
    """
    delays = {}
    try:
        with open(delay_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                delays[int(row["train_id"])] = int(row["delay"])
    except FileNotFoundError:
        print(f"Warning: File not found: {delay_path}")
    return delays
