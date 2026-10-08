import copy

import pytest

from state_patch import PatchError, apply_ops


def _state():
    return {
        "meta": {"version": 1},
        "flags": {
            "active": [{"name": "A", "note": "x"}, {"name": "B", "note": "y"}],
            "resolved": [],
        },
        "baselines": {"mercado": {"avg": 100}},
    }


def test_set_creates_intermediate_keys():
    new, log = apply_ops(_state(), [{"op": "set", "path": "meta.last_run", "value": "2026-09"}])
    assert new["meta"] == {"version": 1, "last_run": "2026-09"}
    assert log == ["set meta.last_run"]

    new, _ = apply_ops(_state(), [{"op": "set", "path": "x.y.z", "value": 1}])
    assert new["x"] == {"y": {"z": 1}}


def test_set_list_index():
    new, _ = apply_ops(_state(), [{"op": "set", "path": "flags.active.0.note", "value": "z"}])
    assert new["flags"]["active"][0]["note"] == "z"


def test_input_is_not_mutated():
    original = _state()
    snapshot = copy.deepcopy(original)
    apply_ops(original, [{"op": "set", "path": "meta.version", "value": 2}])
    assert original == snapshot


def test_append_creates_list():
    new, _ = apply_ops(_state(), [{"op": "append", "path": "learned.facts", "value": "f1"}])
    assert new["learned"]["facts"] == ["f1"]
    new, _ = apply_ops(new, [{"op": "append", "path": "learned.facts", "value": "f2"}])
    assert new["learned"]["facts"] == ["f1", "f2"]


def test_append_rejects_non_list():
    with pytest.raises(PatchError, match="not a list"):
        apply_ops(_state(), [{"op": "append", "path": "meta.version", "value": 1}])


def test_remove_by_match():
    new, log = apply_ops(_state(), [{"op": "remove", "path": "flags.active", "match": {"name": "A"}}])
    assert [i["name"] for i in new["flags"]["active"]] == ["B"]
    assert log == ["remove flags.active (-1)"]


def test_remove_key_and_index():
    new, _ = apply_ops(_state(), [{"op": "remove", "path": "baselines.mercado"}])
    assert new["baselines"] == {}
    new, _ = apply_ops(_state(), [{"op": "remove", "path": "flags.active.0"}])
    assert [i["name"] for i in new["flags"]["active"]] == ["B"]


def test_remove_without_match_hits_nothing_raises():
    with pytest.raises(PatchError, match="no item"):
        apply_ops(_state(), [{"op": "remove", "path": "flags.active", "match": {"name": "ZZ"}}])
    with pytest.raises(PatchError, match="missing key"):
        apply_ops(_state(), [{"op": "remove", "path": "baselines.nope"}])


def test_update_merges_shallowly():
    new, log = apply_ops(
        _state(),
        [{"op": "update", "path": "flags.active", "match": {"name": "B"}, "value": {"note": "new", "extra": 1}}],
    )
    assert new["flags"]["active"][1] == {"name": "B", "note": "new", "extra": 1}
    assert log == ["update flags.active (~1)"]


def test_update_requires_match_and_dict_value():
    with pytest.raises(PatchError, match="match"):
        apply_ops(_state(), [{"op": "update", "path": "flags.active", "value": {"a": 1}}])
    with pytest.raises(PatchError, match="object"):
        apply_ops(_state(), [{"op": "update", "path": "flags.active", "match": {"name": "A"}, "value": 1}])
    with pytest.raises(PatchError, match="no item"):
        apply_ops(_state(), [{"op": "update", "path": "flags.active", "match": {"name": "ZZ"}, "value": {}}])


def test_move_between_lists_with_merge():
    new, log = apply_ops(
        _state(),
        [
            {
                "op": "move",
                "path": "flags.active",
                "match": {"name": "A"},
                "to": "flags.resolved",
                "value": {"resolution": "done"},
            }
        ],
    )
    assert [i["name"] for i in new["flags"]["active"]] == ["B"]
    assert new["flags"]["resolved"] == [{"name": "A", "note": "x", "resolution": "done"}]
    assert log == ["move flags.active -> flags.resolved (1)"]


def test_move_creates_destination_and_requires_to():
    new, _ = apply_ops(_state(), [{"op": "move", "path": "flags.active", "match": {"name": "A"}, "to": "flags.archive"}])
    assert new["flags"]["archive"] == [{"name": "A", "note": "x"}]
    with pytest.raises(PatchError, match="'to'"):
        apply_ops(_state(), [{"op": "move", "path": "flags.active", "match": {"name": "A"}}])


def test_failure_is_atomic_and_names_the_op():
    original = _state()
    ops = [
        {"op": "set", "path": "meta.version", "value": 2},
        {"op": "remove", "path": "flags.active", "match": {"name": "ZZ"}},
    ]
    with pytest.raises(PatchError, match=r"op #1 \(remove flags.active\)"):
        apply_ops(original, ops)
    assert original["meta"]["version"] == 1


def test_ops_apply_in_order():
    new, _ = apply_ops(
        _state(),
        [
            {"op": "set", "path": "meta.version", "value": 2},
            {"op": "set", "path": "meta.version", "value": 3},
        ],
    )
    assert new["meta"]["version"] == 3


@pytest.mark.parametrize(
    "ops",
    [
        [],
        "x",
        [{"op": "nope", "path": "a"}],
        [{"op": "set", "value": 1}],
        [{"op": "set", "path": "a"}],
        ["not a dict"],
        [{"op": "set", "path": "flags.active.9", "value": 1}],
    ],
)
def test_invalid_ops_raise(ops):
    with pytest.raises(PatchError):
        apply_ops(_state(), ops)


def test_state_must_be_object():
    with pytest.raises(PatchError, match="state"):
        apply_ops([], [{"op": "set", "path": "a", "value": 1}])
