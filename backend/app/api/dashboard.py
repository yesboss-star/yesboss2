import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from ..core.database import get_database
from ..dependencies.auth import get_current_user, get_current_user_optional
from bson import ObjectId

router = APIRouter()
logger = logging.getLogger("yesboss.dashboard")


def get_user_org_id(user) -> Optional[str]:
    if hasattr(user, 'user_metadata') and user.user_metadata:
        return user.user_metadata.get("organization_id")
    return None


class InsightResponse(BaseModel):
    id: str
    type: str
    title: str
    description: str
    priority: str
    category: str
    action_items: Optional[List[str]] = None
    metrics: Optional[Dict[str, Any]] = None
    created_at: str


class ModuleMetrics(BaseModel):
    module: str
    title: str
    metrics: Dict[str, Any]
    insights: List[Dict[str, Any]]
    trends: List[Dict[str, Any]]


INDUSTRY_MODULES = {
    "technology": {
        "founder": {
            "title": "Founder's Pulse",
            "metrics": ["run_rate", "burn_rate", " runway_months", " ARR_growth", "customer_count"],
            "insights_key": ["fundraising_readiness", "equity_planning", "board_ready"]
        },
        "finance": {
            "title": "Finance Overview",
            "metrics": ["monthly_revenue", "expenses", "profit_margin", "cash_flow", "forecast"],
            "insights_key": ["revenue_trends", "cost_optimization", "budget_variance"]
        },
        "operations": {
            "title": "Tech Operations",
            "metrics": ["deployment_frequency", "uptime", "incident_count", "tech_debt", "sprint_velocity"],
            "insights_key": ["system_health", "tech_debt_analysis", "infrastructure_costs"]
        },
        "productivity": {
            "title": "Team Productivity",
            "metrics": ["velocity", "bug_ratio", "code_review_time", "onboarding_time", "retention"],
            "insights_key": ["team_health", "bottleneck_analysis", "skill_gaps"]
        },
        "workflow": {
            "title": "Engineering Workflow",
            "metrics": ["pr_count", "merge_time", "test_coverage", "ci_cd_time", "documentation_score"],
            "insights_key": ["process_efficiency", "deployment_health", "quality_metrics"]
        }
    },
    "finance": {
        "founder": {
            "title": "Executive Overview",
            "metrics": ["AUM", "client_count", "revenue_per_client", "compliance_score", "risk_exposure"],
            "insights_key": ["market_position", "regulatory_compliance", "growth_opportunities"]
        },
        "finance": {
            "title": "Financial Performance",
            "metrics": ["total_assets", "net_income", "ROE", "operational_efficiency", "cost_to_income"],
            "insights_key": ["profitability", "asset_quality", "liquidity_analysis"]
        },
        "operations": {
            "title": "Operations Center",
            "metrics": ["transaction_volume", "processing_time", "error_rate", "client_satisfaction", "audit_score"],
            "insights_key": ["process_optimization", "compliance_status", "risk_management"]
        },
        "productivity": {
            "title": "Team Performance",
            "metrics": ["advisor_productivity", "client_per_advisor", "meeting_efficiency", "task_completion", "training_hours"],
            "insights_key": ["advisor_performance", "workload_balancing", "skill_development"]
        },
        "workflow": {
            "title": "Workflow Automation",
            "metrics": ["automation_rate", "manual_tasks", "approval_time", "document_processing", "compliance_checks"],
            "insights_key": ["automation_opportunities", "workflow_bottlenecks", "integration_health"]
        }
    },
    "healthcare": {
        "founder": {
            "title": "Healthcare Leadership",
            "metrics": ["patient_count", "satisfaction_score", "readmission_rate", "staff_ratio", "compliance_rate"],
            "insights_key": ["growth_trajectory", "clinical_quality", "regulatory_status"]
        },
        "finance": {
            "title": "Healthcare Finance",
            "metrics": ["revenue_cycle", "collection_rate", "cost_per_patient", "insurance_mix", "operational_costs"],
            "insights_key": ["revenue_optimization", "cost_management", "payer_mix"]
        },
        "operations": {
            "title": "Clinical Operations",
            "metrics": ["bed_occupancy", "wait_times", "staff_utilization", "equipment_uptime", "infection_rates"],
            "insights_key": ["operational_efficiency", "patient_flow", "resource_utilization"]
        },
        "productivity": {
            "title": "Clinical Staff",
            "metrics": ["productivity_index", "overtime_hours", "training_completion", "staff_satisfaction", "turnover_rate"],
            "insights_key": ["staff_wellbeing", "productivity_trends", "retention_risks"]
        },
        "workflow": {
            "title": "Care Workflows",
            "metrics": ["documentation_time", "order_accuracy", "discharge_time", "follow_up_rate", "care_plan_compliance"],
            "insights_key": ["care_quality", "workflow_efficiency", "coordination_gaps"]
        }
    },
    "retail": {
        "founder": {
            "title": "Retail Leadership",
            "metrics": ["revenue", "market_share", "customer_count", "conversion_rate", "LTV"],
            "insights_key": ["growth_opportunities", "competitive_position", "expansion_planning"]
        },
        "finance": {
            "title": "Retail Finance",
            "metrics": ["gross_margin", "inventory_turnover", "shrink_rate", "ROI", "cash_conversion"],
            "insights_key": ["margin_analysis", "inventory_health", "investment_returns"]
        },
        "operations": {
            "title": "Store Operations",
            "metrics": ["foot_traffic", "conversion", "average_order_value", "stock_availability", "shrink"],
            "insights_key": ["store_performance", "inventory_status", "loss_prevention"]
        },
        "productivity": {
            "title": "Retail Teams",
            "metrics": ["sales_per_hour", "upsell_rate", "customer_wait_time", "returns_rate", "staff_utilization"],
            "insights_key": ["team_performance", "customer_experience", "service_quality"]
        },
        "workflow": {
            "title": "Retail Workflows",
            "metrics": ["checkout_time", "restock_efficiency", "marketing_ROI", "promo_effectiveness", "supply_chain_time"],
            "insights_key": ["process_optimization", "marketing_impact", "supply_chain_health"]
        }
    },
    "manufacturing": {
        "founder": {
            "title": "Manufacturing Leadership",
            "metrics": ["production_volume", "capacity_utilization", "quality_rate", "on_time_delivery", "safety_index"],
            "insights_key": ["operational_excellence", "market_demand", "expansion_planning"]
        },
        "finance": {
            "title": "Manufacturing Finance",
            "metrics": ["cost_per_unit", "profit_margin", "inventory_value", "equipment_ROI", "operational_costs"],
            "insights_key": ["cost_optimization", "asset_utilization", "profitability"]
        },
        "operations": {
            "title": "Production Operations",
            "metrics": ["OEE", "downtime", "defect_rate", "lead_time", "throughput"],
            "insights_key": ["equipment_efficiency", "quality_control", "bottleneck_analysis"]
        },
        "productivity": {
            "title": "Workforce Productivity",
            "metrics": ["units_per_hour", "safety_incidents", "training_completion", "overtime", "turnover"],
            "insights_key": ["labor_efficiency", "safety_compliance", "skill_development"]
        },
        "workflow": {
            "title": "Manufacturing Workflows",
            "metrics": ["changeover_time", "maintenance_schedule", "supply_alignment", "quality_checks", "documentation"],
            "insights_key": ["lean_metrics", "continuous_improvement", "supply_chain"]
        }
    },
    "default": {
        "founder": {
            "title": "Executive Overview",
            "metrics": ["revenue", "growth_rate", "headcount", "customer_count", "profitability"],
            "insights_key": ["business_health", "growth_trajectory", "strategic_priorities"]
        },
        "finance": {
            "title": "Financial Overview",
            "metrics": ["revenue", "expenses", "profit", "cash_position", "forecast"],
            "insights_key": ["financial_health", "cost_management", "investment_needs"]
        },
        "operations": {
            "title": "Operations Overview",
            "metrics": ["efficiency", "quality", "timeliness", "utilization", "costs"],
            "insights_key": ["operational_efficiency", "bottlenecks", "improvement_areas"]
        },
        "productivity": {
            "title": "Team Overview",
            "metrics": ["output", "quality", "collaboration", "engagement", "retention"],
            "insights_key": ["team_health", "productivity_trends", "development_needs"]
        },
        "workflow": {
            "title": "Workflow Overview",
            "metrics": ["throughput", "bottlenecks", "automation", "documentation", "compliance"],
            "insights_key": ["process_health", "improvement_opportunities", "efficiency_gains"]
        }
    }
}


def get_industry_insights(industry: str) -> List[Dict]:
    industry = industry.lower() if industry else "default"
    module_config = INDUSTRY_MODULES.get(industry, INDUSTRY_MODULES["default"])
    
    insight_templates = {
        "founder": [
            {"type": "growth", "title": "Growth Opportunity", "description": "Revenue increased 23% this quarter - maintain momentum", "priority": "success"},
            {"type": "risk", "title": "Risk Alert", "description": "Burn rate acceleration detected - review spending", "priority": "warning"},
            {"type": "action", "title": "Strategic Action", "description": "Consider board meeting to discuss Series A readiness", "priority": "info"},
        ],
        "finance": [
            {"type": "positive", "title": "Revenue Milestone", "description": "Monthly recurring revenue up 15% - ahead of projections", "priority": "success"},
            {"type": "warning", "title": "Cost Alert", "description": "Operating expenses trending 10% above budget", "priority": "warning"},
            {"type": "action", "title": "Cash Flow", "description": "Recommended review of receivables collection process", "priority": "info"},
        ],
        "operations": [
            {"type": "efficiency", "title": "Process Improvement", "description": "Workflow optimization can reduce costs by 18%", "priority": "success"},
            {"type": "alert", "title": "Bottleneck Detected", "description": "Approval queue averaging 3 days - consider automation", "priority": "warning"},
            {"type": "insight", "title": "Resource Planning", "description": "Current utilization at 72% - room for efficiency gains", "priority": "info"},
        ],
        "productivity": [
            {"type": "positive", "title": "Team Performance", "description": "Sprint velocity improved 12% this month", "priority": "success"},
            {"type": "warning", "title": "Capacity Alert", "description": "Several team members at 90%+ capacity", "priority": "warning"},
            {"type": "action", "title": "Skill Development", "description": "Recommend training program for technical skills", "priority": "info"},
        ],
        "workflow": [
            {"type": "success", "title": "Automation Win", "description": "Automated workflows saving 15 hours/week", "priority": "success"},
            {"type": "alert", "title": "Documentation Gap", "description": "Process documentation incomplete in 3 areas", "priority": "warning"},
            {"type": "insight", "title": "Integration Health", "description": "All critical integrations operating normally", "priority": "info"},
        ]
    }
    
    all_insights = []
    for module, config in module_config.items():
        module_insights = insight_templates.get(module, insight_templates["founder"])
        for i, insight in enumerate(module_insights):
            all_insights.append({
                "id": f"{module}_{i}",
                "type": insight["type"],
                "title": insight["title"],
                "description": insight["description"],
                "priority": insight["priority"],
                "category": module,
                "action_items": [
                    f"Review {module} dashboard",
                    "Schedule team sync",
                    "Update action plan"
                ],
                "metrics": {m: 0 for m in config["metrics"][:3]},
                "created_at": datetime.utcnow().isoformat()
            })
    
    return all_insights


@router.get("/insights")
async def get_dashboard_insights(
    industry: Optional[str] = Query(None),
    module: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    current_user = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    org_id = get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")
    
    organization = db.organizations.find_one({"_id": ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id})
    org_industry = industry or (organization.get("industry") if organization else None)
    
    insights = get_industry_insights(org_industry or "default")
    
    if module:
        insights = [i for i in insights if i["category"] == module]
    if priority:
        insights = [i for i in insights if i["priority"] == priority]
    
    return {"insights": insights, "count": len(insights)}


@router.get("/modules")
async def get_dashboard_modules(
    industry: Optional[str] = Query(None),
    current_user = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    org_id = get_user_org_id(current_user)
    if org_id:
        organization = db.organizations.find_one({"_id": ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id})
        org_industry = industry or (organization.get("industry") if organization else None)
    else:
        org_industry = industry
    
    modules = INDUSTRY_MODULES.get(org_industry.lower() if org_industry else "default", INDUSTRY_MODULES["default"])
    
    return {
        "modules": [
            {
                "id": module_id,
                "title": config["title"],
                "metrics": config["metrics"],
                "insights_count": len(get_industry_insights(org_industry or "default"))
            }
            for module_id, config in modules.items()
        ]
    }


@router.get("/kpi")
async def get_dashboard_kpi(
    organization_id: Optional[str] = Query(None),
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    org = db.organizations.find_one({"_id": ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id})
    org_industry = org.get("industry", "") if org else ""
    org_micro_vertical = org.get("micro_vertical", "") if org else ""

    total_goals = db.goals.count_documents({"organization_id": org_id})
    active_goals = db.goals.count_documents({"organization_id": org_id, "status": "active"})
    completed_goals = db.goals.count_documents({"organization_id": org_id, "status": "completed"})

    total_tasks = db.tasks.count_documents({"organization_id": org_id})
    completed_tasks = db.tasks.count_documents({"organization_id": org_id, "status": "completed"})
    in_progress_tasks = db.tasks.count_documents({"organization_id": org_id, "status": "in_progress"})
    pending_tasks = db.tasks.count_documents({"organization_id": org_id, "status": "pending"})

    total_members = db.org_chart_members.count_documents({"organization_id": org_id})

    completion_rate = round((completed_tasks / total_tasks * 100) if total_tasks > 0 else 0, 1)

    total_files = db.files.count_documents({"organization_id": org_id})

    departments = db.org_chart_members.distinct("department", {"organization_id": org_id})
    dept_count = len(departments)

    kpi_response = {}

    kpi_response["goals_active"] = {
        "value": active_goals,
        "formatted": str(active_goals),
        "change": f"{total_goals} total",
        "trend": "up" if active_goals > 0 else "neutral",
        "label": "Active Goals",
        "description": f"{completed_goals} completed, {total_goals - active_goals - completed_goals} pending",
        "icon": "Target"
    }

    kpi_response["completion_rate"] = {
        "value": completion_rate,
        "formatted": f"{completion_rate}%",
        "change": "On track" if completion_rate >= 50 else "Needs attention",
        "trend": "up" if completion_rate >= 50 else "down",
        "label": "Task Completion Rate",
        "description": f"{completed_tasks} of {total_tasks} tasks done",
        "icon": "CheckCircle"
    }

    kpi_response["team_size"] = {
        "value": total_members,
        "formatted": str(total_members),
        "change": f"{dept_count} departments",
        "trend": "neutral",
        "label": "Team Size",
        "description": f"Across {dept_count} departments",
        "icon": "Users"
    }

    kpi_response["tasks_pipeline"] = {
        "value": in_progress_tasks,
        "formatted": str(in_progress_tasks),
        "change": f"{pending_tasks} pending, {completed_tasks} done",
        "trend": "up" if in_progress_tasks > pending_tasks else "neutral",
        "label": "Tasks In Progress",
        "description": f"{completed_tasks} completed total",
        "icon": "Activity"
    }

    if total_files > 0:
        kpi_response["documents"] = {
            "value": total_files,
            "formatted": str(total_files),
            "change": "Uploaded",
            "trend": "neutral",
            "label": "Documents Analyzed",
            "description": "Available for AI analysis",
            "icon": "FileText"
        }

    goal_completion_pct = round((completed_goals / total_goals * 100) if total_goals > 0 else 0, 1)
    kpi_response["goal_completion_rate"] = {
        "value": goal_completion_pct,
        "formatted": f"{goal_completion_pct}%",
        "change": f"{active_goals} active, {completed_goals} done",
        "trend": "up" if goal_completion_pct >= 30 else "neutral",
        "label": "Goal Completion Rate",
        "description": f"Of {total_goals} total goals",
        "icon": "Flag"
    }

    in_progress_pct = round((in_progress_tasks / total_tasks * 100) if total_tasks > 0 else 0, 1)
    kpi_response["task_velocity"] = {
        "value": in_progress_tasks,
        "formatted": str(in_progress_tasks),
        "change": f"{in_progress_pct}% of tasks in progress",
        "trend": "up" if in_progress_pct > 30 else "neutral",
        "label": "Tasks In Motion",
        "description": f"{pending_tasks} pending, {completed_tasks} completed",
        "icon": "Zap"
    }

    member_to_goal_ratio = round(total_members / total_goals, 1) if total_goals > 0 else 0
    kpi_response["team_efficiency"] = {
        "value": member_to_goal_ratio,
        "formatted": str(member_to_goal_ratio),
        "change": f"{total_members} members : {total_goals} goals",
        "trend": "up" if member_to_goal_ratio >= 1 else "down",
        "label": "Members per Goal",
        "description": f"Across {dept_count} departments",
        "icon": "Users"
    }

    try:
        from ..core.ai_client import get_ai_response
        ai_prompt = (
            f"Given a business in the {org_industry} industry"
            + (f" ({org_micro_vertical})" if org_micro_vertical else "")
            + f" with {total_goals} goals ({active_goals} active, {completed_goals} completed), {total_tasks} tasks ({in_progress_tasks} in progress, {completed_tasks} completed), "
            f"{total_members} team members in {dept_count} departments, "
            f"and a {completion_rate}% task completion rate, suggest 1-2 additional KPIs that would be "
            f"most relevant for this business. Return ONLY a JSON array of objects with keys: 'key' (snake_case), "
            f"'label' (display name), 'formatted' (string value), 'change' (trend description), "
            f"'trend' ('up'/'down'/'neutral'), 'description', 'icon' (lucide icon name). "
            f"Keep it concise - only suggest KPIs that make sense for {org_industry}."
        )
        ai_kpis = await get_ai_response(
            prompt=ai_prompt,
            system_prompt="You are a business analytics expert. Return ONLY valid JSON.",
            provider="xai",
            temperature=0.3,
            max_tokens=500,
        )
        import json, re
        json_match = re.search(r'\[.*\]', ai_kpis, re.DOTALL)
        if json_match:
            parsed = json.loads(json_match.group())
            if isinstance(parsed, list):
                for item in parsed:
                    if isinstance(item, dict) and "key" in item:
                        kpi_response[item["key"]] = item
    except Exception as e:
        logger.warning(f"AI KPI suggestion failed: {e}")

    return kpi_response


@router.get("/metrics/{module}")
async def get_module_metrics(
    module: str,
    period: Optional[str] = Query("30d"),
    current_user = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    org_id = get_user_org_id(current_user)
    if org_id:
        organization = db.organizations.find_one({"_id": org_id})
        org_industry = organization.get("industry") if organization else None
    else:
        org_industry = None
    
    industry = org_industry or "default"
    module_config = INDUSTRY_MODULES.get(industry.lower(), INDUSTRY_MODULES["default"]).get(module, {})
    
    mock_metrics = {}
    for metric in module_config.get("metrics", []):
        mock_metrics[metric] = {
            "value": round(100 + (hash(metric) % 200), 1),
            "change": round((hash(metric) % 30) - 10, 1),
            "trend": "up" if (hash(metric) % 2) == 0 else "down"
        }
    
    return {
        "module": module,
        "title": module_config.get("title", module.title()),
        "metrics": mock_metrics,
        "period": period
    }


@router.get("/trends/{module}")
async def get_module_trends(
    module: str,
    days: int = Query(30),
    current_user = Depends(get_current_user)
):
    import random
    
    data_points = min(days, 30)
    trend_data = []
    base_value = 100
    
    for i in range(data_points):
        base_value += random.uniform(-5, 8)
        trend_data.append({
            "date": f"2026-01-{i+1:02d}",
            "value": round(base_value, 1)
        })
    
    return {
        "module": module,
        "days": days,
        "trend": trend_data,
        "summary": {
            "avg": round(sum(t["value"] for t in trend_data) / len(trend_data), 1),
            "min": round(min(t["value"] for t in trend_data), 1),
            "max": round(max(t["value"] for t in trend_data), 1),
            "change": round(trend_data[-1]["value"] - trend_data[0]["value"], 1)
        }
    }