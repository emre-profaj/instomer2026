import os
import re

files_to_update = [
    "frontend/src/pages/CeoReport/AICallReport.jsx",
    "frontend/src/pages/CeoReport/ActivityReport.jsx",
    "frontend/src/pages/CeoReport/CeoReport.jsx",
    "frontend/src/pages/CeoReport/FunnelReport.jsx",
    "frontend/src/pages/CeoReport/GeneralReport.jsx",
    "frontend/src/pages/CeoReport/RequestReport.jsx",
    "frontend/src/pages/CeoReport/SalesReport.jsx",
    "frontend/src/pages/CeoReport/TeamReport.jsx"
]

import_statement = "import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';\n"
new_getDateRange = """    const getDateRange = () => {
        return getDateRangeLogic(dateFilter, startDate, endDate);
    };"""

for filepath in files_to_update:
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        continue
    
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Add import if not present
    if "import { getDateRangeLogic" not in content:
        # Find the last import
        last_import_idx = content.rfind("import ")
        if last_import_idx != -1:
            end_of_last_import = content.find("\n", last_import_idx) + 1
            content = content[:end_of_last_import] + import_statement + content[end_of_last_import:]

    # 2. Replace getDateRange function
    # Match from "const getDateRange = () => {" to the balancing "};"
    # We'll use a simpler regex that matches up to "    };" or "  };" assuming indentation
    
    # regex for const getDateRange = () => { ... };
    # It might have different formatting, so we'll use re.sub with DOTALL
    pattern_getDateRange = re.compile(r'^[ \t]*const getDateRange = \(\) => \{.*?\n[ \t]*\};', re.MULTILINE | re.DOTALL)
    
    if pattern_getDateRange.search(content):
        content = pattern_getDateRange.sub(new_getDateRange, content)
    else:
        print(f"Could not find getDateRange in {filepath}")

    # 3. Replace the array map
    # Looking for something like:
    # {[{ key: 'all', label: 'Tümü' }, { key: 'today', label: 'Bugün' }, ...].map(item => (
    # Or variations of it. We'll find {[{ key: 'all' ... }]}.map and replace it.
    
    pattern_map = re.compile(r'\{\s*\[\s*\{[^\]]*\}\s*\]\.map\(')
    if pattern_map.search(content):
        content = pattern_map.sub("{dateFilterOptions.map(", content)
    else:
        print(f"Could not find array map in {filepath}")
        
    # Write back
    with open(filepath, 'w') as f:
        f.write(content)

print("Done.")
