from app.core.database import get_database
from app.api.reports import generate_pdf, generate_docx
import traceback

db = get_database()
org = db.organizations.find_one({"name": {"$regex": "Value Score", "$options": "i"}})
oid = str(org["_id"])
print("org", oid)
report = db.reports.find_one({"organization_id": oid}, sort=[("created_at", -1)])
if not report:
    print("no report found")
    exit()
print("report id", report["_id"])
content = report.get("content", {})
print("keys", list(content.keys()))
print("summary", content.get("summary"))
print("goals len", len(content.get("goals", [])))
print("tasks len", len(content.get("tasks", [])))
print("departments", content.get("departments"))
print("task_breakdown len", len(content.get("task_breakdown", [])))
print("employee_insights len", len(content.get("employee_insights", [])))
# Try PDF
try:
    b = generate_pdf(content, org.get("name", "YesBoss"))
    print("PDF OK", len(b))
    open("test_report.pdf","wb").write(b)
    print("wrote test_report.pdf")
except Exception as e:
    print("PDF FAILED")
    traceback.print_exc()

try:
    b2 = generate_docx(content, org.get("name", "YesBoss"))
    print("DOCX OK", len(b2))
except Exception as e:
    print("DOCX FAILED")
    traceback.print_exc()
