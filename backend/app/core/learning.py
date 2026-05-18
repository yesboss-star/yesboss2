import logging
from datetime import datetime
from typing import Optional
from ..core.database import get_database
from ..core.qdrant import get_qdrant_client

logger = logging.getLogger("yesboss.learning")


class ContinuousLearning:
    def __init__(self):
        self.db = None
        self.qdrant = None

    def _get_db(self):
        if self.db is None:
            self.db = get_database()
        return self.db

    def _get_qdrant(self):
        if self.qdrant is None:
            self.qdrant = get_qdrant_client()
        return self.qdrant

    def record_workflow(self, organization_id: str, workflow_data: dict) -> dict:
        db = self._get_db()
        if not db:
            logger.warning("Database not available for workflow recording")
            return {"success": False, "error": "Database not available"}

        try:
            workflow_doc = {
                "organization_id": organization_id,
                "workflow_type": workflow_data.get("type", "unknown"),
                "steps": workflow_data.get("steps", []),
                "duration_seconds": workflow_data.get("duration"),
                "outcome": workflow_data.get("outcome", "unknown"),
                "efficiency_score": workflow_data.get("efficiency_score"),
                "created_at": datetime.utcnow(),
                "metadata": workflow_data.get("metadata", {}),
            }

            result = db.workflows.insert_one(workflow_doc)
            workflow_doc["_id"] = str(result.inserted_id)

            self._store_workflow_embedding(workflow_doc)

            logger.info(f"Recorded workflow for org {organization_id}")
            return {"success": True, "workflow_id": workflow_doc["_id"]}
        except Exception as e:
            logger.error(f"Error recording workflow: {e}")
            return {"success": False, "error": str(e)}

    def _store_workflow_embedding(self, workflow: dict):
        try:
            qdrant = self._get_qdrant()
            if not qdrant:
                return

            text = f"Workflow: {workflow.get('workflow_type')}, Steps: {workflow.get('steps')}, Outcome: {workflow.get('outcome')}"
            
            from ..core.qdrant import get_embedding
            embedding = get_embedding(text)
            
            qdrant.upsert(
                collection_name="workflows",
                points=[{
                    "id": workflow.get("_id", str(datetime.utcnow().timestamp())),
                    "vector": embedding,
                    "payload": {
                        "organization_id": workflow.get("organization_id"),
                        "workflow_type": workflow.get("workflow_type"),
                        "outcome": workflow.get("outcome"),
                        "efficiency_score": workflow.get("efficiency_score"),
                    }
                }]
            )
        except Exception as e:
            logger.warning(f"Failed to store workflow embedding: {e}")

    def record_task_outcome(self, organization_id: str, task_data: dict) -> dict:
        db = self._get_db()
        if not db:
            return {"success": False, "error": "Database not available"}

        try:
            outcome_doc = {
                "organization_id": organization_id,
                "task_id": task_data.get("task_id"),
                "task_title": task_data.get("title"),
                "status": task_data.get("status"),
                "completed_at": task_data.get("completed_at"),
                "duration_hours": task_data.get("duration_hours"),
                "priority": task_data.get("priority"),
                "assignee_id": task_data.get("assignee_id"),
                "department": task_data.get("department"),
                "was_delayed": task_data.get("was_delayed", False),
                "delay_reason": task_data.get("delay_reason"),
                "quality_score": task_data.get("quality_score"),
                "created_at": datetime.utcnow(),
            }

            result = db.task_outcomes.insert_one(outcome_doc)
            outcome_doc["_id"] = str(result.inserted_id)

            logger.info(f"Recorded task outcome: {task_data.get('task_id')}")
            return {"success": True, "outcome_id": outcome_doc["_id"]}
        except Exception as e:
            logger.error(f"Error recording task outcome: {e}")
            return {"success": False, "error": str(e)}

    def record_bottleneck(self, organization_id: str, bottleneck_data: dict) -> dict:
        db = self._get_db()
        if not db:
            return {"success": False, "error": "Database not available"}

        try:
            bottleneck_doc = {
                "organization_id": organization_id,
                "bottleneck_type": bottleneck_data.get("type", "unknown"),
                "description": bottleneck_data.get("description"),
                "affected_workflows": bottleneck_data.get("affected_workflows", []),
                "impact_score": bottleneck_data.get("impact_score", 0),
                "frequency": bottleneck_data.get("frequency", 1),
                "department": bottleneck_data.get("department"),
                "identified_at": datetime.utcnow(),
                "resolution_status": bottleneck_data.get("status", "open"),
                "suggested_fix": bottleneck_data.get("suggested_fix"),
            }

            result = db.bottlenecks.insert_one(bottleneck_doc)
            bottleneck_doc["_id"] = str(result.inserted_id)

            logger.info(f"Recorded bottleneck: {bottleneck_data.get('type')}")
            return {"success": True, "bottleneck_id": bottleneck_doc["_id"]}
        except Exception as e:
            logger.error(f"Error recording bottleneck: {e}")
            return {"success": False, "error": str(e)}

    def record_pattern(self, organization_id: str, pattern_data: dict) -> dict:
        db = self._get_db()
        if not db:
            return {"success": False, "error": "Database not available"}

        try:
            pattern_doc = {
                "organization_id": organization_id,
                "pattern_type": pattern_data.get("type", "unknown"),
                "pattern_name": pattern_data.get("name"),
                "description": pattern_data.get("description"),
                "frequency": pattern_data.get("frequency", 1),
                "context": pattern_data.get("context", {}),
                "trigger_conditions": pattern_data.get("triggers", []),
                "confidence_score": pattern_data.get("confidence", 0.5),
                "first_seen": datetime.utcnow(),
                "last_seen": datetime.utcnow(),
            }

            existing = db.learning_patterns.find_one({
                "organization_id": organization_id,
                "pattern_type": pattern_data.get("type"),
                "pattern_name": pattern_data.get("name"),
            })

            if existing:
                db.learning_patterns.update_one(
                    {"_id": existing["_id"]},
                    {"$inc": {"frequency": 1}, "$set": {"last_seen": datetime.utcnow()}}
                )
                return {"success": True, "pattern_id": str(existing["_id"]), "updated": True}

            result = db.learning_patterns.insert_one(pattern_doc)
            pattern_doc["_id"] = str(result.inserted_id)

            return {"success": True, "pattern_id": pattern_doc["_id"]}
        except Exception as e:
            logger.error(f"Error recording pattern: {e}")
            return {"success": False, "error": str(e)}

    def analyze_workflow_efficiency(self, organization_id: str, days: int = 30) -> dict:
        db = self._get_db()
        if not db:
            return {"efficiency": 0, "insights": []}

        try:
            from datetime import timedelta
            cutoff = datetime.utcnow() - timedelta(days=days)

            workflows = list(db.workflows.find({
                "organization_id": organization_id,
                "created_at": {"$gte": cutoff}
            }))

            if not workflows:
                return {"efficiency": 0, "insights": [], "message": "No workflow data"}

            total = len(workflows)
            successful = sum(1 for w in workflows if w.get("outcome") == "success")
            avg_duration = sum(w.get("duration_seconds", 0) for w in workflows) / total if total else 0
            avg_efficiency = sum(w.get("efficiency_score", 0) for w in workflows) / total if total else 0

            insights = []
            if avg_efficiency < 0.6:
                insights.append("Workflow efficiency is below 60% - consider automation")
            if avg_duration > 3600:
                insights.append("Average workflow takes over 1 hour - look for unnecessary steps")

            return {
                "total_workflows": total,
                "success_rate": successful / total if total else 0,
                "avg_duration_seconds": avg_duration,
                "efficiency_score": avg_efficiency,
                "insights": insights,
            }
        except Exception as e:
            logger.error(f"Error analyzing workflow: {e}")
            return {"efficiency": 0, "insights": [], "error": str(e)}

    def get_bottlenecks(self, organization_id: str) -> list:
        db = self._get_db()
        if not db:
            return []

        try:
            bottlenecks = list(db.bottlenecks.find({
                "organization_id": organization_id,
                "resolution_status": "open"
            }).sort("impact_score", -1).limit(20))

            for b in bottlenecks:
                b["_id"] = str(b["_id"])

            return bottlenecks
        except Exception as e:
            logger.error(f"Error getting bottlenecks: {e}")
            return []

    def get_patterns(self, organization_id: str, pattern_type: Optional[str] = None) -> list:
        db = self._get_db()
        if not db:
            return []

        try:
            query = {"organization_id": organization_id}
            if pattern_type:
                query["pattern_type"] = pattern_type

            patterns = list(db.learning_patterns.find(query).sort("frequency", -1).limit(50))

            for p in patterns:
                p["_id"] = str(p["_id"])

            return patterns
        except Exception as e:
            logger.error(f"Error getting patterns: {e}")
            return []


learning = ContinuousLearning()