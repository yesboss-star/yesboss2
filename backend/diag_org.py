from app.core.database import get_database
from app.dependencies.scope import resolve_user_org_ids
import asyncio

async def main():
    db=get_database()
    if db is None:
        print('no db')
        return
    # Find Value Score org
    org = db.organizations.find_one({'name': {'$regex': 'Value Score', '$options':'i'}})
    if org:
        print('Value Score org:', str(org['_id']), 'owner', org.get('owner_id'), 'domain', org.get('domain'))
        oid=str(org['_id'])
        print('documents org_id count:', db.documents.count_documents({'org_id': oid}))
        print('documents organization_id count:', db.documents.count_documents({'organization_id': oid}))
        print('total documents:', db.documents.count_documents({}))
        for d in db.documents.find({}, {'org_id':1,'organization_id':1,'filename':1}).limit(5):
            print('doc sample', d)
        print('files count org', db.files.count_documents({'organization_id': oid}))
        print('total files', db.files.count_documents({}))
        for f in db.files.find({}, {'organization_id':1,'filename':1}).limit(5):
            print('file sample', f)
        u=db.users.find_one({'email': {'$regex':'valuescore', '$options':'i'}})
        if u:
            print('user', u.get('email'), u.get('uid'), u.get('organization_id'))
            class FakeUser: pass
            fu=FakeUser()
            fu.id=u.get('uid')
            fu.email=u.get('email')
            fu.uid=u.get('uid')
            ids=await resolve_user_org_ids(db, fu)
            print('resolve_user_org_ids', ids)
        else:
            m=db.org_chart_members.find_one({'email': {'$regex':'valuescore', '$options':'i'}})
            print('org_chart member', m)
            distinct=list(db.documents.distinct('org_id'))
            print('distinct org_id in documents (first 10)', distinct[:10])
            distinct2=list(db.documents.distinct('organization_id'))
            print('distinct organization_id in documents', distinct2[:10])
    else:
        print('no Value Score org found')
        for o in db.organizations.find({}).limit(5):
            print('org', o.get('name'), str(o['_id']))

import asyncio
asyncio.run(main())
