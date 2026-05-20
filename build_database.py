import os
import re
import json
import pypdf

# Define the syllabus structure with keywords for topical classification
SYLLABUS = [
    {
        "chapter_num": 1,
        "chapter_title": "Data processing and information",
        "topics": [
            {"id": "1.1", "title": "Data and information", "keywords": ["dynamic data", "static data", "direct data", "indirect data", "sources of direct data", "questionnaires", "interviews", "data logging", "observation", "sources of indirect data", "weather data", "census data", "electoral register"]},
            {"id": "1.2", "title": "Quality of information", "keywords": ["quality of information", "accuracy", "relevance", "age", "completeness", "presentation", "trustworthiness"]},
            {"id": "1.3", "title": "Encryption", "keywords": ["encryption", "symmetric", "asymmetric", "private key", "public key", "tls", "ssl", "ipsec", "protocols", "cryptography", "ssl/tls"]},
            {"id": "1.4", "title": "Checking the accuracy of data", "keywords": ["validation", "verification", "check digit", "format check", "length check", "lookup check", "presence check", "range check", "type check", "double data entry", "visual check", "visual verification"]},
            {"id": "1.5", "title": "Data processing", "keywords": ["data processing", "batch processing", "online processing", "real-time processing", "transaction processing"]}
        ]
    },
    {
        "chapter_num": 2,
        "chapter_title": "Hardware and software",
        "topics": [
            {"id": "2.1", "title": "Mainframe computers and supercomputers", "keywords": ["mainframe", "supercomputer", "mainframe computer", "supercomputers"]},
            {"id": "2.2", "title": "System software", "keywords": ["system software", "operating system", "compiler", "interpreter", "linker", "device driver", "utility software", "assembler"]},
            {"id": "2.3", "title": "Utility software", "keywords": ["utility", "defragment", "disk repair", "file compression", "backup", "anti-virus", "utilities", "disk defragmenter"]},
            {"id": "2.4", "title": "Custom-written software and off-the-shelf software", "keywords": ["custom-written", "bespoke", "off-the-shelf", "packaged software", "software packages"]},
            {"id": "2.5", "title": "User interfaces", "keywords": ["user interface", "command line", "gui", "cli", "gesture", "voice dialogue", "wimp", "menu-driven", "graphical user interface"]}
        ]
    },
    {
        "chapter_num": 3,
        "chapter_title": "Monitoring and control",
        "topics": [
            {"id": "3.1", "title": "Monitoring and measurement technologies", "keywords": ["monitoring", "measurement", "sensors", "datalogging", "data logger", "sensor", "monitor pollution", "temperature sensor", "light sensor", "moisture sensor"]},
            {"id": "3.2", "title": "Control technologies", "keywords": ["control", "actuator", "motor", "valve", "heater", "feedback loop", "adc", "dac", "analogue to digital", "digital to analogue"]}
        ]
    },
    {
        "chapter_num": 4,
        "chapter_title": "Algorithms and flowcharts",
        "topics": [
            {"id": "4.1", "title": "Algorithms", "keywords": ["algorithm", "pseudocode", "sorting", "searching", "linear search", "bubble sort", "binary search"]},
            {"id": "4.2", "title": "Flowcharts", "keywords": ["flowchart", "terminator", "input/output", "process", "decision", "connector", "document symbol"]}
        ]
    },
    {
        "chapter_num": 5,
        "chapter_title": "eSecurity",
        "topics": [
            {"id": "5.1", "title": "Personal data", "keywords": ["personal data", "biometric", "password", "security question", "firewall", "phishing", "pharming", "smishing", "vishing", "social engineering"]},
            {"id": "5.2", "title": "Malware", "keywords": ["malware", "virus", "worm", "trojan", "spyware", "adware", "ransomware", "rootkit", "keylogger", "malicious software"]}
        ]
    },
    {
        "chapter_num": 6,
        "chapter_title": "The digital divide",
        "topics": [
            {"id": "6.1", "title": "The digital divide", "keywords": ["digital divide", "divide", "access to technology", "economic divide", "social divide", "infrastructure", "global divide"]}
        ]
    },
    {
        "chapter_num": 7,
        "chapter_title": "Expert systems",
        "topics": [
            {"id": "7.1", "title": "Expert systems", "keywords": ["expert system", "knowledge base", "inference engine", "user interface", "expert", "rules", "facts", "mycin", "prospector", "knowledge engineer", "mineral prospecting", "medical diagnosis"]}
        ]
    },
    {
        "chapter_num": 8,
        "chapter_title": "Spreadsheets",
        "topics": [
            {"id": "8.1", "title": "Creating a spreadsheet", "keywords": ["spreadsheet", "cell", "row", "column", "formula", "function", "sumif", "countif", "vlookup", "hlookup", "average", "nested if", "lookup", "relative referencing", "absolute referencing", "formulae", "gridline"]},
            {"id": "8.2", "title": "Testing a spreadsheet", "keywords": ["test plan", "testing", "test data", "normal data", "extreme data", "abnormal data", "test strategy"]},
            {"id": "8.3", "title": "Using a spreadsheet", "keywords": ["what-if", "modelling", "pivot table", "macro", "spreadsheet model", "forecast", "what if"]},
            {"id": "8.4", "title": "Graphs and charts", "keywords": ["chart", "graph", "bar chart", "pie chart", "line graph", "scatter graph", "legend", "axis title", "y axis", "x axis"]}
        ]
    },
    {
        "chapter_num": 9,
        "chapter_title": "Modelling",
        "keywords": ["modelling", "simulation", "simulator", "training simulator", "flight simulator", "financial forecasting", "spreadsheet model"],
        "topics": [
            {"id": "9.1", "title": "Modelling and simulations", "keywords": ["modelling", "simulation", "simulator", "training simulator", "flight simulator", "financial forecasting", "spreadsheet model", "model"]}
        ]
    },
    {
        "chapter_num": 10,
        "chapter_title": "Database and file concepts",
        "topics": [
            {"id": "10.1", "title": "Creating a database", "keywords": ["database", "relational database", "table", "record", "field", "primary key", "foreign key", "composite key", "relationship", "one-to-many", "many-to-many", "one-to-one", "referential integrity", "sql", "data entry form", "borrower", "query"]},
            {"id": "10.2", "title": "Normalisation to third normal form (3NF)", "keywords": ["normalisation", "normalised", "1nf", "2nf", "3nf", "repeating groups", "partial dependency", "transitive dependency", "normal form"]},
            {"id": "10.3", "title": "Data dictionary", "keywords": ["data dictionary", "field name", "data type", "field length", "validation rule"]},
            {"id": "10.4", "title": "File and data management", "keywords": ["flat file", "hierarchical database", "dbms", "database management system", "hierarchical", "flat-file"]}
        ]
    },
    {
        "chapter_num": 11,
        "chapter_title": "Video and audio editing",
        "topics": [
            {"id": "11.1", "title": "Video editing", "keywords": ["video editing", "timeline", "clip", "frame rate", "aspect ratio", "transition", "title", "export", "avi", "mp4", "video clip", "video files"]},
            {"id": "11.2", "title": "Audio editing", "keywords": ["audio editing", "sound", "music", "voice", "mp3", "wav", "sampling rate", "fade in", "fade out", "track", "mono", "stereo", "audio track"]}
        ]
    },
    {
        "chapter_num": 12,
        "chapter_title": "IT in society",
        "topics": [
            {"id": "12.1", "title": "Digital currencies", "keywords": ["digital currency", "cryptocurrency", "bitcoin", "blockchain", "currencies"]},
            {"id": "12.2", "title": "Data mining", "keywords": ["data mining", "patterns", "predictive analysis", "trends", "pattern", "mining"]},
            {"id": "12.3", "title": "Social networking services/platforms", "keywords": ["social networking", "social media", "facebook", "twitter", "blog", "blogs", "postings"]},
            {"id": "12.4", "title": "The impact of IT", "keywords": ["impact of it", "employment", "working patterns", "teleworking", "e-commerce", "online shopping", "e-banking", "shop online", "online banking"]},
            {"id": "12.5", "title": "Technology enhanced learning", "keywords": ["technology enhanced learning", "tel", "distance learning", "mooc", "vle", "e-learning", "online courses"]}
        ]
    },
    {
        "chapter_num": 13,
        "chapter_title": "New and emerging technologies",
        "topics": [
            {"id": "13.1", "title": "New and emerging technologies", "keywords": ["emerging", "artificial intelligence", "ai", "machine learning", "virtual reality", "vr", "augmented reality", "ar", "holography", "bioprinting", "quantum computing"]}
        ]
    },
    {
        "chapter_num": 14,
        "chapter_title": "Communications technology",
        "topics": [
            {"id": "14.1", "title": "Networks", "keywords": ["lan", "wan", "wlan", "vpn", "internet", "intranet", "extranet", "networks", "network"]},
            {"id": "14.2", "title": "Components in a network", "keywords": ["router", "switch", "hub", "bridge", "modem", "nic", "cabling", "fibre optic", "coaxial", "twisted pair", "network interface card"]},
            {"id": "14.3", "title": "Network servers", "keywords": ["server", "mail server", "file server", "print server", "web server", "proxy server", "servers"]},
            {"id": "14.4", "title": "Cloud computing", "keywords": ["cloud computing", "cloud storage", "saas", "paas", "iaas", "public cloud", "private cloud", "stored in the cloud"]},
            {"id": "14.5", "title": "Data transmission across networks", "keywords": ["packet switching", "packet", "routing", "bandwidth", "bit rate", "data transmission", "packets", "transmitter", "transmission"]},
            {"id": "14.6", "title": "Network protocols", "keywords": ["protocol", "tcp/ip", "http", "https", "ftp", "smtp", "pop3", "imap", "dhcp", "dns", "protocols", "file transfer protocol"]},
            {"id": "14.7", "title": "Wireless technology", "keywords": ["wireless", "wi-fi", "bluetooth", "wap", "wireless access point", "waps"]},
            {"id": "14.8", "title": "Mobile communication systems", "keywords": ["mobile", "cellular", "3g", "4g", "5g", "gsm", "cell phone"]},
            {"id": "14.9", "title": "Network security", "keywords": ["network security", "wep", "wpa", "wpa2", "firewall", "mac filtering", "intrusion detection", "wifi security", "access points"]},
            {"id": "14.10", "title": "Disaster recovery management", "keywords": ["disaster recovery", "backup policy", "ups", "hot site", "cold site", "recovery", "disaster"]}
        ]
    },
    {
        "chapter_num": 15,
        "chapter_title": "Project management",
        "topics": [
            {"id": "15.1", "title": "The stages of the project life cycle", "keywords": ["project life cycle", "initiation", "planning", "execution", "monitoring", "closure", "stages of the project"]},
            {"id": "15.2", "title": "Project management software", "keywords": ["project management software", "collaborative software", "web-based project management"]},
            {"id": "15.3", "title": "Tools and techniques for project management tasks", "keywords": ["gantt", "pert", "critical path", "cpa", "milestone", "resources", "gantt chart", "critical path analysis", "pert chart"]}
        ]
    },
    {
        "chapter_num": 16,
        "chapter_title": "System life cycle",
        "topics": [
            {"id": "16.1", "title": "The stages in the system life cycle", "keywords": ["system life cycle", "stages in the system"]},
            {"id": "16.2", "title": "Analysis", "keywords": ["analysis", "fact-finding", "interview", "observation", "document inspection", "questionnaire", "dfd", "system specification", "fact finding", "data flow diagram"]},
            {"id": "16.3", "title": "Design", "keywords": ["design", "input design", "output design", "data structures", "system design", "design specification"]},
            {"id": "16.4", "title": "Development and testing", "keywords": ["testing", "test plan", "test strategy", "system testing", "user acceptance testing", "test data", "development"]},
            {"id": "16.5", "title": "Implementation", "keywords": ["implementation", "direct changeover", "parallel running", "phased implementation", "pilot running", "methods of implementation"]},
            {"id": "16.6", "title": "Documentation", "keywords": ["documentation", "user documentation", "technical documentation"]},
            {"id": "16.7", "title": "Evaluation", "keywords": ["evaluation", "system evaluation"]},
            {"id": "16.8", "title": "Methods of software development", "keywords": ["waterfall", "agile", "rad", "rapid application development", "methods of software development"]},
            {"id": "16.9", "title": "Prototyping", "keywords": ["prototype", "prototyping", "prototyped"]},
            {"id": "16.10", "title": "Maintenance", "keywords": ["maintenance", "perfective", "adaptive", "corrective", "preventative", "perfective maintenance", "adaptive maintenance", "corrective maintenance"]}
        ]
    },
    {
        "chapter_num": 17,
        "chapter_title": "Data analysis and visualisation",
        "topics": [
            {"id": "17.1", "title": "Data Analysis and Visualisation", "keywords": ["data analysis", "visualisation", "dashboard", "kpi", "charts", "visual representation", "data visualisation", "kpis"]}
        ]
    },
    {
        "chapter_num": 18,
        "chapter_title": "Mail merge",
        "topics": [
            {"id": "18.1", "title": "Mail merge", "keywords": ["mail merge", "source document", "data source", "merge field", "rules", "filter", "mailmerged", "merge fields"]}
        ]
    },
    {
        "chapter_num": 19,
        "chapter_title": "Graphics creation",
        "topics": [
            {"id": "19.1", "title": "Common graphics skills", "keywords": ["graphics", "image editing", "crop", "resize", "layers", "brightness", "contrast", "vector", "bitmap", "gimp", "photoshop", "canvas"]},
            {"id": "19.2", "title": "Vector graphics", "keywords": ["vector", "bezier curve", "anchor point", "path", "svg", "vector graphics", "illustrator", "drawings", "paths"]},
            {"id": "19.3", "title": "Bitmap images", "keywords": ["bitmap", "raster", "pixel", "resolution", "bmp", "jpeg", "png", "bitmap images", "pixels", "tiff", "gif"]},
            {"id": "19.4", "title": "Compression", "keywords": ["compression", "lossy", "lossless", "image compression"]},
            {"id": "19.5", "title": "Text", "keywords": ["typography", "sans-serif", "serif", "kerning", "leading", "font size", "text formatting"]}
        ]
    },
    {
        "chapter_num": 20,
        "chapter_title": "Animation",
        "topics": [
            {"id": "20.1", "title": "Animation", "keywords": ["animation", "frame", "keyframe", "tweening", "stop motion", "onion skinning", "fps", "rotoscoping", "frame-by-frame", "frames", "keyframes", "motion tweening", "shape tweening"]}
        ]
    },
    {
        "chapter_num": 21,
        "chapter_title": "Programming for the web",
        "topics": [
            {"id": "21.1", "title": "Programming for the web", "keywords": ["programming for the web", "javascript", "js", "html", "css", "dom", "client-side scripting", "script", "scripts", "browser", "document.write", "function", "variable", "onload"]}
        ]
    }
]

# Helper to read and extract all text from a PDF
def extract_pdf_text(path):
    try:
        reader = pypdf.PdfReader(path)
        text = ""
        for idx, page in enumerate(reader.pages):
            text += f"\n--- PAGE {idx+1} ---\n" + page.extract_text()
        return text
    except Exception as e:
        print(f"Error reading {path}: {e}")
        return ""

# Parses Theory Question Papers (P1 and P3)
def parse_qp(text):
    lines = text.split("\n")
    subquestions = []
    
    current_q_num = None
    current_part = None
    current_subpart = None
    current_q_text_lines = []
    current_q_marks = None
    is_completed = False
    pending_intro = []
    
    current_page = 1
    current_q_page = 1
    
    for line in lines:
        line_stripped = line.strip()
        if not line_stripped:
            continue
            
        page_match = re.match(r"^--- PAGE (\d+) ---$", line_stripped)
        if page_match:
            current_page = int(page_match.group(1))
            continue
            
        if "© UCLES" in line or "Turn over" in line or "9626/" in line:
            continue
        if line_stripped.isdigit():
            continue
            
        m1 = re.match(r"^(\d+)\s*\(([a-z])\)\s+(.*)", line_stripped)
        m2 = re.match(r"^(\d+)\s+([A-Z].*)", line_stripped)
        m4 = re.match(r"^\(([ivx]+)\)\s+(.*)", line_stripped)
        m3 = re.match(r"^\(([a-z])\)\s+(.*)", line_stripped)
        
        is_new_part = False
        new_q_num, new_part, new_subpart, content = None, None, None, ""
        
        if m1:
            new_q_num = int(m1.group(1))
            new_part = m1.group(2)
            content = m1.group(3)
            is_new_part = True
        elif m2:
            new_q_num = int(m2.group(1))
            content = m2.group(2)
            is_new_part = True
        elif m4:
            if current_q_num is not None and current_part is not None:
                new_q_num = current_q_num
                new_part = current_part
                new_subpart = m4.group(1)
                content = m4.group(2)
                is_new_part = True
        elif m3:
            if current_q_num is not None:
                new_q_num = current_q_num
                new_part = m3.group(1)
                content = m3.group(2)
                is_new_part = True
                
        if is_new_part and new_q_num is not None and new_q_num < 30:
            if current_q_num is not None:
                text_content = " ".join(current_q_text_lines)
                text_content = re.sub(r'\.{4,}', '', text_content)
                text_content = re.sub(r'\s+', ' ', text_content).strip()
                
                label = str(current_q_num)
                if current_part:
                    label += f"({current_part})"
                if current_subpart:
                    label += f"({current_subpart})"
                    
                subquestions.append({
                    "label": label,
                    "q_num": current_q_num,
                    "part": current_part,
                    "subpart": current_subpart,
                    "text": text_content,
                    "marks": current_q_marks,
                    "page": current_q_page
                })
            
            current_q_num = new_q_num
            current_part = new_part
            current_subpart = new_subpart
            current_q_marks = None
            is_completed = False
            current_q_page = current_page
            
            if pending_intro:
                content = " ".join(pending_intro) + " " + content
                pending_intro = []
                
            current_q_text_lines = [content]
            
            marks_match = re.search(r"\[(\d+)\]\s*$", content)
            if marks_match:
                current_q_marks = int(marks_match.group(1))
                current_q_text_lines[0] = content[:marks_match.start()].strip()
                is_completed = True
        else:
            if current_q_num is not None:
                if is_completed:
                    pending_intro.append(line_stripped)
                else:
                    marks_match = re.search(r"\[(\d+)\]\s*$", line_stripped)
                    if marks_match:
                        current_q_marks = int(marks_match.group(1))
                        line_without_marks = line_stripped[:marks_match.start()].strip()
                        if line_without_marks:
                            current_q_text_lines.append(line_without_marks)
                        is_completed = True
                    else:
                        current_q_text_lines.append(line_stripped)
                        
    if current_q_num is not None:
        text_content = " ".join(current_q_text_lines)
        text_content = re.sub(r'\.{4,}', '', text_content)
        text_content = re.sub(r'\s+', ' ', text_content).strip()
        
        label = str(current_q_num)
        if current_part:
            label += f"({current_part})"
        if current_subpart:
            label += f"({current_subpart})"
            
        subquestions.append({
            "label": label,
            "q_num": current_q_num,
            "part": current_part,
            "subpart": current_subpart,
            "text": text_content,
            "marks": current_q_marks,
            "page": current_q_page
        })
        
    # Post-processing normalization
    for idx, sq in enumerate(subquestions):
        if sq["part"] is not None and sq["subpart"] is None:
            m = re.match(r"^\(([ivx]+)\)\s+(.*)", sq["text"])
            if m:
                sq["subpart"] = m.group(1)
                sq["text"] = m.group(2)
                sq["label"] = f"{sq['q_num']}({sq['part']})({sq['subpart']})"
                
        if sq["part"] is not None and sq["subpart"] is None:
            if idx + 1 < len(subquestions):
                next_sq = subquestions[idx + 1]
                if next_sq["q_num"] == sq["q_num"] and next_sq["part"] == sq["part"] and next_sq["subpart"] == "ii":
                    sq["subpart"] = "i"
                    sq["label"] = f"{sq['q_num']}({sq['part']})({sq['subpart']})"
                    sq["text"] = re.sub(r"\b\(i\)\s+", "", sq["text"])
                    sq["text"] = sq["text"].replace("(i) ", "").replace(" (i)", "")
                
    return subquestions

# Parses Theory Mark Schemes (MS)
def parse_ms(text, qp_labels):
    lines = text.split("\n")
    answers = {}
    current_label = None
    current_lines = []
    
    current_page = 1
    current_label_page = 1
    
    for line in lines:
        line_stripped = line.strip()
        if not line_stripped:
            continue
            
        page_match = re.match(r"^--- PAGE (\d+) ---$", line_stripped)
        if page_match:
            current_page = int(page_match.group(1))
            continue
            
        m1 = re.match(r"^(\d+)\(([a-z])\)\(([ivx]+)\)\s*(.*)", line_stripped)
        m2 = re.match(r"^(\d+)\(([a-z])\)\s*(.*)", line_stripped)
        m3 = re.match(r"^(\d+)\s+([A-Za-z].*)", line_stripped)
        
        matched_label = None
        content = ""
        
        if m1:
            q_num = int(m1.group(1))
            part = m1.group(2)
            subpart = m1.group(3)
            label = f"{q_num}({part})({subpart})"
            content = m1.group(4)
            if label in qp_labels or str(q_num) in qp_labels:
                matched_label = label
        elif m2:
            q_num = int(m2.group(1))
            part = m2.group(2)
            label = f"{q_num}({part})"
            content = m2.group(3)
            if label in qp_labels:
                matched_label = label
            else:
                matching_qp_labels = [l for l in qp_labels if l.startswith(label + "(")]
                if matching_qp_labels:
                    matched_label = label
        elif m3:
            q_num = int(m3.group(1))
            label = str(q_num)
            content = m3.group(2)
            if label in qp_labels or any(l.startswith(label + "(") for l in qp_labels):
                if q_num < 30:
                    matched_label = label
                    
        if matched_label:
            if current_label:
                answers[current_label] = {
                    "text": " ".join(current_lines),
                    "page": current_label_page
                }
            current_label = matched_label
            current_lines = [content]
            current_label_page = current_page
        else:
            if current_label:
                if "© UCLES" not in line and "9626/" not in line and "Cambridge International" not in line:
                    current_lines.append(line_stripped)
                    
    if current_label:
        answers[current_label] = {
            "text": " ".join(current_lines),
            "page": current_label_page
        }
        
    for lbl in list(answers.keys()):
        item = answers[lbl]
        ans_text = item["text"]
        ans_text = re.sub(r'\s+', ' ', ans_text).strip()
        item["text"] = ans_text
        
    return answers

# Parses Practical papers (P2 and P4) which have major tasks
def parse_practical_qp(text):
    lines = text.split("\n")
    tasks = []
    current_task = None
    
    current_page = 1
    
    for line in lines:
        line_stripped = line.strip()
        if not line_stripped:
            continue
            
        page_match = re.match(r"^--- PAGE (\d+) ---$", line_stripped)
        if page_match:
            current_page = int(page_match.group(1))
            continue
            
        if "© UCLES" in line or "Turn over" in line or "9626/" in line:
            continue
        if line_stripped.isdigit():
            continue
            
        # Match e.g. "1 Open and..." or "10 Use your spreadsheet..."
        m = re.match(r"^(\d+)\s+([A-Za-z].*)", line_stripped)
        if m:
            task_num = int(m.group(1))
            if task_num < 40:
                if current_task:
                    tasks.append(current_task)
                current_task = {
                    "label": f"Task {task_num}",
                    "q_num": task_num,
                    "text_lines": [m.group(2)],
                    "marks": None,
                    "page": current_page
                }
        else:
            if current_task:
                current_task["text_lines"].append(line_stripped)
                
    if current_task:
        tasks.append(current_task)
        
    # Clean tasks and extract marks
    for t in tasks:
        full_text = " ".join(t["text_lines"])
        marks_match = re.search(r"\[(\d+)\]\s*$", full_text)
        if marks_match:
            t["marks"] = int(marks_match.group(1))
            full_text = full_text[:marks_match.start()].strip()
        t["text"] = re.sub(r'\s+', ' ', full_text).strip()
        del t["text_lines"]
        
    return tasks

# Parses Practical Mark Scheme (tends to just contain a mark grid or descriptive steps)
def parse_practical_ms(text, task_labels):
    # For practical mark schemes, it is very hard to extract aligned text because it is mixed in grids,
    # so we will return a generic description or try to grab snippets matching task numbers.
    lines = text.split("\n")
    answers = {}
    
    current_task = None
    current_lines = []
    
    current_page = 1
    current_task_page = 1
    
    for line in lines:
        line_stripped = line.strip()
        if not line_stripped:
            continue
            
        page_match = re.match(r"^--- PAGE (\d+) ---$", line_stripped)
        if page_match:
            current_page = int(page_match.group(1))
            continue
            
        # Look for "Task 1" or "Spreadsheet" or "Database" headers
        m = re.match(r"^(Task|Step)\s*(\d+)", line_stripped, re.IGNORECASE)
        if m:
            task_num = m.group(2)
            label = f"Task {task_num}"
            if label in task_labels:
                if current_task:
                    answers[current_task] = {
                        "text": " ".join(current_lines),
                        "page": current_task_page
                    }
                current_task = label
                current_lines = [line_stripped]
                current_task_page = current_page
        else:
            if current_task:
                if "© UCLES" not in line and "9626/" not in line:
                    current_lines.append(line_stripped)
                    
    if current_task:
        answers[current_task] = {
            "text": " ".join(current_lines),
            "page": current_task_page
        }
        
    for lbl in list(answers.keys()):
        item = answers[lbl]
        ans_text = item["text"]
        ans_text = re.sub(r'\s+', ' ', ans_text).strip()
        item["text"] = ans_text
        
    return answers

# Classification logic based on keywords and constraints
def classify_question(text, answer_text, paper_level, is_practical):
    content = (text + " " + (answer_text or "")).lower()
    
    best_topic = None
    best_score = -1
    
    # Level constraints:
    # AS (Paper 1 / Paper 2): Chapters 1-11
    # A Level (Paper 3 / Paper 4): Chapters 12-21
    if paper_level == "AS":
        allowed_chapters = list(range(1, 12))
    else:
        allowed_chapters = list(range(12, 22))
        
    # Practical vs Theory constraints:
    if is_practical:
        if paper_level == "AS":
            # Paper 2: Spreadsheets (8), Databases (10), Audio/Video (11)
            allowed_topics = ["8.1", "8.2", "8.3", "8.4", "10.1", "10.2", "10.3", "10.4", "11.1", "11.2"]
        else:
            # Paper 4: Graphics (19), Animation (20), Web Programming (21)
            allowed_topics = ["19.1", "19.2", "19.3", "19.4", "19.5", "20.1", "21.1"]
    else:
        # Theory can match any allowed chapter topics
        allowed_topics = []
        for ch in SYLLABUS:
            if ch["chapter_num"] in allowed_chapters:
                for topic in ch["topics"]:
                    allowed_topics.append(topic["id"])
                    
    for ch in SYLLABUS:
        if ch["chapter_num"] not in allowed_chapters:
            continue
            
        for topic in ch["topics"]:
            if allowed_topics and topic["id"] not in allowed_topics:
                continue
                
            score = 0
            for kw in topic["keywords"]:
                # Match full words or phrases
                matches = re.findall(rf"\b{re.escape(kw)}\b", content)
                # Count matches: weigh matches in question higher than answers
                for m in matches:
                    if kw in text.lower():
                        score += 2.5
                    else:
                        score += 1.0
            
            # If score is tied or higher, pick the most specific match
            if score > best_score:
                best_score = score
                best_topic = topic["id"]
                
    # Fallbacks if no score matches:
    if best_score <= 0:
        if is_practical:
            if paper_level == "AS":
                # Default to Spreadsheets
                best_topic = "8.1"
            else:
                # Default to Web programming
                best_topic = "21.1"
        else:
            if paper_level == "AS":
                # Default to Chapter 1
                best_topic = "1.1"
            else:
                # Default to Chapter 12
                best_topic = "12.4"
                
    return best_topic

# Main script execution
def main():
    global SYLLABUS
    
    folder = r"c:\Users\mali\Documents\9626 topical questions\9626 Past Papers"
    
    # Load existing database to preserve manual edits
    existing_assignments = {}
    db_path = r"c:\Users\mali\Documents\9626 topical questions\questions_db.json"
    if os.path.exists(db_path):
        try:
            with open(db_path, "r", encoding="utf-8") as f:
                old_db = json.load(f)
                if old_db.get("chapters"):
                    SYLLABUS = old_db["chapters"]
                    print("Loaded custom syllabus structure from existing database.")
                for q in old_db.get("questions", []):
                    key = (q.get("year"), q.get("session"), q.get("paper"), q.get("variant"), q.get("num_label"), q.get("text", "")[:30])
                    existing_assignments[key] = q.get("topic_id")
            print(f"Loaded {len(existing_assignments)} manual topic assignments from existing database.")
        except Exception as e:
            print(f"Warning: Could not load existing database: {e}")
            
    all_files = os.listdir(folder)
    
    # Filter files
    qp_files = []
    ms_files = []
    
    # Normalize paths and match Question Papers vs Mark Schemes
    for f in all_files:
        if not f.endswith(".pdf"):
            continue
        f_lower = f.lower()
        if "question paper" in f_lower:
            qp_files.append(f)
        elif "mark scheme" in f_lower:
            ms_files.append(f)
            
    print(f"Found {len(qp_files)} Question Papers and {len(ms_files)} Mark Schemes.")
    
    # Pairing function
    # Match by Year, Month (June/Nov/March), and Variant
    paired = []
    for qp in qp_files:
        # Extract Month, Year, and Variant
        # Example name: 9626 Information Technology June 2021 Question paper  11.pdf
        # Or: 9626 Information Technology November 2022 Question Paper 2.pdf
        m = re.search(r"Information Technology\s+(June|March|November)\s+(\d{4})\s+Question\s+Paper\s+(\d+)\.pdf", qp, re.IGNORECASE)
        if m:
            month = m.group(1)
            year = m.group(2)
            variant = m.group(3)
            
            # Look for matching mark scheme
            # MS might have slightly different spacing or spelling
            match_ms = None
            for ms in ms_files:
                # Variant in MS can be single digit while QP is double digit (e.g. 02 vs 2)
                ms_pattern = rf"Information Technology\s+{month}\s+{year}\s+Mark\s+Scheme\s+0?{int(variant)}\.pdf"
                if re.search(ms_pattern, ms, re.IGNORECASE):
                    match_ms = ms
                    break
            
            paired.append({
                "qp": qp,
                "ms": match_ms,
                "month": month,
                "year": int(year),
                "variant": variant
            })
            
    print(f"Successfully paired {len(paired)} past papers.")
    
    questions_list = []
    
    for idx, pair in enumerate(paired):
        qp_name = pair["qp"]
        ms_name = pair["ms"]
        
        qp_path = os.path.join(folder, qp_name)
        ms_path = os.path.join(folder, ms_name) if ms_name else None
        
        # Determine paper level (AS vs A Level) based on variant
        # Paper 1: Variant 11, 12, 13 (AS Theory)
        # Paper 2: Variant 2, 02 (AS Practical)
        # Paper 3: Variant 31, 32, 33 (A Level Theory)
        # Paper 4: Variant 4, 04 (A Level Practical)
        var_num = int(pair["variant"])
        
        is_practical = var_num in [2, 4]
        paper_level = "AS" if var_num in [11, 12, 13, 2] else "A Level"
        paper_name = f"Paper {1 if var_num in [11,12,13] else 2 if var_num == 2 else 3 if var_num in [31,32,33] else 4}"
        
        print(f"[{idx+1}/{len(paired)}] Parsing {qp_name} ({paper_level} {paper_name})...")
        
        qp_text = extract_pdf_text(qp_path)
        ms_text = extract_pdf_text(ms_path) if ms_path else ""
        
        if not is_practical:
            # Theory Paper Parsing
            subqs = parse_qp(qp_text)
            qp_labels = set(sq["label"] for sq in subqs)
            
            ms_answers = {}
            if ms_text:
                ms_answers = parse_ms(ms_text, qp_labels)
                
            for sq in subqs:
                label = sq["label"]
                answer_text = None
                ms_page = None
                
                if label in ms_answers:
                    answer_text = ms_answers[label]["text"]
                    ms_page = ms_answers[label]["page"]
                else:
                    # Look for parent label
                    if "(" in label:
                        parts = label.split("(")
                        if len(parts) == 3:
                            parent_label = f"{parts[0]}({parts[1]}"
                            if parent_label in ms_answers:
                                answer_text = ms_answers[parent_label]["text"]
                                ms_page = ms_answers[parent_label]["page"]
                                
                # Check if there is an existing manual topic assignment
                q_key = (pair["year"], pair["month"], paper_name, pair["variant"], label, sq["text"][:30])
                if q_key in existing_assignments:
                    topic_id = existing_assignments[q_key]
                else:
                    topic_id = classify_question(sq["text"], answer_text, paper_level, is_practical)
                
                questions_list.append({
                    "id": f"{pair['year']}_{pair['month'].lower()}_{pair['variant']}_q{label.replace('(', '_').replace(')', '')}",
                    "year": pair["year"],
                    "session": pair["month"],
                    "paper": paper_name,
                    "variant": pair["variant"],
                    "num_label": label,
                    "text": sq["text"],
                    "marks": sq["marks"],
                    "topic_id": topic_id,
                    "answers": [answer_text] if answer_text else [],
                    "qp_path": f"9626 Past Papers/{qp_name}",
                    "ms_path": f"9626 Past Papers/{ms_name}" if ms_name else None,
                    "qp_page": sq["page"],
                    "ms_page": ms_page
                })
        else:
            # Practical Paper Parsing
            tasks = parse_practical_qp(qp_text)
            task_labels = set(t["label"] for t in tasks)
            
            ms_answers = {}
            if ms_text:
                ms_answers = parse_practical_ms(ms_text, task_labels)
                
            for t in tasks:
                label = t["label"]
                answer_text = None
                ms_page = None
                
                if label in ms_answers:
                    answer_text = ms_answers[label]["text"]
                    ms_page = ms_answers[label]["page"]
                
                # Check if there is an existing manual topic assignment
                q_key = (pair["year"], pair["month"], paper_name, pair["variant"], label, t["text"][:30])
                if q_key in existing_assignments:
                    topic_id = existing_assignments[q_key]
                else:
                    topic_id = classify_question(t["text"], answer_text, paper_level, is_practical)
                
                questions_list.append({
                    "id": f"{pair['year']}_{pair['month'].lower()}_{pair['variant']}_{label.replace(' ', '_').lower()}",
                    "year": pair["year"],
                    "session": pair["month"],
                    "paper": paper_name,
                    "variant": pair["variant"],
                    "num_label": label,
                    "text": t["text"],
                    "marks": t["marks"],
                    "topic_id": topic_id,
                    "answers": [answer_text] if answer_text else [],
                    "qp_path": f"9626 Past Papers/{qp_name}",
                    "ms_path": f"9626 Past Papers/{ms_name}" if ms_name else None,
                    "qp_page": t["page"],
                    "ms_page": ms_page
                })
                
    # Compile database
    database = {
        "chapters": SYLLABUS,
        "questions": questions_list
    }
    
    db_path = r"c:\Users\mali\Documents\9626 topical questions\questions_db.json"
    with open(db_path, "w", encoding="utf-8") as f:
        json.dump(database, f, indent=2, ensure_ascii=False)
        
    print(f"\nSuccessfully generated database with {len(questions_list)} questions!")
    print(f"Saved to {db_path}")

if __name__ == "__main__":
    main()
