import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHistory } from '../../client/src/hooks/useHistory';
import { ICommand } from '../../client/src/lib/commands';

// Mock command for testing
const createMockCommand = (): ICommand => ({
  execute: vi.fn(() => Promise.resolve()),
  unexecute: vi.fn(() => Promise.resolve()),
});

describe('useHistory', () => {
  it('should initialize with empty stacks and cannot undo/redo', () => {
    const { result } = renderHook(() => useHistory());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('should execute a command and add it to the undo stack', async () => {
    const { result } = renderHook(() => useHistory());
    const command = createMockCommand();

    await act(async () => {
      await result.current.execute(command);
    });

    expect(command.execute).toHaveBeenCalledTimes(1);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('should clear the redo stack when a new command is executed', async () => {
    const { result } = renderHook(() => useHistory());
    const command1 = createMockCommand();
    const command2 = createMockCommand();

    await act(async () => {
      await result.current.execute(command1);
      await result.current.undo();
      await result.current.execute(command2);
    });

    expect(result.current.canRedo).toBe(false);
  });

  it('should undo a command', async () => {
    const { result } = renderHook(() => useHistory());
    const command = createMockCommand();

    await act(async () => {
      await result.current.execute(command);
    });

    await act(async () => {
      await result.current.undo();
    });

    expect(command.unexecute).toHaveBeenCalledTimes(1);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('should redo a command', async () => {
    const { result } = renderHook(() => useHistory());
    const command = createMockCommand();

    await act(async () => {
      await result.current.execute(command);
    });

    await act(async () => {
      await result.current.undo();
    });

    await act(async () => {
      await result.current.redo();
    });

    expect(command.execute).toHaveBeenCalledTimes(2);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  describe('discardAffecting', () => {
    const cmdFor = (ids?: number[]): ICommand => ({
      ...createMockCommand(),
      ...(ids ? { getAffectedIds: () => ids } : {}),
    });

    it('drops only commands touching the given ids and keeps the rest undoable', async () => {
      const { result } = renderHook(() => useHistory());
      const unrelated = cmdFor([1]);
      const affected = cmdFor([2]);

      await act(async () => {
        await result.current.execute(unrelated);
        await result.current.execute(affected);
      });
      act(() => {
        result.current.discardAffecting([2, 3]);
      });
      expect(result.current.canUndo).toBe(true);

      await act(async () => {
        await result.current.undo();
      });
      expect(unrelated.unexecute).toHaveBeenCalledTimes(1);
      expect(affected.unexecute).not.toHaveBeenCalled();
      expect(result.current.canUndo).toBe(false);
    });

    it('also filters the redo stack', async () => {
      const { result } = renderHook(() => useHistory());

      await act(async () => {
        await result.current.execute(cmdFor([5]));
      });
      await act(async () => {
        await result.current.undo();
      });
      expect(result.current.canRedo).toBe(true);

      act(() => {
        result.current.discardAffecting([5]);
      });
      expect(result.current.canRedo).toBe(false);
    });

    it('drops commands that do not declare their ids', async () => {
      const { result } = renderHook(() => useHistory());

      await act(async () => {
        await result.current.execute(cmdFor());
      });
      act(() => {
        result.current.discardAffecting([99]);
      });
      expect(result.current.canUndo).toBe(false);
    });
  });
});
