import { useState, useCallback } from 'react';
import { ICommand } from '../lib/commands';

export const useHistory = () => {
  const [undoStack, setUndoStack] = useState<ICommand[]>([]);
  const [redoStack, setRedoStack] = useState<ICommand[]>([]);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  const execute = useCallback(async (command: ICommand) => {
    await command.execute();
    setUndoStack((prev) => {
      const newStack = [...prev, command];
      return newStack;
    });
    setRedoStack([]);
  }, []);

  const undo = useCallback(async () => {
    if (!canUndo) {
      return;
    }

    const command = undoStack[undoStack.length - 1];
    await command.unexecute();

    setUndoStack((prev) => {
      const newStack = prev.slice(0, prev.length - 1);
      return newStack;
    });
    setRedoStack((prev) => [...prev, command]);
  }, [undoStack, canUndo]);

  const redo = useCallback(async () => {
    if (!canRedo) return;

    const command = redoStack[redoStack.length - 1];
    await command.execute();

    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setUndoStack((prev) => [...prev, command]);
  }, [redoStack, canRedo]);

  const discardAffecting = useCallback((ids: number[]) => {
    const idSet = new Set(ids);
    const survives = (command: ICommand) => {
      const affected = command.getAffectedIds?.();
      return affected !== undefined && !affected.some((id) => idSet.has(id));
    };
    setUndoStack((prev) => prev.filter(survives));
    setRedoStack((prev) => prev.filter(survives));
  }, []);

  return { execute, undo, redo, discardAffecting, canUndo, canRedo };
};
