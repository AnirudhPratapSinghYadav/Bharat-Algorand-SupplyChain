import traceback
import sys

try:
    import detailed_test
    detailed_test.main()
except Exception as e:
    with open("error_full.log", "w") as f:
        traceback.print_exc(file=f)
    print("Error written to error_full.log")
