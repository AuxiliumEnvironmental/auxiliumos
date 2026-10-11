#!/usr/bin/env python3
"""Validate package traceability. This does not execute product acceptance."""
from pathlib import Path
import json
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]

def main():
    controls = ("REQUIREMENTS.json", "BUILD_QUEUE.json", "AGENT_ASSIGNMENTS.json",
                "contracts/publication.openapi.json", "BUILD_STATE.json")
    docs = {name: json.loads((ROOT/name).read_text()) for name in controls}
    reqs = docs["REQUIREMENTS.json"]["requirements"]
    tasks = docs["BUILD_QUEUE.json"]["queue"]
    roles = docs["AGENT_ASSIGNMENTS.json"]["roles"]
    req_ids = {r["id"] for r in reqs}; task_ids = {t["id"] for t in tasks}; role_ids = {r["id"] for r in roles}
    assert len(req_ids) == len(reqs), "Duplicate requirement IDs"
    assert len(task_ids) == len(tasks), "Duplicate task IDs"
    assert len(role_ids) == len(roles), "Duplicate role IDs"
    covered = set()
    for task in tasks:
        assert task["owner"] in role_ids, task["id"]
        assert set(task["requirements"]) <= req_ids, task["id"]
        assert set(task["depends_on"]) <= task_ids, task["id"]
        covered.update(task["requirements"])
    assert covered == req_ids, f"Unassigned acceptance: {req_ids-covered}"
    evidence_path = ROOT / "evidence/V1_REQUIREMENT_EVIDENCE.json"
    if evidence_path.exists():
        mapping = json.loads(evidence_path.read_text())
        assert {r["id"] for r in mapping["requirements"]} == req_ids, "Incomplete evidence mapping"
        assert not mapping["product_accepted"], "Device/product acceptance must be established separately"
    for role in roles:
        assert (ROOT / role["prompt"]).is_file()
        assert set(role["taskIDs"]) <= task_ids
    seen, active = set(), set()
    task_map = {t["id"]: t for t in tasks}
    def visit(tid):
        assert tid not in active, "Dependency cycle"
        if tid in seen: return
        active.add(tid)
        for parent in task_map[tid]["depends_on"]: visit(parent)
        active.remove(tid); seen.add(tid)
    for tid in task_ids: visit(tid)
    for path in ROOT.joinpath("contracts").glob("*.schema.json"):
        Draft202012Validator.check_schema(json.loads(path.read_text()))
    api = docs["contracts/publication.openapi.json"]
    assert api["openapi"] == "3.1.0" and "servers" not in api, "No live endpoint should be implied"
    assert docs["BUILD_STATE.json"]["cloud_status"] == "not_connected_no_remote_writes"
    required = ["START_HERE.md","MASTER_BUILD_PROMPT.md","AGENTS.md","RESUME.md",
                "SOURCE_RECONCILIATION.json","docs/SOURCES.md","evidence/KNOWN_LIMITS.md"]
    for path in required: assert (ROOT/path).is_file(), path
    schema_count = len(list(ROOT.joinpath("contracts").glob("*.schema.json")))
    print(f"Controls valid: {len(reqs)} requirements, {len(tasks)} dependency-checked work packages, {len(roles)} agent roles, {schema_count} strict schemas; no live server URL.")

if __name__ == "__main__": main()
