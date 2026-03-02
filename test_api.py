import requests
import time

URL = "http://localhost:8000/process-risk"

def test_api():
    print("Testing LOW RISK Scenario...")
    low_risk = {
        "shipment_id": "SHIP_12345",
        "temperature": 18.5,
        "transit_time": 24,
        "weather_conditions": "Clear skies, mild temperature"
    }
    
    r1 = requests.post(URL, json=low_risk)
    print("Response:")
    print(r1.json())
    
    print("\n-----------------------\n")
    print("Testing HIGH RISK Scenario...")
    high_risk = {
        "shipment_id": "SHIP_12345",
        "temperature": 45.0,
        "transit_time": 120,
        "weather_conditions": "Category 5 Hurricane, severe flooding, road closures"
    }
    
    r2 = requests.post(URL, json=high_risk)
    print("Response:")
    print(r2.json())

if __name__ == "__main__":
    test_api()
