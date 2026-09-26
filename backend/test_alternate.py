import requests
import time

print("Sending request to /alternate_data...")
try:
    # Need session or bypass login? The app runs on port 5050.
    # Let's bypass login by hitting an endpoint that doesn't require login, but alternate_data requires it.
    session = requests.Session()
    res = session.post('http://127.0.0.1:5050/auth/login', json={'username': 'planner', 'password': 'planner123'})
    print("Login status:", res.status_code)
    
    start = time.time()
    res2 = session.get('http://127.0.0.1:5050/alternate_data?plan_id=1&refresh=1')
    print("Alternate data status:", res2.status_code)
    print("Time taken:", time.time() - start)
except Exception as e:
    print("Error:", e)
