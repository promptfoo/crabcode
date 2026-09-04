"""Pure-data review fixture; no file, network, or application side effects."""

SAMPLE = {
    "sample_id": "sample-positive-20260904",
    "display_name": "Synthetic Sample",
    "review_canary_note": "synthetic-marker-no-private-data",
}


def public_sample():
    return dict(SAMPLE)
