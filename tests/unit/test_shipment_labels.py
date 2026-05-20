from services.shipment_labels import build_display_label, verdict_label_for_cron


def test_build_display_label_with_commodity():
    label = build_display_label(
        "PRM-TEST-001",
        "Mumbai",
        "Rotterdam",
        commodity="Cotton Fabric",
        created_at="2025-05-20T10:00:00Z",
    )
    assert "Mumbai" in label
    assert "Rotterdam" in label
    assert "Cotton Fabric" in label
    assert "PRM-TEST-001" not in label.split("|")[0]


def test_demo_label_from_config():
    import pramanik_config as pcfg

    demos = pcfg.get_demo_shipments()
    labels = pcfg.get_demo_labels()
    if demos and labels:
        assert demos[0] in labels
        assert "→" in labels[demos[0]]


def test_verdict_label_for_cron():
    assert verdict_label_for_cron("SETTLE") == "Payment Released"
