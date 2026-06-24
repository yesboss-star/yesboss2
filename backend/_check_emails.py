import sys; sys.path.insert(0, '.')
from app.core.database import get_database
db = get_database()
if db is not None:
    print("=== employees ===")
    for m in db.employees.find({}).limit(10):
        print(f'  {m.get("full_name","?")} -> {m.get("email","?")}')
    print("=== users ===")
    for u in db.users.find({}).limit(10):
        print(f'  uid={u.get("uid","?")} email={u.get("email","?")}')
else:
    print('No DB')
