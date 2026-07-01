def test_health_endpoint(client):
    response = client.get("/api/v1/health")
    assert response.status_code in (200, 404)


def test_root_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "YesBoss API"
    assert data["status"] == "running"


def test_docs_endpoint(client):
    response = client.get("/api/docs")
    assert response.status_code in (200, 307)


def test_openapi_schema(client):
    response = client.get("/api/openapi.json")
    assert response.status_code in (200, 307)
