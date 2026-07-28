import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from datetime import datetime, timedelta
from app.core.database import connect_mongodb, get_database

ORG = "claude-verify-tmp-org"
connect_mongodb()
db = get_database()
db.session_insights.delete_many({"organization_id": ORG})
db.session_insights.insert_many([
    {"organization_id": ORG, "session_id": "old-session-1",
     "summary": "Planned to renegotiate the warehouse lease before September",
     "type": "insight", "status": "open",
     "created_at": datetime.utcnow() - timedelta(days=7)},
    {"organization_id": ORG, "session_id": "old-session-2",
     "summary": "Wanted to hire two junior electricians",
     "type": "insight", "status": "open",
     "created_at": datetime.utcnow() - timedelta(days=3)},
])
print("SEEDED:", db.session_insights.count_documents({"organization_id": ORG}))
