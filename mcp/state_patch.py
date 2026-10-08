"""Pure helpers for patch_analysis_state: apply a list of ops to a JSON document.

Ops (each a dict):
  set     {"op":"set",    "path":"a.b", "value": any}
  append  {"op":"append", "path":"a.list", "value": any}          (creates the list)
  remove  {"op":"remove", "path":"a.list", "match":{k:v,...}}     (drops matching items)
          {"op":"remove", "path":"a.key"}                         (drops a dict key / list index)
  update  {"op":"update", "path":"a.list", "match":{...}, "value":{...}}  (shallow-merge into matches)
  move    {"op":"move",   "path":"a.list", "match":{...}, "to":"b.list", "value":{...}?}
          (moves matching items to another list, optionally shallow-merging `value` into them)

Paths are dot-separated; a numeric segment indexes a list. Ops that match nothing
raise, so a typo never turns into a silent no-op.
"""
import copy
from typing import Any

_OPS = {"set", "append", "remove", "update", "move"}


class PatchError(ValueError):
    pass


def _segments(path: Any) -> list:
    if not isinstance(path, str) or not path:
        raise PatchError("path must be a non-empty dotted string")
    return path.split(".")


def _step(container: Any, seg: str) -> Any:
    if isinstance(container, list):
        try:
            return container[int(seg)]
        except (ValueError, IndexError):
            raise PatchError(f"bad list index '{seg}'")
    if isinstance(container, dict):
        if seg not in container:
            raise PatchError(f"missing key '{seg}'")
        return container[seg]
    raise PatchError(f"cannot descend into '{seg}' (not an object or list)")


def _parent_and_key(doc: Any, segs: list, create: bool) -> tuple:
    cur = doc
    for seg in segs[:-1]:
        if create and isinstance(cur, dict) and seg not in cur:
            cur[seg] = {}
        cur = _step(cur, seg)
    return cur, segs[-1]


def _read(doc: Any, path: str) -> Any:
    cur = doc
    for seg in _segments(path):
        cur = _step(cur, seg)
    return cur


def _list_at(doc: Any, path: str, create: bool) -> list:
    segs = _segments(path)
    parent, key = _parent_and_key(doc, segs, create)
    if create and isinstance(parent, dict) and key not in parent:
        parent[key] = []
    target = _step(parent, key)
    if not isinstance(target, list):
        raise PatchError(f"'{path}' is not a list")
    return target


def _matches(item: Any, match: dict) -> bool:
    return isinstance(item, dict) and all(k in item and item[k] == v for k, v in match.items())


def _require_match(op: dict) -> dict:
    match = op.get("match")
    if not isinstance(match, dict) or not match:
        raise PatchError("'match' (non-empty object) is required")
    return match


def _apply_one(doc: Any, op: dict) -> str:
    kind = op.get("op")
    if kind not in _OPS:
        raise PatchError(f"unknown op '{kind}' (expected one of {sorted(_OPS)})")
    path = op.get("path")
    segs = _segments(path)

    if kind == "set":
        if "value" not in op:
            raise PatchError("'value' is required")
        parent, key = _parent_and_key(doc, segs, create=True)
        if isinstance(parent, list):
            try:
                parent[int(key)] = op["value"]
            except (ValueError, IndexError):
                raise PatchError(f"bad list index '{key}'")
        elif isinstance(parent, dict):
            parent[key] = op["value"]
        else:
            raise PatchError(f"cannot set '{key}' on a non-container")
        return f"set {path}"

    if kind == "append":
        if "value" not in op:
            raise PatchError("'value' is required")
        _list_at(doc, path, create=True).append(op["value"])
        return f"append {path}"

    if kind == "remove":
        if "match" in op:
            target = _list_at(doc, path, create=False)
            match = _require_match(op)
            kept = [i for i in target if not _matches(i, match)]
            removed = len(target) - len(kept)
            if not removed:
                raise PatchError(f"no item in '{path}' matches {match}")
            target[:] = kept
            return f"remove {path} (-{removed})"
        parent, key = _parent_and_key(doc, segs, create=False)
        if isinstance(parent, dict):
            if key not in parent:
                raise PatchError(f"missing key '{key}'")
            del parent[key]
        elif isinstance(parent, list):
            try:
                del parent[int(key)]
            except (ValueError, IndexError):
                raise PatchError(f"bad list index '{key}'")
        else:
            raise PatchError(f"cannot remove '{key}' from a non-container")
        return f"remove {path}"

    if kind == "update":
        target = _list_at(doc, path, create=False)
        match = _require_match(op)
        value = op.get("value")
        if not isinstance(value, dict):
            raise PatchError("'value' must be an object to merge")
        hits = [i for i in target if _matches(i, match)]
        if not hits:
            raise PatchError(f"no item in '{path}' matches {match}")
        for item in hits:
            item.update(copy.deepcopy(value))
        return f"update {path} (~{len(hits)})"

    # move
    target = _list_at(doc, path, create=False)
    match = _require_match(op)
    dest_path = op.get("to")
    if not isinstance(dest_path, str) or not dest_path:
        raise PatchError("'to' is required")
    extra = op.get("value")
    if extra is not None and not isinstance(extra, dict):
        raise PatchError("'value' must be an object to merge")
    moving = [i for i in target if _matches(i, match)]
    if not moving:
        raise PatchError(f"no item in '{path}' matches {match}")
    dest = _list_at(doc, dest_path, create=True)
    target[:] = [i for i in target if not _matches(i, match)]
    for item in moving:
        if extra:
            item.update(copy.deepcopy(extra))
        dest.append(item)
    return f"move {path} -> {dest_path} ({len(moving)})"


def apply_ops(state: Any, ops: list) -> tuple:
    """Return (new_state, log). The input is never mutated; any failing op aborts the whole patch."""
    if not isinstance(state, dict):
        raise PatchError("state must be an object")
    if not isinstance(ops, list) or not ops:
        raise PatchError("ops must be a non-empty list")
    doc = copy.deepcopy(state)
    log = []
    for i, op in enumerate(ops):
        if not isinstance(op, dict):
            raise PatchError(f"op #{i}: must be an object")
        try:
            log.append(_apply_one(doc, copy.deepcopy(op)))
        except PatchError as e:
            raise PatchError(f"op #{i} ({op.get('op')} {op.get('path')}): {e}") from None
    return doc, log
