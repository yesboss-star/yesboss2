import hashlib
import logging
from datetime import datetime, timedelta
from typing import Any

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
        if db is None:
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
        if db is None:
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
        if db is None:
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
        if db is None:
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
        if db is None:
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
        if db is None:
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

    def record_goal_outcome(self, organization_id: str, outcome_data: dict) -> dict:
        """Record a goal outcome for cross-company learning."""
        try:
            db = self._get_db()
            if db is None:
                return {"success": False, "error": "Database not available"}

            org_ref = hashlib.sha256(organization_id.encode()).hexdigest()[:16]
            actual_duration = outcome_data.get("actual_duration_days")
            if actual_duration is None and outcome_data.get("created_at") and outcome_data.get("completed_at"):
                try:
                    from datetime import datetime
                    c = datetime.fromisoformat(str(outcome_data["created_at"]).replace("Z", "+00:00"))
                    e = datetime.fromisoformat(str(outcome_data["completed_at"]).replace("Z", "+00:00"))
                    actual_duration = (e - c).days
                except Exception:
                    pass

            outcome_doc = {
                "org_ref": org_ref,
                "industry": outcome_data.get("industry", ""),
                "micro_vertical": outcome_data.get("micro_vertical", ""),
                "goal_id": outcome_data.get("goal_id"),
                "goal_type": outcome_data.get("goal_type"),
                "duration": outcome_data.get("duration"),
                "department": outcome_data.get("department"),
                "priority": outcome_data.get("priority"),
                "status": outcome_data.get("status"),
                "completion_reviewed": outcome_data.get("completion_reviewed", False),
                "actual_duration_days": actual_duration,
                "estimated_duration_days": outcome_data.get("estimated_duration_days"),
                "was_delayed": outcome_data.get("was_delayed", False),
                "delay_reason": outcome_data.get("delay_reason"),
                "created_at": datetime.utcnow(),
                "completed_at": outcome_data.get("completed_at"),
            }

            result = db.goal_outcomes.insert_one(outcome_doc)
            logger.info(f"Recorded goal outcome for {outcome_data.get('goal_id')}")

            return {"success": True, "outcome_id": str(result.inserted_id)}
        except Exception as e:
            logger.error(f"Error recording goal outcome: {e}")
            return {"success": False, "error": str(e)}

    def record_employee_frequency(self, organization_id: str, freq_data: dict) -> dict:
        db = self._get_db()
        if db is None:
            return {"success": False, "error": "Database not available"}
        try:
            org_ref = hashlib.sha256(organization_id.encode()).hexdigest()[:16]

            employee_role = freq_data.get("employee_role", "unknown")
            work_type = freq_data.get("work_type", "task")
            work_category = freq_data.get("work_category", "general")
            complexity = freq_data.get("complexity_level", "intermediate")

            doc = {
                "org_ref": org_ref,
                "employee_role": employee_role,
                "industry": freq_data.get("industry", ""),
                "micro_vertical": freq_data.get("micro_vertical", ""),
                "work_type": work_type,
                "work_category": work_category,
                "frequency_per_week": freq_data.get("frequency_per_week", 1.0),
                "avg_completion_hours": freq_data.get("estimated_hours", 4),
                "typical_delay_hours": freq_data.get("typical_delay_hours", 0),
                "level": complexity,
                "samples": [freq_data.get("title", "")[:100]],
                "last_updated": datetime.utcnow(),
            }

            existing = db.employee_frequencies.find_one({
                "org_ref": org_ref,
                "employee_role": employee_role,
                "work_type": work_type,
                "work_category": work_category,
            })

            if existing:
                samples = existing.get("samples", [])
                snippet = freq_data.get("title", "")[:100]
                if snippet and snippet not in samples:
                    samples.append(snippet)
                    if len(samples) > 20:
                        samples = samples[-20:]

                total = existing.get("_total_samples", 1) or 1
                new_total = total + 1
                alpha = 1.0 / new_total

                db.employee_frequencies.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "avg_completion_hours": existing.get("avg_completion_hours", 4) * (1 - alpha) + (freq_data.get("estimated_hours", 4) * alpha),
                        "frequency_per_week": existing.get("frequency_per_week", 1) + 0.5,
                        "level": complexity,
                        "samples": samples,
                        "last_updated": datetime.utcnow(),
                        "_total_samples": new_total,
                    }}
                )
            else:
                doc["_total_samples"] = 1
                db.employee_frequencies.insert_one(doc)

            return {"success": True}
        except Exception as e:
            logger.error(f"Error recording employee frequency: {e}")
            return {"success": False, "error": str(e)}

    def aggregate_industry_patterns(self, industry: str = None, micro_vertical: str = None) -> dict:
        """Aggregate goal_outcomes across orgs into industry_intelligence."""
        db = self._get_db()
        if db is None:
            return {"success": False, "error": "Database not available"}
        try:
            match = {}
            if industry:
                match["industry"] = industry
            if micro_vertical:
                match["micro_vertical"] = micro_vertical

            pipeline = [
                {"$match": match},
                {"$group": {
                    "_id": {"industry": "$industry", "micro_vertical": "$micro_vertical"},
                    "total_outcomes": {"$sum": 1},
                    "completed_count": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
                    "avg_duration_days": {"$avg": "$actual_duration_days"},
                    "delayed_count": {"$sum": {"$cond": [{"$eq": ["$was_delayed", True]}, 1, 0]}},
                    "goal_types": {"$addToSet": "$goal_type"},
                    "departments": {"$addToSet": "$department"},
                    "priorities": {"$addToSet": "$priority"},
                }}
            ]

            results = list(db.goal_outcomes.aggregate(pipeline))
            for r in results:
                key = r["_id"]
                ind = key["industry"]
                mv = key.get("micro_vertical", "")

                delay_reasons = list(db.goal_outcomes.aggregate([
                    {"$match": {"industry": ind, "micro_vertical": mv, "was_delayed": True}},
                    {"$group": {"_id": "$delay_reason", "count": {"$sum": 1}}},
                    {"$sort": {"count": -1}},
                    {"$limit": 5},
                ]))

                delays_by_type = list(db.goal_outcomes.aggregate([
                    {"$match": {"industry": ind, "micro_vertical": mv}},
                    {"$group": {"_id": "$goal_type", "avg_days": {"$avg": "$actual_duration_days"}, "count": {"$sum": 1}}},
                ]))

                intelligence_doc = {
                    "industry": ind,
                    "micro_vertical": mv,
                    "total_outcomes": r["total_outcomes"],
                    "completion_rate": round(r["completed_count"] / r["total_outcomes"] * 100, 1) if r["total_outcomes"] else 0,
                    "avg_duration_days": round(r["avg_duration_days"], 1) if r["avg_duration_days"] else None,
                    "delay_rate": round(r["delayed_count"] / r["total_outcomes"] * 100, 1) if r["total_outcomes"] else 0,
                    "common_delay_reasons": [{"reason": d["_id"] or "unknown", "count": d["count"]} for d in delay_reasons],
                    "goal_type_benchmarks": {d["_id"]: {"avg_duration_days": round(d["avg_days"], 1) if d["avg_days"] else None, "count": d["count"]} for d in delays_by_type},
                    "goal_types_seen": r["goal_types"],
                    "departments_seen": r["departments"],
                    "last_updated": datetime.utcnow(),
                }

                db.industry_intelligence.update_one(
                    {"industry": ind, "micro_vertical": mv},
                    {"$set": intelligence_doc},
                    upsert=True,
                )

            count = len(results)
            logger.info(f"Aggregated patterns for {count} industry/vertical pairs")
            return {"success": True, "aggregated": count}
        except Exception as e:
            logger.error(f"Error aggregating industry patterns: {e}")
            return {"success": False, "error": str(e)}

    def get_industry_recommendations(self, industry: str, micro_vertical: str = None) -> dict:
        """Get cross-company recommendations for an industry/vertical."""
        db = self._get_db()
        if db is None:
            return {"recommendations": []}
        try:
            query = {"industry": industry}
            if micro_vertical:
                query["micro_vertical"] = micro_vertical

            intelligence = db.industry_intelligence.find_one(query)
            if not intelligence:
                return {"recommendations": [], "message": "Not enough data yet"}

            recommendations = []

            if intelligence.get("avg_duration_days"):
                for gt, bench in (intelligence.get("goal_type_benchmarks") or {}).items():
                    if bench.get("avg_duration_days"):
                        recommendations.append({
                            "type": "benchmark",
                            "category": f"goal_type_{gt}",
                            "title": f"Average {gt.replace('_', ' ')} takes {bench['avg_duration_days']} days",
                            "avg_duration_days": bench["avg_duration_days"],
                            "sample_size": bench["count"],
                        })

            if intelligence.get("delay_rate", 0) > 20:
                top_reasons = intelligence.get("common_delay_reasons", [])
                if top_reasons:
                    recommendations.append({
                        "type": "delay_pattern",
                        "title": f"{intelligence['delay_rate']}% of goals face delays",
                        "common_reasons": [r["reason"] for r in top_reasons[:3]],
                        "delay_rate": intelligence["delay_rate"],
                    })

            completion_rate = intelligence.get("completion_rate", 0)
            if completion_rate:
                recommendations.append({
                    "type": "completion_rate",
                    "title": f"{completion_rate}% goal completion rate in {industry}",
                    "completion_rate": completion_rate,
                })

            return {
                "recommendations": recommendations,
                "industry": industry,
                "micro_vertical": micro_vertical or "",
                "total_outcomes_analyzed": intelligence.get("total_outcomes", 0),
            }
        except Exception as e:
            logger.error(f"Error getting industry recommendations: {e}")
            return {"recommendations": [], "error": str(e)}

    def record_performance_snapshot(self, organization_id: str) -> dict:
        """Weekly snapshot of per-employee avg completion hours for trend tracking."""
        db = self._get_db()
        if db is None:
            return {"success": False}
        try:
            org_ref = hashlib.sha256(organization_id.encode()).hexdigest()[:16]
            freqs = list(db.employee_frequencies.find({"org_ref": org_ref}))
            if not freqs:
                return {"success": False, "message": "No frequency data"}
            snapshot: dict[str, Any] = {
                "organization_id": organization_id,
                "week_start": datetime.utcnow().isoformat(),
                "employees": [],
                "created_at": datetime.utcnow(),
            }
            for f in freqs:
                emp = f.get("employee_role", "")
                existing = next((e for e in snapshot["employees"] if e["email"] == emp), None)
                if existing:
                    existing["categories"] += 1
                    existing["total_hours"] += f.get("avg_completion_hours", 0)
                    existing["total_freq"] += f.get("frequency_per_week", 0)
                else:
                    snapshot["employees"].append({
                        "email": emp,
                        "categories": 1,
                        "total_hours": f.get("avg_completion_hours", 0),
                        "total_freq": f.get("frequency_per_week", 0),
                        "tasks_completed": 0,
                    })
            completed = db.task_outcomes.aggregate([
                {"$match": {"organization_id": organization_id, "created_at": {"$gte": datetime.utcnow() - timedelta(days=7)}}},
                {"$group": {"_id": "$assignee_id", "count": {"$sum": 1}}},
            ])
            for row in completed:
                for e in snapshot["employees"]:
                    if e["email"] == row["_id"]:
                        e["tasks_completed"] = row["count"]
            db.performance_history.insert_one(snapshot)
            return {"success": True, "employee_count": len(snapshot["employees"])}
        except Exception as e:
            logger.error(f"Performance snapshot error: {e}")
            return {"success": False, "error": str(e)}

    def workload_analysis(self, organization_id: str) -> dict:
        db = self._get_db()
        if db is None:
            return {"employees": []}
        try:
            org_ref = hashlib.sha256(organization_id.encode()).hexdigest()[:16]
            freqs = list(db.employee_frequencies.find({"org_ref": org_ref}))
            if not freqs:
                return {"employees": []}
            weekly_capacity: dict[str, dict[str, Any]] = {}
            for f in freqs:
                emp = f.get("employee_role", "")
                if emp not in weekly_capacity:
                    weekly_capacity[emp] = {"categories": set(), "total_hours": 0, "total_freq": 0}
                weekly_capacity[emp]["categories"].add(f.get("work_category", ""))
                weekly_capacity[emp]["total_hours"] += f.get("avg_completion_hours", 0) * f.get("frequency_per_week", 0)
                weekly_capacity[emp]["total_freq"] += f.get("frequency_per_week", 0)
            active_pipeline = [
                {"$match": {"organization_id": organization_id, "status": {"$in": ["pending", "in_progress"]}}},
                {"$unwind": "$assignee_id"},
                {"$group": {"_id": "$assignee_id", "count": {"$sum": 1}}}
            ]
            active_counts = {}
            try:
                for row in db.tasks.aggregate(active_pipeline):
                    active_counts[row["_id"]] = row["count"]
            except Exception:
                pass
            employees = []
            for emp, data in weekly_capacity.items():
                weekly_hours = data["total_hours"]
                active = active_counts.get(emp, 0)
                estimated_capacity = max(weekly_hours, 1) * 1.5
                load_pct = round((active / estimated_capacity) * 100, 1) if estimated_capacity > 0 else 0
                status = "overloaded" if load_pct > 80 else ("underutilized" if load_pct < 30 else "balanced")
                employees.append({
                    "email": emp,
                    "active_tasks": active,
                    "estimated_weekly_hours": round(weekly_hours, 1),
                    "estimated_capacity": round(estimated_capacity, 1),
                    "load_percent": load_pct,
                    "status": status,
                    "categories": list(data["categories"]),
                    "total_frequency": round(data["total_freq"], 1),
                })
            employees.sort(key=lambda x: x["load_percent"], reverse=True)
            return {
                "employees": employees,
                "overloaded": [e for e in employees if e["status"] == "overloaded"],
                "underutilized": [e for e in employees if e["status"] == "underutilized"],
                "balanced": [e for e in employees if e["status"] == "balanced"],
                "total_analyzed": len(employees),
            }
        except Exception as e:
            logger.error(f"Workload analysis error: {e}")
            return {"employees": [], "error": str(e)}

    def estimate_deadline(self, organization_id: str, work_category: str = None) -> dict:
        db = self._get_db()
        if db is None:
            return {"estimated_hours": 4, "confidence": "low"}
        try:
            org_ref = hashlib.sha256(organization_id.encode()).hexdigest()[:16]
            match = {"org_ref": org_ref}
            if work_category:
                match["work_category"] = work_category
            freqs = list(db.employee_frequencies.find(match))
            if not freqs:
                return {"estimated_hours": 4, "confidence": "low", "message": "Not enough data"}
            weighted_sum = sum(f.get("avg_completion_hours", 4) * f.get("_total_samples", 1) for f in freqs)
            total_samples = sum(f.get("_total_samples", 1) for f in freqs)
            avg_hours = round(weighted_sum / total_samples, 1) if total_samples > 0 else 4
            if total_samples >= 20:
                confidence = "high"
            elif total_samples >= 5:
                confidence = "medium"
            else:
                confidence = "low"
            if avg_hours <= 4:
                suggested_text = "1 day"
                days = 1
            elif avg_hours <= 8:
                suggested_text = "2 days"
                days = 2
            elif avg_hours <= 20:
                suggested_text = "3-5 days"
                days = 5
            elif avg_hours <= 40:
                suggested_text = "1 week"
                days = 7
            else:
                suggested_text = "2 weeks"
                days = 14
            from datetime import datetime, timedelta
            return {
                "estimated_hours": avg_hours,
                "confidence": confidence,
                "samples": total_samples,
                "suggested_text": suggested_text,
                "suggested_date": (datetime.utcnow() + timedelta(days=days)).strftime("%Y-%m-%d"),
                "business_days": days,
                "work_category": work_category or "all",
            }
        except Exception as e:
            logger.error(f"Deadline estimation error: {e}")
            return {"estimated_hours": 4, "confidence": "low", "error": str(e)}

    def get_performance_trends(self, organization_id: str, weeks: int = 8) -> list:
        db = self._get_db()
        if db is None:
            return []
        try:
            history = list(db.performance_history.find(
                {"organization_id": organization_id}
            ).sort("created_at", -1).limit(weeks))
            if not history:
                return []
            all_emps = set()
            for h in history:
                for e in h.get("employees", []):
                    all_emps.add(e["email"])
            trends = []
            for email in all_emps:
                weekly_hours = []
                for h in reversed(history):
                    emp_data = next((e for e in h.get("employees", []) if e["email"] == email), None)
                    weekly_hours.append(emp_data["total_hours"] if emp_data else None)
                valid = [h for h in weekly_hours if h is not None]
                direction = "stable"
                if len(valid) >= 4:
                    first_half = sum(valid[:len(valid)//2]) / (len(valid)//2)
                    second_half = sum(valid[len(valid)//2:]) / (len(valid) - len(valid)//2)
                    if first_half > 0:
                        change = ((second_half - first_half) / first_half) * 100
                        if change < -5:
                            direction = "improving"
                        elif change > 5:
                            direction = "slipping"
                trends.append({
                    "email": email,
                    "weekly_hours": weekly_hours,
                    "direction": direction,
                    "weeks_of_data": len(valid),
                    "current_avg_hours": valid[-1] if valid else None,
                })
            return trends
        except Exception as e:
            logger.error(f"Performance trends error: {e}")
            return []


learning = ContinuousLearning()
