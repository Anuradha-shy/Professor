from routers.ai import _normalise_omr_answers, _parse_omr_key, _score_omr


def test_omr_parser_normalizes_and_rejects_out_of_range_entries():
    key = _parse_omr_key("1:A, 02:c\n101:d, 4:x, invalid:b")
    answers = _normalise_omr_answers({"1": " A ", "2": "b", "101": "c", "3": "?"})

    assert key == {"1": "a", "2": "c"}
    assert answers == {"1": "a", "2": "b"}


def test_omr_scoring_uses_two_marks_and_one_third_negative_marking():
    result = _score_omr(
        {"1": "a", "2": "b", "3": "", "4": "d"},
        {"1": "a", "2": "c", "3": "b", "4": "d"},
    )

    assert result == {
        "evaluated": True,
        "correct": 2,
        "wrong": 1,
        "blank": 97,
        "score": 3.33,
        "max_score": 8,
        "accuracy": 66.7,
    }


def test_omr_without_key_remains_unscored_until_review():
    result = _score_omr({"1": "a"}, {})

    assert result["evaluated"] is False
    assert result["correct"] == 0
    assert result["wrong"] == 0
    assert result["score"] == 0
    assert result["max_score"] == 0
