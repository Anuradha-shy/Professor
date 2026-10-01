from datetime import date

from routers.mock_tests import _parse_key, _schedule, _score_answers, _times


def test_schedule_has_46_unique_code_gated_mocks():
    schedule = _schedule()
    assert len(schedule) == 46
    assert len({item["test_code"] for item in schedule}) == 46
    assert {item["test_code"] for item in schedule} >= {"T01", "D01", "T45"}
    assert schedule[0]["date"] == "2026-10-10"
    assert schedule[-1]["date"] == "2027-05-07"


def test_mock_window_is_0928_to_1130_ist():
    row = next(item for item in _schedule() if item["test_code"] == "T01")
    access, starts, ends = _times(row)
    assert access.isoformat() == "2026-10-10T09:28:00+05:30"
    assert starts.isoformat() == "2026-10-10T09:30:00+05:30"
    assert ends.isoformat() == "2026-10-10T11:30:00+05:30"
    assert starts.date() == date(2026, 10, 10)


def test_answer_key_parser_and_prelims_negative_marking():
    key = _parse_key("1:A, 2:B; 3:C\n4:D")
    assert key == {"1": "a", "2": "b", "3": "c", "4": "d"}
    result = _score_answers(
        {"1": "a", "2": "b", "3": "c", "4": "a"},
        key,
    )
    assert result["correct"] == 3
    assert result["wrong"] == 1
    assert result["blank"] == 96
    assert result["score"] == 5.33
    assert result["accuracy"] == 75.0
    assert len(result["question_results"]) == 100
