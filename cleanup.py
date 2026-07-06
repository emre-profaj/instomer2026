import os
import re

files_to_update = [
    "frontend/src/pages/CeoReport/AICallReport.jsx",
    "frontend/src/pages/CeoReport/ActivityReport.jsx",
    "frontend/src/pages/CeoReport/FunnelReport.jsx",
    "frontend/src/pages/CeoReport/GeneralReport.jsx",
    "frontend/src/pages/CeoReport/RequestReport.jsx",
    "frontend/src/pages/CeoReport/SalesReport.jsx",
    "frontend/src/pages/CeoReport/TeamReport.jsx"
]

for filepath in files_to_update:
    if not os.path.exists(filepath):
        continue
    
    with open(filepath, 'r') as f:
        content = f.read()

    # Find where getDateRange logic ends:
    # return getDateRangeLogic(dateFilter, startDate, endDate);
    #     };
    # And remove everything after that up to and including the next "    };"
    
    pattern = re.compile(r'(getDateRangeLogic\(dateFilter, startDate, endDate\);\n    \};\n)[\s\S]*?(^[ \t]*\};\n)', re.MULTILINE)
    
    if pattern.search(content):
        content = pattern.sub(r'\1', content)
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Cleaned up {filepath}")
    else:
        print(f"No match in {filepath}")

