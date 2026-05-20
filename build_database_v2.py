import os
import re
import json
import fitz
import sys

# Ensure console prints in utf-8 to avoid encoding errors on Windows
if sys.platform.startswith('win'):
    sys.stdout.reconfigure(encoding='utf-8')

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

# Helper to extract coordinates of questions from QP
def extract_qp_coords(doc):
    questions = []
    current_q_num = None
    current_part = None
    current_subpart = None
    
    for p_idx in range(len(doc)):
        page = doc[p_idx]
        blocks = page.get_text("blocks")
        blocks.sort(key=lambda b: (b[1], b[0]))
        
        for block in blocks:
            x0, y0, x1, y1, text, block_no, block_type = block
            text = text.replace("\n", " ").strip()
            text = re.sub(r"\s+", " ", text)
            if not text:
                continue
                
            if "© UCLES" in text or "Turn over" in text or "9626/" in text:
                continue
            if text.isdigit() and float(y1) > 780:
                continue
            if text.isdigit() and float(y0) < 50:
                continue
                
            m1 = re.match(r"^(\d+)\s*\(([a-z])\)\s+(.*)", text)
            m2 = re.match(r"^(\d+)\s+([A-Z].*)", text)
            m4 = re.match(r"^\(([ivx]+)\)\s+(.*)", text)  # Check Roman numerals first
            m3 = re.match(r"^\(([a-z])\)\s+(.*)", text)
            
            matched = False
            q_num, part, subpart = None, None, None
            content = ""
            
            if m1:
                q_num = int(m1.group(1))
                part = m1.group(2)
                content = m1.group(3)
                matched = True
            elif m2:
                q_num = int(m2.group(1))
                content = m2.group(2)
                matched = True
            elif m4:
                if current_q_num is not None and current_part is not None:
                    q_num = current_q_num
                    part = current_part
                    subpart = m4.group(1)
                    content = m4.group(2)
                    matched = True
            elif m3:
                if current_q_num is not None:
                    q_num = current_q_num
                    part = m3.group(1)
                    content = m3.group(2)
                    matched = True
                    
            if matched and q_num is not None and q_num < 30:
                current_q_num = q_num
                current_part = part
                current_subpart = subpart
                
                label = str(q_num)
                if part:
                    label += f"({part})"
                if subpart:
                    label += f"({subpart})"
                    
                # Clean question marks out if present
                marks = None
                marks_match = re.search(r"\[(\d+)\]\s*$", content)
                if marks_match:
                    marks = int(marks_match.group(1))
                    content = content[:marks_match.start()].strip()
                    
                questions.append({
                    "label": label,
                    "q_num": q_num,
                    "part": part,
                    "subpart": subpart,
                    "page": p_idx,
                    "y_start": y0,
                    "text": content,
                    "marks": marks
                })
                
    # Normalize labels
    for idx, sq in enumerate(questions):
        if sq["part"] is not None and sq["subpart"] is None:
            if idx + 1 < len(questions):
                next_sq = questions[idx + 1]
                if next_sq["q_num"] == sq["q_num"] and next_sq["part"] == sq["part"] and next_sq["subpart"] == "ii":
                    sq["subpart"] = "i"
                    sq["label"] = f"{sq['q_num']}({sq['part']})({sq['subpart']})"
                    
    return questions

# Helper to extract coordinates of answers from MS
def extract_ms_coords(doc, qp_labels):
    ms_coords = []
    
    for p_idx in range(len(doc)):
        page = doc[p_idx]
        blocks = page.get_text("blocks")
        blocks.sort(key=lambda b: (b[1], b[0]))
        
        for block in blocks:
            x0, y0, x1, y1, text, block_no, block_type = block
            
            # Reject blocks in the right column (marks column is usually x0 > 500)
            if x0 > 120:
                continue
                
            text = text.replace("\n", " ").strip()
            text = re.sub(r"\s+", " ", text)
            if not text:
                continue
                
            if "© UCLES" in text or "Cambridge International" in text or "PUBLISHED" in text:
                continue
                
            for label in qp_labels:
                escaped_label = re.escape(label)
                if label.endswith(')'):
                    pattern = rf"^{escaped_label}(?:\s+|$)(.*)"
                else:
                    pattern = rf"^{escaped_label}\b(.*)"
                    
                m = re.match(pattern, text)
                if m:
                    ms_coords.append({
                        "label": label,
                        "page": p_idx,
                        "y_start": y0,
                        "x_start": x0,
                        "text": text
                    })
                    break
                    
    cleaned = []
    seen = set()
    for item in ms_coords:
        key = (item["label"], item["page"])
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(item)
        
    return cleaned

# Helper to check if an image is blank or meaningless (solid white or almost entirely white)
def is_image_blank(pix):
    if not pix:
        return True
    samples = pix.samples
    if not samples:
        return True
    sample_bytes = samples[::10]
    if not sample_bytes:
        return True
    non_white_count = sum(1 for b in sample_bytes if b < 240)
    ratio = non_white_count / len(sample_bytes)
    return ratio < 0.003

# Helper to check if an image is useless (either blank, too thin, or page header/footer/barcode)
def is_image_useless(pix, is_subsequent=False):
    if is_image_blank(pix):
        return True
    h = pix.height
    if h <= 40:
        return True
    if is_subsequent and h <= 70:
        return True
    return False

def is_file_useless(fpath):
    if not os.path.exists(fpath):
        return True
    try:
        pix = fitz.Pixmap(fpath)
        is_subsequent = not fpath.endswith('_p0.jpg')
        return is_image_useless(pix, is_subsequent)
    except Exception:
        return True

# Helper to crop regions of PDF pages and save them as JPEGs
def crop_pdf_to_images(doc, page_start, y_start, page_end, y_end, prefix):
    image_paths = []
    
    # Adjust starting margin to exclude page headers
    # base page dimensions
    # A4 standard height is usually 841.89 pt
    matrix = fitz.Matrix(2, 2) # 2x zoom for clarity (144 DPI equivalent)
    
    if page_start == page_end:
        page = doc[page_start]
        w, h = page.rect.width, page.rect.height
        
        # Enforce header/footer exclusion margins
        final_y_start = max(45, y_start - 8)
        final_y_end = min(785, y_end + 8)
        
        # Guard coordinates
        if final_y_start >= final_y_end:
            final_y_start = max(0, y_start - 4)
            final_y_end = min(h, y_end + 4)
            
        rect = fitz.Rect(0, final_y_start, w, final_y_end)
        pix = page.get_pixmap(clip=rect, matrix=matrix)
        
        if not is_image_useless(pix, is_subsequent=False):
            out_name = f"{prefix}_p0.jpg"
            pix.save(out_name, "jpg")
            image_paths.append(out_name)
    else:
        # Multi-page question crop
        for p in range(page_start, page_end + 1):
            page = doc[p]
            w, h = page.rect.width, page.rect.height
            
            if p == page_start:
                final_y_start = max(45, y_start - 8)
                rect = fitz.Rect(0, final_y_start, w, 785)
            elif p == page_end:
                final_y_end = min(785, y_end + 8)
                rect = fitz.Rect(0, 45, w, final_y_end)
            else:
                # Full page between start and end
                # Check if page is blank
                text = page.get_text().strip()
                if "BLANK PAGE" in text:
                    continue
                rect = fitz.Rect(0, 45, w, 785)
                
            pix = page.get_pixmap(clip=rect, matrix=matrix)
            is_subsequent = (p > page_start)
            if not is_image_useless(pix, is_subsequent):
                out_name = f"{prefix}_p{p - page_start}.jpg"
                pix.save(out_name, "jpg")
                image_paths.append(out_name)
            
    return image_paths

# Classification function
def classify_question(text, answer_text, paper_level, is_practical):
    content = (text + " " + (answer_text or "")).lower()
    best_topic = None
    best_score = -1
    
    if paper_level == "AS":
        allowed_chapters = list(range(1, 12))
    else:
        allowed_chapters = list(range(12, 22))
        
    if is_practical:
        if paper_level == "AS":
            allowed_topics = ["8.1", "8.2", "8.3", "8.4", "10.1", "10.2", "10.3", "10.4", "11.1", "11.2"]
        else:
            allowed_topics = ["19.1", "19.2", "19.3", "19.4", "19.5", "20.1", "21.1"]
    else:
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
                matches = re.findall(rf"\b{re.escape(kw)}\b", content)
                for m in matches:
                    if kw in text.lower():
                        score += 2.5
                    else:
                        score += 1.0
            
            if score > best_score:
                best_score = score
                best_topic = topic["id"]
                
    if best_score <= 0:
        if is_practical:
            best_topic = "8.1" if paper_level == "AS" else "21.1"
        else:
            best_topic = "1.1" if paper_level == "AS" else "12.4"
            
    return best_topic

# Main pipeline execution
def main():
    global SYLLABUS
    
    pdf_folder = r"c:\Users\mali\Documents\9626 topical questions\9626 Past Papers"
    img_folder = r"c:\Users\mali\Documents\9626 topical questions\questions_images"
    os.makedirs(img_folder, exist_ok=True)
    
    # Load existing database to preserve manual edits
    existing_assignments = {}
    db_path = r"c:\Users\mali\Documents\9626 topical questions\questions_db_v2.json"
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
            
    all_files = os.listdir(pdf_folder)
    qp_files = []
    ms_files = []
    
    for f in all_files:
        if not f.endswith(".pdf"):
            continue
        f_lower = f.lower()
        if "question paper" in f_lower:
            qp_files.append(f)
        elif "mark scheme" in f_lower:
            ms_files.append(f)
            
    paired = []
    for qp in qp_files:
        m = re.search(r"Information Technology\s+(June|March|November)\s+(\d{4})\s+Question\s+Paper\s+(\d+)\.pdf", qp, re.IGNORECASE)
        if m:
            month = m.group(1)
            year = m.group(2)
            variant = m.group(3)
            
            match_ms = None
            for ms in ms_files:
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
            
    print(f"Paired {len(paired)} past papers. Starting crop generation...")
    questions_list = []
    
    for idx, pair in enumerate(paired):
        qp_name = pair["qp"]
        ms_name = pair["ms"]
        
        qp_path = os.path.join(pdf_folder, qp_name)
        ms_path = os.path.join(pdf_folder, ms_name) if ms_name else None
        
        var_num = int(pair["variant"])
        is_practical = var_num in [2, 4]
        paper_level = "AS" if var_num in [11, 12, 13, 2] else "A Level"
        paper_name = f"Paper {1 if var_num in [11,12,13] else 2 if var_num == 2 else 3 if var_num in [31,32,33] else 4}"
        
        paper_id = f"{pair['year']}_{pair['month'].lower()}_{pair['variant']}"
        print(f"[{idx+1}/{len(paired)}] Processing {qp_name}...")
        
        # Open documents
        qp_doc = fitz.open(qp_path)
        ms_doc = fitz.open(ms_path) if ms_path else None
        
        # 1. Parse QP Coordinates
        q_coords = []
        if is_practical:
            # For practical, we parse task numbers
            for p in range(len(qp_doc)):
                page = qp_doc[p]
                blocks = page.get_text("blocks")
                blocks.sort(key=lambda b: (b[1], b[0]))
                for block in blocks:
                    text = block[4].replace("\n", " ").strip()
                    text = re.sub(r"\s+", " ", text)
                    if "© UCLES" in text or "Turn over" in text or "9626/" in text:
                        continue
                    m = re.match(r"^(\d+)\s+([A-Za-z].*)", text)
                    if m:
                        task_num = int(m.group(1))
                        if task_num < 40:
                            q_coords.append({
                                "label": f"Task {task_num}",
                                "q_num": task_num,
                                "page": p,
                                "y_start": block[1],
                                "text": text,
                                "marks": None
                            })
        else:
            q_coords = extract_qp_coords(qp_doc)
            
        qp_labels = [q["label"] for q in q_coords]
        
        # 2. Parse MS Coordinates
        ms_coords = []
        if ms_doc:
            if is_practical:
                # Practical MS: search for "Task X" headers
                for p in range(len(ms_doc)):
                    page = ms_doc[p]
                    blocks = page.get_text("blocks")
                    blocks.sort(key=lambda b: (b[1], b[0]))
                    for block in blocks:
                        text = block[4].replace("\n", " ").strip()
                        text = re.sub(r"\s+", " ", text)
                        m = re.match(r"^(Task|Step)\s*(\d+)", text, re.IGNORECASE)
                        if m:
                            task_num = int(m.group(2))
                            label = f"Task {task_num}"
                            if label in qp_labels:
                                ms_coords.append({
                                    "label": label,
                                    "page": p,
                                    "y_start": block[1]
                                })
            else:
                ms_coords = extract_ms_coords(ms_doc, qp_labels)
                
        # 3. Crop Questions
        # Sort coordinates to enable lookahead sizing
        q_coords.sort(key=lambda item: (item["page"], item["y_start"]))
        
        for q_idx, q in enumerate(q_coords):
            # Calculate end coordinates
            # A4 standard height is 841.89 pt
            page_end = q["page"]
            y_end = 800.0
            
            if q_idx + 1 < len(q_coords):
                next_q = q_coords[q_idx + 1]
                page_end = next_q["page"]
                y_end = next_q["y_start"] - 12.0
                
            prefix_q = os.path.join(img_folder, f"{paper_id}_q_{q['label'].replace('(', '_').replace(')', '')}")
            
            try:
                if is_practical:
                    # Save full pages for practicals
                    q_images = []
                    for p in range(q["page"], page_end + 1):
                        out_name = f"{prefix_q}_p{p - q['page']}.jpg"
                        is_sub = (p > q["page"])
                        if not os.path.exists(out_name):
                            page = qp_doc[p]
                            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                            if not is_image_useless(pix, is_sub):
                                pix.save(out_name, "jpg")
                                q_images.append(os.path.relpath(out_name, os.path.dirname(img_folder)))
                        else:
                            if is_file_useless(out_name):
                                try:
                                    os.remove(out_name)
                                except Exception:
                                    pass
                            else:
                                q_images.append(os.path.relpath(out_name, os.path.dirname(img_folder)))
                else:
                    # Crop slice
                    first_crop = f"{prefix_q}_p0.jpg"
                    if not os.path.exists(first_crop):
                        q_raw_images = crop_pdf_to_images(qp_doc, q["page"], q["y_start"], page_end, y_end, prefix_q)
                    else:
                        q_raw_images = []
                        p = 0
                        while True:
                            check_path = f"{prefix_q}_p{p}.jpg"
                            if os.path.exists(check_path):
                                if is_file_useless(check_path):
                                    try:
                                        os.remove(check_path)
                                    except Exception:
                                        pass
                                else:
                                    q_raw_images.append(check_path)
                                p += 1
                            else:
                                break
                    # Convert to relative paths
                    q_images = [os.path.relpath(path, os.path.dirname(img_folder)) for path in q_raw_images]
            except Exception as e:
                print(f"Error cropping QP for {paper_id} {q['label']}: {e}")
                q_images = []
                
            # 4. Crop Answers
            ans_images = []
            answer_text = ""
            
            # Find MS coord
            ms_c = next((item for item in ms_coords if item["label"] == q["label"]), None)
            if ms_c and ms_doc:
                # Find next MS coord on the same or later pages to calculate height boundary
                # Sort ms coords
                ms_coords.sort(key=lambda item: (item["page"], item["y_start"]))
                ms_c_idx = ms_coords.index(ms_c)
                
                ms_page_end = ms_c["page"]
                ms_y_end = 800.0
                
                if ms_c_idx + 1 < len(ms_coords):
                    next_ms_c = ms_coords[ms_c_idx + 1]
                    ms_page_end = next_ms_c["page"]
                    ms_y_end = next_ms_c["y_start"] - 12.0
                    
                prefix_ms = os.path.join(img_folder, f"{paper_id}_ms_{q['label'].replace('(', '_').replace(')', '')}")
                
                try:
                    if is_practical:
                        # Full page answer for practicals
                        for p in range(ms_c["page"], ms_page_end + 1):
                            out_name = f"{prefix_ms}_p{p - ms_c['page']}.jpg"
                            is_sub = (p > ms_c["page"])
                            if not os.path.exists(out_name):
                                page = ms_doc[p]
                                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                                if not is_image_useless(pix, is_sub):
                                    pix.save(out_name, "jpg")
                                    ans_images.append(os.path.relpath(out_name, os.path.dirname(img_folder)))
                            else:
                                if is_file_useless(out_name):
                                    try:
                                        os.remove(out_name)
                                    except Exception:
                                        pass
                                else:
                                    ans_images.append(os.path.relpath(out_name, os.path.dirname(img_folder)))
                    else:
                        # Crop slice
                        first_ms_crop = f"{prefix_ms}_p0.jpg"
                        if not os.path.exists(first_ms_crop):
                            ms_raw_images = crop_pdf_to_images(ms_doc, ms_c["page"], ms_c["y_start"], ms_page_end, ms_y_end, prefix_ms)
                        else:
                            ms_raw_images = []
                            p = 0
                            while True:
                                check_path = f"{prefix_ms}_p{p}.jpg"
                                if os.path.exists(check_path):
                                    if is_file_useless(check_path):
                                        try:
                                            os.remove(check_path)
                                        except Exception:
                                            pass
                                    else:
                                        ms_raw_images.append(check_path)
                                    p += 1
                                else:
                                    break
                        ans_images = [os.path.relpath(path, os.path.dirname(img_folder)) for path in ms_raw_images]
                        
                    # Extract raw text for searching purposes
                    extracted_texts = []
                    for p in range(ms_c["page"], ms_page_end + 1):
                        extracted_texts.append(ms_doc[p].get_text())
                    answer_text = " ".join(extracted_texts).strip()
                    answer_text = re.sub(r"\s+", " ", answer_text)
                except Exception as e:
                    print(f"Error cropping MS for {paper_id} {q['label']}: {e}")
                    
            # Check if there is an existing manual topic assignment
            q_key = (pair["year"], pair["month"], paper_name, pair["variant"], q["label"], q["text"][:30])
            if q_key in existing_assignments:
                topic_id = existing_assignments[q_key]
            else:
                topic_id = classify_question(q["text"], answer_text, paper_level, is_practical)
            
            questions_list.append({
                "id": f"{paper_id}_q{q['label'].replace('(', '_').replace(')', '')}",
                "year": pair["year"],
                "session": pair["month"],
                "paper": paper_name,
                "variant": pair["variant"],
                "num_label": q["label"],
                "text": q["text"],  # text kept for search query matching
                "marks": q["marks"],
                "topic_id": topic_id,
                "images_q": q_images,
                "images_ms": ans_images,
                "qp_path": f"9626 Past Papers/{qp_name}",
                "ms_path": f"9626 Past Papers/{ms_name}" if ms_name else None,
                "qp_page": q["page"] + 1,
                "ms_page": ms_c["page"] + 1 if (ms_c and ms_doc) else None
            })
            
        qp_doc.close()
        if ms_doc:
            ms_doc.close()
            
    database = {
        "chapters": SYLLABUS,
        "questions": questions_list
    }
    
    db_path = r"c:\Users\mali\Documents\9626 topical questions\questions_db_v2.json"
    with open(db_path, "w", encoding="utf-8") as f:
        json.dump(database, f, indent=2, ensure_ascii=False)
        
    print(f"\nCompleted V2 Screenshot Generation!")
    print(f"Generated screenshots for {len(questions_list)} questions.")
    print(f"Database saved to {db_path}")

if __name__ == "__main__":
    main()
