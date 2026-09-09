from app.core.database import get_database
from app.api.strategy_chat import _file_scope, _can_access_file
from app.dependencies.scope import is_org_member, is_org_owner
import asyncio

async def main():
    db=get_database()
    org_id="6a59d31fc6176fdda57c0d19"
    # Get user
    u=db.users.find_one({'email': 'valuescore@value-score.co.in'})
    print('user found', bool(u), u.get('email') if u else None, u.get('uid') if u else None)
    class CU:
        def __init__(self, uid, email):
            self.id=uid
            self.uid=uid
            self.email=email
            self.user_metadata={'organization_id': org_id}
    cu=CU(u.get('uid'), u.get('email'))
    print('is_org_owner', await is_org_owner(db, org_id, cu))
    print('is_org_member', await is_org_member(db, org_id, cu))
    is_owner, filt = await _file_scope(db, cu, org_id)
    print('_file_scope is_owner', is_owner, 'filter', filt)
    docs_query={"org_id": org_id, **filt}
    print('docs_query', docs_query)
    docs=list(db.documents.find(docs_query).sort("created_at",-1).limit(50))
    print('docs found', len(docs))
    for d in docs[:3]:
        print(' -', d.get('filename'), d.get('insights_status'), d.get('org_id'))
    # Also test without is_org_owner fallback role check
    # Check users role
    print('user role', u.get('role'))
    # Simulate frontend call without organization_id (uses get_user_org_id)
    # get_user_org_id reads user_metadata organization_id
    from app.api.strategy_chat import get_user_org_id
    print('get_user_org_id', get_user_org_id(cu))
    # Check distinct org ids
    print('distinct org_id docs', db.documents.distinct('org_id'))

asyncio.run(main())
