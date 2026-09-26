"""
RailOpt Backend — Gemini AI Agent Service
Uses Google Gemini to intelligently map CSV data to CPLEX model parameters.

The agent receives raw parsed CSV data and produces a complete CplexParams
object, computing derived arrays like Y (train occupancy), Omega (engine/category
flags), and inferring topology.
"""

import json
import logging
import numpy as np
from typing import Any

from app.models.cplex_params import CplexParams
from app.config import settings

logger = logging.getLogger(__name__)

# The structured prompt that teaches Gemini the CPLEX model parameter schema
SYSTEM_PROMPT = """You are a railway operations data engineer. Your job is to convert
raw train schedule data into the precise parameter format needed by a CPLEX
maintenance scheduling optimizer.

Given train data with columns: train_id, engine_type (D/H/E), category (int),
start_track, start_section, end_track, end_section, current_delay,
and optionally section configuration data,

you must produce a JSON object with these fields:

1. NJ (int): number of tracks (inferred from unique track IDs in routes)
2. NK (list[int]): number of sections per track
3. I (int): last time index — compute as max sections any train traverses minus 1,
   or use provided time_steps value
4. Tstep (float): time step length, default 1.0
5. N (int): number of trains
6. Gamma (int): number of distinct categories
7. TotalBlocks (int): maintenance blocks to schedule (use provided value or default 3)
8. lambda_cap (list[float]): max capacity per section, default 10.0 each
9. alpha_block (list[int]): 1=traffic block, 0=power block per section.
   Default: alternating 1,0,1,0... Use provided block_type if available.
10. deadline (list[int]): deadline per section, -1=none. Use provided values.
11. theta (list[list[float]]): traffic capacity [sections][time], default 5.0
12. a (list[list[int]]): block duration [sections][time], default 1
13. d (list[float]): current delay per train
14. Y (list[list[list[int]]]): train occupancy Y[n][s][i]=1 if train n on section s
    at time i. Compute from start/end sections — assume train moves one section
    per time step along its route.
15. Omega (list[list[list[int]]]): Omega[n][b][g]=1 if train n is engine type b
    (0=D,1=H,2=E) and category g (0-indexed). Each train has exactly one 1.
16. wGamma (list[float]): cost weights by category, default [2.0, 3.0, ...]
17. wBeta (list[float]): cost weights by engine [D,H,E], default [1.5, 1.0, 2.5]
18. B (list[int]): start section flat index per train
19. E (list[int]): end section flat index per train
20. latePenaltyRate (float): default 0.5

IMPORTANT RULES for computing Y:
- Flat section index = sum of NK[0..j-2] + (k-1), where j is 1-based track, k is 1-based section
- If train goes from section 1 to 10 on track 1: Y[n][0][0]=1, Y[n][1][1]=1, ..., Y[n][9][9]=1
- If train goes from section 10 to 1 on track 1: Y[n][9][0]=1, Y[n][8][1]=1, ..., Y[n][0][9]=1
- For multi-track routes, compute flat section indices accordingly

Return ONLY valid JSON matching this schema. No markdown, no explanation."""


async def transform_csv_to_params(
    parsed_data: dict[str, Any],
    config_overrides: dict[str, Any] | None = None,
) -> CplexParams:
    """
    Use Gemini to transform raw CSV data into CplexParams.

    Falls back to deterministic computation if Gemini is unavailable.
    """
    trains = parsed_data["trains"]
    sections = parsed_data.get("sections")
    config = parsed_data.get("config", {})

    if config_overrides:
        config.update(config_overrides)

    # Try Gemini first, fall back to deterministic
    if settings.GOOGLE_API_KEY and settings.GOOGLE_API_KEY != "your-gemini-api-key-here":
        try:
            return await _gemini_transform(trains, sections, config)
        except Exception as e:
            logger.warning(f"Gemini transform failed: {e}. Falling back to deterministic.")

    return _deterministic_transform(trains, sections, config)


async def _gemini_transform(
    trains: list[dict],
    sections: list[dict] | None,
    config: dict,
) -> CplexParams:
    """Use Gemini API to map CSV data to CPLEX parameters."""
    from google import genai

    client = genai.Client(api_key=settings.GOOGLE_API_KEY)

    user_prompt = f"""Convert this railway data to CPLEX parameters.

TRAIN DATA:
{json.dumps(trains, indent=2)}

SECTION CONFIG:
{json.dumps(sections, indent=2) if sections else "Not provided — infer from train routes."}

GLOBAL CONFIG:
{json.dumps(config, indent=2) if config else "Use defaults."}

Return the complete JSON parameter object."""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=user_prompt,
        config=genai.types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            temperature=0.1,
        ),
    )

    result_json = json.loads(response.text)

    # Build CplexParams from Gemini output
    params = CplexParams(
        NJ=result_json["NJ"],
        NK=result_json["NK"],
        I=result_json["I"],
        Tstep=result_json.get("Tstep", 1.0),
        N=result_json["N"],
        Gamma=result_json["Gamma"],
        TotalBlocks=result_json["TotalBlocks"],
        lambda_cap=result_json.get("lambda_cap", [10.0] * sum(result_json["NK"])),
        alpha_block=result_json.get("alpha_block", []),
        deadline=result_json.get("deadline", [-1] * sum(result_json["NK"])),
        theta=result_json.get("theta", []),
        a=result_json.get("a", []),
        d=result_json["d"],
        Y=result_json["Y"],
        Omega=result_json["Omega"],
        wGamma=result_json.get("wGamma", [2.0, 3.0]),
        wBeta=result_json.get("wBeta", [1.5, 1.0, 2.5]),
        B=result_json.get("B", []),
        E=result_json.get("E", []),
        latePenaltyRate=result_json.get("latePenaltyRate", 0.5),
    )

    # Validate
    _validate_params(params)
    return params


def _deterministic_transform(
    trains: list[dict],
    sections: list[dict] | None,
    config: dict,
) -> CplexParams:
    """
    Deterministic (rule-based) fallback when Gemini is unavailable.
    Computes all derived arrays directly from CSV data.
    """
    from app.services.csv_parser import infer_topology

    # Infer topology
    topo = infer_topology(trains)
    NJ = topo["NJ"]
    NK = topo["NK"]
    total_sections = topo["total_sections"]
    track_ids = topo["track_ids"]

    N = len(trains)

    # Determine categories
    categories = sorted(set(int(t["category"]) for t in trains))
    Gamma = len(categories)
    cat_to_idx = {c: i for i, c in enumerate(categories)}

    # Determine time steps
    # Compute max route length across all trains
    max_route_len = 0
    for t in trains:
        start_s = int(t["start_section"])
        end_s = int(t["end_section"])
        route_len = abs(end_s - start_s) + 1
        max_route_len = max(max_route_len, route_len)

    I = int(config.get("time_steps", max_route_len)) - 1
    Tstep = float(config.get("tstep", 1.0))
    T = I + 1

    TotalBlocks = int(config.get("total_blocks", 3))

    # Build flat section index mapping
    track_id_to_idx = {tid: idx for idx, tid in enumerate(track_ids)}

    def jk_to_flat(track_id: int, section: int) -> int:
        j_idx = track_id_to_idx[track_id]
        flat = sum(NK[:j_idx]) + (section - 1)
        return flat

    # ---- Build arrays ----

    # lambda_cap, alpha_block, deadline from section config or defaults
    lambda_cap = [10.0] * total_sections
    alpha_block = [1 if s % 2 == 0 else 0 for s in range(total_sections)]
    deadline = [-1] * total_sections
    block_duration = [[1] * T for _ in range(total_sections)]

    if sections:
        for sec in sections:
            try:
                track = int(sec.get("track_id", 1))
                section_id = int(sec.get("section_id", 1))
                flat = jk_to_flat(track, section_id)

                if "max_capacity" in sec:
                    lambda_cap[flat] = float(sec["max_capacity"])
                if "block_type" in sec:
                    bt = str(sec["block_type"]).lower()
                    alpha_block[flat] = 1 if bt == "traffic" else 0
                if "deadline" in sec:
                    deadline[flat] = int(sec["deadline"])
                if "block_duration" in sec:
                    bd = int(sec["block_duration"])
                    block_duration[flat] = [bd] * T
            except (KeyError, ValueError, IndexError) as e:
                logger.warning(f"Skipping section config row: {e}")

    # theta: traffic capacity [S][T], default 5.0
    theta = [[5.0] * T for _ in range(total_sections)]

    # d: current delay per train
    d = [float(t["current_delay"]) for t in trains]

    # Y[n][s][i]: train occupancy matrix
    Y = [[[0] * T for _ in range(total_sections)] for _ in range(N)]

    for n, train in enumerate(trains):
        start_track = int(train["start_track"])
        start_sec = int(train["start_section"])
        end_track = int(train["end_track"])
        end_sec = int(train["end_section"])

        # For same-track routes: linear traversal
        if start_track == end_track:
            direction = 1 if end_sec >= start_sec else -1
            route_sections = list(range(start_sec, end_sec + direction, direction))

            for time_idx, sec in enumerate(route_sections):
                if time_idx >= T:
                    break
                flat = jk_to_flat(start_track, sec)
                if flat < total_sections:
                    Y[n][flat][time_idx] = 1
        else:
            # Cross-track: just place at start for now
            flat = jk_to_flat(start_track, start_sec)
            Y[n][flat][0] = 1

    # Omega[n][b][g]: engine/category flags
    engine_map = {"D": 0, "H": 1, "E": 2}
    Omega = [[[0] * Gamma for _ in range(3)] for _ in range(N)]

    for n, train in enumerate(trains):
        engine = train["engine_type"].upper()
        cat = int(train["category"])
        b_idx = engine_map.get(engine, 0)
        g_idx = cat_to_idx.get(cat, 0)
        Omega[n][b_idx][g_idx] = 1

    # B, E: start/end flat section indices
    B = [jk_to_flat(int(t["start_track"]), int(t["start_section"])) for t in trains]
    E = [jk_to_flat(int(t["end_track"]), int(t["end_section"])) for t in trains]

    # Cost weights
    wGamma = config.get("w_gamma", [2.0 + i for i in range(Gamma)])
    if isinstance(wGamma, str):
        wGamma = [float(x) for x in wGamma.split(",")]
    wBeta = config.get("w_beta", [1.5, 1.0, 2.5])
    if isinstance(wBeta, str):
        wBeta = [float(x) for x in wBeta.split(",")]

    latePenaltyRate = float(config.get("late_penalty_rate", 0.5))

    params = CplexParams(
        NJ=NJ,
        NK=NK,
        I=I,
        Tstep=Tstep,
        N=N,
        Gamma=Gamma,
        TotalBlocks=TotalBlocks,
        lambda_cap=lambda_cap,
        alpha_block=alpha_block,
        deadline=deadline,
        theta=theta,
        a=block_duration,
        d=d,
        Y=Y,
        Omega=Omega,
        wGamma=list(wGamma) if not isinstance(wGamma, list) else wGamma,
        wBeta=list(wBeta) if not isinstance(wBeta, list) else wBeta,
        B=B,
        E=E,
        latePenaltyRate=latePenaltyRate,
    )

    _validate_params(params)
    return params


def _validate_params(params: CplexParams) -> None:
    """Validate CplexParams for correctness before solving."""
    S = params.total_sections
    T = params.I + 1

    # Check array dimensions
    assert len(params.lambda_cap) == S, f"lambda_cap length {len(params.lambda_cap)} != {S}"
    assert len(params.alpha_block) == S, f"alpha_block length {len(params.alpha_block)} != {S}"
    assert len(params.deadline) == S, f"deadline length {len(params.deadline)} != {S}"
    assert len(params.theta) == S, f"theta rows {len(params.theta)} != {S}"
    assert len(params.a) == S, f"a rows {len(params.a)} != {S}"
    assert len(params.d) == params.N, f"d length {len(params.d)} != {params.N}"
    assert len(params.Y) == params.N, f"Y dim0 {len(params.Y)} != {params.N}"
    assert len(params.Omega) == params.N, f"Omega dim0 {len(params.Omega)} != {params.N}"
    assert len(params.wGamma) == params.Gamma, f"wGamma length {len(params.wGamma)} != {params.Gamma}"
    assert len(params.wBeta) == 3, f"wBeta length {len(params.wBeta)} != 3"

    # Check each train has exactly one (engine, category) pair
    for n in range(params.N):
        total = sum(
            params.Omega[n][b][g]
            for b in range(3)
            for g in range(params.Gamma)
        )
        assert total == 1, f"Train {n}: Omega sums to {total}, expected 1"

    # Check no negative delays
    for n, delay in enumerate(params.d):
        assert delay >= 0, f"Train {n}: negative delay {delay}"

    logger.info(f"Parameter validation passed: {S} sections, {T} time steps, {params.N} trains")
