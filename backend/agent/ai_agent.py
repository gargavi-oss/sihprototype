import json
import os

from pydantic import BaseModel
from typing import List, Dict

from langchain_groq import ChatGroq


class Conflict(BaseModel):
    trainId: int
    track: str
    conflictStart: int
    conflictEnd: int


class Reroute(BaseModel):
    trainId: int
    name: str
    engine: str
    category: int
    originalDesc: str
    originalConflict: str
    newDesc: str
    newDetail: str
    impact: str
    altTrackTimes: Dict[str, List[int]]


class AgentResponse(BaseModel):
    conflicts: List[Conflict]
    reroutes: List[Reroute]


def analyze_and_reroute(
    blocks: List[Dict],
    trains: List[Dict],
    delays: Dict,
    X_solver_data: List[Dict]
) -> Dict:
    """
    Uses Groq LLM to analyze the schedule against the solver's
    maintenance windows, detect conflicts, and propose alternate routes.
    """

    api_key = os.environ.get("GROQ_API_KEY")

    if not api_key:
        raise ValueError(
            "GROQ_API_KEY environment variable is missing for the AI Agent."
        )

    # Fast Groq model
    model_name = os.environ.get(
        "GROQ_MODEL",
        "llama-3.3-70b-versatile"
    )

    llm = ChatGroq(
        model=model_name,
        groq_api_key=api_key,
        temperature=0,
        max_retries=2,
        timeout=30,
    )

    schema_hint = json.dumps(AgentResponse.model_json_schema(), indent=2)

    # Truncate large inputs to avoid blowing the context window
    trains_str = json.dumps(trains[:30], indent=2) if len(trains) > 30 else json.dumps(trains, indent=2)
    blocks_str = json.dumps(blocks[:30], indent=2) if len(blocks) > 30 else json.dumps(blocks, indent=2)
    solver_str = json.dumps(X_solver_data[:30], indent=2) if isinstance(X_solver_data, list) and len(X_solver_data) > 30 else json.dumps(X_solver_data, indent=2)
    delays_str = json.dumps(delays, indent=2)

    prompt = f"""
You are an expert railway routing and scheduling AI agent.

We have executed a maintenance solver (IBM CPLEX) which selected
optimal maintenance windows for railway tracks.

Your job is to analyze the train schedule against the maintenance
windows, detect conflicts, and propose valid reroutes.

1. ORIGINAL TRAIN SCHEDULE:
{trains_str}

2. SCHEDULED MAINTENANCE BLOCKS:
{blocks_str}

3. SOLVER OUTPUT:
{solver_str}

4. DELAYS:
{delays_str}

TRACK DEFINITIONS:

R1: Main Entry
R2: Alt Entry
R3: Shared Corridor
R4: Branch Line Bypass
R5: West Branch
R6: Terminal A
R7: Terminal B

TASK:

1. Find conflicts — a train occupies a track during its maintenance window.

2. For every conflicting train, propose a reroute or time shift that avoids
   ALL maintenance windows. Do not invent tracks outside R1-R7.

3. For each rerouted train provide: name, engine, category, originalDesc,
   originalConflict, newDesc, newDetail, impact, altTrackTimes.
   altTrackTimes maps track IDs to [start_time, end_time].

4. If no conflicts exist, return empty arrays.

You MUST return ONLY valid JSON matching this schema (no markdown, no explanation):
{schema_hint}
"""

    # Invoke the raw LLM
    print(f"[AI Agent] Invoking Groq model: {model_name}")
    response = llm.invoke(prompt)
    raw_text = (response.content or "").strip()

    print(f"[AI Agent] Raw response length: {len(raw_text)} chars")
    if len(raw_text) < 500:
        print(f"[AI Agent] Raw response: {raw_text!r}")

    if not raw_text:
        print("[AI Agent] WARNING: Model returned empty response, returning empty result")
        return {"conflicts": [], "reroutes": []}

    # Extract JSON from the response — handles markdown fences, preamble, etc.
    import re
    # Try to find a JSON object in the response
    json_match = re.search(r'\{[\s\S]*\}', raw_text)
    if json_match:
        raw_text = json_match.group(0)

    # Parse and validate with Pydantic
    try:
        parsed = json.loads(raw_text)
        result = AgentResponse.model_validate(parsed)
        return result.model_dump()
    except (json.JSONDecodeError, Exception) as e:
        print(f"[AI Agent] JSON parse error: {e}")
        print(f"[AI Agent] Attempted to parse: {raw_text[:300]!r}")
        return {"conflicts": [], "reroutes": []}