import csv
import os

def convert():
    old_file = r"c:\Users\Trinesh Varma\Desktop\Prototype_F\backend\demo_data\train_schedule.csv"
    new_file = r"c:\Users\Trinesh Varma\Desktop\Prototype_F\backend\demo_data\train_schedule_new.csv"
    
    with open(old_file, 'r') as fin, open(new_file, 'w', newline='') as fout:
        reader = csv.DictReader(fin)
        
        # New headers
        fieldnames = ["train_id", "engine_type", "category"] + [f"t{i}" for i in range(120)]
        writer = csv.DictWriter(fout, fieldnames=fieldnames)
        writer.writeheader()
        
        for row in reader:
            new_row = {
                "train_id": row["train_id"],
                "engine_type": row["engine_type"],
                "category": row["category"]
            }
            
            depart = int(row["depart_time"])
            route_parts = row["route"].split(';')
            
            # Fill empty times before depart
            for t in range(depart):
                new_row[f"t{t}"] = ""
                
            # Fill route
            t = depart
            for part in route_parts:
                if t < 120:
                    new_row[f"t{t}"] = part
                t += 1
                
            # Fill remaining times
            while t < 120:
                new_row[f"t{t}"] = ""
                t += 1
                
            writer.writerow(new_row)
            
    # Replace old with new
    os.replace(new_file, old_file)
    print("Successfully converted train_schedule.csv")

if __name__ == "__main__":
    convert()
