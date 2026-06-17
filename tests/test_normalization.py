from dealbuddy.normalization import infer_product_identity


def test_infers_conservative_identity_from_product_title() -> None:
    identity = infer_product_identity("TCL 电视 65Q10K 65英寸 Mini LED 144Hz 黑色 单机")

    assert identity.brand == "TCL"
    assert identity.model == "65Q10K"
    assert identity.specs == {
        "screen_size": "65英寸",
        "panel_type": "Mini LED",
        "refresh_rate": "144Hz",
        "color": "黑色",
        "bundle": "单机",
    }


def test_does_not_invent_unknown_model_or_bundle() -> None:
    identity = infer_product_identity("家用无线吸尘器 大吸力 轻量")

    assert identity.brand is None
    assert identity.model is None
    assert "bundle" not in identity.specs
