"""Server-side settlement certificate PDF (ReportLab + optional Gemini summary)."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from io import BytesIO
from typing import Any

logger = logging.getLogger(__name__)


def build_shipment_pdf(
    shipment_id: str,
    chain_state: dict[str, Any],
    meta: dict[str, Any],
    *,
    app_id: int | None,
    gemini_api_key: str | None,
    lora_app_url: str,
) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    sid = shipment_id
    verdict_raw = chain_state.get("verdict") or chain_state.get("verdict_json") or ""
    verdict_data: dict[str, Any] = {}
    if verdict_raw:
        try:
            verdict_data = json.loads(verdict_raw) if isinstance(verdict_raw, str) else dict(verdict_raw)
        except Exception:
            verdict_data = {}

    ai_summary = None
    if gemini_api_key:
        try:
            import google.generativeai as genai

            genai.configure(api_key=gemini_api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            prompt = f"""Write a 3-paragraph professional settlement report summary for this supply chain corridor:

Shipment ID: {sid}
Route: {meta.get('origin', 'N/A')} → {meta.get('destination', 'N/A')}
Status: {chain_state.get('status', 'N/A')}
Verdict: {verdict_data.get('verdict', 'N/A')}
Confidence: {verdict_data.get('confidence', 'N/A')}
Reasoning: {verdict_data.get('reasoning', verdict_data.get('narrative', 'N/A'))}

Formal legal tone. Plain text only, three short paragraphs."""
            ai_summary = model.generate_content(prompt).text.strip()
        except Exception as e:
            logger.warning("Gemini PDF summary skipped: %s", e)

    funds_micro = int(chain_state.get("funds_microalgo") or 0)
    funds_algo = funds_micro / 1_000_000.0

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title",
        parent=styles["Heading1"],
        fontSize=18,
        spaceAfter=6,
        textColor=colors.HexColor("#0F1115"),
    )
    subtitle_style = ParagraphStyle(
        "Subtitle",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#6b6560"),
        spaceAfter=12,
    )
    section_style = ParagraphStyle(
        "Section",
        parent=styles["Heading2"],
        fontSize=12,
        spaceBefore=14,
        spaceAfter=6,
        textColor=colors.HexColor("#c17435"),
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=10,
        leading=16,
        textColor=colors.HexColor("#1a1a1a"),
    )
    mono_style = ParagraphStyle(
        "Mono",
        parent=styles["Normal"],
        fontSize=8,
        fontName="Courier",
        leading=12,
        textColor=colors.HexColor("#4A5568"),
    )

    verdict_color = {
        "SETTLE": colors.HexColor("#2a9d8f"),
        "APPROVED": colors.HexColor("#2a9d8f"),
        "HOLD": colors.HexColor("#c17435"),
        "DISPUTE": colors.HexColor("#c45c4a"),
    }.get(str(verdict_data.get("verdict", "")).upper(), colors.HexColor("#6b6560"))

    story: list[Any] = []
    story.append(Paragraph("PRAMANIK", title_style))
    story.append(Paragraph("Supply Chain Settlement Certificate", subtitle_style))
    story.append(
        Paragraph(
            f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
            subtitle_style,
        )
    )
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e8e0d5")))
    story.append(Spacer(1, 12))

    story.append(Paragraph("SHIPMENT DETAILS", section_style))
    supplier = str(chain_state.get("supplier_address") or chain_state.get("supplier") or "N/A")
    details_data = [
        ["Field", "Value"],
        ["Shipment ID", sid],
        ["Origin", str(meta.get("origin", "N/A"))],
        ["Destination", str(meta.get("destination", "N/A"))],
        ["Route", str(chain_state.get("route") or meta.get("route") or "N/A")],
        ["Supplier", f"{supplier[:20]}…" if len(supplier) > 22 else supplier],
        ["Status", str(chain_state.get("status", "N/A"))],
        ["Escrow", f"{funds_algo:.6f} ALGO"],
    ]
    tbl = Table(details_data, colWidths=[4 * cm, 13 * cm])
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a1a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#faf8f4")]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e8e0d5")),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(tbl)
    story.append(Spacer(1, 12))

    if verdict_data:
        story.append(Paragraph("AI JURY VERDICT", section_style))
        vlabel = str(verdict_data.get("verdict", "PENDING"))
        story.append(
            Paragraph(
                vlabel,
                ParagraphStyle(
                    "Verdict",
                    parent=styles["Normal"],
                    fontSize=18,
                    fontName="Helvetica-Bold",
                    textColor=verdict_color,
                    spaceAfter=8,
                ),
            )
        )
        story.append(
            Paragraph(
                f"Confidence: {verdict_data.get('confidence', 'N/A')}%",
                body_style,
            )
        )
        reasoning = str(verdict_data.get("reasoning") or verdict_data.get("narrative") or "")
        if reasoning:
            story.append(Paragraph(reasoning[:1200], body_style))
        story.append(Spacer(1, 12))

    if ai_summary:
        story.append(Paragraph("GEMINI ANALYSIS SUMMARY", section_style))
        for para in ai_summary.split("\n\n"):
            if para.strip():
                story.append(Paragraph(para.strip(), body_style))
        story.append(Spacer(1, 12))

    story.append(Paragraph("ON-CHAIN VERIFICATION", section_style))
    story.append(Paragraph(f"Algorand Testnet · App ID {app_id or 'N/A'}", body_style))
    story.append(Spacer(1, 6))
    story.append(Paragraph(str(lora_app_url), mono_style))
    story.append(Spacer(1, 12))
    story.append(
        Paragraph(
            "This document is generated by Pramanik. Verdict data is anchored on Algorand. Not legal advice.",
            ParagraphStyle("Footer", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#9a9288")),
        )
    )

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
