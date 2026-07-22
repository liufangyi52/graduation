"""受控会议智能体服务：所有结果均是待复核草稿，且附带来源证据。"""
from datetime import datetime
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="MeetingFlow AI", version="0.1.0")

class AnalyzeRequest(BaseModel):
    meeting_id: str
    content: str = Field(min_length=8, max_length=100_000)
    project_context: list[str] = []

@app.get("/health")
def health():
    return {"status": "ok", "mode": "mock", "guardrail": "human-review-required"}

@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    # 此处为可替换的 ProviderAdapter 边界；演示模式不得声称真实模型推理。
    evidence = req.content[:180]
    return {
        "meeting_id": req.meeting_id,
        "run_id": f"run-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "mode": "mock",
        "review_required": True,
        "summary": "已完成受控流程演示输出；结果须由项目经理复核后入库。",
        "citations": [{"label": "会议原文", "text": evidence, "start": 0}],
        "trace": [
            {"step": "privacy_filter", "status": "completed"},
            {"step": "retrieve_project_context", "status": "completed"},
            {"step": "extract_structured_items", "status": "completed"},
            {"step": "validate_business_rules", "status": "completed"},
            {"step": "human_review_gate", "status": "waiting"},
        ],
    }
